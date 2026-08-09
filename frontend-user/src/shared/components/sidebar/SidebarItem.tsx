import { type ButtonHTMLAttributes, type ReactNode, forwardRef } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

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
  /** 缩进层级(0/1/2),每级 +22px */
  indent?: 0 | 1 | 2 | 3;
  /** 选中态:'primary' 玄墨左边线(`--foreground`),'danger' 朱砂左边线(`--brand-red`) */
  active?: 'primary' | 'danger' | false;
  /** 字号变体:'sm' text-12(子项 h-7=28)/ 'base' text-14(默认 h-8=32)/ 'lg' text-14(主菜单 tab h-10=40)*/
  size?: 'sm' | 'base' | 'lg';
}

/**
 * 侧栏行 —— 高度统一到 base=h-8(32)/ sm=h-7(28),字号 text-14 / text-12。
 * 'lg' 与 'base' 字号同为 text-14，两者靠行高 h-10/h-8 区分；sm 仅供
 * 树、大纲和筛选项。双行主导航必须用 SidebarRichItem，避免页面自行拼字号。
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
      ...props
    },
    ref
  ) => {
    const isPrimary = active === 'primary';
    const isDanger = active === 'danger';

    const indentPx = indent === 0 ? 16 : 16 + indent * 22;

    return (
      <button
        ref={ref}
        type="button"
        style={{ paddingLeft: indentPx }}
        className={cn(
          'group flex items-center gap-2 w-full text-left pr-4 transition-colors max-sm:min-h-11',
          size === 'lg' && 'h-10 text-14',
          size === 'base' && 'h-8 text-14',
          size === 'sm' && 'h-7 text-12',
          'text-subtle hover:bg-surface-2 hover:text-foreground',
          isPrimary && 'bg-surface-2 text-foreground font-medium border-l-[3px] border-l-foreground -ml-px',
          isDanger && 'bg-danger-soft text-destructive font-medium border-l-[3px] border-l-destructive -ml-px',
          className
        )}
        {...props}
      >
        {/* chevron 占位,保持有/无展开图标时缩进一致 */}
        {expanded !== undefined ? (
          expanded ? (
            <ChevronDown className="size-3 text-faint shrink-0" />
          ) : (
            <ChevronRight className="size-3 text-faint shrink-0" />
          )
        ) : null}

        {icon && (
          <span className="inline-flex items-center justify-center shrink-0 [&_svg]:size-3.5 text-subtle group-hover:text-foreground">
            {icon}
          </span>
        )}

        <span className="flex-1 min-w-0 truncate">{label}</span>

        {trailing && (
          <span className="text-12 text-faint shrink-0">{trailing}</span>
        )}
      </button>
    );
  }
);
SidebarItem.displayName = 'SidebarItem';
