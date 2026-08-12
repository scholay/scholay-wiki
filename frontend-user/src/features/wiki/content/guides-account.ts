import type { WikiArticle } from "../types";

export const accountGuideArticles: WikiArticle[] = [
  {
    slug: "product-and-pricing-overview",
    title: "产品与套餐总览",
    summary: "先按任务找到合适的功能，再比较 Free、Pro 和 Max 的额度与价格。",
    category: "getting-started",
    kind: "overview",
    status: "current",
    audience: ["所有访客", "新用户", "购买会员的用户"],
    aliases: ["产品总览", "功能与价格", "Free Pro Max", "套餐怎么选"],
    sourcePaths: [
      "frontend-user/src/app/menus.ts",
      "frontend-user/src/features/search/components/SearcherColumn.tsx",
      "frontend-user/src/features/landing/pages/PricingPage.tsx",
      "frontend-user/src/shared/components/membership-plan-card.tsx",
      "backend/internal/vip/billing_handler.go",
      "backend/internal/vip/billing_model.go",
      "backend/internal/vip/config.go",
      "backend/internal/vip/quota.go",
    ],
    related: ["product-map", "academic-search", "membership", "ai-usage-quota"],
    sections: [
      {
        id: "product-layers",
        title: "先按任务找入口",
        markdown: `Scholay 的功能可以先分成三组来理解。

**搜索文献与期刊**：文献搜索同时提供传统搜索和智能搜索。传统搜索适合按关键词、年份和来源筛选；智能搜索适合直接描述研究问题，让系统帮助拆解检索。期刊搜索是独立入口，用来查看影响因子、分区等期刊信息。

**使用 AI 完成研究任务**：智能助手 Claw 可以阅读附件、整理材料和生成交付物；智能写作 Prism 用来维护论文项目；智能审稿用于在正式投稿或送审前获得一份 AI 模拟评议。

**管理资料与发现工具**：个人文件夹用于收藏和分组论文，科研能力广场用于查找科研工具与社区技能。学术资源中心则是一组教程和产品文章，不是个人资料库。`,
      },
      {
        id: "choose-a-path",
        title: "按任务选择功能",
        markdown: `先判断要的是“结构化检索结果”还是“AI 完成一段工作”。查论文优先用文献搜索，查期刊指标优先用期刊搜索；需要解释论文、处理附件、翻译、写作建议或组合研究任务时进入 Claw；需要直接维护 LaTeX 项目时进入 Prism；需要形成投稿前审稿报告时进入智能审稿。智能搜索不是完整的期刊筛选器，它只保留有限的期刊详情工具。`,
        table: {
          columns: [
            { key: "goal", header: "目标" },
            { key: "entry", header: "入口" },
            { key: "boundary", header: "边界" },
          ],
          rows: [
            {
              goal: "筛论文、找学者",
              entry: "文献搜索 · 经典搜索",
              boundary: "结构化检索与筛选，不是生成式对话",
            },
            {
              goal: "用自然语言找论文",
              entry: "文献搜索 · 智能搜索",
              boundary: "只读、证据驱动，工具范围集中在论文与作者",
            },
            {
              goal: "查期刊与分区指标",
              entry: "期刊搜索",
              boundary: "独立期刊目录，不应由智能搜索替代",
            },
            {
              goal: "问答、读附件、做研究任务",
              entry: "智能助手 Claw",
              boundary: "通用研究助手，结果仍需核验来源",
            },
            {
              goal: "编辑论文项目",
              entry: "智能写作 Prism",
              boundary: "面向 LaTeX 项目和变更确认",
            },
            {
              goal: "投稿前预审",
              entry: "智能审稿",
              boundary: "AI 预审，不替代期刊或学校的正式评审",
            },
          ],
        },
      },
      {
        id: "plan-model",
        title: "比较 Free、Pro 和 Max",
        markdown: `Free 是注册后的默认方案，Pro 和 Max 提供更高的周期 AI 额度。具体额度、周期和价格可能调整，请以页面当时显示的信息为准。下方套餐卡是界面示意，用来说明三档方案怎样排列，不应把示例数字当成长期承诺。

论文检索、期刊检索和文献管理不消耗 AI 额度。智能搜索、Claw、Prism、智能审稿，以及绘图、翻译等 AI 功能共享同一周期额度。价格页中的“约 N 次”只是按常见任务估算，不是固定可调用次数。`,
        embeds: [{ id: "membership-plans" }],
      },
      {
        id: "price-authority",
        title: "以结算页金额为准",
        markdown: `套餐页显示当前可购买的月付、年付和支付方式。选择新购、续费或升级后，系统会结合你现有的会员等级、周期和剩余有效期重新计算金额，因此最终应付价格以结算窗口为准。

月付和年付都需要你主动购买。会员到期后不会自动扣款，也不会自动续订。`,
      },
    ],
  },
  {
    slug: "membership-subscription-guide",
    title: "会员订阅与支付指南",
    summary: "选择会员周期、确认结算金额，并分清支付、活动和邀请奖励。",
    category: "membership",
    kind: "rule",
    status: "current",
    audience: ["购买会员的用户", "客服", "运营人员"],
    aliases: ["购买会员", "订阅支付", "官方定价", "支付渠道"],
    sourcePaths: [
      "frontend-user/src/features/landing/api/plans.ts",
      "frontend-user/src/features/landing/pages/PricingPage.tsx",
      "frontend-user/src/shared/components/subscribe-dialog.tsx",
      "backend/internal/vip/billing_handler.go",
      "backend/internal/vip/order.go",
      "backend/internal/vip/service.go",
      "backend/internal/payment/alipay_service.go",
      "backend/internal/payment/wechat_pay_service.go",
      "backend/internal/payment/provider.go",
      "backend/internal/promo/model.go",
      "docker/mysql/migrations/0039_promo_config.sql",
    ],
    related: [
      "membership",
      "subscription-lifecycle",
      "payment-orders",
      "promotion-banner",
      "invite-campaign",
    ],
    sections: [
      {
        id: "official-price",
        title: "先看套餐，再看最终报价",
        markdown: `套餐页会显示当前可购买的月付、年付和参考划线价。点击购买、续费或升级后，结算窗口会根据你现有的会员等级、周期和剩余有效期重新计算金额。

首次购买、续费和升级的计算方式不同，因此不要只按套餐卡上的标价自行推算。付款前请以结算窗口中的应付金额、购买动作和生效周期为准。`,
        embeds: [{ id: "subscription-checkout" }],
      },
      {
        id: "purchase-cycle",
        title: "购买周期与生效方式",
        markdown: `月付和年付都需要一次付清。Free 用户或会员已过期时，可以选择页面当前开放的周期；月付仍在有效期内时，可以继续按月续费、转为年付或升级档位。年付在期用户不能用月付续费；同档只能续年付，不能通过月付把周期降回月度。

页面只会展示当前账户可以执行的选项。系统不提供自动续订，会员到期后不会自动扣款。购买会员会获得对应等级和周期 AI 额度，不会额外固定赠送科研经费。下图展示移动端的购买入口，价格和支付方式仍以你实际看到的页面为准。`,
        embeds: [{ id: "mobile-membership-purchase" }],
      },
      {
        id: "payment-methods",
        title: "支付渠道",
        markdown: `结算页只显示当前已经配置并可用的支付方式，通常可能是支付宝、微信支付或其中一种。只出现一个渠道是正常情况，请以页面实际按钮为准。

云闪付和银联目前没有面向用户的下单入口，不能写成已经上线。测试支付也只会出现在允许它的开发环境中，不属于正式支付方式。`,
      },
      {
        id: "offers-and-invites",
        title: "分清限时活动与邀请奖励",
        markdown: `套餐价和结算窗口决定订单实付金额。页面出现“限时领取会员”时，弹窗会展示活动说明和客服二维码，但它不会自动修改结算价格，也不等同于优惠券。

邀请活动则是在完成有效邀请或受邀用户首次合格付费后发放科研经费，奖励会进入邀请记录和钱包流水，不会在下单前直接抵扣。活动会随运营配置启停；页面没有显示时，不要按旧截图或海报中的数字理解当前优惠。`,
        embeds: [{ id: "promo-modal" }],
      },
    ],
  },
  {
    slug: "invitation-rebate-guide",
    title: "邀请与返利指南",
    summary: "分享邀请链接或邀请码，了解好友绑定条件和首单返利怎样发放。",
    category: "membership",
    kind: "rule",
    status: "current",
    audience: ["邀请人", "受邀新用户", "客服", "运营人员"],
    aliases: ["邀请好友", "邀请码", "邀请二维码", "首单返利"],
    sourcePaths: [
      "frontend-user/src/shared/api/invite-campaign.ts",
      "frontend-user/src/shared/components/invite/InviteShareMethods.tsx",
      "frontend-user/src/shared/components/invite/InviteRewardPoster.tsx",
      "frontend-user/src/features/settings/pages/InvitePage.tsx",
      "frontend-user/src/features/landing/pages/InviteLandingPage.tsx",
      "frontend-user/src/features/auth/components/InviteAuthNotice.tsx",
      "frontend-user/src/features/auth/components/PostRegisterInviteDialog.tsx",
      "frontend-user/src/app/InviteFlowController.tsx",
      "backend/internal/invite/model.go",
      "backend/internal/invite/service.go",
      "backend/internal/invite/campaign_bind.go",
      "docker/mysql/migrations/0117_invite_campaign.sql",
    ],
    related: ["invite-campaign", "wallet-payg", "membership"],
    sections: [
      {
        id: "one-campaign",
        title: "先确认活动是否开放",
        markdown: `Scholay 当前只有一套邀请活动，没有“全民邀请”和“达人计划”两种等级。活动开放时，邀请页面会显示你的专属邀请码、分享方式和当前奖励；页面没有这些内容时，表示活动暂未开放。`,
      },
      {
        id: "share-methods",
        title: "链接、邀请码与二维码",
        markdown: `活动开放后，你可以复制邀请链接、单独复制邀请码，或分享和下载二维码。三种方式都对应同一个邀请关系，选择好友最方便使用的一种即可。

好友打开邀请链接或扫描二维码后，未登录时会先进入注册；已经登录时会进入绑定确认。下图中的奖励数字和统计只是示例，实际规则请以邀请页当时显示的内容为准。`,
        embeds: [{ id: "invite-share" }],
      },
      {
        id: "binding-rules",
        title: "好友怎样完成绑定",
        markdown: `受邀用户只能绑定一次，不能填写自己的邀请码。注册页面中的邀请码是选填项，可以先跳过；手动输入后，页面会先检查是否有效，真正的邀请关系要等新账户注册完成后才建立。

没有填写邀请码的新用户，之后可能看到一次可以跳过的补录提醒。已有一段时间的旧账户不会被系统自动归到某位邀请人名下，必须由本人在邀请页面确认。无论从链接进入还是手动输入，都会使用同一套资格规则。

每天的奖励上限只影响是否发放当日注册奖励，不会把已经建立的邀请关系改给另一个人。`,
        embeds: [{ id: "invite-code-field" }, { id: "invite-code-prompt" }],
      },
      {
        id: "current-rebate",
        title: "返利什么时候到账",
        markdown: `受邀好友在活动规定时间内完成首笔符合条件的实付后，邀请人会按邀请页显示的比例获得等值科研经费。活动关闭时不再显示可用奖励，因此 Wiki 不固定写某个百分比，也不要把旧海报里的数字当作当前规则。

测试支付和已经全额退款的订单不计返利；发生部分退款时，已经发放的返利也会按比例扣回。邀请记录里只会显示经过隐藏处理的好友联系方式。`,
      },
    ],
  },
  {
    slug: "login-methods-guide",
    title: "登录方式指南",
    summary: "说明手机号、邮箱、微信、恩特学术社区与其他动态第三方登录入口。",
    category: "getting-started",
    kind: "rule",
    status: "current",
    audience: ["所有访客", "账户用户", "客服"],
    aliases: ["怎么登录", "邮箱登录", "微信登录", "恩特社区登录", "OAuth"],
    sourcePaths: [
      "frontend-user/src/features/auth/components/LoginForm.tsx",
      "frontend-user/src/features/auth/components/OAuthRow.tsx",
      "frontend-user/src/features/auth/pages/mobile/MobileAuthPage.tsx",
      "frontend-user/src/features/auth/api/auth.ts",
      "frontend-user/src/shared/api/public-config.ts",
      "backend/internal/user/handler.go",
      "backend/internal/user/service_auth.go",
      "backend/internal/user/discourse_sso.go",
      "backend/internal/wechat/handler.go",
      "miniprogram/services/auth.ts",
    ],
    related: [
      "account",
      "email-phone-authentication",
      "oauth-wechat-login",
      "oauth-account-merge",
      "account-connections",
    ],
    sections: [
      {
        id: "email-and-phone",
        title: "手机号与邮箱",
        markdown: `在登录窗口中，你可以切换手机号或邮箱，并选择密码或 6 位验证码。下图展示的是常见登录状态；实际可见入口会随当前部署配置变化。

如果你用验证码登录一个尚未注册的邮箱，验证通过后系统会自动创建账户并直接登录。这个新账户暂时没有密码，可以稍后到“账户安全”中设置。使用“忘记密码”时则不会自动创建新账户。`,
        embeds: [{ id: "auth-dialog" }],
      },
      {
        id: "wechat",
        title: "微信登录按终端区分",
        markdown: `桌面端启用微信登录后，点击微信图标会出现二维码。下图只展示等待扫码登录的状态；请用手机微信扫码，并在手机上完成确认。二维码失效时，按页面提示刷新。

手机网页不会显示这个扫码入口，因为同一部手机无法扫描自己的屏幕。此时请使用手机号、邮箱或页面上其他可见方式。微信小程序有独立登录流程，也不需要扫描桌面二维码。`,
        embeds: [{ id: "wechat-qr-login" }],
      },
      {
        id: "enterscholar",
        title: "恩特学术社区登录",
        markdown: `如果登录窗口显示“恩特学术社区”，可以点击后前往社区确认身份，再返回 Scholay。这个入口由管理员配置，不是每个部署都会开放；页面没有显示时，请直接选择其他登录方式。`,
      },
      {
        id: "dynamic-oauth",
        title: "其他第三方入口也是动态的",
        markdown: `GitHub、Google、Apple、Microsoft、ORCID、微信和恩特学术社区都会按当前配置动态显示。看不到某个按钮，通常只是该方式没有启用，并不表示登录页损坏。下方两张图分别展示普通 OAuth 和微信扫码返回后的处理状态；Google 使用自己的身份服务，不经过这两张整页回调。

第三方平台返回的邮箱如果已经对应一个 Scholay 账户，页面可能要求你确认是否合并。请按页面提示验证原账户，不要为了跳过确认再注册一个重复账户。需要注意的是，Google 目前可用于登录，但账户设置里的“新绑定 Google”仍未接通。`,
        embeds: [
          { id: "oauth-callback-states" },
          { id: "wechat-callback-state" },
        ],
      },
    ],
  },
  {
    slug: "academic-intelligence-interface-guide",
    title: "学术情报界面导览",
    summary:
      "从学术情报列表按时间、热度与版块发现内容，再进入详情核对正文、来源、可信度说明和相关情报。",
    category: "knowledge",
    kind: "page",
    status: "current",
    audience: ["所有访客", "研究者", "学生"],
    aliases: ["学术资讯界面", "情报列表", "顶刊速递", "科研政策"],
    sourcePaths: [
      "frontend-user/src/features/news/pages/NewsListPage.tsx",
      "frontend-user/src/features/news/pages/NewsDetailPage.tsx",
      "frontend-user/src/shared/api/news.ts",
      "frontend-user/src/shared/components/news/NewsListItem.tsx",
      "backend/internal/news/handler.go",
      "backend/internal/news/service.go",
    ],
    related: ["research-news", "mobile-feed", "resource-and-blog-center"],
    sections: [
      {
        id: "list-and-sort",
        title: "列表、最新与最热",
        markdown: `进入学术情报后，正文区域先显示文章列表。“最新”按发布时间浏览近期内容，“最热”按热度信号排序；切换后列表会重新读取相应结果。每次加载一页，点击底部“加载更多”即可继续追加。加载中、请求失败和暂无情报都有独立提示，不会把旧列表伪装成新的筛选结果。`,
        embeds: [{ id: "academic-intel-list" }],
      },
      {
        id: "sections-and-cards",
        title: "版块与情报卡片",
        markdown: `版块筛选包括全部、重大事件、国内政策、顶刊速递和其他。卡片会显示题名、摘要、版块、内容类型、发布时间、来源与热度；点击卡片即可阅读详情。版块和热度用于帮助浏览，不代表学术质量评级；“头条”也是运营展示信号，不能替代对来源和原文的判断。`,
      },
      {
        id: "detail-and-sources",
        title: "详情正文与信息来源",
        markdown: `详情页先显示版块、报告类型、题名、摘要、发布与更新时间，再渲染后端返回的 Markdown 正文。存在来源时，页面在“信息来源”区列出可打开的外部链接；可信度说明是额外的核对提示，不能代替来源本身。原始事件日期、Scholay 发布时间和更新时间是三个不同字段，阅读时不要把后两者误当成事件发生时间。`,
        embeds: [{ id: "academic-intel-detail" }],
      },
      {
        id: "related-and-boundary",
        title: "相关情报与核对边界",
        markdown: `详情底部可以继续阅读同类相关情报。公开端只返回已发布内容；后台采集、摘要或整理不意味着 Scholay 成为原始消息来源。涉及科研政策、期刊声明、资助规则、撤稿或重大事件时，应从“信息来源”打开原发布机构页面，核对发布日期、适用范围和后续修订，再决定是否引用或采取行动。`,
      },
    ],
  },
  {
    slug: "resources-interface-guide",
    title: "资源界面指南",
    summary:
      "区分个人文件夹、科研能力广场与公开学术资源中心，并说明各自的数据和能力边界。",
    category: "knowledge",
    kind: "overview",
    status: "current",
    audience: ["研究者", "学生", "内容使用者"],
    aliases: ["资源入口", "文件夹", "科研能力广场", "学术资源中心"],
    sourcePaths: [
      "frontend-user/src/app/menus.ts",
      "frontend-user/src/features/library/routes.tsx",
      "frontend-user/src/features/library/pages/LibraryPage.tsx",
      "frontend-user/src/features/library/components/library-import-dialog/types.ts",
      "frontend-user/src/features/library/pages/SharedReceivePage.tsx",
      "frontend-user/src/features/tools/routes.tsx",
      "frontend-user/src/features/tools/pages/ToolsCatalogPage.tsx",
      "frontend-user/src/features/tools/pages/ToolsSkillsPage.tsx",
      "frontend-user/src/features/help/routes.tsx",
      "frontend-user/src/features/help/pages/ResourceCenterPage.tsx",
    ],
    related: [
      "literature-library",
      "library-sharing",
      "feature-tools",
      "community-skills",
      "resource-and-blog-center",
    ],
    sections: [
      {
        id: "three-resource-surfaces",
        title: "先区分三类资源",
        markdown: `**文件夹**是登录用户的个人论文收藏与整理空间；**科研能力广场**是站内功能、全网科研工具和社区技能的发现入口；**学术资源中心**是公开长文内容页。顶栏“资源”分类只放文件夹和科研能力广场，\`/resources\` 与 \`/blog\` 通过内容入口访问。三者名称相近，但一个保存个人资料，一个发现工具与技能，一个阅读发布内容。`,
        embeds: [
          { id: "literature-library" },
          { id: "feature-plaza" },
          { id: "resource-center" },
        ],
      },
      {
        id: "folders",
        title: "文件夹：整理自己的论文",
        markdown: `未登录访问 \`/library\` 会看到登录引导；登录后可创建单层文件夹、收藏论文、在当前文件夹内搜索和排序，并在桌面或移动端同步。添加工作台目前真正可用的是在线搜索加入与本地 PDF 上传；Zotero 和 EndNote 导入仍是 ComingSoon 占位，不能写成已支持。

文件夹和单篇论文都可以生成分享链接。接收者可以公开预览；开启提取码时，需要先验证提取码。登录用户还可以把允许接收的内容转存到自己的默认文件夹。`,
      },
      {
        id: "playground",
        title: "科研能力广场：发现工具与技能",
        markdown: `\`/tools\` 的全网工具分区支持分类、价格、访问形式、开源状态、关键词、排序和分页，详情可以指向外部网站或下载资源。\`/tools/skills\` 使用同一广场外壳展示社区技能，用户可以查看、上传和安装符合公开状态与审核条件的技能。外部工具由各自提供者负责，条目收录不等于 Scholay 对安全性、效果或持续可用性作保证。`,
      },
      {
        id: "content-center",
        title: "学术资源中心：阅读公开内容",
        markdown: `“学术资源”和“产品博客”位于同一个内容中心，可以通过页签切换；打开文章后仍会进入各自的详情页。这里适合阅读教程、研究资源和产品文章，内容不会自动进入个人文件夹，也不是社区技能安装包。博客中的愿景或活动描述不能替代会员、权限和功能页面里的现行规则。`,
      },
    ],
  },
  {
    slug: "roadmap-status",
    title: "开发计划与状态说明",
    summary:
      "仓库没有可作为承诺的下一期产品路线图；仅记录明确占位、规划表面与核验规则。",
    category: "getting-started",
    kind: "overview",
    status: "planned",
    audience: ["所有用户", "产品人员", "内容运营", "支持人员"],
    aliases: ["路线图", "Roadmap", "下一期开发计划", "功能何时上线"],
    sourcePaths: [
      "frontend-user/src/app/router.tsx",
      "frontend-user/src/features/wiki/content/foundations.ts",
      "frontend-user/src/features/wiki/content/infrastructure.ts",
      "frontend-user/src/features/claw/components/chat/TemplateCards.tsx",
      "frontend-user/src/features/settings/pages/MembershipPage.tsx",
      "frontend-user/src/features/library/components/library-import-dialog/types.ts",
      "frontend-user/src/features/browser/components/paper-detail/PaperFooter.tsx",
      "docs/interaction-spec",
    ],
    related: [
      "product-map",
      "design-source-of-truth",
      "task-center-and-checkin",
      "mobile-web",
    ],
    sections: [
      {
        id: "no-committed-roadmap",
        title: "当前没有权威的下一期任务表",
        markdown: `当前仓库没有一份带负责人、目标版本、发布日期和验收条件的公开产品级路线图，因此不能从零散注释、研究报告、设计稿或“敬请期待”文案推导下一期一定开发什么。本文状态标为 planned，是因为它说明规划信息的边界，不代表下列占位已经获得排期或发布日期。`,
      },
      {
        id: "explicit-planned-surfaces",
        title: "能确认的规划与占位",
        markdown: `现有 Wiki 产品表面图明确把原生移动 App 和 Desktop App 标为“规划中、尚未交付”，但没有给出日期或功能范围。当前界面还出现“更多创作模板陆续加入”、任务中心与签到“即将上线”、Zotero/EndNote 导入 ComingSoon、研究论坛即将上线等提示。它们只能证明入口或文案被预留，不能证明已经进入某个迭代，也不能承诺奖励、数据模型或最终交互。`,
        table: {
          columns: [
            { key: "item", header: "项目" },
            { key: "evidence", header: "当前证据" },
            { key: "safeStatus", header: "可安全表述" },
          ],
          rows: [
            {
              item: "移动 App / Desktop App",
              evidence: "产品表面图标为规划中",
              safeStatus: "尚未交付；无公开日期与范围",
            },
            {
              item: "Claw 更多创作模板",
              evidence: "空态提示陆续加入",
              safeStatus: "方向性占位；无已确认模板清单",
            },
            {
              item: "任务中心与签到",
              evidence: "会员页预告，但运行时业务已下线",
              safeStatus: "界面预告，不是已确认路线图",
            },
            {
              item: "Zotero / EndNote 导入",
              evidence: "导入 Tab 标记 ComingSoon",
              safeStatus: "尚不可用；无公开上线时间",
            },
            {
              item: "研究论坛",
              evidence: "论文详情中的禁用占位",
              safeStatus: "尚不可用；最终功能范围未定义",
            },
          ],
        },
      },
      {
        id: "stale-documents",
        title: "旧交互稿不是未来计划",
        markdown: `\`docs/interaction-spec\` 是 2026-05-30 的历史快照，仍把 Prism、Claw、工具广场或智能审稿描述为 ComingSoon，而当前路由和服务已经实现这些功能。它说明过去的页面状态，既不能否定当前实现，也不能被反向解释成新的开发计划。研究目录里的建议和设计资产同样只作为背景证据。`,
      },
      {
        id: "verification-rule",
        title: "发布前如何更新状态",
        markdown: `只有同时出现当前路由或客户端入口、可执行后端服务与权限/配置，以及必要测试或可验收行为时，Wiki 才应把功能改为 current。只有 UI 文案或预留枚举时保持 planned 或 historical，并明确“无日期、无承诺”。后续若形成正式路线图，应至少补充负责人、目标版本、范围、依赖、验收条件和变更记录，再由产品负责人确认对外口径。`,
      },
    ],
  },
];
