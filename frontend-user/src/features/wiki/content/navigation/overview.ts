import type { WikiNavCategoryMeta } from "../../types";
import { jump, primary } from "./targets";

export const overviewNavCategory: WikiNavCategoryMeta = {
  slug: "overview",
  title: "全站概览",
  shortTitle: "概览",
  description: "先认识 Scholay 是什么，再看全站功能和三档套餐。",
  children: [
    {
      id: "overview-introduction",
      title: "Scholay 简介",
      target: primary("scholay"),
    },
    {
      id: "overview-features",
      title: "全站功能",
      target: primary("product-map"),
    },
    {
      id: "overview-navigation",
      title: "全站导航与功能树",
      target: primary("site-navigation"),
    },
    {
      id: "overview-pricing",
      title: "产品与套餐总览",
      target: primary("product-and-pricing-overview"),
      children: [
        {
          id: "overview-pricing-free",
          title: "Free",
          target: jump("product-and-pricing-overview"),
        },
        {
          id: "overview-pricing-pro",
          title: "Pro",
          target: jump("product-and-pricing-overview"),
        },
        {
          id: "overview-pricing-max",
          title: "Max",
          target: jump("product-and-pricing-overview"),
        },
      ],
    },
  ],
};
