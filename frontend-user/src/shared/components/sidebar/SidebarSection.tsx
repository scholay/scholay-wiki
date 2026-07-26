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
  /** 段标题 —— 默认 text-12/font-medium text-faint(.pen `UYIrC` HomeSidebar "工作流" 风) */
  label?: ReactNode;
  /**
   * `prominent`:同样 text-12/font-medium,但色档提到 text-foreground
   * (.pen `EgdL4` SearchSidebar "筛选器" 风),用于带 "清空" 这类强操作的主功能段。
   * B6 后两档字号都归 text-12,主次【只靠颜色档区分】。
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
  const isFlashed = !!id && flashed === id;

  return (
    <section
      data-flashed={isFlashed ? '' : undefined}
      className={cn(
        bordered && 'border-t border-border-soft',
        // flash 动画 —— 用 ring 而不是 border,不会撑大 layout;1800ms 后 store 自动清回 null
        isFlashed && 'animate-sidebar-flash relative z-raised',
        className
      )}
    >
      {label && (
        <header className="h-7 flex items-center justify-between gap-2 px-4 pt-2 pb-1">
          <span
            className={cn(
              'font-medium',
              prominent
                ? 'text-12 text-foreground'
                : 'text-12 text-faint'
            )}
          >
            {label}
          </span>
          {action && (
            <span
              className={cn(
                'font-medium',
                prominent
                  ? 'text-12 text-foreground'
                  : 'text-12 text-foreground'
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
