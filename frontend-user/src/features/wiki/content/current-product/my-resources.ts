import type { WikiArticle } from "../../types";

export const MyResourcesArticle: WikiArticle = {
  slug: "my-resources",
  title: "我的资源",
  summary:
    "以文献集、期刊集、稿件集和资源集四个 section 组织个人收藏、稿件与研究过程产物。",
  category: "knowledge",
  kind: "overview",
  status: "current",
  audience: ["登录用户", "研究者", "论文作者"],
  aliases: ["My Resources", "资源中心", "旧版文件夹入口"],
  sourcePaths: [
    "frontend-user/src/features/library/routes.tsx",
    "frontend-user/src/features/library/pages/LibraryPage.tsx",
    "frontend-user/src/features/library/resource-model.ts",
    "frontend-user/src/app/layouts/app-sidebar-records.ts",
    "frontend-user/src/app/layouts/app-sidebar-library-history.tsx",
  ],
  related: [
    "literature-library",
    "manuscript-collection",
    "library-sharing",
    "manuscript-vs-publication",
  ],
  sections: [
    {
      id: "four-sections",
      title: "四个 section 各自收什么",
      markdown: `进入干净的 \`/library\` 会先看到“我的资源”功能 Hub；选择二级入口后，URL 用 \`section\` 明确当前资源类型。这里的“资源集”是四分之一，内部仍可使用文件夹组织内容；因此导航入口改名为“我的资源”不等于产品取消了文件夹概念。`,
      embeds: [{ id: "my-resources-sections" }],
      table: {
        columns: [
          { key: "section", header: "分区" },
          { key: "route", header: "路由语义" },
          { key: "purpose", header: "定位" },
          { key: "delivery", header: "交付状态" },
        ],
        rows: [
          {
            section: "文献集",
            route: "/library?section=papers",
            purpose: "以论文为单元收藏；保留文件夹、PDF 与题录维护",
            delivery: "现行后端能力",
          },
          {
            section: "期刊集",
            route: "/library?section=journals",
            purpose: "以期刊为单元建立投稿目标或长期关注列表",
            delivery: "当前条目和集合主要是产品演示数据",
          },
          {
            section: "稿件集",
            route: "/library?section=manuscripts",
            purpose: "汇合智能写作稿与智能审稿上传稿",
            delivery: "产品演示阶段，详见稿件集词条",
          },
          {
            section: "资源集",
            route: "/library?section=folders",
            purpose: "保存数据集、问卷、矩阵、审稿结果、附信等过程产物",
            delivery: "当前条目和集合主要是产品演示数据",
          },
        ],
      },
    },
    {
      id: "switching",
      title: "切换、文件夹与工作区",
      markdown: `四个 section 由同一个“我的资源”页面承载，切换时只改变资源类型和对应文件夹列表。文献集保留真实的文件夹与论文管理，并在宽屏登录态复用 **矩阵分析、文献图谱、PDF Chat** 工作区；期刊集、稿件集和资源集当前使用各自的列表或内容区，不共享这组三件套。

页面内的“文件夹”仍是有效概念：文献集用它整理论文，其他 section 也会在侧栏下半区列出对应集合。旧版把“文件夹”当成全站一级入口的说法已经过期。`,
    },
    {
      id: "state-boundary",
      title: "状态边界",
      markdown: `“我的资源”四分结构和路由已经进入现行前端，但四个分区的后端成熟度不同。文献集连接现有 library API；期刊集与资源集仍使用静态示例；稿件集的统一身份、版本和审稿轮由 MSW mock 提供。判断某项内容是否会跨设备持久化时，应继续查看对应深入词条，不能只凭它出现在同一个页面里推断。`,
    },
  ],
};
