import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';

export interface WechatOfficialConfig {
  app_id: string;
  app_secret?: string;
  token?: string;
  encoding_aes_key?: string;
  encryption_mode: 'plaintext' | 'compatible' | 'secure';
  auto_reply_enabled: boolean;
  ai_model_level: 'low' | 'medium' | 'high';
  system_prompt?: string;
}

export function useWechatOfficialConfig() {
  return useQuery({
    queryKey: ['admin', 'wechat-official', 'config'],
    queryFn: async () =>
      (await http.get<{ data: WechatOfficialConfig }>('/admin/wechat-official/config')).data.data,
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
