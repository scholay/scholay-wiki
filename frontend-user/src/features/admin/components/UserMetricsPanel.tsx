import { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CalendarRange,
  Clock,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
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
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { toApiError } from '@/shared/lib/http';
import { buildDailyTrend, localDateKey, withWeekday } from '@/shared/lib/daily-trend';
import { compactAxis } from '@/shared/lib/chart-format';
import { chartSeriesColor, chartTheme } from '@/shared/lib/theme-bridge';
import { useUserMetrics } from '../api/user-metrics';

/**
 * UserMetricsPanel —— admin /users 顶部 4 张图。
 *
 * 图表全部走 recharts(声明式,自带坐标轴 / Tooltip / Legend / 响应式)。
 *   注册量+活跃 → ComposedChart 面积(注册,左轴)+ 折线(engaged-DAU,右轴)合并同一横轴
 *   渠道占比    → PieChart      圆环 + 右侧 Legend
 *   24h 活跃    → BarChart      柱状,X 轴格式化为 "h:00"
 *   MAU 趋势    → LineChart     折线,带点
 *
 * 数据从 GET /admin/users/metrics 一次拉,客户端不再二次聚合。
 * Y 轴刻度统一 compactAxis(1.2k/3.4M)+ margin.left=0,避免长数字被裁("展示不全")。
 */
export function UserMetricsPanel() {
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const { data, isLoading, error, refetch } = useUserMetrics(days, 'day');
  // 四张图共用同一个 query —— 一挂全挂。error 必须传下去:否则四张图会渲染
  // 「窗口内暂无注册 / 活跃记录」「该窗口内无登录记录」这类**肯定的业务结论**,
  // 而真相是接口没回来。运营据此汇报"这周一个新用户都没有"是可能发生的。
  const retry = () => void refetch();

  return (
    <section className="mb-6 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-16 font-medium text-foreground">用户分析</h2>
        <RangeTabs value={days} onChange={setDays} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <ChartCard
          icon={UserPlus}
          title={`注册量 · 活跃用户 · 最近 ${days} 天`}
          loading={isLoading}
          error={error}
          onRetry={retry}
          hint="面积=当日新注册;折线=当日去重活跃用户(打开即活跃,不含注册当天)。两者共用同一纵轴,可勾选下方开关单看某条"
          stat={
            data ? (
              <WindowTotals
                reg={data.registrations_total}
                active={data.active_total}
                days={days}
              />
            ) : undefined
          }
        >
          {data && (data.registrations.length > 0 || data.daily_active.length > 0) ? (
            <RegistrationsAndActive reg={data.registrations} dau={data.daily_active} />
          ) : (
            <Empty hint="窗口内暂无注册 / 活跃记录" />
          )}
        </ChartCard>

        <ChartCard icon={Activity} title="注册渠道占比" loading={isLoading} error={error} onRetry={retry}>
          {data && data.sources.length > 0 ? (
            <SourcesDonut data={data.sources} />
          ) : (
            <Empty hint="还没有可用渠道数据" />
          )}
        </ChartCard>

        <ChartCard icon={Clock} title="24h 活跃时段分布" loading={isLoading} error={error} onRetry={retry}>
          {data && data.hourly_activity.length > 0 ? (
            <HourlyBarChart data={data.hourly_activity} />
          ) : (
            <Empty hint="该窗口内无登录记录" />
          )}
        </ChartCard>

        <ChartCard icon={CalendarRange} title="MAU · 最近 12 个月" loading={isLoading} error={error} onRetry={retry}>
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
    <div className="inline-flex rounded-pill border border-border bg-surface-card p-0.5">
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={`px-3 h-7 text-12 rounded-pill transition-colors ${
            value === o.v
              ? 'bg-foreground text-on-dark'
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
  hint,
  stat,
  loading,
  error,
  onRetry,
  children,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  /** 标题右侧的「本区间总量」等小统计(可选)。 */
  stat?: React.ReactNode;
  loading?: boolean;
  /**
   * query 的 error —— **必须透传**。不传的话请求失败时 data 是 undefined,
   * 会和"窗口内真的没数据"一样落进 `<Empty/>`,图表区就写着
   * 「窗口内暂无注册 / 活跃记录」—— 一个肯定的业务结论,而事实是接口挂了。
   */
  error?: unknown;
  onRetry?: () => void;
  children?: React.ReactNode;
}) {
  // 顺序:error 先于 loading —— react-query 自动重试期间 isLoading/isFetching 会再次为 true,
  // 若 loading 先判,失败会被骨架屏永久盖住。
  const errMsg = error ? toApiError(error).message || '加载失败' : null;
  return (
    <div className="rounded-16 border border-border bg-surface-card p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-14 font-medium text-foreground">{title}</h3>
          {hint && <p className="mt-0.5 text-12 text-faint">{hint}</p>}
        </div>
        {errMsg ? (
          <AlertTriangle className="size-3.5 shrink-0 text-brand-red" />
        ) : (
          stat ?? <Icon className="size-3.5 shrink-0 text-faint" />
        )}
      </div>
      <div className="h-52">
        {errMsg ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
            <span className="text-12 text-brand-red">加载失败:{errMsg}</span>
            <span className="text-12 text-faint">这不代表窗口内没有数据。</span>
            {onRetry && (
              <Button variant="outline" size="sm" onClick={onRetry}>
                重试
              </Button>
            )}
          </div>
        ) : loading ? (
          <Skeleton className="h-full w-full" />
        ) : (
          children
        )}
      </div>
    </div>
  );
}

/** 「本区间总量」—— 注册总数(绿)+ 去重活跃总数(琥珀)。放注册/活跃图标题右侧。 */
function WindowTotals({ reg, active, days }: { reg: number; active: number; days: number }) {
  return (
    <div className="shrink-0 text-right">
      <div className="text-12 text-faint">近 {days} 天总计</div>
      <div className="mt-0.5 flex items-baseline justify-end gap-2 tabular-nums">
        <span className="text-12 font-medium" style={{ color: COLOR_GREEN }}>
          注册 {reg.toLocaleString()}
        </span>
        <span className="text-12 font-medium" style={{ color: COLOR_AMBER }}>
          活跃 {active.toLocaleString()}
        </span>
      </div>
    </div>
  );
}

function Empty({ hint }: { hint: string }) {
  return <div className="h-full flex items-center justify-center text-12 text-faint">{hint}</div>;
}

// 语义色 —— 直接消费 CSS 变量(passthrough),跟 design token 同源。
// 网格/轴/字号/Tooltip 走 theme-bridge 的 chartTheme。
// ✅ 2026-07 已全站收口:orders/RevenueChart 与 token-usage/TokenDailyChart 也已改用
//    chartTheme.grid / .axis / .fontSize(原先裸写 fontSize 11/10 + var(--color-border))。
//    那两张图的 Tooltip 仍是 custom content(Tailwind token 类名渲染),不走 chartTheme.tooltip
//    —— 它们要逐段列值 + 合计,不是 recharts 内置 tooltip 能表达的,属有意分叉。
const COLOR_GREEN = 'var(--color-brand-green)';
const COLOR_RED = 'var(--color-brand-red)';
const COLOR_AMBER = 'var(--color-brand-amber)';
const GRID_COLOR = chartTheme.grid;
const AXIS_COLOR = chartTheme.axis;

const tooltipStyle: React.CSSProperties = chartTheme.tooltip;
const tooltipLabelStyle: React.CSSProperties = {
  color: 'var(--color-muted-foreground)',
  fontSize: chartTheme.fontSize,
  marginBottom: 2,
};

// ----------------- 注册量 + 每日活跃(合并 · 双轴 ComposedChart)-----------------

type MetricsPoint = { date: string; value: number };

/**
 * 注册量(面积,绿)与 engaged-DAU(折线,琥珀)合并到同一横轴 + 同一纵轴。
 * 单 Y 轴:两者共用一轴直接对比;DAU 通常 ≫ 单日新注册会把注册压低,故下方给两条曲线
 * 各一个复选框(默认全开),取消勾选即隐藏该条 —— 隐藏后纵轴自动重算,可单看某条的起伏。
 * 两条日序列后端各自补 0、窗口一致,这里按日期 union 合行。
 */
function RegistrationsAndActive({ reg, dau }: { reg: MetricsPoint[]; dau: MetricsPoint[] }) {
  const [showReg, setShowReg] = useState(true);
  const [showDau, setShowDau] = useState(true);

  const byDate = new Map<string, { date: string; reg: number; dau: number }>();
  for (const p of reg) byDate.set(p.date, { date: p.date, reg: p.value, dau: 0 });
  for (const p of dau) {
    const row = byDate.get(p.date) ?? { date: p.date, reg: 0, dau: 0 };
    row.dau = p.value;
    byDate.set(p.date, row);
  }
  const merged = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  const { data: rows, isLive } = buildDailyTrend(merged, { valueKeys: ['reg', 'dau'] });
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 5, right: 4, left: 0, bottom: 0 }}>
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
              tick={{ fontSize: chartTheme.fontSize, fill: AXIS_COLOR }}
              tickLine={false}
              axisLine={{ stroke: GRID_COLOR }}
              minTickGap={20}
            />
            {/* 单一纵轴 —— 注册量与活跃用户共用 */}
            <YAxis
              allowDecimals={false}
              tickFormatter={compactAxis}
              tick={{ fontSize: chartTheme.fontSize, fill: AXIS_COLOR }}
              tickLine={false}
              axisLine={false}
              width={38}
            />
            <Tooltip content={<DualMetricTooltip showReg={showReg} showDau={showDau} />} />
            {showReg && (
              <Area
                type="monotone"
                dataKey="reg__main"
                name="注册量"
                stroke={COLOR_GREEN}
                strokeWidth={2}
                fill="url(#regGrad)"
                connectNulls={false}
              />
            )}
            {showDau && (
              <Line
                type="monotone"
                dataKey="dau__main"
                name="活跃用户"
                stroke={COLOR_AMBER}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5 }}
                connectNulls={false}
              />
            )}
            {isLive && showReg && (
              <Area
                type="monotone"
                dataKey="reg__live"
                stroke={COLOR_GREEN}
                strokeWidth={2}
                strokeDasharray="5 4"
                fill="none"
                connectNulls={false}
                legendType="none"
              />
            )}
            {isLive && showDau && (
              <Line
                type="monotone"
                dataKey="dau__live"
                stroke={COLOR_AMBER}
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={false}
                connectNulls={false}
                legendType="none"
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {/* 图例复选框 —— 默认全开,可单独关掉某条曲线;纵轴随可见条自动重算 */}
      <div className="mt-1.5 flex items-center justify-center gap-4">
        <SeriesToggle label="注册量" color={COLOR_GREEN} checked={showReg} onChange={setShowReg} />
        <SeriesToggle label="活跃用户" color={COLOR_AMBER} checked={showDau} onChange={setShowDau} />
      </div>
    </div>
  );
}

/** 图例复选框 —— 色块 + 名称,勾选控制对应曲线显隐(默认全开)。 */
function SeriesToggle({
  label,
  color,
  checked,
  onChange,
}: {
  label: string;
  color: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer select-none items-center gap-1.5 text-12 text-subtle">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} />
      <span className="inline-block size-2.5 rounded-4" style={{ backgroundColor: color }} />
      {label}
    </label>
  );
}

/** 合并图 Tooltip —— 显示可见曲线的真值(隐藏的那条不列)。showReg/showDau 由 recharts cloneElement 保留。 */
function DualMetricTooltip({
  active,
  payload,
  label,
  showReg = true,
  showDau = true,
}: {
  active?: boolean;
  payload?: Array<{ payload?: { date: string; reg: number; dau: number } }>;
  label?: string | number;
  showReg?: boolean;
  showDau?: boolean;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div style={tooltipStyle}>
      <div style={tooltipLabelStyle}>{withWeekday(String(label ?? row.date), row.date)}</div>
      {showReg && <div style={{ color: COLOR_GREEN }}>注册 {Number(row.reg ?? 0).toLocaleString()}</div>}
      {showDau && <div style={{ color: COLOR_AMBER }}>活跃 {Number(row.dau ?? 0).toLocaleString()}</div>}
    </div>
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
          {/* 序列色走 --chart-1..8(theme-bridge)—— 原先后 5 档是裸的 Tailwind 500 hex */}
          {display.map((_, i) => (
            <Cell key={i} fill={chartSeriesColor(i)} />
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
          wrapperStyle={{ fontSize: chartTheme.fontSize, color: 'var(--color-subtle)' }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ----------------- 24h 活跃(Bar)-----------------

function HourlyBarChart({ data }: { data: Array<{ hour: number; value: number }> }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
        <XAxis
          dataKey="hour"
          tickFormatter={(v) => `${v}:00`}
          tick={{ fontSize: chartTheme.fontSize, fill: AXIS_COLOR }}
          tickLine={false}
          axisLine={{ stroke: GRID_COLOR }}
          interval={2}
        />
        <YAxis
          allowDecimals={false}
          tickFormatter={compactAxis}
          tick={{ fontSize: chartTheme.fontSize, fill: AXIS_COLOR }}
          tickLine={false}
          axisLine={false}
          width={38}
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
      <LineChart data={rows} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: chartTheme.fontSize, fill: AXIS_COLOR }}
          tickLine={false}
          axisLine={{ stroke: GRID_COLOR }}
        />
        <YAxis
          allowDecimals={false}
          tickFormatter={compactAxis}
          tick={{ fontSize: chartTheme.fontSize, fill: AXIS_COLOR }}
          tickLine={false}
          axisLine={false}
          width={38}
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
