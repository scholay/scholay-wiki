import type { WikiArticle } from "../../types";

export const PaperDetailAndActionsArticle: WikiArticle = {
  slug: "paper-detail-and-actions",
  title: "论文详情与页面动作",
  summary:
    "查看论文元数据、作者、摘要和参考文献，并继续阅读 PDF、引用、收藏或分享。",
  category: "discovery",
  kind: "page",
  status: "current",
  audience: ["所有访客", "研究者"],
  aliases: ["论文详情页", "Paper Detail", "论文元数据"],
  sourcePaths: [
    "frontend-user/src/features/browser/components/PaperDetailPane.tsx",
    "frontend-user/src/features/browser/components/paper-detail/PaperHeader.tsx",
    "frontend-user/src/features/browser/components/paper-detail/PaperActionRow.tsx",
    "frontend-user/src/features/browser/components/paper-detail/PaperMetadataBlock.tsx",
    "frontend-user/src/features/browser/components/paper-detail/PaperReferences.tsx",
  ],
  related: [
    "paper",
    "open-access-and-paper-translation",
    "paper-favorites",
    "citation-dialog",
  ],
  sections: [
    {
      id: "route-and-data",
      title: "打开方式与数据来源",
      markdown: `每篇论文都有可以单独打开和分享的详情地址。页面会优先显示你刚刚浏览过的论文信息，再从原数据来源补齐详情；如果论文来自个人文献集，还可能包含你上传的 PDF 和修改过的元数据。加载失败、页面已失效或找不到论文时，页面会分别给出说明。`,
    },
    {
      id: "content",
      title: "页面内容",
      markdown: `打开论文后，页首会显示标题、年份、来源和作者，正文区域继续列出摘要、DOI、发表日期、被引与参考文献计数、开放获取和学科标签。DOI 右侧复制图标只复制标识符；OA 表示存在开放获取线索，不等于所有版本都可下载。向下滚动到参考文献与引用区，可以继续打开相关论文或复制引文。下图分别展示论文详情和参考文献/引用区域。

作者最多直接显示 12 位，学科标签最多 12 个，摘要关键词最多 8 个。页面只显示实际取得的数据；参考文献暂时为空不一定表示论文完全没有引用。`,
      embeds: [{ id: "paper-detail" }, { id: "paper-references-citation" }],
      blocks: [
        {
          type: "markdown",
          markdown:
            "下图先展示论文详情的元数据与动作区。DOI 右侧复制图标只复制标识符；OA 表示存在开放获取线索，不等于所有版本都可下载。",
        },
        { type: "embeds", ids: ["paper-detail"] },
        {
          type: "article-link",
          card: {
            articleSlug: "marketing-pages-and-implementation-boundaries",
            sectionId: "reference-card",
            title: "参考文献基础信息卡片包含什么",
            description:
              "逐项理解题名、作者、来源、年份、DOI、OA 和引用量，以及点击卡片后的打开行为。",
            icon: "book-open",
          },
        },
        {
          type: "markdown",
          markdown:
            "第二张图展示参考文献与内联引用区；“共 38 篇”是当前取得的参考文献条数，不能与论文被引次数混用。",
        },
        { type: "embeds", ids: ["paper-references-citation"] },
        {
          type: "article-link",
          card: {
            articleSlug: "citation-dialog",
            sectionId: "formats",
            title: "引用格式怎样切换、设为默认并复制",
            description: "了解五种格式、本机默认偏好与缺失元数据的核对边界。",
            icon: "book-open",
          },
        },
      ],
    },
    {
      id: "actions",
      title: "可用动作",
      markdown: `动作行可打开用户上传 PDF、合法 OA 原文、上游原始链接，跳到引用区，收藏论文或翻译标题与摘要。上传 PDF 只在文库记录确实有私有文件时出现；本地自由文件没有上游来源，因此不会显示普通收藏和作者外链。读者笔记与讨论目前只是“研究论坛即将上线”占位。`,
    },
  ],
};
