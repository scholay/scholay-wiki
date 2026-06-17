// 客服与联系中心(后台)—— 字段对齐 backend/internal/supportcenter。
// 配置:联系方式展示(邮箱/二维码)+ IMAP 收件 + 飞书通知;收件箱:列表/详情/回信;写信。
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

export function useTestIMAP() {
  return useMutation({
    mutationFn: async () =>
      (await http.post<{ data: { mailbox_messages: number } }>('/admin/support-center/imap/test')).data,
  });
}

export function usePollIMAPNow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      (await http.post<{ data: { new_mails: number } }>('/admin/support-center/imap/poll')).data,
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
  });
}

export function useInboxMail(id: number | null) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ['admin', 'support-center', 'inbox', 'detail', id],
    enabled: !!id,
    queryFn: async () => {
      const r = await http.get<{ data: InboxMail }>(`/admin/support-center/inbox/${id}`);
      // 详情打开后端已把 unread → read,列表角标同步刷新
      void qc.invalidateQueries({ queryKey: ['admin', 'support-center', 'inbox'], exact: false });
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
