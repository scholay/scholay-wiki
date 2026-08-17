import type { WikiArticle } from "../../types";

export const DatasetsSearchArticle: WikiArticle = {
  slug: "datasets-search",
  title: "数据集搜索",
  summary:
    "在学术搜索与 scholay广场共用的页面中，按名称、领域、用途和标签发现公开科研数据集。",
  category: "discovery",
  kind: "page",
  status: "experimental",
  audience: ["研究者", "学生", "数据分析用户"],
  aliases: ["科研数据集", "Dataset Search", "公开数据导航"],
  sourcePaths: [
    "frontend-user/src/features/tools/pages/ToolsDatasetsPage.tsx",
    "frontend-user/src/features/tools/components/DatasetDetailContent.tsx",
    "frontend-user/src/features/tools/data/datasets.ts",
    "frontend-user/src/features/tools/routes.tsx",
    "frontend-user/src/app/layouts/app-sidebar-records.ts",
  ],
  related: ["academic-search", "scholay-plaza", "research-data-analysis"],
  sections: [
    {
      id: "experimental",
      title: "产品演示阶段",
      markdown: `该能力处于产品演示阶段。\`/tools/datasets\` 路由和检索界面已经可达，但数据来自前端静态表，不是后端数据集索引；当前结果数量、条目范围和详情不能视为生产库覆盖承诺。`,
    },
    {
      id: "search",
      title: "搜索与详情",
      markdown: `空查询时页面先显示居中的“数据集搜索”入口；提交关键词后，会在名称、领域、一句话说明和标签中匹配。结果行展示领域、许可、标签和简介，点击后在右侧拓展区打开详情；“访问官网”会直接前往外部站点。外部数据集的许可、版本、可用性与敏感数据限制仍应在来源站核对。`,
    },
    {
      id: "navigation",
      title: "为什么同时属于搜索与广场",
      markdown: `页面路由位于 scholay广场的 \`/tools\` 壳中，但在 AppSidebar 中列为“学术搜索”的二级入口。这是同一个页面的两种组织视角：广场负责内容容器，学术搜索负责用户任务入口，不代表存在两套数据集库。`,
    },
  ],
};
