// 证据账本 · 渲染层(2026-08 证据账本 P0 / 终稿 §五 P0-b)。**纯函数,零 I/O** —— fs 全在 ledger.ts。
//
// 五个消费面,共用同一套行渲染,故必须在一个文件里(终稿 §3.1 硬约束:一个展开器,不许各写一份):
//   · digest        —— 每轮注入用的一行摘要集(turnLoop 的 per-turn seam 消费)
//   · INDEX.md      —— 会话 cwd 里的完整清单(唯一跨内存驱逐/容器重启存活的介质)
//   · E<n>.md       —— 懒物化的单条详情(只对被 EvidenceGet 取过的记录写)
//   · EvidenceGet   —— 工具返回给模型的题录正文
//   · expandCitations —— 交付边界把 [[E7]] 展开成真题录(2026-08 P1;fs 胶水在 deliver.ts)
//
// ⚠️ 这里的文本是**事实陈述**,不是纪律劝导。终稿 §一已证明散文通道饱和(用户亲自打字要求
//    调工具都无效),再加一段"你必须引用账本"只会重蹈覆辙。渲染层只回答「账上有什么」,
//    「什么时候必须先有值」是编排层(阶段机 + tool_choice)的事。

import type { EvidenceRecord, QueryRecord } from "./ledger.ts";

export const DIGEST_MAX_CHARS = 6000;
export const DIGEST_MAX_ROWS = 60;

const TITLE_ROW_CAP = 110;
const AUTHORS_ROW_MAX = 2;

function cut(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

/** 作者短写:`Zhang Y 等`(≥3 人)/ `Zhang Y, Li M`(≤2 人)。 */
function authorsShort(a: string[] | undefined): string {
  if (!a || a.length === 0) return "";
  if (a.length > AUTHORS_ROW_MAX) return a[0] + " 等";
  return a.join(", ");
}

/**
 * 全文状态。**把「检索到」与「读过原文」机械分开** —— agent 那句被逼问出来的
 * 「我全部没看过原文」从一句忏悔变成可查询状态(终稿 §3.3-a read_marks)。
 */
function readState(r: EvidenceRecord): string {
  if (r.read_marks && r.read_marks.length > 0) return "已读全文";
  if (r.has_fulltext) return "有全文未读";
  return "仅题录";
}

/** origin → 中文标签。直接回答用户高频那句「是我文献库里的还是你检索的」。 */
export function originLabel(o: EvidenceRecord["origin"]): string {
  switch (o) {
    case "retrieval":
      return "检索";
    case "user_upload":
      return "用户上传";
    case "library_ref":
      return "文献集引用";
    case "user_text":
      return "用户提供";
    default:
      return String(o);
  }
}

/** digest / INDEX 的单行。目标 40-80 token。 */
export function renderRow(r: EvidenceRecord): string {
  const bits: string[] = [r.id];
  const who = [authorsShort(r.authors), r.year ? String(r.year) : ""].filter(Boolean).join(" ");
  if (who) bits.push(who);
  bits.push("《" + cut(r.title ?? "(无标题)", TITLE_ROW_CAP) + "》");
  if (r.venue) bits.push(cut(r.venue, 60));
  if (r.doi) bits.push("doi:" + r.doi);
  if (r.source) bits.push(r.source);
  if (r.origin !== "retrieval") bits.push(originLabel(r.origin));
  bits.push(readState(r));
  return bits.join(" · ");
}

function countByOrigin(records: EvidenceRecord[]): string {
  const by = new Map<string, number>();
  for (const r of records) by.set(r.origin, (by.get(r.origin) ?? 0) + 1);
  return [...by.entries()].map(([o, n]) => `${originLabel(o as EvidenceRecord["origin"])} ${n}`).join(" · ");
}

function queryText(q: QueryRecord): string {
  const a = (q.args ?? {}) as Record<string, unknown>;
  for (const k of ["query", "q", "keywords", "text", "title", "name"]) {
    const v = a[k];
    if (typeof v === "string" && v.trim()) return cut(v.trim(), 48);
  }
  return q.tool;
}

/** 检索流水行:`q7「WRKY drought」送达 16 / 上游 256509 · 新 3`。上游总数防「以为这方向只有 16 篇」。 */
export function renderQueryLine(q: QueryRecord): string {
  const up = typeof q.total_upstream === "number" ? ` / 上游 ${q.total_upstream}` : "";
  return `${q.q}「${queryText(q)}」送达 ${q.delivered}${up} · 新 ${q.new_ids.length}`;
}

/**
 * 每轮注入用的账本摘要。空账本返回 "" —— 调用方据此**什么都不注入**
 * (存量会话/闲聊轮不该多出一个空标题块)。
 * 超帽时按 first_seen 倒序保留最近的,并显式声明被截了多少、去哪看全的。
 */
export function renderDigest(
  records: EvidenceRecord[],
  queries: QueryRecord[],
  opts?: { maxRows?: number; maxChars?: number },
): string {
  if (records.length === 0) return "";
  const maxRows = opts?.maxRows ?? DIGEST_MAX_ROWS;
  const maxChars = opts?.maxChars ?? DIGEST_MAX_CHARS;

  // 取舍口径:**从最近的往回收**(超帽时丢最早的),输出仍按时间正序。
  // ⚠️ 别改成"正序填到满为止" —— 那会把最新入账的挤掉,而追问轮要的恰恰是刚检索到的那批。
  const kept = records.slice(-maxRows);

  const head: string[] = [];
  head.push("【证据账本 · 由引擎在工具返回时刻机械记录,非模型自述】");
  head.push(`题录 ${records.length} 条(${countByOrigin(records)})· 检索 ${queries.length} 次`);
  const recentQ = queries.slice(-3).map(renderQueryLine);
  if (recentQ.length > 0) head.push("最近检索:" + recentQ.join(" | "));
  head.push("按 id 取回完整题录(含摘要)= EvidenceGet;完整清单 = evidence/INDEX.md");
  // chunk 级接地(2026-08-01 Phase 0):账本里有可引原句时**必须在这里说出来** ——
  // 🔴 段落落库了但模型不知道它存在,等于没落库(本仓库咬过六次的"造好没接线")。
  //    而这一行正是"让正确的路更便宜"的落点:模型要写具体数值时,知道有原句可引,
  //    才不会走"凭印象重构一个"的老路。只在真有段落时出现,不给空承诺。
  const withPassages = kept.filter((r) => r.has_fulltext).map((r) => r.id);
  if (withPassages.length > 0) {
    head.push(
      `以下条目有工具原样返回的可引原文段落:${withPassages.slice(0, 12).join(" ")}` +
        (withPassages.length > 12 ? ` 等 ${withPassages.length} 条` : "") +
        `。要写具体数值(样本量/效应量/p 值/随访时长)前,先 EvidenceGet fields="passages" 取原句,不要凭印象重构。`,
    );
  }
  // 2026-08 P1 · 引用契约。**按会话有无账本分档**:renderDigest 在 records.length===0 时早已 return ""
  // (见函数首行),所以这段天然只对有账本的会话出现 —— 老会话历史全是自由文本引用,无差别注入
  // 会让模型看到自相矛盾的示例(终稿 §五 P1 风险项)。分档不是新增开关,是复用既有的空账本短路。
  head.push(CITATION_CONTRACT);

  const rows: string[] = [];
  let used = head.join("\n").length + 120; // 预留尾注说明的位置,免得说明本身把帽撑破
  for (let i = kept.length - 1; i >= 0; i--) {
    const line = renderRow(kept[i]!);
    if (used + line.length + 1 > maxChars) break;
    rows.unshift(line);
    used += line.length + 1;
  }
  const dropped = records.length - rows.length;
  const tail = dropped > 0 ? [`[账本共 ${records.length} 条,以上为最近入账的 ${rows.length} 条;其余见 evidence/INDEX.md]`] : [];
  return [...head, ...rows, ...tail].join("\n");
}

/** evidence/INDEX.md —— 完整清单(不截断)。会话 cwd 里,跨驱逐/重启存活。 */
export function renderIndexMd(records: EvidenceRecord[], queries: QueryRecord[]): string {
  const lines: string[] = [];
  lines.push("# 证据账本(引擎写入,只增不改)");
  lines.push("");
  lines.push(`题录 ${records.length} 条${records.length ? "(" + countByOrigin(records) + ")" : ""}· 检索 ${queries.length} 次`);
  lines.push("");
  lines.push("## 题录");
  lines.push("");
  for (const r of records) lines.push("- " + renderRow(r));
  if (queries.length > 0) {
    lines.push("");
    lines.push("## 检索流水");
    lines.push("");
    for (const q of queries) lines.push("- " + renderQueryLine(q));
  }
  lines.push("");
  return lines.join("\n");
}

/** 单条详情正文:E<n>.md 与 EvidenceGet(fields=full)共用。 */
export function renderRecordMd(r: EvidenceRecord): string {
  const lines: string[] = [];
  lines.push(`# ${r.id} ${r.title ?? "(无标题)"}`);
  lines.push("");
  if (r.authors && r.authors.length) lines.push(`- 作者: ${r.authors.join(", ")}`);
  if (r.year) lines.push(`- 年份: ${r.year}`);
  if (r.venue) lines.push(`- 期刊/来源: ${r.venue}`);
  if (r.doi) lines.push(`- DOI: ${r.doi}`);
  if (r.url) lines.push(`- 链接: ${r.url}`);
  if (r.source) lines.push(`- 数据源: ${r.source}`);
  lines.push(`- 入账方式: ${originLabel(r.origin)}(第 ${r.first_seen.turn} 轮 · ${r.first_seen.tool}${r.first_seen.q ? " · " + r.first_seen.q : ""})`);
  lines.push(`- 全文状态: ${readState(r)}`);
  if (r.read_marks && r.read_marks.length) {
    for (const m of r.read_marks) lines.push(`  - 第 ${m.turn} 轮 ${m.tool} 读取 ${m.chars} 字符`);
  }
  if (r.abstract) {
    lines.push("");
    lines.push("## 摘要");
    lines.push("");
    lines.push(r.abstract);
    if (r.abstract_chars && r.abstract_chars > r.abstract.length) {
      lines.push("");
      lines.push(`[摘要已截断:上游原文 ${r.abstract_chars} 字符,以上为前 ${r.abstract.length} 字符]`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

/** EvidenceGet 的返回正文。missing 显式列出 + 给有效区间(自愈指引,不是纠偏)。 */
export function renderRecordsForModel(
  found: EvidenceRecord[],
  missing: string[],
  ledgerTotal: number,
  fields: "meta" | "full",
): string {
  const parts: string[] = [];
  if (found.length > 0) {
    parts.push(fields === "full" ? found.map(renderRecordMd).join("\n---\n\n") : found.map(renderRow).join("\n"));
  }
  if (missing.length > 0) {
    const range = ledgerTotal > 0 ? `E1–E${ledgerTotal}` : "(账本为空)";
    parts.push(
      `[未入账: ${missing.join(", ")} —— 账本当前有效区间 ${range}。` +
        `未入账 = 本会话从未有任何工具返回过它,账本里没有它的题录。]`,
    );
  }
  if (parts.length === 0) return "账本为空:本会话还没有任何工具返回过文献题录。";
  return parts.join("\n\n");
}

// ── [[E<n>]] 引用句柄 · 唯一展开器(2026-08 证据账本 P1 / 终稿 §3.1 三段式)────────
//
// 机理(为什么是 E 编号而不是 DOI):`E17` 的分配权**独占于引擎** —— 模型没有任何工具能铸造它,
// 它也不像 DOI 那样是可被参数记忆合成的模式。于是「编一条假文献」在交付物层面变成:必须先编一个
// 编号,而编号在交付边界展不开 → 构建失败 → 用户拿不到含假引用的文件。这是**结构不可能**,
// 不是事后检查。三个交付边界(ExportDocument / BuildDeck / artifacts 发帧前)共用这一份实现。
//
// 🔴 展开文本会落进三种容器:Markdown 正文(可能在表格单元格里)、HTML 文本节点、以及
//    **编译后 JS bundle 里的字符串字面量**(BuildDeck:JSX 文本 `<p>见 [[E7]]</p>` 编译成
//    `jsx("p",{children:"见 [[E7]]"})`)。所以替换文本必须对这三者同时安全 —— 一个论文标题里的
//    引号或反斜杠就能让整份演示稿白屏。inlineSafe 因此是硬要求,不是洁癖。

/** 句柄形态:`[[E7]]`,容忍空格与大小写(`[[ e007 ]]`)。刻意要求 E 前缀 —— `[[7]]` 太松会吃掉 wiki 链接。 */
export const CITATION_RE = /\[\[\s*[Ee]\s*(\d{1,6})\s*\]\]/g;

/** 会破坏 Markdown 表格 / HTML 文本 / JS 字符串字面量的字符。题录里出现属罕见,直接剔除不影响可核验性。 */
const CITE_UNSAFE_CHARS = /["'`\\<>{}[\]|]/g;

function inlineSafe(s: string): string {
  return s.replace(/\s+/g, " ").replace(CITE_UNSAFE_CHARS, "").trim();
}

/**
 * 单条题录的**行内**形态(交付物里 `[[E7]]` 被替换成的东西)。
 * 刻意不含 E 编号:E 是平台内部句柄,交付给用户的文件里应当只剩可独立核验的书目事实。
 */
export function renderCitationInline(r: EvidenceRecord): string {
  const bits: string[] = [];
  const who = authorsShort(r.authors);
  if (who) bits.push(who);
  if (r.title) bits.push(cut(r.title, TITLE_ROW_CAP));
  if (r.venue) bits.push(cut(r.venue, 60));
  if (r.year) bits.push(String(r.year));
  if (r.doi) bits.push("doi:" + r.doi);
  const body = bits.map(inlineSafe).filter(Boolean).join(". ");
  return "(" + (body || r.id) + ")";
}

export interface CitationExpansion {
  /** 展开后的文本。**missing 非空且 onMissing="keep" 时原样返回原文** —— 半展开的文本不该被落盘。 */
  text: string;
  /** 文本里出现的句柄总数(含重复)。0 = 本文件与引用无关,调用方可完全跳过。 */
  hits: number;
  /** 命中账本的 id(去重,按出现序)。 */
  used: string[];
  /** 账本里不存在的 id(去重,按出现序)。**这个数组非空 = 模型试图编造一条引用**(终稿 W2 计数器)。 */
  missing: string[];
  /** text 是否与入参不同(false 时调用方不必回写文件)。 */
  changed: boolean;
}

/**
 * 把 `[[E7]]` 展开成真题录。**唯一实现**,三个交付边界共用(终稿 §3.1:谁先落地谁建,后来者只能消费)。
 *
 * onMissing:
 *   · "keep"(默认,构建型边界用)—— 有未入账编号就原样退回原文,由调用方**硬失败**;
 *   · "mark"(落盘型边界用)—— 未入账编号就地渲染成可见破引用标记。
 *     用在没有 tool_result 回路的边界(artifacts 发帧时该轮已结束):文件已经在 out/ 里、
 *     backend 是 on-list 直接扫 out/ 收割的,"不发帧"拦不住交付,只会让用户拿到一个无人解释的坏文件。
 *     标记是这个边界上**真正生效**的那个动作,不是兜底 —— 它不回喂模型、不改模型行为,只保证
 *     被伪造的句柄绝不会变成一条看起来像真的题录。
 */
export function expandCitations(
  text: string,
  ledger: EvidenceRecord[],
  opts?: { onMissing?: "keep" | "mark" },
): CitationExpansion {
  const onMissing = opts?.onMissing ?? "keep";
  const byId = new Map(ledger.map((r) => [r.id, r]));
  const used: string[] = [];
  const missing: string[] = [];
  let hits = 0;
  const out = text.replace(CITATION_RE, (m, n: string) => {
    hits++;
    const id = "E" + String(Number.parseInt(n, 10)); // E007 / e7 → E7
    const rec = byId.get(id);
    if (rec) {
      if (!used.includes(id)) used.push(id);
      return renderCitationInline(rec);
    }
    if (!missing.includes(id)) missing.push(id);
    return onMissing === "mark" ? `[未入账引用 ${id} —— 本会话证据账本中没有这条记录]` : m;
  });
  const final = missing.length > 0 && onMissing === "keep" ? text : out;
  return { text: final, hits, used, missing, changed: final !== text };
}

/**
 * resolve 失败时回给模型的 tool_result 正文。
 *
 * 🔴 硬失败**必须**配可执行的自救指引:缺失 id + 账本有效区间 + 下一步动作。终稿 §五 P1 风险项点名 ——
 *    只报"失败"会让模型一路撞 MAX_TOOL_ROUNDS=24,用户白等一整轮。这属仓内既有的「工具失败双轨制」
 *    (tool_result 给模型可执行指引 / userMessage 给用户中性话术),不是纠偏注入。
 */
export function citationFailureText(missing: string[], ledgerTotal: number, action: string): string {
  const range = ledgerTotal > 0 ? `E1–E${ledgerTotal}(共 ${ledgerTotal} 条)` : "账本为空,当前没有任何可引用的编号";
  return [
    `${action} 已中止,文件未生成:正文里的引用句柄有 ${missing.length} 个在本会话证据账本中不存在。`,
    `对不上的编号:${missing.join(", ")}`,
    `账本当前有效区间:${range}`,
    "E 编号只在检索工具真的返回题录时由平台分配 —— 账本里没有的编号,意味着这条引用在本会话没有任何来源。",
    "下一步:",
    "1) 调用 EvidenceGet(不带参数)列出账本里现有的全部编号与题录;",
    "2) 把对不上的句柄改成账本中真实存在的编号,或删掉该引用连同依赖它的论断;",
    "3) 确实需要新文献 → 先调检索工具,新题录会自动入账并获得新编号,再回来引用;",
    `4) 改完后重新调用一次 ${action.split("(")[0]}。`,
  ].join("\n");
}

/**
 * 注入给模型的引用格式契约。**事实陈述**(平台在交付边界会做什么),不是纪律劝导 ——
 * 终稿 §一已证明散文通道饱和(用户亲自打字要求调工具都无效),这里说的每一句都由代码兑现。
 * 只在 renderDigest(账本非空)里出现,见该函数内注释的分档理由。
 */
export const CITATION_CONTRACT =
  "引用格式:正文里引用账本条目写成 [[E7]] 这样的句柄。导出文档 / 生成演示稿 / 写入 out/ 交付文件时," +
  "平台会在交付边界把句柄机械展开成完整题录(作者·标题·期刊·年份·DOI);" +
  "写了账本里没有的编号,该次构建会失败、文件不生成 —— E 编号只由平台在检索工具返回题录时分配,没有任何工具能创建它。";

// ── tool_result 回写 ──────────────────────────────────────────────────────────

export interface EvidenceAnnotation {
  query_id?: string;
  new: number;
  dup: number;
  ledger_total: number;
}

/**
 * 把 evidence_id 逐条回写进 tool_result 的论文对象,并在根上挂 `_evidence` 汇总
 * (与 sanitizeMinicod 的 `_sanitizer` 同范式)。
 *
 * 为什么在这一刻回写:模型**读到结果的那一刻**就看见 id,不必等下一轮 digest ——
 * 这是把「引真的」做便宜的第一步(终稿 §3.3 成本表)。
 *
 * fail-closed:任何解析/序列化异常一律返回原 content。账本是增益,绝不能因为它让检索结果变坏。
 */
export function annotateToolResult(
  content: unknown,
  keyToId: Map<string, string>,
  keyOf: (raw: unknown) => string | null,
  ann: EvidenceAnnotation,
): unknown {
  if (keyToId.size === 0) return content;
  try {
    if (!Array.isArray(content)) return content;
    const first = content.find(
      (b) => (b as { type?: string; text?: unknown })?.type === "text" && typeof (b as { text?: unknown }).text === "string",
    ) as { type: string; text: string } | undefined;
    if (!first) return content;
    const data = JSON.parse(first.text);
    if (!data || typeof data !== "object") return content;

    let touched = 0;
    const stamp = (arr: unknown[]) => {
      for (const el of arr) {
        if (!el || typeof el !== "object") continue;
        const k = keyOf(el);
        if (!k) continue;
        const id = keyToId.get(k);
        if (!id) continue;
        (el as Record<string, unknown>).evidence_id = id;
        touched++;
      }
    };

    if (Array.isArray(data)) {
      stamp(data);
      if (touched === 0) return content;
      return [{ type: "text", text: JSON.stringify(data) }, ...content.filter((b) => b !== first)];
    }

    const root = data as Record<string, unknown>;
    for (const key of Object.keys(root)) {
      const v = root[key];
      if (Array.isArray(v)) stamp(v);
    }
    if (touched === 0) return content;
    root._evidence = { ...(ann.query_id ? { query_id: ann.query_id } : {}), new: ann.new, dup: ann.dup, ledger_total: ann.ledger_total };
    return [{ type: "text", text: JSON.stringify(root) }, ...content.filter((b) => b !== first)];
  } catch {
    return content;
  }
}
