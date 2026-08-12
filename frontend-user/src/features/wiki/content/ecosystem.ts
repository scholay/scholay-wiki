import type { WikiArticle } from "../types";

export const ecosystemArticles: WikiArticle[] = [
  {
    slug: "citation-generator",
    title: "引用生成器",
    summary:
      "把论文元数据转换为可复制的常用引文格式，并保留回到原始论文核对的入口。",
    category: "knowledge",
    kind: "page",
    status: "current",
    audience: ["研究者", "学生"],
    aliases: ["引文生成", "参考文献格式", "Citation Generator"],
    sourcePaths: [
      "frontend-user/src/features/citation/routes.tsx",
      "frontend-user/src/features/citation/pages/CitationGeneratorPage.tsx",
    ],
    related: ["paper", "literature-library"],
    sections: [
      {
        id: "purpose",
        title: "用途",
        markdown: `打开引用生成器后，输入 DOI 自动解析论文，或手动填写题名、作者、年份等信息；再选择 GB/T 7714、APA、MLA、Chicago 或 BibTeX 并复制结果。下图展示的是已解析论文并生成多种格式后的状态。`,
        embeds: [{ id: "citation-generator" }],
      },
      {
        id: "limits",
        title: "核对边界",
        markdown: `引文质量取决于题名、作者、年份、期刊、卷期、页码和标识符等元数据。自动格式化不能修复错误元数据，也不能保证满足每一本期刊的局部变体，提交前仍应对照官方格式。`,
      },
    ],
  },
  {
    slug: "feature-tools",
    title: "功能广场",
    summary:
      "收录 Scholay 站内能力和外部科研工具的可搜索目录，并提供分类、筛选和详情。",
    category: "knowledge",
    kind: "feature",
    status: "current",
    audience: ["所有访客", "研究者", "内容运营"],
    aliases: ["功能大全", "科研工具黄页", "Tools"],
    sourcePaths: [
      "frontend-user/src/features/tools/routes.tsx",
      "frontend-user/src/features/tools/pages/ToolsLayout.tsx",
      "frontend-user/src/features/tools/pages/ToolsCatalogPage.tsx",
      "frontend-user/src/features/tools/pages/ToolDetailPage.tsx",
      "frontend-user/src/features/tools/pages/mobile/MobileToolsHomePage.tsx",
      "frontend-user/src/features/tools/pages/mobile/MobileToolsPage.tsx",
      "frontend-user/src/features/tools/pages/mobile/MobileToolDetailPage.tsx",
      "frontend-user/src/features/tools/pages/mobile/MobilePcOnlyPage.tsx",
      "backend/internal/featuretool",
      "feature-tools-coldstart/feature-tools.json",
    ],
    related: ["community-skills", "mobile-web", "admin-console"],
    sections: [
      {
        id: "catalog",
        title: "目录",
        markdown: `进入功能广场后，你可以按分类浏览工具卡片，也可以搜索关键词，再用形式与价格条件筛选。手机端从工具首页进入目录，筛选条件会在底部面板中展开。下方四张图依次展示桌面目录、移动工具首页、移动目录和移动筛选面板。`,
        embeds: [
          { id: "feature-plaza" },
          { id: "mobile-tools" },
          { id: "mobile-tools-catalog" },
          { id: "mobile-tools-filter-sheet" },
        ],
      },
      {
        id: "access",
        title: "访问方式",
        markdown: `点击工具卡片后，你会看到使用场景、功能、价格、获取方式、替代品、教程和常见问题；再按页面按钮访问网站或下载资源。下图分别展示桌面详情、移动详情，以及手机遇到仅支持电脑的工具时出现的引导页。

外部工具由各自提供者负责，Scholay 的收录不代表对其安全性、效果或持续可用性作出保证。`,
        embeds: [
          { id: "feature-tool-detail" },
          { id: "mobile-tool-detail" },
          { id: "mobile-pc-only-guide" },
        ],
      },
      {
        id: "operations",
        title: "内容运营",
        markdown: `管理员可以维护工具条目、批量导入数据，并设置内容变化通知。导入页面会依次显示等待处理、处理中、成功、部分成功或失败，便于发现需要补录的条目。

工具在产品里公开后，还要经过单独审核才会被搜索引擎收录；批量导入不会跳过这一步。工具图片统一保存，暂时没有图片时会显示默认样式。`,
      },
    ],
  },
  {
    slug: "community-skills",
    title: "社区技能",
    summary:
      "用户创建、发布、安装和管理的 SKILL.md 能力，可按需注入 Claw 会话。",
    category: "knowledge",
    kind: "feature",
    status: "current",
    audience: ["Claw 用户", "技能作者", "管理员"],
    aliases: ["Skills 市场", "Skill Marketplace", "我的 Skills"],
    sourcePaths: [
      "frontend-user/src/features/skills/routes.tsx",
      "frontend-user/src/features/tools/pages/ToolsSkillsPage.tsx",
      "frontend-user/src/features/skills/pages/SkillDetailPage.tsx",
      "frontend-user/src/features/skills/pages/MySkillsPage.tsx",
      "frontend-user/src/features/skills/pages/SkillCreatePage.tsx",
      "backend/internal/skillmarket",
      "backend/internal/agentbridge/spec.go",
    ],
    related: ["claw", "feature-tools", "agent-runtime"],
    sections: [
      {
        id: "lifecycle",
        title: "技能生命周期",
        markdown: `在功能广场的“社区技能”中，你可以浏览详情并安装公开技能；如果你是作者，还可以创建版本、提交发布并在“我的技能”中查看状态。下方三张图依次展示浏览与安装、提交发布和版本管理。

技能可设为私有、仅链接可见或公开；公开提交后需要审核。只有“公开、已通过、启用中”的版本会出现在市场并允许安装，草稿、待审核、被拒绝、被标记、被停用或已删除的版本不会公开分发。`,
        embeds: [
          { id: "community-skill" },
          { id: "community-skill-publish" },
          { id: "community-skill-management" },
        ],
      },
      {
        id: "loading",
        title: "会话加载",
        markdown: `创建 Claw 会话时，系统会把你已启用的技能作为本次对话的做事指南。Free 账户最多持有 10 个技能，付费账户最多 50 个；每个技能最多保留 20 个版本，每个会话最多启用 5 个。

技能可以说明步骤和输出要求，但不能改变账户权限，也不能要求助手执行原本无权执行的操作。`,
      },
      {
        id: "trust",
        title: "信任与举报",
        markdown: `公开技能可能包含不准确或不安全的步骤。作者不能举报自己的技能；同一用户对同一技能只能保留一份举报，举报不会自动下架内容，而是进入管理员审查。执行器仍需用权限、工作目录和工具策略限制实际动作。安装表示允许会话参考该技能，不代表 Scholay 对内容背书。`,
      },
    ],
  },
  {
    slug: "research-news",
    title: "学术资讯",
    summary: "面向公开访问的学术新闻列表与详情，并由后台维护采集和发布状态。",
    category: "knowledge",
    kind: "feature",
    status: "current",
    audience: ["所有访客", "内容运营"],
    aliases: ["资讯", "News", "学术新闻"],
    sourcePaths: [
      "frontend-user/src/features/news/routes.tsx",
      "frontend-user/src/features/news/pages/NewsListPage.tsx",
      "frontend-user/src/features/news/pages/NewsDetailPage.tsx",
      "backend/internal/news",
    ],
    related: ["product-map", "admin-console", "wechat-mini-program"],
    sections: [
      {
        id: "pages",
        title: "页面",
        markdown: `进入学术资讯后，你会先看到按时间排列的文章列表；点击卡片即可阅读正文、查看来源并继续翻页。下图分别展示资讯列表和文章详情。每篇文章都有稳定链接，可以在 Web 或小程序中再次打开。`,
        embeds: [
          { id: "academic-intel-list" },
          { id: "academic-intel-detail" },
        ],
      },
      {
        id: "publishing",
        title: "发布与来源",
        markdown: `公开页面只显示已经完成发布的资讯；采集、审核和发布状态由内容后台管理，同一条来源信息会经过重复检查，避免反复出现。

转载或汇编内容必须保留来源和权利信息。页面上的生成摘要用于帮助判断是否值得阅读，不能替代原文。`,
      },
    ],
  },
  {
    slug: "mobile-web",
    title: "移动 Web",
    summary: "通过四项底部导航进入浏览、Claw、功能与账户页面。",
    category: "mobile",
    kind: "overview",
    status: "current",
    audience: ["手机用户"],
    aliases: ["移动版", "手机网页版"],
    sourcePaths: [
      "frontend-user/src/features/mobile/routes.tsx",
      "frontend-user/src/features/mobile/layouts/MobileShell.tsx",
      "frontend-user/src/features/mobile/components/FeedPrefetcher.tsx",
      "frontend-user/src/features/settings/pages/mobile/MobileMePage.tsx",
      "frontend-user/src/features/settings/components/mobile/MobileAssetsCard.tsx",
      "frontend-user/src/app/router.tsx",
      "frontend-user/src/shared/lib/device.ts",
    ],
    related: [
      "device-routing",
      "wechat-mini-program",
      "claw",
      "literature-library",
    ],
    sections: [
      {
        id: "navigation",
        title: "移动导航",
        markdown: `手机网页底部有“浏览 / AI Claw / 功能 / 我的”四个入口。点击“浏览”查看论文信息流，点击“我的”进入账户、文献集和设置；下图分别展示这两个页面的常见状态。搜索会打开独立的移动搜索页，文献集则从“我的”等入口进入。`,
        embeds: [{ id: "mobile-feed" }, { id: "mobile-me" }],
      },
      {
        id: "parity",
        title: "能力差异",
        markdown: `点击移动端搜索入口后，输入关键词即可查看论文结果，并从筛选面板调整时间、来源等条件；下方三张图依次展示搜索页、结果列表和筛选面板。

移动端优先覆盖浏览、对话和账户等高频动作。Prism、完整审稿和矩阵等需要大屏的工作区目前以电脑端为主，手机上会提供对应入口或明确提示改用电脑。`,
        embeds: [
          { id: "mobile-search" },
          { id: "mobile-search-paper-results" },
          { id: "mobile-search-filter-sheet" },
        ],
      },
    ],
  },
  {
    slug: "wechat-mini-program",
    title: "微信小程序",
    summary: "围绕浏览、Claw、工具与个人账户构建的独立微信端产品表面。",
    category: "mobile",
    kind: "overview",
    status: "current",
    audience: ["微信用户"],
    aliases: ["小程序", "WeChat Mini Program"],
    sourcePaths: [
      "miniprogram/app.json",
      "miniprogram/README.md",
      "miniprogram/pages",
      "backend/internal/wechat",
    ],
    related: ["mobile-web", "device-routing", "claw", "research-news"],
    sections: [
      {
        id: "tabs",
        title: "四个主入口",
        markdown: `自定义 Tab Bar 提供“浏览”“AI Claw”“功能”“我的”四个入口。它们对应信息流、研究对话、工具目录和账户中心，而不是把桌面站完整嵌入 web-view。`,
      },
      {
        id: "pages",
        title: "页面范围",
        markdown: `小程序还提供登录、搜索、论文、期刊、作者、新闻、工具详情、文献集、计费、资料编辑和修改密码页面。在 Claw 回答中遇到图表或科学示意图时，点击图形可以进入独立查看页进行缩放和检查；下图展示的就是这个图形查看状态。`,
        embeds: [{ id: "mp-diagram-viewer" }],
      },
      {
        id: "limits",
        title: "端能力边界",
        markdown: `微信登录、分享、剪贴板和内容安全受小程序平台能力与审核规则约束。需要复杂编辑器、大屏对比或本地文件能力的流程仍以 Web 为主。`,
      },
    ],
  },
];
