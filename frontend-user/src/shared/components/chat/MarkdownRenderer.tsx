import { isValidElement, memo, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
// 第三方 vendor CSS —— 不是新建的 .css 文件, 是 node_modules 里的样式, import 一次全局生效:
//   - github light hljs 主题: 代码语法高亮配色 (干净浅色, 跟我们 white-surface 美学一致)
//   - katex.min.css: 数学公式渲染 (学术平台必需, AI 回答论文相关问题常含公式)
import 'highlight.js/styles/github.css';
import 'katex/dist/katex.min.css';
import { CodeBlock } from './CodeBlock';
import { MermaidDiagram } from './MermaidDiagram';
import { InlineSvg } from './InlineSvg';
import { HtmlRender } from './HtmlRender';

// mermaid 图识别:① fence 语言是 mermaid / 各图类型;② 无语言但内容首行是 mermaid 图关键字
// (模型有时写 ```mermaid,有时直接 ```flowchart,甚至漏标语言)。命中则渲染成图而非代码块。
const MERMAID_LANG_RE =
  /language-(mermaid|flowchart|graph|sequenceDiagram|gantt|classDiagram|stateDiagram|erDiagram|journey|pie|mindmap|gitGraph|timeline|quadrantChart)\b/i;
const MERMAID_HEAD_RE =
  /^\s*(flowchart|graph|sequenceDiagram|gantt|classDiagram|stateDiagram(-v2)?|erDiagram|journey|pie|mindmap|gitGraph|timeline|quadrantChart)\b/;
// 内联 SVG:fence 标 svg,或内容直接是 <svg>(完整闭合,见 pre)。
const SVG_LANG_RE = /language-svg\b/i;
// HTML 文档/片段:fence 标 html → 渲染成「页面样式」(沙箱 iframe)而非展示源码。
const HTML_LANG_RE = /language-html\b/i;

// 从 <code> 元素的 children 里抽出纯文本源码(mermaid 未被 hljs 高亮 → children 通常就是字符串)。
function extractCodeText(node: ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractCodeText).join('');
  if (isValidElement(node)) {
    return extractCodeText((node.props as { children?: ReactNode }).children);
  }
  return '';
}

/**
 * 统一的 AI 回答 markdown 渲染器 —— 跨 chat feature 共享。
 *
 * 渲染栈 (全部已装的成熟插件, 无自研):
 *   - remark-gfm: 表格 / 任务列表 / 删除线 / 自动链接
 *   - remark-math + rehype-katex: 行内 $...$ 与块级 $$...$$ 数学公式 (学术场景核心)
 *   - rehype-highlight: 代码块语法高亮 (lowlight, 常用语言)
 *
 * 设计原则:
 *   - 不依赖 @tailwindcss/typography (prose 类); 全部走 design token + 自定义 components,
 *     这样:
 *       1. 每个元素的视觉契约都可以追溯到具体 className (而不是黑盒 prose CSS)
 *       2. 跟项目 design system (brand-green / surface-1 / text-muted-foreground) 直接对齐
 *       3. 不被 prose 的默认行高/字号 override 干扰我们的 leading-[1.7]
 *
 * 输出层级 (高到低):
 *   - <strong> (论文标题级别): text-foreground + font-semibold
 *   - 正文 <p> / <li>: text-foreground + leading-[1.7]
 *   - <em> (期刊名等元数据): text-muted-foreground (灰色退后, 故意 not-italic)
 *   - inline <code> (DOI / arXiv id): bg-surface-2 + font-mono
 *   - <a> (链接): text-brand-green underline (跟 AI 操作色一致)
 *
 * 特化:
 *   - 有序列表 <ol> + <li> 用 CSS counter 渲染绿色圆形序号 chip (见 styles.tsx 的 .chat-md-ol),
 *     跟 "search papers" 工具 chip 的 brand-green 调性呼应, 让"找到 N 篇论文"的列表视觉清晰
 *   - <table> 包 overflow-x-auto, 防 GFM 大表撑横滚条
 *   - fenced 代码块走 <CodeBlock> (复制按钮 + 横向滚动 + hljs 高亮)
 *
 * 共享前提: 调用方需要保证 <ChatStyles /> 已挂 (否则 .chat-md-ol 序号 chip 失效)。
 */

const components = {
  p: (props: { children?: ReactNode }) => (
    <p className="mb-2.5 last:mb-0 leading-[1.7] text-foreground">
      {props.children}
    </p>
  ),
  ol: (props: { children?: ReactNode }) => (
    <ol className="chat-md-ol m-0 mb-2.5 last:mb-0 p-0 list-none space-y-2">
      {props.children}
    </ol>
  ),
  ul: (props: { children?: ReactNode }) => (
    <ul className="m-0 mb-2.5 last:mb-0 pl-4 list-disc marker:text-faint space-y-1">
      {props.children}
    </ul>
  ),
  li: (props: { children?: ReactNode; ordered?: boolean }) => {
    if (props.ordered) {
      return (
        <li className="chat-md-ol-li relative pl-7 leading-[1.7] text-foreground">
          {props.children}
        </li>
      );
    }
    return (
      <li className="leading-[1.7] text-foreground">{props.children}</li>
    );
  },
  strong: (props: { children?: ReactNode }) => (
    <strong className="font-semibold text-foreground">{props.children}</strong>
  ),
  em: (props: { children?: ReactNode }) => (
    <em className="not-italic text-muted-foreground">{props.children}</em>
  ),
  code: (props: { children?: ReactNode; className?: string }) => {
    // react-markdown 把 fenced 代码块包成 <pre><code class="language-xxx hljs">,
    // inline code 就是裸 <code> 不带 language 前缀。
    //   - inline: 加 surface-2 底的小药丸样式 (DOI / arXiv id / 变量名)
    //   - fenced: 保留 rehype-highlight 给的 className (hljs spans), 容器壳由 <pre>→CodeBlock 负责
    const isInline = !props.className?.includes('language-');
    if (isInline) {
      return (
        <code className="px-1 py-0.5 rounded-sm bg-surface-2 text-[12px] font-mono text-foreground break-all">
          {props.children}
        </code>
      );
    }
    return <code className={props.className}>{props.children}</code>;
  },
  // fenced 代码块按内容分流(各渲染器内部用 useSettled 做「流式稳定后再渲染」,避免抽搐):
  //   mermaid 图 → MermaidDiagram(可放大);内联 SVG → InlineSvg(清洗+可放大);
  //   HTML → HtmlRender(沙箱 iframe 渲染样式,可放大);其余 → CodeBlock(复制+横滚+hljs)。
  pre: (props: { children?: ReactNode }) => {
    const child = props.children;
    if (isValidElement(child)) {
      const cls = (child.props as { className?: string }).className ?? '';
      const raw = extractCodeText((child.props as { children?: ReactNode }).children);
      if (MERMAID_LANG_RE.test(cls) || MERMAID_HEAD_RE.test(raw)) {
        return <MermaidDiagram code={raw} />;
      }
      // SVG:语言标 svg,或内容直接以 <svg> 开头(完整性由 InlineSvg 稳定后判定)。
      if (SVG_LANG_RE.test(cls) || /^\s*<svg[\s>]/i.test(raw)) {
        return <InlineSvg code={raw} />;
      }
      // HTML:语言标 html 且确有标记 → 渲染页面样式而非源码。
      if (HTML_LANG_RE.test(cls) && /<[a-zA-Z!]/.test(raw)) {
        return <HtmlRender html={raw} />;
      }
    }
    return <CodeBlock>{props.children}</CodeBlock>;
  },
  a: (props: { href?: string; children?: ReactNode }) => (
    <a
      href={props.href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-brand-green underline underline-offset-2 hover:opacity-80 break-words"
    >
      {props.children}
    </a>
  ),
  blockquote: (props: { children?: ReactNode }) => (
    <blockquote className="mb-2.5 last:mb-0 border-l-2 border-border-strong pl-3 text-muted-foreground italic">
      {props.children}
    </blockquote>
  ),
  hr: () => <hr className="my-3 border-border-soft" />,
  // 未覆写时 react-markdown 出裸 <img> 按原始像素宽渲染,窄屏横向溢出破版。
  // 强制 max-w-full h-auto 收口(claw 回答 / 审稿报告 / news body_md 内嵌图共用)。
  img: (props: { src?: string; alt?: string }) => (
    <img
      src={props.src}
      alt={props.alt ?? ''}
      loading="lazy"
      className="my-2 h-auto max-w-full rounded-md"
    />
  ),
  table: (props: { children?: ReactNode }) => (
    <div className="mb-2.5 last:mb-0 overflow-x-auto">
      <table className="w-full text-xs border-collapse">{props.children}</table>
    </div>
  ),
  th: (props: { children?: ReactNode }) => (
    <th className="border border-border bg-surface-1 px-2 py-1 text-left font-semibold">
      {props.children}
    </th>
  ),
  td: (props: { children?: ReactNode }) => (
    <td className="border border-border px-2 py-1 align-top">
      {props.children}
    </td>
  ),
  h1: (props: { children?: ReactNode }) => (
    <h1 className="mt-3 mb-2 text-base font-semibold text-foreground first:mt-0">
      {props.children}
    </h1>
  ),
  h2: (props: { children?: ReactNode }) => (
    <h2 className="mt-3 mb-2 text-sm font-semibold text-foreground first:mt-0">
      {props.children}
    </h2>
  ),
  h3: (props: { children?: ReactNode }) => (
    <h3 className="mt-2.5 mb-1.5 text-sm font-semibold text-foreground first:mt-0">
      {props.children}
    </h3>
  ),
};

export interface MarkdownRendererProps {
  /** markdown 文本 (流式累积后的完整字符串). */
  text: string;
  /** 容器额外 className (调用方控制字号 / 容器宽). 默认 text-sm. */
  className?: string;
}

/**
 * Render AI 回答的 markdown 文本. memoized 避免 streaming 中重复 parse。
 *
 * 用法:
 *   <MarkdownRenderer text={block.text} className="text-sm" />
 */
export const MarkdownRenderer = memo(function MarkdownRenderer({
  text,
  className,
}: MarkdownRendererProps) {
  return (
    <div
      className={
        'text-sm text-foreground leading-[1.7] min-w-0 ' + (className ?? '')
      }
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        // rehype-highlight: 代码高亮; rehype-katex: 数学公式渲染。
        // ignoreMissing 让 rehype-highlight 碰到未注册语言时降级为无高亮而不是抛错。
        rehypePlugins={[[rehypeHighlight, { ignoreMissing: true }], rehypeKatex]}
        components={components}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});
