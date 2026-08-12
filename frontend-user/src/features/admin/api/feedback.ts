import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';

/**
 * 字段对齐 backend/internal/feedback/model.go Feedback struct。
 * 不要再用 `user_email`/`reply`/`assignee_email` —— 这些是我之前猜的名字,后端不存在。
 *
 * ⚠️ **没有指派接口**。model.go 里有 `AssignFeedbackRequest`,但 routes_admin.go 只注册了
 * list / stats / detail / status / reply / delete 六条,指派那条从未挂上路由。
 * 因此 `assignedTo` / `assigneeName` 恒为空 —— 页面上不要出现「负责人」这类暗示可分配的措辞。
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
    // params(含 page)在 key 里,翻页保留上一页数据,避免表格塌空闪白。
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const r = await http.get<{ data: FeedbackListResponse }>('/admin/feedbacks', { params });
      return r.data.data;
    },
  });
}

/**
 * mirrors backend/internal/feedback/model.go FeedbackStats。
 * 之前是 `Record<string, number>` —— 能编译,但调用方拿不到任何字段提示,
 * 于是这个 hook 从写下起就没人调用过(「待处理积压量」是工单页最核心的运维指标)。
 */
export interface FeedbackStats {
  total: number;
  pending: number;
  processed: number;
  replied: number;
  closed: number;
  /** 未指派数 —— ⚠️ 后端**没有**指派接口(routes_admin.go 只挂了 list/stats/detail/status/reply/delete),
   *  这个数会恒等于 total,不要拿它做运营判断 */
  unassigned: number;
  /** SLA:平均首次响应时长(分钟),仅统计已响应的 */
  avgFirstResponseMinutes: number;
  /** SLA:当前未响应的最久反馈年龄(分钟) */
  oldestPendingMinutes: number;
}

export function useFeedbackStats() {
  return useQuery({
    queryKey: ['admin', 'feedback', 'stats'],
    queryFn: async () => {
      const r = await http.get<{ data: FeedbackStats }>('/admin/feedbacks/stats');
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
