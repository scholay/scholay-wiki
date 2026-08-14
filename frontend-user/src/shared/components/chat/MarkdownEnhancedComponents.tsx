import { isValidElement, type ReactNode } from 'react';
import { CodeBlock } from './CodeBlock';
import { HtmlRender } from './HtmlRender';
import { InlineSvg } from './InlineSvg';
import { markdownComponents } from './MarkdownComponents';
import { MermaidDiagram } from './MermaidDiagram';

// mermaid 图识别:① fence 语言是 mermaid / 各图类型;②无语言但内容首行是 mermaid 图关键字。
const MERMAID_LANG_RE =
  /language-(mermaid|flowchart|graph|sequenceDiagram|gantt|classDiagram|stateDiagram|erDiagram|journey|pie|mindmap|gitGraph|timeline|quadrantChart)\b/i;
const MERMAID_HEAD_RE =
  /^\s*(flowchart|graph|sequenceDiagram|gantt|classDiagram|stateDiagram(-v2)?|erDiagram|journey|pie|mindmap|gitGraph|timeline|quadrantChart)\b/;
const SVG_LANG_RE = /language-svg\b/i;
const HTML_LANG_RE = /language-html\b/i;

function extractCodeText(node: ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractCodeText).join('');
  if (isValidElement(node)) {
    return extractCodeText((node.props as { children?: ReactNode }).children);
  }
  return '';
}

/** 仅代码块内容才加载的专用分流器,行为与原 MarkdownRenderer 保持一致。 */
export const enhancedMarkdownComponents = {
  ...markdownComponents,
  pre: (props: { children?: ReactNode }) => {
    const child = props.children;
    if (isValidElement(child)) {
      const cls = (child.props as { className?: string }).className ?? '';
      const raw = extractCodeText((child.props as { children?: ReactNode }).children);
      if (MERMAID_LANG_RE.test(cls) || MERMAID_HEAD_RE.test(raw)) {
        return <MermaidDiagram code={raw} />;
      }
      if (SVG_LANG_RE.test(cls) || /^\s*<svg[\s>]/i.test(raw)) {
        return <InlineSvg code={raw} />;
      }
      if (HTML_LANG_RE.test(cls) && /<[a-zA-Z!]/.test(raw)) {
        return <HtmlRender html={raw} />;
      }
    }
    return <CodeBlock>{props.children}</CodeBlock>;
  },
};
