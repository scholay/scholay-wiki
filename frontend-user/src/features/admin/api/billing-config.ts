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
  // 0090 退休(DB 列非破坏保留,后端 Updates map 已不写):pro/max_grant_credits。
  // ── 年度订阅(0079)。年价 <=0 = 该档年付未开放(前端隐藏年付入口)。
  pro_year_price_cents: number;
  pro_year_original_cents: number;
  max_year_price_cents: number;
  max_year_original_cents: number;
  // 0090 退休:pro/max_year_grant_credits + subscription_year_days。
  recharge_rate: number;
  min_recharge_cents: number;
  // reset_cost_credits 运行时已不读(重置改扣次数),但**必须保留**:迁移 0092 拿它当换算率,
  // 而后台 PUT 是全列覆盖 —— 从这个 interface 删掉会让它被写成 0,导致换算超发 120 倍。
  /** 1 经费可兑换的算力点(0094 按量付费)。与 recharge_rate 共同决定按量单价 ——
   *  后端硬校验:按量单价必须严格高于所有套餐档,否则拒绝保存。 */
  credit_to_points: number;
  reset_cost_credits: number;
  /** 每成功邀请 1 人赠邀请人的经费(经费=分);0=关闭活动。 */
  invite_reward_credits: number;
  /** 每邀请人每日最多计奖励的邀请数;0=不限(防小号批量注册刷奖励)。 */
  invite_reward_daily_cap: number;
  // 0090 退休:subscription_period_days(月度改「+1 个自然月」)。
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
