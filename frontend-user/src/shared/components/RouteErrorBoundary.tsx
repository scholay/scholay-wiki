import { useEffect } from 'react';
import { useRouteError, isRouteErrorResponse } from 'react-router-dom';
import { NotFoundPage } from '@/features/home/NotFoundPage';
import { tryReloadForStaleChunk } from '@/shared/lib/stale-chunk';

/**
 * 路由级错误兜底 —— 用于 createBrowserRouter 各根节点的 errorElement。
 *
 * 主要解决两类:
 *   1) 真 404 (未匹配路径 / 后端 loader 抛 4xx) → 渲染 NotFoundPage
 *   2) **发版后 stale chunk** —— react-router 的 `lazy: () => import(...)` 拿
 *      不到新 hash 文件 → 抛 "Failed to fetch dynamically imported module"。
 *      Vite 的 vite:preloadError 是首选自愈通道(见 main.tsx), 但有时事件
 *      没在 react-router 报错前触发 / 被冷却拦了 / 是 css chunk 等场景,
 *      这里再做一次同样的"30 秒冷却 + reload"兜底。在 reload 触发前给
 *      用户一个温和的"正在更新到最新版本"占位, 而不是 react-router 的
 *      "Hey developer 👋" 默认报错页。
 *
 * 加 errorElement 的位置:
 *   - `/` AppShell 根 (本来就有, 改成挂这个组件)
 *   - `/admin` 根 (之前缺, 现在补上 —— 直接撞 react-router 默认错误页)
 */
function isChunkLoadError(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  return /failed to fetch dynamically imported module|loading (chunk|css chunk)|importing a module script/i.test(
    msg
  );
}

export function RouteErrorBoundary() {
  const error = useRouteError();
  const chunkErr = isChunkLoadError(error);

  // chunk 错误 → 走和 vite:preloadError 同款的 30 秒冷却 reload 路径
  useEffect(() => {
    if (chunkErr) {
      tryReloadForStaleChunk();
    }
  }, [chunkErr]);

  if (chunkErr) {
    // reload 触发前的过渡占位; 30 秒冷却被拦时也会停在这里(避免无限刷新)
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        正在更新到最新版本…
      </div>
    );
  }

  if (isRouteErrorResponse(error) && error.status === 404) {
    return <NotFoundPage />;
  }

  // 兜底:其他未知路由错误也用 NotFoundPage 显示, 避免暴露 react-router 开发者面板
  return <NotFoundPage />;
}
