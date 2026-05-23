import { useState } from 'react';
import {
  Activity,
  CalendarRange,
  Clock,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import { Skeleton } from '@/shared/ui/skeleton';
import { useUserMetrics, type MetricsPoint, type HourlyPoint, type CategoryCount } from '../api/user-metrics';

/**
 * UserMetricsPanel — admin /users 顶部 4 张图。
 *
 * 数据从 GET /admin/users/metrics 一次拉,客户端不再二次聚合。
 * 图形全部用 vanilla SVG + Tailwind 实现 —— 项目已经有 Sparkline 同款模式,
 * 不再为这一处引一个 ~100KB 的 recharts。
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
          {data && <LineChart series={data.registrations} stroke="var(--brand-green)" />}
        </ChartCard>

        <ChartCard icon={Activity} title="注册渠道占比" loading={isLoading}>
          {data && <Donut data={data.sources} />}
        </ChartCard>

        <ChartCard icon={Clock} title="24h 活跃时段分布" loading={isLoading}>
          {data && <HourlyBars data={data.hourly_activity} />}
        </ChartCard>

        <ChartCard icon={CalendarRange} title="MAU · 最近 12 个月" loading={isLoading}>
          {data && <LineChart series={data.mau_trend} stroke="var(--brand-red)" showLabels />}
        </ChartCard>
      </div>
    </section>
  );
}

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
      <div className="min-h-32">
        {loading ? <Skeleton className="h-32 w-full" /> : children}
      </div>
    </div>
  );
}

/**
 * 折线图 —— 用 SVG polyline + 面积 path,无第三方 dep。
 * 沿用 DashboardPage 的 Sparkline 同款。
 */
function LineChart({
  series,
  stroke,
  showLabels = false,
}: {
  series: MetricsPoint[];
  stroke: string;
  showLabels?: boolean;
}) {
  if (!series || series.length === 0) {
    return <Empty />;
  }
  const values = series.map((p) => p.value);
  const max = Math.max(...values, 1);
  const w = 100;
  const h = 36;
  const step = series.length > 1 ? w / (series.length - 1) : 0;

  const points = series.map((p, i) => `${i * step},${h - (p.value / max) * h}`).join(' ');
  const areaPath = `M0,${h} L${points.replaceAll(' ', ' L')} L${w},${h} Z`;

  return (
    <div className="space-y-2">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="w-full h-28 overflow-visible"
      >
        <path d={areaPath} fill={`color-mix(in srgb, ${stroke} 12%, transparent)`} />
        <polyline points={points} fill="none" stroke={stroke} strokeWidth="0.6" />
      </svg>
      <div className="flex justify-between text-2xs text-faint">
        <span>{series[0]?.date}</span>
        {showLabels && (
          <span className="text-foreground font-bold">
            当前 {series[series.length - 1]?.value.toLocaleString()}
          </span>
        )}
        <span>{series[series.length - 1]?.date}</span>
      </div>
    </div>
  );
}

/**
 * 24h 柱状图 —— Tailwind 高度 + 颜色深浅表达活跃度。
 * 类似 GitHub contribution graph 的 1D 版本。
 */
function HourlyBars({ data }: { data: HourlyPoint[] }) {
  if (!data || data.length === 0) {
    return <Empty />;
  }
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div>
      <div className="flex items-end justify-between gap-px h-28">
        {data.map((p) => {
          const ratio = p.value / max;
          const alpha = 0.15 + ratio * 0.85; // 0.15..1.0
          return (
            <div
              key={p.hour}
              className="flex-1 rounded-sm relative group"
              style={{
                height: `${Math.max(ratio * 100, 3)}%`,
                backgroundColor: `color-mix(in srgb, var(--brand-green) ${alpha * 100}%, transparent)`,
              }}
              title={`${p.hour}:00 · ${p.value.toLocaleString()} 人`}
            />
          );
        })}
      </div>
      <div className="flex justify-between text-2xs text-faint mt-1">
        <span>0:00</span>
        <span>6:00</span>
        <span>12:00</span>
        <span>18:00</span>
        <span>24:00</span>
      </div>
    </div>
  );
}

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

const PALETTE = [
  'var(--brand-green)',
  'var(--brand-red)',
  'var(--brand-amber)',
  '#3B82F6',
  '#8B5CF6',
  '#EC4899',
  '#10B981',
  '#F97316',
];

/**
 * 圆环饼图 —— 纯 SVG 弧线段(stroke-dasharray 切分一个圆周)。
 * 比起 path 的 arc 命令更易读,适合 6~8 段以内的分类对比。
 */
function Donut({ data }: { data: CategoryCount[] }) {
  if (!data || data.length === 0) {
    return <Empty />;
  }
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <Empty />;

  const r = 16; // svg 单位
  const c = 2 * Math.PI * r; // 周长
  let cumulative = 0;
  const segments = data.map((d, i) => {
    const ratio = d.value / total;
    const len = ratio * c;
    const dasharray = `${len} ${c - len}`;
    const dashoffset = -cumulative;
    cumulative += len;
    return {
      key: d.name,
      label: PROVIDER_LABEL[d.name] || d.name,
      value: d.value,
      ratio,
      color: PALETTE[i % PALETTE.length],
      dasharray,
      dashoffset,
    };
  });

  return (
    <div className="grid grid-cols-[1fr_1fr] gap-3 items-center">
      <div className="relative aspect-square max-w-[120px] mx-auto">
        <svg viewBox="0 0 40 40" className="w-full h-full -rotate-90">
          {segments.map((s) => (
            <circle
              key={s.key}
              cx="20"
              cy="20"
              r={r}
              fill="transparent"
              stroke={s.color}
              strokeWidth="6"
              strokeDasharray={s.dasharray}
              strokeDashoffset={s.dashoffset}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-lg font-bold text-foreground">{total.toLocaleString()}</div>
          <div className="text-2xs text-faint">总注册</div>
        </div>
      </div>
      <ul className="space-y-1 text-xs">
        {segments.map((s) => (
          <li key={s.key} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 truncate">
              <span className="size-2 rounded-sm" style={{ backgroundColor: s.color }} />
              <span className="truncate text-subtle">{s.label}</span>
            </span>
            <span className="text-foreground tabular-nums">
              {(s.ratio * 100).toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Empty() {
  return <div className="text-sm text-faint text-center py-8">还没有可用数据</div>;
}
