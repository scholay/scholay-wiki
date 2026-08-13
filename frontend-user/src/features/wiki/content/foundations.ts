import type { WikiArticle } from "../types";

export const foundationArticles: WikiArticle[] = [
  {
    slug: "scholay",
    title: "Scholay",
    summary:
      "Scholay 是一款一站式智能学术工作平台，覆盖文献检索、文献阅读、文献分析、文献管理、论文写作、智能审稿、论文发表的科研全流程系统。",
    category: "getting-started",
    kind: "overview",
    status: "current",
    audience: ["所有访客", "研究者", "管理员"],
    aliases: ["Scholay 学术", "Scholar", "学术工作台"],
    sourcePaths: [
      "frontend-user/src/features/help/pages/AboutPage.tsx",
      "frontend-user/src/features/landing/pages/FeaturesOverviewPage.tsx",
      "frontend-user/src/features/home/HomePage.tsx",
      "frontend-user/src/app/router.tsx",
      "backend/internal/wikimcp",
    ],
    related: ["product-map", "account", "ai-research-workflows"],
    sections: [
      {
        id: "workflow",
        title: "如何开始",
        markdown:
          "进入首页之后，你可以看到醒目的搜索框。下图当前选中智能搜索；切到“文献”后才进入关键词与筛选式传统检索。根据课题是否已有稳定检索词，选择对应入口。",
        embeds: [{ id: "home-research-entry" }],
      },
      {
        id: "overview",
        title: "全站功能",
        markdown:
          "AI 用于压缩检索、整理、写作与审稿中的重复劳动，但不替代研究者对证据、方法和结论的判断。下表按研究流程列出站内功能。",
        table: {
          columns: [
            { key: "domain", header: "功能", merge: true },
            { key: "feature", header: "子功能" },
            { key: "description", header: "说明" },
            { key: "links", header: "详见" },
          ],
          rows: [
            {
              domain: "文献检索",
              feature: "论文检索",
              description: "关键词与语义检索，多数据源、筛选排序与分页",
              links: { label: "论文检索", href: "/wiki/academic-search" },
            },
            {
              domain: "文献检索",
              feature: "智能搜索",
              description: "Agent 驱动的研究问题检索，会话内组织证据与论文",
              links: { label: "智能搜索", href: "/wiki/smart-search" },
            },
            {
              domain: "文献检索",
              feature: "作者主页",
              description: "作者主页、发文列表与引用关系",
              links: {
                label: "作者与期刊",
                href: "/wiki/authors-and-journals",
              },
            },
            {
              domain: "文献阅读",
              feature: "PDF 阅读器",
              description: "浏览器内阅读、全文可用性判断与后续解析",
              links: { label: "PDF 阅读器", href: "/wiki/pdf-reader" },
            },
            {
              domain: "文献阅读",
              feature: "开放获取与翻译",
              description: "查找开放获取全文，并对论文内容做 AI 翻译",
              links: {
                label: "开放获取与翻译",
                href: "/wiki/open-access-and-paper-translation",
              },
            },
            {
              domain: "文献分析",
              feature: "论文矩阵分析",
              description: "将暂存文献展开为可比维度矩阵，支持生成与导出",
              links: { label: "论文矩阵分析", href: "/wiki/matrix-analysis" },
            },
            {
              domain: "文献分析",
              feature: "AI 数据分析",
              description: "上传数据后由 Agent 协助统计、解释与图表产出",
              links: {
                label: "AI 数据分析",
                href: "/wiki/research-data-analysis",
              },
            },
            {
              domain: "文献管理",
              feature: "个人文献集",
              description: "文件夹收藏、导入识别、跨设备同步的个人知识库",
              links: { label: "个人文献集", href: "/wiki/literature-library" },
            },
            {
              domain: "文献管理",
              feature: "检索暂存区",
              description: "检索过程中的临时收纳，可转入矩阵或文献集",
              links: { label: "检索暂存区", href: "/wiki/staging-area" },
            },
            {
              domain: "文献管理",
              feature: "文献集分享",
              description: "生成分享链接，他人可接收并纳入自己的文献集",
              links: { label: "文献集分享", href: "/wiki/library-sharing" },
            },
            {
              domain: "文献管理",
              feature: "引用生成",
              description: "按常用格式生成与复制参考文献",
              links: { label: "引用生成器", href: "/wiki/citation-generator" },
            },
            {
              domain: "论文写作",
              feature: "Scholay Prism",
              description: "浏览器内 LaTeX 写作、AI 续写、编译与交付",
              links: { label: "Scholay Prism", href: "/wiki/prism" },
            },
            {
              domain: "智能助手",
              feature: "学术对话",
              description: "可溯源研究会话：左侧文献、中间对话、右侧交付物",
              links: { label: "Scholay Claw", href: "/wiki/claw" },
            },
            {
              domain: "智能助手",
              feature: "技能与附件",
              description: "在对话中加载 Skill、上传附件，并从文献集引用论文",
              links: [
                { label: "界面导览", href: "/wiki/claw-interface-guide" },
                {
                  label: "附件与引用",
                  href: "/wiki/claw-attachments-and-references",
                },
              ],
            },
            {
              domain: "智能助手",
              feature: "科研绘图",
              description: "按图形任务生成可预览、缩放和导出的科研图形",
              links: {
                label: "科研绘图",
                href: "/wiki/research-figure-and-slides",
              },
            },
            {
              domain: "智能助手",
              feature: "演示文稿",
              description: "按汇报场景生成可继续编辑的演示文件",
              links: {
                label: "演示文稿",
                href: "/wiki/research-figure-and-slides",
              },
            },
            {
              domain: "智能助手",
              feature: "交付物预览",
              description: "文档、表格、图片等产物可在扩展区预览或下载",
              links: { label: "产物与预览", href: "/wiki/claw" },
            },
            {
              domain: "智能审稿",
              feature: "智能审稿",
              description: "投稿前/同行评审式 AI 审稿任务与记录",
              links: { label: "智能审稿", href: "/wiki/peer-review" },
            },
          ],
        },
      },
      {
        id: "mcp-access",
        title: "通过 MCP 读取 Wiki",
        markdown: `Wiki 顶栏最右侧的“MCP”按钮会复制只读服务配置。把配置加入支持 Streamable HTTP 的 MCP 客户端后，可以检索全部词条、按 slug 读取完整内容，或按分类和状态列出词条；结果与站内词条使用同一份生成快照。

MCP 端点是公开只读资料入口，不提供登录、写入、后台操作或源码路径。调用方仍应根据词条的状态、受众和边界说明判断内容是否适用于当前任务；实验中、计划中与历史词条不会被伪装成现行功能。`,
        blocks: [
          { type: "markdown" },
          {
            type: "tip",
            tip: {
              text: "配置不需要密钥。若站点刚发布了新词条，MCP 内容会随同一次发布更新，而不是读取你浏览器中尚未发布的本地改动。",
            },
          },
        ],
      },
      {
        id: "public-info",
        title: "信息公开",
        markdown:
          "以下入口面向公开访问，用来了解产品、查阅政策和获取帮助。它们不是研究工作区里的功能。",
        table: {
          columns: [
            { key: "domain", header: "类别", merge: true },
            { key: "entry", header: "入口" },
            { key: "description", header: "说明" },
            { key: "links", header: "详见" },
          ],
          rows: [
            {
              domain: "期刊",
              entry: "期刊搜索",
              description: "按刊名、ISSN、主办机构和质量条件筛选公开期刊目录",
              links: { label: "期刊检索页", href: "/wiki/journal-search-page" },
            },
            {
              domain: "期刊",
              entry: "期刊详情与投稿资源",
              description: "期刊详情、选刊信息与投稿资源下载",
              links: [
                { label: "期刊详情", href: "/wiki/journal-detail-page" },
                {
                  label: "投稿资源",
                  href: "/wiki/journal-submission-resources",
                },
              ],
            },
            {
              domain: "工具生态",
              entry: "功能广场",
              description: "外部学术工具目录与冷启动导航",
              links: { label: "功能广场", href: "/wiki/feature-tools" },
            },
            {
              domain: "工具生态",
              entry: "社区技能",
              description: "用户创建、审核与在会话中加载的技能",
              links: { label: "社区技能", href: "/wiki/community-skills" },
            },
            {
              domain: "账户与会员",
              entry: "账户与登录",
              description: "邮箱/手机、OAuth、微信扫码与账户设置",
              links: { label: "账户", href: "/wiki/account" },
            },
            {
              domain: "账户与会员",
              entry: "会员与额度",
              description: "会员档位、AI 周期额度、经费钱包与邀请活动",
              links: { label: "会员体系", href: "/wiki/membership" },
            },
            {
              domain: "资讯",
              entry: "学术资讯",
              description: "公开学术新闻列表与详情，由后台维护采集和发布",
              links: { label: "学术资讯", href: "/wiki/research-news" },
            },
            {
              domain: "帮助",
              entry: "帮助中心",
              description: "按主题浏览科研问答，详情页提供目录与相关文章",
              links: {
                label: "帮助中心与学术问答",
                href: "/wiki/help-center-and-qa",
              },
            },
            {
              domain: "内容",
              entry: "学术资源与博客",
              description: "原创学术资源与产品博客，两类列表和详情都有稳定链接",
              links: {
                label: "学术资源中心与产品博客",
                href: "/wiki/resource-and-blog-center",
              },
            },
            {
              domain: "定价",
              entry: "定价方案",
              description: "会员档位、公开定价页与当前权益说明",
              links: {
                label: "产品与定价总览",
                href: "/wiki/product-and-pricing-overview",
              },
            },
            {
              domain: "政策",
              entry: "服务政策",
              description: "隐私政策、服务条款、免责声明与 AI 使用边界",
              links: {
                label: "服务政策与 AI 使用边界",
                href: "/wiki/service-policies",
              },
            },
            {
              domain: "支持",
              entry: "反馈与支持",
              description: "提交问题、功能建议、内容纠错和合作请求",
              links: {
                label: "反馈与支持",
                href: "/wiki/feedback-and-support",
              },
            },
          ],
        },
      },
      {
        id: "surfaces",
        title: "打开方式",
        markdown:
          "同一个账号可以在电脑和手机上使用。现在能打开的是网站和微信小程序；独立的电脑软件和手机 App 还在规划中。",
        table: {
          columns: [
            { key: "form", header: "设备", merge: true },
            { key: "surface", header: "打开方式" },
            { key: "status", header: "状态" },
            { key: "description", header: "说明" },
            { key: "links", header: "详见" },
          ],
          rows: [
            {
              form: "电脑",
              surface: "浏览器",
              status: "现行",
              description: "打开网站即可使用全部功能",
              links: { label: "产品地图", href: "/wiki/product-map" },
            },
            {
              form: "电脑",
              surface: "电脑软件",
              status: "规划中",
              description: "还不能下载安装",
              links: "",
            },
            {
              form: "手机",
              surface: "浏览器",
              status: "现行",
              description: "打开同一网站，页面会按手机调整",
              links: { label: "移动 Web", href: "/wiki/mobile-web" },
            },
            {
              form: "手机",
              surface: "微信小程序",
              status: "现行",
              description: "在微信里使用；完整写作和审稿请用电脑",
              links: { label: "微信小程序", href: "/wiki/wechat-mini-program" },
            },
            {
              form: "手机",
              surface: "手机 App",
              status: "规划中",
              description: "还不能在应用商店下载",
              links: "",
            },
          ],
        },
      },
    ],
  },
  {
    slug: "product-map",
    title: "全站功能",
    summary: "一张图看清 Scholay 里你能用到的地方，以及接下来该打开哪篇说明。",
    category: "getting-started",
    kind: "overview",
    status: "current",
    audience: ["所有访客", "研究者"],
    aliases: ["产品与页面地图", "站点地图", "功能地图", "页面总览"],
    sourcePaths: [
      "frontend-user/src/app/router.tsx",
      "frontend-user/src/features/landing/routes.tsx",
      "frontend-user/src/features/help/routes.tsx",
      "frontend-user/src/features/mobile/routes.tsx",
      "frontend-user/src/app/layouts/AppShell.tsx",
    ],
    related: ["scholay", "academic-search", "claw"],
    sections: [
      {
        id: "map",
        title: "功能地图",
        markdown: `\`\`\`mermaid
%%{init: {"themeVariables": {"fontSize": "16px"}}}%%
classDiagram
  direction LR
  class Scholay {
    一站式学术工作台
  }

  Search --> Scholay
  Analyze --> Scholay
  Scholay --> Manage
  Scholay --> Write
  Scholay --> Support

  class Search["文献搜索"] {
    论文检索
    智能搜索
    作者主页
    期刊检索
  }

  class Analyze["文献分析"] {
    论文矩阵
    AI数据分析
    智能助手
    开放获取与翻译
  }

  class Manage["文献管理"] {
    个人文献集
    暂存区
    文献集分享
    引用生成
  }

  class Write["论文写作"] {
    智能写作
    智能审稿
    科研绘图
    演示文稿
  }

  class Support["会员与支持"] {
    登录
    会员
    帮助中心
  }

  cssClass "Search" wikiMapSearch
  cssClass "Analyze" wikiMapAnalyze
  cssClass "Manage" wikiMapManage
  cssClass "Write" wikiMapWrite
  cssClass "Support" wikiMapSupport
  cssClass "Scholay" wikiMapHub
\`\`\`
`,
      },
      {
        id: "start-here",
        title: "你可以前往",
        markdown: "",
        blocks: [
          {
            type: "path-cards",
            items: [
              {
                title: "Scholay",
                description:
                  "了解定位、覆盖的研究流程，以及各功能分别从哪里进入。",
                articleSlug: "scholay",
                icon: "overview",
              },
              {
                title: "论文检索",
                description:
                  "用关键词和筛选发现论文；需要会话式检索时再打开智能搜索。",
                articleSlug: "academic-search",
                icon: "literature-search",
              },
              {
                title: "智能助手",
                description: "用附件、技能和工具完成分析、绘图与研究交付。",
                articleSlug: "claw",
                icon: "assistant",
              },
              {
                title: "个人文献集",
                description: "把核对过的论文长期归档、整理和分享。",
                articleSlug: "literature-library",
                icon: "resources",
              },
              {
                title: "智能写作",
                description: "从 LaTeX 项目和正文工作区开始一次完整写作。",
                articleSlug: "prism",
                icon: "writing",
              },
              {
                title: "会员体系",
                description: "看 Free、Pro、Max 的额度、价格和购买入口。",
                articleSlug: "membership",
                icon: "subscription",
              },
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "account",
    title: "Scholay 账户",
    summary:
      "统一承载登录身份、个人资料、连接方式、会员权益与管理员角色的用户账户。",
    category: "getting-started",
    kind: "entity",
    status: "current",
    audience: ["用户", "管理员"],
    aliases: ["用户账户", "登录", "身份"],
    sourcePaths: [
      "backend/internal/user/model.go",
      "backend/internal/user/handler.go",
      "frontend-user/src/features/auth/routes.tsx",
      "frontend-user/src/features/settings/routes.tsx",
      "frontend-user/src/features/settings/pages/SettingsLayout.tsx",
      "frontend-user/src/features/settings/pages/mobile/MobileMePage.tsx",
    ],
    related: ["membership", "admin-console", "wechat-mini-program"],
    sections: [
      {
        id: "identity",
        title: "身份与登录",
        markdown: `你在手机上打开“我的”但还没登录时，会看到登录与注册入口；下图就是这个访客状态。登录后，同一个 Scholay 账户会承载你的个人资料、文献、会员权益和可用功能，管理员也使用这套账户，不需要另注册后台账号。

页面能否打开不代表其中的操作都已授权；涉及个人数据或管理功能时，系统仍会按登录状态和账户角色检查权限。`,
        embeds: [{ id: "mobile-me-logged-out" }],
      },
      {
        id: "settings",
        title: "账户设置",
        markdown: `点击桌面端头像可以展开账户菜单；下图展示菜单展开后的状态。菜单中可查看当前身份与会员档位，并进入个人资料、账户资产、安全设置、已连接账号和帮助中心；底部用于退出登录。邀请页面不在这张菜单里，应从其他入口进入。手机端从“我的”进入对应的设置子页面。`,
        embeds: [{ id: "user-account-menu" }],
      },
      {
        id: "boundaries",
        title: "安全边界",
        markdown: `前端登录态以本地令牌为入口，但角色和资源权限必须由后端再次验证。冻结账户会立即吊销全部 token，解冻不会恢复旧 token。OAuth 遇到相同邮箱也不会自动合并，必须先登录目标账户再确认。公开浏览与账户写操作是两条不同边界，不能因为页面可打开就推断所有动作都免登录。`,
      },
    ],
  },
  {
    slug: "device-routing",
    title: "桌面与移动页面分流",
    summary: "根据设备能力在桌面工作区、移动工作区和响应式详情页之间选择入口。",
    category: "mobile",
    kind: "architecture",
    status: "current",
    audience: ["移动端用户", "产品开发者"],
    aliases: ["移动分流", "UA 分流", "桌面版"],
    sourcePaths: [
      "frontend-user/src/app/router.tsx",
      "frontend-user/src/shared/lib/device.ts",
      "frontend-user/src/features/mobile/routes.tsx",
    ],
    related: ["product-map", "mobile-web", "wechat-mini-program"],
    sections: [
      {
        id: "decision",
        title: "分流方式",
        markdown: `Scholay 的移动端不是只给同一棵页面树加断点。手机设备访问有移动对等页的桌面路径时，会进入 \`/m/*\`；桌面设备访问移动路径时，会回到桌面对等页。查询参数和文献集文件夹等深链信息会尽量保留。`,
      },
      {
        id: "responsive",
        title: "仍使用同一路径的页面",
        markdown: `论文、作者、期刊、PDF、公开内容和分享等需要稳定链接的页面保持原路径，通过响应式渲染适配窄屏。暂时没有移动工作区的纯桌面能力会引导用户回到移动首页或提示使用电脑。`,
      },
    ],
  },
  {
    slug: "admin-console",
    title: "管理后台",
    summary: "与用户端共用 SPA、由管理员角色保护的运营与平台管理工作区。",
    category: "administration",
    kind: "overview",
    status: "current",
    audience: ["管理员", "运营人员"],
    aliases: ["Admin", "后台", "运营后台"],
    sourcePaths: [
      "frontend-user/src/features/admin/routes.tsx",
      "frontend-user/src/features/admin/nav.ts",
      "frontend-user/src/features/admin/layouts/AdminShell.tsx",
      "backend/cmd/server/routes_admin.go",
      "backend/internal/admin",
    ],
    related: ["account", "product-map", "platform-topology"],
    sections: [
      {
        id: "access",
        title: "入口与权限",
        markdown: `后台位于 \`/admin\`，与用户端共用同一个构建、域名和登录态。operations 拥有 analytics.view、content.manage、users.view；admin 再增加 users.manage、config.manage、finance.refund；只有 super_admin 增加 users.role.assign。前端菜单和按钮会按权限隐藏，但直接 URL 仍可能进入页面壳，安全边界必须由后端 API 执行。`,
        embeds: [{ id: "admin-console" }, { id: "admin-sidebar-alerts" }],
      },
      {
        id: "scope",
        title: "管理范围",
        markdown: `后台涵盖用户与用量、AI 上游和模型目录、Agent 会话、内容、功能广场、社区技能、订单与会员、营销活动、反馈、站点分析、SEO、第三方连接和系统配置。公告目前只有后台 CRUD，没有现行公开读取路由；创建“已启用”公告不等于用户端已经能获取或展示。`,
      },
      {
        id: "single-spa",
        title: "与旧版的区别",
        markdown: `旧资料中出现的独立后台前端和独立端口已经下线。现行后台只是同一 SPA 的一组顶层路由，部署时也不再启动单独的后台容器。`,
      },
    ],
  },
  {
    slug: "platform-topology",
    title: "平台运行拓扑",
    summary:
      "浏览器、Nginx、Go 后端、Agent、MySQL、Redis、MinIO 与辅助服务之间的关系。",
    category: "platform",
    kind: "architecture",
    status: "current",
    audience: ["开发者", "运维人员", "技术支持"],
    aliases: ["系统架构", "部署架构", "服务拓扑"],
    sourcePaths: [
      "docker-compose.yml",
      "docker-compose.prod.yml",
      "nginx/conf.d/user.conf",
      "backend/cmd/server/main.go",
      "agent/src/server",
    ],
    related: ["agent-runtime", "admin-console", "legacy-components"],
    sections: [
      {
        id: "request-path",
        title: "请求路径",
        markdown: `浏览器只访问整站 Nginx 入口。静态页面交给前端容器，\`/api/*\` 和 WebSocket 请求转发给 Go 后端；MySQL、Redis 和内部 Agent 服务不直接暴露给浏览器。`,
      },
      {
        id: "services",
        title: "主要服务",
        markdown: `Go 后端负责账户、学术数据、业务规则、管理接口和 Agent 桥接；Agent 容器执行长时 AI 回合与工具调用；MySQL 保存业务数据，Redis承担缓存和部分短期状态，MinIO 保存 PDF、附件与交付物。Prism 另有 LaTeX 编译辅助服务。`,
      },
      {
        id: "deployment",
        title: "部署口径",
        markdown: `开发与生产均以 Docker Compose 描述服务依赖。生产配置要求显式站点、凭据和跨域设置，并为对象存储、Agent、SEO 提交、统计及爬虫监控透传环境变量。`,
      },
    ],
  },
];
