import type { WikiArticle } from "../types";

/**
 * 用户端细粒度体验词条。
 *
 * foundations / discovery / research-ai 等文件解释产品概念与总览；本文件聚焦
 * “用户在具体页面怎么操作、会遇到什么状态、现行限制是多少”。
 */
export const userExperienceArticles: WikiArticle[] = [
  {
    slug: "email-phone-authentication",
    title: "邮箱与手机号注册、登录和找回密码",
    summary:
      "使用邮箱或中国大陆手机号完成密码登录、验证码登录、注册和密码重置。",
    category: "getting-started",
    kind: "feature",
    status: "current",
    audience: ["访客", "新用户", "无法登录的用户"],
    aliases: ["注册登录", "验证码登录", "忘记密码", "手机登录"],
    sourcePaths: [
      "frontend-user/src/features/auth/components/LoginForm.tsx",
      "frontend-user/src/features/auth/components/RegisterForm.tsx",
      "frontend-user/src/features/auth/components/ForgotPasswordForm.tsx",
      "frontend-user/src/features/auth/pages/mobile/MobileAuthPage.tsx",
      "frontend-user/src/features/auth/components/MobileAuthSheet.tsx",
      "frontend-user/src/features/auth/components/InviteAuthNotice.tsx",
      "frontend-user/src/features/auth/components/PostRegisterInviteDialog.tsx",
      "frontend-user/src/features/auth/api/auth.ts",
      "frontend-user/src/app/InviteFlowController.tsx",
      "frontend-user/src/features/wiki/embeds/WikiEmbedAuthDialog.tsx",
    ],
    related: ["account", "oauth-wechat-login", "account-security-settings"],
    sections: [
      {
        id: "entry-and-methods",
        title: "入口与登录方式",
        markdown: `在桌面端点击登录，或执行收藏、发送 AI 消息等需要账户的动作时，会打开认证弹窗。手机端可以进入完整登录页；在未登录的「我的」页点击登录时，也会在当前页面底部打开登录 Sheet。下方四张图依次展示桌面弹窗、移动端独立登录页、从「我的」页打开的登录 Sheet，以及打开受保护子页面时的登录提示。

你可以选择邮箱或中国大陆手机号，再用密码或验证码登录。页面能够浏览不代表其中的账户操作已经授权，登录成功后才能继续收藏、发送消息或查看私有数据。`,
        embeds: [
          { id: "auth-dialog" },
          { id: "mobile-auth-page" },
          { id: "mobile-auth-surfaces" },
          { id: "mobile-subpage-auth-guard" },
        ],
      },
      {
        id: "registration",
        title: "注册规则",
        markdown: `切换到注册后，填写邮箱或手机号、验证码和密码，并勾选服务条款与隐私政策。邀请活动开启时还会出现选填的邀请码：你可以跳过，也可以先点“确认”校验；通过后页面会显示“已验证”，等注册成功再尝试关联。下方第一张图展示邀请码的填写与验证，第二张图展示注册表单。

密码为 8–64 位；启用注册验证码时需要输入 6 位数字。验证码按钮倒计时 60 秒，结束只表示可以再次请求，不代表旧验证码仍有效。是否需要邮箱验证和人机校验，以页面当前提示为准。修改或取消已验证的邀请码会先清除旧候选。`,
        embeds: [{ id: "invite-code-field" }, { id: "auth-register-recovery" }],
      },
      {
        id: "recovery",
        title: "找回密码",
        markdown: `在登录表单点击“忘记密码”，选择邮箱或手机号，输入收到的 6 位验证码和 8–64 位新密码后提交。下图展示选择邮箱后的初始表单。页面会分别显示验证码发送中、重新发送倒计时、密码提交中和失败原因；是否匹配到账户、验证码是否过期以及剩余尝试次数，以提交后的提示为准。`,
        embeds: [{ id: "auth-password-recovery-email" }],
      },
    ],
  },
  {
    slug: "oauth-wechat-login",
    title: "OAuth 与微信扫码登录",
    summary:
      "通过管理员启用的第三方身份提供方登录，并理解微信二维码与普通 OAuth 回调的差异。",
    category: "getting-started",
    kind: "feature",
    status: "current",
    audience: ["访客", "第三方账号用户"],
    aliases: ["第三方登录", "微信扫码登录", "GitHub 登录", "ORCID 登录"],
    sourcePaths: [
      "frontend-user/src/features/auth/components/OAuthRow.tsx",
      "frontend-user/src/features/auth/components/GoogleSignInButton.tsx",
      "frontend-user/src/features/auth/components/WeChatQRPanel.tsx",
      "frontend-user/src/features/auth/pages/OAuthCallbackPage.tsx",
      "frontend-user/src/features/auth/pages/WeChatCallbackPage.tsx",
      "frontend-user/src/features/auth/routes.tsx",
    ],
    related: [
      "email-phone-authentication",
      "oauth-account-merge",
      "account-connections",
    ],
    sections: [
      {
        id: "providers",
        title: "可用提供方",
        markdown: `当前支持 GitHub、Google、Apple、ORCID、Microsoft、Discourse 和微信。只有已经开放的方式才会出现在登录页；其中微信会在登录弹窗内显示二维码，其他方式会跳转到对应平台完成授权。

某种方式可以用于登录，不代表它也一定能从账户设置中新增绑定；请以“设置 → 连接”页面实际显示的按钮为准。`,
      },
      {
        id: "wechat-flow",
        title: "微信二维码流程",
        markdown: `在桌面登录弹窗选择微信后，会出现约 220×240 的二维码；用微信扫码并确认授权，页面会覆盖一层“处理中”状态，成功后回到原来的登录流程。下图只展示二维码等待扫码登录的状态，不包含已扫码或账户绑定状态。

每次扫码得到的授权信息只能使用一次。移动网页的认证页不会显示微信二维码入口。`,
        embeds: [{ id: "wechat-qr-login" }],
      },
      {
        id: "callback-state",
        title: "授权返回后的处理",
        markdown: `使用 GitHub、Apple、ORCID、Microsoft 或 Discourse 完成授权后，页面会先显示“正在完成登录”；下方第一张图展示这个等待状态。微信扫码后的独立中转页也有自己的处理过程，第二张图展示它收到授权信息后正在继续处理的状态。处理结束后，页面会继续登录、提示失败，或要求你确认是否合并已有账户。失败时不会留下半登录账户，请按提示回到登录入口重试。

Google 使用自己的身份服务，不经过这两组整页回调状态。`,
        embeds: [
          { id: "oauth-callback-states" },
          { id: "wechat-callback-state" },
        ],
      },
    ],
  },
  {
    slug: "oauth-account-merge",
    title: "OAuth 邮箱冲突与账号合并",
    summary:
      "第三方邮箱命中已有 Scholay 账户时，由用户验证目标账户后决定合并或新建独立账户。",
    category: "getting-started",
    kind: "rule",
    status: "current",
    audience: ["遇到第三方登录冲突的用户", "支持人员"],
    aliases: ["账号合并", "邮箱冲突", "第三方登录冲突"],
    sourcePaths: [
      "frontend-user/src/features/auth/components/OAuthMergeConfirmDialog.tsx",
      "frontend-user/src/features/auth/pages/OAuthCallbackPage.tsx",
      "frontend-user/src/features/auth/api/oauth-merge.ts",
    ],
    related: ["oauth-wechat-login", "account-connections", "account"],
    sections: [
      {
        id: "why",
        title: "为什么不会自动合并",
        markdown: `第三方登录使用的邮箱与现有账户相同时，系统会先发放一份仅用于本次确认的一次性凭据，而不会只凭同一个邮箱就自动绑定。这样可以避免他人仅控制第三方身份便接管已有账户。确认页面会列出第三方平台、第三方邮箱和已有账户邮箱，供你核对。`,
      },
      {
        id: "choices",
        title: "两种选择",
        markdown: `遇到邮箱冲突时，页面会列出第三方身份和已有 Scholay 账户，并让你选择“合并账户”或“创建独立账户”；下图展示的是等待选择的确认弹窗。

选择合并时，你需要先登录已有 Scholay 账户证明本人身份。选择不合并时，会用第三方资料创建独立账户；这个账户可能暂时没有邮箱，只能先用对应第三方方式登录，再到安全设置增加其他登录方式。`,
        embeds: [{ id: "oauth-account-merge" }],
      },
      {
        id: "cancellation",
        title: "取消与邀请隔离",
        markdown: `等待确认、确认合并和取消是三个独立动作。点击取消不会把第三方身份绑定到旧账户；为了验证已有账户而进行的这次登录，也不会被当成一次新的邀请注册。`,
      },
    ],
  },
  {
    slug: "profile-settings",
    title: "个人资料设置",
    summary:
      "桌面端维护昵称、简介和头像地址；移动端只编辑昵称、简介并查看账户只读信息。",
    category: "getting-started",
    kind: "page",
    status: "current",
    audience: ["登录用户"],
    aliases: ["修改昵称", "头像设置", "个人简介"],
    sourcePaths: [
      "frontend-user/src/features/settings/pages/ProfilePage.tsx",
      "frontend-user/src/features/settings/pages/mobile/MobileProfilePage.tsx",
      "frontend-user/src/shared/api/profile.ts",
    ],
    related: ["account", "account-security-settings"],
    sections: [
      {
        id: "fields",
        title: "可编辑字段",
        markdown: `在桌面端进入“设置 → 个人资料”，可以修改昵称、简介和头像图片地址；下方第一张图展示桌面端资料已载入的状态。手机端从“我的 → 个人资料”修改昵称和简介，并查看邮箱、手机号与注册时间，第二张图展示这个移动页面。

桌面昵称最多 40 个字符，简介最多 200 个字符；头像只接受图片网址，不支持本地上传。手机端昵称上限是 32 个字符，简介同样最多 200 个字符，不能在移动页修改头像地址。`,
        embeds: [{ id: "profile-settings" }, { id: "mobile-profile-settings" }],
      },
      {
        id: "states",
        title: "保存状态",
        markdown: `页面会先载入现有资料，保存过程中按钮会暂时不可点击。桌面端保存昵称、简介和头像地址；移动端只保存昵称和简介，并同步更新顶部用户卡。成功后会提示“资料已保存”，失败时保留当前输入，方便你检查网络后重试。

昵称和简介可能出现在公开主页或评论中，请不要填写敏感信息。`,
      },
    ],
  },
  {
    slug: "account-security-settings",
    title: "密码、邮箱与手机号安全设置",
    summary:
      "修改密码或换绑邮箱、手机号，并通过旧、新联系方式的验证码保护账户。",
    category: "getting-started",
    kind: "page",
    status: "current",
    audience: ["登录用户", "账号支持人员"],
    aliases: ["安全设置", "换绑邮箱", "换绑手机", "修改密码"],
    sourcePaths: [
      "frontend-user/src/features/settings/pages/SecurityPage.tsx",
      "frontend-user/src/features/settings/pages/mobile/MobileSecurityPage.tsx",
      "frontend-user/src/features/auth/components/SendCodeButton.tsx",
      "frontend-user/src/features/auth/api/profile.ts",
    ],
    related: [
      "email-phone-authentication",
      "account-connections",
      "profile-settings",
    ],
    sections: [
      {
        id: "password",
        title: "修改密码",
        markdown: `修改密码时，需要填写当前密码，并输入两次相同的新密码。新密码至少 8 位；如果长度或格式不符合要求，提交后页面会给出具体提示。修改成功后输入框会清空，下次登录请使用新密码。下图展示移动安全页中的绑定状态与修改密码区域。`,
        embeds: [{ id: "mobile-security-settings" }],
      },
      {
        id: "rebind",
        title: "换绑联系方式",
        markdown: `在“设置 → 安全”选择邮箱或手机号后，输入新联系方式并获取 6 位验证码；如果原来已经绑定，还要同时验证旧联系方式。下图展示的是换绑信息和验证码输入区域。

首次绑定只验证新联系方式；换绑时必须新旧两边都验证，以减少登录会话被盗后直接改绑的风险。手机号按中国大陆 11 位号码校验。`,
        embeds: [{ id: "account-security" }],
      },
      {
        id: "boundary",
        title: "当前边界",
        markdown: `桌面安全页可以首次绑定或更换邮箱、手机号，但没有单独的“直接解绑”按钮。移动安全页只读展示邮箱、手机号和验证状态，并支持修改密码；需要换绑时，页面会引导你回到桌面端完成新旧联系方式的双重验证。

账户必须至少保留一种可用的登录方式；如果某个操作会导致无法登录，系统会拒绝提交。`,
      },
    ],
  },
  {
    slug: "account-connections",
    title: "第三方账号连接与解绑",
    summary:
      "查看登录方式、管理已接通的第三方连接，并识别移动只读与 Google 新绑定未接通的边界。",
    category: "getting-started",
    kind: "page",
    status: "current",
    audience: ["登录用户"],
    aliases: ["已连接账号", "绑定 GitHub", "解绑微信", "登录方式"],
    sourcePaths: [
      "frontend-user/src/features/settings/pages/ConnectionsPage.tsx",
      "frontend-user/src/features/settings/pages/mobile/MobileConnectionsPage.tsx",
      "frontend-user/src/features/settings/api/connections.ts",
      "frontend-user/src/features/auth/components/GoogleSignInButton.tsx",
      "frontend-user/src/features/auth/components/WeChatQRDialog.tsx",
      "frontend-user/src/features/auth/components/WeChatQRPanel.tsx",
      "frontend-user/src/shared/lib/oauth-bind.ts",
      "backend/internal/user/google_oauth.go",
    ],
    related: [
      "oauth-wechat-login",
      "oauth-account-merge",
      "account-security-settings",
    ],
    sections: [
      {
        id: "list",
        title: "连接列表",
        markdown: `在桌面端进入“设置 → 连接”，每一行会显示登录方式、绑定状态、第三方显示名或编号，以及可用时的绑定时间；你可以从这里继续绑定或解绑。下方第一张图展示桌面连接列表，第二张图展示移动端的只读列表。

邮箱和手机号始终显示；GitHub、Google、微信、Apple、ORCID、Microsoft、Discourse 会在已启用或已经绑定时出现。即使某种方式后来停止开放，已有绑定仍保留供你识别和解绑。手机端只读展示连接状态并隐藏微信，修改操作会引导到桌面端。`,
        embeds: [
          { id: "account-connections" },
          { id: "mobile-connection-settings" },
        ],
      },
      {
        id: "bind",
        title: "绑定方式",
        markdown: `绑定 GitHub、ORCID、Microsoft、Discourse 或 Apple 时，页面会跳转到对应平台完成授权；绑定微信时会打开二维码弹窗，下图展示等待扫码的绑定状态。邮箱和手机号需要到安全设置中通过验证码完成绑定或更换。

Google 可以用于登录，但当前设置页还不能新绑定 Google，因此不要把没有反应的入口当作绑定成功。已经存在的 Google 绑定仍会显示在连接列表中，也可以解绑。`,
        embeds: [{ id: "wechat-qr-binding" }],
      },
      {
        id: "unbind",
        title: "解绑保护",
        markdown: `解绑第三方账号前，页面会要求再次确认。账户只剩一种登录方式时，解绑按钮会被禁用，避免你把自己锁在账户外。解绑后将无法再用该平台登录；只要账户仍有其他登录方式，之后还可以重新绑定。`,
      },
    ],
  },
  {
    slug: "notification-center",
    title: "站内通知中心",
    summary:
      "从顶部铃铛读取系统、活动与交易通知，管理已读状态并安全打开附带链接。",
    category: "getting-started",
    kind: "feature",
    status: "current",
    audience: ["登录用户"],
    aliases: ["消息通知", "通知铃铛", "未读消息"],
    sourcePaths: [
      "frontend-user/src/shared/components/NotificationBell.tsx",
      "frontend-user/src/shared/api/notifications.ts",
      "frontend-user/src/shared/hooks/useNotificationSocket.ts",
      "frontend-user/src/features/wiki/embeds/WikiEmbedRhinoAssistant.tsx",
    ],
    related: ["account", "promotion-banner"],
    sections: [
      {
        id: "unread-and-list",
        title: "未读数与列表",
        markdown: `登录后点击通知铃铛，可以在“全部”和“未读”之间切换，也可以一键全部标为已读；徽标超过 99 条时显示“99+”。你还可以从牛犀犀助手的通知入口打开同一份列表。下图依次展示顶部铃铛里的通知列表，以及助手展开到“通知”时的样子。

列表每次加载 20 条并支持继续加载；加载中、失败、没有通知和没有未读通知都会显示不同提示。`,
        embeds: [
          { id: "notification-inbox" },
          {
            id: "rhino-assistant-support-panels",
            caption: "牛犀犀助手 · 通知列表",
          },
        ],
      },
      {
        id: "actions",
        title: "阅读、跳转与删除",
        markdown: `点击未读通知会先标记为已读；通知带有目标页面时，再继续打开对应内容。已经下线的站内页面会提示链接失效，外部链接会在新窗口打开。每条通知也可以单独删除，删除或标记已读后，铃铛上的未读数会随之更新。`,
      },
      {
        id: "realtime",
        title: "实时更新",
        markdown: `登录后，页面会自动查询未读数；主动打开通知面板时会立即刷新。新通知到达后，铃铛和列表会及时更新；如果暂时没有收到变化，重新打开通知面板即可获取最新列表。`,
      },
    ],
  },
  {
    slug: "quota-block-and-recovery",
    title: "AI 额度阻断与恢复",
    summary:
      "AI 消息因额度不足未发送时，保留输入并通过重置、经费续用或升级恢复原任务。",
    category: "membership",
    kind: "rule",
    status: "current",
    audience: ["使用 AI 的登录用户", "会员用户"],
    aliases: ["额度耗尽", "被拦消息", "用经费继续", "额度重置"],
    sourcePaths: [
      "frontend-user/src/stores/quota.store.ts",
      "frontend-user/src/shared/components/chat/QuotaComposerStrip.tsx",
      "frontend-user/src/shared/components/quota-recovery.tsx",
      "frontend-user/src/shared/components/QuotaNotifier.tsx",
      "frontend-user/src/features/claw/hooks/makeAgentConversationHook.ts",
    ],
    related: ["ai-usage-quota", "wallet-payg", "claw-stream-tool-states"],
    sections: [
      {
        id: "blocked-message",
        title: "被拦消息不会假装已发送",
        markdown: `额度不足时，本轮消息会明确显示为“未发送/额度不足”，输入文字、文库引用和已经保存的附件仍留在当前会话中；下图展示了额度状态提示的几种样式。Claw、智能搜索和 Prism 会在输入框上方显示恢复入口，矩阵、翻译和审稿等操作则会弹出带按钮的提示。`,
        embeds: [{ id: "quota-status-toasts" }],
      },
      {
        id: "recovery-actions",
        title: "恢复方式",
        markdown: `点击额度提示后，可以选择使用 1 次重置、开启“用经费继续”或升级会员；下图展示的是恢复选项和二次确认状态。重置会立即恢复满额并重新开始周期；经费续用只支付超出周期额度的部分，之后可在账户资产中关闭。

只有仍有重置次数或经费时，对应按钮才可用；没有可用资产时可以进入会员升级。`,
        embeds: [{ id: "quota-recovery" }],
      },
      {
        id: "resume",
        title: "恢复原任务",
        markdown: `重置额度或开启经费续用成功后，页面会刷新额度，并允许你重新发送刚才被拦下的消息；也可以选择忽略它。关闭提示本身不会恢复额度，也不会把未发送的消息改成已发送。`,
      },
    ],
  },
  {
    slug: "paper-search-sources",
    title: "论文检索数据源",
    summary: "理解综合、Graph、Discovery 与 Medicine 的覆盖范围和能力差异。",
    category: "discovery",
    kind: "feature",
    status: "current",
    audience: ["访客", "研究者", "学生"],
    aliases: ["搜索源", "综合搜索", "Graph", "Discovery", "Medicine"],
    sourcePaths: [
      "frontend-user/src/features/search/api/papers.ts",
      "frontend-user/src/features/search/components/SearchSidebar.tsx",
      "frontend-user/src/shared/lib/search-filters.ts",
      "frontend-user/src/shared/lib/source.ts",
    ],
    related: ["academic-search", "paper-search-filters-and-pages", "paper"],
    sections: [
      {
        id: "choices",
        title: "四种选择",
        markdown: `打开经典搜索的筛选面板，可以在“综合、Graph、Discovery、Medicine”之间选择论文来源；下图展示的是来源和其他筛选条件展开后的状态。“综合”会从多个来源中选择可用结果，其他三项只检索对应来源。`,
        embeds: [{ id: "classic-search-filters" }],
      },
      {
        id: "differences",
        title: "能力并不完全相同",
        markdown: `Graph 偏向 AI 引文图谱学术发现，目前只提供有效的相关度排序；Discovery 覆盖全学科开放发现，支持引用量和日期排序，但学科筛选只取一个概念；Medicine 面向生物医学，主要支持查询、时间、期刊或会议名及相关度/日期排序，不支持页面中的学科、文献类型、OA 和最低引用筛选。`,
      },
      {
        id: "normalization",
        title: "统一展示与来源标识",
        markdown: `不同来源的论文会以统一的卡片和详情样式展示，但题名、摘要、作者标识、引用数和全文线索仍可能不完整。页面会一直保留来源名称，避免把不同数据库中编号相同的记录误认为同一篇论文。`,
      },
    ],
  },
  {
    slug: "paper-search-filters-and-pages",
    title: "论文筛选、排序与分页",
    summary:
      "在经典检索中使用来源联动的时间、学科、类型和开放获取筛选，并理解分页上限。",
    category: "discovery",
    kind: "feature",
    status: "current",
    audience: ["访客", "研究者", "学生"],
    aliases: ["搜索筛选器", "检索分页", "文献排序", "1000 条上限"],
    sourcePaths: [
      "frontend-user/src/features/search/components/SearchSidebar.tsx",
      "frontend-user/src/features/search/components/SearcherColumn.tsx",
      "frontend-user/src/features/search/components/SearcherPagination.tsx",
      "frontend-user/src/features/search/hooks/useUrlFilters.ts",
      "frontend-user/src/shared/lib/search-filters.ts",
    ],
    related: ["academic-search", "paper-search-sources", "staging-area"],
    sections: [
      {
        id: "filters",
        title: "筛选条件",
        markdown: `展开筛选面板后，你可以选择全部时间、近 1/3/5 年或自定义年份，并按学科、文献类型和开放获取继续缩小范围；下图展示的是已展开的筛选状态。选择会保留在当前页面地址中，刷新或返回时可以恢复。

切换论文来源后，不受新来源支持的条件会自动清除：Discovery 的学科只能选一个，Medicine 会隐藏不支持的筛选组。`,
        embeds: [{ id: "classic-search-filters" }],
      },
      {
        id: "sort",
        title: "排序按来源变化",
        markdown: `Graph 和综合只提供相关度排序；Discovery 可选相关度、引用数、最新和最早；Medicine 可选相关度与最新。切换到不支持当前排序的来源时，页面会自动回到相关度。

期刊或会议范围、最低引用数目前没有稳定完整的筛选入口；只有页面中实际显示的条件可以使用。`,
      },
      {
        id: "pages",
        title: "分页与选择范围",
        markdown: `每页只能选择 20 或 50 条。即使上游报告更多结果，页面最多允许浏览前 1,000 条；需要更深结果时应收紧关键词或筛选。整页暂存和选择只针对当前页，不会自动选中其他分页。`,
      },
    ],
  },
  {
    slug: "paper-detail-and-actions",
    title: "论文详情与页面动作",
    summary:
      "查看论文元数据、作者、摘要和参考文献，并继续阅读 PDF、引用、收藏或分享。",
    category: "discovery",
    kind: "page",
    status: "current",
    audience: ["所有访客", "研究者"],
    aliases: ["论文详情页", "Paper Detail", "论文元数据"],
    sourcePaths: [
      "frontend-user/src/features/browser/components/PaperDetailPane.tsx",
      "frontend-user/src/features/browser/components/paper-detail/PaperHeader.tsx",
      "frontend-user/src/features/browser/components/paper-detail/PaperActionRow.tsx",
      "frontend-user/src/features/browser/components/paper-detail/PaperMetadataBlock.tsx",
      "frontend-user/src/features/browser/components/paper-detail/PaperReferences.tsx",
    ],
    related: [
      "paper",
      "open-access-and-paper-translation",
      "paper-favorites",
      "citation-dialog",
    ],
    sections: [
      {
        id: "route-and-data",
        title: "打开方式与数据来源",
        markdown: `每篇论文都有可以单独打开和分享的详情地址。页面会优先显示你刚刚浏览过的论文信息，再从原数据来源补齐详情；如果论文来自个人文献集，还可能包含你上传的 PDF 和修改过的元数据。加载失败、页面已失效或找不到论文时，页面会分别给出说明。`,
      },
      {
        id: "content",
        title: "页面内容",
        markdown: `打开论文后，页首会显示标题、年份、来源和作者，正文区域继续列出摘要、DOI、发表日期、被引与参考文献计数、开放获取和学科标签。向下滚动到参考文献与引用区，可以继续打开相关论文或复制引文。下图分别展示论文详情和参考文献/引用区域。

作者最多直接显示 12 位，学科标签最多 12 个，摘要关键词最多 8 个。页面只显示实际取得的数据；参考文献暂时为空不一定表示论文完全没有引用。`,
        embeds: [{ id: "paper-detail" }, { id: "paper-references-citation" }],
      },
      {
        id: "actions",
        title: "可用动作",
        markdown: `动作行可打开用户上传 PDF、合法 OA 原文、上游原始链接，跳到引用区，收藏论文或翻译标题与摘要。上传 PDF 只在文库记录确实有私有文件时出现；本地自由文件没有上游来源，因此不会显示普通收藏和作者外链。读者笔记与讨论目前只是“研究论坛即将上线”占位。`,
      },
    ],
  },
  {
    slug: "open-access-and-paper-translation",
    title: "开放获取全文与论文翻译",
    summary:
      "优先使用论文自带的 OA 线索，并在有 DOI 时查询合法开放版本；登录后可翻译标题和摘要。",
    category: "discovery",
    kind: "feature",
    status: "current",
    audience: ["所有访客", "登录用户", "研究者"],
    aliases: ["OA 全文", "Unpaywall", "AI 翻译", "摘要翻译"],
    sourcePaths: [
      "frontend-user/src/features/browser/api/open-access.ts",
      "frontend-user/src/features/browser/components/paper-detail/PaperMetadataBlock.tsx",
      "frontend-user/src/shared/components/TranslatePaperButton.tsx",
      "frontend-user/src/shared/api/translate.ts",
    ],
    related: ["paper-detail-and-actions", "pdf-reader", "ai-usage-quota"],
    sections: [
      {
        id: "oa",
        title: "开放获取查找",
        markdown: `在论文详情的动作区查看全文入口：有直接开放 PDF 时可以打开阅读器；只有 DOI 时，页面会继续查找 Unpaywall 收录的合法开放版本。下图展示的是详情中出现全文相关操作的状态。

页面会区分可下载 PDF 与普通免费全文，并在使用 Unpaywall 结果时标注来源。找到论文元数据页或原始网页，不等于已经找到可合法下载的全文。`,
        embeds: [{ id: "paper-detail" }],
      },
      {
        id: "translation",
        title: "AI 翻译",
        markdown: `只有标题或摘要包含需要翻译的文字时才显示按钮。首次翻译要求登录并消耗相应 AI 额度，完成后缓存中文标题和摘要；之后“AI 翻译/原文”只在当前已缓存内容间切换，不会重复请求。额度耗尽由全局恢复流程承接。`,
      },
      {
        id: "limits",
        title: "边界",
        markdown: `翻译覆盖标题和摘要，不是整篇 PDF 翻译，也不会改写论文原始记录。OA 查询依赖 DOI 和第三方覆盖，失败时用户仍可尝试上游原始页；Scholay 不以“OA”标签替代版权和许可判断。`,
      },
    ],
  },
  {
    slug: "author-profile-page",
    title: "作者详情页",
    summary: "查看作者身份线索、研究主题、代表作、合作作者和年度发表趋势。",
    category: "discovery",
    kind: "page",
    status: "current",
    audience: ["所有访客", "研究者"],
    aliases: ["学者档案", "作者画像", "Author Detail"],
    sourcePaths: [
      "frontend-user/src/features/browser/components/AuthorDetailPane.tsx",
      "frontend-user/src/features/browser/components/author-detail/AuthorHero.tsx",
      "frontend-user/src/features/browser/components/author-detail/TopicSection.tsx",
      "frontend-user/src/features/browser/components/author-detail/FeaturedPapersCol.tsx",
      "frontend-user/src/shared/api/authors.ts",
    ],
    related: ["authors-and-journals", "paper-detail-and-actions"],
    sections: [
      {
        id: "entry",
        title: "入口与状态",
        markdown: `在搜索结果或论文详情中点击作者名，会在浏览工作区打开作者页；下图展示的是作者资料、主题和代表作已经载入的状态。你也可以保存作者页链接后直接再次访问。

加载失败、作者不存在或原标签失效时会显示对应提示。同名、机构和不同来源的归并信息只是识别线索，不代表经过人工身份认证。`,
        embeds: [{ id: "author-profile" }],
      },
      {
        id: "derived-sections",
        title: "派生内容",
        markdown: `作者页会根据当前取到的论文生成研究主题、合作作者和年度发表趋势；下图展示的是合作网络与趋势区。代表作按引用数取前 5 篇，合作作者按共同出现次数取前 8 位，年度柱状图也来自同一批样本。

页面最多取 50 篇论文来计算这些内容，因此它们是当前样本的概览，不一定覆盖作者全部生涯。`,
        embeds: [{ id: "author-collaboration-trends" }],
      },
      {
        id: "navigation",
        title: "继续浏览",
        markdown: `点击代表作可以进入论文详情，点击合作作者可以继续查看对方的作者页。只有数据来源提供了可靠作者标识时，名字才会生成链接；不同数据库中的同名或同编号作者不会被直接拼成一个人。`,
      },
    ],
  },
  {
    slug: "journal-detail-page",
    title: "期刊详情页",
    summary:
      "集中查看期刊标识、收录来源、分区、影响指标、年度趋势和投稿决策信息。",
    category: "discovery",
    kind: "page",
    status: "current",
    audience: ["所有访客", "作者", "研究者"],
    aliases: ["Journal Detail", "期刊指标", "选刊信息"],
    sourcePaths: [
      "frontend-user/src/features/browser/components/JournalDetailPane.tsx",
      "frontend-user/src/shared/components/JournalDecisionCard.tsx",
      "frontend-user/src/shared/components/JournalMetricsGroups.tsx",
      "frontend-user/src/shared/components/JournalTrendChart.tsx",
      "frontend-user/src/shared/api/journals.ts",
    ],
    related: [
      "authors-and-journals",
      "journal-search-page",
      "journal-submission-resources",
    ],
    sections: [
      {
        id: "route-and-loading",
        title: "入口与完整详情",
        markdown: `期刊详情既可以从搜索结果打开，也可以通过分享链接直接访问。页面会先显示已经取得的基础信息，再补充分组指标、年度趋势和投稿资源；如果期刊不存在、加载失败或原来的浏览标签已经失效，页面会给出对应提示。`,
      },
      {
        id: "decision-data",
        title: "选刊信息",
        markdown: `打开期刊详情后，可以集中查看 ISSN、出版社、国家、期刊或会议类型、JCR/中科院/CCF 分区、影响因子、OpenAlex h-index、开放获取和预警信号；下图展示的是指标较完整时的详情状态。点击 ISSN 还可以前往官方 ISSN Portal 核对。

指标只在有数据时显示，年度趋势样本不足会隐藏。决策卡是多项信息的摘要，不构成投稿或录用保证。`,
        embeds: [{ id: "journal-detail" }],
      },
      {
        id: "current-boundary",
        title: "当前边界",
        markdown: `详情支持复制与分享，但当前没有稳定的“收藏期刊”写动作。旧设计中的评分、评论和更完整社区收录信息仍待研究论坛能力；空字段不会用虚构值补齐。`,
      },
    ],
  },
  {
    slug: "journal-search-page",
    title: "期刊检索页",
    summary:
      "按刊名、ISSN、主办机构和五类质量条件筛选期刊，每页查看 8 条结果。",
    category: "discovery",
    kind: "page",
    status: "current",
    audience: ["所有访客", "作者", "研究者"],
    aliases: ["期刊搜索", "Journal Search", "查期刊"],
    sourcePaths: [
      "frontend-user/src/features/journals/pages/JournalSearchPage.tsx",
      "frontend-user/src/features/journals/components/JournalSearchResults.tsx",
      "frontend-user/src/features/journals/components/JournalSidebar.tsx",
      "frontend-user/src/features/journals/hooks/useJournalUrlFilters.ts",
      "frontend-user/src/features/journals/types.ts",
    ],
    related: [
      "journal-detail-page",
      "journal-rankings-and-directories",
      "authors-and-journals",
    ],
    sections: [
      {
        id: "query",
        title: "搜索与默认列表",
        markdown: `进入期刊搜索后，输入刊名、ISSN 或主办机构即可查找；不输入关键词时，页面会按影响因子从高到低显示默认列表。下图展示的是带搜索框、筛选区和期刊卡片的结果页。

每页固定显示 8 条。关键词、页码、排序和筛选会保留在页面地址中，从详情返回时可以恢复；当无法取得准确总数时，只显示上一页和下一页。`,
        embeds: [{ id: "journal-search" }],
      },
      {
        id: "filters",
        title: "五组筛选",
        markdown: `中科院分区可选 1–4 区，JCR 可选 Q1–Q4，影响因子阈值为 5/10/20/30，CCF 为 A/B/C，出版社预设包括 Nature Portfolio、Elsevier、IEEE、Springer 和 ACM。每组单选，“不限”会清除该维度；任一变化自动回第一页并重新查询。`,
      },
      {
        id: "sort-and-states",
        title: "排序与页面状态",
        markdown: `排序提供相关度、影响因子和“最新”。这里的“最新”实际按 OpenAlex 收录的论文数量排列，不是按创刊日期排列。查询时页面会分别显示检索中、加载失败或没有匹配结果；点击期刊卡可以进入详情。侧栏中的文件夹只是前往文献集的快捷入口，不代表期刊已经被收藏。`,
      },
    ],
  },
  {
    slug: "journal-rankings-and-directories",
    title: "期刊榜单与分类目录",
    summary:
      "通过四个预设质量榜单，以及学科、国家、开放获取和预警目录发现期刊。",
    category: "discovery",
    kind: "feature",
    status: "current",
    audience: ["所有访客", "作者", "研究者"],
    aliases: ["SCI 一区", "中科院一区", "CCF A", "期刊目录"],
    sourcePaths: [
      "frontend-user/src/features/journals/routes.tsx",
      "frontend-user/src/features/journals/pages/JournalCollectionPage.tsx",
      "frontend-user/src/features/journals/pages/JournalHubBrowsePage.tsx",
      "frontend-user/src/features/journals/pages/JournalHubListPage.tsx",
      "frontend-user/src/features/journals/api/journal-hubs.ts",
    ],
    related: ["journal-search-page", "journal-detail-page"],
    sections: [
      {
        id: "rankings",
        title: "四个预设榜单",
        markdown: `在期刊目录中可以直接打开四个预设榜单：JCR Q1、中科院 1 区、CCF A，以及影响因子至少 10；下图展示的是这些目录入口及榜单卡片。它们使用与期刊搜索相同的列表和分页，只是预先选好了条件。`,
        embeds: [{ id: "journal-directory" }],
      },
      {
        id: "directories",
        title: "目录发现",
        markdown: `期刊目录汇总学科分类、国家、开放获取、预警入口和最近更新的期刊。分类、国家和开放获取列表都可以继续翻页；预警页则集中显示需要额外核对的风险信息。目录与榜单只是发现工具，不等于官方评价或投稿推荐。`,
      },
      {
        id: "metric-caution",
        title: "指标口径",
        markdown: `JCR Q1 与中科院 1 区是不同体系，CCF 只覆盖相应计算机目录，影响因子阈值也不等于学科内排名。榜单文案用于解释筛选，不应把某一标签扩写为“适合所有研究者”或“必然录用”。`,
      },
    ],
  },
  {
    slug: "journal-submission-resources",
    title: "期刊投稿资源下载",
    summary: "在期刊详情中下载可用的作者指南 Markdown 和 LaTeX 模板 zip。",
    category: "discovery",
    kind: "feature",
    status: "current",
    audience: ["作者", "Max 会员"],
    aliases: ["Guide for Authors", "LaTeX 模板", "投稿须知"],
    sourcePaths: [
      "frontend-user/src/shared/components/JournalSubmissionCard.tsx",
      "frontend-user/src/shared/api/journals.ts",
      "frontend-user/src/features/browser/components/JournalDetailPane.tsx",
    ],
    related: ["journal-detail-page", "membership", "prism"],
    sections: [
      {
        id: "availability",
        title: "什么时候显示",
        markdown: `打开期刊详情并向下查看投稿资源；当期刊确实提供作者指南或 LaTeX 模板时，页面才会显示下载卡片。下图展示的是详情中包含投稿资源的状态。作者指南下载为 .md，LaTeX 模板为 .zip；有 class 名时也会一并显示。

没有可用资源时，整个区块会隐藏，不会出现一个无法点击的占位。`,
        embeds: [{ id: "journal-detail" }],
      },
      {
        id: "membership",
        title: "会员限制",
        markdown: `投稿资源下载是 Max 专享。访客、Free 和 Pro 用户会看到锁定状态，并可前往定价页了解权限。Max 用户点击后会直接获得文件；如果下载失败，当前页面会保留，并提示稍后重试。`,
      },
      {
        id: "boundary",
        title: "使用边界",
        markdown: `下载到的指南和模板是辅助材料，可能随期刊更新。用户在投稿前仍应访问期刊官网核对最新格式、许可与要求；Scholay 提供资源不等于代投或保证材料合规。`,
      },
    ],
  },
  {
    slug: "paper-favorites",
    title: "论文收藏与取消收藏",
    summary:
      "把论文保存到个人文献集的指定文件夹，并理解重复收藏和取消收藏的真实副作用。",
    category: "knowledge",
    kind: "feature",
    status: "current",
    audience: ["登录用户", "研究者"],
    aliases: ["收藏论文", "取消收藏", "加入文件夹"],
    sourcePaths: [
      "frontend-user/src/shared/components/FavoritePaperButton.tsx",
      "frontend-user/src/shared/api/user-library-mutations.ts",
      "frontend-user/src/features/library/components/CollectFolderPicker.tsx",
      "frontend-user/src/stores/pending-action.store.ts",
      "frontend-user/src/stores/collect-picker.store.ts",
    ],
    related: ["literature-library", "paper-detail-and-actions", "mobile-feed"],
    sections: [
      {
        id: "favorite",
        title: "收藏流程",
        markdown: `在搜索、矩阵、论文详情或移动 Feed 中点击收藏。未登录时，页面会先打开登录，并在成功后继续刚才的收藏；已登录但没有指定位置时，会让你选择目标文献集。下图只展示确认收藏前的文献集选择界面；选好位置后，点击底部按钮才会完成收藏。

如果最终没有选择具体文件夹，论文会进入默认文件夹。`,
        embeds: [{ id: "paper-favorite-flow" }],
      },
      {
        id: "duplicate",
        title: "重复收藏",
        markdown: `同一篇论文已经收藏时，页面会提示“已在文件夹中”，不会再创建一份副本，也不会因为这次选择了另一个文件夹就悄悄移动原记录。需要更换文件夹时，请到文献集中执行移动。`,
      },
      {
        id: "unfavorite",
        title: "取消收藏是删除记录",
        markdown: `再次点击已收藏按钮时，页面会先要求确认。这一步不在上图中，但需要特别注意：取消收藏不只是去掉星标。如果该记录包含你上传的 PDF、编辑过的元数据或处理进度，这些内容也可能一并丢失。文献集中的删除提示会说明这项风险；确认前请先检查是否需要保留文件。`,
      },
    ],
  },
  {
    slug: "pdf-upload-resolve-and-relink",
    title: "PDF 上传、识别与重新关联",
    summary:
      "把本地 PDF 放入个人文献集，核对三源匹配候选，并在识别错误时重新关联或保留自由文件。",
    category: "knowledge",
    kind: "feature",
    status: "current",
    audience: ["登录用户", "研究者"],
    aliases: ["上传 PDF", "PDF 解析", "文献识别", "重新关联"],
    sourcePaths: [
      "frontend-user/src/features/library/api/pdf.ts",
      "frontend-user/src/features/library/api/upload-resolve.ts",
      "frontend-user/src/features/library/api/relink.ts",
      "frontend-user/src/features/library/components/library-import-dialog/PdfUploadTab.tsx",
      "frontend-user/src/features/library/components/manage/RelinkPanel.tsx",
      "frontend-user/src/features/library/components/shared/validate-pdf.ts",
    ],
    related: ["literature-library", "pdf-reader", "paper-favorites"],
    sections: [
      {
        id: "validation",
        title: "文件预检",
        markdown: `这里只接受 PDF，文件大小需要略低于 50 MiB。上传前页面会检查文件格式，避免把只是改了扩展名的其他文件当作 PDF。文件名超过 250 个字符时会给出提醒，保存时会安全截短，不会因此阻止上传。`,
      },
      {
        id: "resolve",
        title: "流式识别与人工确认",
        markdown: `上传 PDF 后，页面会先解析题名、摘要、DOI、arXiv、作者和年份，再搜索可能匹配的论文；下图展示的是候选已经返回、等待你确认的状态。选择正确候选后保存为已关联论文，或者拒绝所有候选并保存为自由文件。

扫描件无法提取文字时会提示识别受限，但仍允许保存 PDF。最终确认与保存最多等待 120 秒。`,
        embeds: [{ id: "pdf-resolve" }],
      },
      {
        id: "relink",
        title: "重新关联与合并",
        markdown: `识别错误时，打开“重新关联”，用当前标题或临时修改的标题再次搜索，并明确选择新候选；下图展示的是搜索与候选对照工作台。你也可以取消关联，把当前资料保留为自由文件。

如果目标论文已经在文献集中，系统会把 PDF 和 AI 处理状态合并到已有记录，并删除当前重复项；否则会在原位置替换关联。取消关联前会先保存当前显示的元数据。`,
        embeds: [{ id: "library-relink-workbench" }],
      },
    ],
  },
  {
    slug: "citation-dialog",
    title: "引用弹窗与默认格式",
    summary:
      "从论文卡片、详情或移动 Feed 生成五种引用文本，复制并保存个人默认格式。",
    category: "knowledge",
    kind: "feature",
    status: "current",
    audience: ["所有访客", "研究者", "学生"],
    aliases: ["引用本文", "参考文献复制", "BibTeX", "GB/T 7714"],
    sourcePaths: [
      "frontend-user/src/shared/components/CitationDialog.tsx",
      "frontend-user/src/shared/components/CitationProse.tsx",
      "frontend-user/src/shared/lib/citation.ts",
      "frontend-user/src/features/browser/components/paper-detail/PaperFooter.tsx",
    ],
    related: ["citation-generator", "paper-detail-and-actions", "mobile-feed"],
    sections: [
      {
        id: "formats",
        title: "五种格式",
        markdown: `在论文卡片、详情或移动 Feed 中点击“引用”，可以在 GB/T 7714、BibTeX、MLA、APA 和 Chicago 之间切换并复制；下图展示的是引用弹窗已经生成结果的状态。BibTeX 会以代码块显示，其他格式以引文段落显示；论文详情里的引用区会生成相同结果。`,
        embeds: [{ id: "citation-dialog" }],
      },
      {
        id: "interaction",
        title: "切换、默认与复制",
        markdown: `单击格式名只切换本次显示，双击会把该格式写入本机作为默认并给出提示。尚未保存偏好时，全局弹窗默认 APA，论文详情内联区默认 BibTeX；保存后两处都会读取同一偏好。复制会去除仅用于页面展示的斜体标记，并报告剪贴板成功或失败。`,
      },
      {
        id: "quality",
        title: "元数据边界",
        markdown: `格式化只使用当前论文的作者、题名、年份、期刊、卷期、页码和标识符。缺失或错误元数据不会因切换格式自动修复；正式投稿前仍应核对原论文与目标期刊要求。需要通过 DOI 或手工录入时可使用独立引用生成器。`,
      },
    ],
  },
  {
    slug: "claw-sessions",
    title: "Claw 会话与历史",
    summary:
      "创建、切换、重命名和删除自己的 Claw 会话，并在长历史中分批加载较早轮次。",
    category: "research-ai",
    kind: "feature",
    status: "current",
    audience: ["Claw 用户", "研究者"],
    aliases: ["Claw 历史", "新对话", "会话重命名"],
    sourcePaths: [
      "frontend-user/src/features/claw/routes.tsx",
      "frontend-user/src/features/claw/api/session.ts",
      "frontend-user/src/features/claw/components/sidebar/ClawSessionList.tsx",
      "frontend-user/src/features/claw/components/sidebar/ClawSessionDialogs.tsx",
      "frontend-user/src/features/claw/hooks/makeAgentConversationHook.ts",
    ],
    related: [
      "claw",
      "claw-attachments-and-references",
      "claw-stream-tool-states",
    ],
    sections: [
      {
        id: "routes",
        title: "会话入口",
        markdown: `打开 Claw 时会进入新对话或恢复当前入口；从会话历史选择一条记录后，会打开对应对话。列表按最近访问时间组织，并且只显示当前账户拥有的会话。切换会话时，页面会更新当前地址并重新连接该对话的实时状态。`,
      },
      {
        id: "management",
        title: "管理动作",
        markdown: `在桌面端从对话区顶部打开会话历史，或在手机端拉出会话抽屉，就可以新建、切换、重命名和删除对话；下图分别展示桌面历史列表和移动抽屉。标题不能为空，删除前会再次确认；删除当前会话后会切到剩余会话，没有其他记录时回到新对话。

每个会话会保存自己的模型选择，刷新页面或换设备后仍以该会话已经保存的选择为准。`,
        embeds: [
          { id: "claw-session-history" },
          { id: "mobile-claw-session-drawer" },
        ],
      },
      {
        id: "history-window",
        title: "长历史加载",
        markdown: `打开很长的会话时，页面会先载入最近 100 轮；点击“加载更早”，每次再增加 100 轮。为了保持滚动流畅，页面先显示最近 60 轮，再分批展开。每条历史记录始终归属于自己的会话，切换会话不会把两边的消息混在一起。`,
      },
    ],
  },
  {
    slug: "claw-attachments-and-references",
    title: "Claw 附件、文库引用与 Skill",
    summary:
      "向 Claw 消息加入受支持的图片、文档、文库资料和已安装 Skill，并理解格式与数量限制。",
    category: "research-ai",
    kind: "feature",
    status: "current",
    audience: ["Claw 用户", "研究者"],
    aliases: ["Claw 上传文件", "文库引用", "会话 Skill"],
    sourcePaths: [
      "frontend-user/src/shared/hooks/useComposerAttachments.ts",
      "frontend-user/src/shared/components/chat/LibraryReferencePicker.tsx",
      "frontend-user/src/features/claw/components/chat/ComposerSkillsButton.tsx",
      "frontend-user/src/features/claw/components/chat/ChatComposer.tsx",
      "frontend-user/src/shared/api/agent-attach.ts",
    ],
    related: [
      "claw",
      "claw-sessions",
      "community-skills",
      "literature-library",
    ],
    sections: [
      {
        id: "attachment-limits",
        title: "附件限制",
        markdown: `一条消息最多添加 10 个附件。JPEG/JPG、PNG、WebP、GIF 图片每个最多 5 MB；PDF、DOCX、XLSX、PPTX、ODT、RTF 和常见文本或代码文件每个最多 30 MB。

只有显示“上传完成”的附件会随消息一起发送；仍在上传、上传失败或已经移除的文件不会交给助手。`,
      },
      {
        id: "unsupported",
        title: "不支持的格式",
        markdown: `SVG、BMP、TIFF、HEIC 和 AVIF 目前不能作为图片附件上传；旧版 Office 文件请先另存为 DOCX、XLSX 或 PPTX。SPSS、Stata、SAS 的专有文件需要先转换为 CSV 或 XLSX；如果 CSV 来自中文 Windows 环境，还要留意文件可能使用 GBK 编码。`,
      },
      {
        id: "references-skills",
        title: "文库引用与 Skill",
        markdown: `在 Claw 输入框中点击文库或 Skill 按钮，可以从自己的文献中选择论文作为本轮引用，也可以启用已安装的 Skill；下图展示的是附件、文库引用和 Skill 入口同时可见的输入区。发送前请确认所选内容已出现在消息上方。

引用论文不等于上传原始 PDF，能否读取全文仍取决于文献记录。Skill 用于提供任务步骤和输出要求；每个会话可启用数量及账户安装上限以页面提示为准，也不会因为 Skill 的文字而获得额外工具权限。`,
        embeds: [{ id: "claw-context-composer" }],
      },
    ],
  },
  {
    slug: "claw-stream-tool-states",
    title: "Claw 流式连接、工具过程与异常状态",
    summary:
      "识别消息送达、工具执行、停止、停滞、断线、额度阻断和多标签页接管等会话状态。",
    category: "research-ai",
    kind: "feature",
    status: "current",
    audience: ["Claw 用户", "支持人员"],
    aliases: ["Claw 卡住", "工具调用", "消息未发送", "连接重试"],
    sourcePaths: [
      "frontend-user/src/features/claw/hooks/makeAgentConversationHook.ts",
      "frontend-user/src/shared/hooks/useAgentSocket.ts",
      "frontend-user/src/features/claw/components/chat/ConnectionBadge.tsx",
      "frontend-user/src/shared/components/chat/ToolCallBlock.tsx",
      "frontend-user/src/shared/components/chat/StallNotice.tsx",
      "frontend-user/src/shared/components/AgentDisplacedBanner.tsx",
    ],
    related: [
      "claw",
      "claw-sessions",
      "quota-block-and-recovery",
      "agent-runtime",
    ],
    sections: [
      {
        id: "delivery",
        title: "发送与送达",
        markdown: `发送消息后，页面会等待服务端确认。10 秒内没有收到确认或任何新内容时，这一轮会显示为“未发送”，并提供一键重发；如果确认稍后到达，误报会自动消失。重复点击重发也不会让同一条消息被处理多次。`,
      },
      {
        id: "stream",
        title: "流式过程与停止",
        markdown: `一轮回答中，思考、检索、工具执行、追问、正文和生成文件会按先后顺序显示。点击停止后，页面会等待任务结束；如果 20 秒后仍没有收尾，界面会先恢复可操作状态，但这不代表服务端一定已经在同一瞬间停止。系统繁忙时会有限次自动重试。`,
      },
      {
        id: "abnormal",
        title: "停滞、断线与接管",
        markdown: `下图只展示任务连续 180 秒没有新内容时出现的停滞提醒。你可以继续等待，也可以主动停止；这条提示本身不会中断长任务。

连接中断时，页面最多会自动重试 8 次，每次间隔最长 60 秒。若同一会话被另一个浏览器标签页接管，当前页面会显示单独的接管提示，避免两个窗口同时发送。`,
        embeds: [{ id: "claw-run-states" }],
      },
    ],
  },
  {
    slug: "help-center-and-qa",
    title: "帮助中心与学术问答",
    summary:
      "按主题浏览后台维护的科研长问答，并在详情页使用目录、相关问答和产品快捷入口。",
    category: "knowledge",
    kind: "page",
    status: "current",
    audience: ["所有访客", "研究者", "学生"],
    aliases: ["Help Center", "QA", "常见问题", "学术问答"],
    sourcePaths: [
      "frontend-user/src/features/help/pages/HelpCenterPage.tsx",
      "frontend-user/src/features/help/pages/QADetailPage.tsx",
      "frontend-user/src/features/help/api/content.ts",
      "frontend-user/src/features/help/components/ArticleRenderer.tsx",
      "frontend-user/src/features/wiki/embeds/WikiEmbedRhinoAssistant.tsx",
    ],
    related: [
      "feedback-and-support",
      "resource-and-blog-center",
      "service-policies",
    ],
    sections: [
      {
        id: "hub",
        title: "问答首页",
        markdown: `进入帮助中心后，你会看到按主题整理的学术问答；分类较多时，可以用页内主题入口直接跳转。牛犀犀助手的「帮助」面板还提供拖点、功能、对话和导览说明；第二张图只展示面板默认打开的「拖点」标签，它不是问答列表。下图分别展示问答首页和「拖点」标签。

旧的问答列表地址会自动转到帮助中心；加载中会显示提示，页面底部还保留关于、反馈、联系和政策入口。`,
        embeds: [{ id: "help-center" }, { id: "rhino-assistant-help-panel" }],
      },
      {
        id: "detail",
        title: "问答详情",
        markdown: `点击问答标题后，详情页会显示分类、作者、预计阅读时长、正文目录和相关产品入口，文末最多推荐 3 篇同类问答；下图展示的是一篇内容已经载入的详情页。每篇问答都有稳定链接。找不到文章或加载失败时会返回帮助中心，不会显示空白详情。`,
        embeds: [{ id: "help-content-detail" }],
      },
      {
        id: "source",
        title: "内容来源",
        markdown: `问答正文来自后台发布的内容，页面负责按章节展示并让搜索引擎正确识别。学术问答用于解释和教学；涉及平台限制、会员或法律边界时，应继续查看相应的现行规则词条。`,
      },
    ],
  },
  {
    slug: "resource-and-blog-center",
    title: "学术资源中心与产品博客",
    summary:
      "在同一个内容中心切换原创学术资源与产品博客，同时保留两套稳定列表和详情 URL。",
    category: "knowledge",
    kind: "page",
    status: "current",
    audience: ["所有访客", "研究者", "学生"],
    aliases: ["资源中心", "产品博客", "Academic Resources"],
    sourcePaths: [
      "frontend-user/src/features/help/pages/ResourceCenterPage.tsx",
      "frontend-user/src/features/help/pages/BlogDetailPage.tsx",
      "frontend-user/src/features/help/pages/ResourceDetailPage.tsx",
      "frontend-user/src/features/help/api/content.ts",
      "frontend-user/src/shared/components/TableOfContents.tsx",
    ],
    related: ["help-center-and-qa", "research-news"],
    sections: [
      {
        id: "two-tabs",
        title: "两个列表入口",
        markdown: `在内容中心切换“学术资源”和“产品博客”：资源页按主题分组，博客页提供分类、最新文章和卡片列表；下图展示的是内容中心列表状态。切换后页面地址也会变化，因此两类列表都可以单独收藏和分享。`,
        embeds: [{ id: "resource-center" }],
      },
      {
        id: "details",
        title: "详情与继续阅读",
        markdown: `点击资源或博客卡片后，详情页会显示正文目录、作者、日期、阅读时长、相关文章和返回产品的入口；下图展示的是内容详情的常见布局。没有已发布内容的分类会显示空状态，作者与日期以当前文章页面为准。`,
        embeds: [{ id: "help-content-detail" }],
      },
      {
        id: "boundary",
        title: "与资讯、帮助的区别",
        markdown: `资源和博客是相对稳定的原创长文，学术情报会持续更新，帮助中心则按具体问题组织答案。三类内容可以互相链接，但不能把转载资讯当作官方产品规则，也不能把博客里的愿景当成已经上线的功能。`,
      },
    ],
  },
  {
    slug: "share-cards-and-posters",
    title: "分享卡片、短链与海报",
    summary:
      "为论文、期刊、文献文件夹和工具生成链接、二维码或图片，并在移动端调用系统分享。",
    category: "knowledge",
    kind: "feature",
    status: "current",
    audience: ["访客", "登录用户", "分享接收者"],
    aliases: ["分享海报", "二维码分享", "复制口令", "保存图片"],
    sourcePaths: [
      "frontend-user/src/shared/components/share/ShareSheet.tsx",
      "frontend-user/src/shared/components/share/ShareCard.tsx",
      "frontend-user/src/shared/components/share/SharePoster.tsx",
      "frontend-user/src/shared/components/share/CollectionSharePoster.tsx",
      "frontend-user/src/shared/api/library-share.ts",
    ],
    related: ["library-sharing", "paper-detail-and-actions", "feature-tools"],
    sections: [
      {
        id: "targets",
        title: "四类分享对象",
        markdown: `登录后分享论文、期刊或文献文件夹时，系统会生成一条简短链接；公开工具则直接分享工具详情页。论文和期刊的链接长期有效且不设提取码；分享文件夹时，你可以选择永久、7 天或 30 天，并按需开启提取码。`,
      },
      {
        id: "channels",
        title: "链接、口令、二维码与系统分享",
        markdown: `点击分享后，面板会提供复制链接、保存图片和二维码；分享文献文件夹时，还可以复制包含“链接 + 提取码”的口令。下图展示的是分享面板已经生成链接和二维码的状态。二维码会带上提取码，扫码者无需再输入。

支持系统分享的手机浏览器会直接打开分享菜单；不支持时，页面会复制链接并提示你粘贴到微信等应用。`,
        embeds: [{ id: "share-sheet" }],
      },
      {
        id: "image",
        title: "保存分享图",
        markdown: `论文、期刊和工具会生成信息海报，文件夹海报则包含整理人、篇目样本和二维码。点击“保存图片”后，页面会生成较清晰的 PNG 文件；即使图片生成失败，已经创建的分享链接仍然有效。

海报中的引用量、分区和摘要来自生成当时的数据快照，不保证以后始终实时更新。`,
      },
    ],
  },
  {
    slug: "mobile-feed",
    title: "移动 Feed：论文、期刊与情报",
    summary:
      "在移动 Web 中上下滑动浏览论文、期刊和学术情报，横滑切换频道并下拉刷新。",
    category: "mobile",
    kind: "page",
    status: "current",
    audience: ["手机用户", "移动端研究者"],
    aliases: ["刷论文", "刷期刊", "刷情报", "移动信息流"],
    sourcePaths: [
      "frontend-user/src/features/mobile/pages/FeedPage.tsx",
      "frontend-user/src/features/mobile/pages/JournalFeedPage.tsx",
      "frontend-user/src/features/mobile/components/JournalFeedCard.tsx",
      "frontend-user/src/features/mobile/pages/NewsPage.tsx",
      "frontend-user/src/features/mobile/components/VerticalSwipeFeed.tsx",
      "frontend-user/src/features/mobile/api/feed.ts",
      "frontend-user/src/features/mobile/api/journal-feed.ts",
    ],
    related: [
      "mobile-web",
      "paper-favorites",
      "research-news",
      "citation-dialog",
    ],
    sections: [
      {
        id: "navigation",
        title: "三条信息流",
        markdown: `移动 Feed 分为论文、期刊和情报三个频道。三者都采用纵向一屏一卡，并会提前加载接下来的内容；横向滑动可以在三个频道之间切换，不会干扰上下浏览。加载、继续加载、错误、空内容和下拉刷新使用一致的提示；只有期刊频道额外显示可点击的“下一刊”预览条。`,
      },
      {
        id: "papers-journals",
        title: "论文与期刊的种子",
        markdown: `在论文或期刊频道上下滑动，每次会继续加载 10 条；下拉刷新会换一组推荐。下方三张图分别展示论文卡、期刊卡，以及信息流加载失败后可以重试的状态。

论文会在 Graph、Discovery、Medicine 和不同主题之间轮换，并偏向较新的内容；期刊大致按影响因子排序，同时变化起始位置。两条信息流最多各浏览 60 页，连续 4 个空页后停止；前 3 页和当前位置会保存在本机，返回同一组推荐时可以接着看。`,
        embeds: [
          { id: "mobile-feed" },
          { id: "mobile-journal-feed" },
          { id: "mobile-feed-states" },
        ],
      },
      {
        id: "news-actions",
        title: "情报与卡片动作",
        markdown: `切到“情报”后，可以在“实时”和“热榜”之间切换，每批加载 8 条；下图展示的是移动端学术情报卡。下拉刷新会更新当前查询，但不会保存随机推荐组或阅读位置。

论文卡可以查看作者标识与引用、分享，并在登录后收藏或取消收藏；卡片本身暂时不能打开论文详情。期刊卡目前只有收藏占位和分享，也不能打开标准期刊详情。收藏图标会先即时变化，最终以文献集是否保存成功为准。`,
        embeds: [{ id: "mobile-academic-intel" }],
      },
    ],
  },
];
