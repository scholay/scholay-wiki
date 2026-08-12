// 邀请监控(后台)—— mirrors backend/internal/invite(契约冻结,三方共同遵守)。
// 数据真源:邀请码 get-or-create(/user/invite)+ 落地页打开计数(/invite/open)
// + 注册归因(新用户创建成功时消费 X-Invite-Code 请求头)。
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';

/** GET /admin/invites/summary —— 全站邀请 KPI。 */
export interface InviteSummary {
  inviter_count: number; // 生成过邀请码的用户数
  total_opens: number; // 邀请链接总打开次数
  total_registrations: number; // 经邀请成功注册总数
  registrations_7d: number; // 近 7 天经邀请注册数
  /**
   * 全站累计发放的邀请奖励经费。刻度「经费 = 分」—— 100 经费 = ¥1。
   * 🔴 展示时必须折算成 ¥ 做主数字:1,250,000 经费 = ¥12,500,裸数字会被读成 125 万元。
   */
  total_reward_credits: number;
}

/** GET /admin/invites 列表行 —— 一个邀请人一行(邀请码与用户 1:1)。 */
export interface InviteListItem {
  user_id: number;
  email: string;
  name: string;
  code: string;
  created_at: string; // 「生成邀请」时刻
  open_count: number;
  registered_count: number;
  reward_credits: number; // 该邀请人累计已获的邀请奖励经费(经费=分,100 = ¥1)
}

/**
 * ⚠️ 后端**没有** sort_by / sort_order —— 列表恒按后端默认序返回。
 * 所以列表页的四个数字列**不能挂 DataTable 的 sortKey**:那是客户端排序,只重排当前页 20 行,
 * 而这是服务端分页,点「成功注册」得到的"排行榜"结论是错的。要真排序先在后端补白名单,
 * 前端再改用 DataTable.serverSort。
 */
export interface InviteListParams {
  page?: number;
  page_size?: number;
  keyword?: string; // 邀请人邮箱 / 名称 / 邀请码
}

/** GET /admin/invites/:id/registrations 列表行 —— 该邀请人带来的注册用户。 */
export interface InviteRegistration {
  invited_user_id: number;
  email: string;
  name: string;
  method: string; // 注册方式(email / phone / github / wechat ...)
  source: string; // legacy | link | manual
  bound_at: string;
  inviter_registration_credits: number;
  invitee_registration_credits: number;
  first_purchase_paid_cents: number;
  first_purchase_rebate_credits: number;
  first_purchase_reversed_credits: number;
  first_purchase_reversal_shortfall: number;
  first_purchase_order_no: string;
  first_purchase_paid_at: string | null;
  created_at: string;
}

/** 邀请 KPI(生成人数 / 总打开 / 总注册 / 近 7 天注册)。 */
export function useInviteSummary() {
  return useQuery({
    queryKey: ['admin', 'invites', 'summary'],
    queryFn: async () =>
      (await http.get<{ data: InviteSummary }>('/admin/invites/summary')).data.data,
    staleTime: 30_000,
  });
}

/** 邀请人分页列表(keyword 搜邮箱 / 名称 / 邀请码)。 */
export function useInviteList(params: InviteListParams) {
  return useQuery({
    queryKey: ['admin', 'invites', 'list', params],
    // 分页参数在 key 里,翻页保留上一页数据,避免列表塌空闪白(2026-08-12 审计)。
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const r = await http.get<{ data: { items: InviteListItem[]; total: number } }>(
        '/admin/invites',
        { params },
      );
      return { items: r.data.data.items ?? [], total: r.data.data.total ?? 0 };
    },
  });
}

/** 某邀请人的被邀清单(懒加载:inviterId 为空时不发请求 —— 抽屉打开才拉)。 */
export function useInviteRegistrations(
  inviterId: number | undefined,
  params: { page?: number; page_size?: number },
) {
  return useQuery({
    queryKey: ['admin', 'invites', 'registrations', inviterId, params],
    // 分页参数在 key 里,翻页保留上一页数据,避免列表塌空闪白(2026-08-12 审计)。
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const r = await http.get<{ data: { items: InviteRegistration[]; total: number } }>(
        `/admin/invites/${inviterId}/registrations`,
        { params },
      );
      return { items: r.data.data.items ?? [], total: r.data.data.total ?? 0 };
    },
    enabled: inviterId != null,
  });
}

/** 注册方式展示名(未知值回落原字符串)—— 口径与 UserCell 的 PROVIDER_LABEL 一致。 */
export const INVITE_METHOD_LABEL: Record<string, string> = {
  email: '邮箱',
  password: '邮箱',
  phone: '手机号',
  github: 'GitHub',
  google: 'Google',
  wechat: '微信',
  apple: 'Apple',
  orcid: 'ORCID',
  microsoft: 'Microsoft',
  discourse: '论坛',
};

export const INVITE_SOURCE_LABEL: Record<string, string> = {
  legacy: '历史自动归因',
  link: '注册链接归因',
  manual: '注册后主动确认',
};
