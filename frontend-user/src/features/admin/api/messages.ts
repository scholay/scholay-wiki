import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';

/**
 * mirrors backend/internal/message/{model.go,service.go,handler.go}
 * (admin 侧只有三条路由:GET/POST /admin/messages、POST /admin/messages/:id/send)
 *
 * 🔴 **枚举值以后端 `binding:"oneof=..."` 为准。** 这三行此前分别写成
 *   status = draft|sent|sending|failed / send_type = all|plans|users
 *   / category = system|notification|announcement|marketing
 * —— `sending`/`failed` 后端根本不存在(SendMessage 是同步的 draft → sent),
 * `plans`/`users` 与 `notification|announcement|marketing` 都过不了 gin 的 oneof 校验。
 * 也就是说除「全体用户 + 系统」外,新建消息**必然 400**。
 *
 * 🔴 **列表返回的是 MessageResponse,不是 Message 表行**:
 *   - `target_plans` 已被后端 json.Unmarshal 成**数组**(不是 JSON 字符串)
 *   - `target_user_ids` **不下发**(service.messageToResponse 没有映射这个字段)
 *     → batch/single 的具体收件人在列表页拿不到,只能显示类型 + recipient_count
 *   - 多一个后端算好的 `read_rate`(百分数 0-100),没有 updated_at / sender_id
 */

export type MessageStatus = 'draft' | 'sent' | 'cancelled';
export type MessageSendType = 'all' | 'batch' | 'single' | 'by_plan';
export type MessageCategory = 'system' | 'promotion' | 'transaction';

export interface AdminMessage {
  id: number;
  title: string;
  content: string;
  category: MessageCategory;
  send_type: MessageSendType;
  /** by_plan 时的目标会员等级;后端已解析成数组 */
  target_plans?: string[];
  link_url?: string;
  link_text?: string;
  sender_name?: string;
  send_at?: string | null;
  expire_at?: string | null;
  status: MessageStatus;
  recipient_count: number;
  read_count: number;
  /** 后端算好的已读率,单位是**百分数**(0-100),不是比例 */
  read_rate: number;
  created_at: string;
}

/** mirrors CreateMessageRequest —— 注意 target_* 是真数组,不是 JSON 字符串 */
export interface CreateMessageInput {
  title: string;
  content: string;
  category?: MessageCategory;
  send_type: MessageSendType;
  /** by_plan 必填(空则后端返回「按会员等级发送时需要指定目标等级」) */
  target_plans?: string[];
  /** batch / single 必填,后端会先 CheckUsersExist 过滤不存在的 ID */
  target_user_ids?: number[];
  /** ⚠️ 后端 binding 是 `omitempty,url` —— 必须是带 scheme 的完整 URL,相对路径会 400 */
  link_url?: string;
  link_text?: string;
  /** RFC3339;datetime-local 的值必须先过 toRFC3339() */
  expire_at?: string;
  /** true = 建完立刻发出去(不可撤回)。后台默认存草稿,由列表页的「发送」二次确认后触发 */
  send_now?: boolean;
}

/**
 * `<input type="datetime-local">` → RFC3339。
 * datetime-local 给的是 `2026-08-03T14:00`(无秒、无时区),Go 的 `*time.Time`
 * 只认 RFC3339,原样发过去 BindJSON 直接 400。空串 → undefined(字段整个省略)。
 */
export function toRFC3339(local?: string | null): string | undefined {
  if (!local) return undefined;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** "1, 2,3" → [1,2,3](丢弃非数字项;空 → undefined) */
export function parseIdList(raw: string): number[] | undefined {
  const ids = raw
    .split(/[,，\s]+/)
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
  return ids.length > 0 ? ids : undefined;
}

/** "pro, max" → ['pro','max'](空 → undefined) */
export function parseCodeList(raw: string): string[] | undefined {
  const codes = raw
    .split(/[,，\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return codes.length > 0 ? codes : undefined;
}

// ---- messages ----
/** page / page_size 都是 `binding:"min=1"`,必须显式传(不传 → 0 → 400) */
export function useMessages(params?: {
  page?: number;
  page_size?: number;
  status?: MessageStatus;
  category?: MessageCategory;
  keyword?: string;
}) {
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
    mutationFn: (data: CreateMessageInput) => http.post('/admin/messages', data),
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
