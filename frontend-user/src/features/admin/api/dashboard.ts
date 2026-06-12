import { useQuery } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';

/**
 * 字段名严格对齐后端 internal/admin/dashboard_service.go(2026-06 体检后收口)。
 * 在线 / DAU / 漏斗 类指标已经从这里下线 —— 走 umami iframe(见 /admin /analytics)。
 * 已删除的死指标:对话数(表已 DROP)/ 优惠券(stranded 表)/ 三方账号计数(配置库存非经营指标)。
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
  // 收入(单位:元,orders 表 status=paid)
  total_revenue: number;
  revenue_today: number;
  revenue_7d: number;
  revenue_30d: number;
  // 订单
  total_orders: number;
  paid_orders: number;
  pending_orders: number;
  // AI 成本(llm_token_usage)
  tokens_today: number;
  tokens_30d: number;
  // 兑换码
  total_codes: number;
  redeemed_codes: number;
  // 趋势
  user_growth_chart: ChartDataPoint[];
  revenue_trend_chart: ChartDataPoint[];
  token_trend_chart: ChartDataPoint[];
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
