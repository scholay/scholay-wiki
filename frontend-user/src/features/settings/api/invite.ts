// 邀请好友 —— 用户端 hook。mirrors backend/internal/invite(GET /api/v1/user/invite,登录态)。
import { useQuery } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';

/**
 * mirrors backend/internal/invite 响应(契约冻结):
 * data:{code,url,open_count,registered_count,created_at}
 *
 * get-or-create 语义:首次调用即生成该用户唯一邀请码,created_at 记「生成邀请」时刻。
 */
export interface UserInvite {
  code: string;
  /** 完整邀请链接 = 前端 origin + "/i/" + code,后端拼好,前端直接展示/复制。 */
  url: string;
  /** 链接被打开次数(落地页 POST /invite/open 原子 +1)。 */
  open_count: number;
  /** 经此邀请成功注册的人数。 */
  registered_count: number;
  /** 「生成邀请」时刻(首次调用本接口那次)。 */
  created_at: string;
  /** 当前配置的「每成功邀请 1 人」奖励经费(经费=分);0=活动未开(UI 不提奖励)。 */
  reward_per_invite: number;
  /** 该邀请人累计已获得的邀请奖励经费。 */
  reward_total: number;
}

export function useInvite() {
  return useQuery({
    queryKey: ['settings', 'invite'],
    queryFn: async () => (await http.get<{ data: UserInvite }>('/user/invite')).data.data,
    staleTime: 30_000,
  });
}

/**
 * mirrors backend/internal/invite UserRegistrationRow(GET /user/invite/registrations)。
 * name 是**后端脱敏后的展示名**(al***@gmail.com / 张** / 用户***)——
 * 原始邮箱/用户名/用户 ID 后端一概不下发,前端没有明文可泄。
 */
export interface InvitedUser {
  name: string;
  method: string;
  /** 该次邀请给你发放的奖励经费(0100);0=未计奖励(活动关闭期注册/达当日上限)。
   *  只对 >0 渲染「+N 经费」,0 不渲染负面态(业界惯例:防滥用结果不在主界面渲染成惩罚感)。 */
  rewarded_credits: number;
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

export function useInvitedUsers(page: number, pageSize = 10) {
  return useQuery({
    queryKey: ['settings', 'invite', 'registrations', page, pageSize],
    queryFn: async () =>
      (
        await http.get<{ data: { items: InvitedUser[]; total: number } }>(
          '/user/invite/registrations',
          { params: { page, page_size: pageSize } }
        )
      ).data.data,
    staleTime: 30_000,
    placeholderData: (prev) => prev, // 翻页时保留上一页数据防闪烁
  });
}
