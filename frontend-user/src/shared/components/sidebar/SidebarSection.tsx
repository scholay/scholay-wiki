import { type ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';
import { useSidebar } from '@/stores/sidebar.store';

interface SidebarSectionProps {
  /**
   * Section 唯一标识 —— 接收来自 TopNav RailLinks 的 "flash" 信号。
   * RailItem.sectionId 与此 id 匹配时,该段会闪烁高亮边框一次。
   * 不传则永不参与 flash(普通 section)。
   */
  id?: string;
  /** 段标题 —— 默认 10px/700 #999 letterSpacing 2(.pen `UYIrC` HomeSidebar "工作流" 风) */
  label?: ReactNode;
  /**
   * `prominent`:11px/700 #111 letterSpacing 1(.pen `EgdL4` SearchSidebar "筛选器" 风),
   * 用于带 "清空" 这类强操作的主功能段
   */
  prominent?: boolean;
  /** 右侧动作 —— "+ 新建" / "清空",由调用方着色 */
  action?: ReactNode;
  /** 段顶部是否带 1px 分隔线(.pen `wXbDd` Prism 文件分组) */
  bordered?: boolean;
  children: ReactNode;
  className?: string;
}

export function SidebarSection({
  id,
  label,
  prominent,
  action,
  bordered,
  children,
  className,
}: SidebarSectionProps) {
  const flashed = useSidebar((s) => s.flashedSection);
  const sidebarExpanded = useSidebar((s) => s.expanded);
  const isFlashed = !!id && flashed === id;
  // 窄轨态藏段头(标题/管理),只留内容行的图标+数字。
  const showHeader = !!label && sidebarExpanded;

  return (
    <section
      data-flashed={isFlashed ? '' : undefined}
      className={cn(
        bordered && sidebarExpanded && 'border-t border-border-soft',
        isFlashed && 'animate-sidebar-flash relative z-10',
        className,
      )}
    >
      {showHeader && (
        <header className="flex h-7 items-center justify-between gap-2 px-4 pb-1 pt-2">
          <span
            className={cn(
              'font-bold',
              prominent
                ? 'text-xs tracking-[0.06em] text-foreground'
                : 'text-2xs tracking-[0.18em] text-faint',
            )}
          >
            {label}
          </span>
          {action && (
            <span
              className={cn(
                'font-bold',
                prominent ? 'text-xs text-foreground' : 'text-2xs text-foreground',
              )}
            >
              {action}
            </span>
          )}
        </header>
      )}
      <div className="flex flex-col">{children}</div>
    </section>
  );
}
