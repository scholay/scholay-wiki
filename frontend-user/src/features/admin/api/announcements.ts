import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';

/**
 * mirrors backend/internal/announcement/model.go(Announcement 表)
 *      + backend/internal/announcement/handler.go(CreateRequest 的 binding tag)
 *
 * 🔴 枚举值以 **handler.go 的 `binding:"oneof=..."`** 为准,不是以「界面上想显示什么」为准:
 *   - type            = banner / popup / maintenance_note
 *   - severity        = info / warning / danger / success
 *   - target_audience = all / logged_in / paid
 *
 * 这三行此前分别写成 `banner|modal|toast`、`info|warning|critical`、
 * `all|logged_in|guests|admins` —— 除各自的第一个值外全都不在后端白名单里,
 * 选中即 400「参数错误」。也就是说除「横幅 + 提示 + 全部」这一种组合外,
 * 公告的新建/编辑**一次都没成功过**。
 *
 * 另:starts_at / ends_at 后端是 `*time.Time`,JSON 侧只吃 RFC3339。
 * `<input type="date">` 的 `2026-08-03` 与 `datetime-local` 的 `2026-08-03T14:00`
 * 都会让 BindJSON 直接失败 → 提交必须过一次 toRFC3339()。
 *
 * - is_active / dismissable 是 int8(0/1),不是 boolean
 */
export type AnnouncementSeverity = 'info' | 'warning' | 'danger' | 'success';
export type AnnouncementType = 'banner' | 'popup' | 'maintenance_note';
export type AnnouncementAudience = 'all' | 'logged_in' | 'paid';

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

/** 新建 / 更新公告的请求体(后端 CreateRequest 同时服务 POST 与 PUT) */
export type AnnouncementInput = Omit<
  Announcement,
  'id' | 'created_at' | 'updated_at' | 'created_by'
>;

/**
 * `<input type="datetime-local">` → RFC3339。
 *
 * datetime-local 给的是 `2026-08-03T14:00`(无秒、无时区),Go 的 `*time.Time`
 * 只认 RFC3339 —— 原样发过去 BindJSON 会 400,且错误落在 utils.BindJSON 的
 * 通用「参数错误」里,界面上看不出是时间格式的锅。
 * 空串 → undefined(整个字段省略,后端按 nil 处理 = 不限制)。
 */
export function toRFC3339(local?: string | null): string | undefined {
  if (!local) return undefined;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** RFC3339 → `<input type="datetime-local">` 的 value(本地时区,精确到分) */
export function toDatetimeLocal(iso?: string | null): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return undefined;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
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
    mutationFn: (data: AnnouncementInput) => http.post('/admin/announcements', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'announcements'] }),
  });
}

export function useUpdateAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    // 后端 Update 用的是同一个 CreateRequest 且 `Updates(map)` 是整行覆盖 ——
    // 必须把所有字段都带上,漏一个就被写成零值。
    mutationFn: (vars: { id: number; data: AnnouncementInput }) =>
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
