import * as React from 'react';
import { cn } from '@/shared/lib/utils';

/**
 * Textarea —— 多行输入原子。
 *
 * 存在理由: 改造前全站 33 处裸 <textarea>,每处自己拼一套边框/圆角/焦点环,
 * 其中大部分用了 `ring-ring` solid 而 Input 原子用的是 `ring-ring/30` —— 焦点环不一致。
 *
 * 与 input.tsx 保持同构: 同样的描边、圆角、焦点环、禁用态。
 */
export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'flex w-full min-h-16 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-faint',
        'transition-colors resize-y',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:border-foreground',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = 'Textarea';

export { Textarea };
