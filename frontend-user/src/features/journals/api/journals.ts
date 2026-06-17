import { useQuery } from '@tanstack/react-query';
import { http, toApiError } from '@/shared/lib/http';
import { STALE_COLD, STALE_COOL, STALE_WARM } from '@/shared/lib/query-config';
import type {
  Journal,
  JournalSearchResult,
  JournalStats,
} from '@/shared/api/types';

// re-export 给老 import 路径继续可用(Journal 详情 hook 已上移 shared,这里只剩搜索/统计)
export type {
  Journal,
  JournalSearchResult,
  JournalStats,
} from '@/shared/api/types';

/**
 * 期刊 API —— 与后端 /api/v1/public/journals/* 对接。
 *
 * 后端是 minicod 的上游 `/v1/jnl/*` 包装,所有接口 **POST**(即使是 GET 语义)。
 * 三段式 queryKey:
 *   ['journal', 'stats']                  总览统计
 *   ['journal', 'list', sortBy, page]     列表
 *   ['journal', 'search', ...]            搜索
 *   ['journal', 'detail', id]             单个详情
 */

// ============================================================================
// Stats —— 给 JournalHomePage 用
// ============================================================================

export function useJournalStats() {
  return useQuery({
    queryKey: ['journal', 'stats'] as const,
    staleTime: STALE_COLD, // stats 变化慢
    queryFn: async (): Promise<JournalStats> => {
      try {
        const { data } = await http.post<{ data: JournalStats }>(
          '/public/journals/stats',
          {}
        );
        return data.data;
      } catch (err) {
        throw toApiError(err);
      }
    },
  });
}

// ============================================================================
// List —— 默认按 jcr_impact_factor 倒序,首页 "热门期刊" 用
// ============================================================================

export interface JournalListOptions {
  sortBy?: 'jcr_impact_factor' | 'openalex_h_index' | 'source_count';
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
  minSources?: number;
}

export function useJournalList(opts: JournalListOptions = {}) {
  const {
    sortBy = 'jcr_impact_factor',
    sortDir = 'desc',
    page = 1,
    pageSize = 12,
    minSources,
  } = opts;
  return useQuery({
    queryKey: ['journal', 'list', sortBy, sortDir, page, pageSize, minSources] as const,
    staleTime: STALE_COOL,
    queryFn: async (): Promise<JournalSearchResult> => {
      try {
        const body: Record<string, unknown> = {
          sort_by: sortBy,
          sort_dir: sortDir,
          page,
          page_size: pageSize,
        };
        if (minSources) body.min_sources = minSources;
        const { data } = await http.post<{ data: JournalSearchResult }>(
          '/public/journals/list',
          body
        );
        return data.data;
      } catch (err) {
        throw toApiError(err);
      }
    },
  });
}

// ============================================================================
// Search —— 多维度过滤(Q 区 / IF 区间 / 出版社 / 国家等)
// ============================================================================

/**
 * 期刊搜索过滤参数 —— 与后端 JournalSearchOptions(`minicod/models.go`)对齐:
 *   - 中科院 / JCR / SCImago 分区
 *   - 影响因子 / SJR 范围
 *   - CCF / 出版商 / 国家 / OA / Type
 *   - 排序(SortBy / SortDir)
 * 全字段可选,空 = 不过滤。
 */
export interface JournalSearchOptions {
  keyword?: string;
  jcrQuartile?: string;
  fqbQuartile?: string;
  scimagoBestQuartile?: string;
  ccfRank?: string;
  publisher?: string;
  country?: string;
  isOA?: boolean;
  minImpactFactor?: number;
  maxImpactFactor?: number;
  minSJR?: number;
  maxSJR?: number;
  minHIndex?: number;
  maxHIndex?: number;
  minWorksCount?: number;
  minSources?: number;
  hasSources?: string;
  gjqkWarning?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

/**
 * 期刊搜索 hook —— **始终启用**:无 keyword 也返回(按 sortBy 默认列表,
 * 配合期刊首页的"直接走结果页"心智)。
 */
export function useJournalSearch(opts: JournalSearchOptions) {
  const { page = 1, pageSize = 20 } = opts;

  return useQuery({
    queryKey: [
      'journal',
      'search',
      opts.keyword ?? '',
      opts.jcrQuartile,
      opts.fqbQuartile,
      opts.scimagoBestQuartile,
      opts.ccfRank,
      opts.publisher,
      opts.country,
      opts.isOA,
      opts.minImpactFactor,
      opts.maxImpactFactor,
      opts.minSJR,
      opts.maxSJR,
      opts.minHIndex,
      opts.maxHIndex,
      opts.minWorksCount,
      opts.minSources,
      opts.hasSources,
      opts.gjqkWarning,
      opts.sortBy,
      opts.sortDir,
      page,
      pageSize,
    ] as const,
    staleTime: STALE_WARM,
    queryFn: async (): Promise<JournalSearchResult> => {
      try {
        const body: Record<string, unknown> = {
          page,
          page_size: pageSize,
        };
        if (opts.keyword) body.keyword = opts.keyword.trim();
        if (opts.jcrQuartile) body.jcr_quartile = opts.jcrQuartile;
        if (opts.fqbQuartile) body.fqb_quartile = opts.fqbQuartile;
        if (opts.scimagoBestQuartile)
          body.scimago_best_quartile = opts.scimagoBestQuartile;
        if (opts.ccfRank) body.ccf_rank = opts.ccfRank;
        if (opts.publisher) body.publisher = opts.publisher;
        if (opts.country) body.country = opts.country;
        if (opts.isOA != null) body.is_oa = opts.isOA ? '1' : '0';
        if (opts.minImpactFactor)
          body.min_impact_factor = opts.minImpactFactor;
        if (opts.maxImpactFactor)
          body.max_impact_factor = opts.maxImpactFactor;
        if (opts.minSJR) body.min_sjr = opts.minSJR;
        if (opts.maxSJR) body.max_sjr = opts.maxSJR;
        if (opts.minHIndex) body.min_h_index = opts.minHIndex;
        if (opts.maxHIndex) body.max_h_index = opts.maxHIndex;
        if (opts.minWorksCount) body.min_works_count = opts.minWorksCount;
        if (opts.minSources) body.min_sources = opts.minSources;
        if (opts.hasSources) body.has_sources = opts.hasSources;
        if (opts.gjqkWarning) body.gjqk_warning = opts.gjqkWarning;
        if (opts.sortBy) body.sort_by = opts.sortBy;
        if (opts.sortDir) body.sort_dir = opts.sortDir;
        const { data } = await http.post<{ data: RawJournalSearchPayload }>(
          '/public/journals/search',
          body
        );
        return normalizeSearchPayload(data.data, page, pageSize);
      } catch (err) {
        throw toApiError(err);
      }
    },
  });
}

// ============================================================================
// 上游 raw → 前端 Journal 规范化
//
// 后端目前是透传上游 `/v1/jnl/search`,响应实际是:
//   { rows: [{ unified: { ...raw fields... } }], total: null, hasMore, ... }
// 字段名是 raw(`crossref_publisher` / `openalex_country` / `jcr_impact_factor` 是字符串)。
// 这里集中适配,后续若后端做服务端规范化可整体删除本段。
// ============================================================================

interface RawJournalSearchPayload {
  rows?: Array<{ unified?: RawJournal }>;
  total?: number | null;
  page?: number;
  pageSize?: number;
  totalPages?: number | null;
  hasMore?: boolean;
}

interface RawJournal {
  id?: number;
  canonical_name?: string;
  issn_l?: string;
  print_issn?: string;
  electronic_issn?: string;
  source_count?: number;
  sources?: string | Record<string, unknown>;
  crossref_publisher?: string;
  openalex_country?: string;
  openalex_type?: string;
  openalex_works_count?: number;
  openalex_cited_by_count?: number;
  openalex_h_index?: number;
  openalex_is_oa?: number | boolean;
  doaj_is_in_doaj?: number | boolean;
  scimago_best_quartile?: string;
  jcr_impact_factor?: string | number;
  jcr_quartile?: string;
  fqb_major_quartile?: string;
  fqb_top?: string | boolean;
  xr_major_quartile?: string | null;
  xr_top?: string | boolean | null;
  ccf_rank?: string | null;
  gjqk_year?: number | null;
  gjqk_warning_level?: string | null;
  has_submission?: number | boolean | null;
}

function normalizeSearchPayload(
  raw: RawJournalSearchPayload | null | undefined,
  page: number,
  pageSize: number
): JournalSearchResult {
  const rows = raw?.rows ?? [];
  const items = rows
    .map((r) => (r.unified ? normalizeJournal(r.unified) : null))
    .filter((j): j is Journal => j !== null);

  // 上游不返 total;有 hasMore 则估算 total >= (page-1)*pageSize + items.length + 1
  // 没 hasMore 就用本页数当 total。前端展示用 hasMore 决定"下一页"是否禁用,
  // total 仅用于 UI 文案(显示"已加载 N+")
  let total: number;
  if (typeof raw?.total === 'number') {
    total = raw.total;
  } else if (raw?.hasMore) {
    total = (page - 1) * pageSize + items.length + 1; // ">=" 估算
  } else {
    total = (page - 1) * pageSize + items.length;
  }

  return {
    items,
    total,
    page: raw?.page ?? page,
    page_size: raw?.pageSize ?? pageSize,
    has_more: !!raw?.hasMore,
  };
}

function normalizeJournal(r: RawJournal): Journal {
  const ifNum = parseNumberLoose(r.jcr_impact_factor);
  const fqbStr = String(r.fqb_major_quartile ?? '').trim();
  const fqbMatch = fqbStr.match(/^([1-4])/);
  const xrMatch = String(r.xr_major_quartile ?? '').trim().match(/^([1-4])/);

  const issns = [r.issn_l, r.print_issn, r.electronic_issn]
    .filter((s): s is string => !!s && !!s.trim())
    .flatMap((s) => s.split(',').map((x) => x.trim()))
    .filter(Boolean);

  // 数据源覆盖 —— 上游可能给字符串 "a,b,c" 也可能给 object
  let sources: Record<string, unknown> | undefined;
  if (typeof r.sources === 'string') {
    sources = Object.fromEntries(
      r.sources
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => [s, true])
    );
  } else if (r.sources && typeof r.sources === 'object') {
    sources = r.sources;
  }

  return {
    id: r.id ?? 0,
    canonical_name: r.canonical_name ?? '',
    issns: issns.length > 0 ? Array.from(new Set(issns)) : undefined,
    publisher: r.crossref_publisher || undefined,
    country: r.openalex_country || undefined,
    type: r.openalex_type || undefined,
    is_oa:
      r.openalex_is_oa === 1 ||
      r.openalex_is_oa === true ||
      r.doaj_is_in_doaj === 1 ||
      r.doaj_is_in_doaj === true,
    jcr_impact_factor: ifNum,
    jcr_quartile: r.jcr_quartile?.toString().toUpperCase() || undefined,
    fqb_quartile: fqbMatch ? fqbMatch[1] : undefined,
    xr_quartile: xrMatch ? xrMatch[1] : undefined,
    xr_top: r.xr_top === true || r.xr_top === '是' || r.xr_top === '1',
    ccf_rank: r.ccf_rank ? r.ccf_rank.toString().toUpperCase() : undefined,
    openalex_h_index:
      typeof r.openalex_h_index === 'number' && r.openalex_h_index > 0
        ? r.openalex_h_index
        : undefined,
    gjqk_warning: isRecentWarning(r),
    source_count: r.source_count,
    sources,
    has_submission:
      r.has_submission === 1 || r.has_submission === true || undefined,
  };
}

function parseNumberLoose(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.trim());
    if (!Number.isNaN(n) && n > 0) return n;
  }
  return undefined;
}

/** 中科院国际期刊预警:上游会保留历史快照,仅近 2 年内的判定为有效预警 */
function isRecentWarning(r: RawJournal): boolean {
  const lvl = r.gjqk_warning_level?.toString().trim();
  if (!lvl) return false;
  const year = typeof r.gjqk_year === 'number' ? r.gjqk_year : 0;
  if (year <= 0) return false;
  return year >= new Date().getFullYear() - 1;
}

// useJournalDetail 已上移到 shared/api/journals —— 跨 feature 共享(library 详情 pane 也用),
// 本处 re-export 保持 journals 内部老 import 路径继续可用
export { useJournalDetail } from '@/shared/api/journals';
