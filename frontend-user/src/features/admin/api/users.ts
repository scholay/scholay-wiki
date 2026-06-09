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
  role: 'user' | 'admin' | 'super_admin';
  status: number; // 1 active / 0 inactive / 2 frozen
  frozen_at?: string | null;
  frozen_reason?: string;
  admin_notes?: string;
  email_verified: boolean;
  phone_verified: boolean;
  last_login_at?: string | null;
  last_login_ip?: string | null;
  /** 会员(VIP):vip_tier='pro' 且 vip_expires_at>now 才算生效 pro;否则当 free。 */
  vip_tier?: 'free' | 'pro' | null;
  vip_expires_at?: string | null;
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
  tier?: string; // ''|'free'|'pro'
  email_verified?: '0' | '1';
  created_from?: string; // YYYY-MM-DD
  created_to?: string;
  sort_by?: 'last_login_at' | 'created_at' | 'vip_expires_at';
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
}

export interface UserTokenStatus {
  used: number;
  ceiling: number; // -1 = 不限
  percent: number;
  unlimited: boolean;
}
export interface UserCreditBalance {
  temp: number;
  perm: number;
  total: number;
}
// 对齐 backend vip.Overview(统一 token 额度 + 经费钱包),已不再按功能计次。
export interface UserVipStatus {
  tier: 'free' | 'pro' | 'max';
  expires_at: string | null;
  token: UserTokenStatus;
  credit: UserCreditBalance;
  auto_reset: boolean;
  reset_cost: number;
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

/** 该用户会员状态 + 今日各功能额度。 */
export function useUserVipStatus(id?: number) {
  return useQuery({
    queryKey: ['admin', 'users', 'vip', id],
    enabled: !!id,
    queryFn: async () => (await http.get<{ data: UserVipStatus }>(`/admin/users/${id}/vip`)).data.data,
  });
}

/** 管理员直接授予/续期会员。 */
export function useGrantVip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: number; tier: string; days: number }) =>
      http.post(`/admin/users/${vars.id}/vip`, { tier: vars.tier, days: vars.days }),
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
