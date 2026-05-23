import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';

/**
 * 字段对齐 backend/internal/latexwriter/{agent_config.go, model_config.go}。
 * 关键发现:实际是两张表 ——
 *   1. agent_models —— 可用模型清单(provider/key/endpoint 都在这里)
 *   2. latex_agent_configs —— 全局 agent 配置,指向 default_model_id + 调参字段
 * 之前把两者捏成一个表单是错的,这一轮拆开。
 */

// ---------------- AgentModel(agent_models 表)----------------

export interface AgentModel {
  id: number;
  display_name: string;
  api_format: 'openai' | 'claude' | 'gemini' | string;
  model_name: string;
  api_endpoint: string;
  /** 后端 API key 用 json:"-" 不返回;只通过 has_api_key 告诉前端有没有 */
  has_api_key?: boolean;
  max_context_tokens: number;
  max_output_tokens: number;
  temperature: number;
  description?: string;
  sort_order: number;
  is_default: boolean;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

/** 写入 model 时可带 api_key —— 后端会单独存 */
export interface AgentModelInput {
  display_name: string;
  api_format: string;
  model_name: string;
  api_endpoint: string;
  api_key?: string;
  max_context_tokens?: number;
  max_output_tokens?: number;
  temperature?: number;
  description?: string;
  sort_order?: number;
  is_enabled?: boolean;
}

// ---------------- LatexAgentConfig(latex_agent_configs 表)----------------

export interface LatexAgentConfig {
  id: number;
  default_model_id?: number;
  planner_model_id?: number;
  validator_model_id?: number;
  context_window_messages: number;
  truncation_strategy: string;
  top_p: number;
  frequency_penalty: number;
  presence_penalty: number;
  max_iterations: number;
  auto_validate_latex: boolean;
  auto_fix_errors: boolean;
  enable_tool_calling: boolean;
  enabled_tool_categories?: string;
  enable_multi_agent: boolean;
  auto_compact_enabled: boolean;
  auto_compact_threshold: number;
  default_tool_permissions?: string;
  system_prompt_override?: string;
  system_prompt_append?: string;
  is_active: boolean;
  updated_by?: number;
  created_at: string;
  updated_at: string;
}

export interface ModelPreset {
  id: string;
  name: string;
  api_format: string;
  model_name: string;
  description?: string;
}

// ---------------- Agent config ----------------
export function useLatexAgentConfig() {
  return useQuery({
    queryKey: ['admin', 'latex-agent', 'config'],
    queryFn: async () =>
      (await http.get<{ data: LatexAgentConfig }>('/admin/latex-agent/config')).data.data,
  });
}

export function useUpdateLatexAgentConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<LatexAgentConfig>) =>
      http.put('/admin/latex-agent/config', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'latex-agent'] }),
  });
}

// ---------------- Model presets(只读)----------------
export function useModelPresets() {
  return useQuery({
    queryKey: ['admin', 'latex-agent', 'presets'],
    queryFn: async () =>
      (await http.get<{ data: ModelPreset[] }>('/admin/latex-agent/model-presets')).data.data,
  });
}

export function useApplyModelPreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (preset_id: string) =>
      http.post('/admin/latex-agent/apply-preset', { preset_id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'latex-agent'] }),
  });
}

// ---------------- Agent models(CRUD agent_models 表)----------------
/** 后端返回 `{ models, total }`,unwrap */
export function useAgentModels() {
  return useQuery({
    queryKey: ['admin', 'latex-agent', 'models'],
    queryFn: async () => {
      const r = await http.get<{ data: { models: AgentModel[]; total: number } }>(
        '/admin/latex-agent/models'
      );
      return r.data.data.models ?? [];
    },
  });
}

export function useCreateAgentModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: AgentModelInput) =>
      http.post('/admin/latex-agent/models', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'latex-agent'] }),
  });
}

export function useUpdateAgentModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: number; data: Partial<AgentModelInput> }) =>
      http.put(`/admin/latex-agent/models/${vars.id}`, vars.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'latex-agent'] }),
  });
}

export function useDeleteAgentModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => http.delete(`/admin/latex-agent/models/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'latex-agent'] }),
  });
}

export function useSetDefaultModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => http.post(`/admin/latex-agent/models/${id}/set-default`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'latex-agent'] }),
  });
}

// ---------------- 测试连接 ----------------
export function useTestLatexAgent() {
  return useMutation({
    mutationFn: (payload?: { prompt?: string; model_id?: number }) =>
      http.post<{ data: { ok: boolean; latency_ms?: number; sample?: string; error?: string } }>(
        '/admin/latex-agent/test-connection',
        payload || {}
      ),
  });
}
