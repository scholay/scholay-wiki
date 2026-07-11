import { useMemo, useState } from 'react';
import { formatISO } from 'date-fns';
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
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { compactAxis } from '@/shared/lib/chart-format';
import { Skeleton } from '@/shared/ui/skeleton';
import { Badge } from '@/shared/ui/badge';
import { buildDailyTrend, localDateKey, withWeekday } from '@/shared/lib/daily-trend';
import { DateRangeControl, type DateWindow } from '../components/DateRangeControl';
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
  const [win, setWin] = useState<DateWindow>({ days: 30 });

  // 窗口跨越天数:决定折线聚合粒度(<=7 天按小时,否则按天)。
  const spanDays =
    win.start && win.end
      ? Math.round((new Date(win.end).getTime() - new Date(win.start).getTime()) / 86400000) + 1
      : win.days ?? 30;

  // ⚠️ 必须 useMemo:formatISO(new Date()) 每次 render 返回新时间戳,直接传 `{start,end}` 会让
  // useQuery 的 queryKey 每次都不一样 → 无限重拉。依赖窗口的原始值,稳定。
  // 用 formatISO(本地偏移 +08:00)而非 toISOString()(UTC Z):不落 UTC,跟随主机本地时区;
  // 后端 parseRange 走 ParseInLocation(RFC3339, time.Local),识别串里的 +08:00,解析成同一时刻。
  const params = useMemo(
    () =>
      win.start && win.end
        ? { start: formatISO(new Date(win.start + 'T00:00:00')), end: formatISO(new Date(win.end + 'T23:59:59')) }
        : { start: daysAgoISO(win.days ?? 30), end: nowISO() },
    [win.start, win.end, win.days],
  );

  const overview = useAnalyticsOverview(params);
  const pv = usePageviews(spanDays <= 7 ? 'hour' : 'day', params);
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
      actions={<DateRangeControl value={win} onChange={setWin} />}
    >
      {/* 概览卡片 —— GA4 口径排序:用户 → 会话 → 访问页 → 跳出率 → 篇均时长 → 实时 */}
      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
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
          icon={Eye}
          label="访问页数"
          value={overview.data?.stats.pageviews.value}
          prev={overview.data?.stats.pageviews.prev}
        />
        <KPI
          loading={overview.isLoading}
          icon={BarChart3}
          label="跳出率"
          valueText={rateText(overview.data?.stats.bounces.value, overview.data?.stats.visits.value)}
        />
        <KPI
          loading={overview.isLoading}
          icon={Activity}
          label="篇均时长"
          valueText={durationText(overview.data?.stats.totaltime.value, overview.data?.stats.visits.value)}
        />
        <RealtimeCard loading={active.isLoading} value={active.data?.visitors} />
      </section>

      {/* PV / 会话折线 */}
      <section className="mb-6">
        <Panel
          icon={BarChart3}
          title={`访问趋势 · 按${spanDays <= 7 ? '小时' : '天'}聚合`}
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

function KPI({
  icon: Icon,
  label,
  value,
  prev,
  valueText,
  loading,
}: {
  icon: LucideIcon;
  label: string;
  value?: number;
  prev?: number;
  /** 预格式化展示值(跳出率/时长这类非计数指标用;给了它就不显示同环比) */
  valueText?: string;
  loading?: boolean;
}) {
  const delta =
    valueText == null && value != null && prev != null && prev > 0
      ? ((value - prev) / prev) * 100
      : null;
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
          {valueText ?? value?.toLocaleString() ?? '—'}
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
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold text-foreground">{title}</h3>
        <Icon className="size-3.5 text-faint" />
      </div>
      {/* min-h-32 兜底;chart 子组件自己用 h-48 包,TopCard 的 ul 按内容撑开 */}
      <div className="min-h-32">{loading ? <Skeleton className="h-32 w-full" /> : children}</div>
    </div>
  );
}

/**
 * 双折线 —— PV (绿) + Sessions (红),用 recharts。
 *
 * umami 返回 `pageviews` 和 `sessions` 两条等长时间序列,桶 (x) 一一对应。
 * recharts 期望"一行一桶,多列做多 series" → 这里把两条合并成 `{x, pv, sess}` 行格式。
 */
function Sparkline({
  pageviews,
  sessions,
}: {
  pageviews: SeriesPoint[];
  sessions: SeriesPoint[];
}) {
  const merged = pageviews.map((p, i) => ({
    x: p.x,
    pv: p.y,
    sess: sessions[i]?.y ?? 0,
  }));
  // 最后一桶=今天(进行中)→ pv/sess 各拆 main(实线)+ live(虚线段)。
  const { data, isLive } = buildDailyTrend(merged, { dateKey: 'x', valueKeys: ['pv', 'sess'] });
  return (
    <>
    {isLive && <div className="mb-1 text-right text-2xs text-faint">— — 今日(进行中,非最终值)</div>}
    <div className="h-48">
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="pvGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-brand-green)" stopOpacity={0.3} />
            <stop offset="100%" stopColor="var(--color-brand-green)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
        <XAxis
          dataKey="x"
          tickFormatter={shortDate}
          tick={{ fontSize: 11, fill: 'var(--color-faint)' }}
          tickLine={false}
          axisLine={{ stroke: 'var(--color-border)' }}
          minTickGap={24}
        />
        <YAxis
          allowDecimals={false}
          tickFormatter={compactAxis}
          tick={{ fontSize: 11, fill: 'var(--color-faint)' }}
          tickLine={false}
          axisLine={false}
          width={38}
        />
        <Tooltip content={<PvTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: 11, color: 'var(--color-subtle)' }}
          iconType="square"
          iconSize={8}
          formatter={(v) => (v === 'pv__main' ? '访问页' : v === 'sess__main' ? '会话' : '')}
        />
        <Area
          type="monotone"
          dataKey="pv__main"
          stroke="var(--color-brand-green)"
          strokeWidth={2}
          fill="url(#pvGrad)"
          connectNulls={false}
        />
        <Line type="monotone" dataKey="sess__main" stroke="var(--color-brand-red)" strokeWidth={2} dot={false} connectNulls={false} />
        {isLive && (
          <>
            <Line type="monotone" dataKey="pv__live" stroke="var(--color-brand-green)" strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls={false} legendType="none" />
            <Line type="monotone" dataKey="sess__live" stroke="var(--color-brand-red)" strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls={false} legendType="none" />
          </>
        )}
      </AreaChart>
    </ResponsiveContainer>
    </div>
    </>
  );
}

/** PV/会话 Tooltip —— 读原始 pv/sess(main/live 拆分后 dataKey 变了)。 */
function PvTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: { x: string; pv: number; sess: number } }>;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const isToday = String(row.x).slice(0, 10) === localDateKey();
  return (
    <div style={{ backgroundColor: 'var(--color-background)', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 12, padding: '6px 10px' }}>
      <div style={{ color: 'var(--color-muted-foreground)', fontSize: 11, marginBottom: 2 }}>
        {withWeekday(shortDate(row.x), row.x)}
        {isToday && <span style={{ color: 'var(--color-brand-amber)', marginLeft: 4 }}>· 进行中</span>}
      </div>
      <div style={{ color: 'var(--color-foreground)' }}>访问页 {row.pv.toLocaleString()}</div>
      <div style={{ color: 'var(--color-foreground)' }}>会话 {row.sess.toLocaleString()}</div>
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
                      backgroundColor: 'color-mix(in srgb, var(--color-brand-green) 14%, transparent)',
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

/** 跳出率 = bounces / visits(百分比);无会话显示 —。 */
function rateText(part?: number, total?: number): string {
  if (!total || total <= 0 || part == null) return '—';
  return `${((part / total) * 100).toFixed(1)}%`;
}

/** 篇均时长 = totaltime(秒)/ visits → mm:ss。 */
function durationText(totalSec?: number, visits?: number): string {
  if (!visits || visits <= 0 || totalSec == null) return '—';
  const s = Math.round(totalSec / visits);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

// 本地时区 RFC3339(带 +08:00 偏移),不用 toISOString() 的 UTC「Z」——跟随主机本地时区。
function nowISO(): string {
  return formatISO(new Date());
}
function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return formatISO(d);
}
function shortDate(s: string): string {
  if (!s) return '';
  // umami 返桶字符串可能是 "2026-05-23 10:00:00" / "2026-05-23" / "2026-05" 等。
  // 留 month-day,长得不像就原样返。
  return s.length >= 10 ? s.slice(5, 10).replace('-', '/') : s;
}
