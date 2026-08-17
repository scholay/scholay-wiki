import type { WikiArticle } from "../../types";

export const AdminFeatureUsageArticle: WikiArticle = {
  slug: "admin-feature-usage",
  title: "功能使用统计",
  summary: "基于 usage_events v2 观察登录与匿名用户的功能使用和审核漏斗。",
  category: "administration",
  kind: "page",
  status: "current",
  audience: ["产品运营", "管理员", "开发者"],
  aliases: ["Usage Stats", "功能事件", "Peer Review 漏斗"],
  sourcePaths: [
    "frontend-user/src/features/admin/pages/UsageStatsPage.tsx",
    "frontend-user/src/features/admin/api/usage-stats.ts",
    "backend/internal/usagestat/model.go",
    "backend/internal/usagestat/repository.go",
    "backend/internal/usagestat/service.go",
  ],
  related: ["admin-site-analytics", "peer-review"],
  sections: [
    {
      id: "events",
      title: "事件口径",
      markdown: `功能使用页会先汇总总量、今日量、登录用户和匿名访客，再按日期与功能查看趋势；下图依次展示功能总览和每日事件趋势。筛选或对比时应保持同一时间范围与用户口径。

当前读取的是 usage_events v2。旧 usage_logs 表不再进入这套统计，历史查询或临时报表不能把两种口径直接相加。`,
      embeds: [
        { id: "admin-feature-usage" },
        {
          id: "admin-feature-usage-trend",
          caption: "登录用户、匿名访客与每日功能事件趋势",
        },
      ],
    },
    {
      id: "funnel",
      title: "Peer Review 五步漏斗",
      markdown: `Peer Review 的五步漏斗描述站内事件推进，例如进入、上传、配置、启动和完成；它衡量产品流程而不是外部期刊审稿或论文发表是否成功。事件漏记会影响漏斗，因此趋势异常需要结合客户端埋点版本核查。`,
    },
  ],
};
