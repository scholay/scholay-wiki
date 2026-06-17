import { useEffect, useState } from 'react';
import { Link, useRouteError, isRouteErrorResponse } from 'react-router-dom';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { NotFoundPage } from '@/features/home/NotFoundPage';
import { isChunkLoadError, tryReloadForStaleChunk } from '@/shared/lib/stale-chunk';

/**
 * 路由级错误兜底 —— createBrowserRouter 各根节点的 errorElement。
 *
 * **关键区分**:能走到 errorElement,说明某个路由**已经匹配**、只是在加载/渲染时抛了错
 * —— 这**永远不是**「路由不存在」。真正的 404(路径压根没匹配到任何路由)走的是
 * `{ path: '*', element: <NotFoundPage/> }`,不经过这里。所以本组件**绝不**再渲染
 * 「页面不存在」假 404(这是之前 /journals/search 报假 404 的根因)。
 *
 * 两类处理:
 *   1) loader/路由抛 4xx Response(真·资源不存在)→ NotFoundPage(合法 404 来源)。
 *   2) 已匹配路由加载/渲染抛错 → 发版后最常见是 stale chunk(动态 import 旧 hash 404)。
 *      不论报错文案是否被 isChunkLoadError 命中,都先尝试一次(30s 冷却内仅一次)
 *      自愈刷新拉新版本;刷新后仍失败才展示「加载失败 + 刷新重试」兜底,而不是假 404,
 *      也不让用户去手动硬刷新。
 *
 * 与 main.tsx 的 `vite:preloadError` 监听共用同一个冷却时间戳,两边不会互相打架。
 */
export function RouteErrorBoundary() {
  const error = useRouteError();

  // 真·资源不存在(后端/路由 loader 抛 4xx)→ 交给 404 页。
  if (isRouteErrorResponse(error) && error.status === 404) {
    return <NotFoundPage />;
  }

  return <RouteErrorRecovery error={error} />;
}

function RouteErrorRecovery({ error }: { error: unknown }) {
  const chunkErr = isChunkLoadError(error);
  // null = 还没决定(首帧,先显示占位避免闪报错)
  // true = 已触发刷新(页面即将跳走,继续显示占位)
  // false = 冷却拦截/开发环境非 chunk 错(刚刷过仍失败)→ 展示真实兜底,不再无限刷新
  const [reloadPending, setReloadPending] = useState<boolean | null>(null);

  useEffect(() => {
    // 只对「stale chunk(动态 import 旧分包失败)」自愈刷新 —— 那是发版/部署造成的,刷新能治。
    // 其它错误(渲染异常 / 接口异常导致组件抛错)刷新治不好:直接展示「加载失败 + 刷新重试」,
    // 既不掩盖真 bug,也不会因为「自动刷新 + 30s 冷却」让正常跳转里偶发的错误卡成 30 秒。
    if (chunkErr) {
      setReloadPending(tryReloadForStaleChunk());
    } else {
      setReloadPending(false);
    }
  }, [chunkErr]);

  if (reloadPending === null || reloadPending) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="size-5 animate-spin text-faint" />
        正在更新到最新版本…
      </div>
    );
  }

  // 刷新后仍失败 → 真实错误兜底(不是假 404),给一键刷新 + 返回首页。
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <AlertTriangle className="size-8 text-brand-amber" strokeWidth={1.5} />
      <h1 className="text-2xl font-semibold text-foreground">页面加载失败</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        {chunkErr
          ? '可能是刚刚发布了新版本。点击刷新即可加载最新内容。'
          : '页面在加载时出了点问题,刷新通常能解决。'}
      </p>
      <div className="mt-2 flex items-center gap-2">
        <Button size="sm" onClick={() => window.location.reload()}>
          <RefreshCw className="mr-1.5 size-3.5" strokeWidth={2.5} />
          刷新重试
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to="/">返回首页</Link>
        </Button>
      </div>
    </div>
  );
}
