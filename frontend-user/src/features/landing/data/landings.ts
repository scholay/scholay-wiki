/**
 * 6 个功能 Landing 页的全部文案 —— 数据驱动 LandingTemplate。
 *
 * 内容来源:.pen `[Landing] xxx` 6 个 frame(SE5Ej / vNqFk / rHUB0 / LofuI / Jwfbj / DJav9)。
 * 设计稿里每页 11 个 section,本数据集精简到 7 个高复用 section:
 *   Hero · TrustStrip · Features(3 卡) · Workflow(3-5 步) · Stats(4 数字) · FAQ(4 项) · DarkCTA
 *
 * 想新增 / 调整某个页面 → 改这里就行,不动模板和组件。
 */

export type LandingKey =
  | 'search'
  | 'library'
  | 'prism'
  | 'claw'
  | 'submit'
  | 'peer-review';

/** 大标题分行 —— italic=true 用 Playfair Display 斜体(.pen 模式) */
export interface TitleLine {
  text: string;
  italic?: boolean;
}

export interface CTAButton {
  label: string;
  href: string;
}

export interface FeatureCard {
  eyebrow: string;
  title: string;
  desc: string;
  /** 右下 KPI 小标签(可选,如「减少 92% 幻觉」) */
  kpi?: { text: string; tone: 'green' | 'amber' | 'red' | 'neutral' };
  /** 暗色卡变体(本张卡片黑底白字) */
  dark?: boolean;
}

export interface WorkflowStep {
  tag: string;
  title: string;
  desc: string;
}

export interface Stat {
  value: string;
  label: string;
  sub?: string;
  /** 数字颜色 token(默认 foreground) */
  tone?: 'foreground' | 'red' | 'amber' | 'green';
}

export interface FAQ {
  q: string;
  a: string;
}

// ---- 新增 section 类型 ----

/** UseCase 卡 —— 适用场景 3 卡(.pen 各页 6 / yqX9y / GVRM8 / mlAJ1 / TTRw2 / tyliy / p5ril) */
export interface UseCase {
  /** 顶部小 tag(可选,Prism 用 "博士候选人/博士后/期刊作者") */
  tag?: string;
  /** lucide icon 名,头像位置(可选) */
  icon?: string;
  /** Playfair italic 大标题 —— 角色名(研究生 / PI / 编辑 …) */
  title: string;
  /** Playfair italic 副标题(Prism 用 PhD / Postdoc / Journals) */
  subtitle?: string;
  /** 描述段 */
  desc: string;
  /** 3 个 bullet 列表项 */
  bullets: string[];
  /** 卡片主题:light(白底)/ dark(黑底白字)/ amber(米黄底) —— 三卡常交替 */
  theme?: 'light' | 'dark' | 'amber';
}

/** 比较表单元格 —— 三种形态:check icon / x icon / text(可带 tone 着色) */
export type ComparisonCell =
  | { kind: 'check' }
  | { kind: 'x' }
  | { kind: 'tilde' }
  | { kind: 'text'; text: string; tone?: 'good' | 'neutral' | 'weak' }
  | { kind: 'mixed'; icon: 'check' | 'x' | 'tilde'; text: string; tone?: 'good' | 'neutral' | 'weak' };

export interface ComparisonColumn {
  label: string;
  /** Scholay 自家产品列 —— 高亮 + 可加 badge */
  highlight?: boolean;
  badge?: string;
}

export interface ComparisonRow {
  /** 维度 / 能力 名 */
  label: string;
  cells: ComparisonCell[];
}

export interface ComparisonSection {
  eyebrow: string;
  title: string;
  sub?: string;
  /** 暗底(.pen 多数页) / 亮底(PeerReview Dvlne) */
  theme: 'dark' | 'light';
  columns: ComparisonColumn[];
  rows: ComparisonRow[];
}

/** Testimonials 用户引述 —— 目前只 Submit 用,.pen kD0nu */
export interface TestimonialCard {
  quote: string;
  author?: string;
  role?: string;
}
export interface TestimonialsSection {
  eyebrow: string;
  title: string;
  items: TestimonialCard[];
}

/** Hero 右侧 mock —— 3 个 key 对应 SearchMatrix / PrismEditor / ClawChat 三个组件 */
export type HeroMockKey = 'search-matrix' | 'prism-editor' | 'claw-chat';

/** 顶部品牌徽章(eyebrow chip) —— 例如 ● 全新发布 · 文献搜索 2.0 */
export interface Eyebrow {
  /** 圆点 / 星号 / 其他符号,可选 */
  dot?: string;
  dotColor?: 'red' | 'amber' | 'green';
  text: string;
}

export interface LandingFeature {
  key: LandingKey;
  /** 路由 slug,e.g. /features/search */
  slug: string;
  /** 短显示名,用于页脚 / 顶部导航 */
  name: string;
  /** browser title */
  pageTitle: string;
  /** meta description */
  metaDesc: string;
  /** meta keywords (逗号分隔, 单条字符串) */
  metaKeywords: string;

  hero: {
    eyebrow: Eyebrow;
    titleLines: TitleLine[];
    description: string;
    primaryCTA: CTAButton;
    secondaryCTA?: CTAButton;
    checkMeta: string[];
    /** Hero 右侧 mock 组件 key —— Search / Prism / Claw 有,其他 3 页不传走单列居中 hero */
    mockKey?: HeroMockKey;
  };

  trust: {
    /** 上方提示文字,e.g. 「已被全球 280+ 实验室与研究小组使用」 */
    label: string;
    /** 一行 logo 文字(模拟品牌排版而非真 logo 图) */
    logos: string[];
  };

  featuresHeader: {
    eyebrow: string;
    title: string;
    sub: string;
  };
  features: FeatureCard[];

  workflowHeader: {
    eyebrow: string;
    title: string;
    sub: string;
  };
  steps: WorkflowStep[];

  stats: Stat[];
  /** Stats 段是否暗底变体(.pen DJav9 同行评审独此一份) */
  statsDark?: boolean;

  /** 使用场景 3 卡 —— 6 页都有 */
  useCasesHeader: { eyebrow: string; title: string; sub?: string };
  useCases: UseCase[];

  /** 比较表 —— 5/6 页有(Submit 没有,改为 testimonials) */
  comparison?: ComparisonSection;

  /** 用户评价 —— 只 Submit 有 */
  testimonials?: TestimonialsSection;

  faqHeader: {
    eyebrow: string;
    title: string;
    sub?: string;
  };
  faqs: FAQ[];

  finalCTA: {
    eyebrow: string;
    titleLines: TitleLine[];
    sub: string;
    primaryCTA: CTAButton;
    secondaryCTA?: CTAButton;
    metaChips: string[];
  };
}

// ============================================================================
// 1. 文献搜索 —— .pen SE5Ej
// ============================================================================
const search: LandingFeature = {
  key: 'search',
  slug: 'search',
  name: '文献搜索',
  pageTitle: '文献搜索 · Scholay学术 — 用一句中文,读懂一整个研究领域',
  metaDesc:
    'Scholay 文献搜索基于自然语言理解,跨数千万篇学术论文同时检索、引文矩阵分析与语义图谱探索,让你像与同行对话一样发现关联文献。',
  metaKeywords:
    '文献搜索,学术搜索,论文检索,语义搜索,中文学术搜索,引文矩阵,Semantic Scholar,OpenAlex,PubMed,Scholay',

  hero: {
    eyebrow: { dot: '●', dotColor: 'red', text: '全新发布 · 文献搜索 2.0' },
    titleLines: [
      { text: '用一句中文,' },
      { text: '读懂一整个研究领域。', italic: true },
    ],
    description:
      'Scholay 文献搜索基于自然语言理解,跨数千万篇学术论文同时检索、引文矩阵分析与语义图谱探索,让你像与同行对话一样发现关联文献,支持中英文混合检索,并与「文件夹」无缝集成。',
    primaryCTA: { label: '开始免费检索', href: '/search' },
    secondaryCTA: { label: '观看 2 分钟演示', href: '#demo' },
    checkMeta: ['无需信用卡', '支持中英文', 'Free 档即可体验'],
    mockKey: 'search-matrix',
  },

  trust: {
    label: '已被全球 280+ 实验室与研究小组使用',
    logos: [
      'Tsinghua',
      'PEKING UNIV.',
      '复旦大学',
      'Nature',
      'NeurIPS',
      'arXiv',
      '上海交大',
      'ScienceDirect',
    ],
  },

  featuresHeader: {
    eyebrow: '为什么选择 Scholay 搜索',
    title: '不是关键词搜索,是研究语义搜索。',
    sub: '把传统检索的关键词匹配,升级为对研究意图的理解 —— 同时拥有引文矩阵与语义图谱两套坐标系。',
  },
  features: [
    {
      eyebrow: '01 / 自然语言查询',
      title: '中文问句即可启动检索。',
      desc: '把「大语言模型在低资源语言上的对齐方法有哪些进展」这种描述性问题直接当作查询,后端在多个上游论文源同时 fan-out,合并去重后返回。',
      kpi: { text: '多源并行 · 平均 1.4s', tone: 'green' },
    },
    {
      eyebrow: '02 / 引文矩阵',
      title: '一表看清谁引用了谁。',
      desc: '所有命中结果可一键展开为可排序矩阵,横轴是引用,纵轴是被引用,关键节点即综述候选。',
      kpi: { text: '最长 200 篇 × 200 篇', tone: 'amber' },
      dark: true,
    },
    {
      eyebrow: '03 / 语义图谱',
      title: '从一篇论文,走到一个领域。',
      desc: '以任意论文为种子,自动展开 N 阶引用 / 共被引网络,节点带聚类着色与中心度提示,帮你绘制综述拓扑。',
      kpi: { text: '支持导出 JSON / GEXF', tone: 'neutral' },
    },
  ],

  workflowHeader: {
    eyebrow: '工作流',
    title: '从模糊的问题,走到清晰的综述清单。',
    sub: 'Scholay 搜索的设计哲学是:每一次搜索都应该是一次研究行动 —— 而不是返回 100 条无关链接。',
  },
  steps: [
    {
      tag: 'Step 01 · 用语言提问',
      title: '把研究意图直接说出来。',
      desc: '不用拼关键词、不用布尔运算,中英文混合也无妨。后端会把句子拆解成主题 / 方法 / 数据集等维度,在三源里分别命中。',
    },
    {
      tag: 'Step 02 · 矩阵筛选',
      title: '用引文密度快速锁定关键论文。',
      desc: '展开引文矩阵,按年份、被引数、机构筛选;一眼就能看到「被多次引用又互相引用」的核心节点,综述候选自动浮现。',
    },
    {
      tag: 'Step 03 · 一键入库',
      title: '收藏到「文件夹」,无缝接续。',
      desc: '看中的论文一键加入个人文件夹,自动按主题打 AI 标签;后续 Claw 问答和 Prism 写作都能调用同一份数据。',
    },
  ],

  stats: [
    { value: '200M+', label: '可检索学术论文', sub: '覆盖多个上游学术源' },
    { value: '1.4 s', label: '平均多源响应', sub: '已在 12,000+ 高并发查询下验证' },
    { value: '280+', label: '科研团队使用', sub: '覆盖 C9 + 海外多所研究型大学' },
    { value: '15+', label: '可导出格式', sub: 'BibTeX / RIS / GB-7714 / APA …', tone: 'amber' },
  ],

  useCasesHeader: {
    eyebrow: '使用场景',
    title: '为不同的研究角色而设计。',
    sub: '无论你正在准备开题报告、撰写综述,还是带领一个 30 人的实验室,Scholay 文献搜索都能与你的研究节奏对齐。',
  },
  useCases: [
    {
      icon: 'graduation-cap',
      title: '研究生',
      desc: '从一句开题问题,到一份可写的综述大纲 —— 快速找到你需要精读的 20 篇核心论文。',
      bullets: [
        '自动归纳每篇论文的核心贡献、数据集与缺陷',
        '按方法、年份分组,便于组织综述',
        '导师风格的反问与引导式追问',
      ],
      theme: 'light',
    },
    {
      icon: 'flask-conical',
      title: '独立研究者',
      desc: '跨学科追踪一个新兴方向。识别核心团队、追踪争议节点、生成可引用的文献综合视图。',
      bullets: [
        '跨论文比较:方法、指标、数据集差异',
        '识别尚未解决的开放问题与潜在合作者',
        '中英文论文同等支持,覆盖国内外期刊',
      ],
      theme: 'light',
    },
    {
      icon: 'users',
      title: '实验室 PI',
      desc: '为学生指明阅读路径,把团队的文件夹结构化为可继承的研究资产,节省培训新成员的时间。',
      bullets: [
        '团队共享文件夹,统一研究主线',
        '为新生生成「先读 30 篇」的阅读路径',
        '基金申请与开题答辩材料自动汇总',
      ],
      theme: 'light',
    },
  ],

  comparison: {
    eyebrow: '对比',
    title: '传统数据库检索 vs. Scholay 文献搜索',
    sub: '为什么我们觉得是时候换一种检索方式?以下是与传统关键词数据库的真实对比。',
    theme: 'dark',
    columns: [
      { label: '维度' },
      { label: '传统数据库' },
      { label: 'Scholay 文献搜索', highlight: true },
    ],
    rows: [
      {
        label: '查询方式',
        cells: [
          { kind: 'text', text: '关键词 + 布尔运算符;需要预先猜对用语', tone: 'weak' },
          { kind: 'text', text: '自然语言提问,理解研究意图', tone: 'good' },
        ],
      },
      {
        label: '结果呈现',
        cells: [
          { kind: 'text', text: '按相关性或日期排序的长列表,需手动比对', tone: 'weak' },
          { kind: 'text', text: '引文矩阵 + 语义图谱,结构化呈现', tone: 'good' },
        ],
      },
      {
        label: '跨论文关系',
        cells: [
          { kind: 'text', text: '仅引文数与作者;需手工梳理脉络', tone: 'weak' },
          { kind: 'text', text: '方法、概念、数据集层面的隐性关联自动发掘', tone: 'good' },
        ],
      },
      {
        label: '中英文支持',
        cells: [
          { kind: 'text', text: '英文为主,中文论文需切换平台', tone: 'weak' },
          { kind: 'text', text: '中英文一同检索、互相对齐', tone: 'good' },
        ],
      },
      {
        label: '归档与复用',
        cells: [
          { kind: 'text', text: '导出 BibTeX 与 PDF;后续整理在外部工具', tone: 'weak' },
          { kind: 'text', text: '自动归入「文件夹」,与研究助手联动', tone: 'good' },
        ],
      },
    ],
  },

  faqHeader: {
    eyebrow: '常见问题',
    title: '在你按下「开始检索」之前。',
    sub: '没找到答案?到「联系我们」给我们写信,或查看完整帮助文档。',
  },
  faqs: [
    {
      q: 'Scholay 搜索与传统学术搜索引擎的核心区别?',
      a: '传统学术搜索是关键词检索 + 简单引用次数排序。Scholay 把检索升级为「自然语言问题 → 多源并行 → 引文矩阵 → 语义图谱」的工作流,目标是让你从「找到论文」到「读懂一个领域」。',
    },
    {
      q: '是否支持中文论文?',
      a: '支持。Scholay 聚合的多个上游学术源覆盖中文核心期刊与英文文献,跨语言检索能在中文提问下命中英文论文,反之亦然。',
    },
    {
      q: '搜索结果可以导出吗?',
      a: '可以。所有命中结果可一键导出 BibTeX / RIS / EndNote XML / GB-7714 / APA 文本,或直接 push 到个人文件夹中持续追踪。',
    },
    {
      q: 'Free 有多少搜索次数限制?',
      a: '论文检索与文献管理不限次、不耗额度。智能搜索等 AI 能力按 7 天周期额度计,Free 档即可体验,Pro / Max 提供更高额度,详见定价页。',
    },
  ],

  finalCTA: {
    eyebrow: 'START SEARCHING SMARTER',
    titleLines: [{ text: '让下一次文献调研,从一句中文开始。', italic: true }],
    sub: '免费创建账号,即刻使用 Scholay 文献搜索;Pro / Max 提供更高 AI 额度,也可通过站内活动与兑换码获得权益。',
    primaryCTA: { label: '立即免费开始', href: '/search' },
    secondaryCTA: { label: '预约 30 分钟产品演示', href: '/contact' },
    metaChips: ['无需信用卡', '支持中英文', 'Free 档即可体验'],
  },
};

// ============================================================================
// 2. 文件夹 —— .pen vNqFk
// ============================================================================
const library: LandingFeature = {
  key: 'library',
  slug: 'library',
  name: '文件夹',
  pageTitle: '文件夹 · Scholay学术 — 千篇文献,一处归档',
  metaDesc:
    '用文件夹树结构与 AI 自动打标签,管理 1000+ 篇论文;浏览器内高亮批注 PDF,多端实时同步,一键导出 BibTeX/RIS 引用,并与团队成员实时协作。',
  metaKeywords:
    '文件夹,文献管理,论文收藏,PDF 批注,BibTeX 导出,RIS 导出,文献协作,文献云同步,Zotero 替代,Scholay',

  hero: {
    eyebrow: { text: '文件夹 · FOLDERS' },
    titleLines: [
      { text: '为科研而生的 文件夹', italic: true },
      { text: '千篇文献,一处归档' },
    ],
    description:
      '用文件夹树结构与 AI 自动打标签,管理 1000+ 篇论文;浏览器内高亮批注 PDF,多端实时同步,一键导出 BibTeX / RIS 引用,并与团队成员实时协作。',
    primaryCTA: { label: '免费试用 文件夹', href: '/library' },
    secondaryCTA: { label: '观看 2 分钟演示', href: '#demo' },
    checkMeta: ['无需信用卡', '免费开始使用', '支持中英文界面'],
  },

  trust: {
    label: '科研团队怎么用 文件夹',
    logos: [
      'Tsinghua',
      'Peking Univ.',
      'Fudan',
      '上海交大',
      'ZJU',
      'CAS',
      'HKU',
      'NTU',
    ],
  },

  featuresHeader: {
    eyebrow: '为什么是 Scholay 文件夹',
    title: '不是网盘,是为论文设计的工作台。',
    sub: '存储只是基础。真正的价值在于 —— 让 1000 篇论文按你的研究路径排好队、与 AI 助手共享同一片上下文。',
  },
  features: [
    {
      eyebrow: '01 / 多层文件夹树',
      title: '像写大纲一样组织文献。',
      desc: '按章节 / 主题 / 来源任意嵌套,拖拽即可分类;每个论文支持归入多个文件夹,不再为「这篇该放哪」纠结。',
      kpi: { text: '无限层级', tone: 'neutral' },
    },
    {
      eyebrow: '02 / PDF 全文阅读',
      title: '浏览器里高亮 + 批注,实时同步。',
      desc: '内置 PDF 阅读器支持四色高亮、便签批注、跨端书签;关闭浏览器再打开,所有批注原样还原。',
      kpi: { text: '支持 200MB 单文件', tone: 'amber' },
      dark: true,
    },
    {
      eyebrow: '03 / AI 自动标签',
      title: '一键打标签,告别手动整理。',
      desc: '上传新论文时,AI 阅读摘要与正文,自动建议主题 / 方法 / 数据集 / 应用领域四类标签,你只需点击确认。',
      kpi: { text: '准确率 91%', tone: 'green' },
    },
  ],

  workflowHeader: {
    eyebrow: '工作流',
    title: '从 PDF,到可对话的研究资产。',
    sub: '上传 → AI 解析 → 分类归档 → 跨端共享 —— 每一步都为下一步的「写综述」「问 Claw」「投稿引用」做好准备。',
  },
  steps: [
    {
      tag: 'Step 01 · 一键导入',
      title: '从 Zotero / EndNote / 网盘批量迁移。',
      desc: '支持 BibTeX / RIS / EndNote XML 一次导入数百条;PDF 拖入页面即上传,支持 Zotero 现有库直接同步。',
    },
    {
      tag: 'Step 02 · AI 解析与归档',
      title: 'AI 阅读摘要 → 自动归类 + 打标签。',
      desc: '上传后 30 秒内,AI 给出建议的目标文件夹、关键词标签、所属研究领域;你可以一键采纳,也能手工微调。',
    },
    {
      tag: 'Step 03 · 多端协作',
      title: 'PC / 平板 / 多端实时同步。',
      desc: '文件夹可通过分享链接与提取码开放给同门,批注 / 高亮 / 阅读进度实时同步,告别微信传 PDF。',
    },
  ],

  stats: [
    { value: '不限量', label: '单账号论文容量', sub: '收藏与管理不耗 AI 额度' },
    { value: '91%', label: 'AI 自动标签准确率', sub: '基于 5 万篇标注论文测试', tone: 'green' },
    { value: '4 种', label: '批注颜色 + 便签', sub: '跨端实时同步' },
    { value: '12+', label: '导出引用格式', sub: 'BibTeX / RIS / GB-7714 / APA …' },
  ],

  useCasesHeader: {
    eyebrow: '适用场景',
    title: '为每一种科研角色而设计。',
    sub: '无论你在写学位论文、带实验室,还是做系统性综述,文件夹都能贴合你的研究节奏。',
  },
  useCases: [
    {
      icon: 'graduation-cap',
      title: '学位论文写作者',
      desc: '硕博期间积累的 1000+ 篇文献,按章节、按研究问题归档;写作时用 Claw 直接引用,自动生成符合 GB/T 7714 的参考文献列表。',
      bullets: [
        '按章节自动分组的研究笔记',
        'GB/T 7714、APA、IEEE 一键切换',
        '答辩前一键导出文献综述',
      ],
      theme: 'amber',
    },
    {
      icon: 'flask-conical',
      title: '实验室团队',
      desc: '导师与学生共用同一文献库,组会前批量分享待读列表。批注实时可见,新生入组就能看懂前辈的思考路径。',
      bullets: [
        '共享文件夹 · 权限分级',
        '实时批注 · 评论 @ 提醒',
        '组会模式:自动汇总本周阅读',
      ],
      theme: 'dark',
    },
    {
      icon: 'library',
      title: '系统性综述作者',
      desc: 'PRISMA 流程友好:从多个学术数据库批量导入,去重、筛选、纳排标准全部可追溯。Prism 智能体协助做证据矩阵抽取。',
      bullets: [
        'PRISMA 流程图自动生成',
        'AI 抽取:人群 · 干预 · 结局',
        '双人独立筛选 + 冲突解决',
      ],
      theme: 'light',
    },
  ],

  comparison: {
    eyebrow: '对比',
    title: '与 Zotero · Mendeley · EndNote 的关键差异',
    sub: '传统工具善于管理,文件夹还懂阅读、批注、协作与 AI 深度推理。',
    theme: 'dark',
    columns: [
      { label: '能力' },
      { label: 'Scholay 文件夹', highlight: true },
      { label: 'Zotero' },
      { label: 'Mendeley' },
      { label: 'EndNote' },
    ],
    rows: [
      {
        label: '浏览器内 PDF 高亮 + 批注',
        cells: [{ kind: 'check' }, { kind: 'text', text: '需插件' }, { kind: 'x' }, { kind: 'x' }],
      },
      {
        label: 'AI 自动打标签 · 元数据抽取',
        cells: [{ kind: 'check' }, { kind: 'x' }, { kind: 'text', text: '部分' }, { kind: 'x' }],
      },
      {
        label: 'Prism 智能体 · 深度阅读问答',
        cells: [{ kind: 'check' }, { kind: 'x' }, { kind: 'x' }, { kind: 'x' }],
      },
      {
        label: '团队共享文件夹 · 实时协作',
        cells: [{ kind: 'check' }, { kind: 'text', text: '群组' }, { kind: 'text', text: '群组' }, { kind: 'x' }],
      },
      {
        label: 'BibTeX / RIS / GB/T 7714 导出',
        cells: [{ kind: 'check' }, { kind: 'check' }, { kind: 'check' }, { kind: 'check' }],
      },
      {
        label: '多端同步 · iPad · Web · 离线',
        cells: [{ kind: 'check' }, { kind: 'text', text: '桌面为主' }, { kind: 'check' }, { kind: 'text', text: '付费' }],
      },
      {
        label: '中文界面 + 中文知识图谱',
        cells: [{ kind: 'check' }, { kind: 'text', text: '社区译' }, { kind: 'x' }, { kind: 'x' }],
      },
    ],
  },

  faqHeader: {
    eyebrow: '常见问题',
    title: '关于文件夹,你可能想知道。',
    sub: '更多问题?到「联系我们」给我们写信,我们 48 小时内回复。',
  },
  faqs: [
    {
      q: '可以从 Zotero / EndNote 导入吗?',
      a: '可以。支持 Zotero 现有库一键同步,EndNote 与 Mendeley 通过 BibTeX / RIS 文件批量导入;PDF 与笔记会一并保留。',
    },
    {
      q: 'PDF 高亮 / 批注会被保留吗?',
      a: '会。所有批注 / 高亮 / 便签都存储在云端,跨 PC / 平板 / 手机实时同步;导师与学生共享文件夹时,批注按用户区分显示。',
    },
    {
      q: '是否支持团队 / 课题组?',
      a: '支持通过分享链接与提取码共享文献集,组内成员可一键转存到自己的文件夹;更多团队协作能力正在建设中。',
    },
    {
      q: '文献数据如何保护?',
      a: '所有上传文献端到端 AES-256 加密存储,仅你与共享对象可见;AI 解析仅用于你本人的标签建议,从不参与模型训练。',
    },
  ],

  finalCTA: {
    eyebrow: 'START YOUR LIBRARY',
    titleLines: [{ text: '让下一篇论文,先有个家。', italic: true }],
    sub: '免费创建文件夹,收藏与管理文献不限量、不耗额度;Pro / Max 提供更高 AI 额度,支持兑换码与站内活动获得权益。',
    primaryCTA: { label: '立即免费创建', href: '/library' },
    secondaryCTA: { label: '预约 30 分钟演示', href: '/contact' },
    metaChips: ['收藏不限量', '无需信用卡', '中英双语'],
  },
};

// ============================================================================
// 3. Prism · AI 学术写作 —— .pen rHUB0
// ============================================================================
const prism: LandingFeature = {
  key: 'prism',
  slug: 'prism',
  // name 与产品菜单的 feature 名一致(顶栏 carousel / Footer 解决方案 popover
  // 都用 "智能写作")。Prism / Claw 等品牌词只保留在 hero / 正文 marketing copy。
  name: '智能写作',
  pageTitle: 'Prism · Scholay学术 — AI 学术写作 + LaTeX 编辑器',
  metaDesc:
    '在浏览器里写 LaTeX,在 AI 协作中完成论文。Prism 把实时预览、文献引用、润色批注、模板套用与版本协作合并到一个简洁的编辑器里。',
  metaKeywords:
    'LaTeX 编辑器,在线 LaTeX,AI 学术写作,论文写作,模板套用,文献引用,Overleaf 替代,Prism,Scholay',

  hero: {
    eyebrow: { dot: '✦', dotColor: 'amber', text: 'PRISM · AI 学术写作 + LATEX 编辑器' },
    titleLines: [
      { text: '学术写作的' },
      { text: '下一种姿态。', italic: true },
    ],
    description:
      '在浏览器里写 LaTeX,在 AI 协作中完成论文。Prism 把实时预览、文献引用、润色批注、模板套用与版本协作合并到一个简洁的编辑器里 —— 为博士、博士后与期刊作者而设计。',
    primaryCTA: { label: '免费开始写作', href: '/prism' },
    secondaryCTA: { label: '观看 2 分钟演示', href: '#demo' },
    checkMeta: ['无需信用卡', '中英双语', '兼容 Overleaf 项目'],
    mockKey: 'prism-editor',
  },

  trust: {
    label: '已被全球研究型大学的博士与期刊作者使用',
    logos: [
      'Tsinghua',
      'Stanford',
      'MIT',
      'ETH Zürich',
      'Oxford',
      'Cambridge',
      '上海交大',
      '复旦大学',
    ],
  },

  featuresHeader: {
    eyebrow: '为什么写 Prism',
    title: '把 Overleaf + Claude + Zotero,放进同一个编辑器。',
    sub: '在这里,LaTeX 编译、AI 润色、文献引用、模板套用、版本协作,全部在一个 tab 完成,不再多窗口跳转。',
  },
  features: [
    {
      eyebrow: '01 / 实时双栏预览',
      title: '左侧改代码,右侧秒级 PDF。',
      desc: '增量编译毫秒响应,公式 / 图表 / 参考文献全部所见即所得;不再为 5 秒一次 full rebuild 等到泡咖啡回来。',
      kpi: { text: '增量编译 < 200ms', tone: 'green' },
    },
    {
      eyebrow: '02 / AI 学术润色',
      title: '一键让段落更像 Nature 风格。',
      desc: '内置学术写作 AI,可指定目标期刊调性进行润色、改写、扩写;支持中→英、英→中双向翻译并保留 LaTeX 标签。',
      kpi: { text: '兼容 Nature / Cell / IEEE 风格', tone: 'amber' },
      dark: true,
    },
    {
      eyebrow: '03 / 一键引用',
      title: '从文件夹直接 \\cite{},无需复制 key。',
      desc: '光标处按 ⌘ K 调出文件夹搜索,选中即插入 \\cite{};参考文献章节自动生成,支持 IEEE / APA / GB-7714 任意切换。',
      kpi: { text: '12 种引用样式', tone: 'neutral' },
    },
  ],

  workflowHeader: {
    eyebrow: '工作流',
    title: '从空白 .tex,到投稿模板。',
    sub: 'Prism 围绕「学术写作的全生命周期」设计 —— 从模板套用到协作终稿,全程不离开浏览器。',
  },
  steps: [
    {
      tag: 'Step 01 · 选模板',
      title: '从期刊官方模板起步,免去格式踩坑。',
      desc: 'IEEE / ACM / Springer / Nature 等 200+ 期刊与会议模板预置,选中即套用;BibTeX 引用样式自动匹配。',
    },
    {
      tag: 'Step 02 · 边写边引',
      title: 'AI 帮你写,文件夹帮你引。',
      desc: '在段落里按 ⌘ I 让 AI 续写、扩写或润色;按 ⌘ K 从文件夹插入引用 —— 写作与文献调研无缝切换。',
    },
    {
      tag: 'Step 03 · 协作 + 投稿',
      title: '导师批注、版本对比、一键打包投稿。',
      desc: '邀请合著者共编,所有修改有 diff 历史;终稿可直接打包为目标期刊要求的 zip,接入「智能投稿」一键提交。',
    },
  ],

  stats: [
    { value: '200+', label: '期刊与会议模板', sub: 'IEEE / Nature / ACM / Springer …' },
    { value: '< 200ms', label: '增量编译耗时', sub: '比 Overleaf 快 4×', tone: 'green' },
    { value: '12 种', label: '内置引用样式', sub: 'IEEE / APA / GB-7714 …' },
    { value: '6,800+', label: '活跃博士作者', sub: '覆盖 50+ 学科' },
  ],

  useCasesHeader: {
    eyebrow: 'USE CASES',
    title: '为不同阶段的学者而设计。',
    sub: '无论你刚开始第一个章节,还是在准备投稿的第三轮 rebuttal,Prism 都能贴近你的节奏。',
  },
  useCases: [
    {
      tag: '博士候选人',
      title: 'PhD',
      desc: '从开题到大论文,Prism 协助你管理跨章节的文献、术语与符号一致性,并保留每一次答辩前修改的语义级历史。',
      bullets: ['长文档大纲与跨章节引用', '答辩 PPT 自动从论文生成', '导师批注 + AI 建议双视图'],
      theme: 'light',
    },
    {
      tag: '博士后',
      title: 'Postdoc',
      desc: '在多个 ongoing project 之间并行推进。Prism 用统一的文件夹、模板栈与 AI 助手,让你在一个工作区完成所有论文与基金申请。',
      bullets: ['项目工作区 + 共享文献', '基金书 / 简历 / 学术报告模板', 'NSFC / NSF / Horizon 报告体例'],
      theme: 'dark',
    },
    {
      tag: '期刊作者',
      title: 'Journals',
      desc: '针对 IEEE、ACM、Nature、Cell、Springer 提供经验证的体例与提交清单。润色到符合 native-speaker 水平,投稿前最后一公里。',
      bullets: ['60+ 期刊体例模板', 'Rebuttal 助手与回应函生成', '投稿前体例自检 (Submission Lint)'],
      theme: 'amber',
    },
  ],

  comparison: {
    eyebrow: 'PRISM · OVERLEAF · WORD',
    title: '为什么不是 Overleaf,也不是 Word',
    sub: 'Prism 不是要替代 LaTeX 编辑器,而是把「学术写作」当成一个完整工作流。',
    theme: 'dark',
    columns: [
      { label: '能力' },
      { label: 'Prism', highlight: true, badge: '推荐' },
      { label: 'Overleaf' },
      { label: 'Word + EndNote' },
    ],
    rows: [
      {
        label: 'AI 学术润色',
        cells: [
          { kind: 'mixed', icon: 'check', text: '语义级 · 学科语气', tone: 'good' },
          { kind: 'text', text: '无内置', tone: 'weak' },
          { kind: 'mixed', icon: 'tilde', text: '插件,语义弱' },
        ],
      },
      {
        label: 'LaTeX 在线编译',
        cells: [
          { kind: 'mixed', icon: 'check', text: '< 1s 增量编译', tone: 'good' },
          { kind: 'mixed', icon: 'check', text: '完整支持', tone: 'neutral' },
          { kind: 'mixed', icon: 'x', text: '无 LaTeX', tone: 'weak' },
        ],
      },
      {
        label: '\\cite 文件夹联动',
        cells: [
          { kind: 'mixed', icon: 'check', text: '内置,跨论文复用', tone: 'good' },
          { kind: 'mixed', icon: 'tilde', text: '需 BibTeX' },
          { kind: 'mixed', icon: 'tilde', text: '外部插件' },
        ],
      },
      {
        label: 'MeshDiff · 语义级版本',
        cells: [
          { kind: 'mixed', icon: 'check', text: '句子级 diff + AI 合并', tone: 'good' },
          { kind: 'mixed', icon: 'tilde', text: '行级 git diff' },
          { kind: 'mixed', icon: 'tilde', text: 'Track Changes,无语义' },
        ],
      },
      {
        label: '模板 (IEEE / Nature)',
        cells: [
          { kind: 'mixed', icon: 'check', text: '60+ 已验证模板', tone: 'good' },
          { kind: 'mixed', icon: 'check', text: '社区模板', tone: 'neutral' },
          { kind: 'mixed', icon: 'x', text: 'DOC 体例不可控', tone: 'weak' },
        ],
      },
      {
        label: '中文 / 双语写作',
        cells: [
          { kind: 'mixed', icon: 'check', text: '中英双语 AI · CJK 字体', tone: 'good' },
          { kind: 'mixed', icon: 'tilde', text: '手动配置 xeCJK' },
          { kind: 'mixed', icon: 'tilde', text: '无学术词库' },
        ],
      },
    ],
  },

  faqHeader: {
    eyebrow: '常见问题',
    title: '关于 Prism,你可能想知道。',
  },
  faqs: [
    {
      q: 'Prism 与 Overleaf 的核心区别是?',
      a: 'Overleaf 是纯 LaTeX 协作编辑器。Prism 在此之上原生集成 AI 学术写作、文件夹一键引用、智能投稿打包,把「写 → 改 → 投」三步合并到一个 tab。',
    },
    {
      q: '可以导入 Overleaf 现有项目吗?',
      a: '可以。上传 .zip 或贴 Overleaf 项目 URL 即可一键迁移,所有 .tex / .bib / 图片资源原样保留;反向也可一键导出回 Overleaf 格式。',
    },
    {
      q: 'AI 润色会泄露稿件吗?',
      a: '不会。Prism 所有 AI 调用走私有部署的学术模型,稿件数据不参与训练、不留存于供应商;企业版可选私有化部署。',
    },
    {
      q: '支持中文 LaTeX(xelatex / ctex)?',
      a: '支持。xelatex 与 ctex 宏包默认启用,中文字体自动选用 Source Han Serif / SimSun 等;中英混排无需额外配置。',
    },
  ],

  finalCTA: {
    eyebrow: 'WRITE WITH PRISM',
    titleLines: [{ text: '让下一篇论文,在浏览器里写完。', italic: true }],
    sub: '免费开始写作,Free 档即可体验;Pro / Max 提供更高 AI 额度,支持兑换码与站内活动获得权益。',
    primaryCTA: { label: '立即开始写作', href: '/prism' },
    secondaryCTA: { label: '预约团队演示', href: '/contact' },
    metaChips: ['无需信用卡', '兼容 Overleaf', '中英双语'],
  },
};

// ============================================================================
// 4. Claw · AI 学术助手 —— .pen LofuI
// ============================================================================
const claw: LandingFeature = {
  key: 'claw',
  slug: 'claw',
  // 同 prism:与产品菜单的 feature 名 "智能助手" 对齐
  name: '智能助手',
  pageTitle: 'Claw · Scholay学术 — 你的学术对话伙伴,基于你的文件夹回答',
  metaDesc:
    'Claw 不是另一个通用 ChatGPT。它根植于你上传的论文、笔记与数据,提供可溯源的引用、可复用的研究路径、以及中英双语的多轮学术对话。',
  metaKeywords:
    '学术 AI 对话,论文问答,文献综述助手,可溯源 AI,RAG 学术,ChatGPT 学术,Claw,Scholay',

  hero: {
    eyebrow: { text: 'CLAW · AI 学术对话助手' },
    titleLines: [
      { text: '你的学术对话伙伴,', italic: true },
      { text: '基于你的文件夹回答。', italic: true },
    ],
    description:
      'Claw 不是另一个通用 ChatGPT。它根植于你上传的论文、笔记与数据,提供 可溯源 的引用、可复用的研究路径、以及 中英双语 的多轮学术对话 —— 让每一次提问都成为一次严谨的研究行动。',
    primaryCTA: { label: '开始与 Claw 对话', href: '/claw' },
    secondaryCTA: { label: '观看 90 秒演示', href: '#demo' },
    checkMeta: ['无需信用卡', '中英双语支持', 'GDPR 合规'],
    mockKey: 'claw-chat',
  },

  trust: {
    label: '被全球顶尖院校的研究者使用',
    logos: [
      'Tsinghua',
      'Peking Univ.',
      'Fudan',
      'Stanford',
      'MIT',
      'ETH Zürich',
      'Oxford',
    ],
  },

  featuresHeader: {
    eyebrow: '为什么选择 CLAW',
    title: '通用 AI 写不动学术,Claw 可以。',
    sub: '三项学术研究中必须具备的能力,Claw 把它们做到了同一处对话窗口里。',
  },
  features: [
    {
      eyebrow: '01 / 文件夹驱动',
      title: '回答全部锚定在你的文件夹里。',
      desc: 'Claw 不会胡编。它只在你上传的论文、笔记和数据范围内推理,确保每一条结论都可追溯、可复核、可写进开题报告。',
      kpi: { text: '减少 92% 幻觉', tone: 'green' },
    },
    {
      eyebrow: '02 / 引用可追溯',
      title: '每个观点都附带原文页码与段落。',
      desc: '点击红色 [1][2] 角标即可跳回原文位置,内置 BibTeX / GB-7714 / APA 多种引用样式,一键导出。',
      kpi: { text: '100% 可溯源', tone: 'amber' },
      dark: true,
    },
    {
      eyebrow: '03 / 中英双语',
      title: '中文提问,英文论文,无需切换。',
      desc: 'Claw 可读英文期刊原文,以你选择的语言回答,并保留学术名词的双语对照 —— 再也不用为每个术语单独查词典。',
      kpi: { text: 'ZH · EN 互译保留术语', tone: 'neutral' },
    },
  ],

  workflowHeader: {
    eyebrow: '工作流',
    title: '从一篇 PDF 到一份开题报告,中间只隔三段对话。',
    sub: 'Claw 的工作机制围绕你的文件夹 (Folders) 展开:上传文献、建立索引、自然语言对话、得到带引用的答案。整个过程严格闭环,适配中文学术写作习惯。',
  },
  steps: [
    {
      tag: '01 · 文献综述 (Literature Review)',
      title: '一句话横向对比 30 篇论文。',
      desc: '让 Claw 自动按方法、数据集与结论分类,生成可直接粘进开题报告的综述段落,并附带完整引用列表。',
    },
    {
      tag: '02 · 方法学头脑风暴 (Methodology)',
      title: '从已被验证的方法路径出发。',
      desc: '针对你的研究问题,Claw 从文件夹中提取已被验证的方法路径,并提出 3-5 个未被充分探索的方向,辅以可行性分析与可能的实验设计。',
    },
    {
      tag: '03 · 逐篇 Q&A 与精读 (Paper Q&A)',
      title: '打开任意 PDF,追问公式 / 图表 / 实验细节。',
      desc: '甚至可以直接询问 "作者为什么这么设计" —— 所有回答都锚定到原文位置,可逐字复核。',
    },
  ],

  stats: [
    { value: '32,000+', label: '全球活跃研究者' },
    { value: '1.2M', label: '已索引文献篇数' },
    { value: '94%', label: '用户文献综述提速' },
    { value: '< 3%', label: '学术回答幻觉率', tone: 'red' },
  ],

  useCasesHeader: {
    eyebrow: '使用场景',
    title: '研究者每天都会用到 Claw 的三件事。',
    sub: '从文献综述到答辩前的方法澄清,Claw 把零散的论文阅读组织成可复用的研究路径。',
  },
  useCases: [
    {
      tag: '01',
      title: '文献综述',
      subtitle: 'Literature Review',
      desc: '一句话让 Claw 横向对比 30 篇论文,自动按方法、数据集与结论分类,生成可直接粘进开题报告的综述段落,并附带完整引用列表。',
      bullets: ['可被批量导出为 BibTeX', '按方法 / 数据集自动分组', '一键写入文件夹'],
      theme: 'light',
    },
    {
      tag: '02',
      title: '方法学头脑风暴',
      subtitle: 'Methodology',
      desc: '针对你的研究问题,Claw 会从文件夹中提取已被验证的方法路径,并提出 3-5 个未被充分探索的方向,辅以可行性分析与可能的实验设计。',
      bullets: ['3-5 个未充分探索方向', '附带可行性分析', '实验设计草稿'],
      theme: 'dark',
    },
    {
      tag: '03',
      title: '逐篇 Q&A 与精读',
      subtitle: 'Paper Q&A',
      desc: '打开任意 PDF,用 Claw 追问公式推导、图表含义、实验细节,甚至直接询问 "作者为什么这么设计" —— 所有回答都锚定到原文位置。',
      bullets: ['追问公式与图表细节', '原文位置可一键跳转', '问答可保存为研究笔记'],
      theme: 'amber',
    },
  ],

  comparison: {
    eyebrow: '为什么不是 ChatGPT',
    title: '通用对话很聪明,学术对话需要更严谨。',
    sub: '同一个问题,Claw 与通用 ChatGPT 的回答方式有本质区别。',
    theme: 'dark',
    columns: [
      { label: '维度' },
      { label: 'CLAW', highlight: true },
      { label: '通用 ChatGPT' },
    ],
    rows: [
      {
        label: '知识来源',
        cells: [
          { kind: 'text', text: '你的文件夹 (Folders)', tone: 'good' },
          { kind: 'text', text: '互联网公开语料', tone: 'weak' },
        ],
      },
      {
        label: '引用可溯源',
        cells: [
          { kind: 'text', text: '每句话附 [n] 引用 + 页码', tone: 'good' },
          { kind: 'text', text: '经常无来源或编造引用', tone: 'weak' },
        ],
      },
      {
        label: '中英学术名词',
        cells: [
          { kind: 'text', text: '保留术语双语对照', tone: 'good' },
          { kind: 'text', text: '翻译易丢专业语义', tone: 'weak' },
        ],
      },
      {
        label: '多轮学术上下文',
        cells: [
          { kind: 'text', text: '保持文件夹长期记忆', tone: 'good' },
          { kind: 'text', text: '会话间记忆受限', tone: 'weak' },
        ],
      },
      {
        label: '幻觉率',
        cells: [
          { kind: 'text', text: '< 3% (内部测试)', tone: 'good' },
          { kind: 'text', text: '30%+ 学术幻觉', tone: 'weak' },
        ],
      },
    ],
  },

  faqHeader: {
    eyebrow: '常见问题',
    title: '研究者在试用前最常问的几件事。',
    sub: '还有其他问题?查看完整 帮助中心,或联系 support@scholay.ai。',
  },
  faqs: [
    {
      q: 'Claw 与 ChatGPT 的核心区别是什么?',
      a: 'Claw 的回答完全锚定在你上传的文件夹中。每条结论都附带 [n] 引用与原文页码,可逐字核对,不存在 ChatGPT 那种 "听上去对但来源不可考" 的输出。',
    },
    {
      q: '我可以上传中文论文吗?',
      a: '可以。Claw 同时支持中英文 PDF、Word、Markdown 与 Zotero 库导入,并能在中文提问时检索英文论文,反之亦然。',
    },
    {
      q: '我的文献数据如何被保护?',
      a: '所有上传文档都经过端到端加密存储 (AES-256),仅用于你本人的对话索引,从不参与模型训练。可随时一键删除或导出。',
    },
    {
      q: '是否提供学生 / 实验室价格?',
      a: '会员分 Free / Pro / Max 三档,Free 档即可体验全部核心功能;可通过站内活动与兑换码获得权益,具体以站内公告为准。',
    },
  ],

  finalCTA: {
    eyebrow: 'CLAW · 你的学术伙伴',
    titleLines: [{ text: '让下一篇论文,从一次对话开始。', italic: true }],
    sub: '加入 32,000+ 研究者,把你的文件夹变成会思考、可对话、有引用的学术伙伴。',
    primaryCTA: { label: '免费开始与 Claw 对话', href: '/claw' },
    secondaryCTA: { label: '预约 30 分钟产品演示', href: '/contact' },
    metaChips: ['文献收藏不限量', '中英双语', '端到端加密'],
  },
};

// ============================================================================
// 5. 智能投稿 —— .pen Jwfbj
// ============================================================================
const submit: LandingFeature = {
  key: 'submit',
  slug: 'submit',
  name: '智能投稿',
  pageTitle: '智能投稿 · Scholay学术 — 一次准备,多刊投稿',
  metaDesc:
    '从期刊匹配到 Cover Letter,Scholay 让 SCI / EI / 核心期刊投稿全流程自动化。AI 阅读你的摘要,自动推荐目标期刊、转换格式、检查参考文献,并生成定制化投稿信。',
  metaKeywords:
    '智能投稿,期刊匹配,SCI 投稿,EI 投稿,Cover Letter 生成,论文格式转换,参考文献检查,目标期刊推荐,Scholay',

  hero: {
    eyebrow: { text: 'AI-POWERED SUBMISSION · 智能投稿' },
    titleLines: [{ text: '一次准备,多刊投稿', italic: true }],
    description:
      '从期刊匹配到 Cover Letter,Scholay 让 SCI / EI / 核心期刊投稿全流程自动化。AI 阅读你的摘要,自动推荐目标期刊、转换格式、检查参考文献,并生成定制化投稿信。',
    primaryCTA: { label: '免费开始投稿', href: '/peer-review' },
    secondaryCTA: { label: '观看 2 分钟演示', href: '#demo' },
    checkMeta: ['无需绑卡', 'Free 档即可体验', '中英双语'],
  },

  trust: {
    label: '已支持 12,000+ 期刊与主流出版集团',
    logos: [
      'ELSEVIER',
      'Springer Nature',
      'Wiley',
      'IEEE',
      'Taylor & Francis',
      'SAGE',
      'MDPI',
    ],
  },

  featuresHeader: {
    eyebrow: 'WHY SCHOLAY · 智能投稿',
    title: '把繁琐的格式调整,交给 AI。',
    sub: '让科研人员专注科研本身。期刊匹配、格式转换、参考文献修改、Cover Letter,我们一并接手。',
  },
  features: [
    {
      eyebrow: '01 / 智能匹配期刊',
      title: 'AI 阅读摘要 → 推荐最匹配的 5-10 个目标刊。',
      desc: 'AI 解析你的摘要、关键词与研究方向,从 12,000+ 期刊数据库中推荐影响因子、审稿周期、录用率最匹配的目标刊。',
      kpi: { text: '12,000+ 期刊覆盖', tone: 'amber' },
    },
    {
      eyebrow: '02 / 自动格式转换',
      title: '一键转换为目标期刊官方模板。',
      desc: '上传 Word、LaTeX、PDF 均可,自动适配 APA、Vancouver、IEEE、Nature 等任意规范;图表自动重新编号,公式格式保留。',
      kpi: { text: '94% 一次过率', tone: 'green' },
      dark: true,
    },
    {
      eyebrow: '03 / AI Cover Letter',
      title: '基于摘要与期刊调性,生成定制化投稿信。',
      desc: '附送审推荐人建议与利益冲突声明模板;支持中英双语、可调语气、可手工微调。',
      kpi: { text: '附送 2 套候选人', tone: 'neutral' },
    },
  ],

  workflowHeader: {
    eyebrow: '五步完成投稿 · 全流程 AI 辅助',
    title: '从匹配到点击提交,最快 30 分钟。',
    sub: '每一步都为下一步做好准备,被拒后无需重做 —— 自动按下一目标期刊重新打包。',
  },
  steps: [
    {
      tag: 'STEP 01 · 期刊选择',
      title: 'AI 阅读你的摘要,10 秒给出匹配清单。',
      desc: '粘贴摘要或上传 Word / PDF,Scholay 给出 5-10 个最匹配期刊:影响因子、Q 分区、平均审稿周期、年录用率、官方投稿入口一目了然,并提示是否 OA。',
    },
    {
      tag: 'STEP 02 · 文稿打包',
      title: '自动适配期刊模板,公式 / 图表零误差。',
      desc: '上传 Word、LaTeX、PDF 均可,Scholay 自动转换为目标期刊的官方模板,图表自动重新编号、参考文献按所选样式重排,公式格式保留。',
    },
    {
      tag: 'STEP 03 · 合规检查',
      title: '重复率 + 参考文献核验,告别 desk reject。',
      desc: '内置查重引擎对比 1.2 亿篇学术文献,逐条标注疑似重复段落;参考文献检查器自动验证 DOI、补全缺失字段、识别撤稿论文。',
    },
    {
      tag: 'STEP 04 · Cover Letter',
      title: '一键生成定制化投稿信。',
      desc: '基于摘要要点、目标期刊定位与主编近期 editorial,AI 起草符合学术规范的 Cover Letter;支持中英双语、可调语气。',
    },
    {
      tag: 'STEP 05 · 投稿提交',
      title: '一键发送 · 全程追踪。',
      desc: '无缝对接 Editorial Manager / ScholarOne 等主流系统,一键上传所有材料;状态变化邮件 / 微信实时提醒。',
    },
  ],

  stats: [
    { value: '12,000+', label: '已支持期刊' },
    { value: '48 min', label: '平均节省的投稿时间' },
    { value: '94%', label: '格式一次通过率' },
    { value: '83,200', label: '已成功投稿作者' },
  ],

  useCasesHeader: {
    eyebrow: 'USE CASES · 适用场景',
    title: '无论你是首次投稿,还是常年与多刊周旋。',
    sub: '从「第一篇 SCI 不知道选哪个刊」到「课题组三十多篇并行管理」,Scholay 都覆盖。',
  },
  useCases: [
    {
      icon: 'graduation-cap',
      title: '研究生与博士新生',
      desc: '对投稿流程不熟悉?Scholay 把每一步拆解为可视化步骤,AI 推荐合适的目标期刊、自动撰写 Cover Letter,让你的第一篇 SCI 投稿不再焦虑。',
      bullets: ['5 步可视化流程', '新手期刊推荐', 'Cover Letter 模板'],
      theme: 'light',
    },
    {
      icon: 'refresh-ccw',
      title: '被拒不再重做',
      desc: '被拒稿后只需选择下一个目标期刊,Scholay 自动适配新模板、重写 Cover Letter、调整参考文献样式,30 秒完成再投准备。',
      bullets: ['一键换刊', '模板自动适配', '30 秒完成再投准备'],
      theme: 'amber',
    },
    {
      icon: 'users',
      title: 'PI 与课题组长',
      desc: '统一管理课题组所有投稿状态,多人协作 Cover Letter、共享期刊匹配偏好,导出年度投稿 / 录用报告供学校评估。',
      bullets: ['课题组统一看板', '年度投录用报告', '多人协作 Cover Letter'],
      theme: 'dark',
    },
  ],

  testimonials: {
    eyebrow: 'TESTIMONIALS · 用户评价',
    title: '科研人怎么说',
    items: [
      {
        quote: '过去一篇 SCI 投三个期刊要重新格式化三次。用 Scholay 后,换刊只点一次。最让我惊讶的是 Cover Letter 草稿质量真的能用。',
        author: '王教授',
        role: '材料学 · 985 高校',
      },
      {
        quote: '作为新博士生第一次投 SCI 真的很迷茫。Scholay 的合规检查让我提前发现了 4 处参考文献错误,否则就被 desk reject 了。',
        author: '李同学',
        role: '生物医学 · 硕博连读',
      },
      {
        quote: '课题组每年要投四十多篇,Scholay 的统一面板让我能一眼看到所有学生的投稿状态,年终汇报材料直接导出。',
        author: '陈 PI',
        role: '计算机视觉 · 实验室负责人',
      },
    ],
  },

  faqHeader: {
    eyebrow: 'FAQ · 常见问题',
    title: '关于智能投稿,你可能想知道。',
    sub: '找不到答案?联系我们的科研顾问,48 小时内回复。',
  },
  faqs: [
    {
      q: '目前覆盖哪些学科与语言?',
      a: '目前覆盖中英双语写作,支持所有 SCI/SSCI/EI/中文核心收录的学科领域,包括理工、医学、人文社科与艺术。',
    },
    {
      q: '被拒后真的不需要重做吗?',
      a: '是。被拒稿后只需选择下一个目标期刊,Scholay 自动适配新模板、重写 Cover Letter、调整参考文献样式,30 秒完成再投准备。',
    },
    {
      q: 'AI 生成的 Cover Letter 真的能用吗?',
      a: '可以直接用。Cover Letter 草稿融合主编近期 editorial、期刊偏好与你的摘要要点,大多数用户只需轻微微调即可使用;支持中英双语、可调语气。',
    },
    {
      q: '稿件数据如何保护?',
      a: '所有上传稿件 AES-256 加密存储,仅你本人可见;AI 模型不会基于你的论文做训练或微调,可随时一键删除。',
    },
  ],

  finalCTA: {
    eyebrow: 'START SUBMITTING SMARTER',
    titleLines: [{ text: '让下一篇论文,少花 5 小时。', italic: true }],
    sub: 'Free 档即可体验完整投稿流程,无需绑卡;Pro / Max 提供更高额度,支持兑换码与站内活动获得权益。',
    primaryCTA: { label: '立即免费开始', href: '/peer-review' },
    secondaryCTA: { label: '预约团队演示', href: '/contact' },
    metaChips: ['无需绑卡', 'Free 档即可体验', '中英双语支持'],
  },
};

// ============================================================================
// 6. 同行评审 —— .pen DJav9
// ============================================================================
const peerReview: LandingFeature = {
  key: 'peer-review',
  slug: 'peer-review',
  name: '同行评审',
  pageTitle: '同行评审 · Scholay学术 — 为学者,重新发明同行评审',
  metaDesc:
    'Scholay 同行评审,是一个为期刊与会议而生的智能评审工作台。结构化评审模板、自动新颖性核查、引用图谱对比、偏见提示。',
  metaKeywords:
    '同行评审,智能评审,审稿工作台,Peer Review,论文新颖性核查,引用图谱对比,期刊评审,Scholay',

  hero: {
    eyebrow: { dot: '●', dotColor: 'red', text: '全新上线 · AI 智能审稿' },
    titleLines: [{ text: '为学者,重新发明同行评审。', italic: true }],
    description:
      'Scholay 同行评审,是一个为期刊与会议而生的智能评审工作台。结构化评审模板、自动新颖性核查、引用图谱对比、偏见提示 —— 让审稿人专注于学术判断,而非繁琐流程。',
    primaryCTA: { label: '立即免费开始', href: '/peer-review' },
    secondaryCTA: { label: '阅读评审政策白皮书', href: '#whitepaper' },
    checkMeta: ['Free 档即可体验', 'Pro / Max 更高额度', '全程匿名'],
  },

  trust: {
    label: '已被以下期刊编辑部与学会试点采用',
    logos: [
      'NATURE METHODS',
      'IEEE TPAMI',
      'Cell Reports',
      'ACM CHI',
      'NeurIPS',
      '中国计算机学会',
      'ICLR',
    ],
  },

  featuresHeader: {
    eyebrow: '为何选择 Scholay 同行评审',
    title: '评审不该是负担。它应当是学术对话的延伸。',
    sub: '从分配、研读、打分到决议 —— 每一步都被重新设计,让审稿人保留判断、让编辑部回收时间、让作者得到真正具有建设性的反馈。',
  },
  features: [
    {
      eyebrow: '01 / 结构化评审模板',
      title: '按学科 / 按期刊预置评审维度。',
      desc: 'Methods / Results / Novelty / Reproducibility 分项打分,自动汇总,告别空泛意见。',
      kpi: { text: '60+ 学科模板', tone: 'neutral' },
    },
    {
      eyebrow: '02 / AI 新颖性核查',
      title: '在打开 PDF 之前,已与 200M+ 文献语义比对。',
      desc: '系统找出最近的 5 篇近作,并指出潜在贡献与重叠;审稿人节省一上午,直接进入学术判断。',
      kpi: { text: '200M+ 已发表文献', tone: 'amber' },
      dark: true,
    },
    {
      eyebrow: '03 / 偏见与冲突提示',
      title: '自动检测合作历史 / 师承 / 同机构关联。',
      desc: '提醒审稿人与编辑保持距离;同时识别评审措辞中的隐性偏见,建议改写。',
      kpi: { text: '减少偏见 78%', tone: 'green' },
    },
  ],

  workflowHeader: {
    eyebrow: '工作流',
    title: '一篇稿件,三个步骤。',
    sub: '从分配到决议,平均用时从 27 天缩短到 11 天。审稿人多花一杯咖啡的时间思考,少花一上午整理格式。',
  },
  steps: [
    {
      tag: '01 · 智能匹配审稿人',
      title: '编辑只需上传 PDF,AI 推荐 8 位候选。',
      desc: '系统根据摘要、关键词、引用图谱推荐候选审稿人,附上其近 3 年发表、当前审稿负荷、利益相关性评估。一键发出邀请,不再追着人脉网络打电话。',
    },
    {
      tag: '02 · 在 PDF 旁,AI 帮你读论文',
      title: 'PDF 阅读器内置 Claw 学术助手。',
      desc: '划线即可询问:「这段方法与之前哪些工作类似?」「这个数学推导是否成立?」答案直接附引文,可作为评审依据。',
    },
    {
      tag: '03 · 递交意见,编辑部一目了然',
      title: '结构化分数自动汇总成可视化雷达图。',
      desc: '文字意见保留风格但去识别。编辑无需再去比对三份评审意见的差异 —— 分歧、共识、置信区间,一屏看完。',
    },
  ],

  stats: [
    { value: '11', label: '天 · 平均决议周期', sub: '相比传统期刊缩短 59%' },
    { value: '78%', label: '审稿邀请响应率', sub: '匹配算法把对的人请到对的稿件' },
    { value: '23', label: '家试点期刊与会议', sub: '覆盖计算机、生物、医学、社科' },
    { value: '4,200+', label: '评审任务已完成', sub: '私测自 2025 年 12 月开放' },
  ],
  statsDark: true,

  useCasesHeader: {
    eyebrow: '使用场景',
    title: '为不同角色,设计不同视角。',
  },
  useCases: [
    {
      tag: '01 / 审稿人',
      title: '少花一上午,多读一篇论文',
      desc: '结构化模板减少 60% 重复劳动,AI 预检让你专注于核心学术判断。审稿历史可作为学术服务记录,写进简历。',
      bullets: ['结构化模板预填 60%', 'AI 预检节省 1 上午', '审稿记录写入简历'],
      theme: 'light',
    },
    {
      tag: '02 / 期刊编辑',
      title: '从分配到决议,27 天 → 11 天',
      desc: '智能匹配把审稿邀请响应率从 31% 提升到 78%。看板视图自动追踪每篇稿件的进度、催促节点、申诉历史。',
      bullets: ['响应率 31% → 78%', '看板自动追踪进度', '申诉历史可回溯'],
      theme: 'dark',
    },
    {
      tag: '03 / 会议程序委员会',
      title: '为千篇投稿,做万次决策',
      desc: '批量导入、自动 bidding、track 分组、Meta-Review 综合视图。提供 CMT / OpenReview 数据迁移工具,平滑过渡。',
      bullets: ['CMT / OpenReview 数据迁移', '自动 bidding + track 分组', 'Meta-Review 综合视图'],
      theme: 'amber',
    },
  ],

  comparison: {
    eyebrow: '对比',
    title: '为什么是 Scholay,而不是又一个邮件附件评审?',
    theme: 'light',
    columns: [
      { label: '能力' },
      { label: 'SCHOLAY', highlight: true },
      { label: '传统期刊系统' },
      { label: 'OpenReview / 邮件' },
    ],
    rows: [
      {
        label: 'AI 新颖性核查',
        cells: [{ kind: 'text', text: '内置 · 200M+ 文献', tone: 'good' }, { kind: 'text', text: '—', tone: 'weak' }, { kind: 'text', text: '—', tone: 'weak' }],
      },
      {
        label: '智能审稿人匹配',
        cells: [{ kind: 'text', text: '语义匹配 + COI 检测', tone: 'good' }, { kind: 'text', text: '关键词检索', tone: 'weak' }, { kind: 'text', text: '手动 bidding', tone: 'weak' }],
      },
      {
        label: '结构化评审模板',
        cells: [{ kind: 'text', text: '按学科预置 · 可定制', tone: 'good' }, { kind: 'text', text: '自由文本', tone: 'weak' }, { kind: 'text', text: '会议级模板', tone: 'weak' }],
      },
      {
        label: 'PDF 内置 AI 助手',
        cells: [{ kind: 'text', text: 'Claw · 引文级回答', tone: 'good' }, { kind: 'text', text: '—', tone: 'weak' }, { kind: 'text', text: '—', tone: 'weak' }],
      },
      {
        label: '中文 / 英文双语原生',
        cells: [{ kind: 'text', text: '全功能双语', tone: 'good' }, { kind: 'text', text: '以英文为主', tone: 'weak' }, { kind: 'text', text: '以英文为主', tone: 'weak' }],
      },
    ],
  },

  faqHeader: {
    eyebrow: '常见问题',
    title: '在你按下「申请加入」之前。',
    sub: '还有更多疑问?到「联系我们」给我们写信,或查看完整文档。',
  },
  faqs: [
    {
      q: 'AI 会替我写评审意见吗?',
      a: '不会。所有上传至 Scholay 同行评审的稿件都被加密存储于独立租户,仅参与该投稿流程的当事人可见。AI 模型不会在你的论文上做训练或微调;语义比对均通过公开发表的引用图谱完成。',
    },
    {
      q: '是否支持双盲、单盲、公开三种模式?',
      a: '支持。期刊可在工作台层面切换默认模式,审稿人 / 作者标识在系统层去识别。投稿前可由编辑或作者偏好覆盖。',
    },
    {
      q: '能否与 CMT / OpenReview / Editorial Manager 集成?',
      a: '提供数据迁移工具 + 双向 API。投稿元数据、审稿历史、决议记录均可批量导入导出,平滑过渡。',
    },
    {
      q: '个人审稿人需要付费吗?',
      a: 'AI 审稿按会员额度计:Free 档可先体验平台基础能力,完整 AI 审稿建议 Pro 起,Pro / Max 提供更高额度;也可通过兑换码与站内活动获得权益。',
    },
  ],

  finalCTA: {
    eyebrow: '现在开始使用',
    titleLines: [{ text: '让评审,回归学术。', italic: true }],
    sub: '注册即可在 Free 档体验 AI 审稿工作台;完整 AI 审稿建议 Pro 起,Pro / Max 提供更高额度。',
    primaryCTA: { label: '立即开始', href: '/peer-review' },
    secondaryCTA: { label: '阅读评审政策白皮书', href: '#whitepaper' },
    metaChips: ['无需绑卡', '全程匿名', '中英双语'],
  },
};

// ============================================================================
// Registry
// ============================================================================

export const LANDINGS: Record<LandingKey, LandingFeature> = {
  search,
  library,
  prism,
  claw,
  submit,
  'peer-review': peerReview,
};

/** 页脚 + 顶部导航 用的有序列表 */
export const LANDING_ORDER: LandingKey[] = [
  'search',
  'library',
  'prism',
  'claw',
  'submit',
  'peer-review',
];
