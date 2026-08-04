// 会员兑换码 —— admin hooks。字段对齐 backend/internal/vip (RedemptionCode / handler)。
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';

export interface VipCode {
  id: number;
  code: string;
  grant_kind: string; // tier | credit
  grant_tier: string; // free | pro | max —— 展示一律走 Free/Pro/Max 大写标签,不直出裸小写
  /** 授予**数量**(字段名是历史遗留,不再等于「天数」);单位看 grant_unit */
  grant_days: number;
  /** day | month | year(0110 起)。存量码是空串 = day,渲染前一律过 normGrantUnit */
  grant_unit: string;
  grant_credits: number; // credit 码发放的经费。刻度「经费 = 分」(100 经费 = ¥1)
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
  /** 后端 ListCodes 是 `grant_tier = ?` 精确匹配。实际只会生成 pro / max 两种会员码 —— 不要给 free 选项(恒 0 条)。 */
  tier?: string;
  redeemer?: string; // 兑换人:ID/用户名/邮箱/手机号
  page?: number;
  page_size?: number;
}

export interface GenerateCodesReq {
  count: number;
  grant_kind?: string; // tier(默认) | credit
  tier?: string; // tier 码: pro | max
  grant_days?: number; // 授予**数量**,单位由 grant_unit 决定
  grant_unit?: string; // day | month | year;不传 = day(老客户端行为不变)
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

/** 续期:把兑换码有效期顺延 days 天(已过期的从现在起算)。返回更新后的码。 */
export function useExtendVipCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, days }: { id: number; days: number }) =>
      (await http.put<{ data: VipCode }>(`/admin/vip-codes/${id}/extend`, { days })).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'vip-codes'] }),
  });
}

/** 加次数:把兑换码可兑换总次数 max_uses 增加 add(已用完的码加完即可再兑)。返回更新后的码。 */
export function useIncreaseVipCodeUses() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, add }: { id: number; add: number }) =>
      (await http.put<{ data: VipCode }>(`/admin/vip-codes/${id}/max-uses`, { add })).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'vip-codes'] }),
  });
}

/**
 * 改会员时长:覆盖会员(tier)码授予的 grant_days + grant_unit。只影响【之后的兑换】——
 * 兑换时后端实时读该码的两列,已兑换用户的会员到期已落定、不受影响。返回更新后的码。
 *
 * 🔴 `unit` 必传,哪怕就是 'day'。后端 SetCodeGrantDays 一次写两列:
 * 一张 grant_unit='month' 的码,管理员想把它改成 7 天而只传 days=7 时,
 * 单位仍是 month → 实际发 7 个月。这是最容易发生的静默放大,所以类型上不给可选。
 */
export function useSetVipCodeGrantDays() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, days, unit }: { id: number; days: number; unit: string }) =>
      (await http.put<{ data: VipCode }>(`/admin/vip-codes/${id}/grant-days`, { days, unit })).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'vip-codes'] }),
  });
}
