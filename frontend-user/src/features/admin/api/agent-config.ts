import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';

export interface AgentConfig {
  base_url: string;
  api_key: string;
  main_model: string;
  haiku_model: string;
  sonnet_model: string;
  opus_model: string;
  enabled: boolean;
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
