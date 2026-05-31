import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';

/**
 * 字段对齐 backend/internal/feedback/model.go Feedback struct。
 * 不要再用 `user_email`/`reply`/`assignee_email` —— 这些是我之前猜的名字,后端不存在。
 */
/** 后端枚举值见 feedback/model.go —— 是 `processed` 不是 `processing` */
export type FeedbackStatus = 'pending' | 'processed' | 'replied' | 'closed';

export interface Feedback {
  id: number;
  email: string;
  content: string;
  attachments?: string;
  userId: number | null;
  username: string;
  ip: string;
  ipLocation: string;
  status: FeedbackStatus;
  category: string;
  replyContent: string;
  repliedAt?: string;
  repliedBy: string;
  assignedTo: number | null;
  assigneeName: string;
  internalNotes: string;
  firstResponseAt?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 字段名严格对齐 backend FeedbackListRequest 的 `form:` tag —— camelCase。
 * 不要写成 snake_case,gin ShouldBindQuery 不会绑定就触发 min=1 校验失败 → 400。
 */
export interface FeedbackListParams {
  page?: number;
  pageSize?: number;
  status?: FeedbackStatus;
  category?: string;
  keyword?: string;
  email?: string;
  startDate?: string;
  endDate?: string;
  assignedTo?: number;
  unassigned?: boolean;
}

export interface FeedbackListResponse {
  total: number;
  list: Feedback[];
  page: number;
  pageSize: number;
}

export function useFeedbackList(params: FeedbackListParams) {
  return useQuery({
    queryKey: ['admin', 'feedback', 'list', params],
    queryFn: async () => {
      const r = await http.get<{ data: FeedbackListResponse }>('/admin/feedbacks', { params });
      return r.data.data;
    },
  });
}

export function useFeedbackStats() {
  return useQuery({
    queryKey: ['admin', 'feedback', 'stats'],
    queryFn: async () => {
      const r = await http.get<{ data: Record<string, number> }>('/admin/feedbacks/stats');
      return r.data.data;
    },
  });
}

/** 反馈附件 — 后端 `feedback.Attachment` (走 MinIO, url 是 /public/feedback/attachment/<id>) */
export interface FeedbackAttachment {
  name: string;
  url: string;
  size: number;
  type: 'image' | 'file';
}

/** 反馈详情 (含附件) — backend GET /admin/feedbacks/:id */
export interface FeedbackDetailResponse {
  feedback: Feedback;
  attachments: FeedbackAttachment[];
}

export function useFeedbackDetail(id: number | null) {
  return useQuery({
    queryKey: ['admin', 'feedback', 'detail', id],
    enabled: !!id,
    queryFn: async () => {
      const r = await http.get<{ data: FeedbackDetailResponse }>(`/admin/feedbacks/${id}`);
      return r.data.data;
    },
  });
}

export function useDeleteFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => http.delete(`/admin/feedbacks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'feedback'] }),
  });
}

export function useReplyFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: number; replyContent: string }) =>
      // 后端 ReplyFeedbackRequest 字段是 `replyContent`(camelCase),早期前端写 snake_case 一直 400
      http.post(`/admin/feedbacks/${vars.id}/reply`, { replyContent: vars.replyContent }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'feedback'] }),
  });
}

export function useUpdateFeedbackStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: number; status: FeedbackStatus }) =>
      http.put(`/admin/feedbacks/${vars.id}/status`, { status: vars.status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'feedback'] }),
  });
}
