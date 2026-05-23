import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';

/**
 * 字段严格对齐 backend/internal/announcement/model.go:
 *   - severity 是 info / warning / critical(我之前命名 level 是错的)
 *   - is_active 是 int8(0/1),不是 boolean
 *   - dismissable 也是 int8
 *   - 还有 link_url / link_text / target_audience / priority / type 字段
 */
export type AnnouncementSeverity = 'info' | 'warning' | 'critical';
export type AnnouncementType = 'banner' | 'modal' | 'toast';
export type AnnouncementAudience = 'all' | 'logged_in' | 'guests' | 'admins';

export interface Announcement {
  id: number;
  type: AnnouncementType;
  title: string;
  content: string;
  link_url?: string;
  link_text?: string;
  severity: AnnouncementSeverity;
  target_audience: AnnouncementAudience;
  dismissable: number; // 0/1
  starts_at?: string | null;
  ends_at?: string | null;
  is_active: number; // 0/1
  priority: number;
  created_by?: number;
  created_at: string;
  updated_at: string;
}

/** 后端返回 `{ items }`,unwrap */
export function useAnnouncements() {
  return useQuery({
    queryKey: ['admin', 'announcements', 'list'],
    queryFn: async () => {
      const r = await http.get<{ data: { items: Announcement[] } }>('/admin/announcements');
      return r.data.data.items ?? [];
    },
  });
}

export function useCreateAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<Announcement, 'id' | 'created_at' | 'updated_at' | 'created_by'>) =>
      http.post('/admin/announcements', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'announcements'] }),
  });
}

export function useUpdateAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: number; data: Partial<Announcement> }) =>
      http.put(`/admin/announcements/${vars.id}`, vars.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'announcements'] }),
  });
}

export function useDeleteAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => http.delete(`/admin/announcements/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'announcements'] }),
  });
}
