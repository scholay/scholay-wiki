import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
    // showSensitive 进了 queryKey —— 点密钥框的「眼睛」就是换 key 重取。
    // 没有 keepPreviousData 的话新 key 无缓存 → isLoading 瞬时为 true → 上层守卫
    // (ConfigPageGuard / `if (isLoading) return <Loading/>`)会把整张表单卸载重建,
    // 管理员填了一半还没保存的内容会无声消失。保住旧值,表单始终挂载。
    placeholderData: keepPreviousData,
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
