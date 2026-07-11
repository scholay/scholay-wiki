// 会员资产 API —— 受保护。镜像后端 internal/vip billing overview。
import { request, qs } from '../request'

export interface TokenStatus {
  percent: number
  unlimited: boolean
}
export interface Balance {
  total: number
  temp: number
  perm: number
}
export interface BillingOverview {
  tier: 'free' | 'pro' | 'max'
  expires_at?: string | null
  token: TokenStatus
  credit: Balance
  reset_cost: number
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
export interface ResetResult {
  used: number
  ceiling: number
  balance: Balance
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
