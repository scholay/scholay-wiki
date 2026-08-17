import type { WikiNavCategoryMeta } from "../../types";
import { jump, primary } from "./targets";

export const overviewNavCategory: WikiNavCategoryMeta = {
  slug: "overview",
  title: "全站概览",
  shortTitle: "概览",
  description: "先认识 Scholay、全站能力与 Free、Pro、Max 三档方案。",
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
      children: [
        {
          id: "overview-feature-search",
          title: "学术搜索",
          target: jump("academic-search"),
        },
        {
          id: "overview-feature-smart-search",
          title: "学术搜索 · 智能搜论文",
          target: jump("smart-search"),
        },
        {
          id: "overview-feature-paper-search",
          title: "学术搜索 · 论文库搜索",
          target: jump("literature-search-guide"),
        },
        {
          id: "overview-feature-journal-search",
          title: "学术搜索 · 期刊库搜索",
          target: jump("journal-search-page"),
        },
        {
          id: "overview-feature-datasets",
          title: "学术搜索 · 数据集搜索",
          target: jump("datasets-search"),
        },
        {
          id: "overview-feature-intelligence",
          title: "学术搜索 · scholay 情报",
          target: jump("research-news"),
        },
        {
          id: "overview-feature-journal-selection",
          title: "学术搜索 · scholay 选刊（敬请期待）",
          target: jump("journal-selection-guide"),
        },
        {
          id: "overview-feature-assistant",
          title: "智能助手",
          target: jump("claw"),
        },
        {
          id: "overview-feature-writing",
          title: "智能写作",
          target: jump("prism"),
        },
        {
          id: "overview-feature-review",
          title: "智能审稿",
          target: jump("peer-review"),
        },
        {
          id: "overview-feature-resources",
          title: "我的资源",
          target: jump("my-resources"),
        },
        {
          id: "overview-feature-paper-library",
          title: "我的资源 · 文献集",
          target: jump("literature-library"),
        },
        {
          id: "overview-feature-journal-library",
          title: "我的资源 · 期刊集",
          target: jump("my-resources", "four-sections"),
        },
        {
          id: "overview-feature-manuscript-library",
          title: "我的资源 · 稿件集",
          target: jump("manuscript-collection"),
        },
        {
          id: "overview-feature-asset-library",
          title: "我的资源 · 资源集",
          target: jump("my-resources", "four-sections"),
        },
        {
          id: "overview-feature-plaza",
          title: "scholay广场",
          target: jump("scholay-plaza"),
        },
        {
          id: "overview-feature-tools",
          title: "scholay广场 · 学术工具",
          target: jump("feature-tools"),
        },
        {
          id: "overview-feature-skills",
          title: "scholay广场 · 学术skills",
          target: jump("community-skills"),
        },
        {
          id: "overview-feature-prompts",
          title: "scholay广场 · 学术prompts",
          target: jump("academic-prompts"),
        },
        {
          id: "overview-ai-workflows",
          title: "AI 科研工作流",
          target: primary("ai-research-workflows"),
        },
        {
          id: "overview-page-elements",
          title: "功能页面与元素说明",
          target: primary("marketing-pages-and-implementation-boundaries"),
        },
      ],
    },
    {
      id: "overview-navigation",
      title: "全站导航与功能树",
      target: primary("site-navigation"),
    },
    {
      id: "overview-pricing",
      title: "定价方案",
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
