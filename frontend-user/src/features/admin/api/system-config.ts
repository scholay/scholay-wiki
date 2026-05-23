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
export function useEmailConfig() {
  return useQuery({
    queryKey: ['admin', 'config', 'email'],
    queryFn: async () => (await http.get<{ data: EmailConfig }>('/admin/email-config')).data.data,
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
export function useSMSConfig() {
  return useQuery({
    queryKey: ['admin', 'config', 'sms'],
    queryFn: async () => (await http.get<{ data: SMSConfig }>('/admin/sms-config')).data.data,
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
export function useSystemConfig() {
  return useQuery({
    queryKey: ['admin', 'config', 'system'],
    queryFn: async () => (await http.get<{ data: SystemConfig }>('/admin/system-config')).data.data,
  });
}
export function useUpdateSystemConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<SystemConfig>) => http.put('/admin/system-config', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'config', 'system'] }),
  });
}
