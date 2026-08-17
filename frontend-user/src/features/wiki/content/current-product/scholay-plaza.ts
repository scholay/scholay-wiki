import type { WikiArticle } from "../../types";

export const ScholayPlazaArticle: WikiArticle = {
  slug: "scholay-plaza",
  title: "scholay广场",
  summary:
    "从统一 Hub 进入学术工具、学术skills 和学术prompts，并与学术搜索中的数据集及情报入口衔接。",
  category: "knowledge",
  kind: "overview",
  status: "current",
  audience: ["所有访客", "研究者", "技能作者"],
  aliases: ["Scholay Plaza", "广场", "旧版功能广场", "旧版科研能力广场"],
  sourcePaths: [
    "frontend-user/src/features/tools/routes.tsx",
    "frontend-user/src/features/tools/pages/ToolsHubPage.tsx",
    "frontend-user/src/features/tools/pages/ToolsLayout.tsx",
    "frontend-user/src/features/tools/pages/ToolsCatalogPage.tsx",
    "frontend-user/src/features/tools/pages/ToolsDatasetsPage.tsx",
    "frontend-user/src/features/tools/pages/ToolsSkillsPage.tsx",
    "frontend-user/src/features/tools/pages/ToolsNewsPage.tsx",
    "frontend-user/src/features/tools/pages/ToolsPromptsPage.tsx",
    "frontend-user/src/features/tools/components/PlazaSegmentTabs.tsx",
    "frontend-user/src/app/menus.ts",
    "frontend-user/src/app/layouts/app-sidebar-records.ts",
  ],
  related: [
    "feature-tools",
    "community-skills",
    "datasets-search",
    "academic-prompts",
  ],
  sections: [
    {
      id: "map",
      title: "Hub 与子页",
      markdown: `\`/tools\` 是 scholay广场一级 Hub。侧栏在广场下直接列出 **学术工具、学术skills、学术prompts**；广场路由本身还承载数据集搜索和 scholay 情报。产品导航把后两者放进“学术搜索”二级树，因为它们首先承担检索与发现任务，而不是因为它们离开了广场路由壳。`,
      embeds: [{ id: "scholay-plaza-hub" }],
      table: {
        columns: [
          { key: "entry", header: "入口" },
          { key: "route", header: "路由" },
          { key: "purpose", header: "用途" },
          { key: "status", header: "状态" },
        ],
        rows: [
          {
            entry: "学术工具",
            route: "/tools/catalog",
            purpose: "搜索、筛选并打开外部科研工具详情",
            status: "现行",
          },
          {
            entry: "数据集搜索",
            route: "/tools/datasets",
            purpose: "按名称、领域和用途发现公开数据集",
            status: "产品演示",
          },
          {
            entry: "学术skills",
            route: "/tools/skills",
            purpose: "浏览社区技能并进入创建、安装流程",
            status: "现行",
          },
          {
            entry: "scholay 情报",
            route: "/tools/news",
            purpose: "搜索和浏览头条、快讯与学科动态",
            status: "现行信息流",
          },
          {
            entry: "学术prompts",
            route: "/tools/prompts",
            purpose: "按科研场景浏览可复用提示词",
            status: "产品演示",
          },
        ],
      },
    },
    {
      id: "naming",
      title: "与旧入口的关系",
      markdown: `旧版“功能广场”词条仍可用于理解外部科研工具目录及其运营规则；现行一级产品入口统一叫“scholay广场”，范围已经扩展到 tools、skills 和 prompts。旧版“科研能力广场”也不再是顶栏名称。写入口说明时，应使用现行名称并把旧名只保留为搜索别名或历史语境。`,
    },
  ],
};
