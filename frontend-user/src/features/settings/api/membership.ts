// 会员(VIP)—— 用户端 hooks。字段对齐 backend/internal/vip (service.go Status / RedeemResult)。
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';

export interface FeatureUsage {
  feature: string;
  label: string;
  limit: number; // <=0 表示不限
  used: number;
  remaining: number; // 不限时为 -1
}

export interface Membership {
  tier: 'free' | 'pro';
  expires_at: string | null;
  features: FeatureUsage[];
}

export interface RedeemResult {
  tier: 'free' | 'pro';
  expires_at: string;
}

/** 当前会员状态(等级/到期/各功能今日额度)。 */
export function useMembership() {
  return useQuery({
    queryKey: ['settings', 'membership'],
    queryFn: async () => (await http.get<{ data: Membership }>('/user/membership')).data.data,
    staleTime: 30_000,
  });
}

/** 兑换码。成功后刷新会员状态。 */
export function useRedeemCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (code: string) =>
      (await http.post<{ data: RedeemResult }>('/user/redeem-code', { code })).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'membership'] }),
  });
}
