import { useState } from 'react';
import {
  Activity,
  BarChart3,
  Eye,
  Globe2,
  Link2,
  MonitorSmartphone,
  Smartphone,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Skeleton } from '@/shared/ui/skeleton';
import { Badge } from '@/shared/ui/badge';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { EmptyState } from '@/shared/components/EmptyState';
import {
  useAnalyticsOverview,
  usePageviews,
  useTopMetric,
  useActiveVisitors,
  type SeriesPoint,
  type TopRow,
  type TopType,
} from '../api/analytics';

/**
 * AnalyticsPage —— admin 自渲染的 umami 数据面板,iframe 嵌入方案已下线。
 *
 * backend `/admin/analytics/*` 包了 umami 的 stats / pageviews / metrics / active
 * 4 个 API,这里只负责拼接 + 渲染。
 *
 * 容错:任何 hook 返回 503 (UMAMI_WEBSITE_ID 未配) → 顶部显示空态卡片,告诉用户去配。
 */
export function AnalyticsPage() {
  const [range, setRange] = useState<7 | 30 | 90>(30);
  const params = { start: daysAgoISO(range), end: nowISO() };

  const overview = useAnalyticsOverview(params);
  const pv = usePageviews(range <= 7 ? 'hour' : 'day', params);
  const active = useActiveVisitors();

  // 任一接口 503 → 视为 umami 没接好;只看 overview 这个最稳的
  const notConfigured = overview.error && /503/.test(String(overview.error));

  if (notConfigured) {
    return (
      <AdminPageLayout title="数据统计" description="Umami 自托管分析(共用 scholar_mysql)">
        <EmptyState
          icon={BarChart3}
          title="Umami WEBSITE_ID 尚未配置"
          description={
            <span>
              首次启动 umami 后,用默认 <code className="px-1 rounded bg-surface-2">admin / umami</code>{' '}
              登录 → 新建 Website → 把 Website ID 填回 <code className="px-1 rounded bg-surface-2">.env</code>{' '}
              的 <code className="px-1 rounded bg-surface-2">UMAMI_WEBSITE_ID</code>,然后{' '}
              <code className="px-1 rounded bg-surface-2">docker-compose restart backend</code>。
            </span>
          }
        />
      </AdminPageLayout>
    );
  }

  return (
    <AdminPageLayout
      title="数据统计"
      description="Umami 自托管 · 后端拉取数据,本页直接渲染图表(不再 iframe)"
      actions={<RangeTabs value={range} onChange={setRange} />}
    >
      {/* 概览卡片 5 个 + 实时在线 */}
      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <KPI
          loading={overview.isLoading}
          icon={Eye}
          label="访问页数"
          value={overview.data?.stats.pageviews.value}
          prev={overview.data?.stats.pageviews.prev}
        />
        <KPI
          loading={overview.isLoading}
          icon={Users}
          label="独立访客"
          value={overview.data?.stats.visitors.value}
          prev={overview.data?.stats.visitors.prev}
        />
        <KPI
          loading={overview.isLoading}
          icon={Activity}
          label="会话数"
          value={overview.data?.stats.visits.value}
          prev={overview.data?.stats.visits.prev}
        />
        <KPI
          loading={overview.isLoading}
          icon={BarChart3}
          label="跳出"
          value={overview.data?.stats.bounces.value}
          prev={overview.data?.stats.bounces.prev}
        />
        <KPI
          loading={overview.isLoading}
          icon={Activity}
          label="总停留(秒)"
          value={overview.data?.stats.totaltime.value}
          prev={overview.data?.stats.totaltime.prev}
        />
        <RealtimeCard loading={active.isLoading} value={active.data?.visitors} />
      </section>

      {/* PV / 会话折线 */}
      <section className="mb-6">
        <Panel
          icon={BarChart3}
          title={`访问趋势 · 最近 ${range} 天 · 按${range <= 7 ? '小时' : '天'}聚合`}
          loading={pv.isLoading}
        >
          {pv.data && pv.data.series.pageviews.length > 0 ? (
            <Sparkline
              pageviews={pv.data.series.pageviews}
              sessions={pv.data.series.sessions}
            />
          ) : (
            <Empty hint="还没有访问数据 —— 前端 tracker 接好 / WEBSITE_ID 对了之后,几分钟内会出现" />
          )}
        </Panel>
      </section>

      {/* TOP 矩阵 —— 6 个维度 */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <TopCard
          icon={Link2}
          title="TOP 页面"
          type="url"
          params={params}
          render={(row) => <code className="text-2xs truncate">{row.x || '/'}</code>}
        />
        <TopCard
          icon={Globe2}
          title="TOP 来源"
          type="referrer"
          params={params}
          render={(row) => <span className="text-xs truncate">{row.x || '(直接访问)'}</span>}
        />
        <TopCard
          icon={Globe2}
          title="TOP 国家"
          type="country"
          params={params}
          render={(row) => <span className="text-xs">{row.x || '未知'}</span>}
        />
        <TopCard
          icon={MonitorSmartphone}
          title="浏览器"
          type="browser"
          params={params}
          render={(row) => <span className="text-xs">{row.x || '未知'}</span>}
        />
        <TopCard
          icon={MonitorSmartphone}
          title="操作系统"
          type="os"
          params={params}
          render={(row) => <span className="text-xs">{row.x || '未知'}</span>}
        />
        <TopCard
          icon={Smartphone}
          title="设备"
          type="device"
          params={params}
          render={(row) => <span className="text-xs">{row.x || '未知'}</span>}
        />
      </section>
    </AdminPageLayout>
  );
}

// ----------------- 子组件 -----------------

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

function KPI({
  icon: Icon,
  label,
  value,
  prev,
  loading,
}: {
  icon: LucideIcon;
  label: string;
  value?: number;
  prev?: number;
  loading?: boolean;
}) {
  const delta = value != null && prev != null && prev > 0 ? ((value - prev) / prev) * 100 : null;
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-2xs text-faint">{label}</span>
        <Icon className="size-3 text-faint" />
      </div>
      {loading ? (
        <Skeleton className="h-6 w-16" />
      ) : (
        <div className="text-lg font-bold text-foreground tabular-nums">
          {value?.toLocaleString() ?? '—'}
        </div>
      )}
      {delta != null && (
        <div
          className={`text-2xs mt-0.5 tabular-nums ${
            delta > 0 ? 'text-brand-green' : delta < 0 ? 'text-brand-red' : 'text-faint'
          }`}
        >
          {delta > 0 ? '↑' : delta < 0 ? '↓' : '·'} {Math.abs(delta).toFixed(1)}%
          <span className="text-faint ml-1">vs 上周期</span>
        </div>
      )}
    </div>
  );
}

function RealtimeCard({ value, loading }: { value?: number; loading?: boolean }) {
  return (
    <div className="rounded-md border border-brand-green bg-danger-soft/0 p-3 relative overflow-hidden">
      <div className="absolute top-2 right-2 size-1.5 rounded-full bg-brand-green animate-pulse" />
      <div className="text-2xs text-brand-green/80">实时在线</div>
      {loading ? (
        <Skeleton className="h-6 w-16 mt-1" />
      ) : (
        <div className="text-lg font-bold text-brand-green tabular-nums mt-1">
          {value?.toLocaleString() ?? '0'}
        </div>
      )}
      <div className="text-2xs text-faint mt-0.5">30s 刷新</div>
    </div>
  );
}

function Panel({
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
      <div className="min-h-32">{loading ? <Skeleton className="h-32 w-full" /> : children}</div>
    </div>
  );
}

/**
 * 双折线 —— PV (绿) + Sessions (蓝)。沿用 UserMetricsPanel 同款 SVG 模式。
 */
function Sparkline({
  pageviews,
  sessions,
}: {
  pageviews: SeriesPoint[];
  sessions: SeriesPoint[];
}) {
  // 两条线公用同一时间轴 —— umami 返回的桶一一对应。max 取双方最大,统一纵坐标。
  const max = Math.max(
    ...pageviews.map((p) => p.y),
    ...sessions.map((p) => p.y),
    1,
  );
  const w = 100;
  const h = 36;
  const step = pageviews.length > 1 ? w / (pageviews.length - 1) : 0;

  const toPoints = (s: SeriesPoint[]) =>
    s.map((p, i) => `${i * step},${h - (p.y / max) * h}`).join(' ');

  const pvPath = toPoints(pageviews);
  const sePath = toPoints(sessions);
  const pvArea = `M0,${h} L${pvPath.replaceAll(' ', ' L')} L${w},${h} Z`;

  return (
    <div className="space-y-2">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="w-full h-32 overflow-visible"
      >
        <path d={pvArea} fill="color-mix(in srgb, var(--brand-green) 12%, transparent)" />
        <polyline
          points={pvPath}
          fill="none"
          stroke="var(--brand-green)"
          strokeWidth="0.6"
        />
        <polyline points={sePath} fill="none" stroke="var(--brand-red)" strokeWidth="0.6" />
      </svg>
      <div className="flex items-center justify-between text-2xs text-faint">
        <span>{shortDate(pageviews[0]?.x)}</span>
        <div className="flex gap-3">
          <span>
            <span className="inline-block size-1.5 rounded-sm bg-brand-green mr-1" />
            访问页 {sum(pageviews).toLocaleString()}
          </span>
          <span>
            <span className="inline-block size-1.5 rounded-sm bg-brand-red mr-1" />
            会话 {sum(sessions).toLocaleString()}
          </span>
        </div>
        <span>{shortDate(pageviews[pageviews.length - 1]?.x)}</span>
      </div>
    </div>
  );
}

/**
 * TopCard —— 一个维度的 TOP 列表(URL/Referrer/Country/Browser/OS/Device)。
 * 横向条 + 数值 + 占比;占比相对本卡内最高值,而不是全局总和。
 */
function TopCard({
  icon: Icon,
  title,
  type,
  params,
  render,
}: {
  icon: LucideIcon;
  title: string;
  type: TopType;
  params: { start: string; end: string };
  render: (row: TopRow) => React.ReactNode;
}) {
  const { data, isLoading } = useTopMetric(type, 10, params);
  const items = data?.items ?? [];
  const max = items.reduce((m, r) => Math.max(m, r.y), 0);

  return (
    <Panel icon={Icon} title={title} loading={isLoading}>
      {items.length === 0 ? (
        <Empty hint="该维度暂无数据" />
      ) : (
        <ul className="space-y-1.5">
          {items.map((row, i) => {
            const pct = max > 0 ? (row.y / max) * 100 : 0;
            return (
              <li key={`${row.x}-${i}`} className="relative">
                <div className="absolute inset-0 -m-px rounded-sm bg-surface-2 overflow-hidden">
                  <div
                    className="h-full bg-surface-2"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: 'color-mix(in srgb, var(--brand-green) 14%, transparent)',
                    }}
                  />
                </div>
                <div className="relative flex items-center justify-between gap-2 px-2 py-1 text-foreground">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="muted" className="text-2xs px-1.5 h-4 shrink-0">
                      {i + 1}
                    </Badge>
                    <div className="min-w-0 flex-1 truncate">{render(row)}</div>
                  </div>
                  <span className="text-xs tabular-nums shrink-0">{row.y.toLocaleString()}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function Empty({ hint }: { hint: string }) {
  return <div className="text-xs text-faint text-center py-6">{hint}</div>;
}

// ----------------- 工具 -----------------

function nowISO(): string {
  return new Date().toISOString();
}
function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}
function sum(s: SeriesPoint[]): number {
  return s.reduce((a, b) => a + b.y, 0);
}
function shortDate(s?: string): string {
  if (!s) return '';
  return s.length >= 10 ? s.slice(5, 10).replace('-', '/') : s;
}
