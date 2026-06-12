import { useState } from 'react';
import {
  Activity,
  CalendarRange,
  Clock,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Skeleton } from '@/shared/ui/skeleton';
import { buildDailyTrend, localDateKey } from '@/shared/lib/daily-trend';
import { useUserMetrics } from '../api/user-metrics';

/**
 * UserMetricsPanel —— admin /users 顶部 4 张图。
 *
 * 图表全部走 recharts(声明式,自带坐标轴 / Tooltip / Legend / 响应式)。
 *   注册量   → AreaChart   面积折线
 *   渠道占比 → PieChart    圆环 + 右侧 Legend
 *   24h 活跃 → BarChart    柱状,X 轴格式化为 "h:00"
 *   MAU 趋势 → LineChart   折线,带点
 *
 * 数据从 GET /admin/users/metrics 一次拉,客户端不再二次聚合。
 */
export function UserMetricsPanel() {
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const { data, isLoading } = useUserMetrics(days, 'day');

  return (
    <section className="mb-6 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-foreground">用户分析</h2>
        <RangeTabs value={days} onChange={setDays} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <ChartCard icon={UserPlus} title={`注册量 · 最近 ${days} 天`} loading={isLoading}>
          {data && data.registrations.length > 0 ? (
            <RegistrationsArea data={data.registrations} />
          ) : (
            <Empty hint="窗口内没有新注册" />
          )}
        </ChartCard>

        <ChartCard icon={Activity} title="注册渠道占比" loading={isLoading}>
          {data && data.sources.length > 0 ? (
            <SourcesDonut data={data.sources} />
          ) : (
            <Empty hint="还没有可用渠道数据" />
          )}
        </ChartCard>

        <ChartCard icon={Clock} title="24h 活跃时段分布" loading={isLoading}>
          {data && data.hourly_activity.length > 0 ? (
            <HourlyBarChart data={data.hourly_activity} />
          ) : (
            <Empty hint="该窗口内无登录记录" />
          )}
        </ChartCard>

        <ChartCard icon={CalendarRange} title="MAU · 最近 12 个月" loading={isLoading}>
          {data && data.mau_trend.length > 0 ? (
            <MAULine data={data.mau_trend} />
          ) : (
            <Empty hint="历史月份还没有数据" />
          )}
        </ChartCard>
      </div>
    </section>
  );
}

// ----------------- 通用 -----------------

function RangeTabs({
  value,
  onChange,
}: {
  value: 7 | 30 | 90;
  onChange: (v: 7 | 30 | 90) => void;
}) {
  const opts: Array<{ v: 7 | 30 | 90; label: string }> = [
    { v: 7, label: '7 天' },
    { v: 30, label: '30 天' },
    { v: 90, label: '90 天' },
  ];
  return (
    <div className="inline-flex rounded-pill border border-border bg-background p-0.5">
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={`px-3 h-7 text-xs rounded-pill transition-colors ${
            value === o.v
              ? 'bg-foreground text-background'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ChartCard({
  icon: Icon,
  title,
  loading,
  children,
}: {
  icon: LucideIcon;
  title: string;
  loading?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border bg-background p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-foreground">{title}</h3>
        <Icon className="size-3.5 text-faint" />
      </div>
      <div className="h-56">{loading ? <Skeleton className="h-full w-full" /> : children}</div>
    </div>
  );
}

function Empty({ hint }: { hint: string }) {
  return <div className="h-full flex items-center justify-center text-xs text-faint">{hint}</div>;
}

// recharts 主题色 —— 直接消费 CSS 变量, 跟 design token 同源
const COLOR_GREEN = 'var(--color-brand-green)';
const COLOR_RED = 'var(--color-brand-red)';
const COLOR_AMBER = 'var(--color-brand-amber)';
const GRID_COLOR = 'var(--color-border)';
const AXIS_COLOR = 'var(--color-faint)';

// Tooltip 全局样式
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

// ----------------- 注册量(Area)-----------------

function RegistrationsArea({ data }: { data: Array<{ date: string; value: number }> }) {
  // 最后一桶=今天(进行中)→ 实线到昨天 + 虚线段连今天。
  const { data: rows, isLive } = buildDailyTrend(data, { valueKeys: ['value'] });
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={rows} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="regGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COLOR_GREEN} stopOpacity={0.35} />
            <stop offset="100%" stopColor={COLOR_GREEN} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={(v) => (typeof v === 'string' && v.length >= 10 ? v.slice(5) : v)}
          tick={{ fontSize: 11, fill: AXIS_COLOR }}
          tickLine={false}
          axisLine={{ stroke: GRID_COLOR }}
          minTickGap={20}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 11, fill: AXIS_COLOR }}
          tickLine={false}
          axisLine={false}
          width={40}
        />
        <Tooltip content={<MetricTooltip name="新注册" />} />
        <Area
          type="monotone"
          dataKey="value__main"
          stroke={COLOR_GREEN}
          strokeWidth={2}
          fill="url(#regGrad)"
          connectNulls={false}
        />
        {isLive && (
          <Area
            type="monotone"
            dataKey="value__live"
            stroke={COLOR_GREEN}
            strokeWidth={2}
            strokeDasharray="5 4"
            fill="none"
            connectNulls={false}
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** UserMetrics 图共用 Tooltip —— main/live 拆分后 dataKey 变了,读原始 value。 */
function MetricTooltip({
  active,
  payload,
  label,
  name,
}: {
  active?: boolean;
  payload?: Array<{ payload?: { date: string; value: number } }>;
  label?: string | number;
  name: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div style={tooltipStyle}>
      <div style={tooltipLabelStyle}>{String(label ?? row.date)}</div>
      <div style={{ color: 'var(--color-foreground)' }}>
        {name} {Number(row.value ?? 0).toLocaleString()}
      </div>
    </div>
  );
}

// ----------------- 渠道占比(Donut)-----------------

const PROVIDER_LABEL: Record<string, string> = {
  email: '邮箱',
  phone: '手机',
  wechat: '微信',
  google: 'Google',
  github: 'GitHub',
  microsoft: 'Microsoft',
  apple: 'Apple',
  orcid: 'ORCID',
  unknown: '未知',
};

const PIE_PALETTE = [
  COLOR_GREEN,
  COLOR_RED,
  COLOR_AMBER,
  '#3B82F6',
  '#8B5CF6',
  '#EC4899',
  '#10B981',
  '#F97316',
];

function SourcesDonut({ data }: { data: Array<{ name: string; value: number }> }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const display = data.map((d) => ({
    ...d,
    label: PROVIDER_LABEL[d.name] || d.name,
  }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={display}
          dataKey="value"
          nameKey="label"
          cx="40%"
          cy="50%"
          innerRadius={45}
          outerRadius={75}
          paddingAngle={2}
          strokeWidth={0}
        >
          {display.map((_, i) => (
            <Cell key={i} fill={PIE_PALETTE[i % PIE_PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={tooltipStyle}
          labelStyle={tooltipLabelStyle}
          itemStyle={{ color: 'var(--color-foreground)' }}
          formatter={(value) => {
            const n = Number(value ?? 0);
            return [
              `${n.toLocaleString()} (${total > 0 ? ((n / total) * 100).toFixed(1) : 0}%)`,
              '注册数',
            ];
          }}
        />
        <Legend
          layout="vertical"
          align="right"
          verticalAlign="middle"
          iconType="square"
          iconSize={8}
          wrapperStyle={{ fontSize: 11, color: 'var(--color-subtle)' }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ----------------- 24h 活跃(Bar)-----------------

function HourlyBarChart({ data }: { data: Array<{ hour: number; value: number }> }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
        <XAxis
          dataKey="hour"
          tickFormatter={(v) => `${v}:00`}
          tick={{ fontSize: 11, fill: AXIS_COLOR }}
          tickLine={false}
          axisLine={{ stroke: GRID_COLOR }}
          interval={2}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 11, fill: AXIS_COLOR }}
          tickLine={false}
          axisLine={false}
          width={40}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          labelStyle={tooltipLabelStyle}
          itemStyle={{ color: 'var(--color-foreground)' }}
          formatter={(v) => [Number(v ?? 0).toLocaleString(), '活跃用户']}
          labelFormatter={(label) => `${label}:00 时段`}
        />
        <Bar dataKey="value" fill={COLOR_GREEN} radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ----------------- MAU(Line)-----------------

function MAULine({ data }: { data: Array<{ date: string; value: number }> }) {
  // 月度:最后一桶=当前月(进行中,不足整月)→ 传 today=YYYY-MM 让本月画虚线段。
  const { data: rows, isLive } = buildDailyTrend(data, {
    valueKeys: ['value'],
    today: localDateKey().slice(0, 7),
  });
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={rows} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: AXIS_COLOR }}
          tickLine={false}
          axisLine={{ stroke: GRID_COLOR }}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 11, fill: AXIS_COLOR }}
          tickLine={false}
          axisLine={false}
          width={40}
        />
        <Tooltip content={<MetricTooltip name="MAU" />} />
        <Line
          type="monotone"
          dataKey="value__main"
          stroke={COLOR_RED}
          strokeWidth={2}
          dot={{ r: 3, fill: COLOR_RED, strokeWidth: 0 }}
          activeDot={{ r: 5 }}
          connectNulls={false}
        />
        {isLive && (
          <Line
            type="monotone"
            dataKey="value__live"
            stroke={COLOR_RED}
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={{ r: 3, fill: COLOR_RED, strokeWidth: 0 }}
            connectNulls={false}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
