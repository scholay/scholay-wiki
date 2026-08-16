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
import { Skeleton } from '@/shared/ui/skeleton';
import { ResourceError } from '@/shared/components/ResourceError';
import { chartTheme } from '@/shared/lib/theme-bridge';
import { isTodayBucket, withWeekday } from '@/shared/lib/daily-trend';
import { compactTokens, toPoints, type TokenDayPoint, type TokenDayDimPoint } from '../../api/token-usage';
import { COMPOSITION_SEGMENTS, OTHER_FILL, categoryFill, fillColor, type SegmentColor } from './palette';

/**
 * 每日用量主图 —— 一根柱子 = 一天,柱内分段;可切 4 种视图:
 *   按模型(算力点) · 按功能(算力点) · token 构成 · 调用次数。
 * 默认是「按模型(算力点)」—— 算力点是全页主单位,与用户额度扣减同源。
 * 模型/功能取窗口内 top-6(按算力点),长尾合并为「其他」,防止 20 个系列把图染花。
 *
 * 🔴 刻意**没有**「算力点构成(输入/输出/缓存)」这一档:账本只落一次调用的成本**总额**
 * (llm_token_usage.cost_micro_yuan),四类 token 各自的成本没有单独存。按当前单价现算会与
 * 快照口径打架(调价后历史会漂),所以构成视角只在 token 那一档提供 —— 这正是 token 口径
 * 保留下来的原因,不是遗漏。
 */

type Mode = 'model' | 'feature' | 'tokens' | 'calls';

const MODES: Array<{ key: Mode; label: string }> = [
  { key: 'model', label: '按模型' },
  { key: 'feature', label: '按功能' },
  { key: 'tokens', label: 'token 构成' },
  { key: 'calls', label: '调用次数' },
];

/**
 * 每种视图的单位 —— 决定 Y 轴(axis,紧凑)与 Tooltip(fmt,精确)怎么格式化。
 * 注意 rows 里的算力点值**已经是点**(buildDimRows 里 toPoints 过了),不是微元,
 * 所以这里不能再套 api 层那两个「入参是微元」的 formatPoints / compactPoints。
 */
const POINT_FMT = (v: number) => (v > 0 && v < 1 ? v.toFixed(2) : Math.round(v).toLocaleString());
const POINT_AXIS = (v: number) => (v > 0 && v < 1 ? v.toFixed(2) : compactTokens(Math.round(v)));

const UNIT: Record<Mode, { suffix: string; fmt: (v: number) => string; axis: (v: number) => string }> = {
  model: { suffix: '算力点', fmt: POINT_FMT, axis: POINT_AXIS },
  feature: { suffix: '算力点', fmt: POINT_FMT, axis: POINT_AXIS },
  tokens: { suffix: 'tokens', fmt: (v) => Math.round(v).toLocaleString(), axis: compactTokens },
  calls: { suffix: '次', fmt: (v) => Math.round(v).toLocaleString(), axis: compactTokens },
};

const TOP_N = 6;

interface Series {
  dataKey: string;
  name: string;
  fill: SegmentColor;
}

/**
 * 把稀疏的「天 × 维度」格子按 daily 的日期 spine 合并成 recharts 行(top-N + 其他)。
 * 值取算力点(微元 ÷ 1000),排名同样按算力点 —— 与页面主单位、后端维度排序口径三方一致。
 */
function buildDimRows(daily: TokenDayPoint[], dim: TokenDayDimPoint[]) {
  const agg = new Map<string, { label: string; total: number }>();
  for (const c of dim) {
    const e = agg.get(c.key) ?? { label: c.label || c.key || '(未知)', total: 0 };
    e.total += c.cost_micro_yuan;
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
    row[sk] = (Number(row[sk]) || 0) + toPoints(c.cost_micro_yuan);
  }
  return { rows: [...byDate.values()], series };
}

/** 自定义 Tooltip:逐段数值(自上而下与柱内顺序一致)+ 合计。 */
function ChartTooltip(props: {
  active?: boolean;
  label?: string | number;
  payload?: Array<{ name?: string; value?: number | string; fill?: string }>;
  unit?: { suffix: string; fmt: (v: number) => string };
}) {
  const { active, label, payload, unit } = props;
  if (!active || !payload?.length) return null;
  const fmt = unit?.fmt ?? ((v: number) => v.toLocaleString());
  const items = payload.filter((p) => Number(p.value) > 0);
  const total = payload.reduce((s, p) => s + (Number(p.value) || 0), 0);
  return (
    <div className="rounded-12 border border-border bg-surface-card px-3 py-2 text-12 shadow-overlay">
      <div className="mb-1 text-faint">
        {withWeekday(String(label ?? ''), label)}
        {unit && <span className="ml-1">· 单位 {unit.suffix}</span>}
      </div>
      {[...items].reverse().map((p, i) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-subtle">
            {/* 8px 图例色块用 2px 圆角:最低档 rounded-4 放到这个尺度上会把方块变成圆点,
                是真实的档位缺口而非违规 —— tests/design-system-guard.test.ts「禁止 arbitrary 圆角」
                已为 rounded-[1px]/[2px] 写明这条豁免。 */}
            <span className="size-2 rounded-[2px]" style={{ backgroundColor: p.fill }} />
            {p.name}
          </span>
          <span className="tabular-nums text-foreground">{fmt(Number(p.value))}</span>
        </div>
      ))}
      {items.length > 1 && (
        <div className="mt-1 flex items-center justify-between gap-4 border-t border-border-soft pt-1 font-medium">
          <span className="text-subtle">合计</span>
          <span className="tabular-nums text-foreground">{fmt(total)}</span>
        </div>
      )}
    </div>
  );
}

export function TokenDailyChart({
  daily,
  byModel,
  byFeature,
  loading,
  error,
  onRetry,
}: {
  daily: TokenDayPoint[];
  byModel: TokenDayDimPoint[];
  byFeature: TokenDayDimPoint[];
  loading?: boolean;
  /** 概览 query 的 error —— 不传的话接口挂了会画出一个空坐标系,看起来像"这段时间没用量"。 */
  error?: unknown;
  onRetry?: () => void;
}) {
  const [mode, setMode] = useState<Mode>('model');

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

  const unit = UNIT[mode];
  // 算力点在低量级会小于 1 —— 整数刻度会把整张图压成一条 0 线,故按当日峰值决定要不要放小数。
  const peak = useMemo(
    () =>
      rows.reduce((max, r) => {
        const sum = series.reduce((s, se) => s + (Number(r[se.dataKey]) || 0), 0);
        return Math.max(max, sum);
      }, 0),
    [rows, series]
  );

  return (
    <section className="mb-6 rounded-16 border border-border bg-surface-card p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-14 font-medium text-foreground">
          每日用量
          <span className="ml-2 text-12 font-normal text-faint">单位 {unit.suffix}</span>
        </h3>
        <div className="flex flex-wrap gap-1">
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMode(m.key)}
              className={cn(
                'h-7 rounded-8 px-2.5 text-12 font-medium transition-colors',
                m.key === mode
                  ? 'bg-inverse text-on-inverse'
                  : 'text-muted-foreground hover:bg-surface-1 hover:text-foreground'
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      {/* 三态顺序:error → loading → 空。
          🔴 空坐标系(只有网格和 0 刻度)是本页第二贵的"说反话":读者无法区分
          「筛选没命中」和「图挂了」,而两者的下一步动作完全相反。 */}
      {error ? (
        <ResourceError
          error={error}
          resourceName="每日用量"
          onRetry={onRetry}
          autoRedirect={false}
          className="h-auto bg-surface-card"
        />
      ) : loading && rows.length === 0 ? (
        <Skeleton className="h-56 w-full rounded-12" />
      ) : rows.length === 0 ? (
        <p className="flex h-56 items-center justify-center text-12 text-faint">
          当前筛选下没有用量数据 —— 换个时间窗口或清掉维度筛选试试
        </p>
      ) : (
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: chartTheme.fontSize, fill: chartTheme.axis }}
              axisLine={{ stroke: chartTheme.grid }}
              tickLine={false}
              tickFormatter={(d: string) => d.slice(5)}
              minTickGap={24}
            />
            <YAxis
              tick={{ fontSize: chartTheme.fontSize, fill: chartTheme.axis }}
              axisLine={false}
              tickLine={false}
              allowDecimals={peak < 10}
              width={44}
              tickFormatter={(v: number) => unit.axis(v)}
            />
            <Tooltip
              content={<ChartTooltip unit={unit} />}
              cursor={{ fill: 'var(--color-surface-2)', fillOpacity: 0.6 }}
            />
            <Legend wrapperStyle={{ fontSize: chartTheme.fontSize }} iconType="square" iconSize={8} />
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
      )}
    </section>
  );
}
