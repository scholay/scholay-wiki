import {
  AlertTriangle,
  TrendingUp,
  Users,
  Wallet,
  ShoppingCart,
  Coins,
  Gift,
  type LucideIcon,
} from 'lucide-react';
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
import { TimeCell } from '../components/TimeCell';
import { useDashboardStats, type ChartDataPoint } from '../api/dashboard';
import { buildDailyTrend, localDateKey, withWeekday } from '@/shared/lib/daily-trend';
import { compactAxis, compactYuanAxis } from '@/shared/lib/chart-format';
import { chartTheme } from '@/shared/lib/theme-bridge';
import { toApiError } from '@/shared/lib/http';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';

export function DashboardPage() {
  const {
    data: stats,
    isLoading: l1,
    isError,
    error,
    refetch,
    isFetching,
    dataUpdatedAt,
  } = useDashboardStats();

  const fmt = (n?: number) => (typeof n === 'number' ? n.toLocaleString() : '—');
  /** 净额 = 毛额 - 退款额;毛额缺失时整格「—」,不拿 0 顶替。 */
  const net = (gross?: number, refunded?: number) =>
    typeof gross === 'number' ? gross - (refunded ?? 0) : undefined;
  // 后端 total_revenue 已经是"元",直接显示;若以后改为"分"再除 100。
  // min=max=2:三张营收卡竖排对比时右端要对齐,只设 max 会出现「¥1,234 / ¥1,234.5 / ¥1,234.56」参差。
  const money = (n?: number) =>
    typeof n === 'number'
      ? `¥${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : '—';

  return (
    <AdminPageLayout
      title="看板"
      description={
        <>
          平台核心指标 · 用户/订单/营收 一屏直观;在线 / DAU / 漏斗 移至 /analytics
          {/* 看板没有轮询、全局 refetchOnWindowFocus 也是关的 —— 不标时间的话,
              这一屏的数字可以停在几小时前而管理员毫无察觉(盯着看订单到账时尤其致命)。 */}
          {dataUpdatedAt > 0 && !isError && (
            <>
              {' · '}
              <TimeCell
                value={new Date(dataUpdatedAt).toISOString()}
                prefix="数据截至 "
                className="text-muted-foreground"
              />
            </>
          )}
        </>
      }
      onRefresh={() => void refetch()}
      refreshing={isFetching}
    >
      {/* 今日待办 —— 第一屏最显眼位置 */}
      <TodayPanel />

      {/* 🔴 取数失败必须显式说出来。否则 6 张卡全是「—」、三张图全是「窗口内还没有数据」,
          屏幕上「后端挂了」与「平台今天没人、没订单、没营收」完全不可区分,且没有重试入口。 */}
      {isError && (
        <section className="mt-6 rounded-16 border border-border bg-danger-soft p-4 flex items-start gap-3">
          <AlertTriangle className="size-4 shrink-0 text-brand-red" />
          <div className="min-w-0 flex-1">
            <div className="text-14 font-medium text-brand-red">
              看板数据加载失败 —— 下面的指标不可信
            </div>
            <div className="text-12 text-subtle break-words">{toApiError(error).message}</div>
          </div>
          <Button variant="outline" size="sm" className="shrink-0" onClick={() => void refetch()}>
            重试
          </Button>
        </section>
      )}

      {/* KPI 第一行 —— 增长与钱:用户 / 营收 / 订单 */}
      <section className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          icon={<Users />}
          label="总用户"
          value={fmt(stats?.total_users)}
          hint={`今日新增 ${fmt(stats?.new_users_today)} · 30 日 ${fmt(stats?.new_users_30d)}`}
          loading={l1}
          error={error}
        />
        <StatCard
          icon={<Wallet />}
          // 显示**净额**(毛额 - 退款额)。退款刻意不改 orders.status(见 migration 0107),
          // 毛额不会自己减下去 —— 直接拿毛额当收入会与订单页的净额对不上,退款越多差得越远。
          label="30 日营收(净)"
          value={money(net(stats?.revenue_30d, stats?.refunded_30d))}
          hint={
            (stats?.refunded_30d ?? 0) > 0
              ? `毛额 ${money(stats?.revenue_30d)} · 退款 ${money(stats?.refunded_30d)} · 今日净 ${money(net(stats?.revenue_today, stats?.refunded_today))}`
              : `今日 ${money(stats?.revenue_today)} · 累计 ${money(net(stats?.total_revenue, stats?.total_refunded))}`
          }
          loading={l1}
          error={error}
        />
        <StatCard
          icon={<ShoppingCart />}
          label="已支付订单"
          value={fmt(stats?.paid_orders)}
          hint={`待支付 ${fmt(stats?.pending_orders)} · 总 ${fmt(stats?.total_orders)}`}
          loading={l1}
          error={error}
        />
      </section>

      {/* KPI 第二行 —— 付费转化与成本:付费用户 / AI 成本 / 兑换码 */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
        <StatCard
          label="付费用户"
          value={fmt(stats?.paid_users)}
          hint={`Free ${fmt(stats?.free_users)}`}
          loading={l1}
          error={error}
        />
        {/* 这张卡刻意**保持 ¥ 为主单位** —— 它与「今日营收」并排,是毛利视角,换成算力点就没法跟营收比了。
            但补一行算力点换算(1 点 = ¥0.001,即 元 × 1000),让它与「算力用量」页的口径对得上。
            ⚠️ 这里曾写 `(cost_today_yuan ?? 0).toFixed(2)` —— 取不到数时显示「¥0.00」,
            与「今天 AI 一分钱没花」是完全不同的两个结论,却长得一模一样。一律走 money()/fmt() 的 '—'。 */}
        <StatCard
          icon={<Coins />}
          label="今日 AI 成本"
          value={money(stats?.cost_today_yuan)}
          hint={`≈ ${fmt(
            typeof stats?.cost_today_yuan === 'number'
              ? Math.round(stats.cost_today_yuan * 1000)
              : undefined
          )} 算力点 · 30 日 ${money(stats?.cost_30d_yuan)} · 明细见 算力用量`}
          loading={l1}
          error={error}
        />
        <StatCard
          icon={<Gift />}
          label="兑换码已核销"
          value={fmt(stats?.redeemed_codes)}
          hint={`总生成 ${fmt(stats?.total_codes)}`}
          loading={l1}
          error={error}
        />
      </section>

      {/* 趋势图 —— 近 30 天:增长(新增用户)/ 收入(营收)/ 成本(¥ 精算)并排 = 粗粒度经营视角 */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
        <TrendCard
          icon={Users}
          title="新增用户 · 30 天"
          data={stats?.user_growth_chart}
          loading={l1}
          error={error}
          onRetry={() => void refetch()}
          color="var(--color-brand-green)"
          yLabel="人"
        />
        <TrendCard
          icon={Wallet}
          title="营收(¥) · 30 天"
          data={stats?.revenue_trend_chart}
          loading={l1}
          error={error}
          onRetry={() => void refetch()}
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
          error={error}
          onRetry={() => void refetch()}
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
  error,
  onRetry,
  color,
  yLabel,
  gradientId,
  area = false,
}: {
  icon: LucideIcon;
  title: string;
  data?: ChartDataPoint[];
  loading?: boolean;
  /** query 的 error —— 传了就走错误态,**不会**退化成「窗口内还没有数据」 */
  error?: unknown;
  onRetry?: () => void;
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
      : `${Number(v).toLocaleString()}${yLabel ? ` ${yLabel} ` : ''}`;
  // 金额图在日成本不足 1 元时,写死 allowDecimals={false} 会让纵轴只剩 0 一个刻度、整条线贴零。
  // 同项目 token-usage/TokenDailyChart.tsx 已用 `peak < 10` 解决过。
  // 计数图(人)不放开小数 —— 「0.5 人」比贴零线更糟,所以只对 ¥ 放开。
  const peak = Math.max(0, ...(data ?? []).map((d) => Number(d.value) || 0));
  const allowDecimals = yLabel === '¥' && peak < 10;
  // Y 轴刻度紧凑化(¥1.2k / 3.4M),配合 margin.left=0 防长数字裁切;完整值仍在 Tooltip。
  // 放开小数时 recharts 会给出 0.30000000000000004 这种刻度,compactAxis 对 <1000 是原样输出,
  // 会直接把轴撑爆 —— 故此档单独定到 2 位(峰值 <10,最长也就 "¥9.99")。
  const yTickFmt =
    yLabel === '¥'
      ? (v: number) => (allowDecimals ? `¥${Number(v).toFixed(2)}` : compactYuanAxis(v))
      : compactAxis;
  const errMsg = error ? toApiError(error).message || '加载失败' : null;
  return (
    <div className="rounded-16 border border-border bg-surface-card p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-14 font-medium text-foreground">{title}</h3>
        <div className="flex items-center gap-2">
          {isLive && !errMsg && <span className="text-12 text-faint">— — 今日(进行中)</span>}
          <Icon className="size-3.5 text-faint" />
        </div>
      </div>
      <div className="h-48">
        {errMsg ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-center">
            <AlertTriangle className="size-4 text-brand-red" />
            <span className="text-12 text-brand-red">加载失败</span>
            <span className="text-12 text-faint max-w-full truncate" title={errMsg}>
              {errMsg}
            </span>
            {onRetry && (
              <Button variant="outline" size="sm" onClick={onRetry}>
                重试
              </Button>
            )}
          </div>
        ) : loading ? (
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
                <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v: string) => (v?.length >= 10 ? v.slice(5) : v)}
                  tick={{ fontSize: chartTheme.fontSize, fill: chartTheme.axis }}
                  tickLine={false}
                  axisLine={{ stroke: chartTheme.grid }}
                  minTickGap={24}
                />
                <YAxis
                  allowDecimals={allowDecimals}
                  tickFormatter={yTickFmt}
                  tick={{ fontSize: chartTheme.fontSize, fill: chartTheme.axis }}
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
                <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v: string) => (v?.length >= 10 ? v.slice(5) : v)}
                  tick={{ fontSize: chartTheme.fontSize, fill: chartTheme.axis }}
                  tickLine={false}
                  axisLine={{ stroke: chartTheme.grid }}
                  minTickGap={24}
                />
                <YAxis
                  allowDecimals={allowDecimals}
                  tickFormatter={yTickFmt}
                  tick={{ fontSize: chartTheme.fontSize, fill: chartTheme.axis }}
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

const tooltipStyle: React.CSSProperties = chartTheme.tooltip;
const tooltipLabelStyle: React.CSSProperties = {
  color: 'var(--color-muted-foreground)',
  fontSize: chartTheme.fontSize,
  marginBottom: 2,
};
