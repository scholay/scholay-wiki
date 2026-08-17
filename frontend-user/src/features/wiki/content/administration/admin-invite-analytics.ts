import type { WikiArticle } from "../../types";

export const AdminInviteAnalyticsArticle: WikiArticle = {
  slug: "admin-invite-analytics",
  title: "邀请关系与转化分析",
  summary: "只读追踪邀请打开、注册、奖励、首单返利和退款冲销。",
  category: "administration",
  kind: "page",
  status: "current",
  audience: ["运营人员", "管理员", "财务运营"],
  aliases: ["邀请分析", "邀请转化", "Invite Analytics"],
  sourcePaths: [
    "frontend-user/src/features/admin/pages/InvitesPage.tsx",
    "frontend-user/src/features/admin/api/invites.ts",
    "backend/internal/invite/campaign_bind.go",
    "backend/internal/invite/model.go",
    "backend/internal/invite/handler.go",
  ],
  related: ["invite-campaign", "admin-campaigns-promo"],
  sections: [
    {
      id: "metrics",
      title: "关系与指标",
      markdown: `进入邀请分析后，可以查看打开、注册、奖励和转化 KPI，再从列表打开单条关系，核对来源、绑定方式、双方注册奖励、首个已支付订单返利，以及退款后的冲销和余额不足缺口。下图展示的是指标与关系列表同时有数据的状态。

该页面要求 analytics.view，只用于分析，不负责修改活动配置。`,
      embeds: [{ id: "admin-invite-analytics" }],
    },
    {
      id: "snapshots",
      title: "历史快照",
      markdown: `邀请关系创建时会保存当时的活动规则快照，后续调整全局活动不应反向改写既有关系的历史口径。分析异常时要同时查看关系快照、订单履约与退款事件，而不能只拿当前活动配置推断过去应发金额。`,
    },
  ],
};
