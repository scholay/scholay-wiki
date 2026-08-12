import type { WikiArticle } from "../types";

export const accountGuideArticles: WikiArticle[] = [
  {
    slug: "product-and-pricing-overview",
    title: "产品与套餐总览",
    summary:
      "按检索、智能与资源三层理解 Scholay，并用运行时套餐和报价解释 Free、Pro、Max。",
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
        title: "先按三层找入口",
        markdown: `**检索层**包含文献搜索与期刊搜索。文献搜索在同一页面提供经典搜索和智能搜索：经典搜索适合用关键词、年份、来源等条件筛选，智能搜索适合把研究问题交给受限的文献检索 Agent。期刊搜索是独立入口，用于查影响因子、分区和其他期刊指标。

**智能层**包含智能助手、智能写作和智能审稿。智能助手 Claw 面向通用科研对话；智能写作就是 Scholay Prism，是 LaTeX 论文项目工作区；智能审稿提供期刊稿和毕业论文两条投稿前预审流程。

**资源层**包含文件夹与科研能力广场。文件夹保存和分组论文，科研能力广场收录全网工具与社区技能。学术资源中心 \`/resources\` 是内容页，不是顶栏核心功能菜单的一项。`,
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
        title: "Free、Pro、Max 的真实口径",
        markdown: `Free 是默认档位；Pro 的周期 AI 额度按 Free 的动态倍数计算，Max 再按 Pro 的动态倍数计算。倍数、周期天数、可购周期、推荐档和价格都来自后端公开套餐配置，不能把仓库 seed/fallback 当作线上永久承诺。

论文检索、期刊检索和文献管理不消耗 AI 额度；智能搜索、Claw、Prism、智能审稿以及绘图、翻译等 AI 工作共享按真实模型成本记账的周期额度。价格页中的“约 N 次”是常见任务的保守估算，不是固定调用次数或服务上限。`,
        embeds: [{ id: "membership-plans" }],
      },
      {
        id: "price-authority",
        title: "价格与结算以哪里为准",
        markdown: `套餐页应读取 \`/billing/plans\` 显示当期月价、年价、划线价、倍率和已开放支付方式；用户选择新购、续费或升级后，最终应付金额还要以后端 quote 为准。仓库里的默认价格只用于缺省配置和初始化，不能代替当前生产价格。月付和年付都是单次主动购买，到期后不会自动扣费或自动续订。`,
      },
    ],
  },
  {
    slug: "membership-subscription-guide",
    title: "会员订阅与支付指南",
    summary: "说明官方价格、实际报价、支付渠道、活动入口与邀请奖励之间的区别。",
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
        title: "官方价格与最终应付",
        markdown: `“官方价格”指当前后端公开套餐接口返回的可售价格，不是 Wiki、海报或代码默认值。套餐页可以展示月付、年付及划线价；真正下单前还会根据账户当前等级、周期和剩余有效期生成 quote。首次购买、续费、同周期升档以及月付升档转年付的计价动作不同，因此结算弹窗里的应付金额是最终购买依据。`,
      },
      {
        id: "purchase-cycle",
        title: "购买周期与生效方式",
        markdown: `月付和年付都采用一次付清。Free 或已过期用户可选择后台开放的月付/年付；月付在期用户可按月续费、转年付或选择合法升档；年付在期用户不能用月付续费把周期降回月度，同档只能续年付，升档也按年费基准补差并保持原到期日。移动购买弹层应依据 current_cycle 只呈现合法选项，而不是让后端在点击后才拒绝。系统不提供自动续订，会员到期不会自动扣款。订阅发放的是会员等级和周期 AI 额度，不会因为购买会员而额外固定赠送经费。金额、动作和最终周期始终以后端动态 quote 为准。`,
        embeds: [{ id: "mobile-membership-purchase" }],
      },
      {
        id: "payment-methods",
        title: "支付渠道",
        markdown: `支付宝与微信支付都有完整后端流程，但前端只展示当前配置为可用的渠道：支付宝需要有效的启用配置，微信还要求商户配置通过校验。某个部署只出现其中一种属于正常的运行时差异。

云闪付/银联目前只有 \`union_pay\` provider 枚举和“预留”注释，没有用户下单路由、服务实现或前端支付选项，不能写成已经上线。测试支付只用于允许它的开发环境，也不是面向用户的正式渠道。`,
      },
      {
        id: "offers-and-invites",
        title: "官方定价、限时活动与邀请奖励不是一回事",
        markdown: `套餐价和结算 quote 决定订单实付。启用“限时领取会员”时，Promo 弹窗展示运营文案和微信客服二维码；当前实现没有让它自动改写订单价格，也不等同于优惠券。邀请活动则在用户注册绑定或受邀用户首笔合格付费后发放经费奖励，奖励进入邀请与钱包流水，不是下单前直接减价。

两类活动都由管理员动态启停，数据库初始配置默认关闭。页面当时没有活动入口时，不应沿用旧截图、海报或历史宣传文案承诺优惠。`,
      },
    ],
  },
  {
    slug: "invitation-rebate-guide",
    title: "邀请与返利指南",
    summary:
      "解释单一邀请活动、三种分享方式、绑定规则和以当期配置为准的首单返利。",
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
        title: "当前只有一套邀请活动",
        markdown: `现行运行时以单行 \`invite_campaign_config\` 作为邀请活动真源，并为用户生成专属邀请码。代码中没有“全民邀请”和“达人计划”两套等级、身份申请、达人审核或不同返佣表；因此不能把这两个名称写成已上线的分级体系。若以后新增分层，需要新的资格、配置、展示和结算依据。`,
      },
      {
        id: "share-methods",
        title: "链接、邀请码与二维码",
        markdown: `活动开启后，邀请页从后端取得专属 \`code\` 和 \`url\`，提供三种分享方式：复制邀请链接、复制邀请码、分享或下载二维码。二维码编码的是同一邀请 URL；支持系统分享时可直接调起分享，不支持或分享失败时下载 PNG。好友打开 \`/i/:code\` 后，页面会记录访问、校验候选码，并把未登录用户引导到注册，把已登录用户引导到绑定页。`,
        embeds: [{ id: "invite-share" }],
      },
      {
        id: "binding-rules",
        title: "绑定与归因",
        markdown: `受邀用户只能绑定一次，不能绑定自己的码；邀请人账户必须早于受邀账户，且绑定要发生在当期配置规定的注册后窗口内。注册时可以跳过邀请码；手填码会先做有效性校验，校验通过只是保存候选，新账户注册完成后才尝试关联。没有候选码的新账户可能看到一次可跳过的补录提醒；旧账号不会静默归因，必须在邀请页本人确认。链接进入和手动输入邀请码最终使用同一资格规则。

每日计奖上限只影响是否发注册奖励，不会把已经合法建立的邀请关系改成另一个邀请人。绑定成功时会快照注册奖励、窗口、首单返利比例和兑换率，后续改活动配置不追溯重算既有关系。`,
        embeds: [{ id: "invite-code-field" }, { id: "invite-code-prompt" }],
      },
      {
        id: "current-rebate",
        title: "现行返利看当期公开配置",
        markdown: `首单返利由 \`first_purchase_rebate_bps\` 表示：受邀用户在配置窗口内完成首笔合格实付后，邀请人按订单金额对应比例获得等值经费。页面应使用公开活动接口格式化当期比例、双方注册奖励和时间窗口；活动关闭时这些公开奖励值会归零。仓库迁移的默认状态也是关闭且返利为 0，所以 Wiki 不固化某个百分比，也不能把静态邀请海报上的历史数字当作现行规则。

测试支付和已全额退款订单不计首单返利；发生部分退款时，系统按累计退款比例反冲已经发放的返利。邀请记录中的受邀人联系方式由后端脱敏。`,
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
        markdown: `登录表单可以在手机号和邮箱之间切换，两者都支持密码或 6 位验证码。邮箱验证码登录有一个明确的便捷规则：验证码验证通过但该邮箱尚未注册时，后端会自动创建已验证、启用且暂时无密码的账户并直接登录；之后可以在账户设置中设置密码。忘记密码流程不会为未注册邮箱自动建号。`,
        embeds: [{ id: "auth-dialog" }],
      },
      {
        id: "wechat",
        title: "微信登录按终端区分",
        markdown: `桌面 Web 在管理员启用微信后提供微信扫码登录。手机 Web 登录页会隐藏这个二维码入口，因为同一部手机无法完成“自己扫自己”，且公众号网页授权尚未接入；此时应选择手机号、邮箱或其他已显示的第三方入口。微信小程序使用自己的 \`wx.login\` → \`/user/wechat/miniprogram/login\` 链路，不等同于桌面扫码。`,
        embeds: [{ id: "wechat-qr-login" }],
      },
      {
        id: "enterscholar",
        title: "恩特学术社区登录",
        markdown: `登录按钮里的“恩特学术社区”对应后端 Discourse Connect 集成。只有系统公开配置给出社区地址，且后端启用 Discourse 并配置有效 SSO secret 时，按钮和登录 URL 才可用；它是真实集成，但不是所有部署都必然开启。`,
      },
      {
        id: "dynamic-oauth",
        title: "其他第三方入口也是动态的",
        markdown: `GitHub、Google、Apple、Microsoft、ORCID、微信和恩特学术社区的登录按钮都按公开系统配置动态显示。看不到某个按钮通常表示当前部署未启用或配置不完整，不代表账户页面损坏。这里说的是登录入口：Google 登录走 GIS ID Token，当前账户设置中的“新绑定 Google”仍未接通，不能因后台启用了 Google 登录就把它写成可用绑定方式。第三方回调遇到同邮箱既有账户时可能进入账户合并确认流程；不要为绕过确认重复创建账户。登录即表示同意服务条款与隐私政策，独立注册流程则要求显式勾选同意。`,
        embeds: [{ id: "oauth-callback-states" }],
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
        markdown: `进入 \`/news\` 后，正文区域先显示学术情报列表。“最新”按发布时间浏览近期内容，“最热”按服务端热度信号排序；切换后列表重新读取相应结果。每次加载一页，底部“加载更多”继续追加，已经出现的 slug 会去重。加载中、请求失败和暂无情报都有独立状态，不会用旧列表伪装新筛选结果。`,
        embeds: [{ id: "academic-intel-list" }],
      },
      {
        id: "sections-and-cards",
        title: "版块与情报卡片",
        markdown: `版块筛选包括全部、重大事件、国内政策、顶刊速递和其他。卡片保留题名、摘要、版块、报告类型、发布时间、来源与热度等摘要信息，点击后进入稳定的 \`/news/:slug\` 详情地址。版块和热度用于帮助浏览，不代表学术质量评级；“头条”也是运营展示信号，不应替代对来源和原文的判断。`,
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

文件夹和单篇论文可以生成分享入口。文件夹分享接收页 \`/s/:token\` 允许公开预览，并在需要时校验提取码；登录用户可把可接收内容转存到自己的默认文件夹。`,
      },
      {
        id: "playground",
        title: "科研能力广场：发现工具与技能",
        markdown: `\`/tools\` 的全网工具分区支持分类、价格、访问形式、开源状态、关键词、排序和分页，详情可以指向外部网站或下载资源。\`/tools/skills\` 使用同一广场外壳展示社区技能，用户可以查看、上传和安装符合公开状态与审核条件的技能。外部工具由各自提供者负责，条目收录不等于 Scholay 对安全性、效果或持续可用性作保证。`,
      },
      {
        id: "content-center",
        title: "学术资源中心：阅读公开内容",
        markdown: `\`/resources\` 和 \`/blog\` 进入同一个内容中心的不同 Tab，并分别保留资源详情与博客详情 URL。这里的文章由内容 API 发布，适合阅读教程、研究资源和产品文章，不会自动进入个人文件夹，也不是社区技能安装包。博客中的愿景或活动描述不能覆盖套餐、权限和功能的运行时代码。`,
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
