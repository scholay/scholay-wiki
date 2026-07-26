import { Lightbulb } from 'lucide-react';
import type { ArticleSection } from '../api/content';
import { Prose } from './Prose';

/**
 * 把数据驱动的文章 sections 渲染成 v2 prose 排版。
 *   - paragraph → <p>      heading → <h2>      tip → 高亮卡片
 *   - list      → <ul>/<ol>(GEO:步骤/要点)
 *   - table     → 对比表(GEO:AI 最爱抽取的结构)
 *   - faq       → 问答卡(GEO:配套 FAQPage JSON-LD 由后端注入)
 *
 * schema 与后端 internal/content.Section 同构,正文单一真源在后端。
 */
export function ArticleRenderer({ sections }: { sections: ArticleSection[] }) {
  return (
    <Prose>
      {sections.map((s, i) => {
        switch (s.type) {
          case 'heading':
            return <h2 key={i}>{s.text}</h2>;

          case 'tip':
            return (
              <aside
                key={i}
                className="my-6 flex gap-3 p-4 rounded-12 bg-warning-soft border border-brand-amber/20"
              >
                <Lightbulb
                  className="size-4 text-brand-amber shrink-0 mt-0.5"
                  strokeWidth={2.2}
                />
                <div className="flex-1 min-w-0">
                  <p className="!m-0 text-sm font-bold text-foreground">
                    {s.title}
                  </p>
                  <p className="!mt-1.5 !mb-0 text-sm text-subtle leading-paragraph">
                    {s.text}
                  </p>
                </div>
              </aside>
            );

          case 'list': {
            const items = s.items.map((it, j) => <li key={j}>{it}</li>);
            return s.ordered ? <ol key={i}>{items}</ol> : <ul key={i}>{items}</ul>;
          }

          case 'table':
            return (
              <div key={i} className="my-5 overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  {s.headers.length > 0 && (
                    <thead>
                      <tr>
                        {s.headers.map((h, j) => (
                          <th
                            key={j}
                            className="border border-border bg-surface-2 px-3 py-2 text-left font-bold text-foreground"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                  )}
                  <tbody>
                    {s.rows.map((row, r) => (
                      <tr key={r}>
                        {row.map((c, j) => (
                          <td
                            key={j}
                            className="border border-border px-3 py-2 align-top text-subtle"
                          >
                            {c}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );

          case 'faq':
            return (
              <div key={i} className="my-6 space-y-3">
                {s.faq.map((qa, j) => (
                  <div
                    key={j}
                    className="rounded-12 border border-border-soft bg-surface-1 p-4"
                  >
                    <p className="!m-0 text-sm font-bold text-foreground">
                      {qa.q}
                    </p>
                    <p className="!mt-1.5 !mb-0 text-sm text-subtle leading-paragraph">
                      {qa.a}
                    </p>
                  </div>
                ))}
              </div>
            );

          default:
            return <p key={i}>{s.text}</p>;
        }
      })}
    </Prose>
  );
}
