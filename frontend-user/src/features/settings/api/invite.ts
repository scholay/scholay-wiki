// 邀请好友 —— 用户端 hook。mirrors backend/internal/invite(GET /api/v1/user/invite,登录态)。
import { useQuery } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';
import { authSessionKey } from '@/shared/lib/auth-token';
import { useAuthStore } from '@/stores/auth.store';

// 设置页保留旧导出名，全站邀请弹窗与设置页共用 shared 查询真源。
export {
  useUserInvite as useInvite,
  type UserInvite,
} from '@/shared/api/user-invite';

/**
 * mirrors backend/internal/invite UserRegistrationRow(GET /user/invite/registrations)。
 * name 是**后端脱敏后的展示名**(al***@gmail.com / 张** / 用户***)——
 * 原始邮箱/用户名/用户 ID 后端一概不下发,前端没有明文可泄。
 */
export interface InvitedUser {
  name: string;
  method: string;
  /** 归因来源：legacy | link | manual。 */
  source?: string;
  /** 该次邀请给你发放的奖励经费(0100);0=未计奖励(活动关闭期注册/达当日上限)。
   *  只对 >0 渲染「+N 经费」,0 不渲染负面态(业界惯例:防滥用结果不在主界面渲染成惩罚感)。 */
  rewarded_credits: number;
  /** 本次发给查看者（邀请人）的注册礼。 */
  inviter_registration_credits?: number;
  /** 被邀请用户首单触发后发给查看者的返利。 */
  first_purchase_rebate_credits?: number;
  first_purchase_paid_at?: string | null;
  bound_at?: string;
  created_at: string;
}

/** 注册方式 → 中文(后端 method 枚举:9 条注册路径)。 */
export const INVITE_METHOD_LABEL: Record<string, string> = {
  email: '邮箱',
  phone: '手机',
  github: 'GitHub',
  google: 'Google',
  apple: 'Apple',
  microsoft: 'Microsoft',
  discourse: 'Discourse',
  orcid: 'ORCID',
  wechat: '微信',
  oauth_merge: '第三方',
};

export const INVITE_SOURCE_LABEL: Record<string, string> = {
  legacy: '历史归因',
  link: '注册链接',
  manual: '主动确认',
};

export function useInvitedUsers(page: number, pageSize = 10, enabled = true) {
  const token = useAuthStore((state) => state.token);
  const sessionKey = authSessionKey(token);
  return useQuery({
    queryKey: [
      'settings',
      'invite',
      'registrations',
      sessionKey,
      page,
      pageSize,
    ],
    queryFn: async () =>
      (
        await http.get<{ data: { items: InvitedUser[]; total: number } }>(
          '/user/invite/registrations',
          { params: { page, page_size: pageSize } }
        )
      ).data.data,
    staleTime: 30_000,
    // 同一账号翻页时保留上一页；换号必须立即清空，不得把 A 的邀请名单当 B 的 placeholder。
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey[3] === sessionKey ? previousData : undefined,
    enabled: enabled && !!token,
  });
}
