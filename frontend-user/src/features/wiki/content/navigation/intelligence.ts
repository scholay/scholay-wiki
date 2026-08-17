import type { WikiNavCategoryMeta } from "../../types";
import { primary } from "./targets";

export const intelligenceNavCategory: WikiNavCategoryMeta = {
  slug: "intelligence",
  title: "scholay 情报",
  shortTitle: "情报",
  description: "从学术搜索进入 scholay 情报，浏览头条、快讯和学科动态。",
  children: [
    {
      id: "intelligence-introduction",
      title: "功能简介",
      target: primary("research-news"),
    },
    {
      id: "intelligence-interface",
      title: "界面介绍",
      target: primary("academic-intelligence-interface-guide"),
      children: [
        {
          id: "intelligence-mobile-feed",
          title: "移动 Feed",
          target: primary("mobile-feed"),
        },
      ],
    },
  ],
};
