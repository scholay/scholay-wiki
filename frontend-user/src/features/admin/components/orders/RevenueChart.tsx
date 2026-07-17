import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { isTodayBucket, withWeekday } from '@/shared/lib/daily-trend';
import { compactYuanAxis } from '@/shared/lib/chart-format';
import { cn } from '@/shared/lib/utils';
import type { AdminRevenueDay } from '../../api/orders';

/**
 * 每日营收趋势 —— 充值(绿)/ 订阅(琥珀)**堆叠面积**(旧版是堆叠柱,改面积更能体现走势,
 * 90 天窗口也不再拥挤)。金额单位「元」。
 *
 * 头部自带:近 N 天**区间总计**(总营收 + 充值/订阅拆分)+ 7/30/90 天筛选(与整页 days 同一状态,
 * 也驱动上方 KPI 与下方订单表)。今日为进行中 → 一条竖向虚线标注,不当最终值看。
 */

const DAY_PRESETS = [7, 30, 90];

const yuan = (n?: number) =>
  typeof n === 'number' ? `¥${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '¥0';

function RevenueTooltip(props: {
  active?: boolean;
  label?: string | number;
  payload?: Array<{ name?: string; value?: number | string; stroke?: string; color?: string }>;
}) {
  const { active, label, payload } = props;
  if (!active || !payload?.length) return null;
  const items = payload.filter((p) => Number(p.value) > 0);
  const total = payload.reduce((s, p) => s + (Number(p.value) || 0), 0);
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2 text-xs shadow-sm">
      <div className="mb-1 text-faint">{withWeekday(String(label ?? ''), label)}</div>
      {[...items].reverse().map((p, i) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-subtle">
            <span className="size-2 rounded-[2px]" style={{ backgroundColor: p.color ?? p.stroke }} />
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

export function RevenueChart({
  daily,
  days,
  onDaysChange,
  totalRevenue,
  totalRecharge,
  totalSubscription,
  totalOrders,
}: {
  daily: AdminRevenueDay[];
  days: number;
  onDaysChange: (d: number) => void;
  /** 区间总计(后端 totals.revenue / recharge_revenue / subscription_revenue / paid_count) */
  totalRevenue?: number;
  totalRecharge?: number;
  totalSubscription?: number;
  /** 区间内已支付订单数(totals.paid_count)—— 与营收总计口径一致(都是 paid)。 */
  totalOrders?: number;
}) {
  const todayBucket = daily.find((d) => isTodayBucket(d.date))?.date;

  return (
    <section className="mb-6 rounded-md border border-border bg-background p-4">
      {/* 头部:标题 + 区间总计 · 右侧 7/30/90 筛选 */}
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-foreground">每日营收 · 趋势</h3>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <span className="text-lg font-bold tabular-nums text-foreground">{yuan(totalRevenue)}</span>
            <span className="text-2xs text-faint">近 {days} 天总计</span>
            <span className="text-2xs tabular-nums text-subtle">
              订单 {(totalOrders ?? 0).toLocaleString()} 笔
            </span>
            <span className="text-2xs tabular-nums" style={{ color: 'var(--color-brand-green)' }}>
              充值 {yuan(totalRecharge)}
            </span>
            <span className="text-2xs tabular-nums" style={{ color: 'var(--color-brand-amber)' }}>
              订阅 {yuan(totalSubscription)}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          {DAY_PRESETS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onDaysChange(d)}
              className={cn(
                'h-7 rounded-md px-2.5 text-xs font-medium transition-colors',
                d === days
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:bg-surface-1 hover:text-foreground'
              )}
            >
              近{d}天
            </button>
          ))}
        </div>
      </div>

      <div className="h-56">
        {daily.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-faint">窗口内还没有已支付订单</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={daily} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="rechargeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-brand-green)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--color-brand-green)" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="subscriptionGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-brand-amber)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--color-brand-amber)" stopOpacity={0.02} />
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
                width={44}
                tickFormatter={compactYuanAxis}
              />
              <Tooltip content={<RevenueTooltip />} cursor={{ stroke: 'var(--color-border)' }} />
              <Legend wrapperStyle={{ fontSize: 11 }} iconType="square" iconSize={8} />
              {todayBucket && (
                <ReferenceLine
                  x={todayBucket}
                  stroke="var(--color-faint)"
                  strokeDasharray="4 4"
                  label={{ value: '今日', position: 'insideTopRight', fontSize: 10, fill: 'var(--color-faint)' }}
                />
              )}
              <Area
                type="monotone"
                dataKey="recharge"
                name="充值"
                stackId="rev"
                stroke="var(--color-brand-green)"
                strokeWidth={2}
                fill="url(#rechargeGrad)"
              />
              <Area
                type="monotone"
                dataKey="subscription"
                name="订阅"
                stackId="rev"
                stroke="var(--color-brand-amber)"
                strokeWidth={2}
                fill="url(#subscriptionGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
