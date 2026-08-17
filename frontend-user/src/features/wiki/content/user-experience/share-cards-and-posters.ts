import type { WikiArticle } from "../../types";

export const ShareCardsAndPostersArticle: WikiArticle = {
  slug: "share-cards-and-posters",
  title: "分享卡片、短链与海报",
  summary:
    "为论文、期刊、文献文件夹和工具生成链接、二维码或图片，并在移动端调用系统分享。",
  category: "knowledge",
  kind: "feature",
  status: "current",
  audience: ["访客", "登录用户", "分享接收者"],
  aliases: ["分享海报", "二维码分享", "复制口令", "保存图片"],
  sourcePaths: [
    "frontend-user/src/shared/components/share/ShareSheet.tsx",
    "frontend-user/src/shared/components/share/ShareCard.tsx",
    "frontend-user/src/shared/components/share/SharePoster.tsx",
    "frontend-user/src/shared/components/share/CollectionSharePoster.tsx",
    "frontend-user/src/shared/api/library-share.ts",
  ],
  related: ["library-sharing", "paper-detail-and-actions", "feature-tools"],
  sections: [
    {
      id: "targets",
      title: "四类分享对象",
      markdown: `登录后分享论文、期刊或文献文件夹时，系统会生成一条简短链接；公开工具则直接分享工具详情页。论文和期刊的链接长期有效且不设提取码；分享文件夹时，你可以选择永久、7 天或 30 天，并按需开启提取码。`,
    },
    {
      id: "channels",
      title: "链接、口令、二维码与系统分享",
      markdown: `点击分享后，面板会提供复制链接、保存图片和二维码；分享文献文件夹时，还可以复制包含“链接 + 提取码”的口令。下图展示的是分享面板已经生成链接和二维码的状态。二维码会带上提取码，扫码者无需再输入。

支持系统分享的手机浏览器会直接打开分享菜单；不支持时，页面会复制链接并提示你粘贴到微信等应用。`,
      embeds: [{ id: "share-sheet" }],
    },
    {
      id: "image",
      title: "保存分享图",
      markdown: `论文、期刊和工具会生成信息海报，文件夹海报则包含整理人、篇目样本和二维码。点击“保存图片”后，页面会生成较清晰的 PNG 文件；即使图片生成失败，已经创建的分享链接仍然有效。

海报中的引用量、分区和摘要来自生成当时的数据快照，不保证以后始终实时更新。`,
    },
  ],
};
