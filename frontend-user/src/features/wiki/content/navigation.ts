import type { WikiNavCategoryMeta, WikiNavTarget } from "../types";

const primary = (articleSlug: string, sectionId?: string): WikiNavTarget => ({
  articleSlug,
  sectionId,
});

const jump = (articleSlug: string, sectionId?: string): WikiNavTarget => ({
  articleSlug,
  sectionId,
  shortcut: true,
});

/**
 * 读者导航严格采用 `scholay- wiki.xmind` 的 15 个一级栏目顺序，并追加
 * “其他”承接不能自然进入用户任务框架的现有词条。旧 WikiCategory 仍负责
 * 内容权限；这里仅负责读者看到的信息架构。
 */
export const WIKI_NAV_CATEGORIES: WikiNavCategoryMeta[] = [
  {
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
            id: "overview-feature-assistant",
            title: "智能助手",
            target: jump("claw"),
          },
          {
            id: "overview-feature-literature-search",
            title: "文献搜索",
            target: jump("academic-search"),
          },
          {
            id: "overview-feature-journal-search",
            title: "期刊搜索",
            target: jump("journal-search-page"),
          },
          {
            id: "overview-feature-smart-search",
            title: "智能搜索",
            target: jump("smart-search"),
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
            id: "overview-feature-intelligence",
            title: "学术情报",
            target: jump("research-news"),
          },
          {
            id: "overview-feature-resources",
            title: "我的资源",
            target: jump("literature-library"),
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
  },
  {
    slug: "scenarios",
    title: "常见场景",
    shortTitle: "场景",
    description: "按文献查询、分析、管理、期刊查询和论文写作完成一项任务。",
    children: [
      {
        id: "scenarios-literature-query",
        title: "文献查询",
        children: [
          {
            id: "scenarios-traditional-search",
            title: "如何使用传统文献搜索",
            target: primary("literature-search-guide"),
          },
          {
            id: "scenarios-smart-search",
            title: "如何使用智能文献搜索",
            target: primary("smart-literature-search-guide"),
          },
          {
            id: "scenarios-staging-area",
            title: "用暂存区收集候选文献",
            target: primary("staging-area"),
          },
        ],
      },
      {
        id: "scenarios-literature-analysis",
        title: "文献分析",
        children: [
          {
            id: "scenarios-matrix-analysis",
            title: "矩阵分析",
            target: primary("matrix-analysis"),
          },
          {
            id: "scenarios-pdf-chat",
            title: "PDF Chat",
            target: primary("pdf-chat-guide"),
          },
          {
            id: "scenarios-literature-graph",
            title: "文献图谱",
            target: primary("literature-graph-status"),
          },
          {
            id: "scenarios-pdf-reader",
            title: "PDF 阅读器",
            target: primary("pdf-reader"),
          },
          {
            id: "scenarios-open-access-translation",
            title: "开放获取与论文翻译",
            target: primary("open-access-and-paper-translation"),
          },
        ],
      },
      {
        id: "scenarios-literature-management",
        title: "文献管理",
        children: [
          {
            id: "scenarios-favorite-paper",
            title: "将搜索到的文献收藏",
            target: primary("paper-favorites"),
          },
          {
            id: "scenarios-upload-paper",
            title: "上传自己本地的文献",
            target: primary("pdf-upload-resolve-and-relink"),
          },
        ],
      },
      {
        id: "scenarios-journal-query",
        title: "期刊查询",
        children: [
          {
            id: "scenarios-search-journal",
            title: "如何搜索感兴趣的期刊",
            target: jump("journal-search-page"),
          },
          {
            id: "scenarios-paper-journal",
            title: "查看一篇论文所关联的期刊",
            target: jump("paper-detail-and-actions"),
          },
          {
            id: "scenarios-latex-template",
            title: "LaTeX 模板",
            target: primary("journal-submission-resources"),
          },
        ],
      },
      {
        id: "scenarios-paper-writing",
        title: "论文写作",
        children: [
          {
            id: "scenarios-manuscript-publication",
            title: "稿件 vs 出版物",
            target: jump("manuscript-vs-publication"),
          },
          {
            id: "scenarios-writing-scholay",
            title: "Scholay 功能",
            children: [
              {
                id: "scenarios-writing-review",
                title: "智能审稿",
                target: jump("peer-review"),
                children: [
                  {
                    id: "scenarios-review-paper-types",
                    title: "论文类型：期刊论文与毕业论文",
                    target: jump("peer-review-workflow-guide"),
                  },
                  {
                    id: "scenarios-review-process",
                    title: "审稿流程",
                    target: jump("peer-review-workflow-guide"),
                  },
                  {
                    id: "scenarios-review-dimensions",
                    title: "审稿维度",
                    target: jump("peer-review-dimensions-guide"),
                  },
                ],
              },
              {
                id: "scenarios-writing-prism",
                title: "智能写作",
                target: jump("prism-writing-workflow"),
              },
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "assistant",
    title: "智能助手",
    shortTitle: "助手",
    description: "了解 Scholay Claw 的定位、界面、会话、附件、技能与适用边界。",
    children: [
      {
        id: "assistant-introduction",
        title: "功能简介",
        target: primary("claw"),
      },
      {
        id: "assistant-interface",
        title: "界面介绍",
        target: primary("claw-interface-guide"),
        children: [
          {
            id: "assistant-sessions",
            title: "会话与历史",
            target: primary("claw-sessions"),
          },
          {
            id: "assistant-attachments",
            title: "附件、文库引用与 Skill",
            target: primary("claw-attachments-and-references"),
          },
          {
            id: "assistant-community-skills",
            title: "社区技能",
            target: primary("community-skills"),
          },
          {
            id: "assistant-stream-states",
            title: "卡住与发不出去",
            target: primary("claw-stream-tool-states"),
          },
        ],
      },
      {
        id: "assistant-vs-smart-search",
        title: "智能助手 vs 智能搜索",
        target: primary("search-entry-comparison"),
      },
    ],
  },
  {
    slug: "literature-search",
    title: "文献搜索",
    shortTitle: "文献",
    description: "使用传统检索或智能检索发现论文，并理解结果、筛选和详情。",
    children: [
      {
        id: "literature-search-introduction",
        title: "功能简介",
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
        ],
      },
      {
        id: "literature-search-traditional-vs-smart",
        title: "传统搜索 vs 智能搜索",
        target: primary("classic-vs-smart-search"),
      },
      {
        id: "literature-search-smart-search",
        title: "智能搜索",
        target: primary("smart-search"),
      },
      {
        id: "literature-search-smart-vs-assistant",
        title: "智能搜索 vs 智能助手",
        target: jump("search-entry-comparison"),
      },
    ],
  },
  {
    slug: "journal-search",
    title: "期刊搜索",
    shortTitle: "期刊",
    description: "查找期刊、理解指标，并用可核对的信息辅助选刊。",
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
        title: "期刊的几个指标含义",
        target: primary("journal-metrics-guide"),
      },
      {
        id: "journal-search-strategy",
        title: "期刊的选刊策略",
        target: primary("journal-selection-guide"),
      },
      {
        id: "journal-search-update-cycle",
        title: "Scholay 期刊的更新周期",
        target: primary("journal-update-cycle"),
      },
    ],
  },
  {
    slug: "writing",
    title: "智能写作",
    shortTitle: "写作",
    description:
      "从 Prism 工作区开始一次完整写作，并理解 LaTeX 工程和稿件状态。",
    children: [
      {
        id: "writing-introduction",
        title: "功能简介",
        target: primary("prism"),
      },
      {
        id: "writing-interface",
        title: "界面介绍",
        target: primary("prism-interface-guide"),
      },
      {
        id: "writing-complete-workflow",
        title: "怎样开始一次完整的智能写作",
        target: primary("prism-writing-workflow"),
      },
      {
        id: "writing-latex-project",
        title: "什么是 LaTeX 工程",
        target: primary("latex-project-guide"),
        children: [
          {
            id: "writing-prism-latex",
            title: "Scholay Prism 与 LaTeX",
            target: jump("latex-project-guide"),
          },
          {
            id: "writing-latex-benefits",
            title: "LaTeX 的好处",
            target: jump("latex-project-guide"),
          },
          {
            id: "writing-journal-latex-download",
            title: "期刊搜索中的 LaTeX 下载",
            target: jump("journal-submission-resources"),
          },
        ],
      },
      {
        id: "writing-manuscript-publication",
        title: "稿件与出版物的区别",
        target: primary("manuscript-vs-publication"),
      },
      {
        id: "writing-supporting-tools",
        title: "写作配套工具",
        children: [
          {
            id: "writing-citation-generator",
            title: "引用生成器",
            target: primary("citation-generator"),
          },
          {
            id: "writing-citation-dialog",
            title: "引用弹窗与默认格式",
            target: primary("citation-dialog"),
          },
        ],
      },
    ],
  },
  {
    slug: "review",
    title: "智能审稿",
    shortTitle: "审稿",
    description: "按论文类型完成 AI 评审，并正确理解过程、结果、维度和分页。",
    children: [
      {
        id: "review-introduction",
        title: "功能简介",
        target: primary("peer-review"),
      },
      {
        id: "review-interface",
        title: "界面介绍",
        children: [
          {
            id: "review-workflow-interface",
            title: "操作流程界面",
            target: primary("peer-review-workflow-guide"),
            children: [
              {
                id: "review-journal-paper-flow",
                title: "期刊论文审稿流程",
                target: jump("peer-review-workflow-guide"),
              },
              {
                id: "review-thesis-flow",
                title: "毕业论文审稿流程",
                target: jump("peer-review-workflow-guide"),
              },
            ],
          },
          {
            id: "review-results-interface",
            title: "审稿结果产物界面",
            target: primary("peer-review-results-guide"),
            children: [
              {
                id: "review-result-accept",
                title: "录用",
                target: jump("peer-review-results-guide"),
              },
              {
                id: "review-result-revise",
                title: "返修",
                target: jump("peer-review-results-guide"),
              },
              {
                id: "review-result-reject",
                title: "拒稿",
                target: jump("peer-review-results-guide"),
              },
            ],
          },
          {
            id: "review-dimensions",
            title: "审稿维度",
            target: primary("peer-review-dimensions-guide"),
          },
          {
            id: "review-evaluation-method",
            title: "评价方式",
            target: jump("peer-review-dimensions-guide"),
            children: [
              {
                id: "review-evaluation-original",
                title: "原句",
                target: jump("peer-review-dimensions-guide"),
              },
              {
                id: "review-evaluation-advice",
                title: "建议",
                target: jump("peer-review-dimensions-guide"),
              },
            ],
          },
          {
            id: "review-pagination",
            title: "审稿分页",
            target: jump("peer-review-results-guide"),
            children: [
              {
                id: "review-pagination-initial",
                title: "初审",
                target: jump("peer-review-results-guide"),
              },
              {
                id: "review-pagination-reviewers",
                title: "审稿人",
                target: jump("peer-review-results-guide"),
              },
              {
                id: "review-pagination-final",
                title: "终审",
                target: jump("peer-review-results-guide"),
              },
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "intelligence",
    title: "学术情报",
    shortTitle: "情报",
    description: "浏览公开学术资讯，并理解列表、详情和移动信息流。",
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
  },
  {
    slug: "resources",
    title: "我的资源",
    shortTitle: "资源",
    description: "管理自己的论文、上传文件、文献集以及分享与接收。",
    children: [
      {
        id: "resources-introduction",
        title: "功能简介",
        target: primary("literature-library"),
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
  },
  {
    slug: "limits",
    title: "使用限额",
    shortTitle: "限额",
    description: "理解不同套餐的共享 AI 周限额、重置和额度外经费。",
    children: [
      {
        id: "limits-by-plan",
        title: "不同套餐之间的限额",
        target: primary("ai-usage-quota"),
        children: [
          {
            id: "limits-free-pro-max",
            title: "Free · Pro · Max",
            target: jump("ai-usage-quota", "amounts"),
          },
        ],
      },
      {
        id: "limits-weekly",
        title: "周限额",
        target: jump("ai-usage-quota", "window"),
      },
      {
        id: "limits-reset",
        title: "限额重置",
        target: primary("quota-block-and-recovery"),
      },
      {
        id: "limits-wallet",
        title: "额度外经费与按量付费",
        target: primary("wallet-payg"),
      },
    ],
  },
  {
    slug: "subscription",
    title: "会员订阅",
    shortTitle: "订阅",
    description: "查看订阅渠道、费用口径、活动边界和购买升级规则。",
    children: [
      {
        id: "subscription-channels",
        title: "订阅渠道",
        target: primary("membership-subscription-guide"),
        children: [
          {
            id: "subscription-alipay",
            title: "支付宝",
            target: jump("membership-subscription-guide"),
          },
          {
            id: "subscription-wechat",
            title: "微信",
            target: jump("membership-subscription-guide"),
          },
          {
            id: "subscription-unionpay",
            title: "云闪付（预留，未开放）",
            target: jump("membership-subscription-guide"),
          },
          {
            id: "subscription-claim",
            title: "领取",
            target: primary("gift-codes"),
          },
        ],
      },
      {
        id: "subscription-fees",
        title: "订阅费用",
        target: primary("subscription-lifecycle"),
        children: [
          {
            id: "subscription-official-pricing",
            title: "官方定价",
            target: jump("membership"),
          },
          {
            id: "subscription-events",
            title: "活动",
            target: primary("promotion-banner"),
          },
          {
            id: "subscription-limited-offer",
            title: "限时优惠（以当期活动为准）",
            target: jump("promotion-banner"),
          },
          {
            id: "subscription-invite-reward",
            title: "邀请奖励（不是订单优惠）",
            target: jump("invite-campaign"),
          },
        ],
      },
      {
        id: "subscription-pricing",
        title: "定价",
        target: primary("membership"),
        children: [
          {
            id: "subscription-pricing-free",
            title: "Free",
            target: jump("membership", "tiers"),
          },
          {
            id: "subscription-pricing-pro",
            title: "Pro",
            target: jump("membership", "tiers"),
          },
          {
            id: "subscription-pricing-max",
            title: "Max",
            target: jump("membership", "tiers"),
          },
        ],
      },
      {
        id: "subscription-orders",
        title: "支付与订单",
        target: primary("payment-orders"),
      },
    ],
  },
  {
    slug: "referrals",
    title: "邀请返利",
    shortTitle: "邀请",
    description: "理解邀请媒介、奖励归因，以及当前没有达人分级的事实边界。",
    children: [
      {
        id: "referrals-promoter-types",
        title: "达人类型",
        target: primary("invitation-rebate-guide"),
        children: [
          {
            id: "referrals-public-promoter",
            title: "全民推广（当前无独立类型）",
            target: jump("invitation-rebate-guide"),
          },
          {
            id: "referrals-creator-promoter",
            title: "达人推广（当前无独立类型）",
            target: jump("invitation-rebate-guide"),
          },
        ],
      },
      {
        id: "referrals-media",
        title: "邀请媒介",
        target: jump("invitation-rebate-guide"),
        children: [
          {
            id: "referrals-link",
            title: "邀请链接",
            target: jump("invitation-rebate-guide"),
          },
          {
            id: "referrals-qr",
            title: "邀请二维码",
            target: jump("invitation-rebate-guide"),
          },
          {
            id: "referrals-code",
            title: "邀请码",
            target: jump("invitation-rebate-guide"),
          },
        ],
      },
      {
        id: "referrals-mechanism",
        title: "返利机制",
        target: primary("invite-campaign"),
      },
    ],
  },
  {
    slug: "login",
    title: "登录方式",
    shortTitle: "登录",
    description: "使用手机、邮箱、微信或管理员启用的第三方账号登录 Scholay。",
    children: [
      {
        id: "login-overview",
        title: "登录方式总览",
        target: primary("login-methods-guide"),
      },
      {
        id: "login-scholay",
        title: "Scholay 登录",
        target: primary("account"),
        children: [
          {
            id: "login-phone",
            title: "手机号",
            target: primary("email-phone-authentication"),
          },
          {
            id: "login-wechat",
            title: "微信",
            target: jump("oauth-wechat-login"),
          },
        ],
      },
      {
        id: "login-third-party",
        title: "第三方授权登录",
        target: primary("oauth-wechat-login"),
        children: [
          {
            id: "login-ent-community",
            title: "恩特学术社区",
            target: jump("oauth-wechat-login", "providers"),
          },
          {
            id: "login-other-providers",
            title: "其他已启用提供方",
            target: jump("oauth-wechat-login", "providers"),
          },
        ],
      },
      {
        id: "login-email",
        title: "邮箱",
        target: jump("email-phone-authentication"),
      },
      {
        id: "login-account-merge",
        title: "第三方账号冲突与合并",
        target: primary("oauth-account-merge"),
      },
      {
        id: "login-account-connections",
        title: "第三方账号绑定与解绑",
        target: primary("account-connections"),
      },
    ],
  },
  {
    slug: "roadmap",
    title: "开发计划",
    shortTitle: "计划",
    description: "区分已经发布、界面预告和尚未形成权威承诺的开发事项。",
    children: [
      {
        id: "roadmap-next-release",
        title: "下一期开发任务",
        target: primary("roadmap-status"),
      },
    ],
  },
  {
    slug: "terms",
    title: "使用条款",
    shortTitle: "条款",
    description: "集中查看隐私、法律、AI 使用安全和学术伦理边界。",
    children: [
      {
        id: "terms-policies",
        title: "服务政策与 AI 使用边界",
        target: primary("service-policies"),
        children: [
          {
            id: "terms-privacy",
            title: "隐私",
            target: jump("service-policies", "documents"),
          },
          {
            id: "terms-legal",
            title: "法律",
            target: jump("service-policies", "documents"),
          },
          {
            id: "terms-ai-safety",
            title: "AI 使用安全",
            target: jump("service-policies", "ai"),
          },
          {
            id: "terms-academic-ethics",
            title: "学术伦理",
            target: jump("service-policies", "ai"),
          },
        ],
      },
    ],
  },
  {
    slug: "other",
    title: "其他",
    shortTitle: "其他",
    description:
      "收纳不属于主任务框架，但仍需保留和核对的账户、移动、运营、技术与历史内容。",
    children: [
      {
        id: "other-account-settings",
        title: "账户与个人设置",
        children: [
          {
            id: "other-profile-settings",
            title: "个人资料设置",
            target: primary("profile-settings"),
          },
          {
            id: "other-account-security",
            title: "密码、邮箱与手机号安全设置",
            target: primary("account-security-settings"),
          },
          {
            id: "other-notifications",
            title: "站内通知中心",
            target: primary("notification-center"),
          },
        ],
      },
      {
        id: "other-help-content-sharing",
        title: "帮助、内容与分享",
        children: [
          {
            id: "other-feedback-support",
            title: "反馈与支持",
            target: primary("feedback-and-support"),
          },
          {
            id: "other-help-qa",
            title: "帮助中心与学术问答",
            target: primary("help-center-and-qa"),
          },
          {
            id: "other-resource-blog",
            title: "学术资源中心与产品博客",
            target: primary("resource-and-blog-center"),
          },
          {
            id: "other-share-cards",
            title: "分享卡片、短链与海报",
            target: primary("share-cards-and-posters"),
          },
        ],
      },
      {
        id: "other-research-capabilities",
        title: "扩展科研能力",
        children: [
          {
            id: "other-data-analysis",
            title: "AI 数据分析",
            target: primary("research-data-analysis"),
          },
          {
            id: "other-figures-slides",
            title: "科研绘图与演示文稿",
            target: primary("research-figure-and-slides"),
          },
        ],
      },
      {
        id: "other-tools-community",
        title: "功能与社区",
        children: [
          {
            id: "other-feature-tools",
            title: "功能广场",
            target: primary("feature-tools"),
          },
        ],
      },
      {
        id: "other-mobile",
        title: "移动端与小程序",
        children: [
          {
            id: "other-mobile-web",
            title: "移动 Web",
            target: primary("mobile-web"),
          },
          {
            id: "other-wechat-mini-program",
            title: "微信小程序",
            target: primary("wechat-mini-program"),
          },
          {
            id: "other-device-routing",
            title: "桌面与移动页面分流",
            target: primary("device-routing"),
          },
          {
            id: "other-mini-program-runtime",
            title: "小程序页面、端间差异与内容安全",
            target: primary("mini-program-runtime-and-parity"),
          },
        ],
      },
      {
        id: "other-administration",
        title: "管理后台",
        adminOnly: true,
        children: [
          {
            id: "other-admin-console",
            title: "管理后台总览",
            target: primary("admin-console"),
          },
          {
            id: "other-admin-access",
            title: "后台角色与权限",
            target: primary("admin-access-control"),
          },
          {
            id: "other-admin-dashboard",
            title: "后台仪表盘",
            target: primary("admin-dashboard"),
          },
          {
            id: "other-admin-users",
            title: "用户查询与详情",
            target: primary("admin-user-directory"),
          },
          {
            id: "other-admin-user-lifecycle",
            title: "用户冻结、删除与角色变更",
            target: primary("admin-user-lifecycle"),
          },
          {
            id: "other-admin-entitlements",
            title: "会员、科研经费与重置次数发放",
            target: primary("admin-user-entitlement-grants"),
          },
          {
            id: "other-admin-announcements",
            title: "公告管理",
            target: primary("admin-announcements"),
          },
          {
            id: "other-admin-hot-content",
            title: "热门内容运营",
            target: primary("admin-hot-content"),
          },
          {
            id: "other-admin-journal-sync",
            title: "期刊同步与发布",
            target: primary("admin-journal-sync"),
          },
          {
            id: "other-admin-tools",
            title: "工具目录、导入任务与 Webhook",
            target: primary("admin-tool-operations"),
          },
          {
            id: "other-admin-skill-moderation",
            title: "社区 Skill 审核",
            target: primary("admin-skill-moderation"),
          },
          {
            id: "other-admin-feedback",
            title: "反馈处理",
            target: primary("admin-feedback-operations"),
          },
          {
            id: "other-admin-messaging",
            title: "站内消息管理",
            target: primary("admin-messaging"),
          },
          {
            id: "other-admin-mail-support",
            title: "邮件中心、客服配置与日志",
            target: primary("admin-mail-support-observability"),
          },
          {
            id: "other-admin-session-monitoring",
            title: "AI 会话监控",
            target: primary("admin-session-monitoring"),
          },
          {
            id: "other-admin-site-analytics",
            title: "网站与爬虫分析",
            target: primary("admin-site-analytics"),
          },
          {
            id: "other-admin-feature-usage",
            title: "功能使用统计",
            target: primary("admin-feature-usage"),
          },
          {
            id: "other-admin-token-cost",
            title: "算力用量统计",
            target: primary("admin-token-cost"),
          },
          {
            id: "other-admin-invite-analytics",
            title: "邀请关系与转化分析",
            target: primary("admin-invite-analytics"),
          },
          {
            id: "other-admin-campaigns",
            title: "邀请活动与推广弹窗",
            target: primary("admin-campaigns-promo"),
          },
          {
            id: "other-admin-billing",
            title: "AI 计费配置",
            target: primary("admin-billing-configuration"),
          },
          {
            id: "other-admin-providers",
            title: "AI Provider 与模型目录",
            target: primary("admin-model-provider-catalog"),
          },
          {
            id: "other-admin-third-party",
            title: "第三方账号池",
            target: primary("admin-third-party-account-pool"),
          },
          {
            id: "other-admin-bindings",
            title: "模型用途绑定",
            target: primary("admin-model-bindings"),
          },
          {
            id: "other-admin-analysis-dimensions",
            title: "矩阵分析维度",
            target: primary("admin-analysis-dimensions"),
          },
          {
            id: "other-admin-wechat",
            title: "微信公众号配置",
            target: primary("admin-wechat-official"),
          },
          {
            id: "other-admin-news-webhook",
            title: "研究新闻 Webhook",
            target: primary("admin-news-webhook"),
          },
          {
            id: "other-admin-system-code",
            title: "系统配置与代码片段",
            target: primary("admin-system-code-snippets"),
          },
          {
            id: "other-admin-oauth",
            title: "OAuth 与第三方登录配置",
            target: primary("admin-oauth-config"),
          },
          {
            id: "other-admin-payment",
            title: "支付商户配置",
            target: primary("admin-payment-merchants"),
          },
        ],
      },
      {
        id: "other-platform",
        title: "技术实现、平台与 Agent",
        adminOnly: true,
        children: [
          {
            id: "other-platform-topology",
            title: "平台运行拓扑",
            target: primary("platform-topology"),
          },
          {
            id: "other-platform-api",
            title: "后端 API 与认证边界",
            target: primary("backend-api-boundaries"),
          },
          {
            id: "other-platform-academic-data",
            title: "学术数据与文献处理后端",
            target: primary("academic-data-backend"),
          },
          {
            id: "other-platform-seo",
            title: "内容、SEO 与发现管线",
            target: primary("content-seo-pipeline"),
          },
          {
            id: "other-platform-communications",
            title: "通知、反馈与客服通信",
            target: primary("communications-backend"),
          },
          {
            id: "other-platform-agent-services",
            title: "Agent 产品后端模块",
            target: primary("agent-backend-services"),
          },
          {
            id: "other-platform-governance",
            title: "商业规则与平台治理后端",
            target: primary("commercial-governance-backend"),
          },
          {
            id: "other-platform-memory",
            title: "用户长期记忆",
            target: primary("user-memory"),
          },
          {
            id: "other-platform-agent-runtime",
            title: "Agent 执行器与会话桥",
            target: primary("agent-runtime"),
          },
          {
            id: "other-platform-artifacts",
            title: "Agent 交付物",
            target: primary("agent-artifacts"),
          },
          {
            id: "other-platform-runs",
            title: "Agent Run 任务",
            target: primary("agent-runs"),
          },
          {
            id: "other-platform-executor-api",
            title: "Agent Executor 内部接口",
            target: primary("agent-executor-internal-api"),
          },
          {
            id: "other-platform-sandbox",
            title: "Agent 工具、沙箱与网络边界",
            target: primary("agent-tool-and-sandbox-boundary"),
          },
          {
            id: "other-platform-evidence",
            title: "研究证据内核与声明核验",
            target: primary("research-evidence-kernel"),
          },
          {
            id: "other-platform-stat-lab",
            title: "Stat Lab 方法与复核边界",
            target: primary("stat-lab-method-boundary"),
          },
          {
            id: "other-platform-skills",
            title: "Agent 技能目录与装载上限",
            target: primary("agent-skill-catalog-and-loading"),
          },
          {
            id: "other-platform-prism-tex",
            title: "Prism TeX 文件队列编译器",
            target: primary("prism-tex-file-compiler"),
          },
          {
            id: "other-platform-production",
            title: "生产服务与三网络拓扑",
            target: primary("production-service-topology"),
          },
          {
            id: "other-platform-nginx",
            title: "Nginx、实时连接与 SEO 边界",
            target: primary("nginx-edge-and-seo-boundary"),
          },
          {
            id: "other-platform-migrations",
            title: "数据库迁移重放模型",
            target: primary("database-migration-replay"),
          },
          {
            id: "other-platform-release",
            title: "容器构建与生产发布链路",
            target: primary("container-release-pipeline"),
          },
        ],
      },
      {
        id: "other-history",
        title: "历史与兼容",
        children: [
          {
            id: "other-history-tools-coldstart",
            title: "功能广场冷启动与下载治理",
            target: primary("feature-tools-coldstart-governance"),
          },
          {
            id: "other-history-backup",
            title: "备份、恢复与故障证据边界",
            target: primary("backup-and-restore-boundary"),
          },
          {
            id: "other-history-design-source",
            title: "设计真相源与历史交互资料",
            target: primary("design-source-of-truth"),
          },
          {
            id: "other-history-coupons",
            title: "优惠券系统（遗留）",
            target: primary("coupon-system-legacy"),
          },
          {
            id: "other-history-checkin",
            title: "任务中心与签到",
            target: primary("task-center-and-checkin"),
          },
          {
            id: "other-history-components",
            title: "已下线与兼容组件",
            target: primary("legacy-components"),
          },
        ],
      },
    ],
  },
];
