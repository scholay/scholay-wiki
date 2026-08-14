// 订单与营收(后台)—— 字段对齐 backend/internal/vip/admin_orders.go。
// 数据真源:orders 表(vip 充值 recharge / 订阅 subscription;金额单位「元」)。
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  billing_cycle: string; // monthly | yearly | once(充值)—— 年度单显式彰显(0079)
  amount: number; // 单位「元」(DB decimal(10,2)),不是分
  final_amount: number; // 实付金额,单位「元」
  status: 'pending' | 'paid' | 'expired';
  payment_method: string;
  payment_time: string | null;
  credits_granted: number; // 发放的经费。刻度「经费 = 分」(100 经费 = ¥1,0095 重锚后)
  /** 网关交易号(微信/支付宝侧)。管理员去商户后台退款时要拿的就是这个号 —— 列表必须渲染它。 */
  transaction_no: string;
  sub_action: string;
  created_at: string;

  // ── 退款(0107)────────────────────────────────────────────────────────────
  // 🔴 退款**不改 status**(仍是 'paid'),另立 refund_status 表达。
  // 改 status 会让订单从用户自己的账单里整行消失(ListUserOrders 硬编码 status='paid')、
  // 让历史某天的营收柱子被追溯性改写、并让延迟到达的网关回调被拒导致网关无限重推。
  /** 累计已退金额(元) */
  refunded_amount: number;
  /** ''=未退款 | partial=部分退款 | full=已全额退完 */
  refund_status: '' | 'partial' | 'full';
}

/** 一笔退款单据。镜像 backend/internal/vip/refund.go 的 OrderRefund。 */
export interface OrderRefund {
  id: number;
  refund_no: string;
  order_no: string;
  user_id: number;
  amount: number;
  reason: string;
  channel: string;
  gateway_refund_no: string;
  status: string;
  /** 按退款比例应回收的经费 */
  credits_expected: number;
  /** 实际回收(余额不足时小于应收) */
  credits_reclaimed: number;
  /** 差额 = 应收 - 实收,由平台承担;>0 说明用户已消费掉了 */
  credits_shortfall: number;
  membership_revoked: boolean;
  operator_id: number;
  operator_name: string;
  created_at: string;
}

export interface AdminOrderFilters {
  days?: number;
  status?: string; // pending | paid | expired
  type?: string; // recharge | subscription
  /**
   * 只按**用户**检索。后端 AdminList 的 UserSearchClause 传的是
   * users.id / users.username / users.email / users.phone —— **订单号 / 交易号搜不到**。
   * 前端 placeholder 必须如实标注,别让人拿着订单号白搜。
   */
  keyword?: string;
}

export interface AdminOrderListParams extends AdminOrderFilters {
  page?: number;
  page_size?: number;
}

/** KPI 总计。**所有 revenue/recharge/subscription 字段单位「元」**,计数字段是笔数。 */
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
  // 退款(0107)—— 上面的 revenue* 是**毛额**,口径不变;退款单列一项,净额 = 毛额 - 退款额。
  // 按退款发生时间归属,不是原订单支付日。
  refunded_today: number;
  refunded: number;
  refunded_all: number;
  refund_today: number;
  refund_count: number;
  refund_all: number;
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
    // params(含 page)在 key 里,翻页保留上一页数据,避免表格塌空闪白。
    placeholderData: keepPreviousData,
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

/** 退款状态标签。空串 = 未退款,不渲染徽章。 */
export const REFUND_STATUS_LABEL: Record<string, string> = {
  partial: '部分退款',
  full: '已退款',
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

// ─────────────────────────────────────────────────────────────────────────────
// 退款(0107)—— 后端 backend/internal/vip/refund.go + admin_orders.go
//
// ⚠️ 这两个接口**不调用支付网关**。当前口径:管理员先去支付宝/微信商户后台把钱退掉,
// 回到管理台登记 —— 系统做的是记账 + 权益回收 + 通知用户 + 留痕。UI 必须说清楚,
// 否则管理员会以为点一下钱就退出去了。
// ─────────────────────────────────────────────────────────────────────────────

export interface RefundOrderInput {
  orderNo: string;
  /** 本次退款金额(元)。0 或省略 = 按剩余可退全额退 */
  amount?: number;
  /** 内部退款原因(必填)。只进 order_refunds,不下发给用户 */
  reason: string;
  /** 商户后台那笔退款的单号,选填,用于对账 */
  gateway_refund_no?: string;
  /** 是否连带撤销会员(仅订阅单有意义) */
  revoke_membership?: boolean;
  /**
   * 幂等键 —— 弹窗打开时生成一次,**重试沿用同一个**。
   *
   * 🔴 必须由前端带:后端事务第一步就锁订单行,两次提交被串行化,任何服务端派生的序号
   * 第二次都会前进、撞不上唯一索引 —— 那种"幂等"在结构上不可能生效。
   * 真实危险场景是重试:请求已提交但响应丢失(nginx 读超时 / 网络抖动),
   * 弹窗保留输入让管理员再点一次 → 同一笔钱被登记两次、经费被回收两次。
   * 后端对同键会把上一次的结果原样回放,不会二次扣。
   */
  idempotency_key: string;
}

export interface RefundOrderResult {
  refund: OrderRefund;
  refunded_total: number;
  refund_status: 'partial' | 'full';
}

/** 某订单的退款明细(部分退款可能有多笔)。orderNo 为空时不发请求。 */
export function useOrderRefunds(orderNo: string | null) {
  return useQuery({
    queryKey: ['admin', 'orders', 'refunds', orderNo],
    queryFn: async () =>
      (
        await http.get<{ data: { items: OrderRefund[] } }>(
          `/admin/billing/orders/${encodeURIComponent(orderNo!)}/refunds`
        )
      ).data.data.items ?? [],
    enabled: !!orderNo,
  });
}

/** 登记一笔退款并回收权益。 */
export function useRefundOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderNo, ...body }: RefundOrderInput) =>
      (
        await http.post<{ data: RefundOrderResult }>(
          `/admin/billing/orders/${encodeURIComponent(orderNo)}/refund`,
          body
        )
      ).data.data,
    onSuccess: (_res, vars) => {
      // 退款会改动:订单列表(refund_status/refunded_amount)、营收 KPI(退款额)、
      // 该订单的退款明细、以及用户的会员/钱包 —— 一次性全失效,别让管理员看到旧数字。
      void qc.invalidateQueries({ queryKey: ['admin', 'orders'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'orders', 'refunds', vars.orderNo] });
      void qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
}
