import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import { ConfirmDialogRoot } from '@/shared/components';
import { QuotaNotifier } from '@/shared/components/QuotaNotifier';
import { PromoModal } from '@/shared/components/PromoModal';
// 全局 feed 预取/水合:任意入口进入即准备好移动端论文/期刊流数据(仅手机生效)。
// 需全站唯一挂载点而无根布局,故在此引入 mobile feature 的预取器(刻意的全局编排例外)。
import { FeedPrefetcher } from '@/features/mobile/components/FeedPrefetcher';
// 全局「收藏到文献集」文件夹选择器:收藏按钮散落各处,用全局 store + 这一份挂载承接(同 FeedPrefetcher 例外)。
import { CollectFolderPicker } from '@/features/library/components/CollectFolderPicker';
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
        <FeedPrefetcher />
        {children}
        <Toaster position="top-right" richColors closeButton />
        {/* 全局命令式确认 dialog 渲染槽 —— 任意位置 useConfirm() 都能弹 */}
        <ConfirmDialogRoot />
        {/* 全局额度通知器:6010 → 重置弹窗;用量过半/将尽 → toastr */}
        <QuotaNotifier />
        {/* 限时领取会员推广弹窗:首屏自动 / 额度用尽 / 导航按钮触发(开关关闭时不渲染) */}
        <PromoModal />
        {/* 全局「收藏到文献集」选择器(任意收藏按钮 openCollect 触发) */}
        <CollectFolderPicker />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
