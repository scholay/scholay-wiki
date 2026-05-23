import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';

/**
 * TODO: 后端 swagger.json 落地后,本文件 4 个 interface(UsageLog /
 *       UsageLogParams / UsageLogSummary / UsageLogConfig)替换为
 *       `import type { components } from '@/shared/api/schema'` 自动生成的类型,
 *       消除手写镜像。当前 backend 未导出 swagger,`npm run gen:api` 暂时无法跑通。
 */

/** 字段对齐 backend/internal/usagelog/model.go UsageLog */
export interface UsageLog {
  id: number;
  user_id: number;
  session_id?: string;
  feature_code: string;
  feature_name: string;
  action: string;
  entry_point?: string;
  request_path?: string;
  referer_path?: string;
  ip_address?: string;
  user_agent?: string;
  device_type?: string;
  browser?: string;
  os?: string;
  extra_data?: unknown;
  created_at: string;
}

export interface UsageLogParams {
  page?: number;
  page_size?: number;
  feature_code?: string;
  user_id?: number;
  start_date?: string;
  end_date?: string;
}

export interface UsageLogSummary {
  total_calls: number;
  unique_users: number;
  by_feature: Array<{ feature_code: string; feature_name?: string; count: number }>;
}

/** 后端只有 retention_days,没有 enabled 开关 —— 之前的 `enabled` 字段是我自己加的,删掉 */
export interface UsageLogConfig {
  retention_days: number;
}

/** 后端返回 `{logs, total, page, page_size}` —— 用 `logs` 不是 `list`,这里映射 */
export function useUsageLogs(params: UsageLogParams) {
  return useQuery({
    queryKey: ['admin', 'usage-logs', 'list', params],
    queryFn: async () => {
      const r = await http.get<{ data: { logs: UsageLog[]; total: number } }>(
        '/admin/usage-logs',
        { params }
      );
      return { list: r.data.data.logs ?? [], total: r.data.data.total ?? 0 };
    },
  });
}

export function useUsageLogSummary(params: Pick<UsageLogParams, 'start_date' | 'end_date'>) {
  return useQuery({
    queryKey: ['admin', 'usage-logs', 'summary', params],
    queryFn: async () =>
      (await http.get<{ data: UsageLogSummary }>('/admin/usage-logs/summary', { params })).data.data,
  });
}

/** 后端返回 `{config: {...}, old_logs_count: N}`,只取 config */
export function useUsageLogConfig() {
  return useQuery({
    queryKey: ['admin', 'usage-logs', 'config'],
    queryFn: async () => {
      const r = await http.get<{ data: { config: UsageLogConfig; old_logs_count: number } }>(
        '/admin/usage-logs/config'
      );
      return r.data.data.config;
    },
  });
}

export function useUpdateUsageLogConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<UsageLogConfig>) => http.put('/admin/usage-logs/config', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'usage-logs', 'config'] }),
  });
}

export function useTriggerUsageLogCleanup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => http.post('/admin/usage-logs/cleanup'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'usage-logs'] }),
  });
}

/**
 * 浏览器下载 CSV —— 走统一 http 实例(自带 Authorization interceptor),
 * responseType: 'blob' 让 axios 把响应保留为 Blob 而不是 JSON.parse。
 */
export async function exportUsageLogsCSV(params: UsageLogParams) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v != null) search.set(k, String(v));
  });
  const { data: blob } = await http.get<Blob>(
    `/admin/usage-logs/export?${search.toString()}`,
    { responseType: 'blob' }
  );
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `usage-logs-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}
