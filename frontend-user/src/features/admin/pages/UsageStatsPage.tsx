import { useState } from 'react';
import { AlertTriangle, BarChart2, TrendingUp, Users, UserX } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { compactAxis } from '@/shared/lib/chart-format';
import { chartTheme } from '@/shared/lib/theme-bridge';
import { toApiError } from '@/shared/lib/http';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { StatCard } from '../components/StatCard';
import { DateRangeControl, type DateWindow } from '../components/DateRangeControl';
import { useUsageStatsSummary, useUsageStatsFunnel } from '../api/usage-stats';
import { buildDailyTrend, withWeekday } from '@/shared/lib/daily-trend';

/**
 * 使用统计 (功能使用统计 v2) —— 取代旧"使用日志"页的统计部分。
 *
 * 数据源: usage_events 表 (前端事件 sendBeacon + 服务端埋点), 与旧 usage_logs 无关。
 * 三块: KPI 卡 / 每日趋势折线 (recharts) / 功能排行 + 智能审稿漏斗 (横条)。
 *
 * 🔴 本页所有数字都要能区分「还不知道」和「确实是 0」。改造前 KPI 写的是
 * `(s?.total ?? 0).toLocaleString()` —— 首屏那一秒和接口挂掉之后,这一排都在**断言**
 * 「平台零使用」。数字页尤其危险:管理员会拿它当经营结论。
 */

/** 百分比,分母 ≤ 0 时给 '—' 而不是 NaN%/Infinity% */
function pct(numerator: number, denominator: number): string {
  if (!(denominator > 0)) return '—';
  const v = (numerator / denominator) * 100;
  return `${v.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
}

export function UsageStatsPage() {
  const [win, setWin] = useState<DateWindow>({ days: 30 });
  const summary = useUsageStatsSummary(win);
  const funnel = useUsageStatsFunnel(win);

  const s = summary.data;
  const num = (n?: number) => (typeof n === 'number' ? n.toLocaleString() : '—');
  const usageTrend = buildDailyTrend(s?.daily ?? [], { valueKeys: ['count'] });
  const features = s?.by_feature ?? [];
  const maxFeature = Math.max(1, ...features.map((f) => f.count));
  const stages = funnel.data ?? [];
  const maxFunnel = Math.max(1, ...stages.map((st) => st.submissions));
  // 后端 fillDailyGaps 会把窗口内每天都补出来(含 0),所以 daily.length 恒 > 0 ——
  // 判空必须看「有没有一天是非 0」,否则空态永远不出现,只画一条贴零线。
  const hasTrendData = (s?.daily ?? []).some((d) => d.count > 0);
  // 漏斗后端按固定 5 阶段返回、缺失补 0,同理不能用 length 判空。
  const funnelEntry = stages[0]?.submissions ?? 0;
  const hasFunnelData = stages.some((st) => st.submissions > 0);
  const summaryErr = summary.isError ? toApiError(summary.error).message || '加载失败' : null;
  const funnelErr = funnel.isError ? toApiError(funnel.error).message || '加载失败' : null;

  return (
    <AdminPageLayout
      title="使用统计"
      description="各功能使用量 / 趋势 / 智能审稿漏斗"
      onRefresh={() => {
        void summary.refetch();
        void funnel.refetch();
      }}
      refreshing={summary.isFetching || funnel.isFetching}
      actions={<DateRangeControl value={win} onChange={setWin} />}
    >
      {summaryErr && (
        <section className="mb-4 rounded-16 border border-border bg-danger-soft p-4 flex items-start gap-3">
          <AlertTriangle className="size-4 shrink-0 text-brand-red" />
          <div className="min-w-0 flex-1">
            <div className="text-14 font-medium text-brand-red">
              使用统计加载失败 —— 下面的数字不可信
            </div>
            <div className="text-12 text-subtle break-words">{summaryErr}</div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => void summary.refetch()}
          >
            重试
          </Button>
        </section>
      )}

      {/* KPI */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          icon={<BarChart2 />}
          label="总使用次数"
          value={num(s?.total)}
          loading={summary.isLoading}
          error={summary.error}
        />
        <StatCard
          icon={<TrendingUp />}
          label="今日使用"
          value={num(s?.today)}
          loading={summary.isLoading}
          error={summary.error}
        />
        <StatCard
          icon={<Users />}
          label="活跃用户(登录)"
          value={num(s?.unique_users)}
          loading={summary.isLoading}
          error={summary.error}
        />
        <StatCard
          icon={<UserX />}
          label="独立匿名访客"
          value={num(s?.unique_anon)}
          loading={summary.isLoading}
          error={summary.error}
        />
      </section>

      {/* 每日趋势 */}
      <section className="rounded-16 border border-border bg-surface-card p-4 mb-6">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-14 font-medium text-foreground">每日使用趋势</h3>
          {usageTrend.isLive && !summaryErr && hasTrendData && (
            <span className="text-12 text-faint">— — 今日(进行中)</span>
          )}
        </div>
        {/* 三态齐全:加载中给骨架、失败给错误+重试、窗口内无事件给空态。
            改造前这里是无条件渲染 ResponsiveContainer —— 加载中和真没数据画的是同一张
            「只有网格线和 0 刻度」的空坐标系,同页排行和漏斗反倒都有空态文案。 */}
        <div className="h-48">
          {summaryErr ? (
            <div className="h-full flex flex-col items-center justify-center gap-2 text-center">
              <AlertTriangle className="size-4 text-brand-red" />
              <span className="text-12 text-brand-red">趋势加载失败</span>
              <span className="text-12 text-faint max-w-full truncate" title={summaryErr}>
                {summaryErr}
              </span>
              <Button variant="outline" size="sm" onClick={() => void summary.refetch()}>
                重试
              </Button>
            </div>
          ) : summary.isLoading ? (
            <Skeleton className="h-full w-full" />
          ) : !hasTrendData ? (
            <div className="h-full flex items-center justify-center text-12 text-faint">
              <TrendingUp className="size-3.5 mr-1 inline" />
              窗口内还没有使用记录
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={usageTrend.data}
                margin={{ top: 5, right: 8, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="usageGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-brand-green)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="var(--color-brand-green)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: chartTheme.fontSize, fill: chartTheme.axis }}
                  axisLine={{ stroke: chartTheme.grid }}
                  tickLine={false}
                  tickFormatter={(d: string) => d.slice(5)}
                />
                <YAxis
                  tick={{ fontSize: chartTheme.fontSize, fill: chartTheme.axis }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                  tickFormatter={compactAxis}
                  width={38}
                />
                <Tooltip
                  contentStyle={chartTheme.tooltip}
                  labelStyle={{ color: 'var(--color-muted-foreground)', fontSize: chartTheme.fontSize }}
                  labelFormatter={(l) => withWeekday(String(l).slice(5), l as string)}
                  formatter={(v) => [Number(v ?? 0).toLocaleString(), '使用次数']}
                />
                <Area
                  type="monotone"
                  dataKey="count__main"
                  name="使用次数"
                  stroke="var(--color-brand-green)"
                  fill="url(#usageGrad)"
                  strokeWidth={2}
                  connectNulls={false}
                />
                {usageTrend.isLive && (
                  <Area
                    type="monotone"
                    dataKey="count__live"
                    stroke="var(--color-brand-green)"
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    fill="none"
                    connectNulls={false}
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {/* 功能排行 + 审稿漏斗 */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-16 border border-border bg-surface-card p-4">
          <h3 className="text-14 font-medium text-foreground mb-3">功能使用排行</h3>
          <div className="flex flex-col gap-3">
            {!summaryErr &&
              features.map((f) => (
                <div key={f.feature} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-12">
                    <span className="text-subtle font-medium">{f.feature_name}</span>
                    {/* 三个数一行,必须同一套格式 —— 只格式化第一个会出现
                        「12,345 次 · 用户 8421 · 匿名 15233」这种一行两套数字 */}
                    <span className="text-faint tabular-nums">
                      {f.count.toLocaleString()} 次 · 用户 {f.unique_users.toLocaleString()} · 匿名{' '}
                      {f.unique_anon.toLocaleString()}
                    </span>
                  </div>
                  <div className="h-2 rounded-pill bg-surface-2 overflow-hidden">
                    <div
                      className="h-full bg-brand-green rounded-pill"
                      style={{ width: `${(f.count / maxFeature) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            {summary.isLoading && (
              <>
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full rounded-8" />
                ))}
              </>
            )}
            {summaryErr ? (
              <p className="text-12 text-brand-red py-6 text-center">排行加载失败,请重试</p>
            ) : (
              !summary.isLoading &&
              features.length === 0 && (
                <p className="text-12 text-faint py-6 text-center">
                  暂无数据(新统计自部署后开始累积)
                </p>
              )
            )}
          </div>
        </div>

        <div className="rounded-16 border border-border bg-surface-card p-4">
          <h3 className="text-14 font-medium text-foreground mb-1">智能审稿漏斗</h3>
          <p className="text-12 text-faint mb-3">
            按 submission 去重 —— 同一次审稿的各步骤串联,看每步流失
          </p>
          <div className="flex flex-col gap-3">
            {/* 副标题写着「看每步流失」,却只给绝对值 —— 流失率得管理员心算两个数的比值。
                这里直接算出来:总转化 = 相对第一步;较上一步 = 相邻两步的差。 */}
            {!funnelErr &&
              hasFunnelData &&
              stages.map((st, i) => {
                const prev = i > 0 ? stages[i - 1].submissions : 0;
                const step = i > 0 ? st.submissions - prev : 0;
                return (
                  <div key={st.action} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-2 text-12">
                      <span className="text-subtle font-medium truncate">{st.label}</span>
                      <span className="flex shrink-0 items-center gap-2 text-faint tabular-nums">
                        <span className="text-subtle">{st.submissions.toLocaleString()}</span>
                        <span>总转化 {pct(st.submissions, funnelEntry)}</span>
                        {i > 0 && prev > 0 && (
                          <span className={step < 0 ? 'text-brand-red' : 'text-faint'}>
                            较上一步{' '}
                            {step === 0
                              ? '0%'
                              : `${step < 0 ? '-' : '+'}${pct(Math.abs(step), prev)}`}
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="h-2 rounded-pill bg-surface-2 overflow-hidden">
                      <div
                        className="h-full bg-brand-red rounded-pill"
                        style={{ width: `${(st.submissions / maxFunnel) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            {funnel.isLoading && (
              <>
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full rounded-8" />
                ))}
              </>
            )}
            {funnelErr ? (
              <div className="flex flex-col items-center gap-2 py-6">
                <p className="text-12 text-brand-red text-center">漏斗加载失败:{funnelErr}</p>
                <Button variant="outline" size="sm" onClick={() => void funnel.refetch()}>
                  重试
                </Button>
              </div>
            ) : (
              // 后端恒返回 5 个阶段(缺失补 0),所以「没数据」= 每一步都是 0,不能靠 length 判。
              !funnel.isLoading &&
              !hasFunnelData && <p className="text-12 text-faint py-6 text-center">暂无审稿数据</p>
            )}
          </div>
        </div>
      </section>
    </AdminPageLayout>
  );
}
