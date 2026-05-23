import { type HTMLAttributes, type ReactNode } from 'react';
import { ScrollArea } from '@/shared/ui/scroll-area';
import { cn } from '@/shared/lib/utils';

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
        'flex h-full min-h-0 flex-col bg-background border-r border-border',
        className
      )}
      {...props}
    >
      {children}
    </aside>
  );
}

/**
 * 滚动主体 — 卡在 header 和 footer 之间,fill_container,
 * 用 ScrollArea 提供原生级滚动条样式。
 */
export function SidebarContent({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <ScrollArea className={cn('flex-1 min-h-0', className)}>
      <div className="flex flex-col">{children}</div>
    </ScrollArea>
  );
}
