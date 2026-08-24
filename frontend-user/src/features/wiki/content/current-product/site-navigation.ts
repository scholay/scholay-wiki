import type { WikiArticle } from "../../types";

export const SiteNavigationArticle: WikiArticle = {
  slug: "site-navigation",
  title: "全站导航与功能树",
  summary:
    "说明顶栏六个一级功能、左侧功能栏的二级入口，以及下半区怎样随当前功能切换历史记录。",
  category: "getting-started",
  kind: "page",
  status: "current",
  audience: ["所有访客", "登录用户", "支持人员"],
  aliases: ["顶栏六功能", "AppSidebar", "左侧功能树", "全站功能菜单"],
  sourcePaths: [
    "frontend-user/src/app/menus.ts",
    "frontend-user/src/app/layouts/AppSidebar.tsx",
    "frontend-user/src/app/layouts/app-sidebar-records.ts",
    "frontend-user/src/app/layouts/app-sidebar-history.tsx",
    "frontend-user/src/app/layouts/app-sidebar-library-history.tsx",
  ],
  related: ["product-map", "academic-search", "my-resources", "scholay-plaza"],
  sections: [
    {
      id: "top-level",
      title: "顶栏六个一级功能",
      markdown: `全站功能菜单以六个一级功能为准：**学术搜索、智能助手、智能写作、智能审稿、我的资源、scholay广场**。

学术搜索聚合论文、期刊库、数据集与 scholay 情报入口。我的资源承接个人收藏与过程产物。scholay广场承接学术工具、学术skills 与学术prompts。

论文、作者、期刊和 PDF 详情属于“浏览器”工作区。“浏览器”会作为当前页面名称和快速打开入口出现，但不是第七个一级功能。旧版把“文献搜索”“期刊搜索”“文件夹”分别放在顶栏的资料，只能用于理解历史入口，不能当作现行菜单。`,
    },
    {
      id: "feature-tree",
      title: "左侧功能栏的二级功能树",
      markdown: `左侧功能栏上半区先列六个一级功能。进入某个功能后，再展开该功能的二级入口。指针离开上半区时，侧栏会折叠为智能助手、当前一级和当前二级；悬停或聚焦后重新展开完整树。除智能助手外，一级功能可以置顶。`,
      embeds: [{ id: "site-navigation-tree" }],
      table: {
        columns: [
          { key: "feature", header: "一级功能" },
          { key: "children", header: "二级入口" },
          { key: "note", header: "当前边界" },
        ],
        rows: [
          {
            feature: "学术搜索",
            children:
              "智能搜论文 / 论文库搜索 / 期刊库搜索 / 数据集搜索 / scholay 情报 / scholay 选刊",
            note: "scholay 选刊显示“敬请期待”，不能当作已开放工作区",
          },
          {
            feature: "智能助手",
            children: "无二级入口",
            note: "直接进入新对话或既有会话",
          },
          {
            feature: "智能写作",
            children: "高级写作 / 快速写作",
            note: "快速写作显示“敬请期待”",
          },
          {
            feature: "智能审稿",
            children: "期刊论文 / 学位论文 / 会议论文 / 其他",
            note: "会议论文显示“敬请期待”",
          },
          {
            feature: "我的资源",
            children: "文献集 / 期刊集 / 稿件集 / 资源集",
            note: "四项由 section 查询参数区分",
          },
          {
            feature: "scholay广场",
            children: "学术工具 / 学术skills / 学术prompts",
            note: "数据集搜索与 scholay 情报归入学术搜索树",
          },
        ],
      },
    },
    {
      id: "history",
      title: "下半区随功能切换",
      markdown: `侧栏下半区不是一份固定“最近访问”列表。智能搜论文和智能助手显示各自会话；智能写作显示项目；智能审稿显示审稿记录；我的资源按当前 section 显示对应文件夹。首页、论文库搜索、期刊库搜索以及 scholay广场各入口当前不显示这段历史。切换一级或二级功能时，应按当前上下文理解下半区内容，不能把不同功能的记录混为一类。`,
    },
  ],
};
