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
    // Radix ScrollArea 的 viewport 会把内容包进一个 `display:table; min-width:100%` 的 div,
    // 它会被 nowrap 的长文本(如会话标题)撑成 max-content 宽 → 把侧栏内容横向撑爆、truncate
    // 失效(智能助手会话历史的长标题就会把侧栏变很宽)。强制该 div 回到 display:block, 它就只占
    // 100%(= 固定 240)宽, 长标题正常 truncate。侧栏从不需要横向滚, 对所有 feature 都安全。
    <ScrollArea
      className={cn(
        'flex-1 min-h-0 [&_[data-radix-scroll-area-viewport]>div]:!block',
        className
      )}
    >
      <div className="flex min-w-0 flex-col">{children}</div>
    </ScrollArea>
  );
}
