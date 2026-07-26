import { TrendingUp, Users, Wallet, ShoppingCart, Coins, Gift, type LucideIcon } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { StatCard } from '../components/StatCard';
import { TodayPanel } from '../components/TodayPanel';
import { useDashboardStats, type ChartDataPoint } from '../api/dashboard';
import { buildDailyTrend, localDateKey, withWeekday } from '@/shared/lib/daily-trend';
import { compactAxis, compactYuanAxis } from '@/shared/lib/chart-format';
import { Skeleton } from '@/shared/ui/skeleton';

export function DashboardPage() {
  const { data: stats, isLoading: l1 } = useDashboardStats();

  const fmt = (n?: number) => (typeof n === 'number' ? n.toLocaleString() : '—');
  // 后端 total_revenue 已经是"元",直接显示;若以后改为"分"再除 100
  const money = (n?: number) =>
    typeof n === 'number' ? `¥${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—';

  return (
    <AdminPageLayout
      title="看板"
      description="平台核心指标 · 用户/订单/营收 一屏直观;在线 / DAU / 漏斗 移至 /analytics"
    >
      {/* 今日待办 —— 第一屏最显眼位置 */}
      <TodayPanel />

      {/* KPI 第一行 —— 增长与钱:用户 / 营收 / 订单 */}
      <section className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {l1 ? (
          [...Array(3)].map((_, i) => <Skeleton key={i} className="h-28 rounded-16" />)
        ) : (
          <>
            <StatCard
              icon={<Users />}
              label="总用户"
              value={fmt(stats?.total_users)}
              hint={`今日新增 ${fmt(stats?.new_users_today)} · 30 日 ${fmt(stats?.new_users_30d)}`}
            />
            <StatCard
              icon={<Wallet />}
              label="30 日营收"
              value={money(stats?.revenue_30d)}
              hint={`今日 ${money(stats?.revenue_today)} · 累计 ${money(stats?.total_revenue)}`}
            />
            <StatCard
              icon={<ShoppingCart />}
              label="已支付订单"
              value={fmt(stats?.paid_orders)}
              hint={`待支付 ${fmt(stats?.pending_orders)} · 总 ${fmt(stats?.total_orders)}`}
            />
          </>
        )}
      </section>

      {/* KPI 第二行 —— 付费转化与成本:付费用户 / AI 成本 / 兑换码 */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
        {l1 ? (
          [...Array(3)].map((_, i) => <Skeleton key={i} className="h-28 rounded-16" />)
        ) : (
          <>
            <StatCard
              label="付费用户"
              value={fmt(stats?.paid_users)}
              hint={`Free ${fmt(stats?.free_users)}`}
            />
            <StatCard
              icon={<Coins />}
              label="今日 AI 成本"
              value={`¥${(stats?.cost_today_yuan ?? 0).toFixed(2)}`}
              hint={`30 日 ¥${(stats?.cost_30d_yuan ?? 0).toFixed(2)} · 明细见 Token 用量`}
            />
            <StatCard
              icon={<Gift />}
              label="兑换码已核销"
              value={fmt(stats?.redeemed_codes)}
              hint={`总生成 ${fmt(stats?.total_codes)}`}
            />
          </>
        )}
      </section>

      {/* 趋势图 —— 近 30 天:增长(新增用户)/ 收入(营收)/ 成本(¥ 精算)并排 = 粗粒度经营视角 */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
        <TrendCard
          icon={Users}
          title="新增用户 · 30 天"
          data={stats?.user_growth_chart}
          loading={l1}
          color="var(--color-brand-green)"
          yLabel="人"
        />
        <TrendCard
          icon={Wallet}
          title="营收(¥) · 30 天"
          data={stats?.revenue_trend_chart}
          loading={l1}
          color="var(--color-brand-red)"
          yLabel="¥"
          gradientId="grad-revenue"
          area
        />
        <TrendCard
          icon={Coins}
          title="AI 成本(¥) · 30 天"
          data={stats?.cost_trend_chart}
          loading={l1}
          color="var(--color-brand-amber)"
          yLabel="¥"
          gradientId="grad-cost"
          area
        />
      </section>
    </AdminPageLayout>
  );
}

function TrendCard({
  icon: Icon,
  title,
  data,
  loading,
  color,
  yLabel,
  gradientId,
  area = false,
}: {
  icon: LucideIcon;
  title: string;
  data?: ChartDataPoint[];
  loading?: boolean;
  color: string;
  yLabel: string;
  /** 面积图渐变 id(必须全页唯一;yLabel 可能含非法字符/为空,不能用它拼 id) */
  gradientId?: string;
  /** true 走面积图(更醒目),false 走纯线图 */
  area?: boolean;
}) {
  const gradId = gradientId ?? `grad-${yLabel}`;
  const { data: rows, isLive } = buildDailyTrend(data ?? [], { valueKeys: ['value'] });
  const fmt = (v: number) =>
    yLabel === '¥'
      ? `¥${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
      : `${Number(v).toLocaleString()}${yLabel ? ` ${yLabel}` : ''}`;
  // Y 轴刻度紧凑化(¥1.2k / 3.4M),配合 margin.left=0 防长数字裁切;完整值仍在 Tooltip。
  const yTickFmt = yLabel === '¥' ? compactYuanAxis : compactAxis;
  return (
    <div className="rounded-16 border border-border bg-surface-card p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-14 font-medium text-foreground">{title}</h3>
        <div className="flex items-center gap-2">
          {isLive && <span className="text-12 text-faint">— — 今日(进行中)</span>}
          <Icon className="size-3.5 text-faint" />
        </div>
      </div>
      <div className="h-48">
        {loading ? (
          <Skeleton className="h-full w-full" />
        ) : !data || data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-12 text-faint">
            <TrendingUp className="size-3.5 mr-1 inline" />
            窗口内还没有数据
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {area ? (
              <AreaChart data={rows} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v: string) => (v?.length >= 10 ? v.slice(5) : v)}
                  tick={{ fontSize: 11, fill: 'var(--color-faint)' }}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--color-border)' }}
                  minTickGap={24}
                />
                <YAxis
                  allowDecimals={false}
                  tickFormatter={yTickFmt}
                  tick={{ fontSize: 11, fill: 'var(--color-faint)' }}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                />
                <Tooltip content={<TrendTooltip fmt={fmt} />} />
                <Area
                  type="monotone"
                  dataKey="value__main"
                  stroke={color}
                  strokeWidth={2}
                  fill={`url(#${gradId})`}
                  connectNulls={false}
                />
                {isLive && (
                  <Line
                    type="monotone"
                    dataKey="value__live"
                    stroke={color}
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    dot={false}
                    connectNulls={false}
                  />
                )}
              </AreaChart>
            ) : (
              <LineChart data={rows} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v: string) => (v?.length >= 10 ? v.slice(5) : v)}
                  tick={{ fontSize: 11, fill: 'var(--color-faint)' }}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--color-border)' }}
                  minTickGap={24}
                />
                <YAxis
                  allowDecimals={false}
                  tickFormatter={yTickFmt}
                  tick={{ fontSize: 11, fill: 'var(--color-faint)' }}
                  tickLine={false}
                  axisLine={false}
                  width={38}
                />
                <Tooltip content={<TrendTooltip fmt={fmt} />} />
                <Line
                  type="monotone"
                  dataKey="value__main"
                  stroke={color}
                  strokeWidth={2}
                  dot={{ r: 2, fill: color, strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                  connectNulls={false}
                />
                {isLive && (
                  <Line
                    type="monotone"
                    dataKey="value__live"
                    stroke={color}
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    dot={{ r: 2, fill: color, strokeWidth: 0 }}
                    connectNulls={false}
                  />
                )}
              </LineChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

/** 趋势图自定义 Tooltip —— 读原始 value(main/live 拆分后 dataKey 变了),今日桶标注"进行中"。 */
function TrendTooltip({
  active,
  payload,
  label,
  fmt,
}: {
  active?: boolean;
  payload?: Array<{ payload?: ChartDataPoint }>;
  label?: string | number;
  fmt: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const isToday = String(row.date) === localDateKey();
  return (
    <div style={tooltipStyle}>
      <div style={tooltipLabelStyle}>
        {withWeekday(String(label ?? row.date), row.date)}
        {isToday && <span className="ml-1 text-brand-amber">· 进行中</span>}
      </div>
      <div style={{ color: 'var(--color-foreground)' }}>{fmt(Number(row.value ?? 0))}</div>
    </div>
  );
}

const tooltipStyle: React.CSSProperties = {
  backgroundColor: 'var(--color-background)',
  border: '1px solid var(--color-border)',
  borderRadius: 6,
  fontSize: 12,
  padding: '6px 10px',
  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
};
const tooltipLabelStyle: React.CSSProperties = {
  color: 'var(--color-muted-foreground)',
  fontSize: 11,
  marginBottom: 2,
};
