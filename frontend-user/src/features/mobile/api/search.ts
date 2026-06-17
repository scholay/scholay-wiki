import { useInfiniteQuery } from '@tanstack/react-query';
import { http, toApiError } from '@/shared/lib/http';
import type { Journal, Paper } from '@/shared/api/types';
import {
  DEFAULT_FILTERS,
  resolveYearRange,
  type SearchFilters,
} from '@/shared/lib/search-filters';

/** 移动端搜索瀑布流每页篇数 */
const SEARCH_PAGE = 12;

/**
 * 移动端论文搜索 —— 与 PC(useSearchPapers)同端点 POST /public/papers/search、
 * 同筛选参数(source / 年份 / venue / 学科 / 类型 / OA / 最少引用 / 排序),
 * 只是改成 offset 分页 + 无限下拉。query 为空时 disabled。
 *
 * filters 不传则用 DEFAULT_FILTERS(source=stc、不限时间、相关度)。
 * 所有 filter 字段都进 queryKey → 改筛选自动重查。
 */
export function useMobilePaperSearch(query: string, filters: SearchFilters = DEFAULT_FILTERS) {
  const q = query.trim();
  const { yearFrom, yearTo } = resolveYearRange(filters);
  return useInfiniteQuery({
    queryKey: [
      'mobile',
      'search',
      'papers',
      q,
      filters.source,
      yearFrom,
      yearTo,
      filters.venues,
      filters.subjects,
      filters.publicationTypes,
      filters.openAccess,
      filters.minCitations,
      filters.sort,
    ],
    enabled: q.length > 0,
    initialPageParam: 0,
    staleTime: 5 * 60_000,
    getNextPageParam: (lastPage: Paper[], allPages: Paper[][]) =>
      lastPage.length < SEARCH_PAGE ? undefined : allPages.length * SEARCH_PAGE,
    queryFn: async ({ pageParam }): Promise<Paper[]> => {
      try {
        const { data } = await http.post<{ data: { data: { data: Paper[] } } }>(
          '/public/papers/search',
          {
            query: q,
            limit: SEARCH_PAGE,
            offset: pageParam,
            source: filters.source,
            // 后端 SearchPapersRequest 的 yearFrom/yearTo 是 string(legacy 兼容,同 PC)
            yearFrom: yearFrom != null ? String(yearFrom) : undefined,
            yearTo: yearTo != null ? String(yearTo) : undefined,
            venue: filters.venues.length > 0 ? filters.venues : undefined,
            fieldsOfStudy: filters.subjects.length > 0 ? filters.subjects : undefined,
            publicationTypes:
              filters.publicationTypes.length > 0 ? filters.publicationTypes : undefined,
            openAccessPdf: filters.openAccess ? 'true' : undefined,
            minCitationCount: filters.minCitations,
            sort: filters.sort,
          }
        );
        return data.data?.data?.data ?? [];
      } catch (err) {
        throw toApiError(err);
      }
    },
  });
}

// ─── 期刊搜索(期刊 tab) ─────────────────────────────────────────────────
// 端点 /public/journals/search 是上游 raw 透传({rows:[{unified:{...}}], hasMore}),
// 这里只挑移动端期刊卡要的字段做最小规整(完整版在 features/journals,移动端自管不跨 feature)。

const JOURNAL_SEARCH_PAGE = 12;

interface RawUnifiedJournal {
  id?: number;
  canonical_name?: string;
  crossref_publisher?: string | null;
  openalex_country?: string | null;
  openalex_type?: string | null;
  openalex_is_oa?: number | boolean | null;
  openalex_h_index?: number | string | null;
  jcr_quartile?: string | null;
  jcr_impact_factor?: string | number | null;
  fqb_major_quartile?: string | null;
  xr_major_quartile?: string | null;
  ccf_rank?: string | null;
  gjqk_warning_level?: string | null;
  has_submission?: number | boolean | null;
}

function parseNumLoose(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : undefined;
}

function normalizeJournalRow(u: RawUnifiedJournal): Journal | null {
  if (!u.id || !u.canonical_name) return null;
  const fqb = String(u.fqb_major_quartile ?? '').trim().match(/^([1-4])/)?.[1];
  const xr = String(u.xr_major_quartile ?? '').trim().match(/^([1-4])/)?.[1];
  return {
    id: u.id,
    canonical_name: u.canonical_name,
    publisher: u.crossref_publisher || undefined,
    country: u.openalex_country || undefined,
    type: u.openalex_type || undefined,
    is_oa: u.openalex_is_oa === 1 || u.openalex_is_oa === true || undefined,
    jcr_quartile: u.jcr_quartile || undefined,
    jcr_impact_factor: parseNumLoose(u.jcr_impact_factor),
    fqb_quartile: fqb,
    xr_quartile: xr,
    ccf_rank: u.ccf_rank ? String(u.ccf_rank).toUpperCase() : undefined,
    openalex_h_index: parseNumLoose(u.openalex_h_index),
    gjqk_warning: !!u.gjqk_warning_level,
    has_submission: u.has_submission === 1 || u.has_submission === true || undefined,
  };
}

interface JournalSearchPage {
  items: Journal[];
  hasMore: boolean;
}

/** 移动端期刊搜索 —— 期刊 tab 下的搜索;keyword 为空时 disabled。 */
export function useMobileJournalSearch(keyword: string) {
  const k = keyword.trim();
  return useInfiniteQuery({
    queryKey: ['mobile', 'search', 'journals', k],
    enabled: k.length > 0,
    initialPageParam: 1,
    staleTime: 5 * 60_000,
    getNextPageParam: (last: JournalSearchPage, all: JournalSearchPage[]) =>
      last.hasMore ? all.length + 1 : undefined,
    queryFn: async ({ pageParam }): Promise<JournalSearchPage> => {
      try {
        const { data } = await http.post<{
          data: { rows?: Array<{ unified?: RawUnifiedJournal }>; hasMore?: boolean };
        }>('/public/journals/search', {
          keyword: k,
          page: pageParam,
          page_size: JOURNAL_SEARCH_PAGE,
          // 移动端期刊搜索无排序 UI → 默认按影响因子降序(优先展示高影响因子期刊)。
          // search 端点的 IF 排序字段是 `_num` 变体(与 PC useJournalSearch 一致;list 端点才是无后缀)。
          sort_by: 'jcr_impact_factor_num',
          sort_dir: 'desc',
        });
        const rows = data.data?.rows ?? [];
        const items = rows
          .map((r) => (r.unified ? normalizeJournalRow(r.unified) : null))
          .filter((j): j is Journal => j !== null);
        return { items, hasMore: !!data.data?.hasMore };
      } catch (err) {
        throw toApiError(err);
      }
    },
  });
}

/** 摊平期刊分页 + 按 id 去重。 */
export function flattenJournalSearchPages(pages: JournalSearchPage[] | undefined): Journal[] {
  if (!pages) return [];
  const seen = new Set<number>();
  const out: Journal[] = [];
  for (const pg of pages) {
    for (const j of pg.items) {
      if (!j.id || seen.has(j.id)) continue;
      seen.add(j.id);
      out.push(j);
    }
  }
  return out;
}

/** 摊平分页 + 跨页去重 + 过滤无标题脏数据。 */
export function flattenSearchPages(pages: Paper[][] | undefined): Paper[] {
  if (!pages) return [];
  const seen = new Set<string>();
  const out: Paper[] = [];
  for (const page of pages) {
    for (const p of page) {
      if (!p.paperId || !p.title || seen.has(p.paperId)) continue;
      seen.add(p.paperId);
      out.push(p);
    }
  }
  return out;
}
