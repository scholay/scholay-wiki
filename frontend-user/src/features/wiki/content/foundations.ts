import type { WikiArticle } from "../types";

export const foundationArticles: WikiArticle[] = [
  {
    slug: "scholay",
    title: "Scholay",
    summary:
      "面向研究者的 AI 学术工作平台，覆盖检索、阅读、知识管理、写作、审稿与研究交付。",
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
    ],
    related: ["product-map", "account", "ai-research-workflows"],
    sections: [
      {
        id: "overview",
        title: "概览",
        markdown: `Scholay 是一个 AI 驱动的学术工作平台。当前产品把论文与期刊发现、PDF 阅读、个人文献管理、AI 对话、智能审稿、LaTeX 写作和研究交付放进同一套账户与工作流中。

平台的产品原则是让 AI 压缩重复劳动，但不替代研究者对证据、方法和结论的判断。`,
      },
      {
        id: "surfaces",
        title: "产品表面",
        markdown: `Scholay 当前包含同一域名下的桌面 Web、移动 Web、管理后台和公开内容页，并另有微信小程序。Web 用户端与 \`/admin\` 共用一个 React SPA；后端、Agent、数据库、对象存储和反向代理以独立服务协作。`,
      },
      {
        id: "workflow",
        title: "研究工作流",
        markdown: `核心动作可以概括为：**发现资料 → 阅读与暂存 → 整理文献 → 分析与对话 → 写作或审稿 → 导出研究产物**。不同功能共享账户、会员额度和部分会话基础设施，但各自保留独立的页面与任务状态。`,
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
      },
      {
        id: "settings",
        title: "账户设置",
        markdown: `设置区域提供个人资料、安全、第三方连接、会员资产和邀请等页面。移动端把这些能力映射到 \`/m/me/*\` 子页面。`,
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
