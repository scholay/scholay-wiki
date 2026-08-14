import { type ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';

/**
 * 富文本阅读容器 —— 为 About / 法律 / 文章正文等长内容统一 typography。
 *
 * 直接在 children 里写 `<h2>` `<p>` `<ul>` 等原生标签即可,Prose 通过
 * Tailwind v4 的 [&_h2]: 嵌套选择器统一给标题/段落/列表上间距与字号。
 *
 * 不依赖 @tailwindcss/typography,因为本项目 token 已固定,自己写
 * 一份与 v2 设计系统对齐的版本更可控。
 */
export function Prose({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        // 段落、标题、列表的统一节奏
        'text-12 md:text-14 text-subtle leading-paragraph',
        '[&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-16 md:[&_h2]:text-20 [&_h2]:font-medium [&_h2]:text-foreground',
        '[&_h2:first-child]:mt-0',
        '[&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-14 md:[&_h3]:text-16 [&_h3]:font-medium [&_h3]:text-foreground',
        '[&_p]:my-3 [&_p]:leading-paragraph',
        '[&_ul]:my-3 [&_ul]:pl-5 [&_ul]:list-disc [&_ul]:space-y-1.5',
        '[&_ol]:my-3 [&_ol]:pl-5 [&_ol]:list-decimal [&_ol]:space-y-1.5',
        '[&_li]:leading-paragraph',
        '[&_a]:text-brand-red [&_a]:underline-offset-2 hover:[&_a]:underline',
        '[&_strong]:text-foreground [&_strong]:font-medium',
        '[&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded-4 [&_code]:bg-surface-2 [&_code]:font-mono [&_code]:text-12',
        '[&_blockquote]:my-4 [&_blockquote]:pl-4 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:text-muted-foreground [&_blockquote]:italic',
        className
      )}
    >
      {children}
    </div>
  );
}
