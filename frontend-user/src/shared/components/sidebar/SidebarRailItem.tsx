import {
  type ButtonHTMLAttributes,
  type ReactNode,
  forwardRef,
} from 'react';
import { cn } from '@/shared/lib/utils';
import { formatRailCount } from './format-rail-count';

export interface SidebarRailItemProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** 左侧图标(lucide / 自定义) */
  icon: ReactNode;
  /** 右侧两位数;不传则只显示图标 */
  count?: number;
  /** 完整名称 —— 仅 title / aria-label,窄轨不渲染文案 */
  label: string;
  /** 选中态 */
  active?: boolean;
  /** danger = 暂存区红调高亮 */
  tone?: 'default' | 'danger';
}

/**
 * 窄轨单元格 —— 全站收起侧栏唯一视觉口径:
 *   [icon 14][gap 4][2ch 数字]
 * 不渲染 label / 其它字段;名称只进 tooltip。
 */
export const SidebarRailItem = forwardRef<HTMLButtonElement, SidebarRailItemProps>(
  function SidebarRailItem(
    {
      icon,
      count,
      label,
      active = false,
      tone = 'default',
      className,
      title,
      ...props
    },
    ref,
  ) {
    const danger = tone === 'danger';
    const hasCount = typeof count === 'number' && Number.isFinite(count);

    return (
      <button
        ref={ref}
        type="button"
        title={title ?? (hasCount ? `${label} · ${count}` : label)}
        aria-label={hasCount ? `${label}, ${count}` : label}
        aria-current={active ? 'true' : undefined}
        className={cn(
          'group flex h-8 w-full items-center justify-center gap-1 rounded-sm px-1',
          'transition-colors hover:bg-surface-1',
          active && !danger && 'bg-surface-2',
          active && danger && 'bg-danger-soft',
          className,
        )}
        {...props}
      >
        <span
          className={cn(
            'inline-flex size-3.5 shrink-0 items-center justify-center [&_svg]:size-3.5',
            active && danger
              ? 'text-brand-red'
              : active
                ? 'text-foreground'
                : 'text-muted-foreground group-hover:text-foreground',
          )}
        >
          {icon}
        </span>
        {hasCount && (
          <span
            className={cn(
              'w-[2ch] shrink-0 text-center text-2xs font-semibold tabular-nums leading-none',
              active && danger
                ? 'text-brand-red'
                : active
                  ? 'text-subtle'
                  : 'text-faint group-hover:text-muted-foreground',
            )}
          >
            {formatRailCount(count)}
          </span>
        )}
      </button>
    );
  },
);
SidebarRailItem.displayName = 'SidebarRailItem';
