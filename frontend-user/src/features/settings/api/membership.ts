// 会员 / 计费 / 账户资产 —— 用户端 hooks。字段对齐 backend/internal/vip
// (quota.go Overview / wallet.go BalanceView / order.go Order / billing_handler.go)。
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';
import { type SubQuote, type BillingCycle } from '@/shared/components';

export type Tier = 'free' | 'pro' | 'max';
export type { BillingCycle };

// P4:额度 = 首次使用开锚的 7 天周期(mirrors vip/quota.go TokenStatus)。
// P5 成本制:用户端后端 StripQuotaAmounts —— used/consumed_today 恒 0、ceiling 仅 -1(不限)或 0,
// 用户只看百分比(percent 是真值)。绝对额度(算力点)只在后台可见。
export interface TokenStatus {
  used: number; // 用户端恒 0(已抹除;后台真值另走 admin 接口)
  ceiling: number; // 用户端:-1 = 不限,否则 0(已抹除)
  percent: number; // 真值:本周期已用百分比(0..100)
  unlimited: boolean;
  consumed_today: number; // 用户端恒 0(已抹除)
  window_days: number; // 周期长度(天,默认 7)
  window_started_at: string | null; // null = 未开窗(满血,下次使用开始计时)
  window_reset_at: string | null; // 窗口自动重置时刻
}
// 0090:经费不再分临时/永久 —— 只剩一种,对外就叫「经费」。
// 0094:经费是**小数**(可直接消耗成额度,单次调用常只花零点几经费)。
export interface Balance {
  /** 展示用小数经费(= perm_micro / 1e6)。只用于渲染,别拿它做扣减运算。 */
  perm: number;
  total: number; // == perm,保留字段名兼容既有调用点
  /** 余额真值,单位 micro-credit = 经费 × 1e6。精确运算以它为准。 */
  perm_micro: number;
  /** 当前兑换率下折合的算力点。**必须与余额同屏展示** —— 兑换率可调,
   *  只给「600 经费」用户无从知道它值多少算力(经费是储值,汇率不锁定)。 */
  points: number;
  /** 周期额度用完后自动用经费续(0094)。默认关,须用户显式开启。 */
  credit_autopay: boolean;
}
export interface Overview {
  tier: Tier;
  /** 付费档在期时的计费周期(yearly=年费会员徽标);免费/过期时后端省略(0079)。 */
  cycle?: BillingCycle;
  expires_at: string | null;
  token: TokenStatus;
  credit: Balance;
  auto_reset: boolean;
  /** 可用重置次数。0090 起取代 reset_cost —— 重置扣的是次数不是经费,
   *  「重置」入口必须按这个数判可用性(按经费余额判会两头都错)。 */
  reset_passes: number;
  /** 最近一批次数的到期时刻;null = 无可用次数。 */
  reset_pass_next_expiry: string | null;
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

// mirrors backend/internal/vip/quota.go ResetResult(经 StripAmounts 出口整形)
export interface ResetResult {
  used: number; // 用户端恒 0(已抹除),与 TokenStatus 同一条不变量
  ceiling: number; // 用户端:-1 = 不限,否则 0(已抹除)
  balance: Balance; // 经费余额是真值 —— 经费对用户可见
}

export interface CreditTxn {
  id: number;
  type: string;
  amount: number; // 0098 起可带小数(payg 日聚合行;DECIMAL(18,6))
  temp_after: number;
  perm_after: number;
  ref_type: string;
  ref_id: string;
  note: string;
  day_bucket?: string | null; // 仅 type=payg_daily 有值(日聚合桶,0098)
  created_at: string;
}

export interface PlanCard {
  tier: Tier;
  price_cents: number;
  original_cents: number;
  multiplier: number;
  // 0090:订阅不再赠送经费,grant_credits / year_grant_credits 已从后端 PublicPlans 移除。
  year_price_cents: number; // 年度实付价(分);<=0 = 该档年付未开放(0079)
  year_original_cents: number; // 年度划线原价(分)
}
export interface Plans {
  // free_window_tokens / free_daily_tokens 已从这个**免登录**端点移除:基数 × multiplier
  // = 三档的绝对额度上限,任何访客都能算出来(见 backend billing_handler.go PublicPlans)。
  // 用户侧本来就零渲染,只有这两行 interface 声明存在过。要看基数去 /admin/billing/config。
  window_days: number;
  // reset_cost_credits 已从后端移除:0090 起重置扣「重置次数」不扣经费。
  recharge_rate: number;
  /** 1 经费可兑换的算力点(0094)。¥1 = recharge_rate × credit_to_points 算力点。 */
  credit_to_points: number;
  min_recharge_cents: number;
  popular_plan: string;
  enabled: boolean;
  test_payment: boolean; // 测试支付开关(PAYMENT_TEST_ENABLED)
  // subscription_year_days 已移除:年度 = +1 个自然年,不再有「年度天数」这个概念。
  payment_methods: { alipay: boolean; wechat: boolean }; // admin 配置里启用的支付渠道
  plans: PlanCard[];
}

export interface Order {
  id?: number;
  order_no: string;
  order_type: string; // subscription | recharge
  plan_code: string;
  plan_name?: string;
  billing_cycle?: string; // monthly | yearly | once(充值)—— 年度单显式彰显
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

// mirrors backend/internal/vip/billing_handler.go DayUsagePct / UsageCalendar
export interface DayUsage {
  date: string; // YYYY-MM-DD
  /** 相对参考线的百分比(0..999);0 = 当日无使用。限额档参考线 = 日均(周期上限÷天数),不限档 = 本月自身峰值。 */
  pct: number;
}
export interface UsageCalendar {
  days: DayUsage[];
  /** true = 不限档,pct 是「相对本月峰值」而非「相对日均参考」,tooltip 文案据此切换。 */
  unlimited: boolean;
}

/** 当月每日用量(绿格热力图,相对强度)。 */
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
export async function quoteSubscription(tier: 'pro' | 'max', cycle: BillingCycle): Promise<SubQuote> {
  return (await http.get<{ data: SubQuote }>('/user/billing/subscribe/quote', { params: { tier, cycle } })).data.data;
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

/** 使用 1 次重置次数立即重置本周期额度(0090:扣次数不扣经费)。 */
export function useResetQuota() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async () => (await http.post<{ data: ResetResult }>('/user/billing/reset')).data.data,
    onSuccess: invalidate,
  });
}

/**
 * 开/关「周期额度用完后自动用经费续」(0094 按量付费)。
 *
 * 🔴 默认关,只能由用户在设置页显式开 —— 历史上的 auto_reset(额度耗尽自动扣经费重置)
 * 正是因为不知情扣费被整个下线的,这里是同一类风险。
 */
export function useSetCreditAutopay() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (enabled: boolean) =>
      (await http.put<{ data: { enabled: boolean } }>('/user/billing/autopay', { enabled })).data.data,
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

/** 建订阅订单(plan = pro|max;cycle = monthly|yearly,缺省 monthly)。 */
export function useCreateSubscription() {
  return useMutation({
    mutationFn: async (vars: { plan: Tier; cycle?: BillingCycle }) =>
      (await http.post<{ data: Order }>('/user/billing/subscribe', { plan: vars.plan, cycle: vars.cycle ?? 'monthly' }))
        .data.data,
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
