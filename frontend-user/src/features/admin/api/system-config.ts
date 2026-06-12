import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';

/**
 * 字段对齐 backend/internal/common/model/*。
 * 之前 SystemConfig/EmailConfig/SMSConfig 的字段都是我猜的,几乎全错。
 */

/** 系统基础设置 —— 后端实际只有这几个字段(turnstile + 邮件验证开关) */
export interface SystemConfig {
  id: number;
  require_email_verification: boolean;
  enable_turnstile: boolean;
  turnstile_site_key: string;
  turnstile_secret_key: string;
  /** Google 分析 ID:GA4 衡量 ID(G-XXXX)或 GTM 容器 ID(GTM-XXXX);空=不接入。非机密。 */
  google_analytics_id: string;
  created_at: string;
  updated_at: string;
}

/** Email SMTP 配置 —— 字段名都是 smtp_ 前缀 */
export interface EmailConfig {
  id: number;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_password: string;
  from_email: string;
  from_name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** SMS 配置 —— 阿里云 SMS 风格字段 */
export interface SMSConfig {
  id: number;
  access_key_id: string;
  access_secret: string;
  sign_name: string;
  template_code: string;
  template_content: string;
  endpoint: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ---- email ----
// smtp_password 默认脱敏; reveal 时用 ?show_password=true 拉明文 (邮件端点参数名特殊)。
export function useEmailConfig({ showSensitive }: { showSensitive: boolean }) {
  return useQuery({
    queryKey: ['admin', 'config', 'email', { showSensitive }],
    queryFn: async () =>
      (
        await http.get<{ data: EmailConfig }>('/admin/email-config', {
          params: showSensitive ? { show_password: true } : undefined,
        })
      ).data.data,
  });
}
export function useUpdateEmailConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<EmailConfig>) => http.put('/admin/email-config', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'config', 'email'] }),
  });
}
export function useTestEmailConfig() {
  return useMutation({
    mutationFn: (to: string) => http.post('/admin/email-config/test', { to }),
  });
}

// ---- sms ----
// access_secret 默认脱敏; reveal 时用 ?show_secret=true 拉明文 (短信端点参数名特殊)。
export function useSMSConfig({ showSensitive }: { showSensitive: boolean }) {
  return useQuery({
    queryKey: ['admin', 'config', 'sms', { showSensitive }],
    queryFn: async () =>
      (
        await http.get<{ data: SMSConfig }>('/admin/sms-config', {
          params: showSensitive ? { show_secret: true } : undefined,
        })
      ).data.data,
  });
}
export function useUpdateSMSConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<SMSConfig>) => http.put('/admin/sms-config', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'config', 'sms'] }),
  });
}
export function useTestSMSConfig() {
  return useMutation({
    mutationFn: (phone: string) => http.post('/admin/sms-config/test', { phone }),
  });
}

// ---- system ----
// turnstile_secret_key 默认脱敏; reveal 时用 ?show_sensitive=true 拉明文。
export function useSystemConfig({ showSensitive }: { showSensitive: boolean }) {
  return useQuery({
    queryKey: ['admin', 'config', 'system', { showSensitive }],
    queryFn: async () =>
      (
        await http.get<{ data: SystemConfig }>('/admin/system-config', {
          params: showSensitive ? { show_sensitive: true } : undefined,
        })
      ).data.data,
  });
}
export function useUpdateSystemConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<SystemConfig>) => http.put('/admin/system-config', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'config', 'system'] }),
  });
}
