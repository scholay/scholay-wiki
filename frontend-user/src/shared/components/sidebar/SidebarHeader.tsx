import { type ButtonHTMLAttributes, type ReactNode, forwardRef } from 'react';
import { cn } from '@/shared/lib/utils';

/**
 * 顶部 iconSelector — 56h,space-between,底部 1px #EEEEEE 描边。
 * padding [10,12] 是 .pen `wzCqs`,[10,16] 是 `gs3tU`;两者差异极小,统一用 px-3。
 * 收起由 SidebarLayout 裁到 0 宽,header 保持完整以免动画期跳成窄轨。
 */
export function SidebarHeader({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        'flex h-14 shrink-0 items-center justify-between gap-1 border-b border-border-soft px-3',
        className,
      )}
    >
      {children}
    </header>
  );
}

/**
 * 32×32 图标按钮 — header 左右两侧的 home/menu,圆角 6,hover #F5F5F5。
 */
export const SidebarHeaderIcon = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    className={cn(
      'inline-flex h-8 w-8 items-center justify-center rounded-md text-subtle',
      'hover:bg-surface-2 hover:text-foreground transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
      'disabled:pointer-events-none disabled:opacity-50',
      '[&_svg]:size-4',
      className
    )}
    {...props}
  />
));
SidebarHeaderIcon.displayName = 'SidebarHeaderIcon';

/**
 * 居中区域 — gap 4,可塞标题 / 标签 / breadcrumb
 */
export function SidebarHeaderCenter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center justify-center gap-1 flex-1 min-w-0', className)}>
      {children}
    </div>
  );
}
