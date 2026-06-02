// 会员兑换码 —— admin hooks。字段对齐 backend/internal/vip (RedemptionCode / handler)。
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';

export interface VipCode {
  id: number;
  code: string;
  grant_tier: string;
  grant_days: number;
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
  page?: number;
  page_size?: number;
}

export interface GenerateCodesReq {
  count: number;
  tier: string;
  grant_days: number;
  valid_until?: string; // YYYY-MM-DD;空=永久
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
