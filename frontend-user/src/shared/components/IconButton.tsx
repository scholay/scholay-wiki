import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip';
import { cn } from '@/shared/lib/utils';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 鼠标悬停的提示文本 — 不传则不渲染 Tooltip */
  tooltip?: string;
  /** 尺寸 — 默认 32(对齐 .pen header 图标按钮),sm=28,lg=36 */
  size?: 'sm' | 'md' | 'lg';
}

/**
 * 通用工具栏图标按钮 — 32×32 rounded-8,hover #F5F5F5。
 * 同时提供可选 Tooltip 包装,业务侧不再到处自己拼。
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ tooltip, size = 'md', className, children, ...props }, ref) => {
    const btn = (
      <button
        ref={ref}
        type="button"
        className={cn(
          'inline-flex items-center justify-center rounded-8 text-subtle transition-colors',
          'hover:bg-surface-2 hover:text-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'disabled:pointer-events-none disabled:opacity-50',
          size === 'sm' && 'h-7 w-7 [&_svg]:size-3.5',
          size === 'md' && 'h-8 w-8 [&_svg]:size-4',
          size === 'lg' && 'h-9 w-9 [&_svg]:size-[18px]',
          className
        )}
        {...props}
      >
        {children}
      </button>
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
IconButton.displayName = 'IconButton';
