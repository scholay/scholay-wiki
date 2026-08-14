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
  // 🔴 revenue_* 是**毛额**(orders.status='paid' 之和)。退款不改 orders.status(见 0107),
  // 所以它不会因退款减少 —— 要展示收入必须减去下面的 refunded_*,别直接拿毛额当收入。
  total_revenue: number;
  revenue_today: number;
  revenue_7d: number;
  revenue_30d: number;
  /** 退款额(order_refunds,按退款发生时间归属)。净额 = 毛额 - 退款额。 */
  total_refunded: number;
  refunded_today: number;
  refunded_7d: number;
  refunded_30d: number;
  // 订单
  total_orders: number;
  paid_orders: number;
  pending_orders: number;
  // AI 成本(P5 成本制:llm_token_usage.cost_micro_yuan 精算真实成本;单位=元)
  cost_today_yuan: number;
  cost_30d_yuan: number;
  // 兑换码
  total_codes: number;
  redeemed_codes: number;
  // 趋势
  user_growth_chart: ChartDataPoint[];
  revenue_trend_chart: ChartDataPoint[];
  cost_trend_chart: ChartDataPoint[]; // 每日精算成本(元)
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
