import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import { ConfirmDialogRoot } from '@/shared/components';
import { QuotaNotifier } from '@/shared/components/QuotaNotifier';
import {
  DEFAULT_GC_TIME,
  DEFAULT_REFETCH_ON_WINDOW_FOCUS,
  DEFAULT_RETRY,
  DEFAULT_STALE_TIME,
} from '@/shared/lib/query-config';

/**
 * React 19 原生支持把 <title>/<meta>/<link> 渲染到 <head>,
 * 不再需要 react-helmet-async,直接在页面组件里写即可。
 *
 * Query 默认值从 shared/lib/query-config 引,所有 feature 想覆盖个别 query
 * 直接在 useQuery 选项里传 staleTime / gcTime 等,避免散落硬编码。
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: DEFAULT_STALE_TIME,
      gcTime: DEFAULT_GC_TIME,
      retry: DEFAULT_RETRY,
      refetchOnWindowFocus: DEFAULT_REFETCH_ON_WINDOW_FOCUS,
    },
  },
});

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={150}>
        {children}
        <Toaster position="top-right" richColors closeButton />
        {/* 全局命令式确认 dialog 渲染槽 —— 任意位置 useConfirm() 都能弹 */}
        <ConfirmDialogRoot />
        {/* 全局额度通知器:6010 → 重置弹窗;用量过半/将尽 → toastr */}
        <QuotaNotifier />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
