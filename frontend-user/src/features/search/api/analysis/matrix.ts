import { useCallback, useEffect, useMemo } from 'react';
import { useQueries, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { STALE_COOL } from '@/shared/lib/query-config';
import { QUOTA_RECOVERED_EVENT } from '@/shared/lib/quota-events';
import { useAuthStore } from '@/stores/auth.store';
import type { Paper } from '@/shared/api/types';
import { batchLoad } from './paperBatcher';

/**
 * 暂存区论文的矩阵分析 —— **每篇论文一个 react-query**,缓存键
 * `['analysis', 'paper', paperId]`。
 *
 *   新增 1 篇论文 → 只有这一篇的 query 触发,其它行从缓存里直接读,**不闪烁不重算**
 *   维度变化   → dimensions.ts 的 mutation 调 removeQueries(['analysis','paper']),
 *                所有 per-paper 缓存被清,所有 query 同时进入 pending,
 *                paperBatcher 把它们合并成 ceil(N/10) 个批量 HTTP
 *
 * 网络层合并由 [[paperBatcher]] 完成(microtask 聚合 ≤10/批),
 * 上层组件用 `loadingByPaperId.get(paperId)` 拿单行 loading 态,不再整张表 skeleton。
 */

const MAX_PAPERS = 100;

/** per-paper 分析缓存的 queryKey 前缀 —— 与下方 useQueries 的 ['analysis','paper',id] 保持一致。 */
const ANALYSIS_PAPER_PREFIX = ['analysis', 'paper'] as const;

export interface PaperAnalysisItem {
  paperId: string;
  success: boolean;
  data?: Record<string, string>;
  dimensions?: { key: string; name: string; value: string }[];
  from_cache: boolean;
  error?: string;
}

export interface MatrixAnalysisResult {
  /** 已就绪 + skipped 占位的混合列表;还在 fetch 的 paper 不会出现在这里 */
  data: PaperAnalysisItem[];
  /** paperId → 是否在 fetching(包括首次 load 和 refetch),给单行 skeleton 用 */
  loadingByPaperId: Map<string, boolean>;
  /** 任意行首次加载中 —— 适合表格整体 placeholder */
  isLoading: boolean;
  /** 任意行 fetching —— 适合右上角小转圈 */
  isFetching: boolean;
  error?: Error;
  /** 只重跑**失败态**的分析行(额度恢复后的手动「重试」);成功缓存原样保留,不闪不重算。 */
  retryFailed: () => void;
}

/** 失效所有 error 态的 per-paper 分析 query(成功缓存不动)。active 的会立即重新 fetch。 */
function invalidateFailedAnalysis(qc: QueryClient) {
  void qc.invalidateQueries({
    queryKey: ANALYSIS_PAPER_PREFIX,
    predicate: (q) => q.state.status === 'error',
  });
}

export function useMatrixAnalysis(papers: Paper[]): MatrixAnalysisResult {
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();

  // 额度恢复(重置次数 / 升级套餐 / 开「用经费继续」→ QuotaNotifier 广播 QUOTA_RECOVERED_EVENT)
  // → 自动把此前因 6010 等失败的分析行标失效重跑;成功行的缓存不受影响。
  useEffect(() => {
    const onRecovered = () => invalidateFailedAnalysis(qc);
    window.addEventListener(QUOTA_RECOVERED_EVENT, onRecovered);
    return () => window.removeEventListener(QUOTA_RECOVERED_EVENT, onRecovered);
  }, [qc]);

  const retryFailed = useCallback(() => invalidateFailedAnalysis(qc), [qc]);

  const { usable, skipped } = useMemo(() => {
    const usable: Paper[] = [];
    const skipped: Paper[] = [];
    for (const p of papers) {
      if ((p.abstract ?? '').trim().length > 0) usable.push(p);
      else skipped.push(p);
    }
    return { usable: usable.slice(0, MAX_PAPERS), skipped };
  }, [papers]);

  const queries = useQueries({
    queries: usable.map((p) => ({
      queryKey: ['analysis', 'paper', p.paperId] as const,
      enabled: !!token,
      staleTime: STALE_COOL,
      queryFn: () =>
        batchLoad({
          paperId: p.paperId,
          title: p.title,
          abstract: (p.abstract ?? '').slice(0, 5000),
        }),
    })),
  });

  return useMemo(() => {
    const data: PaperAnalysisItem[] = [];
    const loadingByPaperId = new Map<string, boolean>();

    queries.forEach((q, i) => {
      const p = usable[i];
      loadingByPaperId.set(p.paperId, q.isFetching);
      if (q.data) data.push(q.data);
    });
    for (const p of skipped) {
      data.push({
        paperId: p.paperId,
        success: false,
        from_cache: false,
        error: '无摘要,无法分析',
      });
      loadingByPaperId.set(p.paperId, false);
    }

    const firstErr = queries.find((q) => q.error)?.error as Error | undefined;
    return {
      data,
      loadingByPaperId,
      isLoading: queries.some((q) => q.isLoading),
      isFetching: queries.some((q) => q.isFetching),
      error: firstErr,
      retryFailed,
    };
  }, [queries, usable, skipped, retryFailed]);
}
