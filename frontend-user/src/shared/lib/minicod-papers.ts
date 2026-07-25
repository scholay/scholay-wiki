// ============================================================================
// Minicod 论文工具结果解析(提升自 features/search/.../types.ts)——
// smart-search 的 PaperListScroller 与 admin 会话监控的只读论文列表共用
// (features 互不 import,故收口到 shared)。
// ============================================================================

import type { Paper, PaperAuthor, UpstreamSource } from '@/shared/api/types';

/**
 * 从 tool_result.content 中尽力解析论文列表, 输出完整 `Paper`, 可直接喂给 PaperResultCard。
 *
 * Minicod MCP search_papers 上游返回 schema (snake_case, 实测 v0.3.0):
 *   { items: [ { id, source, title, abstract, year, publication_date, doi,
 *               citation_count, reference_count, venue, is_open_access,
 *               pdf_url, url, fields_of_study, authors: [{id, source, name, affiliations, ...}] } ],
 *     total, offset, limit, sources_queried }
 *
 * 兼容外包形态:
 *   - { items|papers|results|data: [...] }
 *   - 顶层直接是数组
 *   - 包在 content[0].text 里的 JSON 字符串 (MCP 常见做法)
 *
 * 解析失败返回空数组,UI 退化为 "工具结果(原始)" 折叠块即可。
 */
export function parsePapersFromToolResult(content: unknown): Paper[] {
  const candidates = extractPaperListCandidates(content);
  return candidates
    .map(normalizePaper)
    .filter((p): p is Paper => p !== null);
}

/**
 * 结果里是否解析出至少一篇论文 —— 消费方据此决定是否隐藏原始 JSON。
 *
 * 安全网:新版 minicod MCP(76 工具:期刊 / snippet / 28 个 OpenAlex 实体 /
 * recommend_* 等)里大量结果**不是**论文列表,解析为空。消费方**只有**在此返回
 * true 时才隐藏 JSON(expandable=false + 渲染论文卡);返回 false 时必须回退到默认
 * 可展开工具块,让原始 JSON 至少可见 —— 杜绝「卡片区空 + JSON 也被藏起来」的静默隐形。
 */
export function toolResultHasPapers(content: unknown): boolean {
  return parsePapersFromToolResult(content).length > 0;
}

function extractPaperListCandidates(content: unknown): unknown[] {
  if (Array.isArray(content)) {
    // MCP-style: [{ type: 'text', text: '...' }, ...]
    const textParts = content
      .map((c) => (typeof c === 'object' && c && 'text' in c ? (c as { text?: unknown }).text : null))
      .filter((t): t is string => typeof t === 'string');
    if (textParts.length > 0) {
      const merged = textParts.join('\n').trim();
      const parsed = safeJsonParse(merged);
      if (parsed !== undefined) return extractPaperListCandidates(parsed);
    }
    if (content.every((c) => typeof c === 'object' && c !== null && !('type' in c))) {
      return content;
    }
  }

  if (typeof content === 'string') {
    const parsed = safeJsonParse(content);
    if (parsed !== undefined) return extractPaperListCandidates(parsed);
    return [];
  }

  if (typeof content === 'object' && content !== null) {
    const obj = content as Record<string, unknown>;
    // recommend_paper / recommend_from_pool 的信封是 recommended_papers(而非 items/data);
    // search_snippets 的信封多为 snippets(每条带 paper_title/paper_id,见 normalizePaper)。
    for (const key of ['papers', 'recommended_papers', 'results', 'items', 'data', 'snippets']) {
      const v = obj[key];
      if (Array.isArray(v)) return v;
      if (v && typeof v === 'object') {
        const nested = extractPaperListCandidates(v);
        if (nested.length > 0) return nested;
      }
    }
  }

  return [];
}

// 供相邻的 minicod-results.ts(期刊/作者/snippet 解析)复用 —— 纯工具函数,无 papers 行为耦合。
export function safeJsonParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

/** 论文体征字段:出现任意一个即倾向于「这是一篇论文」而非作者/机构实体。 */
const PAPER_SIGNAL_KEYS = [
  'title', 'paper_title', 'paperTitle',
  'year', 'publication_date', 'publicationDate',
  'venue', 'journal', 'doi', 'pmid', 'abstract',
  'citation_count', 'citationCount',
  'reference_count', 'referenceCount',
  'fields_of_study', 'fieldsOfStudy',
  'pdf_url', 'pdfUrl', 'is_open_access', 'isOpenAccess',
];

function hasAnyPaperSignal(r: Record<string, unknown>): boolean {
  return PAPER_SIGNAL_KEYS.some((k) => {
    const v = r[k];
    if (v === undefined || v === null || v === '') return false;
    if (Array.isArray(v) && v.length === 0) return false;
    return true;
  });
}

/**
 * 是否是「明显的非论文实体」—— 作者 / 高校(机构):
 *   - 高校/机构:带 school_code(高校工具)即判定;
 *   - 作者:有 name/display_name 名字、但没有 title、也没有任何论文体征字段。
 * 命中即从论文解析里剔除,避免伪装成带错误动作(收藏/暂存)的假论文卡。
 */
function isNonPaperEntity(r: Record<string, unknown>): boolean {
  if (typeof r.school_code === 'string' && r.school_code.trim() !== '') return true;
  const hasName =
    (typeof r.name === 'string' && r.name.trim() !== '') ||
    (typeof r.display_name === 'string' && r.display_name.trim() !== '');
  const hasTitle =
    (typeof r.title === 'string' && r.title.trim() !== '') ||
    (typeof r.paper_title === 'string' && r.paper_title.trim() !== '') ||
    (typeof r.paperTitle === 'string' && r.paperTitle.trim() !== '');
  if (hasName && !hasTitle && !hasAnyPaperSignal(r)) return true;
  return false;
}

/**
 * 把单条 minicod raw paper 映射成前端 `Paper` 模型。
 *
 * 字段映射规则 (snake_case → camelCase, 与后端 minicod.ConvertPaper 保持一致):
 *   - id + source → paperId (非 stc 源补前缀 "olx:" / "pmd:", 供 /public/papers/batch 路由)
 *   - source → source ('stc' | 'olx' | 'pmd')
 *   - doi → externalIds.DOI (Paper 上没有顶层 doi 字段, 跟 STC 协议对齐放 externalIds)
 *   - pdf_url → openAccessPdf.url (没有 status 就只设 url)
 *   - publication_date → publicationDate
 *   - citation_count / reference_count → citationCount / referenceCount
 *   - is_open_access → isOpenAccess
 *   - fields_of_study → fieldsOfStudy
 *   - authors[].{id, name, affiliations} → authors[].{authorId, name, affiliations}
 *
 * 兼容场景: 工具结果之外其他可能源 (历史 tool_result 形态), 仍尽力解析。
 */
function normalizePaper(raw: unknown): Paper | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  // 防「非论文实体」被误当论文卡渲染(还带上错误的 收藏 / 暂存 动作):
  // 作者(name/display_name 但无 title 且无任何论文体征字段)、高校/机构(带 school_code)。
  // 新版 minicod MCP(76 工具)混进大量此类实体结果,统一在此拦掉。
  if (isNonPaperEntity(r)) return null;

  // 论文标题只认真正的标题字段:title(三源)/ paper_title(search_snippets)。
  // 刻意**不再**把 `name` 当标题回退 —— 作者/机构实体正是靠 `name` 伪装成论文卡的根因;
  // 且即便实体带了 citation_count 这类体征字段绕过上面的 entity 守卫,无 title 也会在此丢弃。
  const title = pickString(r, ['title', 'paper_title', 'paperTitle']) ?? '';
  if (!title) return null;

  const rawSource = pickString(r, ['source']);
  // 校验 source 是否是合法 UpstreamSource;非法或缺失就当 'stc' (不补前缀)。
  const source: UpstreamSource =
    rawSource === 'olx' || rawSource === 'pmd' || rawSource === 'stc'
      ? rawSource
      : 'stc';

  const rawID = pickString(r, ['id', 'paperId', 'paper_id']);
  const paperId = normalizePaperId(rawID, source);
  // paperId 是 PaperResultCard 的核心 key + 收藏/暂存动作的入参, 缺它整张卡都没意义。
  if (!paperId) return null;

  const yearVal = r.year;
  let year: number | undefined;
  if (typeof yearVal === 'number') {
    year = yearVal;
  } else if (typeof yearVal === 'string') {
    const n = Number.parseInt(yearVal, 10);
    if (Number.isFinite(n)) year = n;
  }

  const externalIds: Record<string, unknown> = {};
  const doi = pickString(r, ['doi']);
  if (doi) externalIds.DOI = doi;
  const pmid = pickString(r, ['pmid']);
  if (pmid) externalIds.PMID = pmid;

  const pdfURL = pickString(r, ['pdf_url', 'pdfUrl']);
  const openAccessPdf = pdfURL ? { url: pdfURL } : undefined;

  const fieldsOfStudy = Array.isArray(r.fields_of_study)
    ? (r.fields_of_study as unknown[]).filter(
        (s): s is string => typeof s === 'string'
      )
    : Array.isArray(r.fieldsOfStudy)
      ? (r.fieldsOfStudy as unknown[]).filter(
          (s): s is string => typeof s === 'string'
        )
      : undefined;

  return {
    paperId,
    title,
    abstract: pickString(r, ['abstract', 'summary', 'description']),
    year,
    publicationDate: pickString(r, ['publication_date', 'publicationDate']),
    venue: pickString(r, ['venue', 'journal', 'publisher']),
    url: pickString(r, ['url', 'link']),
    citationCount: pickNumber(r, ['citation_count', 'citationCount']),
    referenceCount: pickNumber(r, ['reference_count', 'referenceCount']),
    isOpenAccess: pickBoolean(r, ['is_open_access', 'isOpenAccess']),
    openAccessPdf,
    authors: normalizeAuthors(r.authors),
    fieldsOfStudy,
    externalIds: Object.keys(externalIds).length > 0 ? externalIds : undefined,
    source,
  };
}

/**
 * 把 minicod raw authors 映射成 `PaperAuthor[]`。原始项可能是字符串(老格式)
 * 或 `{id, source, name, affiliations, ...}` 对象。
 */
function normalizeAuthors(raw: unknown): PaperAuthor[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const list: PaperAuthor[] = [];
  for (const a of raw) {
    if (typeof a === 'string') {
      const name = a.trim();
      if (name) list.push({ name });
      continue;
    }
    if (!a || typeof a !== 'object') continue;
    const ao = a as Record<string, unknown>;
    const name = pickString(ao, ['name', 'fullName', 'displayName']);
    if (!name) continue;
    const authorId = pickString(ao, ['id', 'authorId']);
    const affiliations = Array.isArray(ao.affiliations)
      ? (ao.affiliations as unknown[]).filter(
          (s): s is string => typeof s === 'string' && s.length > 0
        )
      : undefined;
    list.push({
      name,
      authorId,
      affiliations:
        affiliations && affiliations.length > 0 ? affiliations : undefined,
    });
  }
  return list.length > 0 ? list : undefined;
}

/**
 * 跟后端 minicod.normalizeID 行为对齐: 非 stc 源且 id 还不含 ":" 时补前缀,
 * 让 /public/papers/batch 等下游接口能按前缀路由到正确的源。
 */
function normalizePaperId(id: string | undefined, source: UpstreamSource): string | undefined {
  if (!id) return undefined;
  if (source === 'stc') return id;
  if (id.includes(':')) return id;
  return `${source}:${id}`;
}

export function pickString(
  obj: Record<string, unknown>,
  keys: string[]
): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v;
  }
  return undefined;
}

export function pickNumber(
  obj: Record<string, unknown>,
  keys: string[]
): number | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const n = Number.parseFloat(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return undefined;
}

export function pickBoolean(
  obj: Record<string, unknown>,
  keys: string[]
): boolean | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'boolean') return v;
  }
  return undefined;
}

export const MINICOD_TOOL_PREFIX = 'mcp__minicod__';
