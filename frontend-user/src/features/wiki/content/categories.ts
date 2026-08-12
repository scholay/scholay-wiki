import type {
  WikiArticleKind,
  WikiArticleStatus,
  WikiCategoryMeta,
} from "../types";

export const WIKI_CATEGORIES: WikiCategoryMeta[] = [
  {
    slug: "getting-started",
    title: "认识 Scholay",
    shortTitle: "开始",
    description: "平台定位、账户、入口与构成 Scholay 的基础概念。",
  },
  {
    slug: "discovery",
    title: "学术发现",
    shortTitle: "发现",
    description: "论文、作者、期刊、检索、暂存区与引用网络。",
  },
  {
    slug: "research-ai",
    title: "AI 科研工作流",
    shortTitle: "AI 工作流",
    description: "智能搜索、Claw、Prism、智能审稿、分析、绘图与演示。",
  },
  {
    slug: "knowledge",
    title: "知识与内容",
    shortTitle: "知识",
    description: "个人文献集、分享、功能广场、社区技能、新闻与学术内容。",
  },
  {
    slug: "membership",
    title: "会员与活动规则",
    shortTitle: "会员规则",
    description: "会员、额度、钱包、支付、签到、邀请、优惠和权益变化。",
  },
  {
    slug: "mobile",
    title: "移动端与小程序",
    shortTitle: "移动端",
    description: "移动 Web、设备分流、微信小程序页面与端间能力差异。",
  },
  {
    slug: "administration",
    title: "管理后台",
    shortTitle: "后台",
    description: "运营、配置、内容、用户、用量、订单与系统管理。",
  },
  {
    slug: "platform",
    title: "平台与架构",
    shortTitle: "平台",
    description: "服务、Agent、数据、存储、消息、SEO、部署与可观测性。",
  },
  {
    slug: "policies",
    title: "政策与边界",
    shortTitle: "政策",
    description: "服务条款、隐私、免责声明、反馈与 AI 使用边界。",
  },
  {
    slug: "history",
    title: "历史与兼容",
    shortTitle: "历史",
    description: "旧路径、已下线模块、数据迁移与仍在保留的兼容行为。",
  },
];

export const WIKI_KIND_LABEL: Record<WikiArticleKind, string> = {
  overview: "总览",
  page: "页面",
  feature: "功能",
  rule: "规则",
  entity: "实体",
  architecture: "架构",
  legacy: "历史",
};

export const WIKI_STATUS_LABEL: Record<WikiArticleStatus, string> = {
  current: "现行",
  experimental: "实验",
  compatibility: "兼容",
  historical: "历史",
  planned: "计划",
};
