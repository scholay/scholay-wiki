import type { WikiNavCategoryMeta } from "../../types";
import { primary } from "./targets";

export const journalSearchNavCategory: WikiNavCategoryMeta = {
  slug: "journal-search",
  title: "期刊库搜索",
  shortTitle: "期刊",
  description: "查找期刊、阅读指标含义，并辅助选刊。",
  children: [
    {
      id: "journal-search-introduction",
      title: "功能简介",
      target: primary("authors-and-journals"),
    },
    {
      id: "journal-search-interface",
      title: "界面介绍",
      target: primary("journal-search-page"),
      children: [
        {
          id: "journal-search-detail",
          title: "期刊详情",
          target: primary("journal-detail-page"),
        },
        {
          id: "journal-search-rankings",
          title: "榜单与分类目录",
          target: primary("journal-rankings-and-directories"),
        },
      ],
    },
    {
      id: "journal-search-metrics",
      title: "期刊指标含义",
      target: primary("journal-metrics-guide"),
    },
    {
      id: "journal-search-strategy",
      title: "选刊策略",
      target: primary("journal-selection-guide"),
    },
    {
      id: "journal-search-update-cycle",
      title: "更新周期",
      target: primary("journal-update-cycle"),
    },
  ],
};
