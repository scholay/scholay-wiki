import { Lightbulb } from 'lucide-react';
import type { ArticleSection } from '../data/resource-articles';
import { Prose } from './Prose';

/**
 * 把数据驱动的文章 sections 渲染成 v2 prose 排版。
 *   - paragraph → <p>
 *   - heading   → <h2>
 *   - tip       → 高亮卡片(amber 软底 + 💡 图标)
 *
 * 旧前端的文章结构是结构化的(blogArticles.js / resourceArticles.js),
 * v2 沿用同一种 schema,避免重新解析 markdown 或迁移内容。
 */
export function ArticleRenderer({ sections }: { sections: ArticleSection[] }) {
  return (
    <Prose>
      {sections.map((s, i) => {
        if (s.type === 'heading') {
          return <h2 key={i}>{s.text}</h2>;
        }
        if (s.type === 'tip') {
          return (
            <aside
              key={i}
              className="my-6 flex gap-3 p-4 rounded-md bg-warning-soft border border-brand-amber/20"
            >
              <Lightbulb
                className="size-4 text-brand-amber shrink-0 mt-0.5"
                strokeWidth={2.2}
              />
              <div className="flex-1 min-w-0">
                <p className="!m-0 text-sm font-bold text-foreground">
                  {s.title}
                </p>
                <p className="!mt-1.5 !mb-0 text-sm text-subtle leading-relaxed">
                  {s.text}
                </p>
              </div>
            </aside>
          );
        }
        return <p key={i}>{s.text}</p>;
      })}
    </Prose>
  );
}
