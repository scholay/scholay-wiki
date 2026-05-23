import { useMemo } from 'react';
import { cn } from '@/shared/lib/utils';
import type { Paper } from '@/shared/api/types';

/**
 * 年度发表趋势 —— 简单柱状图(自渲染,不依赖图表库),峰值年高亮 amber。
 * 限制最多 10 年(取最近),不足年份补 0;无 papers 数据则不渲染。
 */
export function YearlyChart({ papers }: { papers: Paper[] }) {
  const series = useMemo(() => {
    if (papers.length === 0) return [] as Array<{ year: number; count: number }>;
    const counts = new Map<number, number>();
    let min = Infinity;
    let max = -Infinity;
    for (const p of papers) {
      const y = p.year;
      if (!y || y < 1900 || y > 2100) continue;
      counts.set(y, (counts.get(y) ?? 0) + 1);
      if (y < min) min = y;
      if (y > max) max = y;
    }
    if (!isFinite(min) || !isFinite(max)) return [];
    // 限制最多 10 年(取最近)
    const startYear = Math.max(min, max - 9);
    const rows: Array<{ year: number; count: number }> = [];
    for (let y = startYear; y <= max; y++) {
      rows.push({ year: y, count: counts.get(y) ?? 0 });
    }
    return rows;
  }, [papers]);

  if (series.length === 0) return null;

  const maxCount = Math.max(...series.map((s) => s.count), 1);
  const peakYear = series.reduce(
    (acc, s) => (s.count > acc.count ? s : acc),
    series[0]
  );
  const recent5 = series.slice(-5);
  const avg5 =
    recent5.length > 0
      ? (recent5.reduce((sum, s) => sum + s.count, 0) / recent5.length).toFixed(1)
      : '0';

  return (
    <section className="rounded-lg bg-background border border-border p-6 space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div className="flex items-end gap-2.5">
          <h2 className="font-display font-bold text-xl leading-none text-foreground">
            年度发表趋势
          </h2>
          <span className="text-xs text-faint pb-0.5">
            近 {series.length} 年
          </span>
        </div>
        <div className="flex items-center gap-3 text-2xs text-faint">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-foreground" />
            年发表量
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-brand-amber" />
            峰值
          </span>
        </div>
      </div>

      <div className="flex items-end gap-4 h-[200px]">
        {series.map((s) => {
          const heightPct = (s.count / maxCount) * 100;
          const isPeak = s.year === peakYear.year && s.count > 0;
          return (
            <div
              key={s.year}
              className="flex-1 min-w-0 h-full flex flex-col items-center gap-1.5 justify-end"
            >
              <span className="text-2xs font-bold tabular-nums text-subtle">
                {s.count}
              </span>
              <div
                className={cn(
                  'w-full rounded-t-md transition-colors',
                  isPeak ? 'bg-brand-amber' : 'bg-foreground'
                )}
                style={{ height: `${Math.max(heightPct, 2)}%` }}
              />
              <span className="text-2xs text-faint tabular-nums">{s.year}</span>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        近 {recent5.length} 年平均{' '}
        <span className="text-foreground font-bold tabular-nums">{avg5}</span>{' '}
        篇/年,峰值出现在{' '}
        <span className="text-brand-amber font-bold tabular-nums">
          {peakYear.year}
        </span>{' '}
        ({peakYear.count} 篇)
      </p>
    </section>
  );
}
