import { useEffect } from 'react';
import { Link, Outlet, useMatches } from 'react-router-dom';
import { PanelLeft } from 'lucide-react';
import { SidebarLayout } from '@/shared/components/sidebar';
import { ErrorBoundary } from '@/shared/components/ErrorBoundary';
import { BrandLogo } from '@/shared/components/BrandLogo';
import { IconButton } from '@/shared/components/IconButton';
import { useIsAuthenticated } from '@/stores/auth.store';
import { useSidebar } from '@/stores/sidebar.store';
import { AdminSidebar } from '../components/AdminSidebar';

/**
 * Admin 专用 shell —— 结构对齐用户端 AppShell:
 *   - 顶部 h-16 占位导航条:展开/收起 + Logo。
 *   - 左侧 AdminSidebar 在 TopBar 之下常驻(受 useSidebar 全局开合)。
 */
/** 取当前匹配路由的 `handle.title`(在 routes.tsx 集中维护) */
function useRouteTitle(): string | null {
  const matches = useMatches();
  for (let i = matches.length - 1; i >= 0; i--) {
    const handle = matches[i]?.handle as { title?: string } | undefined;
    if (handle?.title) return handle.title;
  }
  return null;
}

export function AdminShell() {
  const routeTitle = useRouteTitle();
  const docTitle = routeTitle
    ? `${routeTitle} · Scholay Admin`
    : 'Scholay Admin';

  const authed = useIsAuthenticated();
  const toggleSidebar = useSidebar((s) => s.toggle);
  useEffect(() => {
    if (!authed && typeof window !== 'undefined') window.location.assign('/');
  }, [authed]);

  return (
    <div className="flex h-screen min-h-0 flex-col bg-background text-foreground">
      <title>{docTitle}</title>

      <header className="h-16 shrink-0 flex items-center gap-2 px-6 border-b border-border bg-background sticky top-0 z-30">
        <IconButton
          aria-label="展开/收起侧栏"
          tooltip="展开/收起侧栏"
          onClick={toggleSidebar}
        >
          <PanelLeft />
        </IconButton>
        <Link to="/admin" className="inline-flex items-center" aria-label="返回后台首页">
          <BrandLogo size="sm" />
        </Link>
      </header>

      <div className="flex-1 min-h-0">
        <SidebarLayout sidebar={<AdminSidebar />}>
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </SidebarLayout>
      </div>
    </div>
  );
}
