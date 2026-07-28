import * as React from'react';
import { cn } from'@/shared/lib/utils';

/**
 * Textarea —— 多行输入原子。
 *
 * 存在理由: 改造前全站 33 处裸 <textarea>,每处自己拼一套边框/圆角/焦点环 ——
 * 焦点环曾有 4 种透明度变体(solid / 20% / 30% / 40%)做同一件事。
 * B7 已统一: --ring 自带 45% alpha,直接用 ring-ring,不再叠透明度修饰符。
 *
 * 与 input.tsx 保持同构: 同样的描边、圆角、焦点环、禁用态、字号。
 * 字号 = text-12。Figma §4.5 输入框标的是 14px,本项目不采纳 —— 本项目控件基座统一 text-12(对 Figma §4.1/§4.5 的刻意偏离,见 button.tsx 文件头)。
 */
export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn('flex w-full min-h-16 rounded-8 border border-border bg-surface-card px-3 py-2 text-12 text-foreground placeholder:text-faint', 'transition-colors resize-y', 'focus-visible:border-foreground', 'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName ='Textarea';

export { Textarea };
