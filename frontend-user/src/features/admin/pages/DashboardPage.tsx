import { Users, Wallet, ShoppingCart } from 'lucide-react';
import { AdminPageLayout } from '../components/AdminPageLayout';
import { StatCard } from '../components/StatCard';
import { TodayPanel } from '../components/TodayPanel';
import { useDashboardStats } from '../api/dashboard';
import { Skeleton } from '@/shared/ui/skeleton';

export function DashboardPage() {
  const { data: stats, isLoading: l1 } = useDashboardStats();

  const fmt = (n?: number) => (typeof n === 'number' ? n.toLocaleString() : '—');
  // 后端 total_revenue 已经是"元",直接显示;若以后改为"分"再除 100
  const money = (n?: number) =>
    typeof n === 'number' ? `¥${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—';

  return (
    <AdminPageLayout
      title="看板"
      description="平台核心指标 · 用户/订单/营收 一屏直观;在线 / DAU / 漏斗 移至 /analytics"
    >
      {/* 今日待办 —— 第一屏最显眼位置 */}
      <TodayPanel />

      {/* KPI 第一行 —— 用户/订单/营收 */}
      <section className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {l1 ? (
          [...Array(3)].map((_, i) => <Skeleton key={i} className="h-28 rounded-md" />)
        ) : (
          <>
            <StatCard
              icon={<Users />}
              label="总用户"
              value={fmt(stats?.total_users)}
              hint={`今日新增 ${fmt(stats?.new_users_today)} · 30 日 ${fmt(stats?.new_users_30d)}`}
            />
            <StatCard
              icon={<ShoppingCart />}
              label="已支付订单"
              value={fmt(stats?.paid_orders)}
              hint={`总订单 ${fmt(stats?.total_orders)} · 待支付 ${fmt(stats?.pending_orders)}`}
            />
            <StatCard
              icon={<Wallet />}
              label="累计营收"
              value={money(stats?.total_revenue)}
              hint={`30 日 ${money(stats?.revenue_30d)} · 今日 ${money(stats?.revenue_today)}`}
            />
          </>
        )}
      </section>

      {/* KPI 第二行 —— 业务量(对话、付费比、优惠券) */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
        {l1 ? (
          [...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-md" />)
        ) : (
          <>
            <StatCard
              label="付费用户"
              value={fmt(stats?.paid_users)}
              hint={`免费 ${fmt(stats?.free_users)}`}
            />
            <StatCard
              label="对话总数"
              value={fmt(stats?.total_conversations)}
              hint={`今日 ${fmt(stats?.conversations_today)}`}
            />
            <StatCard
              label="优惠券"
              value={fmt(stats?.used_coupons)}
              hint={`未使用 ${fmt(stats?.unused_coupons)} / 总 ${fmt(stats?.total_coupons)}`}
            />
            <StatCard
              label="三方账号"
              value={fmt(stats?.third_party_accounts)}
              hint="AI / 学术数据源 API key 池"
            />
          </>
        )}
      </section>
    </AdminPageLayout>
  );
}
