import { type ReactNode, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useSidebar } from '@/stores/sidebar.store';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { cn } from '@/shared/lib/utils';

/** 展开宽 —— .pen 全站 sidebar 统一口径。 */
export const SIDEBAR_EXPANDED_PX = 240;

interface SidebarLayoutProps {
  /** 完整 sidebar 组件 — 展开时渲染在主区左侧 */
  sidebar: ReactNode;
  /** 主区内容 */
  children: ReactNode;
  /** sidebar 展开宽度,默认 240 */
  width?: number;
  className?: string;
}

/**
 * Feature 页面专用布局壳 — 把"侧栏 + 主区"拼装在一起,受 useSidebar 全局开合控制。
 *
 * **响应式**:
 *   - 桌面(≥640px):侧栏 inline,宽度 0↔240 CSS 过渡「推挤」主区。
 *     只有完全展开 / 完全收起,不再收成图标窄轨。
 *   - 移动(<640px):侧栏改成覆盖式抽屉(收起完全藏起),不挤压窄屏主区。
 *
 * 侧栏始终挂载(内部选中项跨折叠保留);内层固定展开宽度,收起时裁切而不是重排。
 * 展开入口在顶栏 Logo 左侧,这里不再挂浮动按钮。
 */
export function SidebarLayout({
  sidebar,
  children,
  width = SIDEBAR_EXPANDED_PX,
  className,
}: SidebarLayoutProps) {
  const expanded = useSidebar((s) => s.expanded);
  const isMobile = useMediaQuery('(max-width: 639px)');
  const { pathname } = useLocation();

  useEffect(() => {
    useSidebar.getState().setHasPanel(true);
    return () => useSidebar.getState().setHasPanel(false);
  }, []);

  // 移动抽屉:切换路由后自动收起,避免抽屉盖住刚进的页面。
  useEffect(() => {
    if (isMobile) useSidebar.getState().setExpanded(false);
  }, [pathname, isMobile]);

  const inner = (
    <div style={{ width, minWidth: width }} className="h-full">
      {sidebar}
    </div>
  );

  if (isMobile) {
    return (
      <div className={cn('relative flex h-full min-h-0', className)}>
        {expanded && (
          <div
            className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-[1px]"
            aria-hidden
            onClick={() => useSidebar.getState().setExpanded(false)}
          />
        )}
        <aside
          style={{ width }}
          className={cn(
            'fixed inset-y-0 left-0 z-50 h-full overflow-hidden border-r border-border bg-background transition-transform duration-200 ease-in-out',
            expanded ? 'translate-x-0' : '-translate-x-full',
          )}
          aria-hidden={!expanded}
          inert={!expanded}
        >
          {inner}
        </aside>
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto">{children}</main>
      </div>
    );
  }

  return (
    <div className={cn('relative flex h-full min-h-0', className)}>
      <aside
        style={{ width: expanded ? width : 0 }}
        className="relative z-20 h-full min-h-0 shrink-0 overflow-hidden transition-[width] duration-200 ease-in-out"
        aria-hidden={!expanded}
        inert={!expanded}
        aria-label="侧栏"
      >
        {inner}
      </aside>
      <main className="relative z-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-auto">
        {children}
      </main>
    </div>
  );
}
