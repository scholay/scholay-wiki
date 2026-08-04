// mirrors backend/internal/featuretool/model.go (ImportJob / Webhook / WebhookDelivery)
//        backend/internal/featuretool/handler.go (Admin* 路由的响应信封)
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
  /** 子阶段:zip 导入先并发上传 logo 再逐条 upsert。空=未分阶段(纯 JSON 导入)。 */
  phase?: '' | 'uploading_logos' | 'importing' | 'done';
  source: string;
  filename?: string;
  notify: boolean;
  total: number;
  processed: number;
  logo_total: number;
  logo_done: number;
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

/**
 * 任务状态中文表 —— **五个 status 一个不漏**。
 *
 * 导入页此前只映射了 succeeded / partial,其余 `: job.status` 兜底,于是失败时
 * 渲染的是裸英文「任务 #12 · failed」。缺的那个偏偏永远是最需要说人话的那个。
 * 两个页面共用这一张表(放这里而不是某个 page,避免两个 lazy chunk 互相牵连)。
 */
export const IMPORT_JOB_STATUS_LABEL: Record<ImportJob['status'], string> = {
  pending: '排队中',
  running: '处理中',
  succeeded: '成功',
  partial: '部分成功',
  failed: '失败',
};

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

/** 任务是否还在跑 —— 轮询开关的唯一判据(见下面两个 hook 的注释) */
export function isJobRunning(status?: ImportJob['status']): boolean {
  return status === 'pending' || status === 'running';
}

export function useImportJobs(params: { page?: number; page_size?: number } = {}) {
  return useQuery({
    queryKey: ['admin', 'feature-tools', 'import-jobs', params] as const,
    // 导入是纯异步的,而这一页正是用来看「跑完没有」的 —— 有任务在跑就自动刷,
    // 全跑完自动停(不做无限轮询)。
    refetchInterval: (q) =>
      (q.state.data?.items ?? []).some((j) => isJobRunning(j.status)) ? 3000 : false,
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
    // 🔴 轮询开关是「任务还在不在跑」,不是「有没有 jobId」。
    // 原写法 `poll ? 1500 : false` 里的 poll 恒等于 `jobId != null` / `!!id`,
    // 于是导入结束后只要不离开页面 / 不关弹窗,就一直 1.5s 一次打接口。
    // data 尚未到手时返回 false 不影响首次取数(enabled 已经触发过一次 fetch),
    // 拿到 status 后 react-query 会重新求值这个函数。
    refetchInterval: (q) => (poll && isJobRunning(q.state.data?.status) ? 1500 : false),
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

/**
 * 「发送测试」的结果。
 *
 * 🔴 **HTTP 200 不代表下游收到了。** 后端 handler.go `AdminTestWebhook` 只在**传输层**
 * 出错(DNS / 超时 / SSRF 白名单拦截)时才回错误码;下游返回 401 / 404 / 500 一律走
 * `SuccessWithMessage(c, "已投递", {http_status, response})` = HTTP 200 成功信封。
 * 所以调用方**必须**自己判 `http_status` 是否 2xx,不能靠 apiToast 的成功分支。
 */
export interface WebhookTestResult {
  /** 下游实际返回的状态码;传输层失败时后端给 0(此时走 mutation 的 reject 分支) */
  http_status: number;
  /** 下游响应体(后端最多截 4096 字节) */
  response: string;
}

export function useTestWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      http
        .post<{ data: WebhookTestResult }>(`/admin/tools/webhooks/${id}/test`)
        .then((r) => r.data.data),
    // TestDeliver 会写回 last_status / last_delivered_at,列表要跟着更新
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin', 'feature-tools', 'webhooks'] }),
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
