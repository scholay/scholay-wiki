import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';

/**
 * 字段对齐 backend/internal/message/model.go(Message)。
 * 消息模板模块已整体下线 (2026-05-28), 不再有 MessageTemplate 类型与对应 hooks。
 */

export type MessageStatus = 'draft' | 'sent' | 'sending' | 'failed';
export type MessageSendType = 'all' | 'plans' | 'users';
export type MessageCategory = 'system' | 'notification' | 'announcement' | 'marketing';

export interface AdminMessage {
  id: number;
  title: string;
  content: string;
  category: MessageCategory;
  send_type: MessageSendType;
  target_plans?: string;   // JSON 数组字符串
  target_user_ids?: string; // JSON 数组字符串
  link_url?: string;
  link_text?: string;
  sender_id?: number;
  sender_name?: string;
  send_at?: string;
  expire_at?: string;
  status: MessageStatus;
  recipient_count: number;
  read_count: number;
  created_at: string;
  updated_at: string;
}

// ---- messages ----
/** page / page_size 都是 `binding:"min=1"`,必须显式传(不传 → 0 → 400) */
export function useMessages(params?: { page?: number; page_size?: number; status?: MessageStatus }) {
  const merged = { page: 1, page_size: 20, ...params };
  return useQuery({
    queryKey: ['admin', 'messages', 'list', merged],
    queryFn: async () =>
      (await http.get<{ data: { total: number; list: AdminMessage[] } }>('/admin/messages', { params: merged })).data.data,
  });
}

export function useCreateMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<AdminMessage, 'id' | 'created_at' | 'updated_at' | 'send_at' | 'sender_id' | 'sender_name' | 'recipient_count' | 'read_count'>) =>
      http.post('/admin/messages', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'messages'] }),
  });
}

export function useSendMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => http.post(`/admin/messages/${id}/send`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'messages'] }),
  });
}

