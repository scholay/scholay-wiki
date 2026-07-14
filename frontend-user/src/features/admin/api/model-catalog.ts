// mirrors backend/internal/modelcatalog/model.go AgentModel / BindingView
// 模型目录 + 能力绑定(模型目录化 P1,方案 docs/research/model-catalog-2026-07/REPORT.md)。
// 改字段时后端 Go struct 与这里两侧一起改。
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';

export interface AgentModel {
  id: number;
  model_id: string;
  provider_id: number; // 0 = 默认 provider(agent_config 链);>0 = agent_providers.id(F0)
  display_name: string;
  description: string;
  channel: string; // agent | project(第一期只用 agent)
  context_window: number;
  max_output: number;
  price_in: number; // 元 / 1M token
  price_out: number;
  price_cache_r: number;
  price_cache_w: number;
  billing_weight: number; // 计费倍率(P3 生效;[0.05, 100])
  speed_class: 'fast' | 'balanced' | 'powerful';
  vision: boolean; // 视觉能力(P2 图片通道)
  user_selectable: boolean;
  min_tier: '' | 'pro' | 'max';
  enabled: boolean;
  sort_order: number;
  notes: string;
  created_at: string;
  updated_at: string;
}

// 新建/编辑提交体 = AgentModel 去掉服务端字段。
export type AgentModelPayload = Omit<AgentModel, 'id' | 'created_at' | 'updated_at'>;

export interface ModelBinding {
  purpose: string;
  model_id: string; // 绑定值(空 = 未绑定)
  effective: string; // Resolve 实际生效值
  fallback: boolean; // 生效值 ≠ 绑定值(缺绑定/指向不存在) → 标红
}

export function useAdminModels() {
  return useQuery({
    queryKey: ['admin', 'models'],
    queryFn: async () => (await http.get<{ data: AgentModel[] }>('/admin/models')).data.data,
  });
}

export function useCreateModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: AgentModelPayload) => http.post('/admin/models', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'models'] }),
  });
}

export function useUpdateModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: AgentModelPayload }) =>
      http.put(`/admin/models/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'models'] });
      qc.invalidateQueries({ queryKey: ['admin', 'model-bindings'] });
    },
  });
}

export function useDeleteModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => http.delete(`/admin/models/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'models'] });
      qc.invalidateQueries({ queryKey: ['admin', 'model-bindings'] });
    },
  });
}

export function useModelBindings() {
  return useQuery({
    queryKey: ['admin', 'model-bindings'],
    queryFn: async () =>
      (await http.get<{ data: ModelBinding[] }>('/admin/model-bindings')).data.data,
  });
}

export function useSetModelBinding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ purpose, modelId }: { purpose: string; modelId: string }) =>
      http.put(`/admin/model-bindings/${encodeURIComponent(purpose)}`, { model_id: modelId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'model-bindings'] }),
  });
}

// ── 上游 Provider(双协议 F0;mirrors backend/internal/modelcatalog/provider.go)──
export interface AgentProviderDTO {
  id: number;
  name: string;
  base_url: string;
  api_key: string; // GET 打码;提交空/遮罩 = 保留旧值
  api_format: 'anthropic' | 'openai';
  reasoning_replay: boolean; // openai 方言:工具轮回传 reasoning(Kimi 系要求;DeepSeek 勿开)
  enabled: boolean;
  push_status: string;
  push_error: string;
  notes: string;
}
export type AgentProviderPayload = Omit<AgentProviderDTO, 'id' | 'push_status' | 'push_error'>;

export function useAdminProviders() {
  return useQuery({
    queryKey: ['admin', 'model-providers'],
    queryFn: async () =>
      (await http.get<{ data: AgentProviderDTO[] }>('/admin/model-providers')).data.data,
  });
}
export function useSaveProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number | null; data: AgentProviderPayload }) =>
      id ? http.put(`/admin/model-providers/${id}`, data) : http.post('/admin/model-providers', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'model-providers'] }),
  });
}
export function useDeleteProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => http.delete(`/admin/model-providers/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'model-providers'] }),
  });
}

// purpose → 人类可读标签(11 个闭集,与 backend modelcatalog.AllPurposes 对齐)。
export const PURPOSE_LABELS: Record<string, { label: string; hint: string }> = {
  'system.main': { label: '系统主模型', hint: '推送 agent 主槽位;所有回退链的兜底' },
  'system.fast': { label: '系统快模型', hint: '会话标题生成 / 记忆抽取等带外小任务' },
  'chat_default.smart_search': { label: '智能搜索 · 默认对话', hint: '用户未选模型时的会话默认' },
  'chat_default.claw': { label: '智能助手 · 默认对话', hint: '用户未选模型时的会话默认' },
  'chat_default.prism': { label: '智能写作 · 默认对话', hint: '用户未选模型时的会话默认' },
  'peerreview.meta': { label: '智能审稿 · 预填识别', hint: '上传稿件后自动抽标题/摘要/学科(需便宜快 + 可靠 JSON)' },
  'peerreview.letter': { label: '智能审稿 · 信件起草', hint: '推荐信 / 审稿信(便宜快)' },
  'peerreview.methodology': { label: '智能审稿 · 方法论', hint: '读全文 + 选审稿人(强推理)' },
  'peerreview.scoring': { label: '智能审稿 · 审稿人盲评', hint: '三位审稿人打分(强推理)' },
  'peerreview.chief': { label: '智能审稿 · 主审裁决', hint: '汇总裁决(强推理)' },
  'prism.planner': { label: '智能写作 · 写作画像', hint: '一次性文体/学科选择(便宜)' },
};
