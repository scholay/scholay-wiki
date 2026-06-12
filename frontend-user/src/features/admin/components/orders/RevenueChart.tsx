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
import { isTodayBucket } from '@/shared/lib/daily-trend';
import type { AdminRevenueDay } from '../../api/orders';

/**
 * 每日营收堆叠柱 —— 一根柱子 = 一天,两段 = 充值 / 订阅(与 token 看板同一套堆叠语言)。
 * 金额单位「元」。
 */

const yuan = (n: number) => `¥${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

function RevenueTooltip(props: {
  active?: boolean;
  label?: string | number;
  payload?: Array<{ name?: string; value?: number | string; fill?: string }>;
}) {
  const { active, label, payload } = props;
  if (!active || !payload?.length) return null;
  const items = payload.filter((p) => Number(p.value) > 0);
  const total = payload.reduce((s, p) => s + (Number(p.value) || 0), 0);
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2 text-xs shadow-sm">
      <div className="mb-1 text-faint">{label}</div>
      {[...items].reverse().map((p, i) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-subtle">
            <span className="size-2 rounded-[2px]" style={{ backgroundColor: p.fill }} />
            {p.name}
          </span>
          <span className="tabular-nums text-foreground">{yuan(Number(p.value))}</span>
        </div>
      ))}
      {items.length > 1 && (
        <div className="mt-1 flex items-center justify-between gap-4 border-t border-border-soft pt-1 font-medium">
          <span className="text-subtle">合计</span>
          <span className="tabular-nums text-foreground">{yuan(total)}</span>
        </div>
      )}
    </div>
  );
}

export function RevenueChart({ daily }: { daily: AdminRevenueDay[] }) {
  const hasToday = daily.length > 0 && isTodayBucket(daily[daily.length - 1].date);
  return (
    <section className="mb-6 rounded-md border border-border bg-background p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold text-foreground">每日营收</h3>
        {hasToday && <span className="text-2xs text-faint">今日为进行中(半透明)</span>}
      </div>
      <div className="h-56">
        {daily.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-faint">窗口内还没有已支付订单</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={daily} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
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
                width={56}
                tickFormatter={(v: number) => `¥${v.toLocaleString()}`}
              />
              <Tooltip content={<RevenueTooltip />} cursor={{ fill: 'var(--color-surface-2)', fillOpacity: 0.6 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} iconType="square" iconSize={8} />
              <Bar dataKey="recharge" name="充值" stackId="rev" fill="var(--color-brand-green)">
                {daily.map((d) => (
                  <Cell key={d.date} fillOpacity={isTodayBucket(d.date) ? 0.45 : 1} />
                ))}
              </Bar>
              <Bar dataKey="subscription" name="订阅" stackId="rev" fill="var(--color-brand-amber)">
                {daily.map((d) => (
                  <Cell key={d.date} fillOpacity={isTodayBucket(d.date) ? 0.45 : 1} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
