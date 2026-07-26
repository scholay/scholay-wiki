import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { cn } from '@/shared/lib/utils';
import { isTodayBucket, withWeekday } from '@/shared/lib/daily-trend';
import { compactTokens, type TokenDayPoint, type TokenDayDimPoint } from '../../api/token-usage';
import { COMPOSITION_SEGMENTS, OTHER_FILL, categoryFill, fillColor, type SegmentColor } from './palette';

/**
 * 每日用量主图 —— 一根柱子 = 一天,柱内分段;堆叠维度可切:
 *   构成(输入/输出/缓存命中/缓存创建) · 按模型 · 按功能 · 调用次数(单段)。
 * 一张图回答「每天用了多少、由什么构成、哪些模型、哪些功能」,不再并排堆图表。
 * 模型/功能取窗口内 top-6,长尾合并为「其他」,防止 20 个系列把图染花。
 */

type Mode = 'composition' | 'model' | 'feature' | 'calls';

const MODES: Array<{ key: Mode; label: string }> = [
  { key: 'composition', label: '构成' },
  { key: 'model', label: '按模型' },
  { key: 'feature', label: '按功能' },
  { key: 'calls', label: '调用次数' },
];

const TOP_N = 6;

interface Series {
  dataKey: string;
  name: string;
  fill: SegmentColor;
}

/** 把稀疏的「天 × 维度」格子按 daily 的日期 spine 合并成 recharts 行(top-N + 其他)。 */
function buildDimRows(daily: TokenDayPoint[], dim: TokenDayDimPoint[]) {
  const agg = new Map<string, { label: string; total: number }>();
  for (const c of dim) {
    const e = agg.get(c.key) ?? { label: c.label || c.key || '(未知)', total: 0 };
    e.total += c.total_tokens;
    agg.set(c.key, e);
  }
  const sorted = [...agg.entries()].sort((a, b) => b[1].total - a[1].total);
  const top = sorted.slice(0, TOP_N);
  const keyToSeries = new Map(top.map(([k], i) => [k, `s${i}`]));
  const series: Series[] = top.map(([, v], i) => ({ dataKey: `s${i}`, name: v.label, fill: categoryFill(i) }));
  if (sorted.length > TOP_N) series.push({ dataKey: 'other', name: '其他', fill: OTHER_FILL });

  const byDate = new Map<string, Record<string, number | string>>(daily.map((d) => [d.date, { date: d.date }]));
  for (const c of dim) {
    const row = byDate.get(c.date);
    if (!row) continue;
    const sk = keyToSeries.get(c.key) ?? 'other';
    row[sk] = (Number(row[sk]) || 0) + c.total_tokens;
  }
  return { rows: [...byDate.values()], series };
}

/** 自定义 Tooltip:逐段数值(自上而下与柱内顺序一致)+ 合计。 */
function ChartTooltip(props: {
  active?: boolean;
  label?: string | number;
  payload?: Array<{ name?: string; value?: number | string; fill?: string }>;
}) {
  const { active, label, payload } = props;
  if (!active || !payload?.length) return null;
  const items = payload.filter((p) => Number(p.value) > 0);
  const total = payload.reduce((s, p) => s + (Number(p.value) || 0), 0);
  return (
    <div className="rounded-12 border border-border bg-surface-card px-3 py-2 text-xs shadow-overlay">
      <div className="mb-1 text-faint">{withWeekday(String(label ?? ''), label)}</div>
      {[...items].reverse().map((p, i) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-subtle">
            <span className="size-2 rounded-[2px]" style={{ backgroundColor: p.fill }} />
            {p.name}
          </span>
          <span className="tabular-nums text-foreground">{Number(p.value).toLocaleString()}</span>
        </div>
      ))}
      {items.length > 1 && (
        <div className="mt-1 flex items-center justify-between gap-4 border-t border-border-soft pt-1 font-medium">
          <span className="text-subtle">合计</span>
          <span className="tabular-nums text-foreground">{total.toLocaleString()}</span>
        </div>
      )}
    </div>
  );
}

export function TokenDailyChart({
  daily,
  byModel,
  byFeature,
}: {
  daily: TokenDayPoint[];
  byModel: TokenDayDimPoint[];
  byFeature: TokenDayDimPoint[];
}) {
  const [mode, setMode] = useState<Mode>('composition');

  const { rows, series } = useMemo((): { rows: Array<Record<string, number | string>>; series: Series[] } => {
    if (mode === 'model') return buildDimRows(daily, byModel);
    if (mode === 'feature') return buildDimRows(daily, byFeature);
    if (mode === 'calls') {
      return {
        rows: daily as unknown as Array<Record<string, number | string>>,
        series: [{ dataKey: 'calls', name: '调用次数', fill: { color: 'var(--color-brand-green)', opacity: 1 } }],
      };
    }
    return {
      rows: daily as unknown as Array<Record<string, number | string>>,
      series: COMPOSITION_SEGMENTS.map((s) => ({ dataKey: s.key, name: s.label, fill: s.fill })),
    };
  }, [mode, daily, byModel, byFeature]);

  return (
    <section className="mb-6 rounded-16 border border-border bg-surface-card p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-foreground">每日用量</h3>
        <div className="flex flex-wrap gap-1">
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMode(m.key)}
              className={cn(
                'h-7 rounded-8 px-2.5 text-xs font-medium transition-colors',
                m.key === mode
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:bg-surface-1 hover:text-foreground'
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: 'var(--color-faint)' }}
              axisLine={{ stroke: 'var(--color-border)' }}
              tickLine={false}
              tickFormatter={(d: string) => d.slice(5)}
              minTickGap={24}
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'var(--color-faint)' }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
              width={44}
              tickFormatter={(v: number) => compactTokens(v)}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--color-surface-2)', fillOpacity: 0.6 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} iconType="square" iconSize={8} />
            {series.map((s) => (
              <Bar key={s.dataKey} dataKey={s.dataKey} name={s.name} stackId="day" fill={fillColor(s.fill)}>
                {/* 今日柱半透明 = 进行中数据(柱状画不了虚线,用透明度区分) */}
                {rows.map((r) => (
                  <Cell key={String(r.date)} fillOpacity={isTodayBucket(String(r.date)) ? 0.45 : 1} />
                ))}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
