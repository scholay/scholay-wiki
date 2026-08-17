import type { WikiArticle } from "../../types";

export const AdminSiteAnalyticsArticle: WikiArticle = {
  slug: "admin-site-analytics",
  title: "网站与爬虫分析",
  summary: "组合 Umami 站点指标与独立爬虫访问统计的分析页面。",
  category: "administration",
  kind: "page",
  status: "current",
  audience: ["运营人员", "管理员", "SEO 人员"],
  aliases: ["网站分析", "Umami", "爬虫统计"],
  sourcePaths: [
    "frontend-user/src/features/admin/pages/AnalyticsPage.tsx",
    "frontend-user/src/features/admin/api/analytics.ts",
    "backend/internal/umami/handler.go",
    "backend/internal/umami/client.go",
    "backend/internal/umami/crawler.go",
  ],
  related: ["admin-dashboard", "admin-feature-usage"],
  sections: [
    {
      id: "umami",
      title: "站点指标",
      markdown: `配置 Umami website ID 后，站点分析页会显示访客、会话、页面浏览、跳出率、平均时长与实时活跃，并可继续查看日趋势和页面、来源、国家、浏览器、系统、设备排行。下方前 3 张图依次展示分析总览、趋势和维度排行；第 4 张图是尚未配置 Umami 时的设置空态。

未配置时 API 返回 configured: false，这不表示访问量为零，也不应被当作统计服务故障。`,
      embeds: [
        { id: "admin-site-analytics" },
        {
          id: "admin-site-analytics-trend",
          caption: "站点 KPI 与 PV、Session 日趋势",
        },
        {
          id: "admin-site-analytics-dimensions",
          caption: "页面、来源、国家、浏览器、系统与设备排行",
        },
        { id: "admin-analytics-setup", caption: "未配置 Umami 时的空态" },
      ],
    },
    {
      id: "crawlers",
      title: "爬虫统计",
      markdown: `爬虫监控独立于 Umami，可查看 24 小时、7 天或 30 天范围内的搜索引擎、趋势和热门页面。页面区分真实空数据与请求失败；分析 SEO 时应同时标注时间窗，避免拿不同范围的总数直接比较。`,
    },
  ],
};
