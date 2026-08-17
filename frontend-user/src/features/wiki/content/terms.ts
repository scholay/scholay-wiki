/**
 * 产品术语单一事实源。
 *
 * canonical 是现行产品名；linkVariants 是仍然正确、可自动链接的简称或写法；
 * deprecated 只收已经退出现行界面的旧产品名。aliases 为兼容旧搜索保留，不参与
 * deprecated 正文 guard，正文中的历史/必要引用必须进入精确白名单。
 */
export interface WikiTermDefinition {
  readonly canonical: string;
  readonly deprecated: readonly string[];
  readonly articleSlug: string;
  readonly linkVariants?: readonly string[];
}

export interface WikiDeprecatedTermAllowance {
  readonly term: string;
  readonly articleSlug: string;
  readonly sectionId?: string;
  /** 必须出现在同一条正文片段中；避免按整篇词条放行后掩盖新增旧称。 */
  readonly context: string;
  readonly reason: string;
}

export const WIKI_TERMS: readonly WikiTermDefinition[] = [
  {
    canonical: "智能助手（Scholay Claw）",
    linkVariants: ["智能助手 Scholay Claw", "Scholay Claw", "智能助手"],
    deprecated: [],
    articleSlug: "claw",
  },
  {
    canonical: "智能写作（Scholay Prism）",
    linkVariants: ["Scholay Prism", "智能写作"],
    deprecated: [],
    articleSlug: "prism",
  },
  {
    canonical: "智能审稿（AI 模拟评议）",
    linkVariants: ["智能审稿", "AI 审稿"],
    deprecated: [],
    articleSlug: "peer-review",
  },
  {
    canonical: "学术搜索",
    deprecated: ["文献搜索"],
    articleSlug: "academic-search",
  },
  {
    canonical: "论文库搜索",
    deprecated: ["传统文献搜索", "传统搜索"],
    articleSlug: "literature-search-guide",
  },
  {
    canonical: "期刊库搜索",
    deprecated: ["期刊搜索"],
    articleSlug: "journal-search-page",
  },
  {
    canonical: "智能搜论文",
    deprecated: ["智能搜索"],
    articleSlug: "smart-search",
  },
  {
    canonical: "PDF Chat",
    linkVariants: ["PDF-Chat", "PDF 对话"],
    deprecated: [],
    articleSlug: "pdf-chat-guide",
  },
  {
    canonical: "我的资源",
    deprecated: [],
    articleSlug: "my-resources",
  },
  {
    canonical: "文献集",
    linkVariants: ["个人文献集"],
    deprecated: [],
    articleSlug: "literature-library",
  },
  {
    canonical: "稿件集",
    deprecated: [],
    articleSlug: "manuscript-collection",
  },
  {
    canonical: "scholay广场",
    deprecated: ["科研能力广场", "功能广场"],
    articleSlug: "scholay-plaza",
  },
  {
    canonical: "scholay 情报",
    linkVariants: ["研究新闻"],
    deprecated: ["学术情报"],
    articleSlug: "research-news",
  },
  {
    canonical: "暂存区",
    deprecated: [],
    articleSlug: "staging-area",
  },
  {
    canonical: "论文矩阵分析",
    linkVariants: ["矩阵分析"],
    deprecated: [],
    articleSlug: "matrix-analysis",
  },
  {
    canonical: "AI 周期额度",
    linkVariants: ["AI 额度"],
    deprecated: [],
    articleSlug: "ai-usage-quota",
  },
  {
    canonical: "科研经费",
    deprecated: [],
    articleSlug: "wallet-payg",
  },
  {
    canonical: "稿件",
    linkVariants: ["出版物"],
    deprecated: [],
    articleSlug: "manuscript-vs-publication",
  },
  {
    canonical: "开放获取（OA）",
    linkVariants: ["开放获取", "OA"],
    deprecated: [],
    articleSlug: "open-access-and-paper-translation",
  },
  {
    canonical: "社区技能（Skill）",
    linkVariants: ["社区技能", "Skill"],
    deprecated: [],
    articleSlug: "community-skills",
  },
  {
    canonical: "中科院分区",
    linkVariants: ["期刊分区", "JCR", "CCF"],
    deprecated: [],
    articleSlug: "journal-metrics-guide",
  },
  {
    canonical: "参考文献基础信息卡片",
    linkVariants: [
      "Function call 卡片",
      "工具调用卡片",
      "扩展区标签页",
      "浏览器页签",
      "汉堡菜单",
      "剩余额度显示",
      "任务进度条",
      "推理过程",
      "扩展区",
      "文件树",
    ],
    deprecated: [],
    articleSlug: "marketing-pages-and-implementation-boundaries",
  },
] as const;

/**
 * 只放明确的历史说明或仍需原样引用的旧 UI 文案。每项限定到词条、可选章节和
 * 同一片段中的 context；不得用全局或整篇文章白名单消除改名门禁。
 */
export const WIKI_DEPRECATED_TERM_ALLOWLIST: readonly WikiDeprecatedTermAllowance[] =
  [
    {
      term: "文献搜索",
      articleSlug: "site-navigation",
      sectionId: "top-level",
      context: "旧版把“文献搜索”“期刊搜索”“文件夹”分别放在顶栏",
      reason: "解释旧顶栏与现行六功能导航的迁移关系。",
    },
    {
      term: "期刊搜索",
      articleSlug: "site-navigation",
      sectionId: "top-level",
      context: "旧版把“文献搜索”“期刊搜索”“文件夹”分别放在顶栏",
      reason: "解释旧顶栏与现行六功能导航的迁移关系。",
    },
    {
      term: "功能广场",
      articleSlug: "scholay-plaza",
      sectionId: "naming",
      context: "旧版“功能广场”词条仍可用于理解外部科研工具目录及其运营规则",
      reason: "保留旧词条的兼容检索和历史指向。",
    },
    {
      term: "科研能力广场",
      articleSlug: "scholay-plaza",
      sectionId: "naming",
      context: "旧版“科研能力广场”也不再是顶栏名称",
      reason: "明确旧顶栏名称已经退役。",
    },
  ];

export const WIKI_DEPRECATED_TERMS = [
  ...new Set(WIKI_TERMS.flatMap((term) => term.deprecated)),
].sort((left, right) => right.length - left.length);
