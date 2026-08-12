import type { WikiArticle } from "../types";

export const administrationArticles: WikiArticle[] = [
  {
    slug: "admin-access-control",
    title: "后台角色与权限",
    summary: "后台入口、三类管理角色与前后端权限校验的真实边界。",
    category: "administration",
    kind: "rule",
    status: "current",
    audience: ["管理员", "运维人员", "开发者"],
    aliases: ["后台权限", "RBAC", "管理角色"],
    sourcePaths: [
      "frontend-user/src/features/admin/routes.tsx",
      "frontend-user/src/features/admin/permissions.ts",
      "frontend-user/src/features/admin/nav.ts",
      "backend/internal/admin/model.go",
      "backend/cmd/server/routes_admin.go",
    ],
    related: ["admin-console", "admin-dashboard", "admin-user-lifecycle"],
    sections: [
      {
        id: "roles",
        title: "入口与角色",
        markdown: `登录后访问 \`/admin\`，后台会按你的角色显示可用菜单与操作；下图展示的是 operations、admin 和 super_admin 三类角色的权限矩阵。普通 user 不能进入后台外壳。

operations 拥有 analytics.view、content.manage、users.view；admin 再增加 users.manage、config.manage、finance.refund；super_admin 额外拥有 users.role.assign。`,
        embeds: [{ id: "admin-access-control" }],
      },
      {
        id: "enforcement",
        title: "权限如何生效",
        markdown: `侧栏和按钮会按权限隐藏，但多数子路由只复用后台入口守卫；直接输入地址仍可能加载页面外壳，随后由接口返回 403。真正的安全边界是后端路由上的 RequirePermission，前端隐藏控件不能替代服务端授权。`,
      },
    ],
  },
  {
    slug: "admin-dashboard",
    title: "后台总览",
    summary: "汇总用户、营收、订单、会员、AI 成本与运行告警的管理驾驶舱。",
    category: "administration",
    kind: "page",
    status: "current",
    audience: ["管理员", "运营人员"],
    aliases: ["Dashboard", "管理驾驶舱", "今日检查"],
    sourcePaths: [
      "frontend-user/src/features/admin/pages/DashboardPage.tsx",
      "frontend-user/src/features/admin/components/TodayPanel.tsx",
      "frontend-user/src/features/admin/hooks/useAdminAlerts.ts",
      "backend/internal/admin/dashboard_service.go",
    ],
    related: ["admin-console", "admin-site-analytics", "admin-token-cost"],
    sections: [
      {
        id: "metrics",
        title: "核心指标",
        markdown: `进入后台总览后，你会先看到用户、净收入、订单、会员、AI 成本和兑换码核销等汇总，再通过趋势卡比较最近 30 天与上一周期。下图依次展示总览页面和关键指标趋势卡。

汇总结果会缓存 30 秒，页面也会标明数据更新时间；这里适合日常巡视，不是逐笔实时账本。`,
        embeds: [
          { id: "admin-dashboard" },
          {
            id: "admin-dashboard-trend-cards",
            caption: "关键指标与上一周期的趋势对比",
          },
        ],
      },
      {
        id: "checks",
        title: "今日检查与降级",
        markdown: `“今日检查”会把待处理反馈、草稿消息、第三方账号健康、维护模式和支付渠道分成正常、降级或阻断事项；下图展示的是三种结果并列时的代表状态。点击事项后再进入对应后台页面处理。

只有支付宝和微信支付都不可用时才形成支付告警。检查请求失败会标为降级；operations 因没有 config.manage 权限而读取配置失败时，不会被误报为系统故障。`,
        embeds: [
          {
            id: "admin-dashboard-today-panel",
            caption: "正常、降级与阻断事项并列的今日待办",
          },
        ],
      },
    ],
  },
  {
    slug: "admin-user-directory",
    title: "用户查询与详情",
    summary: "用于检索账号、查看身份与聚合业务信息的后台用户目录。",
    category: "administration",
    kind: "page",
    status: "current",
    audience: ["管理员", "客服", "运营人员"],
    aliases: ["用户管理", "用户详情", "账号检索"],
    sourcePaths: [
      "frontend-user/src/features/admin/pages/UsersPage.tsx",
      "frontend-user/src/features/admin/components/UserDetailDrawer.tsx",
      "frontend-user/src/features/admin/components/UserMetricsPanel.tsx",
      "frontend-user/src/features/admin/components/UserUsageOverviewPanel.tsx",
      "backend/internal/user/admin_user_detail.go",
    ],
    related: ["admin-user-lifecycle", "admin-user-entitlement-grants"],
    sections: [
      {
        id: "search",
        title: "查询范围",
        markdown: `进入用户目录后，可以按用户 ID、用户名、邮箱或手机号搜索，再用角色、会员档位、状态、邮箱验证和注册日期筛选、排序；页面还提供注册、活跃、来源与活跃时段指标。下图依次展示用户列表和用户指标面板。

列表每页固定 20 条。批量动作只会处理当前明确选中的记录，不会自动覆盖整个搜索结果。`,
        embeds: [
          { id: "admin-user-directory" },
          {
            id: "admin-user-metrics",
            caption: "注册、活跃、来源与活跃时段分析",
          },
        ],
      },
      {
        id: "detail",
        title: "聚合详情",
        markdown: `点击用户行会打开详情抽屉，再分别查看身份与 OAuth 连接、登录与 IP、会员、额度、Reset Pass、功能使用、AI 算力、订单、经费流水和兑换记录。下方三张图依次展示聚合详情、单用户用量，以及订单与资产历史。

这些面板分别加载数据；某一个统计请求失败时，应按面板提示排查，不能据此判断账号不存在。`,
        embeds: [
          {
            id: "admin-user-detail-drawer",
            caption: "用户身份、状态与资产的聚合抽屉",
          },
          {
            id: "admin-user-token-usage",
            caption: "单用户功能事件与 AI 算力概况",
          },
          {
            id: "admin-user-billing-history",
            caption: "订单、经费流水与兑换记录",
          },
        ],
      },
    ],
  },
  {
    slug: "admin-user-lifecycle",
    title: "用户冻结、删除与角色变更",
    summary: "后台账号状态变更、令牌撤销和角色委派的高风险操作规则。",
    category: "administration",
    kind: "rule",
    status: "current",
    audience: ["管理员", "安全人员", "客服"],
    aliases: ["冻结用户", "删除用户", "角色分配"],
    sourcePaths: [
      "frontend-user/src/features/admin/components/UserActionsDrawer.tsx",
      "frontend-user/src/features/admin/pages/UsersPage.tsx",
      "backend/internal/user/handler_admin_ops.go",
      "backend/internal/user/repository.go",
      "backend/internal/admin/service.go",
    ],
    related: ["admin-access-control", "admin-user-directory"],
    sections: [
      {
        id: "freeze",
        title: "冻结与解冻",
        markdown: `从用户详情打开高风险操作面板，可以按权限冻结、解冻、删除账号或调整角色；下图展示的是这些动作及确认提示的代表状态。执行冻结前请核对用户 ID，并填写原因。

users.manage 可冻结普通账号，原因要求 1–255 个字符；admin 和 super_admin 不能通过该操作冻结。冻结会把状态改为 frozen 并撤销全部访问令牌；解冻只恢复账号状态，旧令牌不会复活，用户需要重新登录。`,
        embeds: [{ id: "admin-user-lifecycle" }],
      },
      {
        id: "delete",
        title: "删除",
        markdown: `删除要求输入 DELETE 确认，属于不可逆业务操作。后端显式清理或级联清理用户关联数据；列表批量删除只提交已选择的用户，不会隐式覆盖后续分页。执行前应先核对用户 ID，而不能只凭易变的昵称判断。`,
      },
      {
        id: "role",
        title: "角色委派",
        markdown: `只有 super_admin 具备 users.role.assign。可将目标设为 user、operations 或 admin，但不能授予 super_admin，也不能修改另一个 super_admin；提交后立即生效，应结合最小权限原则使用。`,
      },
    ],
  },
  {
    slug: "admin-user-entitlement-grants",
    title: "管理员发放会员、Credit 与 Reset Pass",
    summary: "对单个用户直接调整会员、钱包余额和 AI 重置次数的补偿工具。",
    category: "administration",
    kind: "feature",
    status: "current",
    audience: ["管理员", "客服", "财务运营"],
    aliases: ["人工发会员", "余额调整", "Reset Pass 发放"],
    sourcePaths: [
      "frontend-user/src/features/admin/components/UserGrantPanel.tsx",
      "frontend-user/src/features/admin/api/users.ts",
      "backend/internal/vip/admin_user_billing.go",
      "backend/internal/vip/service.go",
      "backend/internal/vip/wallet.go",
    ],
    related: ["membership", "wallet-payg", "gift-codes"],
    sections: [
      {
        id: "membership",
        title: "会员发放与撤销",
        markdown: `在用户详情的权益区域，可以分别发放会员、科研经费或重置次数；选择会员时，再设置 Pro/Max、按天/月/年计时和授予长度。下图依次展示权益概览和单用户发放面板。提交前请再次核对用户、权益种类与期限。

users.manage 单次最多发放 3650 天、120 月或 10 年，超过一年会增加二次确认。撤销会员只把档位恢复为 Free，不会同时清空 Credit 或 Reset Pass。`,
        embeds: [
          { id: "admin-entitlement-grants" },
          {
            id: "admin-user-grant-panel",
            caption: "会员、科研经费与重置次数的独立发放面板",
          },
        ],
      },
      {
        id: "credit",
        title: "Credit 调整",
        markdown: `Credit 支持正向补发和负向扣减，每次调整都会写入不可变的 credit_transactions 记录；扣减后的余额最低为零。当前后台只支持永久 Credit，不提供在此处设置余额到期日的能力。`,
      },
      {
        id: "reset-pass",
        title: "Reset Pass",
        markdown: `Reset Pass 用于补充可重置额度，前端单次最多发 1000 次，并可设置到期时间。三种权益彼此独立，客服补偿前应先查看用户现有档位、余额和有效期，避免重复发放。`,
      },
    ],
  },
  {
    slug: "admin-announcements",
    title: "公告管理",
    summary: "后台公告的排期、受众和状态模型，以及当前缺失的用户侧投递入口。",
    category: "administration",
    kind: "feature",
    status: "current",
    audience: ["管理员", "运营人员", "开发者"],
    aliases: ["站内公告", "维护公告", "Banner 公告"],
    sourcePaths: [
      "frontend-user/src/features/admin/pages/AnnouncementsPage.tsx",
      "frontend-user/src/features/admin/api/announcements.ts",
      "backend/internal/announcement/handler.go",
      "backend/internal/announcement/model.go",
      "backend/cmd/server/routes_admin.go",
    ],
    related: ["admin-messaging", "admin-system-code-snippets"],
    sections: [
      {
        id: "model",
        title: "公告模型",
        markdown: `公告页先列出已有记录及草稿、待生效、直播中或已过期状态；点击新建或编辑后，再设置形式、级别、受众、起止时间、是否可关闭、启用状态和优先级。下图依次展示公告列表和编辑器。

类型值为 banner、popup 或 maintenance_note，级别为 info、warning、danger 或 success，受众为 all、logged_in 或 paid；页面状态由排期和启用信息共同计算。`,
        embeds: [
          { id: "admin-announcements" },
          {
            id: "admin-announcement-editor",
            caption: "公告形式、受众、排期与发布状态编辑器",
          },
        ],
      },
      {
        id: "delivery-gap",
        title: "当前没有公开读取路由",
        markdown: `当前服务器只注册了后台公告 CRUD，没有注册 /api/v1/announcements/active 或其他面向公开页、登录用户的公告读取路由。维护中间件的白名单与注释提到该地址，但没有对应处理器挂载；因此保存受众、优先级和排期并不等于公告已经能在用户端送达。`,
      },
    ],
  },
  {
    slug: "admin-hot-content",
    title: "热门内容运营",
    summary: "按搜索和曝光点击指标观察热门论文、期刊并执行数据保留清理。",
    category: "administration",
    kind: "page",
    status: "current",
    audience: ["运营人员", "管理员"],
    aliases: ["热门论文", "热门期刊", "热度清理"],
    sourcePaths: [
      "frontend-user/src/features/admin/pages/HotContentPage.tsx",
      "frontend-user/src/features/admin/api/hot-content.ts",
      "backend/internal/hotcontent/model.go",
      "backend/internal/hotcontent/repository.go",
      "backend/internal/hotcontent/service.go",
    ],
    related: ["academic-search", "admin-site-analytics"],
    sections: [
      {
        id: "signals",
        title: "热度信号",
        markdown: `进入热门内容页，可以在热搜词、热门论文和热门期刊之间切换，并按时间范围比较搜索、曝光和点击；下图展示的是已有热度数据时的列表状态。

论文与期刊搜索热度使用 search_count；论文另统计 impression_count、click_count 和 seo_view_count。历史 view_count 字段可能仍存在，但当前已不再更新，不能当作实时浏览量。`,
        embeds: [{ id: "admin-hot-content" }],
      },
      {
        id: "retention",
        title: "保留与清理",
        markdown: `打开清理设置，可以调整热词和热门论文的保留天数、最大记录量，并查看自动清理时间；下图展示的是策略已载入、可以编辑的状态。保存或手动清理前应确认影响范围。

查询时间窗最多 180 天；保留天数可设为 1–3650 天，最大记录量为 100 到 1000 万。系统每天 04:30 自动清理，config.manage 也可手动触发；analytics.view 只能读取。`,
        embeds: [
          {
            id: "admin-hot-cleanup-config",
            caption: "热门记录的保留数量与自动清理策略",
          },
        ],
      },
    ],
  },
  {
    slug: "admin-journal-sync",
    title: "期刊同步与发布",
    summary: "把上游期刊数据分批暂存、筛选并发布到站内 SEO 数据面的任务流程。",
    category: "administration",
    kind: "architecture",
    status: "current",
    audience: ["内容运营", "管理员", "开发者"],
    aliases: ["Journal Sync", "期刊导入", "期刊发布"],
    sourcePaths: [
      "frontend-user/src/features/admin/pages/JournalSyncPage.tsx",
      "frontend-user/src/features/admin/api/journal-sync.ts",
      "backend/internal/seoingest/model.go",
      "backend/internal/seoingest/service.go",
      "backend/internal/seo/repository_journal_ingest.go",
    ],
    related: ["authors-and-journals", "admin-tool-operations"],
    sections: [
      {
        id: "states",
        title: "同步状态机",
        markdown: `在期刊同步页可以开始新任务，并对当前任务执行暂停、继续或取消；页面会显示抓取、暂存和发布进度。下图展示的是已有活跃任务和历史记录时的代表状态。

状态为 running、paused、done、failed 或 cancelled，同一时间只能有一个 running 或 paused 任务。活跃时页面每 5 秒刷新，空闲时每 30 秒刷新；取消只停止后续抓取，已暂存数据仍会保留。`,
        embeds: [{ id: "admin-journal-sync" }],
      },
      {
        id: "publication",
        title: "暂存不等于公开",
        markdown: `数据按上游读取 → staged 暂存 → 档位资格筛选 → published 发布推进，不会在拉取后立即公开。发布可按档位和数量执行，单次上限 50000，并按批次事务写入；成功后再更新 sitemap 和提交队列，某一批失败会回滚该批。`,
      },
    ],
  },
  {
    slug: "admin-tool-operations",
    title: "工具目录、导入任务与 Webhook",
    summary: "功能工具的内容生命周期、批量导入任务和出站事件通知。",
    category: "administration",
    kind: "architecture",
    status: "current",
    audience: ["内容运营", "管理员", "开发者"],
    aliases: ["工具管理", "工具导入", "工具 Webhook"],
    sourcePaths: [
      "frontend-user/src/features/admin/pages/FeatureToolsPage.tsx",
      "frontend-user/src/features/admin/pages/FeatureToolImportPage.tsx",
      "frontend-user/src/features/admin/pages/FeatureToolJobsPage.tsx",
      "frontend-user/src/features/admin/pages/FeatureToolWebhooksPage.tsx",
      "backend/internal/featuretool/model.go",
      "backend/internal/featuretool/service.go",
      "backend/internal/featuretool/webhook.go",
    ],
    related: ["feature-tools", "admin-skill-moderation"],
    sections: [
      {
        id: "catalog",
        title: "工具内容生命周期",
        markdown: `进入工具管理后，可以按状态浏览目录并打开条目编辑器，修改内容、访问方式和 SEO 信息；下图依次展示工具列表和编辑弹窗。保存前应分别确认用户可见性与搜索收录设置。

工具状态为 draft、pending、published 或 archived。published 控制用户是否可见，seo_indexable 是另一项 SEO 审核结果；公开可见不等于已经允许搜索引擎收录。`,
        embeds: [
          { id: "admin-tool-operations" },
          {
            id: "admin-tool-editor",
            caption: "工具内容、访问方式与 SEO 信息编辑器",
          },
        ],
      },
      {
        id: "imports",
        title: "批量导入与任务",
        markdown: `批量导入时，先上传或粘贴 JSON/ZIP 并查看校验结果，确认后再创建异步任务；任务详情会显示进度、成功与失败数量以及逐条错误。下图依次展示导入入口和任务详情。

JSON 可以是顶层数组，也可以使用 items 或 tools 字段；ZIP 最多处理 5000 项。系统优先按 source_topic_id、其次按 slug 识别重复项。任务从 pending、running 推进到 succeeded、partial 或 failed，并保留逐项结果。`,
        embeds: [
          {
            id: "admin-tool-import",
            caption: "JSON 工具数据校验与异步导入入口",
          },
          {
            id: "admin-tool-import-job-detail",
            caption: "导入任务进度、结果统计与逐条错误",
          },
        ],
      },
      {
        id: "webhooks",
        title: "Webhook 投递边界",
        markdown: `Webhook 页面先列出订阅及最近投递；新建或编辑时填写地址、可选签名密钥和 created、updated、deleted 事件，再用测试功能检查响应。打开投递详情可以查看成功响应或失败原因。下方三张图依次展示订阅列表、编辑器和投递记录。

出站请求会限制 SSRF 风险。当前 Attempt 固定为 1，每次事件只派发一次，没有自动重试循环；失败后需要查看记录并人工重测。`,
        embeds: [
          {
            id: "admin-tool-webhook-list",
            caption: "Webhook 订阅、状态与最近投递列表",
          },
          {
            id: "admin-tool-webhook-editor",
            caption: "地址、签名密钥与订阅事件编辑器",
          },
          {
            id: "admin-tool-webhook-deliveries",
            caption: "成功响应、失败原因与重试记录",
          },
        ],
      },
    ],
  },
  {
    slug: "admin-skill-moderation",
    title: "社区 Skill 审核",
    summary: "社区 Skill 的审核、举报处置与全局下线控制。",
    category: "administration",
    kind: "rule",
    status: "current",
    audience: ["内容审核员", "管理员", "安全人员"],
    aliases: ["Skill Review", "技能审核", "Skill 下架"],
    sourcePaths: [
      "frontend-user/src/features/admin/pages/SkillReviewPage.tsx",
      "frontend-user/src/features/admin/api/skills.ts",
      "backend/internal/skillmarket/model.go",
      "backend/internal/skillmarket/service.go",
      "backend/internal/skillmarket/bundle.go",
    ],
    related: ["community-skills", "admin-tool-operations"],
    sections: [
      {
        id: "moderation",
        title: "审核状态",
        markdown: `进入社区 Skill 审核后，可以先处理待审核内容，再切到举报队列核对理由和上下文；如果列表加载失败，页面会显示可重试的错误态，而不是把它伪装成空队列。下方三张图依次展示审核列表、举报队列和加载失败状态。

审核状态为 pending、approved、rejected 或 flagged。只有公开、approved 且 active 的 Skill 才能被其他用户查看和安装；作者修改已公开版本后会重新进入 pending。举报只提供人工判断依据，不会按数量自动改状态或下架。`,
        embeds: [
          { id: "admin-skill-moderation" },
          {
            id: "admin-skill-report-queue",
            caption: "独立于上架审核的技能举报队列",
          },
          {
            id: "admin-skill-review-error",
            caption: "与真实空队列区分的加载失败状态",
          },
        ],
      },
      {
        id: "takedown",
        title: "下架与安全边界",
        markdown: `全局开关可以停止社区市场，单项强制下架要求输入 TAKEDOWN，并把内容改为私有、禁用。审核流程会解析和规范化 SKILL.md，但不是恶意代码沙箱，也不会通过执行压缩包内脚本来证明其安全性；审核人仍需检查指令、外链和权限诱导。`,
      },
    ],
  },
  {
    slug: "admin-feedback-operations",
    title: "反馈处理",
    summary: "检索用户反馈、查看附件并通过邮件和站内通知回复。",
    category: "administration",
    kind: "feature",
    status: "current",
    audience: ["客服", "运营人员", "管理员"],
    aliases: ["反馈工单", "用户反馈", "反馈回复"],
    sourcePaths: [
      "frontend-user/src/features/admin/pages/FeedbackPage.tsx",
      "frontend-user/src/features/admin/api/feedback.ts",
      "backend/internal/feedback/model.go",
      "backend/internal/feedback/service.go",
      "backend/cmd/server/routes_admin.go",
    ],
    related: ["feedback-and-support", "admin-mail-support-observability"],
    sections: [
      {
        id: "workflow",
        title: "处理状态与详情",
        markdown: `反馈后台可以搜索和筛选记录；点击一条反馈后，在详情弹窗中查看正文、提交 IP、附件与当前状态，再选择处理、回复或关闭。下图依次展示反馈列表和详情/回复弹窗。

状态为 pending、processed、replied 或 closed。回复会发送邮件；反馈来自登录用户时，还会创建站内通知，并把记录推进为 replied。`,
        embeds: [
          { id: "admin-feedback" },
          {
            id: "admin-feedback-detail-dialog",
            caption: "反馈内容、附件、状态与回复详情",
          },
        ],
      },
      {
        id: "assignment-gap",
        title: "当前没有可用的指派入口",
        markdown: `仓储模型保留了 assignee 等字段和方法，但服务器没有注册管理员指派路由，前端也没有可执行的分派操作。因此现阶段不能把数据库中的指派字段当作完整工单队列，团队归属仍需使用外部流程协调。`,
      },
    ],
  },
  {
    slug: "admin-messaging",
    title: "站内消息管理",
    summary: "创建草稿并向全体、指定用户或套餐人群同步发送站内消息。",
    category: "administration",
    kind: "feature",
    status: "current",
    audience: ["运营人员", "管理员", "开发者"],
    aliases: ["站内信", "消息群发", "Message Broadcast"],
    sourcePaths: [
      "frontend-user/src/features/admin/pages/MessagesPage.tsx",
      "frontend-user/src/features/admin/api/messages.ts",
      "backend/internal/message/model.go",
      "backend/internal/message/repository.go",
      "backend/internal/message/service.go",
    ],
    related: ["admin-announcements", "admin-feedback-operations"],
    sections: [
      {
        id: "send",
        title: "草稿与发送",
        markdown: `站内消息页先列出草稿与已发送记录；新建时选择类别、收件范围、正文和链接，保存草稿后再进入发送确认。全体发送还需要输入 SEND。下方三张图依次展示消息列表、草稿编辑器和最终确认弹窗。

类别为 system、promotion 或 transaction，范围为 all、batch、single 或 by_plan。只有 draft 可以发送，single/batch 必须有收件人；发送会同步推进到不可逆状态。当前后台没有消息更新或删除路由。`,
        embeds: [
          { id: "admin-messaging" },
          {
            id: "admin-message-editor",
            caption: "消息目标、正文与链接的草稿编辑器",
          },
          {
            id: "admin-message-send-confirm",
            caption: "不可撤回发送前的目标复核与输入确认",
          },
        ],
      },
      {
        id: "legacy-plan",
        title: "by_plan 的遗留字段风险",
        markdown: `by_plan 的仓储查询仍使用历史 users.subscription_plan 字段，而当前会员真源是 users.vip_tier；按套餐发送可能匹配为空或选中错误人群。需要可靠定向时，应先用用户查询确认目标，再使用明确的用户 ID 列表。`,
      },
      {
        id: "audit-limit",
        title: "收件人审计限制",
        markdown: `消息列表响应不返回 target_user_ids，因此事后无法从列表精确还原 batch 的原始目标集合。发送前应在外部变更记录中保存筛选条件和用户 ID，不能仅依赖消息标题证明投递范围。`,
      },
    ],
  },
  {
    slug: "admin-mail-support-observability",
    title: "邮件中心、客服配置与发送日志",
    summary: "统一说明客服邮箱收发、公开联系方式配置，以及邮件和短信投递日志。",
    category: "administration",
    kind: "architecture",
    status: "current",
    audience: ["客服", "管理员", "运维人员"],
    aliases: ["邮件中心", "客服中心配置", "邮件短信日志"],
    sourcePaths: [
      "frontend-user/src/features/admin/pages/MailCenterPage.tsx",
      "frontend-user/src/features/admin/pages/SupportCenterConfigPage.tsx",
      "frontend-user/src/features/admin/pages/EmailLogsPage.tsx",
      "backend/internal/supportcenter/service.go",
      "backend/internal/emaillog/handler.go",
    ],
    related: ["feedback-and-support", "admin-messaging", "admin-dashboard"],
    sections: [
      {
        id: "mailbox",
        title: "邮件中心",
        markdown: `进入邮件中心后，可以在客服邮箱工作台筛选来信、阅读正文并直接回复，也可以打开新建邮件弹窗主动发信。下方三张图依次展示邮件模块总览、收件箱工作台和新建邮件弹窗。

邮件中心通过 IMAP 拉取并轮询支持邮箱，通过 SMTP 回复或发信；富文本来信在沙箱中预览，避免直接执行 HTML。这里操作的是配置的客服邮箱，不是所有系统通知的统一重试队列。`,
        embeds: [
          { id: "admin-mail-support" },
          {
            id: "admin-mailbox-workspace",
            caption: "筛选、阅读与回复一体的客服邮箱工作台",
          },
          {
            id: "admin-mail-compose-dialog",
            caption: "管理员主动发送客服邮件的编辑弹窗",
          },
        ],
      },
      {
        id: "support-config",
        title: "客服公开配置",
        markdown: `客服配置页先概览公开联系方式和通道状态，再分别编辑邮箱说明、二维码、IMAP、SMTP 与飞书通知。下图依次展示配置总览和完整通道表单。保存后再执行连接测试；页面有未保存改动时，测试按钮会禁用，避免把旧凭据的成功误认为新凭据有效。

二维码只接受 data URL，最大 300 KiB。飞书配置还包含 Webhook、签名和事件开关。`,
        embeds: [
          { id: "admin-support-config" },
          {
            id: "admin-support-channel-config",
            caption: "公开联系方式、IMAP、SMTP 与飞书通知配置",
          },
        ],
      },
      {
        id: "delivery-logs",
        title: "邮件与短信日志",
        markdown: `进入发送日志后，先查看总数、成功与失败汇总，再在邮件和短信页签之间切换，并按分类、状态或关键词查找记录；失败行会保留原始错误。下图展示的是成功和失败结果并存的代表状态。

底层 email_logs 通过 channel 区分渠道。日志只能用于回看历史投递结果，不表示已经提供一键重发、死信队列或自动补偿。`,
        embeds: [{ id: "admin-delivery-logs" }],
      },
    ],
  },
  {
    slug: "admin-session-monitoring",
    title: "AI 会话监控",
    summary: "只读检查多个 AI 功能的会话、消息、工具调用和产物。",
    category: "administration",
    kind: "page",
    status: "current",
    audience: ["管理员", "技术支持", "安全人员"],
    aliases: ["会话监控", "Agent 会话审计", "Peer Review 调试"],
    sourcePaths: [
      "frontend-user/src/features/admin/pages/SessionMonitorPage.tsx",
      "frontend-user/src/features/admin/components/ChatSessionMonitor.tsx",
      "frontend-user/src/features/admin/components/PeerReviewMonitor.tsx",
      "backend/internal/agentbridge/admin_monitor.go",
      "backend/internal/peerreview/admin.go",
    ],
    related: ["agent-runtime", "peer-review", "admin-token-cost"],
    sections: [
      {
        id: "coverage",
        title: "覆盖范围与刷新",
        markdown: `AI 会话监控可以在 smart、claw、slides、draw、stat、prism 和 peer review 之间切换；通用会话按搜索词、模型、轮次、重置状态和时间筛选，Peer Review 则提供投稿检索、评审模式与执行状态。下图依次展示通用会话总览和 Peer Review 监控面板。

通用列表每页 20 条并每 30 秒刷新。详情可查看消息、工具调用、附件与产物；Peer Review 还保留偏调试用途的原始记录。`,
        embeds: [
          { id: "admin-session-monitoring" },
          {
            id: "admin-peer-review-monitor",
            caption: "投稿检索、评审模式与执行状态总览",
          },
        ],
      },
      {
        id: "read-only",
        title: "只读与隐私边界",
        markdown: `点击监控记录后，可以只读查看对话与工具调用、智能审稿的投稿和进度，并在受控预览器中打开附件。下方三张图依次展示通用会话详情、Peer Review 详情和文件预览。

这些页面要求 analytics.view，只用于排障，不能修改会话或代替用户继续对话。记录可能包含未发表研究、附件和模型输出，应按敏感业务数据处理；拥有后台权限不代表可以无目的浏览。`,
        embeds: [
          {
            id: "admin-chat-session-detail",
            caption: "包含消息与工具调用的只读会话抽屉",
          },
          {
            id: "admin-peer-review-detail",
            caption: "投稿信息、评审进度与原始记录详情",
          },
          {
            id: "admin-file-preview",
            caption: "会话附件的受控预览界面",
          },
        ],
      },
    ],
  },
  {
    slug: "admin-site-analytics",
    title: "网站与爬虫分析",
    summary: "组合 Umami 站点指标与独立爬虫访问统计的分析页面。",
    category: "administration",
    kind: "page",
    status: "current",
    audience: ["运营人员", "管理员", "SEO 人员"],
    aliases: ["网站分析", "Umami", "爬虫统计"],
    sourcePaths: [
      "frontend-user/src/features/admin/pages/AnalyticsPage.tsx",
      "frontend-user/src/features/admin/api/analytics.ts",
      "backend/internal/umami/handler.go",
      "backend/internal/umami/client.go",
      "backend/internal/umami/crawler.go",
    ],
    related: ["admin-dashboard", "admin-feature-usage"],
    sections: [
      {
        id: "umami",
        title: "站点指标",
        markdown: `配置 Umami website ID 后，站点分析页会显示访客、会话、页面浏览、跳出率、平均时长与实时活跃，并可继续查看日趋势和页面、来源、国家、浏览器、系统、设备排行。下方前 3 张图依次展示分析总览、趋势和维度排行；第 4 张图是尚未配置 Umami 时的设置空态。

未配置时 API 返回 configured: false，这不表示访问量为零，也不应被当作统计服务故障。`,
        embeds: [
          { id: "admin-site-analytics" },
          {
            id: "admin-site-analytics-trend",
            caption: "站点 KPI 与 PV、Session 日趋势",
          },
          {
            id: "admin-site-analytics-dimensions",
            caption: "页面、来源、国家、浏览器、系统与设备排行",
          },
          { id: "admin-analytics-setup", caption: "未配置 Umami 时的空态" },
        ],
      },
      {
        id: "crawlers",
        title: "爬虫统计",
        markdown: `爬虫监控独立于 Umami，可查看 24 小时、7 天或 30 天范围内的搜索引擎、趋势和热门页面。页面区分真实空数据与请求失败；分析 SEO 时应同时标注时间窗，避免拿不同范围的总数直接比较。`,
      },
    ],
  },
  {
    slug: "admin-feature-usage",
    title: "功能使用统计",
    summary: "基于 usage_events v2 观察登录与匿名用户的功能使用和审核漏斗。",
    category: "administration",
    kind: "page",
    status: "current",
    audience: ["产品运营", "管理员", "开发者"],
    aliases: ["Usage Stats", "功能事件", "Peer Review 漏斗"],
    sourcePaths: [
      "frontend-user/src/features/admin/pages/UsageStatsPage.tsx",
      "frontend-user/src/features/admin/api/usage-stats.ts",
      "backend/internal/usagestat/model.go",
      "backend/internal/usagestat/repository.go",
      "backend/internal/usagestat/service.go",
    ],
    related: ["admin-site-analytics", "peer-review"],
    sections: [
      {
        id: "events",
        title: "事件口径",
        markdown: `功能使用页会先汇总总量、今日量、登录用户和匿名访客，再按日期与功能查看趋势；下图依次展示功能总览和每日事件趋势。筛选或对比时应保持同一时间范围与用户口径。

当前读取的是 usage_events v2。旧 usage_logs 表不再进入这套统计，历史查询或临时报表不能把两种口径直接相加。`,
        embeds: [
          { id: "admin-feature-usage" },
          {
            id: "admin-feature-usage-trend",
            caption: "登录用户、匿名访客与每日功能事件趋势",
          },
        ],
      },
      {
        id: "funnel",
        title: "Peer Review 五步漏斗",
        markdown: `Peer Review 的五步漏斗描述站内事件推进，例如进入、上传、配置、启动和完成；它衡量产品流程而不是外部期刊审稿或论文发表是否成功。事件漏记会影响漏斗，因此趋势异常需要结合客户端埋点版本核查。`,
      },
    ],
  },
  {
    slug: "admin-token-cost",
    title: "算力用量统计",
    summary: "按功能、模型、提供商和用户核算 LLM 算力点、Token 与实际成本。",
    category: "administration",
    kind: "page",
    status: "current",
    audience: ["管理员", "财务运营", "AI 平台人员"],
    aliases: ["Token Usage", "LLM 成本", "算力点成本"],
    sourcePaths: [
      "frontend-user/src/features/admin/pages/TokenUsageStatsPage.tsx",
      "frontend-user/src/features/admin/api/token-usage.ts",
      "backend/internal/llmusage/models_admin.go",
      "backend/internal/llmusage/service_stats.go",
      "backend/internal/modelcatalog/service.go",
    ],
    related: [
      "ai-usage-quota",
      "admin-model-provider-catalog",
      "admin-billing-configuration",
    ],
    sections: [
      {
        id: "dimensions",
        title: "统计维度",
        markdown: `进入算力统计后，先按日期、功能、来源、模型、Provider、用户或匿名身份筛选，再查看核心指标与每日趋势；继续向下可以比较功能、模型、Provider 和用户占比，最后检查单次调用日志。下方四张图依次展示页面总览、筛选与趋势、维度拆分和调用明细。

数据来自 llm_token_usage，主口径是算力点，同时汇总输入/输出 Token、缓存读写、调用数、独立用户和未计价调用。维度顺序为模型、功能、来源、Provider、Top 用户，横条长度表示算力点占比。导出沿用当前筛选，最多 100000 条，并附 UTF-8 BOM 以便表格软件正确识别中文。`,
        embeds: [
          { id: "admin-token-cost" },
          {
            id: "admin-token-usage-filters-chart",
            caption: "算力筛选条件、核心指标与每日趋势",
          },
          {
            id: "admin-token-usage-dimensions",
            caption: "功能、模型、Provider 与用户维度拆分",
          },
          {
            id: "admin-token-usage-logs",
            caption: "单次调用的 Token、算力点与结果日志",
          },
        ],
      },
      {
        id: "pricing",
        title: "成本口径",
        markdown: `系统中 1 算力点 = 1000 微元 = ¥0.001，与用户额度扣减同源同单位。实际成本分别使用模型目录中的输入、输出、缓存读取和缓存写入价格计算；未计价调用不会折算为算力点，并从总算力点中排除。它表示成本未知，不表示模型免费或没有 Token 消耗。`,
      },
    ],
  },
  {
    slug: "admin-invite-analytics",
    title: "邀请关系与转化分析",
    summary: "只读追踪邀请打开、注册、奖励、首单返利和退款冲销。",
    category: "administration",
    kind: "page",
    status: "current",
    audience: ["运营人员", "管理员", "财务运营"],
    aliases: ["邀请分析", "邀请转化", "Invite Analytics"],
    sourcePaths: [
      "frontend-user/src/features/admin/pages/InvitesPage.tsx",
      "frontend-user/src/features/admin/api/invites.ts",
      "backend/internal/invite/campaign_bind.go",
      "backend/internal/invite/model.go",
      "backend/internal/invite/handler.go",
    ],
    related: ["invite-campaign", "admin-campaigns-promo"],
    sections: [
      {
        id: "metrics",
        title: "关系与指标",
        markdown: `进入邀请分析后，可以查看打开、注册、奖励和转化 KPI，再从列表打开单条关系，核对来源、绑定方式、双方注册奖励、首个已支付订单返利，以及退款后的冲销和余额不足缺口。下图展示的是指标与关系列表同时有数据的状态。

该页面要求 analytics.view，只用于分析，不负责修改活动配置。`,
        embeds: [{ id: "admin-invite-analytics" }],
      },
      {
        id: "snapshots",
        title: "历史快照",
        markdown: `邀请关系创建时会保存当时的活动规则快照，后续调整全局活动不应反向改写既有关系的历史口径。分析异常时要同时查看关系快照、订单履约与退款事件，而不能只拿当前活动配置推断过去应发金额。`,
      },
    ],
  },
  {
    slug: "admin-campaigns-promo",
    title: "邀请活动与推广弹窗",
    summary: "管理邀请奖励规则与用户侧推广展示，两者共享运营页面但职责不同。",
    category: "administration",
    kind: "rule",
    status: "current",
    audience: ["运营人员", "管理员", "财务运营"],
    aliases: ["Activities", "邀请活动", "Promo 配置"],
    sourcePaths: [
      "frontend-user/src/features/admin/pages/ActivitiesPage.tsx",
      "frontend-user/src/features/admin/api/invite-campaign.ts",
      "frontend-user/src/features/admin/api/promo-config.ts",
      "backend/internal/invite/service.go",
      "backend/internal/invite/model.go",
      "backend/internal/promo/service.go",
    ],
    related: ["invite-campaign", "promotion-banner", "admin-invite-analytics"],
    sections: [
      {
        id: "invite-campaign",
        title: "邀请奖励规则",
        markdown: `活动管理页把邀请奖励与推广展示分成两个页签；在邀请页签中，可以设置总开关、双方注册礼、每日计奖人数、绑定时窗、首单返利与有效时窗，以及邀请码帮助链接。下图只展示具备相应权限时的“邀请有礼”页签。

邀请页签和保存 API 都要求 config.manage。两种注册礼单项上限为 10 亿经费；每日上限最高 100 万人，0 表示不限；绑定时窗与首单时窗分别为 1–3650 天，不能合成一个“有效期”；返利为 0–10000 基点；帮助链接必须是完整 HTTP(S) 地址且不超过 500 字符。启用时至少一种注册礼或首单返利非零，新关系会保存当时规则的快照。`,
        embeds: [{ id: "admin-campaigns-promo" }],
      },
      {
        id: "permissions",
        title: "页面可见不等于可编辑",
        markdown: `operations 具备 content.manage，因此可以从活动页面处理内容型推广，但没有 config.manage 时不能修改邀请财务规则。关闭活动会隐藏入口并停止新绑定；已经建立的关系仍按其快照处理，不能把关停理解为自动撤销已承诺奖励。`,
      },
      {
        id: "promo",
        title: "推广展示边界",
        markdown: `切到推广配置后，可以编辑启用状态、微信客服二维码、标题、副标题、福利点和按钮文案，并在同页预览用户弹窗；下图展示的是配置表单与预览同时可见的状态。用户端会按总开关显示“限时活动”入口，并可能在首屏或额度耗尽时弹出。

配置中没有目标地址字段，也没有 Promo 专属的领取、发权益或领取审计 API；扫码或点击本身不会自动发放会员或经费。二维码只接受 PNG、JPEG 或 WebP，解码后不超过 300 KiB。`,
        embeds: [
          {
            id: "admin-promo-config-preview",
            caption: "推广开关、文案与用户端弹窗预览",
          },
        ],
      },
    ],
  },
  {
    slug: "admin-billing-configuration",
    title: "AI 计费配置",
    summary: "控制免费窗口、会员倍率、套餐价格和经费换算的全局计费规则。",
    category: "administration",
    kind: "rule",
    status: "current",
    audience: ["管理员", "财务运营", "AI 平台人员"],
    aliases: ["Billing Config", "计费倍率", "经费换算"],
    sourcePaths: [
      "frontend-user/src/features/admin/pages/BillingConfigPage.tsx",
      "frontend-user/src/features/admin/api/billing-config.ts",
      "backend/internal/vip/billing_model.go",
      "backend/internal/vip/config.go",
      "backend/internal/vip/billing_test.go",
    ],
    related: ["membership", "wallet-payg", "admin-token-cost"],
    sections: [
      {
        id: "switches",
        title: "计费开关与倍率",
        markdown: `AI 计费页集中展示总开关、免费窗口、Pro/Max 倍率、月年价格、充值汇率、经费到算力点换算和最低充值；修改后先核对差异摘要，再确认保存。下图展示的是各组配置已载入的代表状态。

enabled 为 false 时，AI 调用不计费，也不受这套计费限制。倍率小于等于零表示不限量，年度价格为零会隐藏年付选项。经费→重置次数换算率仍只读显示，用于历史迁移换算，不参与当前计费判断。`,
        embeds: [{ id: "admin-billing-configuration" }],
      },
      {
        id: "validation",
        title: "服务端约束",
        markdown: `启用后免费窗口必须大于零，经费到算力点换算必须为正；后端还要求按量付费严格贵于所有已配置套餐，防止价格倒挂。聚合配置缓存 30 秒，保存会主动失效缓存；前端以差异摘要和确认框降低误改风险。`,
      },
    ],
  },
  {
    slug: "admin-model-provider-catalog",
    title: "AI Provider 与模型目录",
    summary: "维护兼容上游提供商、模型能力、价格和用户可选策略。",
    category: "administration",
    kind: "architecture",
    status: "current",
    audience: ["AI 平台人员", "管理员", "开发者"],
    aliases: ["Model Catalog", "AI 上游", "模型供应商"],
    sourcePaths: [
      "frontend-user/src/features/admin/pages/AiUpstreamPage.tsx",
      "frontend-user/src/features/admin/pages/ModelCatalogPage.tsx",
      "frontend-user/src/features/admin/components/ProviderSection.tsx",
      "frontend-user/src/features/admin/components/ModelFormDialog.tsx",
      "backend/internal/modelcatalog/provider.go",
      "backend/internal/modelcatalog/service.go",
    ],
    related: ["agent-runtime", "admin-model-bindings", "admin-token-cost"],
    sections: [
      {
        id: "providers",
        title: "Provider",
        markdown: `模型目录先按 Provider 展示端点、推送状态、计价和所属模型；点击新建或编辑后，可以配置名称、API 端点、兼容格式与推送选项。下方三张图依次展示目录总览、单个 Provider 区块和编辑器。

系统预置 DeepSeek，并支持 Qwen、Kimi、智谱、豆包、MiniMax 和自定义 OpenAI 兼容上游。Provider 变更会向执行器推送，并显示 pending、success 或 failed；仍有关联模型时不能删除，页面也会提示孤儿模型。`,
        embeds: [
          { id: "admin-model-catalog" },
          {
            id: "admin-provider-sections",
            caption: "单个 Provider 的推送、计价与所属模型状态",
          },
          {
            id: "admin-provider-editor",
            caption: "模型端点、API 格式与推送配置编辑器",
          },
        ],
      },
      {
        id: "models",
        title: "模型目录与定价",
        markdown: `在 Provider 区块中打开模型编辑器，可以设置上下文长度、最大输出、输入/输出/缓存读/缓存写四类价格、允许档位、启用状态、用户可选性和调用限制；下图展示的是模型参数与价格表单。

每个模型只能归属于一个 Provider。后端不允许四项价格全为零的模型同时设为 enabled 且 user_selectable，避免用户可选模型绕过成本核算。`,
        embeds: [
          {
            id: "admin-model-editor",
            caption: "模型参数、四类单价与可见范围编辑器",
          },
        ],
      },
    ],
  },
  {
    slug: "admin-third-party-account-pool",
    title: "第三方账号池",
    summary: "维护 AI model 与 Minicod 外部账号、健康状态和敏感凭据。",
    category: "administration",
    kind: "entity",
    status: "current",
    audience: ["管理员", "AI 平台人员", "安全人员"],
    aliases: ["Third Party Accounts", "AI 账号池", "Minicod 账号"],
    sourcePaths: [
      "frontend-user/src/features/admin/pages/ThirdPartyPage.tsx",
      "frontend-user/src/features/admin/api/third-party.ts",
      "backend/internal/thirdparty/model.go",
      "backend/internal/thirdparty/repository.go",
      "backend/internal/thirdparty/service.go",
    ],
    related: ["admin-model-provider-catalog", "admin-dashboard"],
    sections: [
      {
        id: "routing",
        title: "账号选择与健康",
        markdown: `第三方账号池会列出 AI model 和 Minicod 账号的状态、优先级、成功数、失败数与延迟，并提供测试、重置、编辑或删除动作；下图展示的是多账号及健康状态并存的列表。

选择账号时，优先级数值越小越先使用，同优先级再参考使用次数。账号池与模型 Provider、用途绑定属于不同配置层，排障时不要混为一项。`,
        embeds: [{ id: "admin-third-party-accounts" }],
      },
      {
        id: "secrets",
        title: "敏感信息显示",
        markdown: `打开账号编辑器后，字段会按 AI model 或 Minicod 类型变化，敏感值默认保持掩码；只有主动选择显示敏感信息时才请求明文。下图展示的是凭据编辑状态。

关闭对话框后应立即恢复隐藏。一次显示可能返回该账号的完整相关密钥，屏幕共享、截图和浏览器日志都可能造成泄露。历史 AI model 账号仍存在，但新功能也可能使用模型目录与 Agent 执行器，排障前应先确认实际调用链。`,
        embeds: [
          {
            id: "admin-third-party-editor",
            caption: "按账号类型切换字段的敏感凭据编辑器",
          },
        ],
      },
    ],
  },
  {
    slug: "admin-model-bindings",
    title: "模型用途绑定",
    summary: "把封闭的系统与项目用途键映射到模型目录中的具体模型。",
    category: "administration",
    kind: "rule",
    status: "current",
    audience: ["AI 平台人员", "管理员", "开发者"],
    aliases: ["Model Binding", "项目模型", "Purpose Binding"],
    sourcePaths: [
      "frontend-user/src/features/admin/pages/ModelCatalogPage.tsx",
      "frontend-user/src/features/admin/api/model-catalog.ts",
      "backend/internal/modelcatalog/model.go",
      "backend/internal/modelcatalog/repository.go",
      "backend/internal/modelcatalog/service.go",
    ],
    related: ["admin-model-provider-catalog", "admin-analysis-dimensions"],
    sections: [
      {
        id: "purposes",
        title: "封闭用途集合",
        markdown: `模型用途页按固定 key 列出每个系统或产品用途及当前目标模型；选择一行后只能更换模型，不能改用途 key。下图展示的是多项用途已经完成绑定的状态。

当前共 10 个规范用途：system.main、system.fast、project.smart、project.claw、project.prism、project.peerreview.meta、project.peerreview.methodology、project.translate、project.analysis 和 project.wechat_oa。`,
        embeds: [{ id: "admin-model-bindings" }],
      },
      {
        id: "aliases",
        title: "别名与回退",
        markdown: `slides、draw、stat 归一到 claw；letter 归一到 peerreview.meta；scoring 和 chief 归一到 peerreview.methodology；planner 和 revision 归一到 prism，历史 free 覆盖已经退役。缺少专用绑定时回退 system.main；保存后会失效缓存并向执行器推送。`,
      },
    ],
  },
  {
    slug: "admin-analysis-dimensions",
    title: "矩阵分析维度",
    summary: "维护论文矩阵分析所用的系统维度名称、描述、排序和启用状态。",
    category: "administration",
    kind: "entity",
    status: "current",
    audience: ["AI 产品运营", "管理员", "开发者"],
    aliases: ["Dimensions", "分析维度", "矩阵维度"],
    sourcePaths: [
      "frontend-user/src/features/admin/pages/DimensionsPage.tsx",
      "frontend-user/src/features/admin/api/dimensions.ts",
      "backend/internal/ai/model.go",
      "backend/internal/ai/service_dimension.go",
      "backend/internal/ai/handler.go",
    ],
    related: ["matrix-analysis", "admin-model-bindings"],
    sections: [
      {
        id: "records",
        title: "系统维度",
        markdown: `矩阵维度页列出系统维度及排序、描述和启用状态；打开编辑器后，可以修改名称、AI 指示、排序和启用状态。下图依次展示维度列表和编辑器。

维度来自动态 API，不能把页面注释中的固定数量当作产品契约。系统维度使用 user_id = -1；名称和描述不超过 100 字符，key 锁定，用户自定义维度仍属于另一层数据。`,
        embeds: [
          { id: "admin-analysis-dimensions" },
          {
            id: "admin-dimension-editor",
            caption: "维度名称、AI 指示、排序与启用状态编辑器",
          },
        ],
      },
      {
        id: "prompt-impact",
        title: "对模型提示的影响",
        markdown: `维度描述会直接拼入分析提示，停用会影响所有后续矩阵分析调用，因此文案修改属于模型行为变更。若系统维度列表为空，更可能是迁移或配置异常，不应把空列表当成产品默认状态。`,
      },
    ],
  },
  {
    slug: "admin-wechat-official",
    title: "微信公众号配置",
    summary: "配置公众号接入、消息加密、自动回复和专用模型用途。",
    category: "administration",
    kind: "feature",
    status: "current",
    audience: ["管理员", "运营人员", "AI 平台人员"],
    aliases: ["WeChat Official", "公众号自动回复", "微信 OA"],
    sourcePaths: [
      "frontend-user/src/features/admin/pages/WechatOfficialPage.tsx",
      "frontend-user/src/features/admin/api/wechat-official.ts",
      "backend/internal/wechatofficial/model.go",
      "backend/internal/wechatofficial/handler.go",
      "backend/internal/wechatofficial/service.go",
    ],
    related: ["admin-model-bindings", "wechat-mini-program"],
    sections: [
      {
        id: "connection",
        title: "接入与加密",
        markdown: `公众号配置页会显示接入状态、加密模式和 AI 自动回复开关；编辑时填写 AppID、AppSecret、Token、EncodingAESKey，并在 plaintext、compatible、secure 中选择模式。下图展示的是接入信息已填写的代表状态。

密钥默认掩码，未修改时可以保留原值。更新接入信息必须同步修改微信公众平台的回调配置，不能只改 Scholay 后台。`,
        embeds: [{ id: "admin-wechat-official" }],
      },
      {
        id: "reply",
        title: "AI 自动回复",
        markdown: `可启停自动回复并配置系统提示，关闭时前端要求确认。使用模型来自 project.wechat_oa 用途绑定，而不是在公众号页面自由选择；排查回复模型时应检查绑定与 Provider 健康，而不仅是公众号开关。`,
      },
    ],
  },
  {
    slug: "admin-news-webhook",
    title: "研究新闻 Webhook",
    summary: "接收上游新闻事件、验签去重并说明本地开关与重试能力的边界。",
    category: "administration",
    kind: "architecture",
    status: "current",
    audience: ["内容运营", "管理员", "开发者"],
    aliases: ["News Webhook", "新闻同步", "新闻回调"],
    sourcePaths: [
      "frontend-user/src/features/admin/pages/NewsWebhookConfigPage.tsx",
      "frontend-user/src/features/admin/api/news-webhook.ts",
      "backend/internal/news/handler.go",
      "backend/internal/news/repository.go",
      "backend/internal/news/service.go",
    ],
    related: ["research-news", "admin-system-code-snippets"],
    sections: [
      {
        id: "ingestion",
        title: "验签、去重与写入",
        markdown: `研究新闻 Webhook 页面会显示接收地址、共享密钥的掩码、展示开关和事件说明，管理员可以复制地址并按需显示密钥；下图展示的是配置已载入的状态。

接收器对原始请求体做 HMAC 校验，失败即拒绝。支持 created、updated、heat 事件；Redis 提供 24 小时投递锁，数据库保存 delivery 并执行 upsert，处理失败会释放锁。未知事件会被记录并返回 200，但不会更新内容。`,
        embeds: [{ id: "admin-news-webhook" }],
      },
      {
        id: "display-switch",
        title: "后台开关只控制展示",
        markdown: `后台 enabled 是新闻展示开关，不会停止 Webhook 入库。回调地址由 SITE_URL 派生，密钥默认掩码并可显式查看；关停页面展示不能替代撤销上游回调或轮换密钥。`,
      },
      {
        id: "retry-contract",
        title: "重试是上游契约",
        markdown: `页面列出的 1 分钟、5 分钟、30 分钟、2 小时、6 小时重试与最终死信，是要求上游遵守的投递契约；本仓库没有对应本地死信队列、自动重试调度或后台重放 API。不能据此宣称失败新闻会由 Scholay 自动补投。`,
      },
    ],
  },
  {
    slug: "admin-system-code-snippets",
    title: "系统配置与代码片段",
    summary:
      "管理站点级认证、通知通道、统计标签，以及可注入页面的 HTML/JavaScript。",
    category: "administration",
    kind: "rule",
    status: "current",
    audience: ["管理员", "运维人员", "安全人员"],
    aliases: ["System Config", "Code Snippets", "全局脚本"],
    sourcePaths: [
      "frontend-user/src/features/admin/pages/SystemConfigPage.tsx",
      "frontend-user/src/features/admin/pages/CodeSnippetsPage.tsx",
      "frontend-user/src/features/admin/components/ConfigPageGuard.tsx",
      "backend/internal/config/handler_system.go",
      "backend/internal/config/handler_snippets.go",
      "backend/internal/common/model/code_snippet.go",
    ],
    related: [
      "admin-access-control",
      "admin-oauth-config",
      "admin-payment-merchants",
    ],
    sections: [
      {
        id: "system",
        title: "站点级配置",
        markdown: `系统设置页先概览站点安全与通知通道，再分别编辑邮箱验证、Turnstile、Google Analytics/GTM、邮件 SMTP 和短信网关，并执行连接测试。下图依次展示系统总览和基础/邮件/短信表单。

修改要求 config.manage，多数配置以整行 PUT 保存。页面会处理加载失败、未保存改动和离页提醒，但这不等于数据库级全局审计日志。维护状态会显示在后台全局提醒中，不过当前系统设置页没有维护模式编辑控件。`,
        embeds: [
          { id: "admin-system-config" },
          {
            id: "admin-system-channel-forms",
            caption: "基础安全、邮件 SMTP 与短信网关配置面板",
          },
        ],
      },
      {
        id: "snippets",
        title: "代码片段",
        markdown: `代码片段页列出已配置脚本及启用、位置和作用范围；打开编辑器后，再填写类别、注入位置、优先级、加载时机、全局或路径范围，以及 HTML/JavaScript 内容。下图依次展示片段列表和高风险编辑弹窗。

类别为 SEO、analytics、ad、social 或 other，位置为 head、body-start 或 body-end。内容允许任意 HTML/JavaScript，错误配置可能造成 XSS、供应链或全站性能风险；应像发布代码一样评审，并留存可回滚文本。`,
        embeds: [
          { id: "admin-code-snippets" },
          {
            id: "admin-code-snippet-editor",
            caption: "全站注入脚本的高风险编辑弹窗",
          },
        ],
      },
    ],
  },
  {
    slug: "admin-oauth-config",
    title: "OAuth 与第三方登录配置",
    summary: "维护网页 OAuth、Discourse 与微信小程序登录凭据及公开状态。",
    category: "administration",
    kind: "feature",
    status: "current",
    audience: ["管理员", "运维人员", "安全人员"],
    aliases: ["OAuth Config", "第三方登录", "登录 Provider"],
    sourcePaths: [
      "frontend-user/src/features/admin/pages/OAuthConfigPage.tsx",
      "frontend-user/src/features/admin/components/WechatMiniProgramPanel.tsx",
      "frontend-user/src/features/admin/api/oauth.ts",
      "frontend-user/src/features/admin/api/wechat-miniprogram.ts",
      "backend/internal/config/handler_oauth.go",
      "backend/internal/wechat/miniprogram_handler.go",
    ],
    related: ["account", "wechat-mini-program", "admin-system-code-snippets"],
    sections: [
      {
        id: "providers",
        title: "支持范围",
        markdown: `OAuth 设置页会列出 GitHub、Google、Apple、ORCID、Microsoft、Discourse 和微信网页登录，并在同页提供独立保存的微信小程序配置。先选择提供方、填写凭据并启用，再核对公开登录入口。下图依次展示网页提供方列表和微信小程序凭据面板。

公开配置只暴露启用状态等安全字段，客户端据此显示入口。Google 启用时提供 GIS 登录所需 client_id；当前账户设置中的“新绑定 Google”仍未接通，因此启用登录不等于绑定入口可用。`,
        embeds: [
          { id: "admin-oauth-config" },
          {
            id: "admin-oauth-miniprogram",
            caption: "独立保存的微信小程序登录凭据",
          },
        ],
      },
      {
        id: "secrets",
        title: "密钥与账号语义",
        markdown: `密钥默认掩码，显式揭示后才返回；整条保存需要保留未修改的密文占位，避免用掩码覆盖真密钥。启用 Provider 只决定认证入口，不会绕过后端的 OAuth 身份绑定、账号合并、冲突校验和邀请归因规则。`,
      },
    ],
  },
  {
    slug: "admin-payment-merchants",
    title: "支付商户配置",
    summary: "维护支付宝与微信支付商户凭据、能力开关、测试和激活状态。",
    category: "administration",
    kind: "architecture",
    status: "current",
    audience: ["管理员", "财务运营", "运维人员"],
    aliases: ["Payment Config", "支付宝商户", "微信支付商户"],
    sourcePaths: [
      "frontend-user/src/features/admin/pages/PaymentConfigPage.tsx",
      "frontend-user/src/features/admin/components/PaymentConfigParts.tsx",
      "frontend-user/src/features/admin/components/WechatPayPanel.tsx",
      "frontend-user/src/features/admin/api/payment.ts",
      "backend/internal/payment/alipay_service.go",
      "backend/internal/payment/wechat_pay_service.go",
    ],
    related: [
      "payment-orders",
      "admin-billing-configuration",
      "admin-dashboard",
    ],
    sections: [
      {
        id: "alipay",
        title: "支付宝",
        markdown: `支付配置页先汇总支付宝和微信商户及测试、激活状态；打开支付宝编辑器后，可以选择沙箱或生产网关，并填写通知地址、返回地址、应用私钥和支付宝公钥。下图依次展示渠道总览和支付宝编辑器。

支付宝可以保存多套商户配置，但同一时间只有一套 active。激活沙箱配置时会额外警告，避免把测试环境误当成可收款生产渠道。`,
        embeds: [
          { id: "admin-payment-merchants" },
          {
            id: "admin-alipay-editor",
            caption: "支付宝应用、网关、回调与密钥编辑器",
          },
        ],
      },
      {
        id: "wechat",
        title: "微信支付",
        markdown: `切到微信支付后，先查看商户与能力状态，再在编辑器中填写商户号、AppID、证书序列号、APIv3 密钥、商户私钥，并选择平台公钥或平台证书模式。下图依次展示微信支付概览和证书/支付场景编辑器。

Native、H5、JSAPI 至少开启一种。回调地址与加密材料必须配套，单独打开能力开关不会让渠道真正可用。`,
        embeds: [
          { id: "admin-wechat-pay" },
          {
            id: "admin-wechatpay-editor",
            caption: "微信支付证书、验签方式与支付场景编辑器",
          },
        ],
      },
      {
        id: "activation",
        title: "测试与激活",
        markdown: `保存商户配置后先运行连接测试；测试通过再打开激活确认，核对渠道、环境和商户后切换生效配置。下图展示的是最终激活确认状态。

修改关键凭据会使旧测试结果失效并取消激活，必须重新测试。测试最长约 60 秒，只验证配置与渠道连通，不创建真实交易。用户支付入口只使用 active 且 valid 的配置；这里不负责订单履约、退款或对账。`,
        embeds: [
          {
            id: "admin-payment-activation-confirm",
            caption: "测试通过后切换生效商户的最终确认",
          },
        ],
      },
    ],
  },
];
