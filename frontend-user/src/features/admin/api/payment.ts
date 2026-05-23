import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';

/**
 * 字段对齐:
 *   - backend/internal/common/model/alipay_config.go AlipayConfig
 *   - backend/internal/payment/wechat_pay_model.go WeChatPayConfig
 * 两个 provider 共用"多 config + 切换激活"模式,但字段完全不同 ——
 * Alipay 用 alipay_public_key + gateway_url + return_url
 * WeChat 用 mch_id + serial_no + api_v3_key,不需要 public key / return_url
 * 所以两个类型分开声明,UI 也走两个独立 panel,不强行共用字段。
 */

export type PaymentProvider = 'alipay' | 'wechat';

export interface AlipayConfig {
  id: number;
  app_id: string;
  private_key: string;
  alipay_public_key: string;
  gateway_url: string;
  notify_url: string;
  return_url: string;
  is_sandbox: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WeChatPayConfig {
  id: number;
  mch_id: string;
  app_id: string;
  api_v3_key: string;
  serial_no: string;
  private_key: string;
  notify_url: string;
  is_sandbox: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ---------------- Alipay ----------------
export function useAlipayConfigs() {
  return useQuery({
    queryKey: ['admin', 'payment', 'alipay', 'list'],
    queryFn: async () =>
      (await http.get<{ data: AlipayConfig[] }>('/admin/payment/alipay/configs')).data.data,
  });
}

export function useCreateAlipayConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<AlipayConfig, 'id' | 'created_at' | 'updated_at'>) =>
      http.post('/admin/payment/alipay/config', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'payment', 'alipay'] }),
  });
}

export function useUpdateAlipayConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: number; data: Partial<AlipayConfig> }) =>
      http.put(`/admin/payment/alipay/config/${vars.id}`, vars.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'payment', 'alipay'] }),
  });
}

export function useDeleteAlipayConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => http.delete(`/admin/payment/alipay/config/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'payment', 'alipay'] }),
  });
}

export function useActivateAlipayConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => http.post(`/admin/payment/alipay/config/${id}/activate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'payment', 'alipay'] }),
  });
}

// ---------------- WeChat Pay ----------------
export function useWechatPayConfigs() {
  return useQuery({
    queryKey: ['admin', 'payment', 'wechat', 'list'],
    queryFn: async () =>
      (await http.get<{ data: WeChatPayConfig[] }>('/admin/payment/wechat/configs')).data.data,
  });
}

export function useCreateWechatPayConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<WeChatPayConfig, 'id' | 'created_at' | 'updated_at'>) =>
      http.post('/admin/payment/wechat/config', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'payment', 'wechat'] }),
  });
}

export function useUpdateWechatPayConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: number; data: Partial<WeChatPayConfig> }) =>
      http.put(`/admin/payment/wechat/config/${vars.id}`, vars.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'payment', 'wechat'] }),
  });
}

export function useDeleteWechatPayConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => http.delete(`/admin/payment/wechat/config/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'payment', 'wechat'] }),
  });
}

export function useActivateWechatPayConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => http.post(`/admin/payment/wechat/config/${id}/activate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'payment', 'wechat'] }),
  });
}
