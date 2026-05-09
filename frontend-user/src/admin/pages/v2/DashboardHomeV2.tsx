/**
 * DashboardHome v2 — 后台首页综合统计
 *
 * 设计:
 *   - 顶部 4 个核心指标(用户/订单/收入/会话)
 *   - 4 张趋势卡(用户增长/订单/收入/活跃)
 *   - 资源概览(优惠券/Prompt/第三方账号)
 *   - 自动 30s 刷新(用 react-query refetchInterval)
 */

import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Users,
  ShoppingCart,
  DollarSign,
  MessageSquare,
  TrendingUp,
  Activity,
  Ticket,
  Sparkles,
  Database,
  Inbox,
  Send,
  AlertCircle,
  ArrowRight,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  Cell,
} from 'recharts';

import { adminAPI } from '../../services/api';
import { PageLayout } from '../../components/ui/page-layout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Skeleton } from '../../components/ui/skeleton';
import { ErrorState } from '../../components/ui/error-state';

interface DashboardStats {
  total_users?: number;
  new_users_today?: number;
  new_users_7d?: number;
  new_users_30d?: number;
  online_users?: number;
  active_users_30d?: number;
  total_revenue?: number | string;
  revenue_today?: number | string;
  revenue_7d?: number | string;
  revenue_30d?: number | string;
  total_orders?: number;
  paid_orders?: number;
  pending_orders?: number;
  paid_users?: number;
  free_users?: number;
  total_conversations?: number;
  conversations_today?: number;
  total_messages?: number;
  total_coupons?: number;
  used_coupons?: number;
  unused_coupons?: number;
  third_party_accounts?: number;
  prompt_templates?: number;
  user_growth_chart?: { date: string; value: number }[];
  order_trend_chart?: { date: string; value: number }[];
  revenue_trend_chart?: { date: string; value: number }[];
}

export default function DashboardHomeV2() {
  const statsQuery = useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: async () => {
      const r = await adminAPI.getDashboardStatistics();
      return (r.data?.data || {}) as DashboardStats;
    },
    refetchInterval: 30_000,
  });

  // 待处理统计 — 复用现有 API,本地聚合
  const pendingQuery = useQuery({
    queryKey: ['admin', 'dashboard', 'pending'],
    queryFn: async () => {
      const [fbResp, msgResp] = await Promise.all([
        adminAPI.getFeedbackStats().catch(() => ({ data: { data: {} } })),
        adminAPI.getMessageStats().catch(() => ({ data: { data: {} } })),
      ]);
      return {
        feedback_pending: (fbResp.data?.data?.pending ?? 0) as number,
        msg_pending: (msgResp.data?.data?.pending ?? 0) as number,
        msg_failed: (msgResp.data?.data?.failed ?? 0) as number,
      };
    },
    refetchInterval: 30_000,
  });

  // DAU/WAU/MAU 折线
  const activeQuery = useQuery({
    queryKey: ['admin', 'dashboard', 'active-users'],
    queryFn: async () => {
      const r = await adminAPI.getActiveUserInsights(30, 'day');
      return r.data?.data || {};
    },
    refetchInterval: 60_000,
  });

  // 付费转化漏斗
  const funnelQuery = useQuery({
    queryKey: ['admin', 'dashboard', 'funnel'],
    queryFn: async () => {
      const r = await adminAPI.getPaymentFunnel(30);
      return r.data?.data || {};
    },
    refetchInterval: 60_000,
  });

  if (statsQuery.isError) {
    return (
      <PageLayout title="仪表盘" description="平台运营关键指标">
        <ErrorState onRetry={() => statsQuery.refetch()} />
      </PageLayout>
    );
  }

  const s = statsQuery.data || {};
  const loading = statsQuery.isLoading;

  const pending = pendingQuery.data;
  const totalPending =
    (pending?.feedback_pending ?? 0) + (pending?.msg_pending ?? 0) + (pending?.msg_failed ?? 0);

  return (
    <PageLayout title="仪表盘" description="平台运营关键指标 · 30 秒自动刷新">
      {/* 待处理 — 最显眼,告诉管理员"打开后台后该做啥" */}
      {totalPending > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-900">
              <Inbox className="h-4 w-4" />
              待处理 ({totalPending})
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(pending?.feedback_pending ?? 0) > 0 && (
              <PendingTile
                to="/admin/feedbacks?status=pending"
                icon={<MessageSquare className="h-4 w-4 text-blue-500" />}
                label="待处理反馈"
                count={pending!.feedback_pending}
              />
            )}
            {(pending?.msg_pending ?? 0) > 0 && (
              <PendingTile
                to="/admin/messages?status=pending"
                icon={<Send className="h-4 w-4 text-violet-500" />}
                label="待发送消息"
                count={pending!.msg_pending}
              />
            )}
            {(pending?.msg_failed ?? 0) > 0 && (
              <PendingTile
                to="/admin/messages?status=failed"
                icon={<AlertCircle className="h-4 w-4 text-red-500" />}
                label="发送失败消息"
                count={pending!.msg_failed}
              />
            )}
          </div>
        </div>
      )}

      {/* 核心 4 指标 */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <BigStat
          title="总用户"
          value={s.total_users}
          delta={s.new_users_today}
          deltaLabel="今日新增"
          icon={<Users className="h-5 w-5 text-blue-500" />}
          loading={loading}
        />
        <BigStat
          title="累计订单"
          value={s.total_orders}
          delta={s.paid_orders}
          deltaLabel="已支付"
          icon={<ShoppingCart className="h-5 w-5 text-violet-500" />}
          loading={loading}
        />
        <BigStat
          title="累计收入"
          value={Number(s.total_revenue ?? 0)}
          delta={Number(s.revenue_today ?? 0)}
          deltaLabel="今日"
          prefix="¥"
          icon={<DollarSign className="h-5 w-5 text-emerald-500" />}
          loading={loading}
        />
        <BigStat
          title="累计会话"
          value={s.total_conversations}
          delta={s.conversations_today}
          deltaLabel="今日"
          icon={<MessageSquare className="h-5 w-5 text-amber-500" />}
          loading={loading}
        />
      </div>

      {/* 趋势图 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TrendCard title="用户增长 (近 30 天)" data={s.user_growth_chart} loading={loading} icon={<TrendingUp className="h-4 w-4 text-blue-500" />} />
        <TrendCard title="订单趋势 (近 30 天)" data={s.order_trend_chart} loading={loading} icon={<ShoppingCart className="h-4 w-4 text-violet-500" />} />
        <TrendCard title="收入趋势 (近 30 天)" data={s.revenue_trend_chart} loading={loading} icon={<DollarSign className="h-4 w-4 text-emerald-500" />} valuePrefix="¥" />
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Activity className="h-4 w-4 text-blue-500" />在线 / 活跃</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <Mini label="当前在线" value={s.online_users} loading={loading} />
            <Mini label="30 天活跃" value={s.active_users_30d} loading={loading} />
            <Mini label="付费用户" value={s.paid_users} loading={loading} />
            <Mini label="免费用户" value={s.free_users} loading={loading} />
          </CardContent>
        </Card>
      </div>

      {/* 进阶洞察 — DAU/WAU/MAU + 付费漏斗 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-blue-500" />
              活跃用户洞察 (近 30 天)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-3 grid grid-cols-3 gap-3">
              <Mini label="DAU (今日)" value={activeQuery.data?.dau_now} loading={activeQuery.isLoading} />
              <Mini label="WAU (7 日)" value={activeQuery.data?.wau_now} loading={activeQuery.isLoading} />
              <Mini label="MAU (30 日)" value={activeQuery.data?.mau_now} loading={activeQuery.isLoading} />
            </div>
            <div className="h-44">
              {activeQuery.isLoading ? (
                <Skeleton className="h-full w-full" />
              ) : !activeQuery.data?.series || activeQuery.data.series.length === 0 ? (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  暂无数据
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={activeQuery.data.series}
                    margin={{ top: 5, right: 12, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: 6,
                        fontSize: 12,
                      }}
                    />
                    <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <DollarSign className="h-4 w-4 text-emerald-500" />
              付费转化漏斗 (近 30 天)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {funnelQuery.isLoading ? (
              <Skeleton className="h-56 w-full" />
            ) : !funnelQuery.data?.steps || funnelQuery.data.steps.length === 0 ? (
              <div className="flex h-56 items-center justify-center text-xs text-muted-foreground">
                暂无数据
              </div>
            ) : (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={funnelQuery.data.steps}
                    layout="vertical"
                    margin={{ top: 5, right: 60, left: 30, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis type="category" dataKey="stage" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" width={50} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: 6,
                        fontSize: 12,
                      }}
                      formatter={(v: number, _n: string, p: any) => [
                        `${v.toLocaleString()} (${(p.payload.rate * 100).toFixed(1)}%)`,
                        p.payload.stage,
                      ]}
                    />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                      {funnelQuery.data.steps.map((_step: any, i: number) => (
                        <Cell key={i} fill={['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981'][i % 4]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 资源概览 */}
      <Card>
        <CardHeader><CardTitle className="text-base">资源概览</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Mini label="优惠券总数" value={s.total_coupons} loading={loading} icon={<Ticket className="h-4 w-4 text-amber-500" />} />
          <Mini label="已使用券" value={s.used_coupons} loading={loading} />
          <Mini label="第三方账号" value={s.third_party_accounts} loading={loading} icon={<Database className="h-4 w-4 text-blue-500" />} />
          <Mini label="Prompt 模板" value={s.prompt_templates} loading={loading} icon={<Sparkles className="h-4 w-4 text-violet-500" />} />
        </CardContent>
      </Card>
    </PageLayout>
  );
}

function PendingTile({
  to,
  icon,
  label,
  count,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <Link
      to={to}
      className="group flex items-center justify-between rounded-md border border-amber-200/70 bg-background px-4 py-3 transition-colors hover:bg-amber-100/40"
    >
      <div className="flex items-center gap-2">
        {icon}
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-0.5 text-xl font-semibold tabular-nums">{count}</p>
        </div>
      </div>
      <ArrowRight className="h-4 w-4 text-amber-700 opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  );
}

function BigStat({
  title,
  value,
  delta,
  deltaLabel,
  icon,
  loading,
  prefix,
}: {
  title: string;
  value?: number;
  delta?: number;
  deltaLabel?: string;
  icon: React.ReactNode;
  loading?: boolean;
  prefix?: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-2 p-5">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{title}</span>
          {icon}
        </div>
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <p className="text-3xl font-bold tabular-nums">
            {prefix}
            {(value ?? 0).toLocaleString()}
          </p>
        )}
        {!loading && delta !== undefined && (
          <p className="text-xs text-muted-foreground">
            {deltaLabel}: <span className="font-medium text-emerald-600">+{prefix}{delta.toLocaleString()}</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Mini({
  label,
  value,
  loading,
  icon,
}: {
  label: string;
  value?: number;
  loading?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      {loading ? (
        <Skeleton className="mt-1 h-6 w-16" />
      ) : (
        <p className="mt-1 text-xl font-semibold tabular-nums">
          {(value ?? 0).toLocaleString()}
        </p>
      )}
    </div>
  );
}

function TrendCard({
  title,
  data,
  loading,
  icon,
  valuePrefix,
}: {
  title: string;
  data?: { date: string; value: number }[];
  loading?: boolean;
  icon: React.ReactNode;
  valuePrefix?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className={data && data.length > 0 ? 'h-56' : 'h-16'}>
        {loading ? (
          <Skeleton className="h-full w-full" />
        ) : !data || data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            暂无数据
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 6,
                  fontSize: 12,
                }}
                formatter={(v: number) => [`${valuePrefix || ''}${v.toLocaleString()}`, '']}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
