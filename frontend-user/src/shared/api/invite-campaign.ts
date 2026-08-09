import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authSessionKey } from "@/shared/lib/auth-token";
import { http, toApiError } from "@/shared/lib/http";
import { useAuthStore } from "@/stores/auth.store";

export interface InviteCampaign {
  enabled: boolean;
  inviter_registration_credits: number;
  invitee_registration_credits: number;
  registration_daily_cap: number;
  bind_window_days: number;
  first_purchase_window_days: number;
  first_purchase_rebate_bps: number;
  code_help_url: string;
}

export interface InvitePreview {
  valid: boolean;
  code?: string;
  inviter_name?: string;
  /** 落地页没有 query 缓存时，可用 preview 携带的同源规则校正候选有效期。 */
  campaign?: InviteCampaign;
}

export interface InviteStatus {
  enabled: boolean;
  bound: boolean;
  eligible: boolean;
  code?: string;
  inviter_name?: string;
  source?: string;
  bound_at?: string;
  /** 已实际入账给当前受邀用户的注册礼；关系已建立不等于必然到账。 */
  invitee_rewarded_credits?: number;
  bind_deadline?: string;
  reason?: string;
  campaign?: InviteCampaign;
}

export interface InviteBindRewards {
  inviter_registration_credits?: number;
  invitee_registration_credits?: number;
  first_purchase_rebate_bps?: number;
  first_purchase_window_days?: number;
}

export interface InviteBindResult {
  status: InviteStatus;
  rewards?: InviteBindRewards;
}

const INVITE_REASON_LABEL: Record<string, string> = {
  already_bound: "你已经关联过邀请人",
  window_expired: "邀请码关联期已过",
  not_eligible: "当前账号不符合关联条件",
  campaign_disabled: "邀请活动尚未开启",
  self_invite: "不能关联自己的邀请码",
  invalid_code: "邀请码无效或已过期",
  not_new_user: "仅新注册账号可关联邀请人",
};

export function inviteReasonText(
  reason?: string,
  fallback = "当前账号暂不能关联邀请人。",
): string {
  if (!reason) return fallback;
  return INVITE_REASON_LABEL[reason] ?? fallback;
}

export const INVITE_CAMPAIGN_QUERY_KEY = ["invite", "campaign"] as const;
export const INVITE_STATUS_QUERY_KEY = ["invite", "status"] as const;

export function useInviteCampaign() {
  return useQuery({
    queryKey: INVITE_CAMPAIGN_QUERY_KEY,
    queryFn: async () =>
      (await http.get<{ data: InviteCampaign }>("/invite/campaign")).data.data,
    staleTime: 60_000,
    // App Controller / 顶栏常驻，需持续跟随后台总开关；隐藏标签页不轮询。
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    retry: 1,
  });
}

export async function previewInviteCode(raw: string): Promise<InvitePreview> {
  const code = raw.trim().toUpperCase();
  try {
    return (
      await http.post<{ data: InvitePreview }>("/invite/preview", { code })
    ).data.data;
  } catch (err) {
    throw toApiError(err);
  }
}

export function useInvitePreview() {
  return useMutation({ mutationFn: previewInviteCode });
}

export function useInviteStatus(enabled = true) {
  const token = useAuthStore((state) => state.token);
  return useQuery({
    queryKey: [...INVITE_STATUS_QUERY_KEY, authSessionKey(token)],
    queryFn: async () =>
      (await http.get<{ data: InviteStatus }>("/user/invite/status")).data.data,
    enabled: enabled && !!token,
    staleTime: 30_000,
    retry: 1,
  });
}

function normalizeBindResult(
  payload:
    | InviteStatus
    | (Partial<InviteStatus> & {
        status?: InviteStatus;
        rewards?: InviteBindRewards;
      }),
): InviteBindResult {
  if ("status" in payload && payload.status) {
    return { status: payload.status, rewards: payload.rewards };
  }
  return {
    status: payload as InviteStatus,
    rewards: "rewards" in payload ? payload.rewards : undefined,
  };
}

export async function bindInviteCode(code: string): Promise<InviteBindResult> {
  try {
    const response = await http.post<{
      data:
        | InviteStatus
        | (Partial<InviteStatus> & {
            status?: InviteStatus;
            rewards?: InviteBindRewards;
          });
    }>("/user/invite/bind", {
      code: code.trim().toUpperCase(),
    });
    return normalizeBindResult(response.data.data);
  } catch (err) {
    throw toApiError(err);
  }
}

export function useBindInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: bindInviteCode,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: INVITE_STATUS_QUERY_KEY });
      void qc.invalidateQueries({ queryKey: ["settings", "invite"] });
      // 关联可能同步发放受邀用户注册礼，余额与经费流水必须立即刷新。
      void qc.invalidateQueries({ queryKey: ["settings", "billing"] });
      void qc.invalidateQueries({ queryKey: ["settings", "billing", "txns"] });
    },
  });
}

export function inviteRegistrationSummary(campaign: InviteCampaign): string {
  const parts: string[] = [];
  if (campaign.inviter_registration_credits > 0) {
    parts.push(`邀请人获得 ${campaign.inviter_registration_credits} 经费`);
  }
  if (campaign.invitee_registration_credits > 0) {
    parts.push(`受邀新用户获得 ${campaign.invitee_registration_credits} 经费`);
  }
  return parts.join("、");
}

export function invitePurchaseSummary(campaign: InviteCampaign): string {
  if (campaign.first_purchase_rebate_bps <= 0) return "";
  const percent = campaign.first_purchase_rebate_bps / 100;
  return `受邀用户在 ${campaign.first_purchase_window_days} 天内完成首笔付费，邀请人再获订单金额 ${percent.toLocaleString()}% 的等值经费`;
}
