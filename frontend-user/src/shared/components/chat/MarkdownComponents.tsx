import type { ReactNode } from 'react';

/**
 * 基础与增强 Markdown 管线共用的视觉契约。
 * 这里不引入 CodeBlock/Mermaid/HTML/SVG,以免普通文本被连带进重增强闭包。
 */
export const markdownComponents = {
  p: (props: { children?: ReactNode }) => (
    <p className="mb-2.5 last:mb-0 leading-paragraph text-foreground">
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
        <li className="chat-md-ol-li relative pl-7 leading-paragraph text-foreground">
          {props.children}
        </li>
      );
    }
    return <li className="leading-paragraph text-foreground">{props.children}</li>;
  },
  strong: (props: { children?: ReactNode }) => (
    <strong className="font-medium text-foreground">{props.children}</strong>
  ),
  em: (props: { children?: ReactNode }) => (
    <em className="not-italic text-muted-foreground">{props.children}</em>
  ),
  code: (props: { children?: ReactNode; className?: string }) => {
    // inline code 是裸 <code>;代码栅则由增强 components 的 <pre> 接管外壳。
    const isInline = !props.className?.includes('language-');
    if (isInline) {
      return (
        <code className="px-1 py-0.5 rounded-4 bg-surface-2 text-12 font-mono text-foreground break-all">
          {props.children}
        </code>
      );
    }
    return <code className={props.className}>{props.children}</code>;
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
  img: (props: { src?: string; alt?: string }) => (
    <img
      src={props.src}
      alt={props.alt ?? ''}
      loading="lazy"
      className="my-2 h-auto max-w-full rounded-12"
    />
  ),
  table: (props: { children?: ReactNode }) => (
    <div className="mb-2.5 last:mb-0 overflow-x-auto">
      <table className="w-full text-12 border-collapse">{props.children}</table>
    </div>
  ),
  th: (props: { children?: ReactNode }) => (
    <th className="border border-border bg-surface-1 px-2 py-1 text-left font-medium">
      {props.children}
    </th>
  ),
  td: (props: { children?: ReactNode }) => (
    <td className="border border-border px-2 py-1 align-top">{props.children}</td>
  ),
  h1: (props: { children?: ReactNode }) => (
    <h1 className="mt-3 mb-2 text-16 font-medium text-foreground first:mt-0">
      {props.children}
    </h1>
  ),
  h2: (props: { children?: ReactNode }) => (
    <h2 className="mt-3 mb-2 text-14 font-medium text-foreground first:mt-0">
      {props.children}
    </h2>
  ),
  h3: (props: { children?: ReactNode }) => (
    <h3 className="mt-2.5 mb-1.5 text-12 font-medium text-foreground first:mt-0">
      {props.children}
    </h3>
  ),
};
