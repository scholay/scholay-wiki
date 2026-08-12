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
      "frontend-user/src/features/wiki/embeds/WikiEmbedRhinoAssistant.tsx",
      "frontend-user/public/wiki/assets/rhino/pet-idle-frame-000.png",
    ],
    related: ["product-map", "account", "ai-research-workflows"],
    sections: [
      {
        id: "overview",
        title: "功能与能力",
        markdown:
          "AI 用于压缩检索、整理、写作与审稿中的重复劳动，但不替代研究者对证据、方法和结论的判断。",
        table: {
          columns: [
            { key: "domain", header: "能力域", merge: true },
            { key: "feature", header: "功能" },
            { key: "description", header: "能力说明" },
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
              feature: "作者与期刊",
              description: "作者主页、期刊检索、榜单目录与投稿资源",
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
              feature: "Scholay Claw",
              description: "可溯源学术对话，加载技能、附件与研究工具",
              links: { label: "Scholay Claw", href: "/wiki/claw" },
            },
            {
              domain: "智能审稿",
              feature: "智能审稿",
              description: "投稿前/同行评审式 AI 审稿任务与记录",
              links: { label: "智能审稿", href: "/wiki/peer-review" },
            },
            {
              domain: "研究交付",
              feature: "科研绘图与演示",
              description: "科研插图与演示文稿的 Agent 生成与预览",
              links: {
                label: "科研绘图与演示",
                href: "/wiki/research-figure-and-slides",
              },
            },
            {
              domain: "论文发表",
              feature: "期刊发现与投稿资源",
              description: "期刊详情、选刊信息与投稿资源下载",
              links: { label: "期刊详情", href: "/wiki/journal-detail-page" },
            },
            {
              domain: "工具生态",
              feature: "功能广场",
              description: "外部学术工具目录与冷启动导航",
              links: { label: "功能广场", href: "/wiki/feature-tools" },
            },
            {
              domain: "工具生态",
              feature: "社区技能",
              description: "用户创建、审核与在会话中加载的技能",
              links: { label: "社区技能", href: "/wiki/community-skills" },
            },
            {
              domain: "内容资讯",
              feature: "学术资讯",
              description: "站内学术新闻流与详情",
              links: { label: "学术资讯", href: "/wiki/research-news" },
            },
            {
              domain: "账户与会员",
              feature: "账户与登录",
              description: "邮箱/手机、OAuth、微信扫码与账户设置",
              links: { label: "账户", href: "/wiki/account" },
            },
            {
              domain: "账户与会员",
              feature: "会员与额度",
              description: "会员档位、AI 周期额度、经费钱包与邀请活动",
              links: { label: "会员体系", href: "/wiki/membership" },
            },
            {
              domain: "多端入口",
              feature: "移动 Web / 小程序",
              description: "手机工作区与微信小程序的轻量入口",
              links: [
                { label: "移动 Web", href: "/wiki/mobile-web" },
                { label: "小程序", href: "/wiki/wechat-mini-program" },
              ],
            },
          ],
        },
      },
      {
        id: "surfaces",
        title: "产品表面",
        markdown: `面向用户的客户端按「端 × 形态」划分。PC Web 与 \`/admin\` 管理后台、公开内容页共用同一 React SPA；各端共用后端 API、Agent、数据库、对象存储与反向代理。虚线表示规划中、尚未交付的客户端。

\`\`\`mermaid
flowchart TB
  subgraph Clients["客户端"]
    direction TB
    PCWeb["PC · Web<br/>现行"]
    MobileWeb["移动端 · Web<br/>现行"]
    MiniProgram["移动端 · 小程序<br/>现行"]
    MobileApp["移动端 · App<br/>规划中"]
    DesktopApp["PC · Desktop App<br/>规划中"]
  end

  Platform["后端平台<br/>API · Agent · 数据 · 存储"]

  PCWeb --> Platform
  MobileWeb --> Platform
  MiniProgram --> Platform
  MobileApp -.->|规划中| Platform
  DesktopApp -.->|规划中| Platform
\`\`\`
`,
        embeds: [{ id: "home-research-entry" }],
        table: {
          columns: [
            { key: "form", header: "端", merge: true },
            { key: "surface", header: "形态" },
            { key: "status", header: "状态" },
            { key: "description", header: "说明" },
            { key: "links", header: "详见" },
          ],
          rows: [
            {
              form: "PC",
              surface: "Web",
              status: "现行",
              description: "桌面浏览器主工作区；与 /admin、公开内容页同一 SPA",
              links: [
                { label: "产品地图", href: "/wiki/product-map" },
                { label: "管理后台", href: "/wiki/admin-console" },
              ],
            },
            {
              form: "PC",
              surface: "Desktop App",
              status: "规划中",
              description: "原生桌面客户端，尚未交付",
              links: "",
            },
            {
              form: "移动端",
              surface: "Web",
              status: "现行",
              description: "手机浏览器独立壳（/m/*），与桌面路径双向分流",
              links: [
                { label: "移动 Web", href: "/wiki/mobile-web" },
                { label: "设备分流", href: "/wiki/device-routing" },
              ],
            },
            {
              form: "移动端",
              surface: "小程序",
              status: "现行",
              description: "微信小程序入口，能力相对 Web 为轻量子集",
              links: { label: "微信小程序", href: "/wiki/wechat-mini-program" },
            },
            {
              form: "移动端",
              surface: "App",
              status: "规划中",
              description: "原生移动应用，尚未交付",
              links: "",
            },
          ],
        },
      },
      {
        id: "workflow",
        title: "研究工作流",
        markdown: `核心动作可以概括为：**发现资料 → 阅读与暂存 → 整理文献 → 分析与对话 → 写作或审稿 → 导出研究产物**。不同功能共享账户、会员额度和部分会话基础设施，但各自保留独立的页面与任务状态。`,
      },
      {
        id: "rhino-assistant",
        title: "牛犀犀悬浮助手",
        markdown: `product-mock 的桌面壳提供可拖动的“牛犀犀”悬浮助手：收起时角色停在页面角落，指针停留后出现对话、功能、帮助、反馈、通知和隐藏入口；隐藏后并非删除，而是收纳到顶栏头像旁的 Dock。双击角色进入对话，展开面板后角色停在窗口左下外侧。下面是遵守 Wiki 静态契约的代表态，不连接助手状态、通知接口或拖拽动作。`,
        embeds: [{ id: "rhino-assistant-entry" }],
      },
    ],
  },
  {
    slug: "product-map",
    title: "产品与页面地图",
    summary:
      "Scholay 的公开页面、产品工作区、移动端和后台如何组成一个完整产品。",
    category: "getting-started",
    kind: "overview",
    status: "current",
    audience: ["所有访客", "产品运营", "支持人员"],
    aliases: ["站点地图", "功能地图", "页面总览"],
    sourcePaths: [
      "frontend-user/src/app/router.tsx",
      "frontend-user/src/features/landing/routes.tsx",
      "frontend-user/src/features/help/routes.tsx",
      "frontend-user/src/features/mobile/routes.tsx",
      "frontend-user/src/features/admin/routes.tsx",
      "frontend-user/src/app/layouts/AppShell.tsx",
      "frontend-user/src/features/home/NotFoundPage.tsx",
    ],
    related: ["scholay", "device-routing", "admin-console"],
    sections: [
      {
        id: "public",
        title: "公开内容",
        markdown: `无需登录即可访问的表面包括功能介绍、定价、关于、联系、反馈、服务政策、博客、学术资源、帮助问答、论文/作者/期刊的公开详情以及分享接收页。`,
      },
      {
        id: "workspace",
        title: "产品工作区",
        markdown: `登录后的主要工作区包括检索与矩阵、文献集、功能广场、Claw、智能审稿、Prism、社区技能和账户设置。部分详情页面可以公开浏览，但保存、会话、上传、支付等动作要求账户。`,
      },
      {
        id: "other-surfaces",
        title: "移动端与后台",
        markdown: `\`/m/*\` 使用独立移动壳，并为首页、工具、Claw、文献集、账户和登录提供移动页面。\`/admin/*\` 使用管理员角色守卫，承载用户、模型、内容、计费、营销、统计和系统配置。`,
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
        markdown: `普通用户与管理员使用同一套用户账户，后台没有另一套登录页。HTTP 鉴权优先读取 Bearer token，其次读取 cookie，不接受 query 参数里的 JWT。管理员只是用户记录中带角色的身份；前端路由守卫与后端中间件分别执行检查。`,
        embeds: [{ id: "mobile-me-logged-out" }],
      },
      {
        id: "settings",
        title: "账户设置",
        markdown: `设置区域提供个人资料、安全、第三方连接、会员资产和邀请等页面。移动端把这些能力映射到 \`/m/me/*\` 子页面。`,
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
