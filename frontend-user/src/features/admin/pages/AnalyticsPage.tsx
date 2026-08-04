import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { formatISO } from 'date-fns';
import {
  Activity,
  AlertTriangle,
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
import { chartTheme } from '@/shared/lib/theme-bridge';
import { toApiError } from '@/shared/lib/http';
import { Skeleton } from '@/shared/ui/skeleton';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
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
 * 🔴 容错口径(2026-08 修正):旧代码写的是 `/503/.test(String(overview.error))` ——
 * 拿错误对象 toString 做正则,任何含 503 字样的报错都会被判成「未配置」。而实测后端
 * (`internal/umami/handler.go` + `utils.httpStatusFromCode`)把 6001~6004 全映射成
 * **502 Bad Gateway**,只有公开的 tracker-config 端点才会吐 503 —— 也就是说这个分支
 * 在 admin 页上几乎永不成立,umami 容器挂 / 网络断 / token 过期时,页面照常渲染
 * 「6 张 KPI 全 —、实时在线 0、还没有访问数据」,把运维引去查埋点,而真实故障在 umami。
 * 现在:503 仍按「未配置」处理(保持与后端契约一致),其余错误一律显式报错 + 重试。
 */
export function AnalyticsPage() {
  const [win, setWin] = useState<DateWindow>({ days: 30 });
  const qc = useQueryClient();

  // 窗口跨越天数:决定折线聚合粒度(<=7 天按小时,否则按天)。
  const spanDays =
    win.start && win.end
      ? Math.round((new Date(win.end).getTime() - new Date(win.start).getTime()) / 86400000) + 1
      : win.days ?? 30;

  // ⚠️ 必须 useMemo:formatISO(new Date()) 每次 render 返回新时间戳,直接传 `{start,end}` 会让
  // useQuery 的 queryKey 每次都不一样 → 无限重拉。依赖窗口的原始值,稳定。
  // 自定义区间边界**钉死北京日**(2026-07-15 时区彻查):旧写法 new Date(start+'T00:00:00')
  // 是浏览器本地零点 —— 海外管理员选「7-14」实际发出自己时区的零点,后端按北京日切桶
  // 会返回两个残缺日桶(图上冒出没选的日期)。RFC3339 带显式 +08:00,后端 ParseInLocation
  // 识别偏移解析为同一时刻,与浏览器时区无关。
  const params = useMemo(
    () =>
      win.start && win.end
        ? { start: `${win.start}T00:00:00+08:00`, end: `${win.end}T23:59:59+08:00` }
        : { start: daysAgoISO(win.days ?? 30), end: nowISO() },
    [win.start, win.end, win.days],
  );

  const hourly = spanDays <= 7;
  const overview = useAnalyticsOverview(params);
  const pv = usePageviews(hourly ? 'hour' : 'day', params);
  const active = useActiveVisitors();

  // 只看 overview 这个最稳的;走 toApiError 读真实 HTTP status,不做字符串正则。
  const notConfigured = toApiError(overview.error).status === 503;

  if (overview.isError && notConfigured) {
    return (
      <AdminPageLayout title="数据统计" description="Umami 自托管分析(共用 scholar_mysql)">
        <EmptyState
          icon={BarChart3}
          title="Umami WEBSITE_ID 尚未配置"
          description={
            <span>
              首次启动 umami 后,用默认 <code className="px-1 rounded-4 bg-surface-2">admin / umami</code>{' '}
              登录 → 新建 Website → 把 Website ID 填回 <code className="px-1 rounded-4 bg-surface-2">.env</code>{' '}
              的 <code className="px-1 rounded-4 bg-surface-2">UMAMI_WEBSITE_ID</code>,然后{' '}
              <code className="px-1 rounded-4 bg-surface-2">docker-compose restart backend</code>。
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
      onRefresh={() => qc.invalidateQueries({ queryKey: ['admin', 'analytics'] })}
      // 只看这两条:active 是 30s 轮询,带上它会让刷新按钮周期性 disabled。
      refreshing={overview.isFetching || pv.isFetching}
      actions={<DateRangeControl value={win} onChange={setWin} />}
    >
      {overview.isError && (
        <ErrorBanner
          title="访问统计加载失败"
          error={overview.error}
          onRetry={() => overview.refetch()}
        />
      )}

      {/* 概览卡片 —— GA4 口径排序:用户 → 会话 → 访问页 → 跳出率 → 平均访问时长 → 实时 */}
      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <KPI
          loading={overview.isLoading}
          error={overview.error}
          icon={Users}
          label="独立访客"
          value={overview.data?.stats.visitors.value}
          prev={overview.data?.stats.visitors.prev}
        />
        <KPI
          loading={overview.isLoading}
          error={overview.error}
          icon={Activity}
          label="会话数"
          value={overview.data?.stats.visits.value}
          prev={overview.data?.stats.visits.prev}
        />
        <KPI
          loading={overview.isLoading}
          error={overview.error}
          icon={Eye}
          label="访问页数"
          value={overview.data?.stats.pageviews.value}
          prev={overview.data?.stats.pageviews.prev}
        />
        <KPI
          loading={overview.isLoading}
          error={overview.error}
          icon={BarChart3}
          label="跳出率"
          valueText={rateText(overview.data?.stats.bounces.value, overview.data?.stats.visits.value)}
        />
        {/* 「平均访问时长」而非旧标签「篇均时长」:分母是 visits(会话数)不是 pageviews,
            与「篇」(页面)无关。写成篇均会被当成单页阅读时长去做内容决策,量纲直接错位。
            现名与 umami 官方口径(average visit time)一致。 */}
        <KPI
          loading={overview.isLoading}
          error={overview.error}
          icon={Activity}
          label="平均访问时长"
          valueText={durationText(overview.data?.stats.totaltime.value, overview.data?.stats.visits.value)}
        />
        <RealtimeCard loading={active.isLoading} error={active.error} value={active.data?.visitors} />
      </section>

      {/* PV / 会话折线 */}
      <section className="mb-6">
        <Panel icon={BarChart3} title={`访问趋势 · 按${hourly ? '小时' : '天'}聚合`} loading={pv.isLoading}>
          {pv.isError ? (
            <InlineError error={pv.error} onRetry={() => pv.refetch()} />
          ) : pv.data && pv.data.series.pageviews.length > 0 ? (
            <Sparkline
              pageviews={pv.data.series.pageviews}
              sessions={pv.data.series.sessions}
              hourly={hourly}
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
          render={(row) => <code className="text-12 truncate">{row.x || '/'}</code>}
        />
        <TopCard
          icon={Globe2}
          title="TOP 来源"
          type="referrer"
          params={params}
          render={(row) => <span className="text-12 truncate">{row.x || '(直接访问)'}</span>}
        />
        <TopCard
          icon={Globe2}
          title="TOP 国家"
          type="country"
          params={params}
          render={(row) => <span className="text-12">{row.x || '未知'}</span>}
        />
        <TopCard
          icon={MonitorSmartphone}
          title="浏览器"
          type="browser"
          params={params}
          render={(row) => <span className="text-12">{row.x || '未知'}</span>}
        />
        <TopCard
          icon={MonitorSmartphone}
          title="操作系统"
          type="os"
          params={params}
          render={(row) => <span className="text-12">{row.x || '未知'}</span>}
        />
        <TopCard
          icon={Smartphone}
          title="设备"
          type="device"
          params={params}
          render={(row) => <span className="text-12">{row.x || '未知'}</span>}
        />
      </section>
    </AdminPageLayout>
  );
}

// ----------------- 子组件 -----------------

/**
 * 顶部错误条 —— 页面主数据挂掉时先把事实说出来,再让下面的空图表说话。
 * 不回显裸错误对象:走 toApiError 拿后端给的 message(既不吞掉具体原因,也不泄漏堆栈)。
 */
function ErrorBanner({ title, error, onRetry }: { title: string; error: unknown; onRetry: () => void }) {
  const api = toApiError(error);
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-12 border border-border bg-danger-soft px-3 py-2 text-12">
      <span className="flex items-center gap-2 font-medium text-brand-red">
        <AlertTriangle className="size-4 shrink-0" />
        {title}
      </span>
      <span className="text-subtle">{api.message}</span>
      {(api.status === 502 || api.isNetworkError) && (
        <span className="text-faint">
          通常是 umami 容器不可达 / UMAMI_WEBSITE_ID 没配好 —— 下面的数字缺失不代表站点没有访问量。
        </span>
      )}
      <Button size="sm" variant="outline" onClick={onRetry}>
        重试
      </Button>
    </div>
  );
}

/** 面板内联错误 —— 替代「该维度暂无数据」「还没有访问数据」这类会说反话的空态。 */
function InlineError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const api = toApiError(error);
  return (
    <div className="flex flex-col items-center gap-2 py-6 text-center text-12">
      <span className="flex items-center gap-2 font-medium text-brand-red">
        <AlertTriangle className="size-4" />
        加载失败
      </span>
      <span className="text-muted-foreground">{api.message}</span>
      <Button size="sm" variant="outline" onClick={onRetry}>
        重试
      </Button>
    </div>
  );
}

function KPI({
  icon: Icon,
  label,
  value,
  prev,
  valueText,
  loading,
  error,
}: {
  icon: LucideIcon;
  label: string;
  value?: number;
  prev?: number;
  /** 预格式化展示值(跳出率/时长这类非计数指标用;给了它就不显示同环比) */
  valueText?: string;
  loading?: boolean;
  /** query 的 error —— 传了就只给 `—` 并把原因挂 title,绝不回落成 0 */
  error?: unknown;
}) {
  const errMsg = error ? toApiError(error).message || '加载失败' : null;
  const delta =
    !errMsg && valueText == null && value != null && prev != null && prev > 0
      ? ((value - prev) / prev) * 100
      : null;
  return (
    <div className="rounded-16 border border-border bg-surface-card p-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-12 text-faint">{label}</span>
        <Icon className="size-3 text-faint" />
      </div>
      {errMsg ? (
        <div className="text-16 font-medium text-faint tabular-nums" title={`加载失败:${errMsg}`}>
          —
        </div>
      ) : loading ? (
        <Skeleton className="h-6 w-16" />
      ) : (
        <div className="text-16 font-medium text-foreground tabular-nums">
          {valueText ?? value?.toLocaleString() ?? '—'}
        </div>
      )}
      {delta != null && (
        <div
          className={`text-12 mt-0.5 tabular-nums ${
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

function RealtimeCard({ value, loading, error }: { value?: number; loading?: boolean; error?: unknown }) {
  const errMsg = error ? toApiError(error).message || '加载失败' : null;
  return (
    // bg-surface-card:原来是 `bg-danger-soft/0` —— `/0` 是 0% 不透明度等于没有背景,
    // 用的还是与绿色语义相反的 danger token(改造遗留)。同排 6 张 KPI 其余 5 张是纯白卡片底,
    // 唯独这张透出页面米白底,视觉上像缺了一块。
    <div className="rounded-16 border border-brand-green bg-surface-card p-3 relative overflow-hidden">
      <div className="absolute top-2 right-2 size-1.5 rounded-pill bg-brand-green animate-pulse" />
      <div className="text-12 text-brand-green/80">实时在线</div>
      {errMsg ? (
        // 🔴 失败绝不回落成 0:「实时在线 0」会被当成"现在真的没人",而实情是接口挂了。
        <div className="text-16 font-medium text-faint tabular-nums mt-1" title={`加载失败:${errMsg}`}>
          —
        </div>
      ) : loading ? (
        <Skeleton className="h-6 w-16 mt-1" />
      ) : (
        <div className="text-16 font-medium text-brand-green tabular-nums mt-1">
          {value?.toLocaleString() ?? '—'}
        </div>
      )}
      <div className="text-12 text-faint mt-0.5">30s 刷新</div>
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
    <div className="rounded-16 border border-border bg-surface-card p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-14 font-medium text-foreground">{title}</h3>
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
  hourly,
}: {
  pageviews: SeriesPoint[];
  sessions: SeriesPoint[];
  /** 桶粒度是小时(spanDays ≤ 7)—— 只影响文案,轴/Tooltip 由 shortDate 按串长自适应。 */
  hourly?: boolean;
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
    {isLive && (
      <div className="mb-1 text-right text-12 text-faint">
        — — {hourly ? '当前小时' : '今日'}(进行中,非最终值)
      </div>
    )}
    <div className="h-48">
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="pvGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-brand-green)" stopOpacity={0.3} />
            <stop offset="100%" stopColor="var(--color-brand-green)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} vertical={false} />
        <XAxis
          dataKey="x"
          tickFormatter={shortDate}
          tick={{ fontSize: chartTheme.fontSize, fill: chartTheme.axis }}
          tickLine={false}
          axisLine={{ stroke: chartTheme.grid }}
          minTickGap={24}
        />
        <YAxis
          allowDecimals={false}
          tickFormatter={compactAxis}
          tick={{ fontSize: chartTheme.fontSize, fill: chartTheme.axis }}
          tickLine={false}
          axisLine={false}
          width={38}
        />
        <Tooltip content={<PvTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: chartTheme.fontSize, color: 'var(--color-subtle)' }}
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
  return (
    <div style={chartTheme.tooltip}>
      <div style={{ color: 'var(--color-muted-foreground)', fontSize: chartTheme.fontSize, marginBottom: 2 }}>
        {withWeekday(shortDate(row.x), row.x)}
        {isLiveBucket(row.x) && (
          <span style={{ color: 'var(--color-brand-amber)', marginLeft: 4 }}>· 进行中</span>
        )}
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
  const { data, isLoading, isError, error, refetch } = useTopMetric(type, 10, params);
  const items = data?.items ?? [];
  const max = items.reduce((m, r) => Math.max(m, r.y), 0);

  return (
    <Panel icon={Icon} title={title} loading={isLoading}>
      {isError ? (
        // 不传 error 时,请求失败会和"该维度真的没数据"渲染成同一句话。
        <InlineError error={error} onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Empty hint="该维度暂无数据" />
      ) : (
        <ul className="space-y-1.5">
          {items.map((row, i) => {
            const pct = max > 0 ? (row.y / max) * 100 : 0;
            return (
              <li key={`${row.x}-${i}`} className="relative">
                <div className="absolute inset-0 -m-px rounded-4 bg-surface-2 overflow-hidden">
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
                    <Badge variant="muted" className="text-12 px-1.5 h-4 shrink-0">
                      {i + 1}
                    </Badge>
                    {/* title 挂在截断容器上 —— 带 query string 的落地页和长 referrer 在两列布局里
                        只看得到前二十来个字符,没有 title 就只能回 umami 后台看,
                        而这一页存在的意义正是不用回 umami。 */}
                    <div className="min-w-0 flex-1 truncate" title={row.x || undefined}>
                      {render(row)}
                    </div>
                  </div>
                  <span className="text-12 tabular-nums shrink-0">{row.y.toLocaleString()}</span>
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
  return <div className="text-12 text-faint text-center py-6">{hint}</div>;
}

// ----------------- 工具 -----------------

/** 跳出率 = bounces / visits(百分比);无会话显示 —。 */
function rateText(part?: number, total?: number): string {
  if (!total || total <= 0 || part == null) return '—';
  return `${((part / total) * 100).toFixed(1)}%`;
}

/**
 * 平均访问时长 = totaltime(秒)/ visits(会话数)。
 *
 * 🔴 分母是**会话**不是页面 —— 所以它是「一次访问平均停留多久」,不是「每篇看多久」。
 * 输出带单位:旧实现返回裸 `m:ss`,超过一小时就变成 `75:30` 这种读不懂的值
 * (既不像时:分,也不像分:秒)。
 */
function durationText(totalSec?: number, visits?: number): string {
  if (!visits || visits <= 0 || totalSec == null) return '—';
  const total = Math.round(totalSec / visits);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h} 时 ${m} 分`;
  if (m > 0) return `${m} 分 ${s} 秒`;
  return `${s} 秒`;
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
/**
 * 桶字符串 → 轴/Tooltip 展示。umami 返桶可能是
 * "2026-05-23 10:00:00"(unit=hour)/ "2026-05-23"(day)/ "2026-05"(month)。
 *
 * 🔴 小时桶必须**保留小时**:旧实现无条件 `slice(5,10)`,选「今天」或「近7天」时
 * (:75 会向后端要 unit='hour')X 轴 24 个刻度全显示「08/04」、Tooltip 也只有「08/04 周一」——
 * 「今天的流量峰值在几点」这个按小时视图存在的唯一理由被整个抹掉。
 */
function shortDate(s: string): string {
  if (!s) return '';
  const md = (v: string) => v.slice(5, 10).replace('-', '/');
  // 长度 ≥ 13 说明带了小时段("YYYY-MM-DD HH…" 或 ISO 的 "YYYY-MM-DDTHH…")
  if (s.length >= 13) return `${md(s)} ${s.slice(11, 16)}`;
  return s.length >= 10 ? md(s) : s;
}

/**
 * 北京当前小时键 `YYYY-MM-DD HH` —— 与后端切桶时区一致
 * (umami client 传 `timezone=platformTZName()`,容器是 Asia/Shanghai)。
 * hourCycle h23 是必须的:h12/默认在部分引擎会把 0 点渲染成 "24"。
 */
const BEIJING_HOUR_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
});
function beijingHourKey(d: Date = new Date()): string {
  const parts = BEIJING_HOUR_FMT.formatToParts(d);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}`;
}

/**
 * 「这一桶还在进行中吗」—— **按桶粒度**判定。
 * 旧写法一律 `slice(0,10) === 今天`,在小时视图下会把今天全部 24 个小时桶都标成「进行中」,
 * 包括早已收尾的凌晨那些。
 */
function isLiveBucket(bucket: string): boolean {
  const s = String(bucket);
  if (s.length >= 13) return `${s.slice(0, 10)} ${s.slice(11, 13)}` === beijingHourKey();
  return s.slice(0, 10) === localDateKey();
}
