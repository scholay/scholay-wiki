// 计费体系配置 —— admin hooks。对齐 backend/internal/vip (BillingConfig)。
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';

export interface BillingConfig {
  id: number;
  free_daily_tokens: number; // 旧日额度基准(P4 起判定不读,回滚兜底,表单已移除)
  free_window_tokens: number; // 7 天周期基准额度(判定真源)
  window_days: number;
  base_price_per_m: number; // P3 加权计费换算锚点(先落库)
  pro_multiplier: number;
  max_multiplier: number;
  pro_price_cents: number;
  pro_original_cents: number;
  max_price_cents: number;
  max_original_cents: number;
  pro_grant_credits: number;
  max_grant_credits: number;
  recharge_rate: number;
  min_recharge_cents: number;
  reset_cost_credits: number;
  subscription_period_days: number;
  popular_plan: string;
  enabled: boolean;
}

export function useBillingConfig() {
  return useQuery({
    queryKey: ['admin', 'billing-config'],
    queryFn: async () => (await http.get<{ data: BillingConfig }>('/admin/billing/config')).data.data,
  });
}

export function useUpdateBillingConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (cfg: BillingConfig) => (await http.put('/admin/billing/config', cfg)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'billing-config'] }),
  });
}
