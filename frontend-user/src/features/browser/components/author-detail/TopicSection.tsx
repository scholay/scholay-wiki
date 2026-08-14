import { useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import type { Paper } from '@/shared/api/types';

/**
 * 研究方向 —— 从 papers 的 fieldsOfStudy 聚合,取出现次数最高的 top 10。
 * 无方向(loading 后还是空)直接不渲染整个 section。
 */
export function TopicSection({
  papers,
  loading,
}: {
  papers: Paper[];
  loading: boolean;
}) {
  const topics = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of papers) {
      for (const f of p.fieldsOfStudy ?? []) {
        if (!f?.trim()) continue;
        counts.set(f, (counts.get(f) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  }, [papers]);

  if (!loading && topics.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div className="flex items-end gap-2.5">
          <h2 className="font-display font-bold text-20 leading-none text-foreground">
            研究方向
          </h2>
          {topics.length > 0 && (
            <span className="text-12 text-faint pb-0.5">
              {topics.length} 个方向
            </span>
          )}
        </div>
      </div>
      {loading && topics.length === 0 ? (
        <div className="flex items-center gap-2 text-12 text-faint">
          <Loader2 className="size-3 animate-spin" />
          统计中…
        </div>
      ) : (
        <div className="flex items-center flex-wrap gap-2.5">
          {topics.map(([name, count]) => (
            <span
              key={name}
              className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-pill bg-surface-2 border border-border-soft text-12"
            >
              <span className="font-medium text-foreground">{name}</span>
              <span className="text-faint tabular-nums">{count}</span>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
