// 情报(学术新闻)webhook 配置(后台)—— 字段对齐 backend/internal/news。
// 单行配置:前端展示总开关 + 接收 URL(只读展示给上游)+ HMAC 密钥(脱敏读写)。
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';

export interface NewsWebhookConfig {
  enabled: boolean;
  webhook_url: string; // 接收地址(展示给上游配置用,只读)
  webhook_secret: string; // 默认脱敏 ********;show_sensitive=true 才回明文
}

export function useNewsWebhookConfig({ showSensitive }: { showSensitive: boolean }) {
  return useQuery({
    queryKey: ['admin', 'news-webhook', { showSensitive }],
    queryFn: async () =>
      (
        await http.get<{ data: NewsWebhookConfig }>('/admin/news-webhook/config', {
          params: showSensitive ? { show_sensitive: true } : undefined,
        })
      ).data.data,
  });
}

export function useUpdateNewsWebhookConfig() {
  const qc = useQueryClient();
  return useMutation({
    // 只提交可写字段(webhook_url 是后端推导的只读展示)。
    mutationFn: (data: { enabled: boolean; webhook_secret: string }) =>
      http.put('/admin/news-webhook/config', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'news-webhook'] }),
  });
}
