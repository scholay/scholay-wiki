import { type ButtonHTMLAttributes, forwardRef } from'react';
import { Slot } from '@radix-ui/react-slot';
import { Tooltip, TooltipContent, TooltipTrigger } from'@/shared/ui/tooltip';
import { cn } from'@/shared/lib/utils';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 鼠标悬停的提示文本 — 不传则不渲染 Tooltip */
  tooltip?: string;
  /** 尺寸 — 默认 32(对齐 .pen header 图标按钮),sm=28,lg=36 */
  size?: 'sm'|'md'|'lg';
  /**
   * shadcn 同款 asChild —— 样式压到唯一子元素上(典型:<Link>,让导航型
   * 图标按钮渲染真实 <a href>,SEO 硬约束)。此时不再输出 <button>。
   */
  asChild?: boolean;
}

/**
 * 通用工具栏图标按钮 — 32×32 rounded-8,hover #F5F5F5。
 * 同时提供可选 Tooltip 包装,业务侧不再到处自己拼。
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ tooltip, size ='md', className, children, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    const btn = (
      <Comp
        ref={ref}
        type={asChild ? undefined : 'button'} className={cn('inline-flex items-center justify-center rounded-8 text-subtle transition-colors', 'hover:bg-surface-2 hover:text-foreground', '', 'disabled:pointer-events-none disabled:opacity-50',
          size ==='sm'&& 'h-7 w-7 [&_svg]:size-3.5',
          size ==='md'&& 'h-8 w-8 [&_svg]:size-4',
          size ==='lg'&& 'h-9 w-9 [&_svg]:size-[18px]',
          className
        )}
        {...props}
      >
        {children}
      </Comp>
    );

    if (!tooltip) return btn;

    return (
      <Tooltip>
        <TooltipTrigger asChild>{btn}</TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    );
  }
);
IconButton.displayName ='IconButton';
