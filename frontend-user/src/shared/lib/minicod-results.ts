// ============================================================================
// Minicod 非论文工具结果解析 + 结果类型 dispatcher。
//
// 上一轮的「安全网」把无法识别为论文的 minicod 结果回退成可展开 JSON。这一层在
// 安全网之上给三类**确实会到达前端**的非论文结果加专用卡:
//   - 期刊(search_journals / get_journal / compare_journals / suggest_journals)
//   - 作者(search_authors / get_author)
//   - 原文片段(search_snippets)
// 其余工具(高校 / OpenAlex 实体等)未暴露给任何 feature,不会出现,不做卡。
//
// 论文解析仍在 minicod-papers.ts(本文件复用其纯工具函数),两边职责分离:
//   minicod-papers.ts  → papers
//   minicod-results.ts → journals / authors / snippets + 统一 dispatcher
//
// 铁律:绝不臆造数据。字段取不到就不置该项;整条无法识别就交回 'unknown' 走安全网。
// ============================================================================

import {
  MINICOD_TOOL_PREFIX,
  parsePapersFromToolResult,
  pickNumber,
  pickString,
  safeJsonParse,
} from './minicod-papers';

// ────────────────────────────────────────────────────────────────────────────
// 通用信封拆解(与 papers 的 extractPaperListCandidates 刻意分离:后者 key 顺序与
// papers 行为强耦合,不动它以零回归;这里用更宽的 key 集 + allowSingle 支持 get_* 详情
// 返回的单个扁平对象)。
// ────────────────────────────────────────────────────────────────────────────

const ENVELOPE_KEYS = [
  'items',
  'data',
  'results',
  'journals',
  'authors',
  'snippets',
  'papers',
  'recommended_papers',
];

/**
 * 从 tool_result.content 尽力抽出「实体候选数组」。
 *   - MCP 形态 `[{type:'text', text:'<json>'}]` → 合并 text 后 JSON.parse 再递归
 *   - 裸 JSON 字符串 → parse 再递归
 *   - 已经是对象数组 → 原样返回
 *   - 信封对象 `{items|data|...: [...]}` → 返回该数组
 *   - allowSingle 且是单个扁平对象(get_journal / get_author 详情)→ 把对象本身当唯一候选
 */
function extractEntityCandidates(content: unknown, allowSingle = false): unknown[] {
  if (Array.isArray(content)) {
    const textParts = content
      .map((c) =>
        typeof c === 'object' && c && 'text' in c
          ? (c as { text?: unknown }).text
          : null,
      )
      .filter((t): t is string => typeof t === 'string');
    if (textParts.length > 0) {
      const parsed = safeJsonParse(textParts.join('\n').trim());
      if (parsed !== undefined) return extractEntityCandidates(parsed, allowSingle);
    }
    if (content.every((c) => typeof c === 'object' && c !== null && !('type' in c))) {
      return content;
    }
    return [];
  }

  if (typeof content === 'string') {
    const parsed = safeJsonParse(content);
    if (parsed !== undefined) return extractEntityCandidates(parsed, allowSingle);
    return [];
  }

  if (typeof content === 'object' && content !== null) {
    const obj = content as Record<string, unknown>;
    for (const key of ENVELOPE_KEYS) {
      const v = obj[key];
      if (Array.isArray(v)) return v;
      if (v && typeof v === 'object') {
        // 嵌套信封(如 { data: { items: [...] } })不再单包裹,只认数组。
        const nested = extractEntityCandidates(v, false);
        if (nested.length > 0) return nested;
      }
    }
    if (allowSingle) return [obj];
  }

  return [];
}

function hasAnyKey(r: Record<string, unknown>, keys: string[]): boolean {
  return keys.some((k) => {
    const v = r[k];
    return v !== undefined && v !== null && v !== '';
  });
}

/** value 归一为布尔:1/'1'/true/'yes'/'是' → true;0/'0'/false/'no'/'否' → false;其余 undefined。 */
function truthyFlag(v: unknown): boolean | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v === 1;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (['1', 'true', 'yes', '是'].includes(s)) return true;
    if (['0', 'false', 'no', '否'].includes(s)) return false;
  }
  return undefined;
}

/** "Q1" / "1" / "1 区" → "Q1";取第一个 1-4 数字。抽不到返回 undefined(不显示乱值)。 */
function toQuartileLabel(v?: string): string | undefined {
  if (!v) return undefined;
  const m = v.trim().match(/[1-4]/);
  return m ? `Q${m[0]}` : undefined;
}

/** 中科院分区:"1 [77/5603]" / "1 区" → 取第一个 1-4 数字返回 "1"。 */
function toRegionDigit(v?: string): string | undefined {
  if (!v) return undefined;
  const m = v.trim().match(/[1-4]/);
  return m ? m[0] : undefined;
}

function formatNumber(n: number): string {
  return Number.isFinite(n) ? String(n) : '';
}

// ────────────────────────────────────────────────────────────────────────────
// 期刊
// ────────────────────────────────────────────────────────────────────────────

export interface MinicodJournal {
  name: string;
  /** 影响因子展示字符串(jcr_impact_factor_num 优先,回退 jcr_impact_factor) */
  impactFactor?: string;
  /** JCR 分区 "Q1" */
  jcrQuartile?: string;
  /** SCImago 最佳分区 "Q1" */
  scimagoQuartile?: string;
  /** 中科院大类分区数字 "1"(fqb_major_quartile) */
  casRegion?: string;
  /** 中科院新锐大类分区数字 "1"(xr_major_quartile) */
  xrRegion?: string;
  publisher?: string;
  issn?: string;
  isOA?: boolean;
  country?: string;
  hIndex?: number;
  /** 国际期刊预警(gjqk) */
  warning?: boolean;
}

/** 期刊体征字段:只有 name 而无以下任一,不当作期刊(避免作者 {name,...} 误判为期刊)。 */
const JOURNAL_SIGNAL_KEYS = [
  'canonical_name', 'crossref_title', 'openalex_name',
  'issn_l', 'print_issn', 'electronic_issn',
  'jcr_impact_factor', 'jcr_impact_factor_num', 'jcr_quartile',
  'scimago_best_quartile', 'fqb_major_quartile', 'xr_major_quartile',
  'crossref_publisher', 'doaj_publisher',
  'openalex_is_oa', 'doaj_is_in_doaj',
  'openalex_h_index', 'scimago_h_index',
  'openalex_country', 'doaj_country',
];

function normalizeJournal(raw: unknown): MinicodJournal | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const name = pickString(r, ['canonical_name', 'crossref_title', 'openalex_name', 'name']);
  if (!name) return null;
  // name 可能来自泛用的 `name` —— 必须再有一个期刊体征字段才确认是期刊(否则可能是作者)。
  if (!hasAnyKey(r, JOURNAL_SIGNAL_KEYS)) return null;

  const ifNum = pickNumber(r, ['jcr_impact_factor_num', 'jcr_impact_factor']);
  const impactFactor = ifNum !== undefined ? formatNumber(ifNum) : undefined;

  const isOA =
    truthyFlag(r['openalex_is_oa']) ?? truthyFlag(r['doaj_is_in_doaj']);

  const warnLevel = pickString(r, ['gjqk_warning_level']);
  const warning = truthyFlag(r['gjqk_warning']) === true || !!warnLevel;

  return {
    name,
    impactFactor,
    jcrQuartile: toQuartileLabel(pickString(r, ['jcr_quartile'])),
    scimagoQuartile: toQuartileLabel(pickString(r, ['scimago_best_quartile'])),
    casRegion: toRegionDigit(pickString(r, ['fqb_major_quartile'])),
    xrRegion: toRegionDigit(pickString(r, ['xr_major_quartile'])),
    publisher: pickString(r, ['crossref_publisher', 'doaj_publisher', 'publisher']),
    issn: pickString(r, ['issn_l', 'print_issn', 'electronic_issn']),
    isOA,
    country: pickString(r, ['openalex_country', 'doaj_country', 'country']),
    hIndex: pickNumber(r, ['openalex_h_index', 'scimago_h_index']),
    warning: warning || undefined,
  };
}

export function parseJournalsFromToolResult(content: unknown): MinicodJournal[] {
  return extractEntityCandidates(content, true)
    .map(normalizeJournal)
    .filter((j): j is MinicodJournal => j !== null);
}

// ────────────────────────────────────────────────────────────────────────────
// 作者
// ────────────────────────────────────────────────────────────────────────────

export interface MinicodAuthor {
  name: string;
  hIndex?: number;
  paperCount?: number;
  citationCount?: number;
  affiliations?: string[];
  /** ORCID 裸 iD 或完整 URL(展示时统一成 https://orcid.org/<id> 链接) */
  orcid?: string;
}

/** 作者体征字段:有名字且带其一(且无 title)才是作者。 */
const AUTHOR_SIGNAL_KEYS = [
  'h_index', 'hIndex', 'paper_count', 'paperCount',
  'works_count', 'citation_count', 'citationCount', 'cited_by_count', 'orcid',
];

function stringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const list = v.filter((s): s is string => typeof s === 'string' && s.trim() !== '');
  return list.length > 0 ? list : undefined;
}

function normalizeAuthor(raw: unknown): MinicodAuthor | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const name = pickString(r, ['name', 'display_name', 'displayName', 'fullName']);
  if (!name) return null;
  // 论文标题字段一律排除(论文的 authors 是子数组,不会走到这里,但顶层若带 title 则不是作者)。
  const hasTitle = hasAnyKey(r, ['title', 'paper_title', 'paperTitle']);
  if (hasTitle) return null;
  // 必须至少一个作者体征字段,避免任何 {name} 对象都被当作者。
  if (!hasAnyKey(r, AUTHOR_SIGNAL_KEYS)) return null;

  return {
    name,
    hIndex: pickNumber(r, ['h_index', 'hIndex']),
    paperCount: pickNumber(r, ['paper_count', 'paperCount', 'works_count']),
    citationCount: pickNumber(r, ['citation_count', 'citationCount', 'cited_by_count']),
    affiliations: stringArray(r.affiliations),
    orcid: pickString(r, ['orcid']),
  };
}

export function parseAuthorsFromToolResult(content: unknown): MinicodAuthor[] {
  return extractEntityCandidates(content, true)
    .map(normalizeAuthor)
    .filter((a): a is MinicodAuthor => a !== null);
}

// ────────────────────────────────────────────────────────────────────────────
// 原文片段(search_snippets)
// ────────────────────────────────────────────────────────────────────────────

export interface MinicodSnippet {
  /** 可引用的原文片段(重点) */
  text: string;
  paperTitle?: string;
  section?: string;
}

function normalizeSnippet(raw: unknown): MinicodSnippet | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  // text 是 snippet 的判定核心(与论文区分:论文无 text 字段,只有 abstract)。
  const text = pickString(r, ['text', 'snippet', 'passage']);
  if (!text) return null;
  return {
    text,
    paperTitle: pickString(r, ['paper_title', 'paperTitle', 'title']),
    section: pickString(r, ['section']),
  };
}

export function parseSnippetsFromToolResult(content: unknown): MinicodSnippet[] {
  return extractEntityCandidates(content, false)
    .map(normalizeSnippet)
    .filter((s): s is MinicodSnippet => s !== null);
}

// ────────────────────────────────────────────────────────────────────────────
// dispatcher —— 给一个 tool_result 判定渲染类型
// ────────────────────────────────────────────────────────────────────────────

export type MinicodResultKind =
  | 'papers'
  | 'journals'
  | 'authors'
  | 'snippets'
  | 'unknown';

const JOURNAL_TOOLS = new Set([
  'search_journals',
  'get_journal',
  'compare_journals',
  'suggest_journals',
]);
const AUTHOR_TOOLS = new Set(['search_authors', 'get_author']);
const SNIPPET_TOOLS = new Set(['search_snippets']);

/** 工具名(去掉 mcp__minicod__ 前缀)→ 类型提示。papers 工具与未知工具返回 undefined(走形状兜底)。 */
function kindFromToolName(toolName?: string): MinicodResultKind | undefined {
  if (!toolName) return undefined;
  const bare = toolName.startsWith(MINICOD_TOOL_PREFIX)
    ? toolName.slice(MINICOD_TOOL_PREFIX.length)
    : toolName;
  if (SNIPPET_TOOLS.has(bare)) return 'snippets';
  if (JOURNAL_TOOLS.has(bare)) return 'journals';
  if (AUTHOR_TOOLS.has(bare)) return 'authors';
  return undefined;
}

/**
 * 判定 tool_result 的渲染类型。优先用**工具名**(渲染器都能拿到 block.toolName);
 * 工具名未命中或命中后解析为空时,退回**结果形状**兜底。
 *
 * 关键约定:任何返回的具体类型都保证「对应解析非空」——渲染器据此把 expandable 设成
 * `kind === 'unknown'`,不会出现「卡片区空 + JSON 也被藏」。snippet 优先于 papers:
 * snippet 带 paper_title 会被论文解析误当论文(且丢了 text),必须先分流。
 */
export function classifyMinicodToolResult(
  content: unknown,
  toolName?: string,
): MinicodResultKind {
  const hinted = kindFromToolName(toolName);
  if (hinted === 'journals' && parseJournalsFromToolResult(content).length > 0) return 'journals';
  if (hinted === 'authors' && parseAuthorsFromToolResult(content).length > 0) return 'authors';
  if (hinted === 'snippets' && parseSnippetsFromToolResult(content).length > 0) return 'snippets';

  // 形状兜底(无工具名 / 工具名解析空):snippet → journals → authors → papers。
  if (parseSnippetsFromToolResult(content).length > 0) return 'snippets';
  if (parseJournalsFromToolResult(content).length > 0) return 'journals';
  if (parseAuthorsFromToolResult(content).length > 0) return 'authors';
  if (parsePapersFromToolResult(content).length > 0) return 'papers';
  return 'unknown';
}
