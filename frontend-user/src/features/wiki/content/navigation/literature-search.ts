import type { WikiNavCategoryMeta } from "../../types";
import { jump, primary } from "./targets";

export const literatureSearchNavCategory: WikiNavCategoryMeta = {
  slug: "literature-search",
  title: "学术搜索",
  shortTitle: "搜索",
  description: "从论文库搜索、智能搜论文和数据集入口发现研究材料。",
  children: [
    {
      id: "literature-search-introduction",
      title: "学术搜索总览",
      target: primary("academic-search"),
    },
    {
      id: "literature-search-interface",
      title: "界面介绍",
      children: [
        {
          id: "literature-search-sources",
          title: "检索数据源",
          target: primary("paper-search-sources"),
        },
        {
          id: "literature-search-filters",
          title: "筛选、排序与分页",
          target: primary("paper-search-filters-and-pages"),
        },
        {
          id: "literature-search-paper",
          title: "论文实体",
          target: primary("paper"),
        },
        {
          id: "literature-search-paper-detail",
          title: "论文详情与页面动作",
          target: primary("paper-detail-and-actions"),
        },
        {
          id: "literature-search-author",
          title: "作者详情",
          target: primary("author-profile-page"),
        },
        {
          id: "literature-search-datasets",
          title: "数据集搜索",
          target: primary("datasets-search"),
        },
      ],
    },
    {
      id: "literature-search-traditional-vs-smart",
      title: "论文库搜索 vs 智能搜论文",
      target: primary("classic-vs-smart-search"),
    },
    {
      id: "literature-search-smart-search",
      title: "智能搜论文",
      target: primary("smart-search"),
    },
    {
      id: "literature-search-smart-vs-assistant",
      title: "智能搜论文 vs 智能助手",
      target: jump("search-entry-comparison"),
    },
  ],
};
