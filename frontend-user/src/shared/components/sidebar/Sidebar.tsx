import { type HTMLAttributes, type ReactNode } from 'react';
import { ScrollArea } from '@/shared/ui/scroll-area';
import { cn } from '@/shared/lib/utils';
import { SidebarCollapseButton } from './SidebarCollapse';

/**
 * 侧栏外壳 — vertical layout,白底,右侧 1px 描边。
 * 宽度由父 ResizablePanel 控制,自身只负责内部纵向布局。
 */
export function Sidebar({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLElement>) {
  return (
    <aside
      className={cn(
        'relative flex h-full min-h-0 flex-col bg-background border-r border-border',
        className
      )}
      {...props}
    >
      {children}
    </aside>
  );
}

/**
 * 滚动主体 — 顶部固定展开/收起，其下为 ScrollArea。
 * 用 ScrollArea 提供原生级滚动条样式。
 *
 * `hideCollapse`：默认关掉。展开/收起已回到顶栏 Logo 左侧,
 * 侧栏顶再挂一颗会重复。后台等没有用户顶栏的壳可显式传 false。
 */
export function SidebarContent({
  className,
  children,
  hideCollapse = true,
}: {
  className?: string;
  children: ReactNode;
  hideCollapse?: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!hideCollapse && <SidebarCollapseButton />}
      {/* Radix ScrollArea 的 viewport 会把内容包进一个 `display:table; min-width:100%` 的 div,
          它会被 nowrap 的长文本撑成 max-content 宽 → truncate 失效。强制回 block。 */}
      <ScrollArea
        className={cn(
          'min-h-0 flex-1 [&_[data-radix-scroll-area-viewport]>div]:!block',
          className,
        )}
      >
        <div className="flex min-w-0 flex-col">{children}</div>
      </ScrollArea>
    </div>
  );
}
