import { useMemo } from 'react';
import { Quote } from 'lucide-react';
import {
  parseSnippetsFromToolResult,
  type MinicodSnippet,
} from '@/shared/lib/minicod-results';

/**
 * minicod search_snippets 结果的卡片列表 —— 替代非论文结果的「回退 JSON」。
 * snippet 带 paper_title,原会被论文卡误当论文渲染(且丢了 text);dispatcher 里 snippet
 * 优先于论文卡分流到这里。smart-search / claw / admin 会话监控共用(纯只读展示)。
 *
 * 数据:content ─ parseSnippetsFromToolResult ─▶ MinicodSnippet[]。
 * 展示重点是可引用的原文 `text`(全文直出,不截断),附来源 paper_title(+ section)。
 */

function SnippetCard({ snippet: s }: { snippet: MinicodSnippet }) {
  const source = [s.paperTitle, s.section].filter(Boolean).join(' · ');
  return (
    <div className="border-b border-border-soft px-3.5 py-3 last:border-0">
      <blockquote className="border-l-2 border-border-strong pl-3 text-12 leading-paragraph text-subtle whitespace-pre-wrap break-words">
        {s.text}
      </blockquote>
      {source && (
        <p className="mt-1.5 truncate text-12 text-faint">— {source}</p>
      )}
    </div>
  );
}

export function MinicodSnippetCards({ content }: { content: unknown }) {
  const snippets = useMemo(() => parseSnippetsFromToolResult(content), [content]);
  if (snippets.length === 0) return null;

  const overflow = snippets.length > 3;
  return (
    <div className="rounded-16 border border-border bg-surface-1 overflow-hidden">
      <header className="flex items-center gap-1.5 h-9 px-2.5 border-b border-border-soft bg-surface-2/40 text-12 text-muted-foreground">
        <Quote className="size-3" strokeWidth={2} />
        <span className="font-medium text-foreground">
          {snippets.length} 条原文片段
        </span>
      </header>
      <div
        className={overflow ? 'overflow-y-auto' : ''}
        style={overflow ? { maxHeight: 480 } : undefined}
      >
        {snippets.map((s, i) => (
          <SnippetCard key={i} snippet={s} />
        ))}
      </div>
    </div>
  );
}
