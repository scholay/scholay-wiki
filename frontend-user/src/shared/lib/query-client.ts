/**
 * 全局唯一 QueryClient 实例 —— 从 app/providers.tsx 抽出成可 import 的单例。
 *
 * 抽出的动因(2026-08-12 审计):route loader 里做数据 prefetch(与 lazy chunk 并行,
 * 消掉 SEO 直达详情页「chunk→mount→fetch」三段串行)需要在 React 树外拿到 client;
 * loader 是模块级函数,useQueryClient() 够不着。
 *
 * 默认值仍从 query-config 收口;Providers 只负责把这同一个实例挂进 Provider。
 * ⚠️ 不要在这里之外 new QueryClient —— 双实例 = 双缓存,prefetch/invalidate 会互相看不见。
 */
import { QueryClient } from '@tanstack/react-query';
import {
  DEFAULT_GC_TIME,
  DEFAULT_REFETCH_ON_WINDOW_FOCUS,
  DEFAULT_RETRY,
  DEFAULT_STALE_TIME,
} from '@/shared/lib/query-config';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: DEFAULT_STALE_TIME,
      gcTime: DEFAULT_GC_TIME,
      retry: DEFAULT_RETRY,
      refetchOnWindowFocus: DEFAULT_REFETCH_ON_WINDOW_FOCUS,
    },
  },
});
