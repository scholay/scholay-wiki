import { Fragment, useMemo } from 'react';
import { citationItalicParts } from '@/shared/lib/citation';

/**
 * 引用 prose 渲染 —— 把 [[generateCitation]] 返回串里的 `<i>...</i>` 标记
 * 切成 React 节点(标题 / 期刊会自动 italic),给非 BibTeX 格式用。
 *
 * 共享给:CitationDialog、PaperDetailPane 的 Footer/References,
 * LibraryPaperList 的 cite 模态等。
 */
export function CitationProse({ text }: { text: string }) {
  const parts = useMemo(() => citationItalicParts(text), [text]);
  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={i}>
          {typeof p === 'string' ? p : <i>{p.italic}</i>}
        </Fragment>
      ))}
    </>
  );
}
