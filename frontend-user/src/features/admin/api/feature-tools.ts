import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';
import type { FeatureTool, ToolCategoryMeta } from '@/types/feature-tool';

// ── 导入任务 / Webhook 类型 (对齐 backend featuretool model) ──────────────────

export interface ImportItemResult {
  idx: number;
  name: string;
  action: 'created' | 'updated' | 'skipped' | 'failed';
  error?: string;
}

export interface ImportJob {
  id: number;
  status: 'pending' | 'running' | 'succeeded' | 'partial' | 'failed';
  source: string;
  filename?: string;
  notify: boolean;
  total: number;
  processed: number;
  created_cnt: number;
  updated_cnt: number;
  skipped_cnt: number;
  failed_cnt: number;
  error?: string;
  detail?: ImportItemResult[];
  created_at: string;
  updated_at: string;
  finished_at?: string;
}

export interface Webhook {
  id: number;
  name: string;
  url: string;
  secret?: string;
  events?: string[];
  enabled: boolean;
  last_status?: string;
  last_delivered_at?: string;
  last_error?: string;
  created_at: string;
  updated_at: string;
}

export interface WebhookDelivery {
  id: number;
  webhook_id: number;
  tool_id?: number;
  event: string;
  status: string;
  http_status?: number;
  attempt: number;
  response_body?: string;
  error?: string;
  created_at: string;
}

// ── 工具 CRUD ────────────────────────────────────────────────────────────────

export interface AdminToolListParams {
  page?: number;
  page_size?: number;
  q?: string;
  status?: string;
  category?: string;
  access_type?: string;
  price_type?: string;
}

interface AdminToolListResponse {
  items: FeatureTool[];
  total: number;
  page: number;
  page_size: number;
}

export function useAdminToolList(params: AdminToolListParams = {}) {
  return useQuery({
    queryKey: ['admin', 'feature-tools', 'list', params] as const,
    placeholderData: (prev) => prev,
    queryFn: async (): Promise<AdminToolListResponse> => {
      const { data } = await http.get<{ data: AdminToolListResponse }>('/admin/tools', { params });
      return data.data;
    },
  });
}

export function useAdminToolCategories() {
  return useQuery({
    queryKey: ['admin', 'feature-tools', 'categories'] as const,
    queryFn: async (): Promise<{ categories: ToolCategoryMeta[]; total: number }> => {
      const { data } = await http.get<{ data: { categories: ToolCategoryMeta[]; total: number } }>(
        '/admin/tools/categories',
      );
      return data.data;
    },
  });
}

export function useAdminTool(id: number | undefined) {
  return useQuery({
    queryKey: ['admin', 'feature-tools', 'detail', id] as const,
    enabled: !!id,
    queryFn: async (): Promise<FeatureTool> => {
      const { data } = await http.get<{ data: FeatureTool }>(`/admin/tools/items/${id}`);
      return data.data;
    },
  });
}

export function useUpdateTool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: number; data: Partial<FeatureTool> }) =>
      http.put(`/admin/tools/items/${vars.id}`, vars.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'feature-tools'] }),
  });
}

export function useCreateTool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<FeatureTool>) => http.post('/admin/tools', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'feature-tools'] }),
  });
}

export function useDeleteTool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => http.delete(`/admin/tools/items/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'feature-tools'] }),
  });
}

// ── 导入 ─────────────────────────────────────────────────────────────────────

export function useImportTools() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { items: unknown[]; notify: boolean; source?: string; filename?: string }) =>
      http
        .post<{ data: ImportJob }>('/admin/tools/import', vars)
        .then((r) => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'feature-tools'] });
    },
  });
}

/** zip 上传导入:multipart 传一个 zip,后端解出里面所有 .json 合并导入。 */
export function useImportToolsZip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { file: File; notify: boolean }) => {
      const fd = new FormData();
      fd.append('file', vars.file);
      fd.append('notify', vars.notify ? '1' : '0');
      return http
        .post<{ data: ImportJob }>('/admin/tools/import-zip', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        .then((r) => r.data.data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'feature-tools'] }),
  });
}

export function useImportJobs(params: { page?: number; page_size?: number } = {}) {
  return useQuery({
    queryKey: ['admin', 'feature-tools', 'import-jobs', params] as const,
    queryFn: async (): Promise<{ items: ImportJob[]; total: number }> => {
      const { data } = await http.get<{ data: { items: ImportJob[]; total: number } }>(
        '/admin/tools/import-jobs',
        { params },
      );
      return data.data;
    },
  });
}

export function useImportJob(id: number | undefined, poll = false) {
  return useQuery({
    queryKey: ['admin', 'feature-tools', 'import-job', id] as const,
    enabled: !!id,
    refetchInterval: poll ? 1500 : false,
    queryFn: async (): Promise<ImportJob> => {
      const { data } = await http.get<{ data: ImportJob }>(`/admin/tools/import-jobs/${id}`);
      return data.data;
    },
  });
}

// ── Webhook ──────────────────────────────────────────────────────────────────

export function useWebhooks() {
  return useQuery({
    queryKey: ['admin', 'feature-tools', 'webhooks'] as const,
    queryFn: async (): Promise<Webhook[]> => {
      const { data } = await http.get<{ data: { items: Webhook[] } }>('/admin/tools/webhooks');
      return data.data.items ?? [];
    },
  });
}

export function useCreateWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Webhook>) => http.post('/admin/tools/webhooks', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'feature-tools', 'webhooks'] }),
  });
}

export function useUpdateWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: number; data: Partial<Webhook> }) =>
      http.put(`/admin/tools/webhooks/${vars.id}`, vars.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'feature-tools', 'webhooks'] }),
  });
}

export function useDeleteWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => http.delete(`/admin/tools/webhooks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'feature-tools', 'webhooks'] }),
  });
}

export function useTestWebhook() {
  return useMutation({
    mutationFn: (id: number) =>
      http
        .post<{ data: { http_status: number; response: string } }>(`/admin/tools/webhooks/${id}/test`)
        .then((r) => r.data.data),
  });
}

export function useWebhookDeliveries(id: number | undefined) {
  return useQuery({
    queryKey: ['admin', 'feature-tools', 'webhook-deliveries', id] as const,
    enabled: !!id,
    queryFn: async (): Promise<WebhookDelivery[]> => {
      const { data } = await http.get<{ data: { items: WebhookDelivery[] } }>(
        `/admin/tools/webhooks/${id}/deliveries`,
      );
      return data.data.items ?? [];
    },
  });
}
