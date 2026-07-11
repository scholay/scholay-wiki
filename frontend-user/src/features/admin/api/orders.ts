// 订单与营收(后台)—— 字段对齐 backend/internal/vip/admin_orders.go。
// 数据真源:orders 表(vip 充值 recharge / 订阅 subscription;金额单位「元」)。
import { useQuery } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';

export interface AdminOrder {
  id: number;
  user_id: number;
  username: string;
  email: string;
  order_no: string;
  order_type: 'recharge' | 'subscription';
  plan_code: string;
  plan_name: string;
  amount: number;
  final_amount: number;
  status: 'pending' | 'paid' | 'expired';
  payment_method: string;
  payment_time: string | null;
  credits_granted: number;
  transaction_no: string;
  sub_action: string;
  created_at: string;
}

export interface AdminOrderFilters {
  days?: number;
  status?: string; // pending | paid | expired
  type?: string; // recharge | subscription
  keyword?: string; // 用户 ID / 用户名 / 邮箱 / 手机号
}

export interface AdminOrderListParams extends AdminOrderFilters {
  page?: number;
  page_size?: number;
}

export interface AdminOrderTotals {
  // 营收:今日 / 窗口 / 全部
  revenue_today: number;
  revenue: number;
  revenue_all: number;
  // 营收构成 · 充值
  recharge_today: number;
  recharge_revenue: number;
  recharge_all: number;
  // 营收构成 · 订阅
  subscription_today: number;
  subscription_revenue: number;
  subscription_all: number;
  // 已支付订单数
  paid_today: number;
  paid_count: number;
  paid_all: number;
  // 兑换码核销
  redeemed_today: number;
  redeemed_codes: number;
  redeemed_all: number;
  // 订单状态(窗口内)
  pending_count: number;
  expired_count: number;
}

export interface AdminRevenueDay {
  date: string;
  recharge: number;
  subscription: number;
  orders: number;
}

export interface AdminOrderStats {
  days: number;
  totals: AdminOrderTotals;
  daily: AdminRevenueDay[];
}

/** 订单分页列表(全部用户、全部状态)。 */
export function useAdminOrders(params: AdminOrderListParams) {
  return useQuery({
    queryKey: ['admin', 'orders', 'list', params],
    queryFn: async () => {
      const r = await http.get<{ data: { items: AdminOrder[]; total: number } }>('/admin/billing/orders', {
        params,
      });
      return { items: r.data.data.items ?? [], total: r.data.data.total ?? 0 };
    },
  });
}

/** 营收 KPI + 每日趋势(充值/订阅拆段)。 */
export function useAdminOrderStats(days: number) {
  return useQuery({
    queryKey: ['admin', 'orders', 'stats', days],
    queryFn: async () =>
      (await http.get<{ data: AdminOrderStats }>('/admin/billing/orders/stats', { params: { days } })).data.data,
    staleTime: 30_000,
  });
}

export const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: '待支付',
  paid: '已支付',
  expired: '已过期',
};

export const ORDER_TYPE_LABEL: Record<string, string> = {
  recharge: '充值',
  subscription: '订阅',
};

export const PAY_METHOD_LABEL: Record<string, string> = {
  alipay: '支付宝',
  wechat: '微信',
  test: '测试支付',
};
