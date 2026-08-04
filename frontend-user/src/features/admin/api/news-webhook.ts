// 情报(学术新闻)webhook 配置(后台)—— 字段对齐 backend/internal/news。
// 单行配置:前端展示总开关 + 接收 URL(只读展示给上游)+ HMAC 密钥(脱敏读写)。
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';

export interface NewsWebhookConfig {
  enabled: boolean;
  webhook_url: string; // 接收地址(展示给上游配置用,只读)
  webhook_secret: string; // 默认脱敏 ********;show_sensitive=true 才回明文
}

export function useNewsWebhookConfig({ showSensitive }: { showSensitive: boolean }) {
  return useQuery({
    queryKey: ['admin', 'news-webhook', { showSensitive }],
    // showSensitive 进了 queryKey —— 点密钥框的「眼睛」就是换 key 重取。
    // 没有 keepPreviousData 的话新 key 无缓存 → isLoading 瞬时为 true → 上层守卫
    // (ConfigPageGuard / `if (isLoading) return <Loading/>`)会把整张表单卸载重建,
    // 管理员填了一半还没保存的内容会无声消失。保住旧值,表单始终挂载。
    placeholderData: keepPreviousData,
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
