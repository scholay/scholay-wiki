/**
 * Admin: feature_prompts 注册表 CRUD + 历史 + 回滚 API。
 *
 * 对接 backend internal/promptregistry/handler.go 暴露的 7 个端点:
 *   GET    /admin/feature-prompts                    列表 (可 ?feature_key= 过滤)
 *   GET    /admin/feature-prompts/:id                详情
 *   POST   /admin/feature-prompts                    新建变体
 *   PUT    /admin/feature-prompts/:id                编辑
 *   POST   /admin/feature-prompts/:id/toggle         一键启用/停用
 *   DELETE /admin/feature-prompts/:id                真删 (谨慎)
 *   GET    /admin/feature-prompts/:id/history        版本历史
 *   POST   /admin/feature-prompts/:id/revert/:version 回滚到某版本
 *
 * queryKey 命名遵循 [feature, resource, ...params] 三段式 (frontend CLAUDE.md §3.2):
 *   ['admin','feature-prompts','list', featureKey?]
 *   ['admin','feature-prompts','detail', id]
 *   ['admin','feature-prompts','history', id]
 *
 * 写路径 mutation 成功后 invalidate(['admin','feature-prompts']) 批量失效全部相关 query,
 * 不手动 setQueryData (除非未来需要乐观更新)。
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';

// ─── 类型 (跟后端 promptregistry.promptDTO 对齐) ─────────────────────────

export interface FeaturePrompt {
  id: number;
  feature_key: string;
  slug: string;
  persona: string;
  name: string;
  description?: string | null;
  applicable_subjects: string[];
  weight: number;
  enabled: boolean;
  system_prompt: string;
  version: number;
  source: 'seed' | 'admin';
  updated_by_user_id?: number | null;
  created_at: string;
  updated_at: string;
}

export interface FeaturePromptHistory {
  id: number;
  prompt_id: number;
  version: number;
  name: string;
  applicable_subjects: string[];
  weight: number;
  enabled: boolean;
  system_prompt: string;
  change_note?: string | null;
  changed_by_user_id?: number | null;
  created_at: string;
}

export interface CreatePromptPayload {
  feature_key: string;
  slug: string;
  persona?: string;
  name: string;
  description?: string | null;
  applicable_subjects?: string[];
  weight?: number;
  enabled?: boolean;
  system_prompt: string;
}

export interface UpdatePromptPayload {
  name: string;
  description?: string | null;
  applicable_subjects?: string[];
  weight?: number;
  enabled: boolean;
  system_prompt: string;
  change_note?: string | null;
}

// ─── Read hooks ─────────────────────────────────────────────────────────

/**
 * 列表 — admin 主入口。featureKey 留空 → 全部 feature 合在一起。
 *
 * 后端按 (updated_at DESC, id DESC) 排; 不分页 (预期 < 200 行)。
 */
export function useFeaturePrompts(featureKey?: string) {
  return useQuery({
    queryKey: ['admin', 'feature-prompts', 'list', featureKey ?? ''],
    queryFn: async () => {
      const params = featureKey ? `?feature_key=${encodeURIComponent(featureKey)}` : '';
      const r = await http.get<{ data: { items: FeaturePrompt[]; total: number } }>(
        `/admin/feature-prompts${params}`,
      );
      return r.data.data;
    },
  });
}

/** 详情 — 走主表 GetByID, 不走缓存, 编辑前拉最新。 */
export function useFeaturePrompt(id: number | null) {
  return useQuery({
    queryKey: ['admin', 'feature-prompts', 'detail', id],
    enabled: !!id,
    queryFn: async () => {
      const r = await http.get<{ data: FeaturePrompt }>(`/admin/feature-prompts/${id}`);
      return r.data.data;
    },
  });
}

/** 版本历史 — 编辑面板里的"历史抽屉"用。版本倒序 (最新在前)。 */
export function useFeaturePromptHistory(id: number | null) {
  return useQuery({
    queryKey: ['admin', 'feature-prompts', 'history', id],
    enabled: !!id,
    queryFn: async () => {
      const r = await http.get<{
        data: { items: FeaturePromptHistory[]; total: number };
      }>(`/admin/feature-prompts/${id}/history?limit=100`);
      return r.data.data.items ?? [];
    },
  });
}

// ─── Write mutations ────────────────────────────────────────────────────

/** 全部写路径成功后统一 invalidate, queryKey 三段式前缀就够。 */
function useInvalidateAll() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['admin', 'feature-prompts'] });
}

export function useCreatePrompt() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (payload: CreatePromptPayload) => {
      const r = await http.post<{ data: FeaturePrompt }>('/admin/feature-prompts', payload);
      return r.data.data;
    },
    onSuccess: invalidate,
  });
}

export function useUpdatePrompt() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (vars: { id: number; payload: UpdatePromptPayload }) => {
      const r = await http.put<{ data: FeaturePrompt }>(
        `/admin/feature-prompts/${vars.id}`,
        vars.payload,
      );
      return r.data.data;
    },
    onSuccess: invalidate,
  });
}

export function useTogglePrompt() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (vars: { id: number; enabled: boolean }) => {
      const r = await http.post<{ data: FeaturePrompt }>(
        `/admin/feature-prompts/${vars.id}/toggle`,
        { enabled: vars.enabled },
      );
      return r.data.data;
    },
    onSuccess: invalidate,
  });
}

export function useDeletePrompt() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (id: number) => {
      await http.delete(`/admin/feature-prompts/${id}`);
    },
    onSuccess: invalidate,
  });
}

export function useRevertPrompt() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (vars: { id: number; version: number }) => {
      const r = await http.post<{ data: FeaturePrompt }>(
        `/admin/feature-prompts/${vars.id}/revert/${vars.version}`,
      );
      return r.data.data;
    },
    onSuccess: invalidate,
  });
}
