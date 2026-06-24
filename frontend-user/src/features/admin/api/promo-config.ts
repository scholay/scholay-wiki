// 限时领取会员推广(后台)—— 字段对齐 backend/internal/promo。
// 单行配置:总开关 + 微信客服二维码(data URL 直存)+ 可配置文案(标题/副标题/福利点/按钮)。
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';

export interface PromoConfig {
  id: number;
  enabled: boolean;
  title: string;
  subtitle: string;
  benefits: string; // 一行一条
  button_text: string;
  wechat_qr: string; // data URL
}

const CONFIG_KEY = ['admin', 'promo', 'config'];

export function useAdminPromoConfig() {
  return useQuery({
    queryKey: CONFIG_KEY,
    queryFn: async () => (await http.get<{ data: PromoConfig }>('/admin/promo/config')).data.data,
  });
}

export function useUpdatePromoConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (cfg: Partial<PromoConfig>) => (await http.put('/admin/promo/config', cfg)).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'promo'] });
      // 用户端公开配置同步失效,后台一改前台立即生效(下次拉取)。
      void qc.invalidateQueries({ queryKey: ['public-config', 'promo'] });
    },
  });
}
