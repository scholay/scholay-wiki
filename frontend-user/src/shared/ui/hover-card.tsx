import * as React from 'react';
import * as HoverCardPrimitive from '@radix-ui/react-hover-card';
import { cn } from '@/shared/lib/utils';

/**
 * 标准 shadcn HoverCard 包装。Trigger ↔ Content 之间的 gap 由 Radix 自动处理,
 * 鼠标从 trigger 移到 content 不会关闭。openDelay/closeDelay 在 Root 上设置。
 *
 *   <HoverCard openDelay={100} closeDelay={150}>
 *     <HoverCardTrigger asChild><button>...</button></HoverCardTrigger>
 *     <HoverCardContent>...</HoverCardContent>
 *   </HoverCard>
 */
const HoverCard = HoverCardPrimitive.Root;
const HoverCardTrigger = HoverCardPrimitive.Trigger;

const HoverCardContent = React.forwardRef<
  React.ElementRef<typeof HoverCardPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof HoverCardPrimitive.Content>
>(({ className, align = 'center', sideOffset = 6, ...props }, ref) => (
  <HoverCardPrimitive.Portal>
    <HoverCardPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        // 「outline-none」是 Radix Content 容器的惯例:浮层本身不是可交互目标,
        // 打开时 Radix 自己接管焦点,给容器画一圈全局 :focus-visible 环只是噪音。
        'z-popover rounded-12 border border-border bg-popover text-popover-foreground outline-none',
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
        className
      )}
      {...props}
    />
  </HoverCardPrimitive.Portal>
));
HoverCardContent.displayName = HoverCardPrimitive.Content.displayName;

export { HoverCard, HoverCardTrigger, HoverCardContent };
