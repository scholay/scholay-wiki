import type { WikiArticle } from "../../types";

export const AuthorProfilePageArticle: WikiArticle = {
  slug: "author-profile-page",
  title: "作者详情页",
  summary: "查看作者身份线索、研究主题、代表作、合作作者和年度发表趋势。",
  category: "discovery",
  kind: "page",
  status: "current",
  audience: ["所有访客", "研究者"],
  aliases: ["学者档案", "作者画像", "Author Detail"],
  sourcePaths: [
    "frontend-user/src/features/browser/components/AuthorDetailPane.tsx",
    "frontend-user/src/features/browser/components/author-detail/AuthorHero.tsx",
    "frontend-user/src/features/browser/components/author-detail/TopicSection.tsx",
    "frontend-user/src/features/browser/components/author-detail/FeaturedPapersCol.tsx",
    "frontend-user/src/shared/api/authors.ts",
  ],
  related: ["authors-and-journals", "paper-detail-and-actions"],
  sections: [
    {
      id: "entry",
      title: "入口与状态",
      markdown: `在搜索结果或论文详情中点击作者名，会在浏览工作区打开作者页；下图展示的是作者资料、主题和代表作已经载入的状态。你也可以保存作者页链接后直接再次访问。ORCID 与来源标签只是当前记录携带的识别线索；勾形图标不表示 Scholay 已人工认证该作者。

加载失败、作者不存在或原标签失效时会显示对应提示。同名、机构和不同来源的归并信息只是识别线索，不代表经过人工身份认证。`,
      embeds: [{ id: "author-profile" }],
    },
    {
      id: "derived-sections",
      title: "派生内容",
      markdown: `作者页会根据当前取到的论文生成研究主题、合作作者和年度发表趋势；下图展示的是合作网络与趋势区。代表作按引用数取前 5 篇，合作作者按共同出现次数取前 8 位，年度柱状图也来自同一批样本。

页面最多取 50 篇论文来计算这些内容，因此它们是当前样本的概览，不一定覆盖作者全部生涯。`,
      embeds: [{ id: "author-collaboration-trends" }],
    },
    {
      id: "navigation",
      title: "继续浏览",
      markdown: `点击代表作可以进入论文详情，点击合作作者可以继续查看对方的作者页。只有数据来源提供了可靠作者标识时，名字才会生成链接；不同数据库中的同名或同编号作者不会被直接拼成一个人。`,
    },
  ],
};
