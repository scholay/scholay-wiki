import { useState } from 'react';
import { BarChart2, TrendingUp, Users, UserX } from 'lucide-react';
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
 */

export function UsageStatsPage() {
  const [win, setWin] = useState<DateWindow>({ days: 30 });
  const summary = useUsageStatsSummary(win);
  const funnel = useUsageStatsFunnel(win);

  const s = summary.data;
  const usageTrend = buildDailyTrend(s?.daily ?? [], { valueKeys: ['count'] });
  const features = s?.by_feature ?? [];
  const maxFeature = Math.max(1, ...features.map((f) => f.count));
  const stages = funnel.data ?? [];
  const maxFunnel = Math.max(1, ...stages.map((st) => st.submissions));

  return (
    <AdminPageLayout
      title="使用统计"
      description="各功能使用量 / 趋势 / 智能审稿漏斗"
      actions={<DateRangeControl value={win} onChange={setWin} />}
    >
      {/* KPI */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          icon={<BarChart2 />}
          label="总使用次数"
          value={(s?.total ?? 0).toLocaleString()}
        />
        <StatCard
          icon={<TrendingUp />}
          label="今日使用"
          value={(s?.today ?? 0).toLocaleString()}
        />
        <StatCard
          icon={<Users />}
          label="活跃用户(登录)"
          value={(s?.unique_users ?? 0).toLocaleString()}
        />
        <StatCard
          icon={<UserX />}
          label="独立匿名访客"
          value={(s?.unique_anon ?? 0).toLocaleString()}
        />
      </section>

      {/* 每日趋势 */}
      <section className="rounded-16 border border-border bg-surface-card p-4 mb-6">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-14 font-medium text-foreground">每日使用趋势</h3>
          {usageTrend.isLive && <span className="text-12 text-faint">— — 今日(进行中)</span>}
        </div>
        <div className="h-48">
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
        </div>
      </section>

      {/* 功能排行 + 审稿漏斗 */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-16 border border-border bg-surface-card p-4">
          <h3 className="text-14 font-medium text-foreground mb-3">功能使用排行</h3>
          <div className="flex flex-col gap-3">
            {features.map((f) => (
              <div key={f.feature} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-12">
                  <span className="text-subtle font-medium">{f.feature_name}</span>
                  <span className="text-faint">
                    {f.count.toLocaleString()} 次 · 用户 {f.unique_users} · 匿名 {f.unique_anon}
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
            {!summary.isLoading && features.length === 0 && (
              <p className="text-12 text-faint py-6 text-center">
                暂无数据(新统计自部署后开始累积)
              </p>
            )}
          </div>
        </div>

        <div className="rounded-16 border border-border bg-surface-card p-4">
          <h3 className="text-14 font-medium text-foreground mb-1">智能审稿漏斗</h3>
          <p className="text-12 text-faint mb-3">
            按 submission 去重 —— 同一次审稿的各步骤串联,看每步流失
          </p>
          <div className="flex flex-col gap-3">
            {stages.map((st) => (
              <div key={st.action} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-12">
                  <span className="text-subtle font-medium">{st.label}</span>
                  <span className="text-faint">{st.submissions.toLocaleString()}</span>
                </div>
                <div className="h-2 rounded-pill bg-surface-2 overflow-hidden">
                  <div
                    className="h-full bg-brand-red rounded-pill"
                    style={{ width: `${(st.submissions / maxFunnel) * 100}%` }}
                  />
                </div>
              </div>
            ))}
            {!funnel.isLoading && stages.length === 0 && (
              <p className="text-12 text-faint py-6 text-center">暂无审稿数据</p>
            )}
          </div>
        </div>
      </section>
    </AdminPageLayout>
  );
}
