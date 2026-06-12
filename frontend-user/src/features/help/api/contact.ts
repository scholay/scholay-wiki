// 「联系我们」展示数据 —— 后台「客服配置」维护(联系邮箱/二维码/说明),免登录公开端点。
import { useQuery } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';

export interface SupportContact {
  support_email: string;
  business_email: string;
  contact_note: string;
  /** 企业微信二维码(data URL,空 = 未配置不展示) */
  wecom_qr: string;
  /** 飞书二维码(data URL,空 = 未配置不展示) */
  feishu_qr: string;
}

export function useSupportContact() {
  return useQuery({
    queryKey: ['help', 'support-contact'],
    queryFn: async () =>
      (await http.get<{ data: SupportContact }>('/config/support-contact')).data.data,
    staleTime: 5 * 60_000,
  });
}
