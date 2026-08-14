import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';

export interface WechatOfficialConfig {
  app_id: string;
  app_secret?: string;
  token?: string;
  encoding_aes_key?: string;
  encryption_mode: 'plaintext' | 'compatible' | 'secure';
  auto_reply_enabled: boolean;
  /** @deprecated 模型已改由后台能力绑定 project.wechat_oa 选,本档位后端忽略(0080)。保留字段仅兼容旧数据。 */
  ai_model_level?: 'low' | 'medium' | 'high';
  system_prompt?: string;
}

export function useWechatOfficialConfig({ showSensitive }: { showSensitive: boolean }) {
  return useQuery({
    queryKey: ['admin', 'wechat-official', 'config', { showSensitive }],
    // showSensitive 进了 queryKey —— 点密钥框的「眼睛」就是换 key 重取。
    // 没有 keepPreviousData 的话新 key 无缓存 → isLoading 瞬时为 true → 上层守卫
    // (ConfigPageGuard / `if (isLoading) return <Loading/>`)会把整张表单卸载重建,
    // 管理员填了一半还没保存的内容会无声消失。保住旧值,表单始终挂载。
    placeholderData: keepPreviousData,
    queryFn: async () =>
      (
        await http.get<{ data: WechatOfficialConfig }>('/admin/wechat-official/config', {
          params: showSensitive ? { show_sensitive: true } : undefined,
        })
      ).data.data,
  });
}

export function useUpdateWechatOfficialConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<WechatOfficialConfig>) =>
      http.put('/admin/wechat-official/config', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'wechat-official'] }),
  });
}
