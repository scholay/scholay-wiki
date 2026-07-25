import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
