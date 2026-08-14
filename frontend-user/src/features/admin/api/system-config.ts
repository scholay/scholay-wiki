import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

/**
 * 「还没配过」的空配置常量。
 *
 * 🔴 邮件 / 短信这两个 GET 在**尚未配置过**时后端返回 `data: null`
 * (backend/internal/config/handler_email_sms.go:43 / :181,注释写着 "Return empty config
 * if not found" —— 是刻意的「空」语义,不是错误)。而 `ConfigPageGuard` 把
 * `isError || !data` 一并当成「不能拿来渲染一份可提交的表单」。
 * 若不在这里归一,新部署的首次配置会被守卫永久挡在门外(表单根本不渲染)。
 *
 * 归一成显式空对象之后:
 *   · 首次配置照常可填可存;
 *   · GET 真失败时仍然只有 isError 一条路径,守卫照常挡住空表单覆盖线上配置。
 */
export const EMPTY_EMAIL_CONFIG: EmailConfig = {
  id: 0,
  smtp_host: '',
  smtp_port: 587,
  smtp_user: '',
  smtp_password: '',
  from_email: '',
  from_name: '',
  is_active: false,
  created_at: '',
  updated_at: '',
};

export const EMPTY_SMS_CONFIG: SMSConfig = {
  id: 0,
  access_key_id: '',
  access_secret: '',
  sign_name: '',
  template_code: '',
  template_content: '',
  endpoint: '',
  is_active: false,
  created_at: '',
  updated_at: '',
};

// ---- email ----
// smtp_password 默认脱敏; reveal 时用 ?show_password=true 拉明文 (邮件端点参数名特殊)。
export function useEmailConfig({ showSensitive }: { showSensitive: boolean }) {
  return useQuery({
    queryKey: ['admin', 'config', 'email', { showSensitive }],
    // showSensitive 进了 queryKey —— 点密钥框的「眼睛」就是换 key 重取。
    // 没有 keepPreviousData 的话新 key 无缓存 → isLoading 瞬时为 true → 上层守卫
    // (ConfigPageGuard / `if (isLoading) return <Loading/>`)会把整张表单卸载重建,
    // 管理员填了一半还没保存的内容会无声消失。保住旧值,表单始终挂载。
    placeholderData: keepPreviousData,
    queryFn: async () =>
      (
        await http.get<{ data: EmailConfig | null }>('/admin/email-config', {
          params: showSensitive ? { show_password: true } : undefined,
        })
      ).data.data ?? EMPTY_EMAIL_CONFIG,
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
    // showSensitive 进了 queryKey —— 点密钥框的「眼睛」就是换 key 重取。
    // 没有 keepPreviousData 的话新 key 无缓存 → isLoading 瞬时为 true → 上层守卫
    // (ConfigPageGuard / `if (isLoading) return <Loading/>`)会把整张表单卸载重建,
    // 管理员填了一半还没保存的内容会无声消失。保住旧值,表单始终挂载。
    placeholderData: keepPreviousData,
    queryFn: async () =>
      (
        await http.get<{ data: SMSConfig | null }>('/admin/sms-config', {
          params: showSensitive ? { show_secret: true } : undefined,
        })
      ).data.data ?? EMPTY_SMS_CONFIG,
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
    // showSensitive 进了 queryKey —— 点密钥框的「眼睛」就是换 key 重取。
    // 没有 keepPreviousData 的话新 key 无缓存 → isLoading 瞬时为 true → 上层守卫
    // (ConfigPageGuard / `if (isLoading) return <Loading/>`)会把整张表单卸载重建,
    // 管理员填了一半还没保存的内容会无声消失。保住旧值,表单始终挂载。
    placeholderData: keepPreviousData,
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
