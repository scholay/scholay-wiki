import {
  type ButtonHTMLAttributes,
  type ReactNode,
  forwardRef,
} from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { formatRailCount } from './format-rail-count';

interface SidebarItemProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'prefix'> {
  /** 行内显示文本 */
  label: ReactNode;
  /** 左侧图标(emoji / lucide / 自定义 ReactNode) */
  icon?: ReactNode;
  /** 右侧附加(数字徽章 / 状态点) */
  trailing?: ReactNode;
  /** 树状展开:undefined=无 chevron, true=展开(▾), false=收起(▸) */
  expanded?: boolean;
  /** 缩进层级(0/1/2),每级 +22px,对齐 .pen 子项 padding-left 38/42/64 */
  indent?: 0 | 1 | 2 | 3;
  /** 选中态:'primary' 黑色左边线,'danger' 红色左边线(对照编辑中 #CC2222) */
  active?: 'primary' | 'danger' | false;
  /** 字号变体:'sm' 12px(子项 h-7=28)/ 'base' 13px(默认 h-8=32)/ 'lg' 14px(主菜单 tab h-10=40)*/
  size?: 'sm' | 'base' | 'lg';
}

/**
 * 侧栏行 —— 完整 label。收起由 SidebarLayout 裁到 0 宽,不再切成图标窄轨。
 */
export const SidebarItem = forwardRef<HTMLButtonElement, SidebarItemProps>(
  (
    {
      label,
      icon,
      trailing,
      expanded,
      indent = 0,
      active = false,
      size = 'base',
      className,
      title,
      ...props
    },
    ref,
  ) => {
    const isPrimary = active === 'primary';
    const isDanger = active === 'danger';
    const indentPx = indent === 0 ? 16 : 16 + indent * 22;

    return (
      <button
        ref={ref}
        type="button"
        title={title}
        style={{ paddingLeft: indentPx }}
        className={cn(
          'group flex w-full items-center gap-2 pr-4 text-left transition-colors',
          size === 'lg' && 'h-10 text-md',
          size === 'base' && 'h-8 text-base',
          size === 'sm' && 'h-7 text-sm',
          'text-subtle hover:bg-surface-2 hover:text-foreground',
          isPrimary &&
            'bg-surface-2 text-foreground font-bold border-l-[3px] border-l-foreground -ml-px',
          isDanger &&
            'bg-danger-soft text-destructive font-bold border-l-[3px] border-l-destructive -ml-px',
          className,
        )}
        {...props}
      >
        {expanded !== undefined ? (
          expanded ? (
            <ChevronDown className="size-3 shrink-0 text-faint" />
          ) : (
            <ChevronRight className="size-3 shrink-0 text-faint" />
          )
        ) : null}

        {icon && (
          <span className="inline-flex shrink-0 items-center justify-center text-subtle group-hover:text-foreground [&_svg]:size-3.5">
            {icon}
          </span>
        )}

        <span className="min-w-0 flex-1 truncate">{label}</span>

        {trailing != null && trailing !== false && (
          <span className="shrink-0 text-xs text-faint">
            {typeof trailing === 'number' ? formatRailCount(trailing) : trailing}
          </span>
        )}
      </button>
    );
  },
);
SidebarItem.displayName = 'SidebarItem';
