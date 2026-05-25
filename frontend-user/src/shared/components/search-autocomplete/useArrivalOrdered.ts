import { useEffect, useMemo, useState } from 'react';
import type {
  AuthorSuggestion,
  PaperSuggestion,
  UpstreamSource,
} from '@/shared/api/types';
import type { SourceSuggestionResult } from '@/shared/api/suggestions';

/**
 * 三源(stc/olx/pmd)真并行联想:谁先 resolve 谁的 papers/authors 先展示在前。
 *
 * 之前用单个 fan-out 请求等所有源返回,慢的源(PMD)会卡死整个 dropdown,
 * 改成各源独立 useQuery + 这里按 arrival 顺序拼合,慢源到了静默 append 在尾部。
 *
 * Query 变化时清空 arrival,等新一轮源 resolve;每源返回后才入列。
 */
export function useArrivalOrdered(
  sourceResults: SourceSuggestionResult[],
  query: string
): { papers: PaperSuggestion[]; authors: AuthorSuggestion[] } {
  const [arrival, setArrival] = useState<UpstreamSource[]>([]);

  useEffect(() => {
    setArrival([]);
  }, [query]);

  useEffect(() => {
    for (const r of sourceResults) {
      if (!r.isLoading) {
        setArrival((prev) =>
          prev.includes(r.source) ? prev : [...prev, r.source]
        );
      }
    }
  }, [sourceResults]);

  return useMemo(() => {
    const papers: PaperSuggestion[] = [];
    const authors: AuthorSuggestion[] = [];
    for (const src of arrival) {
      const r = sourceResults.find((x) => x.source === src);
      if (!r) continue;
      papers.push(...r.papers);
      authors.push(...r.authors);
    }
    return { papers, authors };
  }, [arrival, sourceResults]);
}
