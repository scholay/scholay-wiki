import { useEffect, useRef, lazy, Suspense } from 'react';
import { RouterProvider } from 'react-router-dom';
import { Providers } from './providers';
import { router } from './router';
import { AuthBootstrap } from './AuthBootstrap';
import { UserActivityReporter } from './UserActivityReporter';
import { useAuthDialog } from '@/stores/auth-dialog.store';
import { usePromoStore } from '@/stores/promo.store';
import { useCollectPicker } from '@/stores/collect-picker.store';
import { useShareSheet } from '@/stores/share.store';

// 诊断:把 data router 挂到 window,卡住时可在控制台读 `__appRouter.state.location.pathname`
// (RR 已提交的路由)/ `.state.navigation.state`(idle/loading)与地址栏对比。配合 RouteCommitWatchdog。
if (typeof window !== 'undefined') {
  (window as unknown as { __appRouter?: typeof router }).__appRouter = router;
}

/**
 * 导航即关闭所有「挂在 router 之上、store 驱动」的全局浮层(登录 / 推广 / 额度重置 / 收藏选择器 / 分享)。
 *
 * 这是 click-dead 根因 (b) 的**结构性修复**:这些 modal 的开关态原本放在 router 之上的 zustand,
 * 跨路由切换持久存活 —— 于是「store 仍说 open」与「子树被卸」能同帧分叉,把 Radix 的 body
 * pointer-events 锁卡死(详见 BodyPointerLockGuard)。让开关态不再跨越导航后,即便将来某处又
 * 写出「Dialog 还 open 就 unmount」,modal 也不会带着 open 跨越那一次路由切换 → 反模式失去触发土壤。
 *
 *   - 用 `router.subscribe`(返回 unsubscribe)在 App 顶层订阅,无需身处路由子树;
 *   - 只比较 pathname(忽略 search / hash):保留 library 工作台 `?manage=` 这类**同页深链**不被误关;
 *   - **刻意排除 mobile-search 浮层** —— 它 `suspendForDetail` 进详情要保 open、回 feed 再复原,
 *     是有意的跨路由保留,不能在这里清。
 *   - **刻意排除额度重置弹窗(useQuotaStore.resetOpen)** —— 它挂在 Providers 层、永不随路由卸载
 *     (无 Radix 锁泄漏风险),且 6010 常在流式/后台请求里迟到:导航瞬间弹出的额度弹窗被这里
 *     秒关 = 用户根本没看见就没了。弹窗内自己的跳转(充值/升级)会先显式 closeReset 再 navigate。
 */
function useCloseGlobalModalsOnNavigate() {
  useEffect(() => {
    let lastPath = router.state.location.pathname;
    return router.subscribe((state) => {
      const path = state.location.pathname;
      if (path === lastPath) return;
      lastPath = path;
      // ⚠️ 绝不在 router.subscribe 的**同步**通知里触发 setState —— 那会在 RR v7 的导航
      // transition 进行中插入一个同步(高优)更新,可能打断/重启该 transition(切路由后页面卡
      // 在旧路由的疑点之一,见 RouteCommitWatchdog 诊断)。延到 microtask,且仅在**真打开**时才关。
      queueMicrotask(() => {
        const ad = useAuthDialog.getState();
        if (ad.open) ad.close();
        const pm = usePromoStore.getState();
        if (pm.open) pm.closePromo();
        // 额度重置弹窗豁免(见上方 docstring)—— 这里刻意不 closeReset。
        const cp = useCollectPicker.getState();
        if (cp.request) cp.closeCollect();
        const ss = useShareSheet.getState();
        if (ss.target) ss.closeShare();
      });
    });
  }, []);
}

/**
 * 支付收银台回程:跳支付宝前(QuotaNotifier 等)把当前 location.pathname+search 写进
 * localStorage 'scholay:pay-return-path';支付宝回跳落回站点任意页后,这里启动时读到
 * 就 navigate 回去并**立即清除**(一次性锚点,防止陈旧值在下次访问把用户传送走)。
 * 只接受站内相对路径(拒绝 `//host` 协议相对形态,防开放跳转)。
 */
const PAY_RETURN_KEY = 'scholay:pay-return-path';
function usePayReturnPath() {
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(PAY_RETURN_KEY);
      if (saved !== null) localStorage.removeItem(PAY_RETURN_KEY);
    } catch {
      return; // 隐私模式等 localStorage 不可用:无回程锚点,正常启动
    }
    if (!saved || !saved.startsWith('/') || saved.startsWith('//')) return;
    if (saved === window.location.pathname + window.location.search) return;
    void router.navigate(saved, { replace: true });
  }, []);
}

// 注:暗色态已于 2026-07 移除 —— 切换机制曾完整存在(useApplyTheme 在此调用),
// 但 setTheme 全站零调用点、设置页无任何主题 UI,`.dark` 类从未被挂上,
// globals.css 的 18 个暗色覆写从未生效。连同 stores/theme.store.ts 一并删除。
// 将来要做暗色态: 玄墨 12 档色阶可与亮色互为镜像,基于新色阶重新推导。
function ShellRoot() {
  useCloseGlobalModalsOnNavigate();
  usePayReturnPath();
  return (
    <>
      <AuthBootstrap />
      <UserActivityReporter />
      {/*
        useTransitions={false} —— 根因修复:RR v7 默认把导航的 state 提交包在 React 19 低优
        `startTransition` 里(react-router 源码 chunk RouterProvider:`useTransitions===false ?
        setStateImpl(...) : startTransition(...)`)。智能助手等挂着 WebSocket 的长会话页会持续发
        高优 `setState`,把低优的导航 transition **饿死**——history 变了但 React 始终没提交渲染
        (现象:切菜单地址栏变了、页面卡旧路由、navigation.state 还是 idle、控制台不报错、需刷新;
        诊断快照见 RouteCommitWatchdog/后端 route-commit-desync 日志:routerCommitted 已到新路由、
        reactRendered 仍是旧的)。改成同步提交(urgent)后导航不再被饿死,从根上消除。
        本项目路由层无 render-suspense(用 RR `lazy:` 在导航阶段加载 + 普通 useQuery,非 Suspense),
        故关掉过渡无副作用。RouteCommitWatchdog 保留作安全网 + 回归探针(理论上此后永不触发)。
      */}
      <RouterProvider router={router} useTransitions={false} />
      {/* 全局鉴权弹窗 — 任何位置通过 useAuthDialog.openDialog 触发。懒加载(性能审计 #2):AuthDialog 全家桶
          (zod+react-hook-form+turnstile+微信扫码 ~105KB)此前 eager 常驻入口 chunk。改成首次打开才拉,
          之后保持挂载(内部本靠 store.open 控制 Radix Dialog 开合,常驻无副作用)。 */}
      <AuthDialogGate />
    </>
  );
}

const AuthDialog = lazy(() => import('@/features/auth').then((m) => ({ default: m.AuthDialog })));

function AuthDialogGate() {
  const open = useAuthDialog((s) => s.open);
  const everOpened = useRef(false);
  if (open) everOpened.current = true;
  if (!everOpened.current) return null; // 从未打开过 → 不加载 AuthDialog chunk
  return (
    <Suspense fallback={null}>
      <AuthDialog />
    </Suspense>
  );
}

export function App() {
  return (
    <Providers>
      <ShellRoot />
    </Providers>
  );
}
