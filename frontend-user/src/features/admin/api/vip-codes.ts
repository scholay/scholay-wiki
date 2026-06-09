// 会员兑换码 —— admin hooks。字段对齐 backend/internal/vip (RedemptionCode / handler)。
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';

export interface VipCode {
  id: number;
  code: string;
  grant_kind: string; // tier | credit
  grant_tier: string;
  grant_days: number;
  grant_credits: number;
  credit_kind: string; // temp | perm
  credit_validity_days: number;
  max_uses: number; // 可兑换总次数(1..100)
  used_count: number; // 已兑换次数
  revoked_at: string | null; // 管理员停用时间;null=有效
  valid_until: string | null;
  redeemed_by_user_id: number | null;
  redeemed_at: string | null;
  note: string;
  created_by: number | null;
  created_at: string;
}

export interface VipCodeParams {
  status?: string; // ''|'unredeemed'|'redeemed'
  tier?: string;
  redeemer?: string; // 兑换人:ID/用户名/邮箱/手机号
  page?: number;
  page_size?: number;
}

export interface GenerateCodesReq {
  count: number;
  grant_kind?: string; // tier(默认) | credit
  tier?: string; // tier 码: pro | max
  grant_days?: number;
  grant_credits?: number; // credit 码
  credit_kind?: string; // temp | perm
  credit_validity_days?: number;
  max_uses?: number; // 可兑换次数(默认 1, 最多 100)
  valid_days?: number; // 码有效期窗口天数(默认 7, 最长 30)
  note?: string;
}

export function useVipCodes(params: VipCodeParams) {
  return useQuery({
    queryKey: ['admin', 'vip-codes', params],
    queryFn: async () => {
      const r = await http.get<{ data: { codes: VipCode[]; total: number } }>('/admin/vip-codes', { params });
      return { codes: r.data.data.codes ?? [], total: r.data.data.total ?? 0 };
    },
  });
}

export function useGenerateVipCodes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: GenerateCodesReq) =>
      (await http.post<{ data: { codes: string[]; count: number } }>('/admin/vip-codes', data)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'vip-codes'] }),
  });
}

/** 停用 / 恢复一个兑换码(停用后不可再兑,已兑换用户不受影响)。 */
export function useSetVipCodeStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, revoked }: { id: number; revoked: boolean }) =>
      (await http.put(`/admin/vip-codes/${id}/status`, { revoked })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'vip-codes'] }),
  });
}
