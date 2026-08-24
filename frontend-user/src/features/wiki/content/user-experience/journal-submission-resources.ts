import type { WikiArticle } from "../../types";

export const JournalSubmissionResourcesArticle: WikiArticle = {
  slug: "journal-submission-resources",
  title: "LaTeX 模板",
  summary: "在期刊详情中下载作者指南和 LaTeX 模板。没有资源时，下载区会隐藏。",
  category: "discovery",
  kind: "feature",
  status: "current",
  audience: ["作者", "Max 会员"],
  aliases: ["Guide for Authors", "LaTeX 模板", "投稿须知"],
  sourcePaths: [
    "frontend-user/src/shared/components/JournalSubmissionCard.tsx",
    "frontend-user/src/shared/api/journals.ts",
    "frontend-user/src/features/browser/components/JournalDetailPane.tsx",
  ],
  related: ["journal-detail-page", "membership", "prism"],
  sections: [
    {
      id: "availability",
      title: "什么时候显示",
      markdown: `打开期刊详情并向下查看投稿资源；当期刊确实提供作者指南或 LaTeX 模板时，页面才会显示下载卡片。下图展示的是详情中包含投稿资源的状态。作者指南下载为 .md，LaTeX 模板为 .zip；有 class 名时也会一并显示。

没有可用资源时，整个区块会隐藏，不会出现一个无法点击的占位。图中锁图标表示资源已经存在，但当前账户没有下载权限；它与“期刊没有投稿资源”是两种状态。`,
      embeds: [{ id: "journal-detail" }],
    },
    {
      id: "membership",
      title: "会员限制",
      markdown: `投稿资源下载是 Max 专享。访客、Free 和 Pro 用户会看到锁定状态，并可前往定价页了解权限。Max 用户点击后会直接获得文件；如果下载失败，当前页面会保留，并提示稍后重试。`,
    },
    {
      id: "boundary",
      title: "使用边界",
      markdown: `下载到的指南和模板是辅助材料，可能随期刊更新。用户在投稿前仍应访问期刊官网核对最新格式、许可与要求；Scholay 提供资源不等于代投或保证材料合规。`,
    },
  ],
};
