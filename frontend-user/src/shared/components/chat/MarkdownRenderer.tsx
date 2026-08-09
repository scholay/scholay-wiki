import {
  lazy,
  memo,
  Suspense,
  type ComponentType,
  type LazyExoticComponent,
} from 'react';
import { cn } from '@/shared/lib/utils';
import {
  markdownLoadMode,
  type MarkdownLoadMode,
} from './markdown-load-mode';
import type { MarkdownRendererProps } from './MarkdownPipelineRenderer';

export type { MarkdownRendererProps } from './MarkdownPipelineRenderer';
export { markdownLoadMode, type MarkdownLoadMode } from './markdown-load-mode';

type LazyMarkdownRenderer = LazyExoticComponent<ComponentType<MarkdownRendererProps>>;

/**
 * 这些 loader 故意不在模块顶层静态引入 markdown 生态:
 * - 空会话只会加载这个轻量分流壳;
 * - 普通回答才加载 ReactMarkdown + GFM;
 * - 公式只额外加载 KaTeX,代码块只额外加载 highlight 与专用渲染器。
 * Promise.all 使共享 pipeline 和各自增强包并行拉取,避免二次瀑布。
 */
const BasicRenderer: LazyMarkdownRenderer = lazy(async () => {
  const { MarkdownPipelineRenderer } = await import('./MarkdownPipelineRenderer');
  return { default: MarkdownPipelineRenderer };
});

const MathRenderer: LazyMarkdownRenderer = lazy(async () => {
  const [
    { MarkdownPipelineRenderer },
    { default: remarkMath },
    { default: rehypeKatex },
  ] = await Promise.all([
    import('./MarkdownPipelineRenderer'),
    import('remark-math'),
    import('rehype-katex'),
    import('katex/dist/katex.min.css'),
  ]);
  return {
    default: (props: MarkdownRendererProps) => (
      <MarkdownPipelineRenderer
        {...props}
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
      />
    ),
  };
});

const CodeRenderer: LazyMarkdownRenderer = lazy(async () => {
  const [
    { MarkdownPipelineRenderer },
    { enhancedMarkdownComponents },
    { default: rehypeHighlight },
  ] = await Promise.all([
    import('./MarkdownPipelineRenderer'),
    import('./MarkdownEnhancedComponents'),
    import('rehype-highlight'),
    import('highlight.js/styles/github.css'),
  ]);
  return {
    default: (props: MarkdownRendererProps) => (
      <MarkdownPipelineRenderer
        {...props}
        rehypePlugins={[[rehypeHighlight, { ignoreMissing: true }]]}
        components={enhancedMarkdownComponents}
      />
    ),
  };
});

const MathCodeRenderer: LazyMarkdownRenderer = lazy(async () => {
  const [
    { MarkdownPipelineRenderer },
    { enhancedMarkdownComponents },
    { default: remarkMath },
    { default: rehypeHighlight },
    { default: rehypeKatex },
  ] = await Promise.all([
    import('./MarkdownPipelineRenderer'),
    import('./MarkdownEnhancedComponents'),
    import('remark-math'),
    import('rehype-highlight'),
    import('rehype-katex'),
    import('highlight.js/styles/github.css'),
    import('katex/dist/katex.min.css'),
  ]);
  return {
    default: (props: MarkdownRendererProps) => (
      <MarkdownPipelineRenderer
        {...props}
        remarkPlugins={[remarkMath]}
        rehypePlugins={[
          [rehypeHighlight, { ignoreMissing: true }],
          rehypeKatex,
        ]}
        components={enhancedMarkdownComponents}
      />
    ),
  };
});

const rendererByMode: Record<MarkdownLoadMode, LazyMarkdownRenderer> = {
  basic: BasicRenderer,
  math: MathRenderer,
  code: CodeRenderer,
  'math-code': MathCodeRenderer,
};

function MarkdownFallback({ text, className }: MarkdownRendererProps) {
  return (
    <div
      className={cn(
        'text-12 text-foreground leading-paragraph min-w-0 whitespace-pre-wrap',
        className,
      )}
    >
      {text}
    </div>
  );
}

/**
 * 统一的 AI 回答 Markdown 渲染入口。轻量壳按实际内容选择基础/增强管线,
 * 各管线仍复用同一套元素 components 和容器样式,不改变既有视觉与专用代码块行为。
 */
export const MarkdownRenderer = memo(function MarkdownRenderer({
  text,
  className,
}: MarkdownRendererProps) {
  // 即使某个调用方显式渲染空 block,也不触发 ReactMarkdown 动态块。
  if (!text) return <MarkdownFallback text={text} className={className} />;

  const Renderer = rendererByMode[markdownLoadMode(text)];
  return (
    <Suspense fallback={<MarkdownFallback text={text} className={className} />}>
      <Renderer text={text} className={className} />
    </Suspense>
  );
});
