import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '@/shared/lib/utils';

/**
 * Provider 已在 app/providers.tsx 全局挂载,这里只导出 Root / Trigger / Content
 */
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;
const TooltipProvider = TooltipPrimitive.Provider;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        // KEEP text-12 —— tooltip 是补充说明层,不是控件本体;Figma 未给规格。
        // 它常常紧挨着它所解释的 14px 按钮出现,同字号会让人分不清哪个是浮层。
        'z-tooltip overflow-hidden rounded-12 border border-border bg-foreground px-2 py-1 text-12 text-on-dark shadow-overlay',
        'data-[state=delayed-open]:animate-in data-[state=closed]:animate-out',
        'data-[state=closed]:fade-out-0 data-[state=delayed-open]:fade-in-0',
        'data-[state=closed]:zoom-out-95 data-[state=delayed-open]:zoom-in-95',
        className
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
