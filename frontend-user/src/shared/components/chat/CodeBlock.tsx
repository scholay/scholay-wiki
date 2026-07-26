import { useRef, useState, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';

/**
 * 代码块 —— 替代 markdown 默认的裸 <pre>。参考 prompt-kit / shadcn-chat / assistant-ui 的
 * 通用做法: 容器 + 右上角复制按钮 + 横向滚动。
 *
 * 设计:
 *   - 语法高亮由 rehype-highlight 在 react-markdown 渲染前完成 (children 已经是 hljs spans),
 *     本组件不重复高亮, 只负责容器壳 + 复制交互
 *   - 复制走 ref 读 <pre> 的 textContent (不解析 children), 简单可靠
 *   - 复制按钮默认半透明, hover 容器才显形, 不抢正文注意力
 *   - overflow-x-auto: 长代码行横向滚动, 不撑破气泡 (气泡 overflow-hidden 兜底)
 *
 * hljs 主题色走 github light (在 MarkdownRenderer 顶部 import 一次). 代码语法色是独立色域,
 * 不受项目 design token 约束 (token 管 UI chrome, 语法高亮是另一回事)。
 */
export function CodeBlock({ children }: { children?: ReactNode }) {
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const text = preRef.current?.textContent ?? '';
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard 不可用 (非 https / 权限) — 静默失败, 不打扰用户
    }
  };

  return (
    <div className="group/code relative mb-2.5 last:mb-0 min-w-0">
      <button
        type="button"
        onClick={handleCopy}
        className="absolute right-2 top-2 z-raised inline-flex items-center gap-1 rounded-sm border border-border bg-background/90 px-1.5 py-0.5 text-2xs text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/code:opacity-100"
        aria-label="复制代码"
      >
        {copied ? (
          <>
            <Check className="size-3 text-brand-green" strokeWidth={2.4} />
            已复制
          </>
        ) : (
          <>
            <Copy className="size-3" strokeWidth={2.2} />
            复制
          </>
        )}
      </button>
      <pre
        ref={preRef}
        className="overflow-x-auto rounded-md border border-border bg-surface-1 p-3 text-[12px] leading-paragraph"
      >
        {children}
      </pre>
    </div>
  );
}
