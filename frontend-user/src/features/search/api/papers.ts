import { useQuery } from '@tanstack/react-query';
import { http, toApiError } from '@/shared/lib/http';
import { STALE_WARM } from '@/shared/lib/query-config';
import { enrichPmdAbstracts } from '@/shared/api/paper-enrich';
import type { Paper } from '@/shared/api/types';
import type { SearchSource } from '@/shared/lib/search-filters';

// re-export 给老 import 路径继续可用,避免一次性大爆改
export type { Paper, PaperAuthor, UpstreamSource } from '@/shared/api/types';

/**
 * 论文检索 —— 与后端 `/public/papers/search` (POST) 对接。
 * 响应:
 *   { code:0, message:'success', data: {
 *       data: { total, offset, next, data: [Paper] },
 *       originalQuery, actualQuery, searchSuggestions, hasSuggestions, searchStrategy
 *   } }
 *
 * v1:单源(默认 STC),后续按需求做多源 fan-out。
 */

export interface SearchPapersResult {
  total: number;
  offset: number;
  next?: number;
  data: Paper[];
}

interface SearchPapersWrappedResult {
  data: SearchPapersResult;
  originalQuery?: string;
  actualQuery?: string;
  searchSuggestions?: string[];
  hasSuggestions?: boolean;
  searchStrategy?: string;
}

export interface SearchPapersOptions {
  query: string;
  limit?: number;
  offset?: number;
  source?: SearchSource;
  yearFrom?: number;
  yearTo?: number;
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string;
  venue?: string[];
  fieldsOfStudy?: string[];
  publicationTypes?: string[];
  openAccessPdf?: string;
  minCitationCount?: number;
  /**
   * sort 值跨源语义不同 —— stc/pmd 走 enum(relevance/citations/date),
   * olx 走 `field:asc|desc`(cited_by_count:desc 等)。后端原样透传,不做翻译。
   * 由前端按 source 选择有效值(types.ts SORT_OPTIONS_PER_SOURCE)。
   */
  sort?: string;
}

/**
 * 论文检索 hook —— 自动 cache + paginate-aware queryKey + 全部 filter 参数都参与缓存键,
 * 任意 filter 字段变化都会触发自动重查(无需"应用"按钮)。
 *
 * **PMD 后处理**:PubMed 的搜索端点 `/v1/pmd/papers/search` 只返回元数据,
 * 不带 abstract。本 hook 在源为 pmd 时,**链式调用**
 * `/public/papers/batch` 补一次 abstract,合并到 paper 列表里(整体作为一个
 * react-query result 返回,调用方无感)。
 */
export function useSearchPapers(opts: SearchPapersOptions) {
  const enabled = (opts.query?.trim().length ?? 0) > 0;
  const source = opts.source ?? 'stc';
  return useQuery({
    queryKey: [
      'search',
      'papers',
      opts.query,
      opts.limit ?? 10,
      opts.offset ?? 0,
      source,
      opts.yearFrom,
      opts.yearTo,
      opts.dateFrom,
      opts.dateTo,
      opts.venue,
      opts.fieldsOfStudy,
      opts.publicationTypes,
      opts.openAccessPdf,
      opts.minCitationCount,
      opts.sort,
    ],
    enabled,
    staleTime: STALE_WARM,
    // 不用 placeholderData 持有旧数据 —— 任何 query/filter 变化都要"清空 + 重 loading",
    // 避免旧结果残留误导。SearcherColumn 基于 isFetching 渲染蒙层 loading。
    queryFn: async (): Promise<SearchPapersWrappedResult> => {
      try {
        const { data } = await http.post<{ data: SearchPapersWrappedResult }>(
          '/public/papers/search',
          {
            query: opts.query.trim(),
            limit: opts.limit ?? 10,
            offset: opts.offset ?? 0,
            source,
            // 后端 SearchPapersRequest 的 yearFrom/yearTo 是 string 类型(legacy 兼容)
            yearFrom: opts.yearFrom != null ? String(opts.yearFrom) : undefined,
            yearTo: opts.yearTo != null ? String(opts.yearTo) : undefined,
            dateFrom: opts.dateFrom,
            dateTo: opts.dateTo,
            venue: opts.venue,
            fieldsOfStudy: opts.fieldsOfStudy,
            publicationTypes: opts.publicationTypes,
            openAccessPdf: opts.openAccessPdf,
            minCitationCount: opts.minCitationCount,
            sort: opts.sort,
          }
        );
        const raw = data.data;
        const rows = raw?.data?.data;
        // 自动换源可能落到 pmd —— 按「实际返回的源」判断(而非请求源),确保 pmd 结果也补 abstract
        const effSource = rows?.[0]?.source ?? source;
        if (effSource !== 'pmd' || !rows?.length) return raw;

        // PMD 无 abstract,补一次 batch 拿 abstract,merge 回去
        const enriched = await enrichPmdAbstracts(rows);
        return { ...raw, data: { ...raw.data, data: enriched } };
      } catch (err) {
        throw toApiError(err);
      }
    },
  });
}

/** 把后端返回的 wrapped 结构解出来,组件用 papers + total + 错误状态即可 */
export function extractPapers(result: SearchPapersWrappedResult | undefined) {
  const inner = result?.data;
  return {
    papers: Array.isArray(inner?.data) ? inner!.data : [],
    total: inner?.total ?? 0,
    offset: inner?.offset ?? 0,
    next: inner?.next,
    suggestions: Array.isArray(result?.searchSuggestions)
      ? result!.searchSuggestions!
      : [],
  };
}
