import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';

// mirrors backend/internal/wechat/miniprogram.go MiniProgramConfig
// 小程序登录凭据(独立于网页 OAuth 的 wechat_configs);用于 /sns/jscode2session 一键登录。
export interface WechatMiniProgramConfig {
  app_id: string;
  app_secret?: string; // GET 默认脱敏 ********;show_sensitive 才回明文
  enabled: boolean; // 登录总开关:关闭时后端拒绝 jscode2session
}

export function useWechatMiniProgramConfig({ showSensitive }: { showSensitive: boolean }) {
  return useQuery({
    queryKey: ['admin', 'wechat-miniprogram', 'config', { showSensitive }],
    queryFn: async () =>
      (
        await http.get<{ data: WechatMiniProgramConfig }>('/admin/wechat-miniprogram/config', {
          params: showSensitive ? { show_sensitive: true } : undefined,
        })
      ).data.data,
  });
}

export function useUpdateWechatMiniProgramConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<WechatMiniProgramConfig>) =>
      http.put('/admin/wechat-miniprogram/config', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'wechat-miniprogram'] }),
  });
}
