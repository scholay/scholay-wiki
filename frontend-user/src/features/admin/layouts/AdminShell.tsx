import { useEffect } from 'react';
import { Link, Outlet, useMatches } from 'react-router-dom';
import { PanelLeft } from 'lucide-react';
import { SidebarLayout } from '@/shared/components/sidebar';
import { ErrorBoundary } from '@/shared/components/ErrorBoundary';
import { IconButton } from '@/shared/components/IconButton';
import { BrandLogo } from '@/shared/components/BrandLogo';
import { useSidebar } from '@/stores/sidebar.store';
import { useIsAuthenticated } from '@/stores/auth.store';
import { AdminSidebar } from '../components/AdminSidebar';

/**
 * Admin 专用 shell —— 结构对齐用户端 AppShell:
 *   - 顶部一条 h-16 占位导航条(TopBar):**不放菜单**,只承载「展开/收起侧栏」☰ 按钮,
 *     让后台侧栏开合与用户端 TopNav 的 ☰ 交互完全一致(按钮恒在左上角同一位置/样式)。
 *   - 左侧 AdminSidebar 在 TopBar 之下常驻(受 useSidebar 全局开合)。
 *
 * 历史:之前无顶栏,侧栏折叠后整条被 width=0 隐藏、连内部展开按钮一起锁死,只能在左边缘
 * 挂一个悬浮 fixed 按钮兜底 —— 与用户端不一致、也遮挡内容。现改为顶栏常驻 ☰,悬浮按钮下线。
 *
 * ⌘B / ⌘K 快捷键(含 AdminCommandPalette)此前已下线,后续要恢复重新挂 hotkey 即可。
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
  // React 19 原生 <title> 标签会被自动 hoist 到 <head>;
  // 路由变化自动重渲 → 标题随路由更新,无需 effect 调 document.title
  const routeTitle = useRouteTitle();
  const docTitle = routeTitle
    ? `${routeTitle} · Scholay Admin`
    : 'Scholay Admin';

  // 顶栏 ☰ —— 与用户端一致:hasPanel 决定可否切换(后台恒有侧栏面板 → 恒可用)。
  const hasPanel = useSidebar((s) => s.hasPanel);
  const toggleSidebar = useSidebar((s) => s.toggle);

  // 反应式兜底:token 一旦消失(本 tab 退出 / 跨 tab 登出 / 失效)立刻离开后台回首页。
  // adminGuard 只在导航时跑一次;停在 /admin 页时的跨 tab 登出不会触发 loader,靠这里收尾。
  // (被动 401 已由 AuthBootstrap 的 auth-evicted → window.location 处理;这里覆盖"无 401 的纯登出"。)
  const authed = useIsAuthenticated();
  useEffect(() => {
    if (!authed && typeof window !== 'undefined') window.location.assign('/');
  }, [authed]);

  return (
    // h-dvh 不是 h-screen —— 后者是裸 100vh,移动端地址栏收起/展开时底部会被截(项目铁律:视口高度用 dvh)。
    <div className="flex h-dvh min-h-0 flex-col bg-background text-foreground">
      <title>{docTitle}</title>

      {/* 顶部占位导航条 —— 对齐用户端 TopNav 的左上角 [☰][Logo];右侧刻意留白(后台不挂菜单/用户区)。 */}
      <header className="h-16 shrink-0 flex items-center gap-2 px-6 border-b border-border bg-background sticky top-0 z-nav">
        <IconButton
          aria-label="展开/收起侧栏"
          tooltip="展开/收起侧栏"
          disabled={!hasPanel}
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
      {/* ConfirmDialogRoot 已上移到 app/providers,全应用全局可用 */}
    </div>
  );
}
