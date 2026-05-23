import { useQueries, useQuery } from '@tanstack/react-query';
import { http, toApiError } from '@/shared/lib/http';
import { useDebounce } from '@/shared/hooks';
import type {
  AuthorSuggestion,
  PaperSuggestion,
  UpstreamSource,
} from '@/shared/api/types';

// re-export 给老 import 路径继续可用
export type {
  UpstreamSource,
  PaperSuggestion,
  AuthorSuggestion,
} from '@/shared/api/types';

/**
 * 后端 /public/search/suggestions 返回结构 —— source 字段标识来源:
 *   stc → Semantic Scholar
 *   olx → OpenAlex
 *   pmd → PubMed
 *
 * 不传 source 参数时,后端会 fan-out 到所有 3 个论文源 + 2 个作者源,best-effort 合并。
 */

export interface SearchSuggestionsResponse {
  papers: PaperSuggestion[];
  authors: AuthorSuggestion[];
}

interface UseSearchSuggestionsOptions {
  paperLimit?: number;
  authorLimit?: number;
  /** debounce 输入,默认 280ms */
  debounceMs?: number;
  /** 触发查询的最小字符数,默认 1 */
  minChars?: number;
  /**
   * 指定单源:`stc` / `olx` / `pmd`。不传 → 后端 fan-out(响应慢,需等所有源返回)。
   * 客户端做"真并行 + 到达顺序渲染"时传单源,见 useMultiSourceSearchSuggestions。
   */
  source?: UpstreamSource;
}

/**
 * 输入框联想 hook —— 自动 debounce + cache。
 *
 * 单源模式(传 source):仅查指定一个源,响应快。
 * 多源模式(不传 source):**已不推荐** —— 后端 fan-out 要等所有源返回,慢的卡死整个 dropdown。
 * 多源场景请用下面 `useMultiSourceSearchSuggestions`,客户端并行 + 到达顺序铺。
 */
export function useSearchSuggestions(
  rawQuery: string,
  {
    paperLimit = 5,
    authorLimit = 5,
    debounceMs = 280,
    minChars = 1,
    source,
  }: UseSearchSuggestionsOptions = {}
) {
  const q = useDebounce(rawQuery.trim(), debounceMs);
  return useQuery({
    queryKey: ['search', 'suggestions', q, paperLimit, authorLimit, source ?? ''],
    enabled: q.length >= minChars,
    staleTime: 60_000,
    placeholderData: (prev) => prev, // 输入变化时保留旧结果,避免闪烁
    queryFn: async (): Promise<SearchSuggestionsResponse> => {
      try {
        const params = new URLSearchParams({
          query: q,
          paperLimit: String(paperLimit),
          authorLimit: String(authorLimit),
        });
        if (source) params.set('source', source);
        const { data } = await http.get<{ data: SearchSuggestionsResponse }>(
          `/public/search/suggestions?${params}`
        );
        return data.data ?? { papers: [], authors: [] };
      } catch (err) {
        throw toApiError(err);
      }
    },
  });
}

/**
 * 多源联想 —— 客户端真并行 + 到达顺序渲染。
 *
 * 之前用单个 fan-out 调用,响应被最慢的源拖住整个 dropdown。
 * 改成 3 个独立的 useQuery(stc/olx/pmd 同时发),哪个先返回先铺,
 * 后到的静默追加。调用方根据 sources[i].isLoading 判别"全部还在等" vs
 * "部分已到,可以展示了"。
 *
 * 返回:每个源一项 `{ source, papers, authors, isLoading, isError }`,
 * 顺序固定为 stc → olx → pmd(数组下标稳定,React 不重排)。
 * 到达顺序由调用方在 useEffect 里观察 isLoading 变化记录。
 */
export interface SourceSuggestionResult {
  source: UpstreamSource;
  papers: PaperSuggestion[];
  authors: AuthorSuggestion[];
  isLoading: boolean;
  isError: boolean;
}

const MULTI_SOURCE_ORDER: UpstreamSource[] = ['stc', 'olx', 'pmd'];

export function useMultiSourceSearchSuggestions(
  rawQuery: string,
  {
    paperLimit = 4,
    authorLimit = 3,
    debounceMs = 280,
    minChars = 1,
  }: Omit<UseSearchSuggestionsOptions, 'source'> = {}
): SourceSuggestionResult[] {
  const q = useDebounce(rawQuery.trim(), debounceMs);
  const enabled = q.length >= minChars;

  const queries = useQueries({
    queries: MULTI_SOURCE_ORDER.map((source) => ({
      queryKey: [
        'search',
        'suggestions',
        q,
        paperLimit,
        authorLimit,
        source,
      ] as const,
      enabled,
      staleTime: 60_000,
      placeholderData: (prev: SearchSuggestionsResponse | undefined) => prev,
      queryFn: async (): Promise<SearchSuggestionsResponse> => {
        try {
          const params = new URLSearchParams({
            query: q,
            paperLimit: String(paperLimit),
            authorLimit: String(authorLimit),
            source,
          });
          const { data } = await http.get<{ data: SearchSuggestionsResponse }>(
            `/public/search/suggestions?${params}`
          );
          return data.data ?? { papers: [], authors: [] };
        } catch (err) {
          throw toApiError(err);
        }
      },
    })),
  });

  return queries.map((q, i) => ({
    source: MULTI_SOURCE_ORDER[i],
    papers: q.data?.papers ?? [],
    authors: q.data?.authors ?? [],
    isLoading: q.isLoading,
    isError: q.isError,
  }));
}

/**
 * 上游 /v1/jnl/suggest 轻量字段 —— 仅含 id/canonical_name/issn_l/source_count/openalex_works_count。
 * 实际响应是数组,后端原样透传。
 */
export interface JournalSuggestion {
  id: number;
  canonical_name: string;
  issn_l?: string;
  source_count?: number;
  openalex_works_count?: number;
}

/**
 * 实际响应 shape(上游 `/v1/jnl/suggest`,经 backend 透传):
 *   { code, message, data: { suggestions: [...] } }
 * 这里把内层 `suggestions` 解出来,组件用的时候就是纯数组。
 */
interface JournalSuggestPayload {
  suggestions?: JournalSuggestion[];
}

interface UseJournalSuggestionsOptions {
  limit?: number;
  debounceMs?: number;
  minChars?: number;
}

export function useJournalSuggestions(
  rawQuery: string,
  {
    limit = 3,
    debounceMs = 280,
    minChars = 2,
  }: UseJournalSuggestionsOptions = {}
) {
  const q = useDebounce(rawQuery.trim(), debounceMs);
  return useQuery({
    queryKey: ['search', 'journals', q, limit],
    enabled: q.length >= minChars,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
    queryFn: async (): Promise<JournalSuggestion[]> => {
      try {
        const { data } = await http.post<{ data: JournalSuggestPayload | null }>(
          '/public/journals/suggest',
          { q, limit }
        );
        return data.data?.suggestions ?? [];
      } catch (err) {
        throw toApiError(err);
      }
    },
  });
}
