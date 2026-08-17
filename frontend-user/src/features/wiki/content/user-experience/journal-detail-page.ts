import type { WikiArticle } from "../../types";

export const JournalDetailPageArticle: WikiArticle = {
  slug: "journal-detail-page",
  title: "期刊详情页",
  summary:
    "集中查看期刊标识、收录来源、分区、影响指标、年度趋势和投稿决策信息。",
  category: "discovery",
  kind: "page",
  status: "current",
  audience: ["所有访客", "作者", "研究者"],
  aliases: ["Journal Detail", "期刊指标", "选刊信息"],
  sourcePaths: [
    "frontend-user/src/features/browser/components/JournalDetailPane.tsx",
    "frontend-user/src/shared/components/JournalDecisionCard.tsx",
    "frontend-user/src/shared/components/JournalMetricsGroups.tsx",
    "frontend-user/src/shared/components/JournalTrendChart.tsx",
    "frontend-user/src/shared/api/journals.ts",
    "frontend-user/src/features/browser/components/journal-detail/JournalDetailContent.tsx",
    "frontend-user/src/features/journals/components/JournalCommentsPanel.tsx",
    "frontend-user/src/features/journals/data/journal-comments.ts",
  ],
  related: [
    "authors-and-journals",
    "journal-search-page",
    "journal-submission-resources",
  ],
  sections: [
    {
      id: "route-and-loading",
      title: "入口与完整详情",
      markdown: `期刊详情既可以从搜索结果打开，也可以通过分享链接直接访问。页面会先显示已经取得的基础信息，再补充分组指标、年度趋势和投稿资源；如果期刊不存在、加载失败或原来的浏览标签已经失效，页面会给出对应提示。`,
    },
    {
      id: "decision-data",
      title: "选刊信息",
      markdown: `打开期刊详情后，可以集中查看 ISSN、出版社、国家、期刊或会议类型、JCR/中科院/CCF 分区、影响因子、OpenAlex h-index、开放获取和预警信号；下图展示的是指标较完整时的详情状态。点击 ISSN 还可以前往官方 ISSN Portal 核对。

指标只在有数据时显示，年度趋势样本不足会隐藏。决策卡是多项信息的摘要，不构成投稿或录用保证。`,
      embeds: [{ id: "journal-detail" }],
    },
    {
      id: "current-boundary",
      title: "当前边界",
      markdown: `详情支持复制与分享，但当前没有稳定的“收藏期刊”写动作。页面底部已经显示用户评论面板，登录后可以在当前浏览会话追加评论；但评论完全来自前端种子与内存数组，没有评论后端、持久化或审核链路，刷新页面就会恢复种子内容。因此它是**产品演示阶段**交互，不能当成公开社区记录或真实用户评价。空字段也不会用虚构值补齐。`,
      embeds: [{ id: "journal-comments" }],
    },
  ],
};
