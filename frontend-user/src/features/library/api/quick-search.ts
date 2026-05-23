import { useQueries } from '@tanstack/react-query';
import { http, toApiError } from '@/shared/lib/http';
import { enrichPmdAbstracts } from '@/shared/api/paper-enrich';
import { useDebounce } from '@/shared/hooks';
import type { Paper, UpstreamSource } from '@/shared/api/types';

/**
 * 文献集 · 快捷搜索 —— "+ 在线搜索加入" 弹窗专用。
 *
 * 与首页搜索区别:
 *   - 这里**并行**打三个源(stc/olx/pmd),按源分组展示,用户可一眼看到不同源
 *     是否都命中
 *   - 限定 limit=8 每源,够选不够多 —— 不做翻页(超出就让用户去主搜索页)
 *   - **只覆盖标题搜索** —— 无年份 / venue / fieldsOfStudy 等高级筛选
 *
 * 实现:`useQueries` 同时发 3 个 `/public/papers/search` POST,各源独立 loading / error,
 * 不互相阻塞(某源挂了,其余仍展示)。
 *
 * 调用方拿到 `Array<{ source, papers, isLoading, isError }>`,直接按顺序渲染分组。
 */

const SOURCES: readonly UpstreamSource[] = ['stc', 'olx', 'pmd'];

export interface QuickSearchSourceResult {
  source: UpstreamSource;
  papers: Paper[];
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
}

interface SearchPapersResp {
  data: {
    total: number;
    data: Paper[];
  };
}

interface UseQuickPaperSearchOptions {
  limitPerSource?: number;
  /** debounce 输入,默认 280ms */
  debounceMs?: number;
}

export function useQuickPaperSearch(
  rawQuery: string,
  { limitPerSource = 8, debounceMs = 280 }: UseQuickPaperSearchOptions = {}
): QuickSearchSourceResult[] {
  const q = useDebounce(rawQuery.trim(), debounceMs);
  const enabled = q.length > 0;

  const results = useQueries({
    queries: SOURCES.map((source) => ({
      queryKey: ['library', 'quick-search', source, q, limitPerSource] as const,
      enabled,
      staleTime: 60_000,
      // 切换关键词时保留旧数据避免列表闪空,各源独立
      placeholderData: (prev: SearchPapersResp | undefined) => prev,
      queryFn: async (): Promise<SearchPapersResp> => {
        try {
          const { data } = await http.post<{ data: SearchPapersResp }>(
            '/public/papers/search',
            {
              query: q,
              limit: limitPerSource,
              offset: 0,
              source,
            }
          );
          const raw = data.data ?? { data: { total: 0, data: [] } };
          // PMD 上游不返 abstract;补一次 batch 拿摘要,merge 回去 ——
          // 保证用户点 PMD 行收藏时 abstract 不丢
          if (source === 'pmd' && raw.data.data.length > 0) {
            const enriched = await enrichPmdAbstracts(raw.data.data);
            return { ...raw, data: { ...raw.data, data: enriched } };
          }
          return raw;
        } catch (err) {
          throw toApiError(err);
        }
      },
    })),
  });

  return SOURCES.map((source, i) => {
    const r = results[i];
    return {
      source,
      papers: r.data?.data?.data ?? [],
      isLoading: r.isLoading,
      isError: r.isError,
      error: r.error,
    };
  });
}
