import type { WikiArticle } from "../../types";

export const PaperSearchSourcesArticle: WikiArticle = {
  slug: "paper-search-sources",
  title: "论文检索数据源",
  summary: "理解综合、Graph、Discovery 与 Medicine 的覆盖范围和能力差异。",
  category: "discovery",
  kind: "feature",
  status: "current",
  audience: ["访客", "研究者", "学生"],
  aliases: ["搜索源", "综合搜索", "Graph", "Discovery", "Medicine"],
  sourcePaths: [
    "frontend-user/src/features/search/api/papers.ts",
    "frontend-user/src/features/search/components/SearchSidebar.tsx",
    "frontend-user/src/shared/lib/search-filters.ts",
    "frontend-user/src/shared/lib/source.ts",
  ],
  related: ["academic-search", "paper-search-filters-and-pages", "paper"],
  sections: [
    {
      id: "choices",
      title: "四种选择",
      markdown: `打开论文库搜索的筛选面板，可以在“综合、Graph、Discovery、Medicine”之间选择论文来源；下图展示的是来源和其他筛选条件展开后的状态。“综合”会从多个来源中选择可用结果，其他三项只检索对应来源。`,
      embeds: [{ id: "classic-search-filters" }],
    },
    {
      id: "differences",
      title: "能力并不完全相同",
      markdown: `Graph 偏向 AI 引文图谱学术发现，目前只提供有效的相关度排序；Discovery 覆盖全学科开放发现，支持引用量和日期排序，但学科筛选只取一个概念；Medicine 面向生物医学，主要支持查询、时间、期刊或会议名及相关度/日期排序，不支持页面中的学科、文献类型、OA 和最低引用筛选。`,
    },
    {
      id: "normalization",
      title: "统一展示与来源标识",
      markdown: `不同来源的论文会以统一的卡片和详情样式展示，但题名、摘要、作者标识、引用数和全文线索仍可能不完整。页面会一直保留来源名称，避免把不同数据库中编号相同的记录误认为同一篇论文。`,
    },
  ],
};
