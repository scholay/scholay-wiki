// 会员资产 API —— 受保护。镜像后端 internal/vip billing overview。
import { request, qs } from '../request'

export interface TokenStatus {
  percent: number
  unlimited: boolean
}
// 0090:经费只剩一种。0094:经费是**小数**(可直接消耗成额度)。
export interface Balance {
  total: number // 展示用小数经费(= perm_micro / 1e6)
  perm: number
  perm_micro: number // 真值,micro-credit = 经费 × 1e6
  points: number // 当前兑换率下折合的算力点(必须与余额同屏显示)
  credit_autopay: boolean // 额度用完是否自动用经费续(默认关)
}
export interface BillingOverview {
  tier: 'free' | 'pro' | 'max'
  /** 付费档在期时的计费周期(yearly=年费会员徽标);免费/过期时后端省略(0079)。 */
  cycle?: 'monthly' | 'yearly'
  expires_at?: string | null
  token: TokenStatus
  credit: Balance
  /** 可用重置次数。0090 起取代 reset_cost —— 重置扣的是次数不是经费。 */
  reset_passes: number
  reset_pass_next_expiry: string | null
}

// GET /user/billing/overview
export function getBillingOverview(): Promise<BillingOverview> {
  return request<BillingOverview>({ url: '/user/billing/overview', method: 'GET' })
}

// ── 兑换码 / 重置 / 明细 ─────────────────────────────────────────────────
export interface CodePreview {
  grant_kind: 'tier' | 'credit'
  grant_tier?: string
  grant_days?: number
  grant_credits?: number
  credit_kind?: 'temp' | 'perm'
  note?: string
  uses_left: number
}
export interface RedeemResult {
  kind: 'tier' | 'credit'
  tier?: string
  expires_at?: string
  credits?: number
}
// mirrors backend/internal/vip/quota.go ResetResult(经 StripAmounts 出口整形)
export interface ResetResult {
  used: number // 用户端恒 0(已抹除:用户只看百分比,不下发额度绝对值)
  ceiling: number // 用户端:-1 = 不限,否则 0(已抹除)
  balance: Balance // 经费余额是真值 —— 经费对用户可见
}
export interface CreditTxn {
  id: number
  type: string
  amount: number
  note: string
  created_at: string
}
export interface Order {
  order_no: string
  order_type: string
  plan_name?: string
  amount: number
  final_amount: number
  status: string
  created_at?: string
}

// POST /user/redeem-code/preview
export function previewRedeemCode(code: string): Promise<CodePreview> {
  return request<CodePreview>({ url: '/user/redeem-code/preview', method: 'POST', data: { code } })
}
// POST /user/redeem-code
export function redeemCode(code: string): Promise<RedeemResult> {
  return request<RedeemResult>({ url: '/user/redeem-code', method: 'POST', data: { code } })
}
// POST /user/billing/reset
export function resetQuota(): Promise<ResetResult> {
  return request<ResetResult>({ url: '/user/billing/reset', method: 'POST', data: {} })
}
// GET /user/billing/transactions
export async function listTransactions(page = 1, pageSize = 30): Promise<CreditTxn[]> {
  const r = await request<{ items: CreditTxn[]; total: number }>({
    url: '/user/billing/transactions' + qs({ page, page_size: pageSize }),
    method: 'GET',
  })
  return r.items || []
}
// GET /user/billing/orders
export async function listOrders(): Promise<Order[]> {
  const r = await request<{ items: Order[] }>({ url: '/user/billing/orders', method: 'GET' })
  return r.items || []
}
