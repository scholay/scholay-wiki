import type { WikiArticle } from "../../types";

export const AdminDashboardArticle: WikiArticle = {
  slug: "admin-dashboard",
  title: "后台总览",
  summary: "汇总用户、营收、订单、会员、AI 成本与运行告警的管理驾驶舱。",
  category: "administration",
  kind: "page",
  status: "current",
  audience: ["管理员", "运营人员"],
  aliases: ["Dashboard", "管理驾驶舱", "今日检查"],
  sourcePaths: [
    "frontend-user/src/features/admin/pages/DashboardPage.tsx",
    "frontend-user/src/features/admin/components/TodayPanel.tsx",
    "frontend-user/src/features/admin/hooks/useAdminAlerts.ts",
    "backend/internal/admin/dashboard_service.go",
  ],
  related: ["admin-console", "admin-site-analytics", "admin-token-cost"],
  sections: [
    {
      id: "metrics",
      title: "核心指标",
      markdown: `进入后台总览后，你会先看到用户、净收入、订单、会员、AI 成本和兑换码核销等汇总，再通过趋势卡比较最近 30 天与上一周期。下图依次展示总览页面和关键指标趋势卡。

汇总结果会缓存 30 秒，页面也会标明数据更新时间；这里适合日常巡视，不是逐笔实时账本。`,
      embeds: [
        { id: "admin-dashboard" },
        {
          id: "admin-dashboard-trend-cards",
          caption: "关键指标与上一周期的趋势对比",
        },
      ],
    },
    {
      id: "checks",
      title: "今日检查与降级",
      markdown: `“今日检查”会把待处理反馈、草稿消息、第三方账号健康、维护模式和支付渠道分成正常、降级或阻断事项；下图展示的是三种结果并列时的代表状态。点击事项后再进入对应后台页面处理。

只有支付宝和微信支付都不可用时才形成支付告警。检查请求失败会标为降级；operations 因没有 config.manage 权限而读取配置失败时，不会被误报为系统故障。`,
      embeds: [
        {
          id: "admin-dashboard-today-panel",
          caption: "正常、降级与阻断事项并列的今日待办",
        },
      ],
    },
  ],
};
