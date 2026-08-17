import type { WikiArticle } from "../../types";

export const AdminUserDirectoryArticle: WikiArticle = {
  slug: "admin-user-directory",
  title: "用户查询与详情",
  summary: "用于检索账号、查看身份与聚合业务信息的后台用户目录。",
  category: "administration",
  kind: "page",
  status: "current",
  audience: ["管理员", "客服", "运营人员"],
  aliases: ["用户管理", "用户详情", "账号检索"],
  sourcePaths: [
    "frontend-user/src/features/admin/pages/UsersPage.tsx",
    "frontend-user/src/features/admin/components/UserDetailDrawer.tsx",
    "frontend-user/src/features/admin/components/UserMetricsPanel.tsx",
    "frontend-user/src/features/admin/components/UserUsageOverviewPanel.tsx",
    "backend/internal/user/admin_user_detail.go",
  ],
  related: ["admin-user-lifecycle", "admin-user-entitlement-grants"],
  sections: [
    {
      id: "search",
      title: "查询范围",
      markdown: `进入用户目录后，可以按用户 ID、用户名、邮箱或手机号搜索，再用角色、会员档位、状态、邮箱验证和注册日期筛选、排序；页面还提供注册、活跃、来源与活跃时段指标。下图依次展示用户列表和用户指标面板。

列表每页固定 20 条。批量动作只会处理当前明确选中的记录，不会自动覆盖整个搜索结果。`,
      embeds: [
        { id: "admin-user-directory" },
        {
          id: "admin-user-metrics",
          caption: "注册、活跃、来源与活跃时段分析",
        },
      ],
    },
    {
      id: "detail",
      title: "聚合详情",
      markdown: `点击用户行会打开详情抽屉，再分别查看身份与 OAuth 连接、登录与 IP、会员、额度、额度重置次数、功能使用、AI 算力、订单、经费流水和兑换记录。下方三张图依次展示聚合详情、单用户用量，以及订单与资产历史。

这些面板分别加载数据；某一个统计请求失败时，应按面板提示排查，不能据此判断账号不存在。`,
      embeds: [
        {
          id: "admin-user-detail-drawer",
          caption: "用户身份、状态与资产的聚合抽屉",
        },
        {
          id: "admin-user-token-usage",
          caption: "单用户功能事件与 AI 算力概况",
        },
        {
          id: "admin-user-billing-history",
          caption: "订单、经费流水与兑换记录",
        },
      ],
    },
  ],
};
