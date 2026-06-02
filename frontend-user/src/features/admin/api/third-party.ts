import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';

/**
 * 字段对齐 backend/internal/thirdparty/model.go。
 * 关键修正:
 *   - `provider` 实为 `type`(AccountType enum)
 *   - 不存在直接的 `api_key`/`endpoint` 字段,全在 `config` JSON 子对象里
 *     (具体 key 取决于 type:openai 用 api_key/api_base,minicod 用别的)
 *   - `is_active` 实为 `status: int`(1=active / 0=inactive)
 *   - 多了 `priority` 字段(数字越小优先级越高)
 *   - 多了一堆延迟统计字段(success_count / fail_count / max_latency_ms 等)
 */
export type AccountType = 'ai_model' | 'minicod';

/** AccountConfig 是后端 map[string]any —— 不同 type 的 key 不同,前端用 Record 弱类型 */
export type AccountConfig = Record<string, unknown>;

/** 后端 handler 在 list 时为每条 account 计算的派生 stats(success_rate / avg_latency_ms 等都在这里) */
export interface APIStats {
  success_rate: number;
  avg_latency_ms: number;
  std_dev_ms: number;
  slow_avg_ms: number;
  slow_rate: number;
}

export interface ThirdPartyAccount {
  id: number;
  name: string;
  type: AccountType;
  config: AccountConfig;
  status: number; // 1=active, 0=inactive
  priority: number;
  usage_count: number;
  last_used_at?: string;
  created_at: string;
  updated_at: string;
  // 原始计数器(列表里通常给,但前端展示用 `stats.*`)
  total_requests?: number;
  success_count?: number;
  fail_count?: number;
  total_latency_ms?: number;
  total_latency_sq_ms?: number;
  max_latency_ms?: number;
  slow_count?: number;
  slow_total_latency_ms?: number;
  /** 后端在 list 响应里附加的派生统计;在 GetAccount 详情可能没有 */
  stats?: APIStats;
}

/**
 * 后端实际返回 `{ accounts: [...], total: N }`(不是裸数组!)
 * hook 直接解出 accounts,使用方拿到的就是数组。
 */
export function useThirdPartyAccounts({ showSensitive }: { showSensitive: boolean }) {
  return useQuery({
    queryKey: ['admin', 'third-party', 'list', { showSensitive }],
    queryFn: async () => {
      const r = await http.get<{ data: { accounts: ThirdPartyAccount[]; total: number } }>(
        '/admin/third-party-accounts',
        { params: showSensitive ? { show_sensitive: true } : undefined }
      );
      return r.data.data.accounts ?? [];
    },
  });
}

export function useCreateThirdParty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<ThirdPartyAccount, 'id' | 'created_at' | 'updated_at' | 'usage_count' | 'last_used_at'>) =>
      http.post('/admin/third-party-accounts', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'third-party'] }),
  });
}

export function useUpdateThirdParty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: number; data: Partial<ThirdPartyAccount> }) =>
      http.put(`/admin/third-party-accounts/${vars.id}`, vars.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'third-party'] }),
  });
}

export function useDeleteThirdParty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => http.delete(`/admin/third-party-accounts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'third-party'] }),
  });
}

export function useTestThirdParty() {
  return useMutation({
    mutationFn: (id: number) => http.post(`/admin/third-party-accounts/${id}/test`),
  });
}

export function useResetThirdPartyStats() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => http.post(`/admin/third-party-accounts/${id}/reset-stats`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'third-party'] }),
  });
}
