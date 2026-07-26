import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { RouteSEO } from '@/shared/components/RouteSEO';
import { isValidAppPath } from '@/shared/lib/route-validation';

/**
 * 兜底 404 —— 用户访问的路径没匹配到任何 feature 路由(或被 React Router
 * 错误边界捕到)时渲染。
 *
 * 自愈策略(避免发版后假 404):
 *   - 路径**通过白名单**(看起来像真实路由,例如 `/search`)→ 大概率是发版后旧 HTML
 *     引用了已下线的 chunk hash,异步导入跪 → errorElement 弹到这里。
 *     自动 `location.reload()` 一次拉新 HTML;新 HTML 里的 chunk hash 正确,
 *     React Router 能正常渲染目标页。期间显示一个 spinner,不闪 404 文案。
 *   - 路径**不通过白名单**(真正不存在,例如 `/junk123`)→ 直接显示 404 UI,
 *     避免对真假 404 都浪费一次刷新。
 *   - sessionStorage 守卫按 pathname 记账:同一个路径只兜一次,即使刷新后还跪
 *     也不进入无限循环。
 *
 * 双保险:`main.tsx` 已挂 `vite:preloadError`,90% 场景在 React 渲染之前就被拦下并
 *   reload。这里是 fallback —— 兼容 Vite 没派发事件 / 老 HTML 里没有那段监听器
 *   (上一次部署之前的 tab)等边缘情况。
 */
export function NotFoundPage() {
  const location = useLocation();
  const requested = location.pathname + location.search;

  const pathLooksValid = isValidAppPath(location.pathname);
  const reloadKey = `scholay.notfound-reloaded:${location.pathname}`;
  const alreadyReloaded =
    typeof sessionStorage !== 'undefined' &&
    sessionStorage.getItem(reloadKey) === '1';
  const shouldAttemptReload = pathLooksValid && !alreadyReloaded;

  useEffect(() => {
    if (!shouldAttemptReload) return;
    sessionStorage.setItem(reloadKey, '1');
    // 留半帧让 spinner 上屏,避免 reload 太快感觉是闪屏 bug
    const id = window.setTimeout(() => window.location.reload(), 50);
    return () => window.clearTimeout(id);
  }, [shouldAttemptReload, reloadKey]);

  // 自愈尝试中 —— 不闪 404 文案,只给一个 spinner,reload 后即页面正常
  if (shouldAttemptReload) {
    return (
      <div className="flex h-full min-h-screen items-center justify-center">
        <Loader2 className="size-5 animate-spin text-faint" />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-screen flex-col items-center justify-center gap-4 text-center px-6">
      {/* 真 404:noindex 防止被搜索引擎当正文收录(SPA 客户端渲染的 404) */}
      <RouteSEO title="404 页面不存在 - Scholay学术" description="抱歉,你访问的页面不存在。" noindex />
      <p className="text-12 uppercase text-faint">404</p>
      <h1 className="text-24 font-medium">页面不存在</h1>
      <p className="max-w-md text-12 text-muted-foreground">
        你访问的链接{' '}
        <code className="px-1.5 py-0.5 mx-0.5 rounded-4 bg-surface-2 text-foreground font-mono text-12">
          {requested}
        </code>{' '}
        可能已被移除、迁移,或从未存在。
      </p>
      <div className="mt-2 flex items-center gap-2">
        <Button asChild variant="default" size="sm">
          <Link to="/">返回首页</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to="/help">访问帮助中心</Link>
        </Button>
      </div>
    </div>
  );
}
