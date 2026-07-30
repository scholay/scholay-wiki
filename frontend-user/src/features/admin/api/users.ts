import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';

/** 字段对齐 backend/internal/user/model.go User struct(指针字段 JSON 为 null/string) */
export interface AdminUser {
  id: number;
  email: string | null;
  username: string | null;
  phone: string | null;
  avatar_url: string | null;
  bio: string | null;
  role: 'user' | 'operations' | 'admin' | 'super_admin';
  status: number; // 1 active / 0 inactive / 2 frozen
  frozen_at?: string | null;
  frozen_reason?: string;
  admin_notes?: string;
  email_verified: boolean;
  phone_verified: boolean;
  last_login_at?: string | null;
  last_login_ip?: string | null;
  /** 最后活跃(真实使用)时间:每次鉴权请求节流更新,反映最后实际使用而非仅登录动作。 */
  last_active_at?: string | null;
  /** 会员(VIP):vip_tier 为 'pro'/'max' 且 vip_expires_at>now 才算生效;否则当 free。
   *  **必须含 'max'** —— 漏了它,列表把 max 用户当 free 显示(与详情页 /vip 不一致)。 */
  vip_tier?: 'free' | 'pro' | 'max' | null;
  vip_expires_at?: string | null;
  /** 注册来源:'wechat'=网页扫码 / 'wechat_miniprogram'=小程序 / ''=其它渠道按 provider 推断。 */
  register_source?: string;
  created_at: string;
  updated_at: string;
}

export interface UserListParams {
  page?: number;
  page_size?: number;
  /** 搜索关键词(后端 query param 名是 `q`,这里前端别名一下) */
  q?: string;
  role?: string;
  status?: number;
  tier?: string; // ''|'free'|'pro'|'max'
  email_verified?: '0' | '1';
  created_from?: string; // YYYY-MM-DD
  created_to?: string;
  sort_by?: 'last_active_at' | 'last_login_at' | 'created_at' | 'vip_expires_at';
  sort_order?: 'asc' | 'desc';
}

export interface UserAuthProviderView {
  provider: string;
  created_at: string;
}

/** /admin/users/:id/detail —— 身份 + 登录方式(供「用户单元」展开)。 */
export interface UserLoginMethods {
  id: number;
  username: string;
  email: string;
  email_verified: boolean;
  phone: string;
  phone_verified: boolean;
  auth_providers: UserAuthProviderView[];
  /** 注册来源(迁移 0060):'wechat'=网页扫码 / 'wechat_miniprogram'=小程序 / ''=按 provider 推断。
   *  微信小程序与网页扫码都记 provider='wechat'(unionid 同号),靠本字段区分渠道。 */
  register_source?: string;
}

// 对齐 backend vip.TokenStatus(quota.go)——7 天锚定窗口口径:used/percent 是窗口内(重置/升级换锚后归零),
// consumed_today 是当日真实消耗(换锚不清零),window_* 是当前窗口起止(null=未开窗=满额·用后计时)。
//
// 🔴 **used / ceiling / consumed_today 的单位是微元真实成本,不是 token**(接口名是 P3 遗留)。
// 渲染前必须 ÷1000 得到算力点(1 点 = ¥0.001),与「算力用量」看板同单位;
// 直接渲染 = 1000 倍误差且不会报错。现有正确用法见 UserDetailDrawer.tsx 的 TokenQuotaBar。
export interface UserTokenStatus {
  used: number;
  ceiling: number; // -1 = 不限
  percent: number;
  unlimited: boolean;
  consumed_today: number;
  window_days: number;
  window_started_at: string | null;
  window_reset_at: string | null;
}
// 0090:经费不再分临时/永久。0094:经费是**小数**(perm/total 由后端 micro÷1e6 得出),
// 精确运算一律用 perm_micro;points 是当前兑换率下折合的算力点。
export interface UserCreditBalance {
  perm: number;
  total: number;
  perm_micro: number;
  points: number;
  credit_autopay: boolean;
}
// 对齐 backend vip.Overview(统一 token 额度 + 经费钱包),已不再按功能计次。
export interface UserVipStatus {
  tier: 'free' | 'pro' | 'max';
  /** 付费档在期时的计费周期(yearly=年费会员);免费/过期时后端省略(0079)。 */
  cycle?: 'monthly' | 'yearly';
  expires_at: string | null;
  token: UserTokenStatus;
  credit: UserCreditBalance;
  auto_reset: boolean;
  reset_passes: number; // 0090:可用重置次数(取代 reset_cost —— 重置改扣次数)
  reset_pass_next_expiry: string | null;
}

/** 后端字段:users / total / page / page_size(handler_admin.go GetUserList) */
export interface UserListResponse {
  total: number;
  users: AdminUser[];
  page: number;
  page_size: number;
}

export function useUserList(params: UserListParams) {
  return useQuery({
    queryKey: ['admin', 'users', 'list', params],
    queryFn: async () => {
      const r = await http.get<{ data: UserListResponse }>('/admin/users', { params });
      return r.data.data;
    },
  });
}

export function useUserStats() {
  return useQuery({
    queryKey: ['admin', 'users', 'stats'],
    queryFn: async () => {
      const r = await http.get<{ data: Record<string, number> }>('/admin/users/stats');
      return r.data.data;
    },
  });
}

export function useFreezeUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => http.put(`/admin/users/${id}/freeze`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

export function useUnfreezeUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => http.put(`/admin/users/${id}/unfreeze`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => http.delete(`/admin/users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

export function useBatchDeleteUsers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: number[]) => http.post('/admin/users/batch-delete', { ids }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

export function useUpdateUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: number; role: AdminUser['role'] }) =>
      http.put(`/admin/users/${vars.id}/role`, { role: vars.role }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

// ─── 用户详情抽屉 ───────────────────────────────────────────────────────────

/** 登录方式(账号/第三方绑定)。enabled 控制抽屉打开时才拉。 */
export function useUserDetail(id?: number) {
  return useQuery({
    queryKey: ['admin', 'users', 'detail', id],
    enabled: !!id,
    queryFn: async () =>
      (await http.get<{ data: UserLoginMethods }>(`/admin/users/${id}/detail`)).data.data,
    staleTime: 60_000,
  });
}

/** 该用户会员状态 + 本周期(7 天)统一 token 额度(含窗口起止 / 当日消耗)。 */
export function useUserVipStatus(id?: number) {
  return useQuery({
    queryKey: ['admin', 'users', 'vip', id],
    enabled: !!id,
    queryFn: async () => (await http.get<{ data: UserVipStatus }>(`/admin/users/${id}/vip`)).data.data,
  });
}

/** 管理员直接授予/续期会员。cycle 可选(monthly|yearly):设置年费/月度标识;省略 = 不改动现值。 */
export function useGrantVip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: number; tier: string; days: number; cycle?: 'monthly' | 'yearly' }) =>
      http.post(`/admin/users/${vars.id}/vip`, {
        tier: vars.tier,
        days: vars.days,
        ...(vars.cycle ? { cycle: vars.cycle } : {}),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

/** 管理员取消会员(回 free)。 */
export function useRevokeVip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => http.delete(`/admin/users/${id}/vip`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

/** 管理员给某用户加/扣科研经费。amount>0 发放、<0 扣减;kind=perm 永久 / temp 临时(temp 发放需 days)。
 *  对齐后端 POST /admin/users/:id/wallet/adjust(AdminAdjustWallet)。 */
export function useAdjustWallet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: number; amount: number; kind: 'perm' | 'temp'; days?: number; note?: string }) =>
      http.post(`/admin/users/${vars.id}/wallet/adjust`, {
        amount: vars.amount,
        kind: vars.kind,
        days: vars.days ?? 0,
        note: vars.note ?? '',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

// 发放重置次数(补偿/运营)。days 缺省后端按 365 天有效期。
export function useGrantResetPasses() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: number; count: number; days?: number; note?: string }) =>
      http.post(`/admin/users/${vars.id}/reset-passes`, {
        count: vars.count,
        days: vars.days ?? 0,
        note: vars.note ?? '',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

// ─── 用户财务下钻(订单 / 交易流水 / 兑换记录;与用户设置页对齐)──────────────────────
// 全部懒加载(抽屉打开才取),信封 {data:{items,total}},queryKey 三段式 ['admin','user',id,resource]。

export interface Paged<T> {
  items: T[];
  total: number;
}

/** 对齐 backend vip.Order(orders 表)。admin 视图含全状态(pending/paid/expired/refunded…)。 */
export interface AdminOrder {
  id: number;
  order_no: string;
  order_type: string; // recharge | subscription
  plan_code: string;
  plan_name: string;
  billing_cycle: string;
  amount: number;
  final_amount: number;
  status: string; // pending | paid | expired | refunded …
  payment_method: string;
  payment_time: string | null;
  credits_granted: number;
  transaction_no: string;
  created_at: string;
}

/** 对齐 backend vip.CreditTransaction(credit_transactions 表)。ref_type=code 的 ref_id 后端已打码。 */
export interface AdminCreditTransaction {
  id: number;
  type: string; // recharge | grant_subscription | gift | reset_consume | expire | refund | admin_adjust | payg_daily …
  amount: number; // 正=入账 负=消耗;0098 起可带小数(payg 日聚合行,DECIMAL(18,6))
  temp_after: number;
  perm_after: number;
  ref_type: string;
  ref_id: string;
  note: string;
  day_bucket?: string | null; // 仅 type=payg_daily 有值(日聚合桶,0098)
  created_at: string;
}

/** 对齐 backend vip.UserRedemptionView(兑换流水 join 码定义)。code 后端已打码。 */
export interface AdminRedemption {
  redeemed_at: string;
  code: string;
  grant_kind: string; // tier | credit
  grant_tier: string;
  grant_days: number;
  grant_credits: number;
  credit_kind: string; // temp | perm
  note: string;
}

export function useAdminUserOrders(
  id: number | undefined,
  params: { type?: string; status?: string; page?: number; page_size?: number },
  enabled = true,
) {
  return useQuery({
    queryKey: ['admin', 'user', id, 'orders', params],
    enabled: !!id && enabled,
    queryFn: async () =>
      (await http.get<{ data: Paged<AdminOrder> }>(`/admin/users/${id}/orders`, { params })).data.data,
    staleTime: 60_000,
  });
}

export function useAdminUserTransactions(
  id: number | undefined,
  params: { type?: string; page?: number; page_size?: number },
  enabled = true,
) {
  return useQuery({
    queryKey: ['admin', 'user', id, 'transactions', params],
    enabled: !!id && enabled,
    queryFn: async () =>
      (await http.get<{ data: Paged<AdminCreditTransaction> }>(`/admin/users/${id}/transactions`, { params })).data.data,
    staleTime: 60_000,
  });
}

export function useAdminUserRedemptions(
  id: number | undefined,
  params: { page?: number; page_size?: number },
  enabled = true,
) {
  return useQuery({
    queryKey: ['admin', 'user', id, 'redemptions', params],
    enabled: !!id && enabled,
    queryFn: async () =>
      (await http.get<{ data: Paged<AdminRedemption> }>(`/admin/users/${id}/redemptions`, { params })).data.data,
    staleTime: 60_000,
  });
}
