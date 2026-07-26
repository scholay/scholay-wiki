import { memo, useMemo, useState } from 'react';
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { cn } from '@/shared/lib/utils';
import type { JournalFullDetail } from '@/shared/api/types';
import { useJournalFullDetail } from '@/shared/api/journals';

const LINE_COLOR = 'var(--color-brand-green)';
const AXIS_COLOR = 'var(--color-faint)';

/** 趋势图最多取最近几年(设计稿口径"近五年",给到 6 留余量) */
const MAX_YEARS = 6;

type MetricKey = 'if' | 'works' | 'cited';

const METRICS: Array<{ key: MetricKey; label: string }> = [
  { key: 'if', label: '影响因子' },
  { key: 'works', label: '发文量' },
  { key: 'cited', label: '被引量' },
];

interface Point {
  year: number;
  value: number;
}

/** 从 full 详情抽指定指标的年度序列(升序、去无效值、截近 N 年) */
function buildSeries(
  detail: JournalFullDetail | undefined,
  metric: MetricKey
): Point[] {
  if (!detail?.sources) return [];
  let points: Point[] = [];
  if (metric === 'if') {
    points = (detail.sources.jcr?.all_years ?? [])
      .map((y) => ({ year: y.year, value: Number(y.impact_factor) }))
      .filter((p) => Number.isFinite(p.value) && p.value > 0);
  } else {
    points = (detail.sources.openalex?.counts_by_year ?? [])
      .map((y) => ({
        year: y.year,
        value: (metric === 'works' ? y.works_count : y.cited_by_count) ?? NaN,
      }))
      .filter((p) => Number.isFinite(p.value));
  }
  return points.sort((a, b) => a.year - b.year).slice(-MAX_YEARS);
}

function formatValue(n: number): string {
  if (n >= 10_000) return `${(n / 10_000).toFixed(1).replace(/\.0$/, '')}万`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  // IF 这类小数值保留 1 位(508.702 → 508.7)
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export interface JournalTrendChartProps {
  journalId: number;
  /** 仅当前激活卡为 true —— 控制详情请求时机(避免 feed 渲染窗口批量打上游) */
  active: boolean;
}

/**
 * 期刊年度趋势折线图(.pen `u9FZ4` JournalInfo「近五年影响因子」的实现+扩展):
 * 影响因子(jcr.all_years)/ 发文量 / 被引量(openalex.counts_by_year)三指标切换。
 * 数据按需拉取:滑到当前卡才请求 full 详情,长缓存,回滑不重打。
 */
export const JournalTrendChart = memo(function JournalTrendChart({
  journalId,
  active,
}: JournalTrendChartProps) {
  const detailQ = useJournalFullDetail(journalId, active);
  const [metric, setMetric] = useState<MetricKey>('if');

  // 三个指标的序列一次性算好(数据变才重算),避免 metric 切换时重复跑 buildSeries。
  const seriesByMetric = useMemo(() => {
    const map = {} as Record<MetricKey, Point[]>;
    for (const m of METRICS) map[m.key] = buildSeries(detailQ.data, m.key);
    return map;
  }, [detailQ.data]);

  // 哪些指标有数据 —— 没有 JCR 历史的期刊默认落到第一个有数据的指标
  const available = useMemo(
    () => METRICS.filter((m) => seriesByMetric[m.key].length >= 2),
    [seriesByMetric]
  );

  // 数据到达后,若当前指标无序列 → 自动切到第一个可用指标
  const effectiveMetric =
    seriesByMetric[metric].length >= 2 ? metric : (available[0]?.key ?? metric);
  const effectiveSeries = seriesByMetric[effectiveMetric] ?? [];

  if (detailQ.isLoading || !detailQ.data) {
    return (
      <div className="h-44 shrink-0 animate-pulse rounded-16 border border-border bg-surface-1" />
    );
  }
  if (available.length === 0) return null;

  return (
    <section className="shrink-0 rounded-16 border border-border bg-surface-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-14 font-medium text-foreground">近年趋势</span>
        <div className="flex gap-1">
          {available.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMetric(m.key)}
              className={cn(
                'rounded-pill px-2 py-0.5 text-12 transition-colors',
                effectiveMetric === m.key
                  ? 'bg-foreground font-medium text-on-brand'
                  : 'bg-surface-2 text-muted-foreground'
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-32">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={effectiveSeries}
            /* 首尾点的顶标数值会向两侧溢出,左右留足边距防裁切 */
            margin={{ top: 16, right: 22, bottom: 0, left: 22 }}
          >
            <XAxis
              dataKey="year"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: AXIS_COLOR }}
              interval="preserveStartEnd"
            />
            <YAxis hide domain={['auto', 'auto']} />
            <Tooltip
              formatter={(v) => [formatValue(Number(v)), '']}
              labelFormatter={(year) => `${year} 年`}
              contentStyle={{
                fontSize: 12,
                borderRadius: 6,
                border: '1px solid var(--color-border)',
              }}
              separator=""
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={LINE_COLOR}
              strokeWidth={2}
              dot={{ r: 3, fill: LINE_COLOR, strokeWidth: 0 }}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
              label={{
                position: 'top',
                fontSize: 9,
                fill: AXIS_COLOR,
                formatter: (v: unknown) =>
                  typeof v === 'number' ? formatValue(v) : String(v ?? ''),
              }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
});
