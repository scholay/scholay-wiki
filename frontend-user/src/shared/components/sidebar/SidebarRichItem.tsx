import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

interface SidebarRichItemProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** 14/500 的主标题。 */
  label: ReactNode;
  /** 12/400 的辅助说明。 */
  description: ReactNode;
  /** 左侧图标；统一放在 28×28 的浅色底板内。 */
  icon: ReactNode;
  /** 当前路由或当前工作区。 */
  active?: boolean;
  /** 暂不可用或弱化展示；仍由调用方决定是否可点击。 */
  muted?: boolean;
  /** 默认显示 12px 向右箭头，也可传入计数或状态。 */
  trailing?: ReactNode;
}

/**
 * 图 2 的双行主导航：42px 行高、16px 横向留白、12px 内容间距。
 *
 * 主标题和副标题不能在业务侧栏里各自拼 class：这里是侧栏排印层级的
 * 单一实现。单行导航继续使用 SidebarItem，树与筛选器使用其 sm 变体。
 */
export const SidebarRichItem = forwardRef<
  HTMLButtonElement,
  SidebarRichItemProps
>(
  (
    {
      label,
      description,
      icon,
      active = false,
      muted = false,
      trailing,
      className,
      ...props
    },
    ref
  ) => (
    <button
      ref={ref}
      type="button"
      className={cn(
        'group flex h-tab w-full items-center gap-3 px-4 text-left transition-colors max-sm:h-11',
        'hover:bg-surface-1 focus-visible:bg-surface-1',
        active && 'bg-surface-1',
        className
      )}
      {...props}
    >
      <span
        className={cn(
          'inline-flex size-7 shrink-0 items-center justify-center rounded-8',
          '[&_svg]:size-3.5',
          muted
            ? 'bg-surface-1 text-faint'
            : 'bg-surface-2 text-subtle group-hover:text-foreground'
        )}
      >
        {icon}
      </span>

      <span className="flex min-w-0 flex-1 flex-col">
        <span
          className={cn(
            'truncate text-14 font-medium',
            muted ? 'text-subtle' : 'text-foreground'
          )}
        >
          {label}
        </span>
        <span className="mt-px truncate text-12 font-normal text-faint">
          {description}
        </span>
      </span>

      <span className="shrink-0 text-12 font-normal text-faint">
        {trailing ?? <ChevronRight className="size-3" />}
      </span>
    </button>
  )
);
SidebarRichItem.displayName = 'SidebarRichItem';
