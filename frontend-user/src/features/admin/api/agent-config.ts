// mirrors backend/internal/agentconfig/model.go AgentConfig
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';

// GET 仍会回 4 个模型槽位列(冻结的迁移前旧值,兼任后端 Resolve 终极回退),但表单不再编辑;
// PUT 只提交连接字段 —— 后端 repo 已不再写模型列(模型改到 /admin/models 目录 + 能力绑定管理)。
export interface AgentConfig {
  base_url: string;
  api_key: string;
  enabled: boolean;
  push_status?: string; // GET 透传:pending/success/failed(默认端点的推送状态)
  push_error?: string;
}

export function useAgentConfig({ showSensitive }: { showSensitive: boolean }) {
  return useQuery({
    queryKey: ['admin', 'agent-config', { showSensitive }],
    queryFn: async () =>
      (
        await http.get<{ data: AgentConfig }>('/admin/agent/config', {
          params: showSensitive ? { show_sensitive: true } : undefined,
        })
      ).data.data,
  });
}

export function useUpdateAgentConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: AgentConfig) => http.put('/admin/agent/config', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'agent-config'] }),
  });
}
