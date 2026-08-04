// 客服与联系中心(后台)—— 字段对齐 backend/internal/supportcenter。
// 配置:联系方式展示(邮箱/二维码)+ IMAP 收件 + 飞书通知;收件箱:列表/详情/回信;写信。
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';

export interface SupportCenterConfig {
  id: number;
  support_email: string;
  business_email: string;
  contact_note: string;
  wecom_qr: string;
  feishu_qr: string;
  imap_enabled: boolean;
  imap_host: string;
  imap_port: number;
  imap_username: string;
  imap_password: string;
  imap_tls: boolean;
  imap_poll_minutes: number;
  smtp_host: string;
  smtp_port: number;
  smtp_username: string;
  smtp_password: string;
  smtp_from_name: string;
  feishu_webhook_url: string;
  feishu_secret: string;
  feishu_notify_feedback: boolean;
  feishu_notify_email: boolean;
  feishu_notify_payment: boolean;
}

const CONFIG_KEY = ['admin', 'support-center', 'config'];

export function useSupportCenterConfig(showSensitive = false) {
  return useQuery({
    queryKey: [...CONFIG_KEY, showSensitive],
    queryFn: async () =>
      (
        await http.get<{ data: SupportCenterConfig }>('/admin/support-center/config', {
          params: showSensitive ? { show_sensitive: 'true' } : undefined,
        })
      ).data.data,
    // 🔴 showSensitive 进了 queryKey —— 点一下密码框的「眼睛」就是换 key 重新取。
    // 不保留上一份数据的话,那一瞬间 isLoading 会变 true,页面上的 ConfigPageGuard
    // 会把整个表单卸载成 LoadingState,运维填了半页的 IMAP/SMTP 参数随组件一起消失。
    // 保留旧数据 → isLoading 恒 false,只有 isFetching 闪一下,表单不动。
    placeholderData: keepPreviousData,
  });
}

export function useUpdateSupportCenterConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (cfg: Partial<SupportCenterConfig>) =>
      (await http.put('/admin/support-center/config', cfg)).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'support-center'] });
      void qc.invalidateQueries({ queryKey: ['help', 'support-contact'] });
    },
  });
}

export function useTestFeishu() {
  return useMutation({
    mutationFn: async () => (await http.post('/admin/support-center/feishu/test')).data,
  });
}

export function useTestSMTP() {
  return useMutation({
    mutationFn: async () => (await http.post('/admin/support-center/smtp/test')).data,
  });
}

/** 测试连接 —— 返回该邮箱当前的信件总数(backend: supportcenter/handler.go TestIMAP)。 */
export function useTestIMAP() {
  return useMutation({
    mutationFn: async () =>
      (await http.post<{ data: { mailbox_messages: number } }>('/admin/support-center/imap/test')).data
        .data,
  });
}

/** 手动拉取一轮 —— 返回本轮**新增**邮件数(backend: supportcenter/handler.go PollNow)。 */
export function usePollIMAPNow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      (await http.post<{ data: { new_mails: number } }>('/admin/support-center/imap/poll')).data.data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'support-center', 'inbox'] }),
  });
}

// ─── 收件箱 ─────────────────────────────────────────────────────────────────

export type MailStatus = 'unread' | 'read' | 'replied';

export interface InboxMail {
  id: number;
  account: string;
  from_name: string;
  from_addr: string;
  to_addr: string;
  subject: string;
  sent_at: string | null;
  snippet: string;
  text_body: string;
  html_body: string;
  status: MailStatus;
  replied_at: string | null;
  created_at: string;
}

export function useInboxList(params: { status?: string; keyword?: string; page?: number; page_size?: number }) {
  return useQuery({
    queryKey: ['admin', 'support-center', 'inbox', params],
    queryFn: async () => {
      const r = await http.get<{ data: { items: InboxMail[]; total: number; unread: number } }>(
        '/admin/support-center/inbox',
        { params },
      );
      return r.data.data;
    },
    // 典型盯屏页(用户在电话/群里说「我邮件发了」,运维等它进来)。后端 IMAP 轮询是另一件事:
    // 它只负责把新邮件写进库,页面不自己重取就永远不出现。全局 refetchOnWindowFocus 是关的。
    refetchInterval: 60_000,
  });
}

export function useInboxMail(id: number | null) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ['admin', 'support-center', 'inbox', 'detail', id],
    enabled: !!id,
    queryFn: async () => {
      const r = await http.get<{ data: InboxMail }>(`/admin/support-center/inbox/${id}`);
      // 详情打开后端已把 unread → read,列表角标同步刷新。
      // 🔴 predicate 必须把 detail 自己排除掉:detail 的 key 也以 [...,'inbox'] 打头,
      // 连自己一起失效 = 在 queryFn 里让自己重取。react-query 对「已有 data 且正在 fetch」
      // 的查询走 cancelRefetch 分支(取消当前这次、立刻重发),于是 queryFn → invalidate →
      // 重发 → queryFn … 变成一个打后端的死循环(首次打开因 data===undefined 走去重分支
      // 不会触发,所以只在 30s staleTime 过后**再次**打开同一封信时才炸,极难现场复现)。
      void qc.invalidateQueries({
        queryKey: ['admin', 'support-center', 'inbox'],
        exact: false,
        predicate: (query) => query.queryKey[3] !== 'detail',
      });
      return r.data.data;
    },
  });
}

export function useReplyInbox() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { id: number; subject?: string; body: string }) =>
      (await http.post(`/admin/support-center/inbox/${p.id}/reply`, { subject: p.subject, body: p.body })).data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'support-center', 'inbox'] }),
  });
}

export function useComposeMail() {
  return useMutation({
    mutationFn: async (p: { to: string; subject: string; body: string }) =>
      (await http.post('/admin/support-center/compose', p)).data,
  });
}
