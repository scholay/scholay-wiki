// 会员 / 计费 / 账户资产 —— 用户端 hooks。字段对齐 backend/internal/vip
// (quota.go Overview / wallet.go BalanceView / order.go Order / billing_handler.go)。
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';
import { type SubQuote } from '@/shared/components';

export type Tier = 'free' | 'pro' | 'max';

// P4:额度 = 首次使用开锚的 7 天周期(mirrors vip/quota.go TokenStatus)。
export interface TokenStatus {
  used: number; // 窗口口径(额度条)
  ceiling: number; // -1 = 不限
  percent: number;
  unlimited: boolean;
  consumed_today: number; // 当日真实消耗(统计,重置不清零)
  window_days: number; // 周期长度(天,默认 7)
  window_started_at: string | null; // null = 未开窗(满血,下次使用开始计时)
  window_reset_at: string | null; // 窗口自动重置时刻
}
export interface CreditLot {
  amount: number;
  expires_at: string;
  source: string;
}
export interface Balance {
  temp: number;
  perm: number;
  total: number;
  lots: CreditLot[];
}
export interface Overview {
  tier: Tier;
  expires_at: string | null;
  token: TokenStatus;
  credit: Balance;
  auto_reset: boolean;
  reset_cost: number;
}

export interface RedeemResult {
  kind: 'tier' | 'credit';
  tier?: Tier;
  expires_at?: string;
  credits?: number;
  credit_kind?: 'temp' | 'perm';
}

/** 兑换前预览(确认弹窗用):码有效时返回将授予的内容。 */
export interface CodePreview {
  grant_kind: 'tier' | 'credit';
  grant_tier?: Tier;
  grant_days?: number;
  grant_credits?: number;
  credit_kind?: 'temp' | 'perm';
  note?: string;
  valid_until?: string | null;
  uses_left: number;
}

export interface ResetResult {
  used: number;
  ceiling: number;
  balance: Balance;
}

export interface CreditTxn {
  id: number;
  type: string;
  amount: number;
  temp_after: number;
  perm_after: number;
  ref_type: string;
  ref_id: string;
  note: string;
  created_at: string;
}

export interface PlanCard {
  tier: Tier;
  price_cents: number;
  original_cents: number;
  multiplier: number;
  grant_credits: number;
}
export interface Plans {
  free_daily_tokens: number; // 兼容字段:后端回窗口÷天数的日均口径(P4)
  free_window_tokens: number; // 7 天周期基准额度
  window_days: number;
  reset_cost_credits: number;
  recharge_rate: number;
  min_recharge_cents: number;
  popular_plan: string;
  enabled: boolean;
  test_payment: boolean; // 测试支付开关(PAYMENT_TEST_ENABLED)
  payment_methods: { alipay: boolean; wechat: boolean }; // admin 配置里启用的支付渠道
  plans: PlanCard[];
}

export interface Order {
  id?: number;
  order_no: string;
  order_type: string; // subscription | recharge
  plan_code: string;
  plan_name?: string;
  amount: number;
  final_amount: number;
  credits_granted: number;
  status: string;
  payment_method?: string;
  created_at?: string;
  payment_time?: string | null;
}

/** 已支付订单明细(明细查看)。type 可选 subscription|recharge。 */
export function useOrders(type?: string) {
  return useQuery({
    queryKey: ['settings', 'billing', 'orders', type ?? 'all'],
    queryFn: async () =>
      (await http.get<{ data: { items: Order[] } }>('/user/billing/orders', { params: type ? { type } : {} })).data.data
        .items,
    staleTime: 30_000,
  });
}

const KEY = ['settings', 'billing'];

/** 账户资产总览(等级/到期/今日额度/经费余额/重置参数)。 */
export function useBillingOverview() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => (await http.get<{ data: Overview }>('/user/billing/overview')).data.data,
    staleTime: 15_000,
  });
}

/** 套餐(公开):价格/倍率/赠送 + 充值/重置参数。 */
export function usePlans() {
  return useQuery({
    queryKey: ['billing', 'plans'],
    queryFn: async () => (await http.get<{ data: Plans }>('/billing/plans')).data.data,
    staleTime: 60_000,
  });
}

export interface DayUsage {
  date: string; // YYYY-MM-DD
  tokens: number;
}
export interface UsageCalendar {
  days: DayUsage[];
  daily_ceiling: number; // -1 = 不限
}

/** 当月每日 token 用量(绿格热力图)。 */
export function useUsageCalendar() {
  return useQuery({
    queryKey: ['settings', 'billing', 'usage-calendar'],
    queryFn: async () => (await http.get<{ data: UsageCalendar }>('/user/billing/usage-calendar')).data.data,
    staleTime: 60_000,
  });
}

/** 经费流水(分页)。 */
export function useTransactions(params: { type?: string; page?: number; page_size?: number }) {
  return useQuery({
    queryKey: ['settings', 'billing', 'txns', params],
    queryFn: async () =>
      (await http.get<{ data: { items: CreditTxn[]; total: number } }>('/user/billing/transactions', { params }))
        .data.data,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: KEY });
}

/** 订阅/续期/升级报价(不建单):算应付金额 + 动作。供购买弹窗显示。模块级函数=稳定引用。 */
export async function quoteSubscription(tier: 'pro' | 'max'): Promise<SubQuote> {
  return (await http.get<{ data: SubQuote }>('/user/billing/subscribe/quote', { params: { tier } })).data.data;
}

/** 兑换前预览(不兑换):返回码将授予的内容;码无效/过期/用完/已兑换则 reject(走失败态)。 */
export function useRedeemPreview() {
  return useMutation({
    mutationFn: async (code: string) =>
      (await http.post<{ data: CodePreview }>('/user/redeem-code/preview', { code })).data.data,
  });
}

/** 兑换码(会员 or 经费)。 */
export function useRedeemCode() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (code: string) =>
      (await http.post<{ data: RedeemResult }>('/user/redeem-code', { code })).data.data,
    onSuccess: invalidate,
  });
}

/** 消耗经费立即重置今日额度。 */
export function useResetQuota() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async () => (await http.post<{ data: ResetResult }>('/user/billing/reset')).data.data,
    onSuccess: invalidate,
  });
}

/* 自动消耗经费重置开关已下线 —— 额度耗尽只保留用户显式手动重置(useResetQuota)。 */

/** 建充值订单(金额单位:分)。 */
export function useCreateRecharge() {
  return useMutation({
    mutationFn: async (amountCents: number) =>
      (await http.post<{ data: Order }>('/user/billing/recharge', { amount_cents: amountCents })).data.data,
  });
}

/** 建订阅订单(plan = pro|max)。 */
export function useCreateSubscription() {
  return useMutation({
    mutationFn: async (plan: Tier) =>
      (await http.post<{ data: Order }>('/user/billing/subscribe', { plan })).data.data,
  });
}

/** 测试支付(无网关, 一键完成订单履约)。仅后端开 PAYMENT_TEST_ENABLED 时可用。成功后刷新总览。 */
export function useTestPay() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (orderNo: string) =>
      (await http.post<{ data: Overview }>('/user/billing/test-pay', { order_no: orderNo })).data.data,
    onSuccess: invalidate,
  });
}

/** 对已建订单发起支付宝支付, 返回收银台 URL(由调用方跳转)。
 *  channel='wap' → 手机网站支付(移动端);省略/'pc' → 电脑网站支付(默认)。
 *  手机端建议传 return_url/quit_url=移动端落地页(如 /m/me),付完 / 退出都回到 App 内。 */
export function useStartAlipay() {
  return useMutation({
    mutationFn: async (args: {
      order_no: string;
      amount: number;
      subject: string;
      channel?: 'pc' | 'wap';
      return_url?: string;
      quit_url?: string;
    }) =>
      (
        await http.post<{ data: { payment_url: string; order_no: string } }>('/user/payment/alipay/create', {
          order_no: args.order_no,
          amount: args.amount,
          subject: args.subject,
          ...(args.channel ? { channel: args.channel } : {}),
          ...(args.return_url ? { return_url: args.return_url } : {}),
          ...(args.quit_url ? { quit_url: args.quit_url } : {}),
        })
      ).data.data,
  });
}
