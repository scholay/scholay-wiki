import { useQuery } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';

/**
 * 字段名严格对齐后端 internal/admin/dashboard_handler.go。
 * 在线 / DAU / 漏斗 类指标已经从这里下线 —— 走 umami iframe(见 /admin /analytics)。
 */

export interface ChartDataPoint {
  date: string;
  value: number;
}

export interface DashboardStatistics {
  // 用户
  total_users: number;
  new_users_today: number;
  new_users_7d: number;
  new_users_30d: number;
  paid_users: number;
  free_users: number;
  // 收入(单位:元)
  total_revenue: number;
  revenue_today: number;
  revenue_7d: number;
  revenue_30d: number;
  // 订单
  total_orders: number;
  paid_orders: number;
  pending_orders: number;
  // 会话
  total_conversations: number;
  conversations_today: number;
  total_messages: number;
  // 优惠券
  total_coupons: number;
  used_coupons: number;
  unused_coupons: number;
  // 系统
  third_party_accounts: number;
  // 趋势
  user_growth_chart: ChartDataPoint[];
  order_trend_chart: ChartDataPoint[];
  revenue_trend_chart: ChartDataPoint[];
}

export function useDashboardStats() {
  return useQuery({
    queryKey: ['admin', 'dashboard', 'stats'],
    queryFn: async () => {
      const r = await http.get<{ data: DashboardStatistics }>('/admin/dashboard/statistics');
      return r.data.data;
    },
  });
}
