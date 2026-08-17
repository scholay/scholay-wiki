import type { WikiNavCategoryMeta } from "../../types";
import { primary } from "./targets";

export const resourcesNavCategory: WikiNavCategoryMeta = {
  slug: "resources",
  title: "我的资源",
  shortTitle: "资源",
  description: "按文献集、期刊集、稿件集和资源集管理个人研究材料。",
  children: [
    {
      id: "resources-introduction",
      title: "功能简介",
      target: primary("my-resources"),
    },
    {
      id: "resources-literature-library",
      title: "文献集",
      target: primary("literature-library"),
    },
    {
      id: "resources-manuscripts",
      title: "稿件集",
      target: primary("manuscript-collection"),
    },
    {
      id: "resources-interface",
      title: "界面介绍",
      target: primary("resources-interface-guide"),
    },
    {
      id: "resources-sharing",
      title: "文献集分享与接收",
      target: primary("library-sharing"),
    },
  ],
};
