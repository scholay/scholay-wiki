import {
  forwardRef,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type ReactNode,
  type Ref,
} from 'react';
import { Link } from 'react-router-dom';
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
  /**
   * 站内导航目标。有值时渲染真实 react-router `<Link>`(= 真实 `<a href>`,
   * SEO 硬约束见 frontend-user/CLAUDE.md §7.5,修饰键点击由浏览器原生接管);
   * 无值时保持 `<button>`(纯动作项)。
   */
  to?: string;
}

/**
 * 图 2 的双行主导航：42px 行高、16px 横向留白、12px 内容间距。
 *
 * 主标题和副标题不能在业务侧栏里各自拼 class：这里是侧栏排印层级的
 * 单一实现。单行导航继续使用 SidebarItem，树与筛选器使用其 sm 变体。
 */
export const SidebarRichItem = forwardRef<
  HTMLButtonElement | HTMLAnchorElement,
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
      to,
      ...props
    },
    ref
  ) => {
    const classes = cn(
      'group flex h-tab w-full items-center gap-3 px-4 text-left transition-colors max-sm:h-11',
      'hover:bg-surface-1 focus-visible:bg-surface-1',
      active && 'bg-surface-1',
      className
    );
    const content = (
      <>
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
      </>
    );

    if (to) {
      // button 与 anchor 的事件/aria 属性集在本组件用到的范围内完全重合,
      // 收窄断言只为跨过 HTMLButtonElement/HTMLAnchorElement 的标称差异。
      const anchorProps = props as unknown as Omit<
        AnchorHTMLAttributes<HTMLAnchorElement>,
        'href' | 'children'
      >;
      return (
        <Link ref={ref as Ref<HTMLAnchorElement>} to={to} className={classes} {...anchorProps}>
          {content}
        </Link>
      );
    }

    return (
      <button
        ref={ref as Ref<HTMLButtonElement>}
        type="button"
        className={classes}
        {...props}
      >
        {content}
      </button>
    );
  }
);
SidebarRichItem.displayName = 'SidebarRichItem';
