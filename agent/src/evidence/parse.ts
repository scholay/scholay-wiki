// 证据账本 · minicod tool_result → 题录解析(2026-08 证据账本 P0 / 终稿 §五 P0-b)。
//
// 🔴 本文件是**跨包镜像**,不是新写的解析器。
//    源:frontend-user/src/shared/lib/minicod-papers.ts —— 它已在生产被两处消费
//    (smart-search 的 PaperListScroller、claw 的 ClawPaperList),覆盖
//    items/papers/results/data/recommended_papers/snippets + 裸数组 + content[0].text 内嵌 JSON,
//    是仓内**唯一经实战**的 minicod 结果解析器。移植而非重写,正是因为重写会丢掉那些实战形态。
//
//    为什么不能 import:两个包互不可见(agent 的 Docker 构建 context 只有 ./agent),
//    且 frontend 的输出类型 `Paper` 绑在它的 `@/shared/api/types` 上。故这里做**行为镜像**:
//    遍历/识别/字段映射逐条对齐,只把输出换成执行器侧的扁平 `ParsedPaper`。
//
//    ⚠️ 镜像必须有守卫,否则会重演本仓库「51 条护栏全绿掩盖三份镜像落后两代」的老伤:
//    parse.mirror.test.ts 会把**同一批 fixture** 同时喂给两侧,逐字段比对。它在完整仓库里
//    真的跑(bun test src),在只有 ./agent 的构建 context 里**吵闹地 skip**(不是静默通过)。
//
// 另一处镜像:SOURCE_BRAND(源码 → 对外品牌名)。真源同样在前端
//    (shared/lib/mask-tool-source.ts 的 SOURCE_BRAND / shared/lib/data-source-brand.ts),
//    前端自己就为分层原因持了两份。铁律见 [[data-source-alias-hard-rule]]:
//    **对外只能出现 Graph / Discovery / Medicine,绝不能落上游真名。**

import { createHash } from "node:crypto";

/** 执行器侧的扁平题录。字段映射规则与前端 normalizePaper 一一对应(见镜像测试)。 */
export interface ParsedPaper {
  /** 已按源补前缀的 id(olx:W… / pmd:… / stc 裸 id),与前端 normalizePaperId 同规则 */
  paperId: string;
  /** 上游源码(stc/olx/pmd)。⚠️ 只用于去重键与 brandOfSource 入参,**绝不进入模型可见文本** */
  sourceCode: "stc" | "olx" | "pmd";
  title: string;
  abstract?: string;
  year?: number;
  publicationDate?: string;
  venue?: string;
  url?: string;
  doi?: string;
  pmid?: string;
  authors?: string[];
  citationCount?: number;
  referenceCount?: number;
  isOpenAccess?: boolean;
}

// ── 遍历:从 tool_result.content 里挖出「论文候选对象」列表 ─────────────────────
// 镜像源:minicod-papers.ts extractPaperListCandidates(逐分支对齐,顺序不能动 ——
// 键的先后决定了 recommend_* 的 recommended_papers 与 search_* 的 items 谁先命中)。

/** 信封键。⚠️ 顺序与前端一致;新增/改序必须两侧同改(镜像测试会红)。 */
export const ENVELOPE_KEYS = ['papers', 'recommended_papers', 'results', 'items', 'data', 'snippets'] as const;

export function extractPaperListCandidates(content: unknown): unknown[] {
  if (Array.isArray(content)) {
    // MCP-style: [{ type: 'text', text: '...' }, ...]
    const textParts = content
      .map((c) => (typeof c === "object" && c && "text" in c ? (c as { text?: unknown }).text : null))
      .filter((t): t is string => typeof t === "string");
    if (textParts.length > 0) {
      const merged = textParts.join("\n").trim();
      const parsed = safeJsonParse(merged);
      if (parsed !== undefined) return extractPaperListCandidates(parsed);
    }
    if (content.every((c) => typeof c === "object" && c !== null && !("type" in c))) {
      return content;
    }
  }

  if (typeof content === "string") {
    const parsed = safeJsonParse(content);
    if (parsed !== undefined) return extractPaperListCandidates(parsed);
    return [];
  }

  if (typeof content === "object" && content !== null) {
    const obj = content as Record<string, unknown>;
    for (const key of ENVELOPE_KEYS) {
      const v = obj[key];
      if (Array.isArray(v)) return v;
      if (v && typeof v === "object") {
        const nested = extractPaperListCandidates(v);
        if (nested.length > 0) return nested;
      }
    }
  }

  return [];
}

export function safeJsonParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

/**
 * 把 tool_result.content 还原成一个 JS 值(MCP 的 [{type:'text',text:'<json>'}] 信封 / 裸 JSON 串 / 已是对象)。
 * 账本侧独有(前端不需要):用来读**信封级**字段 total —— 覆盖度自检的分母。
 */
export function unwrapJson(content: unknown): unknown {
  if (Array.isArray(content)) {
    const textParts = content
      .map((c) => (typeof c === "object" && c && "text" in c ? (c as { text?: unknown }).text : null))
      .filter((t): t is string => typeof t === "string");
    if (textParts.length > 0) {
      const parsed = safeJsonParse(textParts.join("\n").trim());
      if (parsed !== undefined) return parsed;
    }
    return content;
  }
  if (typeof content === "string") return safeJsonParse(content) ?? content;
  return content;
}

/**
 * 上游命中总数。**这条是覆盖度自检的分母**:sanitizeMinicod 会把 20 条砍到 16,
 * 若不记 total,模型会以为「这个方向只有 16 篇」而实际有 25 万篇(终稿 §3.3-b)。
 */
export function totalUpstreamOf(content: unknown): number | undefined {
  const data = unwrapJson(content);
  if (!data || typeof data !== "object" || Array.isArray(data)) return undefined;
  return pickNumber(data as Record<string, unknown>, ["total", "total_results", "totalResults", "total_count"]);
}

// ── 单条识别与字段映射 ────────────────────────────────────────────────────────

/** 论文体征字段:出现任意一个即倾向于「这是一篇论文」而非作者/机构实体。镜像源同名常量。 */
export const PAPER_SIGNAL_KEYS = [
  'title', 'paper_title', 'paperTitle',
  'year', 'publication_date', 'publicationDate',
  'venue', 'journal', 'doi', 'pmid', 'abstract',
  'citation_count', 'citationCount',
  'reference_count', 'referenceCount',
  'fields_of_study', 'fieldsOfStudy',
  'pdf_url', 'pdfUrl', 'is_open_access', 'isOpenAccess',
];

/** 标题字段。刻意**不含** `name` —— 作者/机构实体正是靠 name 伪装成论文卡的根因。 */
export const TITLE_KEYS = ['title', 'paper_title', 'paperTitle'];

function hasAnyPaperSignal(r: Record<string, unknown>): boolean {
  return PAPER_SIGNAL_KEYS.some((k) => {
    const v = r[k];
    if (v === undefined || v === null || v === "") return false;
    if (Array.isArray(v) && v.length === 0) return false;
    return true;
  });
}

/** 明显的非论文实体(作者 / 高校机构)。命中即剔除,别让作者混进账本变成"一篇文献"。 */
function isNonPaperEntity(r: Record<string, unknown>): boolean {
  if (typeof r.school_code === "string" && r.school_code.trim() !== "") return true;
  const hasName =
    (typeof r.name === "string" && r.name.trim() !== "") ||
    (typeof r.display_name === "string" && r.display_name.trim() !== "");
  const hasTitle = TITLE_KEYS.some((k) => typeof r[k] === "string" && (r[k] as string).trim() !== "");
  if (hasName && !hasTitle && !hasAnyPaperSignal(r)) return true;
  return false;
}

/** 单条 raw → ParsedPaper。无标题 / 无 id / 是非论文实体 → null(与前端同判据)。 */
export function normalizePaper(raw: unknown): ParsedPaper | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  if (isNonPaperEntity(r)) return null;

  const title = pickString(r, TITLE_KEYS) ?? "";
  if (!title) return null;

  const rawSource = pickString(r, ["source"]);
  const sourceCode: ParsedPaper["sourceCode"] =
    rawSource === "olx" || rawSource === "pmd" || rawSource === "stc" ? rawSource : "stc";

  const paperId = normalizePaperId(pickString(r, ["id", "paperId", "paper_id"]), sourceCode);
  if (!paperId) return null;

  const yearVal = r.year;
  let year: number | undefined;
  if (typeof yearVal === "number") {
    year = yearVal;
  } else if (typeof yearVal === "string") {
    const n = Number.parseInt(yearVal, 10);
    if (Number.isFinite(n)) year = n;
  }

  const authors = normalizeAuthorNames(r.authors);

  return {
    paperId,
    sourceCode,
    title,
    abstract: pickString(r, ["abstract", "summary", "description"]),
    year,
    publicationDate: pickString(r, ["publication_date", "publicationDate"]),
    venue: pickString(r, ["venue", "journal", "publisher"]),
    url: pickString(r, ["url", "link"]),
    doi: pickString(r, ["doi"]),
    pmid: pickString(r, ["pmid"]),
    authors,
    citationCount: pickNumber(r, ["citation_count", "citationCount"]),
    referenceCount: pickNumber(r, ["reference_count", "referenceCount"]),
    isOpenAccess: pickBoolean(r, ["is_open_access", "isOpenAccess"]),
  };
}

/** 从 tool_result.content 尽力解析论文列表。解析失败返回空数组(账本随之不写,零副作用)。 */
export function parsePapersFromToolResult(content: unknown): ParsedPaper[] {
  return extractPaperListCandidates(content)
    .map(normalizePaper)
    .filter((p): p is ParsedPaper => p !== null);
}

// ── chunk 级接地:snippet 正文抽取 ───────────────────────────────────────────
// 2026-08-01 架构评估 Phase 0。**这批数据今天已经在上游返回、已被 sanitizeMinicod cap 过,
// 然后被我们自己丢掉** —— 零新增上游调用,是全场性价比最高的一格。
//
// 🔴 为什么重要:账本此前只到**摘要级**,而「检索到一条题录」与「读到支持某个论断的那一段」
//    是两件事。31 条效应量凭空出现的那条缝就在这里 —— 模型手上只有标题+摘要,
//    却要写出具体数值,除了编没有别的路。有了段落,「引真的」才第一次比「编假的」便宜。

/** snippet 里可能承载正文的键(按优先级)。上游形态不稳,故多给几个别名。 */
const PASSAGE_TEXT_KEYS = ['text', 'snippet', 'passage', 'content', 'chunk'];
/** snippet 所属章节名(可选,用于告诉模型这段出自 Methods 还是 Discussion)。 */
const PASSAGE_SECTION_KEYS = ['section', 'section_title', 'sectionTitle', 'heading'];

/** 单条段落:正文 + 它属于哪条题录(evidenceKey,入账时再换算成 E 编号)。 */
export interface ParsedPassage {
  /** 该段落所属题录的去重键(与 ParsedPaper 走同一个 evidenceKey 口径)。 */
  key: string;
  text: string;
  section?: string;
}

/** 单段正文上限:段落是拿来支撑论断的,不是拿来塞满上下文的。超长截断并保留可见性。 */
const PASSAGE_TEXT_CAP = 2000;

/**
 * 从一次检索结果里抽出**段落**(而非题录)。
 *
 * 判据刻意保守:一个候选对象必须**同时**具备「论文体征」(能被 normalizePaper 认出,
 * 从而算得出 evidenceKey)与「正文字段」,才产出段落。抽不出题录身份的正文一律丢弃 ——
 * 绑错题录比不绑更糟:那会给一条论文挂上别人的段落,而这条基座恰恰是要消灭这类错误。
 */
export function parsePassagesFromToolResult(content: unknown): ParsedPassage[] {
  const out: ParsedPassage[] = [];
  for (const cand of extractPaperListCandidates(content)) {
    if (!cand || typeof cand !== 'object' || Array.isArray(cand)) continue;
    const rec = cand as Record<string, unknown>;
    const text = pickString(rec, PASSAGE_TEXT_KEYS);
    if (!text || !text.trim()) continue;
    // 必须能认出它是哪条论文 —— 认不出就跳过(见上面"绑错比不绑更糟")。
    const paper = normalizePaper(cand);
    if (!paper) continue;
    const section = pickString(rec, PASSAGE_SECTION_KEYS);
    out.push({
      key: evidenceKey(paper),
      text: text.trim().slice(0, PASSAGE_TEXT_CAP),
      ...(section && section.trim() ? { section: section.trim().slice(0, 120) } : {}),
    });
  }
  return out;
}

/**
 * 作者名。前端产出 `PaperAuthor[]`(带 authorId/affiliations),账本只留名字 ——
 * **这是刻意的偏离**:账本要小(每条 40-80 token 进 digest),作者归属反查走 EvidenceGet 的原始检索。
 * 镜像测试只比对名字序列。
 */
function normalizeAuthorNames(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const list: string[] = [];
  for (const a of raw) {
    if (typeof a === "string") {
      const name = a.trim();
      if (name) list.push(name);
      continue;
    }
    if (!a || typeof a !== "object") continue;
    const name = pickString(a as Record<string, unknown>, ["name", "fullName", "displayName"]);
    if (name) list.push(name);
  }
  return list.length > 0 ? list : undefined;
}

/** 非 stc 源且 id 未带前缀时补 `<source>:`(与后端 minicod.normalizeID / 前端同规则)。 */
export function normalizePaperId(id: string | undefined, source: ParsedPaper["sourceCode"]): string | undefined {
  if (!id) return undefined;
  if (source === "stc") return id;
  if (id.includes(":")) return id;
  return `${source}:${id}`;
}

export function pickString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return undefined;
}

export function pickNumber(obj: Record<string, unknown>, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const n = Number.parseFloat(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return undefined;
}

export function pickBoolean(obj: Record<string, unknown>, keys: string[]): boolean | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "boolean") return v;
  }
  return undefined;
}

// ── 对外品牌名(遮蔽层镜像)────────────────────────────────────────────────────
// 🔴 铁律 [[data-source-alias-hard-rule]]:模型可见的任何文本里只能出现 Graph / Discovery /
//    Medicine,绝不能出现 Semantic Scholar / OpenAlex / PubMed。账本的 `source` 字段进 digest、
//    进 EvidenceGet 输出、被模型原样转述给用户 —— 是最靠近用户的一个泄漏面。

/** 真源:frontend-user/src/shared/lib/mask-tool-source.ts 的 SOURCE_BRAND(镜像测试逐键比对)。 */
export const SOURCE_BRAND: Record<string, string> = {
  semantic: "Graph",
  semanticscholar: "Graph",
  semantic_scholar: "Graph",
  stc: "Graph",
  graph: "Graph",
  openalex: "Discovery",
  open_alex: "Discovery",
  olx: "Discovery",
  discovery: "Discovery",
  pubmed: "Medicine",
  pub_med: "Medicine",
  pmd: "Medicine",
  medicine: "Medicine",
  minicod: "Journal",
  jnl: "Journal",
  journal: "Journal",
};

/** 源码 → 对外品牌名。命中不到返回 undefined(调用方**不要**回落成原值:那正是泄漏路径)。 */
export function brandOfSource(code: string | undefined): string | undefined {
  if (!code) return undefined;
  return SOURCE_BRAND[code.trim().toLowerCase()];
}

// ── 去重身份键 ────────────────────────────────────────────────────────────────

/** DOI 归一化:去 https://doi.org/ 前缀、去空白、转小写(同一篇的两种写法必须同键)。 */
export function normalizeDoi(doi: string): string {
  return doi
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .toLowerCase();
}

function normTitle(t: string): string {
  return t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/**
 * 身份键(终稿 §3.3-a 固定优先级):`doi:<doi>` > `src:<source>:<id>` > `t:<sha1(norm(title)+year)>`。
 * 同一篇被多次检索到只占一个 E-id —— 「换个说法再搜一遍」因此会现原形(new_ids 为空)。
 */
export function evidenceKey(p: Pick<ParsedPaper, "doi" | "paperId" | "sourceCode" | "title" | "year">): string {
  if (p.doi && p.doi.trim()) return "doi:" + normalizeDoi(p.doi);
  if (p.paperId && p.paperId.trim()) return "src:" + p.sourceCode + ":" + p.paperId.trim();
  return "t:" + createHash("sha1").update(normTitle(p.title) + "|" + (p.year ?? "")).digest("hex");
}
