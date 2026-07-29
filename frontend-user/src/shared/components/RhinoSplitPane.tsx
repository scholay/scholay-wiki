import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

export interface RhinoSplitMenuItem {
  id: string;
  label: string;
  icon?: LucideIcon;
  badge?: ReactNode;
}

/**
 * 牛犀犀面板统一分栏：左二级菜单（独立滚动）+ 右主内容（独立滚动，可选底栏）。
 */
export function RhinoSplitPane({
  menu,
  activeId,
  onSelect,
  sidebar,
  children,
  footer,
  className,
}: {
  /** 简单二级菜单；与 sidebar 二选一 */
  menu?: RhinoSplitMenuItem[];
  activeId?: string;
  onSelect?: (id: string) => void;
  /** 自定义左侧（如对话历史列表） */
  sidebar?: ReactNode;
  children: ReactNode;
  /** 钉在右侧底部（输入框 / 提交等） */
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex h-full min-h-0 w-full overflow-hidden',
        className,
      )}
    >
      <aside className="flex h-full w-[120px] shrink-0 flex-col overflow-hidden border-r border-border/70 bg-muted/20">
        {sidebar ?? (
          <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-1.5 [scrollbar-width:thin]">
            <div className="flex flex-col gap-0.5">
              {(menu ?? []).map((item) => {
                const Icon = item.icon;
                const active = item.id === activeId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onSelect?.(item.id)}
                    className={cn(
                      'relative flex w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-2 text-left transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
                      active
                        ? 'bg-background font-semibold text-brand-red shadow-sm'
                        : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                    )}
                  >
                    {Icon ? (
                      <Icon className="size-3.5 shrink-0" strokeWidth={2} />
                    ) : null}
                    <span className="min-w-0 flex-1 truncate text-2xs">
                      {item.label}
                    </span>
                    {item.badge}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </aside>

      <section className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
        {footer ? <div className="shrink-0">{footer}</div> : null}
      </section>
    </div>
  );
}
