import type { WikiArticle } from "../../types";

export const JournalSearchPageArticle: WikiArticle = {
  slug: "journal-search-page",
  title: "期刊库搜索页",
  summary: "按刊名、ISSN、主办机构和五类质量条件筛选期刊，每页查看 8 条结果。",
  category: "discovery",
  kind: "page",
  status: "current",
  audience: ["所有访客", "作者", "研究者"],
  aliases: ["期刊库搜索", "Journal Search", "查期刊"],
  sourcePaths: [
    "frontend-user/src/features/journals/pages/JournalSearchPage.tsx",
    "frontend-user/src/features/journals/components/JournalSearchResults.tsx",
    "frontend-user/src/features/journals/components/JournalSidebar.tsx",
    "frontend-user/src/features/journals/hooks/useJournalUrlFilters.ts",
    "frontend-user/src/features/journals/types.ts",
  ],
  related: [
    "journal-detail-page",
    "journal-rankings-and-directories",
    "authors-and-journals",
  ],
  sections: [
    {
      id: "query",
      title: "搜索与默认列表",
      markdown: `进入期刊库搜索后，输入刊名、ISSN 或主办机构即可查找；不输入关键词时，页面会按影响因子从高到低显示默认列表。下图展示的是带搜索框、筛选入口和期刊卡片的结果页；筛选面板尚未展开。

每页固定显示 8 条。关键词、页码、排序和筛选会保留在页面地址中，从详情返回时可以恢复；当无法取得准确总数时，只显示上一页和下一页。`,
      embeds: [{ id: "journal-search" }],
    },
    {
      id: "filters",
      title: "五组筛选",
      markdown: `中科院分区可选 1–4 区，JCR 可选 Q1–Q4，影响因子阈值为 5/10/20/30，CCF 为 A/B/C，出版社预设包括 Nature Portfolio、Elsevier、IEEE、Springer 和 ACM。每组单选，“不限”会清除该维度；任一变化自动回第一页并重新查询。`,
    },
    {
      id: "sort-and-states",
      title: "排序与页面状态",
      markdown: `排序提供相关度、影响因子和“最新”。这里的“最新”实际按 OpenAlex 收录的论文数量排列，不是按创刊日期排列。查询时页面会分别显示检索中、加载失败或没有匹配结果；点击期刊卡可以进入详情。侧栏中的文件夹只是前往文献集的快捷入口，不代表期刊已经被收藏。`,
    },
  ],
};
