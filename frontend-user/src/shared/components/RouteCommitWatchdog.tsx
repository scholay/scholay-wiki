import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { reportClientError } from '@/shared/lib/client-error-reporter';

/**
 * 兜底 + 诊断:「切菜单后地址栏变了、但页面卡在旧路由(需手动刷新)」这个偶发 bug。
 *
 * 根因(诊断结论):RR v7 把导航包在 React 19 的低优 `startTransition` 里;智能助手等页挂着
 * WebSocket,长时间停留后会周期性 `setState`(重连/状态变化,高优)。会话越长,旧树重渲染越贵,
 * 低优的导航 transition 越容易被高优更新反复打断、迟迟提交不上 → history 变了、画面没换、
 * `navigation.state` 却是 idle、控制台还不报错。`renderedRef` 只在 React **真的提交**渲染时才更新,
 * 所以「地址栏 ≠ renderedRef」持续成立即可判定卡死。
 *
 * 本组件三件事:
 *   1. 抓现行:第一次发现就把快照打到 console + 后端 docker logs(grep route-commit-desync),
 *      含 reactRendered / routerCommitted / navigationState / pendingResources,用于定位根因。
 *   2. 软自愈(~3s):重新派发一次当前路由的导航。此时高优更新的爆发多半已过,transition 能提交,
 *      用户无感恢复、不刷新、不丢状态。
 *   3. 硬自愈(~6s):软的没成 → 强制刷新到目标页(用户本就要去那)。带 20s 冷却防循环。
 *
 * 正常导航在 <100ms 内提交,renderedRef 立刻追平,这里永不触发;只有真卡死才动作。根因彻底修掉后可删。
 */
const SOFT_RECOVER_MS = 3000;
const HARD_RECOVER_MS = 6000;
const RELOAD_COOLDOWN_MS = 20000;

type AppRouter = {
  state?: {
    location?: { pathname?: string };
    navigation?: { state?: string; location?: { pathname?: string } };
  };
  navigate?: (to: string, opts?: { replace?: boolean }) => void;
  revalidate?: () => void;
};
const getRouter = () =>
  (window as unknown as { __appRouter?: AppRouter }).__appRouter;

export function RouteCommitWatchdog() {
  const location = useLocation();
  // 每次 render 同步写入 —— 只有 React 真的提交了这次渲染,renderedRef 才会更新。
  const renderedRef = useRef(location.pathname);
  renderedRef.current = location.pathname;

  const reportedRef = useRef('');
  const softTriedRef = useRef('');
  const desyncSinceRef = useRef(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      const addressBar = window.location.pathname;
      if (addressBar === renderedRef.current) {
        desyncSinceRef.current = 0;
        reportedRef.current = '';
        softTriedRef.current = '';
        return;
      }

      const now = Date.now();
      if (desyncSinceRef.current === 0) desyncSinceRef.current = now;
      const elapsed = now - desyncSinceRef.current;

      // ① 抓现行:每段 desync 只上报一次。
      if (reportedRef.current !== addressBar) {
        reportedRef.current = addressBar;
        const r = getRouter();
        const snapshot = {
          addressBar,
          reactRendered: renderedRef.current,
          routerCommitted: r?.state?.location?.pathname ?? '(no router)',
          navigationState: r?.state?.navigation?.state ?? '(unknown)',
          bodyPointerEvents: document.body.style.pointerEvents || '(unset)',
          pendingResources: performance
            .getEntriesByType('resource')
            .filter((e) => (e as PerformanceResourceTiming).responseEnd === 0)
            .map((e) => e.name)
            .slice(-8),
        };
        console.error('[route-commit-desync] 地址栏已变但页面卡在旧路由:', snapshot);
        reportClientError({
          source: 'manual',
          message: '[route-commit-desync] ' + JSON.stringify(snapshot),
          stack: new Error('route-commit-desync').stack ?? '',
        });
      }

      // ② 软自愈:强制 RR 重新派发状态(revalidate 不会像 navigate(同路径) 那样被短路),
      // 逼 React 把「已正确但没提交」的路由渲染出来。非破坏、不丢状态。
      if (elapsed >= SOFT_RECOVER_MS && softTriedRef.current !== addressBar) {
        softTriedRef.current = addressBar;
        console.warn('[route-commit-desync] 软自愈:router.revalidate() 强制重渲 →', addressBar);
        getRouter()?.revalidate?.();
      }

      // ③ 硬自愈:软的没成 → 强制刷新到目标页,带冷却防循环。
      if (elapsed >= HARD_RECOVER_MS) {
        const last = Number(sessionStorage.getItem('rcw:lastReload') || '0');
        if (now - last > RELOAD_COOLDOWN_MS) {
          sessionStorage.setItem('rcw:lastReload', String(now));
          console.warn('[route-commit-desync] 硬自愈:强制刷新到目标页');
          window.location.reload();
        }
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  return null;
}
