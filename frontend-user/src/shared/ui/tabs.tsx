import * as React from'react';
import * as TabsPrimitive from'@radix-ui/react-tabs';
import { cn } from'@/shared/lib/utils';

/**
 * Tabs —— 导航级控件,与 <Button> 同属「主控件」层。
 * TabsTrigger 字号 = text-12,与 Button 同档 —— 本项目控件基座统一 text-12(对 Figma §4.1/§4.5 的刻意偏离,见 button.tsx 文件头)。
 * h-9(36px)容纳 14px×leading-sans 1.25 = 17.5px,余量 18.5px,不撑破。
 */
const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn('inline-flex h-9 items-center gap-1 border-b border-border-soft',
      className
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn('relative inline-flex h-9 items-center justify-center whitespace-nowrap px-3 text-12 font-medium text-muted-foreground transition-colors hover:text-foreground', '', 'disabled:pointer-events-none disabled:opacity-50', 'data-[state=active]:text-foreground', 'data-[state=active]:after:absolute data-[state=active]:after:inset-x-0 data-[state=active]:after:-bottom-px data-[state=active]:after:h-0.5 data-[state=active]:after:bg-foreground',
      className
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn('mt-3',
      className
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
