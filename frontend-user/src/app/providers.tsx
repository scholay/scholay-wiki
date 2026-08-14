import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import { ConfirmDialogRoot } from '@/shared/components';
import { BodyPointerLockGuard } from '@/shared/components/BodyPointerLockGuard';
import { QuotaNotifierGate } from '@/shared/components/QuotaNotifierGate';
import { PromoModalGate } from '@/shared/components/PromoModalGate';
// 全局 feed 预取/水合:任意入口进入即准备好移动端论文/期刊流数据(仅手机生效)。
// 需全站唯一挂载点而无根布局,故在此引入 mobile feature 的预取器(刻意的全局编排例外)。
import { FeedPrefetcher } from '@/features/mobile/components/FeedPrefetcher';
import { useCollectPicker } from '@/stores/collect-picker.store';
import {
  DEFAULT_GC_TIME,
  DEFAULT_REFETCH_ON_WINDOW_FOCUS,
  DEFAULT_RETRY,
  DEFAULT_STALE_TIME,
} from '@/shared/lib/query-config';
import { MOCK_MODE } from '@/mocks/config';
import { MockControlPanel } from '@/mocks/MockControlPanel';

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

// 「收藏到文献集」选择器懒加载 —— 它(经 MobileBottomSheet / LazyMotion)是首屏**唯一**把
// framer-motion(~42KB gz)拉进关键路径的 eager 组件。改成「仅当用户真正点收藏(store 有 request)
// 时才加载」,framer + 该弹窗代码即移出首屏。代价:关闭时直接卸载(无退场动画),可接受。
const CollectFolderPicker = lazy(() =>
  import('@/features/library/components/CollectFolderPicker').then((m) => ({
    default: m.CollectFolderPicker,
  }))
);

function CollectFolderPickerGate() {
  const requested = useCollectPicker((s) => !!s.request);
  // 首次出现 collect request 才懒加载该 chunk(framer 移出首屏);之后**保持挂载** —— 关闭只让
  // CollectFolderPicker 内部 Dialog 的 open 翻 false,由 Radix 正常收尾(还原它在 body 上挂的
  // pointer-events 锁)。绝不在「Dialog 还 open」时把子树 unmount:那是全站点击失灵的根因
  // (见 BodyPointerLockGuard 注释)。组件每次打开会自重置内部选择态,常驻挂载无副作用。
  const [everRequested, setEverRequested] = useState(false);
  useEffect(() => {
    if (requested) setEverRequested(true);
  }, [requested]);
  if (!everRequested) return null;
  return (
    <Suspense fallback={null}>
      <CollectFolderPicker />
    </Suspense>
  );
}

// 小程序 web-view 内嵌页(/mp/*):纯展示上下文(图表查看等),营销弹窗/额度通知/
// feed 预取全部豁免 —— 匿名 webview 里弹「限时领会员」会直接盖住内容。
const isEmbedPage = typeof window !== 'undefined' && window.location.pathname.startsWith('/mp/');

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={150}>
        {/* 全局兜底:清除 Radix 遗留在 body 上的 pointer-events:none(全站点击失灵元凶,见组件注释) */}
        <BodyPointerLockGuard />
        {!isEmbedPage && <FeedPrefetcher />}
        {children}
        <Toaster position="top-right" richColors closeButton />
        {/* 全局命令式确认 dialog 渲染槽 —— 任意位置 useConfirm() 都能弹 */}
        <ConfirmDialogRoot />
        {/* 全局额度通知器:6010 → 重置弹窗;用量过半/将尽 → toastr */}
        {!isEmbedPage && <QuotaNotifierGate />}
        {/* 限时领取会员推广弹窗:首屏自动 / 额度用尽 / 导航按钮触发(开关关闭时不渲染) */}
        {!isEmbedPage && <PromoModalGate />}
        {/* 全局「收藏到文献集」选择器(任意收藏按钮 openCollect 触发)——
            懒加载:仅在 store 有 collect request 时才拉取该 chunk(连带 framer 移出首屏)。 */}
        <CollectFolderPickerGate />
        {MOCK_MODE && !isEmbedPage && <MockControlPanel />}
      </TooltipProvider>
    </QueryClientProvider>
  );
}
