import { useEffect, useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { http, toApiError } from '@/shared/lib/http';
import { STALE_WARM } from '@/shared/lib/query-config';
import { enrichPmdAbstracts } from '@/shared/api/paper-enrich';
import { useDebounce } from '@/shared/hooks';
import type { Paper, UpstreamSource } from '@/shared/api/types';

/**
 * 三源快捷搜索 —— 跨 feature 共享(文献集「+ 在线搜索加入」、浏览器「快速打开论文」)。
 *
 * 与首页主搜索区别:
 *   - **并行**打三个源(stc/olx/pmd),按源分组展示,用户一眼看到各源是否命中
 *   - 限定 limit=8 每源,不做翻页(超出引导去主搜索页)
 *   - **只覆盖标题搜索** —— 无年份 / venue / fieldsOfStudy 等高级筛选
 *
 * 实现:`useQueries` 同时发 3 个 `/public/papers/search` POST,各源独立 loading / error,
 * 不互相阻塞(某源挂了,其余仍展示)。
 *
 * 调用方拿到 `Array<{ source, papers, isLoading, isError }>`,直接按顺序渲染分组,
 * 或交给 [[useArrivalOrderedPapers]] 按到达顺序拼成一条列表。
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
      // 保留 'library' 前缀:与原 features/library/api 版本 + 浏览器消费方一致的缓存键,
      // 纯搬迁不改键(避免脱离 ['library'] 失效范围带来的行为变化)。
      queryKey: ['library', 'quick-search', source, q, limitPerSource] as const,
      enabled,
      staleTime: STALE_WARM,
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

/**
 * arrival-order 拼接 —— 哪个源先返回先展示,后到的静默追加在后面。
 * query 一变 → 重置;源 loading→done(无论有无结果)时按到达顺序追加。
 *
 * 与 [[useQuickPaperSearch]] 是一对:入参就是它的返回。原本在文献集 OnlineSearchTab 与
 * 浏览器 QuickOpenPaperDialog 各有一份逐字重复的私有拷贝,这里合并为单一真源。
 */
export function useArrivalOrderedPapers(
  sourceResults: ReturnType<typeof useQuickPaperSearch>,
  query: string
): Paper[] {
  const [arrivalOrder, setArrivalOrder] = useState<UpstreamSource[]>([]);

  // query 变化 → 重置 arrival 顺序(新一轮搜索)
  useEffect(() => {
    setArrivalOrder([]);
  }, [query]);

  // 任何源从 loading → done(无论有无结果)都按顺序追加进 arrivalOrder
  useEffect(() => {
    for (const r of sourceResults) {
      if (!r.isLoading) {
        setArrivalOrder((prev) =>
          prev.includes(r.source) ? prev : [...prev, r.source]
        );
      }
    }
  }, [sourceResults]);

  // 按 arrival 顺序拼 papers;还没到的源不显示
  return useMemo(() => {
    const out: Paper[] = [];
    for (const src of arrivalOrder) {
      const r = sourceResults.find((x) => x.source === src);
      if (r) out.push(...r.papers);
    }
    return out;
  }, [arrivalOrder, sourceResults]);
}
