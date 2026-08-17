import { useEffect, useState } from 'react';
import type { Paper } from '@/shared/api/types';
import { enrichPmdAbstracts } from '@/shared/api/paper-enrich';

/**
 * PMD 缺 abstract 补全: useEffect 检测后异步调 `/public/papers/batch`, merge 回去。
 *
 * dep stabilization: papers 数组每次父组件 re-render 都是新引用,
 * 用 paperId join 做 stable key 避免无限重 enrich。
 */
export function useEnrichedPapers(papers: Paper[]): Paper[] {
  const [enriched, setEnriched] = useState<Paper[]>(papers);

  const paperKey = papers
    .map((p) => `${p.source ?? 'stc'}:${p.paperId}`)
    .join('|');

  useEffect(() => {
    setEnriched(papers);
    const pmdMissing = papers.some(
      (p) =>
        p.source === 'pmd' &&
        !(p.abstract && p.abstract.trim().length > 0),
    );
    if (!pmdMissing) return;

    let cancelled = false;
    void enrichPmdAbstracts(papers).then((result) => {
      if (cancelled) return;
      setEnriched((curr) => (curr === result ? curr : result));
    });

    return () => {
      cancelled = true;
    };
    // paperKey 是 papers 内容的稳定签名, 引用变但内容没变时不触发。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paperKey]);

  return enriched;
}
