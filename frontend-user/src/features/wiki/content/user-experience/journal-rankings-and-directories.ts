import type { WikiArticle } from "../../types";

export const JournalRankingsAndDirectoriesArticle: WikiArticle = {
  slug: "journal-rankings-and-directories",
  title: "期刊榜单与分类目录",
  summary: "通过四个预设质量榜单，以及学科、国家、开放获取和预警目录发现期刊。",
  category: "discovery",
  kind: "feature",
  status: "current",
  audience: ["所有访客", "作者", "研究者"],
  aliases: ["SCI 一区", "中科院一区", "CCF A", "期刊目录"],
  sourcePaths: [
    "frontend-user/src/features/journals/routes.tsx",
    "frontend-user/src/features/journals/pages/JournalHubPage.tsx",
    "frontend-user/src/features/journals/pages/JournalCollectionPage.tsx",
    "frontend-user/src/features/journals/pages/JournalHubBrowsePage.tsx",
    "frontend-user/src/features/journals/pages/JournalHubListPage.tsx",
    "frontend-user/src/features/journals/api/journal-hubs.ts",
  ],
  related: ["journal-search-page", "journal-detail-page"],
  sections: [
    {
      id: "route-boundary",
      title: "先认准发现枢纽地址",
      markdown: `真实期刊发现枢纽位于 \`/journals/browse\`，再通往学科、国家、开放获取和预警列表。一级地址 \`/journals\` 仍会兼容跳转到 \`/search\`；\`/journals/select\` 与 \`/journals/evaluate\` 也同样跳回 \`/search\`，不能据此宣称独立选刊或评估 Hub 已上线。`,
    },
    {
      id: "rankings",
      title: "四个预设榜单",
      markdown: `在期刊目录中可以直接打开四个预设榜单：JCR Q1、中科院 1 区、CCF A，以及影响因子至少 10；下图展示的是这些目录入口及榜单卡片。它们使用与期刊库搜索相同的列表和分页，只是预先选好了条件。`,
      embeds: [{ id: "journal-directory" }],
    },
    {
      id: "directories",
      title: "目录发现",
      markdown: `期刊目录汇总学科分类、国家、开放获取、预警入口和最近更新的期刊。分类、国家和开放获取列表都可以继续翻页；预警页则集中显示需要额外核对的风险信息。目录与榜单只是发现工具，不等于官方评价或投稿推荐。`,
    },
    {
      id: "metric-caution",
      title: "指标口径",
      markdown: `JCR Q1 与中科院 1 区是不同体系，CCF 只覆盖相应计算机目录，影响因子阈值也不等于学科内排名。榜单文案用于解释筛选，不应把某一标签扩写为“适合所有研究者”或“必然录用”。`,
    },
  ],
};
