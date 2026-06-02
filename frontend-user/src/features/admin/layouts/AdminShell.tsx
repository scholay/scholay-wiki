import { useEffect } from 'react';
import { Outlet, useMatches } from 'react-router-dom';
import { PanelLeft } from 'lucide-react';
import { SidebarLayout } from '@/shared/components/sidebar';
import { ErrorBoundary } from '@/shared/components/ErrorBoundary';
import { useSidebar } from '@/stores/sidebar.store';
import { useIsAuthenticated } from '@/stores/auth.store';
import { AdminSidebar } from '../components/AdminSidebar';

/**
 * Admin 专用 shell —— 不复用 AppShell:
 *   - 无顶部 menu carousel(admin 与 user-facing 心智完全不同)
 *   - 左侧 AdminSidebar 常驻
 *
 * 之前挂了 ⌘B 切栏 / ⌘K 命令面板的快捷键,目前快捷键交互设计未完成,
 * 整体下线 —— 包含 AdminCommandPalette 入口(没有其他唤起方式所以不再挂载),
 * 文件本身保留,后续要恢复直接重新引入 + 挂回 hotkey 即可。
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

  // Sidebar 折叠态独立"展开"按钮 —— AppShell 有 TopNav 自带 ☰,而 Admin 不挂
  // TopNav,折叠后 AdminSidebar 整个被 width=0 + overflow-hidden 隐藏,
  // 连内部的"展开"按钮一起锁住,用户无法把它点回来。这里在 AdminShell 层
  // 挂一个常驻的"折叠态展开"按钮:fixed 在左边缘,只有 !expanded 时显示。
  const expanded = useSidebar((s) => s.expanded);
  const toggleSidebar = useSidebar((s) => s.toggle);

  // 反应式兜底:token 一旦消失(本 tab 退出 / 跨 tab 登出 / 失效)立刻离开后台回首页。
  // adminGuard 只在导航时跑一次;停在 /admin 页时的跨 tab 登出不会触发 loader,靠这里收尾。
  // (被动 401 已由 AuthBootstrap 的 auth-evicted → window.location 处理;这里覆盖"无 401 的纯登出"。)
  const authed = useIsAuthenticated();
  useEffect(() => {
    if (!authed && typeof window !== 'undefined') window.location.assign('/');
  }, [authed]);

  return (
    <div className="flex h-screen min-h-0 flex-col bg-background text-foreground">
      <title>{docTitle}</title>
      <SidebarLayout sidebar={<AdminSidebar />}>
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </SidebarLayout>

      {!expanded && (
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label="展开侧栏"
          title="展开侧栏"
          className="fixed left-2 top-3 z-30 inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-subtle shadow-sm hover:bg-surface-1 hover:text-foreground transition-colors"
        >
          <PanelLeft className="size-4" strokeWidth={2} />
        </button>
      )}
      {/* ConfirmDialogRoot 已上移到 app/providers,全应用全局可用 */}
    </div>
  );
}
