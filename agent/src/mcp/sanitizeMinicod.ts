// Minicod MCP 结果清洗(2026-07 审计 P1-14 / spam 打崩轮):所有 mcp__minicod__* 成功结果
// 先过此清洗再回喂模型/前端 —— 这是 76 个 minicod 工具的唯一咽喉(minicodClient.callTool 出口)。
//
//   · 字段上限:检索列表逐篇 abstract 2000 字符、单篇详情 8000;title/tldr/bibtex 各有 cap;
//     总量 50KB(与 Bash stdout 上限同量级)。截断带显式标注,模型不会把截断当完整。
//   · spam 剔除:超长标题/控制符/双向控制字符/非文字占比超标的条目整条剔除(宁漏勿错杀)。
//   · 低相关标注:英文 query 与标题+摘要零词重叠的条目 id 记入 _sanitizer.low_relevance_ids,
//     配合 prompt 相关性条款(引用前核对,无关条目剔除不硬凑)。
//   · 中文覆盖披露(直怼虚构 CNKI 检索统计):query 含 CJK 即注入 coverage_note —— 与工具结果
//     同帧的机械事实,模型在最想编造的那一刻读到的就是权威否认,比纯 prompt 可靠。
//
// 形状识别失败/非 JSON → 原样返回(最坏退化为现状,绝不炸调用)。runTools 的 capToolResult
// 是本层之后的通用兜底(字符级)。

import { TOTAL_MAX } from "../turn/resultCap.ts";

const SEARCH_ABSTRACT_CAP = 2000; // items[] 里的每篇
const SINGLE_ABSTRACT_CAP = 8000; // get_paper / get_paper_by_doi 单篇详情
// text = search_snippets 的片段正文字段(F5:此前不在 cap 清单,无上限)。
const FIELD_CAPS: Record<string, number> = { bibtex: 2000, tldr: 1000, title: 400, text: 2000 };
// 单一真源:本层总量上限必须 ≤ 下游 capToolResult 的合计上限,否则清洗后的合法 JSON 会被通用
// 兜底钝切成非法 JSON → 前端论文卡消失(审计 [3]/[5])。取 min 防运维把 TOTAL_MAX 调到 50K 以下时漂移。
const TOTAL_CAP = Math.min(50_000, TOTAL_MAX);
const CTRL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E]/g;
// JATS/HTML 标签清洗。属性区必须是 name=value 形态,不再用 `(\s[^<>]*)?` 吞任意散文 —— 否则
// 无空格不等式 `n<m … r>` 会把 `<m the ratio r>` 整段当标签删掉、吃掉真实正文(审计 [16])。
// 仍能剥裸标签(<italic> </i> <br/>)与带引号属性标签(<xref ref-type="bibr" rid="B1">)。
const TAG_RE =
  /<\/?[a-zA-Z][a-zA-Z0-9:_-]*(\s+[a-zA-Z][a-zA-Z0-9:_.-]*\s*=\s*("[^"]*"|'[^']*'|[^\s"'<>]+))*\s*\/?>/g;
const CJK_RE = /[\u4e00-\u9fff]/;

// ⚠️ 这段文本会被模型**原样转述给用户**,因此只能出现对外品牌名(Graph / Discovery / Medicine),
// 绝不能写上游真实数据源名(商务硬约束,2026-07-24 拍板;W6 曾短暂真名化后回退)。
export const COVERAGE_NOTE =
  "平台检索源(Graph / Discovery / Medicine)均为国际英文学术库,不含知网 CNKI / 万方 / 维普等中文数据库," +
  "中文文献覆盖有限。回复中必须向用户转述此限制并建议其自行在知网/万方补充检索;严禁声称已检索任何中文数据库、" +
  "严禁给出任何“CNKI 检索统计”。";

type PaperLike = Record<string, unknown>;

function stripText(s: string, cap: number): { text: string; truncated: boolean } {
  let t = s.replace(CTRL_RE, "").replace(TAG_RE, " ");
  if (t.length > cap) {
    return { text: t.slice(0, cap) + "…[truncated,需完整内容请用 get_paper 单篇获取]", truncated: true };
  }
  return { text: t, truncated: false };
}

function isSpamTitle(title: unknown): boolean {
  if (typeof title !== "string" || !title.trim()) return false; // 空标题交上游,不在此裁决
  if (title.length > 400) return true;
  let ctrl = 0;
  for (const ch of title) {
    const c = ch.codePointAt(0)!;
    if (c === 0xfffd || (c >= 0x200b && c <= 0x200f) || (c >= 0x202a && c <= 0x202e) || c < 32) ctrl++;
  }
  if (ctrl > 5) return true;
  if (title.length > 40) {
    let other = 0,
      total = 0;
    for (const ch of title) {
      const c = ch.codePointAt(0)!;
      total++;
      // 用 Unicode 字母/数字类,而非硬编码 ASCII+Han 区间 —— 否则谚文/西里尔/希腊/阿拉伯/假名等
      // 合法长标题会被当垃圾整条剔除(审计 [15]),与后端 unicode.IsLetter/IsDigit 的孪生判据背离。
      const isWord = /[\p{L}\p{N}]/u.test(ch) || c === 0x20 || c === 0x2d || c === 0x3a;
      if (!isWord) other++;
    }
    if (other / total > 0.5) return true;
  }
  return false;
}

// 逐篇字段清洗(F2/F5 抽出公共函数,对象形 items[] 与裸数组形 batch 结果共用):
// abstract 用传入 cap,其余走 FIELD_CAPS(含 snippet 的 text)。返回本篇是否有字段被改/被截断。
function cleanPaperFields(p: PaperLike, abstractCap: number): { cleaned: boolean; truncated: boolean } {
  let cleaned = false,
    truncated = false;
  for (const [field, cap] of [
    ["abstract", abstractCap] as const,
    ["title", FIELD_CAPS.title] as const,
    ["tldr", FIELD_CAPS.tldr] as const,
    ["bibtex", FIELD_CAPS.bibtex] as const,
    ["text", FIELD_CAPS.text] as const,
  ]) {
    const v = p[field];
    if (typeof v === "string" && v) {
      const r = stripText(v, cap);
      if (r.text !== v) {
        p[field] = r.text;
        cleaned = true;
        if (r.truncated) truncated = true;
      }
    }
  }
  return { cleaned, truncated };
}

// 裸数组是否是 paper/journal/author 列表(batch/compare 工具返回 REST 信封拆掉后的 data)。
function looksPaperArray(arr: unknown[]): boolean {
  return arr.some(
    (p) =>
      p != null &&
      typeof p === "object" &&
      (typeof (p as PaperLike).title === "string" ||
        typeof (p as PaperLike).abstract === "string" ||
        typeof (p as PaperLike).paperId === "string"),
  );
}

// 认得的列表容器键(minicod REST 形状);顶层单篇按「有 title 或 abstract」识别。
const LIST_KEYS = ["items", "recommended_papers", "data", "papers", "results"];

function paperLists(data: Record<string, unknown>): PaperLike[][] {
  const lists: PaperLike[][] = [];
  for (const k of LIST_KEYS) {
    const v = data[k];
    if (Array.isArray(v) && v.length > 0 && typeof v[0] === "object") lists.push(v as PaperLike[]);
  }
  return lists;
}

function significantTerms(query: string): string[] {
  const STOP = new Set(["the", "and", "for", "with", "from", "into", "over", "under", "about", "using", "based", "study", "analysis", "review"]);
  return query
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length >= 3 && !STOP.has(w));
}

function overlaps(p: PaperLike, terms: string[]): boolean {
  const hay = (String(p.title ?? "") + " " + String(p.abstract ?? "")).toLowerCase();
  return terms.some((t) => hay.includes(t));
}

export function sanitizeMinicodResult(
  _toolName: string,
  args: Record<string, unknown>,
  content: unknown,
): unknown {
  if (!Array.isArray(content)) return content;
  const first = content.find(
    (b) => (b as { type?: string; text?: string })?.type === "text" && typeof (b as { text?: string }).text === "string",
  ) as { type: string; text: string } | undefined;
  if (!first) return content;
  let data: unknown;
  try {
    data = JSON.parse(first.text);
  } catch {
    return content; // 非 JSON(如错误说明文本)原样返回
  }
  if (!data || typeof data !== "object") return content;

  // 裸数组分支(F2):get_papers_batch / compare_journals / get_authors_batch 等 batch/compare 工具,
  // MCP client 拆掉 REST 信封只留 data → 裸 Paper[]。旧代码 Array.isArray 直接 return content →
  // **整体绕过**清洗(逐篇 cap/spam/总量),叠加 capToolResult 20000 钝切成非法 JSON → 前端论文卡消失。
  // 这里对 paper-like 裸数组逐篇清洗 + spam 剔除 + 总量兜底,序列化仍保持裸数组形(前端解析兼容)。
  if (Array.isArray(data)) {
    const arr = data as PaperLike[];
    if (arr.length === 0 || typeof arr[0] !== "object" || !looksPaperArray(arr)) return content;
    const kept: PaperLike[] = [];
    let touched = false;
    for (const p of arr) {
      if (!p || typeof p !== "object") {
        kept.push(p);
        continue;
      }
      if (isSpamTitle(p.title)) {
        touched = true;
        continue;
      }
      if (cleanPaperFields(p, SEARCH_ABSTRACT_CAP).cleaned) touched = true;
      kept.push(p);
    }
    let text = JSON.stringify(kept);
    while (text.length > TOTAL_CAP && kept.length > 1) {
      kept.pop();
      touched = true;
      text = JSON.stringify(kept);
    }
    if (!touched) return content; // 零改动 → 原样返回
    return [{ type: "text", text }, ...content.filter((b) => b !== first)];
  }

  const root = data as Record<string, unknown>;

  const meta: Record<string, unknown> = {};
  let spamDropped = 0;
  let truncated = 0;
  let cleaned = 0; // 任何字段被改写(去标签/控制符/截断)都要重新序列化,否则修改会丢失

  const lists = paperLists(root);
  const isSingle = lists.length === 0 && (typeof root.title === "string" || typeof root.abstract === "string");
  const targets: { papers: PaperLike[]; cap: number; container?: PaperLike[] }[] = [];
  for (const list of lists) targets.push({ papers: list, cap: SEARCH_ABSTRACT_CAP, container: list });
  if (isSingle) targets.push({ papers: [root], cap: SINGLE_ABSTRACT_CAP });

  for (const t of targets) {
    const keep: PaperLike[] = [];
    for (const p of t.papers) {
      if (!p || typeof p !== "object") {
        keep.push(p);
        continue;
      }
      if (t.container && isSpamTitle(p.title)) {
        spamDropped++;
        continue; // 列表里的 spam 整条剔除;单篇详情不剔(用户点名要的)
      }
      const res = cleanPaperFields(p, t.cap);
      if (res.cleaned) cleaned++;
      if (res.truncated) truncated++;
      keep.push(p);
    }
    if (t.container) t.container.splice(0, t.container.length, ...keep);
  }

  if (spamDropped > 0) meta.spam_dropped = spamDropped;
  if (truncated > 0) meta.truncated_fields = truncated;
  if (cleaned > 0 && truncated === 0) meta.cleaned_fields = cleaned;

  // 低相关标注:仅英文 query(中文 query 对英文库必零重叠,豁免防误标)
  const query = String(args.query ?? "");
  if (query && !CJK_RE.test(query)) {
    const terms = significantTerms(query);
    if (terms.length >= 2) {
      const low: unknown[] = [];
      for (const list of paperLists(root)) {
        for (const p of list) {
          if (p && typeof p === "object" && typeof p.title === "string" && !overlaps(p, terms)) {
            low.push(p.paperId ?? p.id ?? p.doi ?? p.title);
          }
        }
      }
      if (low.length) meta.low_relevance_ids = low.slice(0, 20);
    }
  }
  // 中文覆盖披露(机械注入,与结果同帧)
  if (CJK_RE.test(query)) meta.coverage_note = COVERAGE_NOTE;

  // 无任何清洗动作且总量在限内 → 原样返回(零改动路径);否则挂 _sanitizer 后紧凑序列化
  // (原 pretty 2 空格,顺带省 ~30% token)。注意必须先挂标注再序列化。
  const baseLen = JSON.stringify(root).length;
  if (Object.keys(meta).length === 0 && baseLen <= TOTAL_CAP) return content;
  if (Object.keys(meta).length > 0) root._sanitizer = meta;
  let text = JSON.stringify(root);
  // 总量兜底:仍超 TOTAL_CAP 时从最长列表尾部逐条丢弃(丢弃必留 _sanitizer 标注,不静默)
  let droppedForSize = 0;
  while (text.length > TOTAL_CAP) {
    const lists2 = paperLists(root);
    const longest = lists2.sort((a, b) => b.length - a.length)[0];
    if (!longest || longest.length <= 1) break;
    longest.pop();
    droppedForSize++;
    const sanitizer = (root._sanitizer ?? {}) as Record<string, unknown>;
    sanitizer.dropped_for_size = droppedForSize;
    root._sanitizer = sanitizer;
    text = JSON.stringify(root);
  }
  return [{ type: "text", text }, ...content.filter((b) => b !== first)];
}
