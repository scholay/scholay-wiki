import { TrendingUp, Users, Wallet, ShoppingCart, type LucideIcon } from 'lucide-react';
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

      {/* KPI 第一行 —— 用户/订单/营收 */}
      <section className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {l1 ? (
          [...Array(3)].map((_, i) => <Skeleton key={i} className="h-28 rounded-md" />)
        ) : (
          <>
            <StatCard
              icon={<Users />}
              label="总用户"
              value={fmt(stats?.total_users)}
              hint={`今日新增 ${fmt(stats?.new_users_today)} · 30 日 ${fmt(stats?.new_users_30d)}`}
            />
            <StatCard
              icon={<ShoppingCart />}
              label="已支付订单"
              value={fmt(stats?.paid_orders)}
              hint={`总订单 ${fmt(stats?.total_orders)} · 待支付 ${fmt(stats?.pending_orders)}`}
            />
            <StatCard
              icon={<Wallet />}
              label="累计营收"
              value={money(stats?.total_revenue)}
              hint={`30 日 ${money(stats?.revenue_30d)} · 今日 ${money(stats?.revenue_today)}`}
            />
          </>
        )}
      </section>

      {/* KPI 第二行 —— 业务量(对话、付费比、优惠券) */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
        {l1 ? (
          [...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-md" />)
        ) : (
          <>
            <StatCard
              label="付费用户"
              value={fmt(stats?.paid_users)}
              hint={`Free ${fmt(stats?.free_users)}`}
            />
            <StatCard
              label="对话总数"
              value={fmt(stats?.total_conversations)}
              hint={`今日 ${fmt(stats?.conversations_today)}`}
            />
            <StatCard
              label="优惠券"
              value={fmt(stats?.used_coupons)}
              hint={`未使用 ${fmt(stats?.unused_coupons)} / 总 ${fmt(stats?.total_coupons)}`}
            />
            <StatCard
              label="三方账号"
              value={fmt(stats?.third_party_accounts)}
              hint="AI / 学术数据源 API key 池"
            />
          </>
        )}
      </section>

      {/* 趋势图 —— 近 30 天 用户增长 / 已支付订单 / 营收 (后端 dashboard_handler 已聚合) */}
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
          icon={ShoppingCart}
          title="已支付订单 · 30 天"
          data={stats?.order_trend_chart}
          loading={l1}
          color="var(--color-brand-amber)"
          yLabel="单"
        />
        <TrendCard
          icon={Wallet}
          title="营收(¥) · 30 天"
          data={stats?.revenue_trend_chart}
          loading={l1}
          color="var(--color-brand-red)"
          yLabel="¥"
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
  area = false,
}: {
  icon: LucideIcon;
  title: string;
  data?: ChartDataPoint[];
  loading?: boolean;
  color: string;
  yLabel: string;
  /** true 走面积图(更醒目),false 走纯线图 */
  area?: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-background p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-foreground">{title}</h3>
        <Icon className="size-3.5 text-faint" />
      </div>
      <div className="h-56">
        {loading ? (
          <Skeleton className="h-full w-full" />
        ) : !data || data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-faint">
            <TrendingUp className="size-3.5 mr-1 inline" />
            窗口内还没有数据
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {area ? (
              <AreaChart data={data} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id={`grad-${yLabel}`} x1="0" y1="0" x2="0" y2="1">
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
                  tick={{ fontSize: 11, fill: 'var(--color-faint)' }}
                  tickLine={false}
                  axisLine={false}
                  width={48}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelStyle={tooltipLabelStyle}
                  itemStyle={{ color: 'var(--color-foreground)' }}
                  formatter={(v) => [`${yLabel}${Number(v ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`, '']}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={color}
                  strokeWidth={2}
                  fill={`url(#grad-${yLabel})`}
                />
              </AreaChart>
            ) : (
              <LineChart data={data} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
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
                  tick={{ fontSize: 11, fill: 'var(--color-faint)' }}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelStyle={tooltipLabelStyle}
                  itemStyle={{ color: 'var(--color-foreground)' }}
                  formatter={(v) => [`${Number(v ?? 0).toLocaleString()} ${yLabel}`, '']}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={color}
                  strokeWidth={2}
                  dot={{ r: 2, fill: color, strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
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
