import type { WikiNavCategory } from "../types";

export interface WikiStartPath {
  label: string;
  title: string;
  description: string;
  categorySlug: WikiNavCategory;
}

/** 开始页只保留高频任务入口；完整目录以 WIKI_NAV_CATEGORIES 为唯一真源。 */
export const WIKI_START_PATHS: WikiStartPath[] = [
  {
    label: "认识产品",
    title: "全站概览",
    description: "了解 Scholay 的定位、全站能力，以及 Free、Pro、Max 方案。",
    categorySlug: "overview",
  },
  {
    label: "完成研究任务",
    title: "文献查询与分析",
    description: "从检索、筛选和暂存，到 PDF 阅读、矩阵分析与文献管理。",
    categorySlug: "scenarios",
  },
  {
    label: "使用 Claw",
    title: "智能助手",
    description: "了解会话、附件、文库引用、Skill、运行状态与交付物。",
    categorySlug: "assistant",
  },
  {
    label: "使用 Prism",
    title: "智能写作",
    description: "从项目、LaTeX 工程和正文工作区开始一次完整写作。",
    categorySlug: "writing",
  },
  {
    label: "检查稿件",
    title: "智能审稿",
    description: "理解两类评审流程、结果页签、审稿维度与产品边界。",
    categorySlug: "review",
  },
  {
    label: "管理权益",
    title: "会员订阅",
    description: "查看套餐、购买、升级、续费、支付方式与活动入口。",
    categorySlug: "subscription",
  },
];
