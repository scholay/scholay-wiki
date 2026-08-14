import { memo, useMemo } from 'react';
import { buildReferenceList, type CiteNumbering } from '../lib/cite-render';

/**
 * 参考文献编号列表(只读)—— 真实 LaTeX 论文文末的 References 区。只列**被正文引用**的文献,
 * 按出现顺序编号,从 bibliography 的 BibTeX 解析出作者/标题/venue/年份格式化。
 *
 * 两面复用同一 CiteNumbering(与正文行内 [N] 同源,保证编号一致):
 *   - StructEditor:据 doc.body 编号(buildNumberingFromBody)
 *   - PrismLivePreview:据流式 markdown 编号(buildNumberingFromMarkdown)
 * 容器与两处正文用同款 `mx-auto max-w-[720px] px-12 font-serif`,视觉接在正文下方。
 */
export const PrismReferencesList = memo(function PrismReferencesList({
  numbering,
  bibliography,
}: {
  numbering: CiteNumbering;
  bibliography?: Record<string, string>;
}) {
  const refs = useMemo(() => buildReferenceList(numbering, bibliography), [numbering, bibliography]);
  if (refs.length === 0) return null;
  return (
    <section className="mx-auto max-w-[720px] px-12 pb-12 font-serif text-14 text-foreground">
      <h2 className="mb-3 border-b border-border pb-1 text-16 font-bold">参考文献</h2>
      <ol className="space-y-2">
        {refs.map(({ num, entry }) => (
          <li key={`${entry.key}-${num}`} className="flex gap-2 text-12 leading-paragraph text-subtle">
            <span className="shrink-0 tabular-nums text-faint">[{num}]</span>
            <span className="min-w-0">
              {entry.authors && <span>{entry.authors}. </span>}
              {entry.title && <span className="text-foreground">{entry.title}. </span>}
              {entry.venue && <span className="italic">{entry.venue}. </span>}
              {entry.year && <span>{entry.year}.</span>}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
});
PrismReferencesList.displayName = 'PrismReferencesList';
