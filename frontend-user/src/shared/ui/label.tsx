import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cn } from '@/shared/lib/utils';

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(
      // KEEP text-12 —— 表单标签属「次文/段标」层,Figma 未给出规格(§4.5 只标了
      // 输入框自身与 placeholder)。标签比它所标注的 14px 控件小一档是刻意的:
      // 让视线落在可输入内容上,而不是标签上。
      'text-12 font-medium leading-none text-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
      className
    )}
    {...props}
  />
));
Label.displayName = LabelPrimitive.Root.displayName;

export { Label };
