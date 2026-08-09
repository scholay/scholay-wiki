import ReactMarkdown, { type Components, type Options } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/shared/lib/utils';
import { markdownComponents } from './MarkdownComponents';

export interface MarkdownRendererProps {
  /** markdown 文本(流式累积后的完整字符串). */
  text: string;
  /** 容器额外 className(调用方控制字号 / 容器宽). 默认 text-12. */
  className?: string;
}

interface MarkdownPipelineRendererProps extends MarkdownRendererProps {
  /** 只传入当前文本真正需要的增强插件;GFM 始终保留。 */
  remarkPlugins?: NonNullable<Options['remarkPlugins']>;
  rehypePlugins?: NonNullable<Options['rehypePlugins']>;
  components?: Components;
}

/**
 * Markdown 基础管线:ReactMarkdown + GFM + 项目统一的元素样式。
 * KaTeX/highlight/图表等重依赖由外层内容分流后按需传入。
 */
export function MarkdownPipelineRenderer({
  text,
  className,
  remarkPlugins = [],
  rehypePlugins = [],
  components = markdownComponents,
}: MarkdownPipelineRendererProps) {
  return (
    <div
      className={cn('text-12 text-foreground leading-paragraph min-w-0', className)}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, ...remarkPlugins]}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
