import { useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { cn } from '@/shared/lib/utils';
import { compactTokens, type TokenDayPoint } from '../../api/token-usage';

/**
 * 每日趋势图 —— AreaChart,可切 y 指标(总 tokens / 输入 / 输出 / 调用次数)。
 * 样式沿用 UsageStatsPage(渐变填充 + CSS var 颜色),仅做指标切换。
 */

type Metric = 'total_tokens' | 'input_tokens' | 'output_tokens' | 'calls';

const METRICS: Array<{ key: Metric; label: string }> = [
  { key: 'total_tokens', label: '总 Tokens' },
  { key: 'input_tokens', label: '输入' },
  { key: 'output_tokens', label: '输出' },
  { key: 'calls', label: '调用次数' },
];

export function TokenTrendChart({ daily }: { daily: TokenDayPoint[] }) {
  const [metric, setMetric] = useState<Metric>('total_tokens');

  return (
    <section className="rounded-md border border-border bg-background p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-foreground">每日用量趋势</h3>
        <div className="flex gap-1">
          {METRICS.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMetric(m.key)}
              className={cn(
                'h-7 px-2.5 rounded-md text-xs font-medium transition-colors',
                m.key === metric
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
          <AreaChart data={daily} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <defs>
              <linearGradient id="tokenTrendGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-brand-green)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="var(--color-brand-green)" stopOpacity={0} />
              </linearGradient>
            </defs>
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
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--color-background)',
                border: '1px solid var(--color-border)',
                borderRadius: 6,
                fontSize: 12,
              }}
              labelStyle={{ color: 'var(--color-muted-foreground)', fontSize: 11 }}
              formatter={(v) => [Number(v ?? 0).toLocaleString(), METRICS.find((m) => m.key === metric)?.label ?? '']}
            />
            <Area
              type="monotone"
              dataKey={metric}
              name={METRICS.find((m) => m.key === metric)?.label}
              stroke="var(--color-brand-green)"
              fill="url(#tokenTrendGrad)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
