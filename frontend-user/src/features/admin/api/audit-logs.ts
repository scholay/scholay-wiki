import { useQuery } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';

/** 字段对齐 backend/internal/admin/audit.go AuditLog */
export interface AuditLog {
  id: number;
  admin_user_id: number;
  admin_username: string;
  admin_role: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  details?: string;
  ip?: string;
  user_agent?: string;
  created_at: string;
}

export interface AuditLogParams {
  page?: number;
  page_size?: number;
  admin_user_id?: number;
  action?: string;
  resource_type?: string;
  start_date?: string;
  end_date?: string;
}

/** 后端实际返回 `{items, total, page, page_size}` —— 这里 unwrap 重命名为 list 给页面用 */
export interface AuditLogResponse {
  total: number;
  list: AuditLog[];
}

export function useAuditLogs(params: AuditLogParams) {
  return useQuery({
    queryKey: ['admin', 'audit-logs', 'list', params],
    queryFn: async () => {
      const r = await http.get<{ data: { items: AuditLog[]; total: number } }>(
        '/admin/audit-logs',
        { params }
      );
      return { list: r.data.data.items ?? [], total: r.data.data.total ?? 0 };
    },
  });
}
