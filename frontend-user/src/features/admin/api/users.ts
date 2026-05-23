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
  sort_by?: 'last_login_at' | 'created_at';
  sort_order?: 'asc' | 'desc';
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
