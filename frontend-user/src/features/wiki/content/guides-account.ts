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
      "frontend-user/src/features/home/components/HomeAgentHero.tsx",
      "frontend-user/src/features/home/components/HomeFeatureEntrances.tsx",
      "frontend-user/src/features/home/components/HomeFeatureZones.tsx",
      "frontend-user/src/features/home/components/HomeFeatureNav.tsx",
      "frontend-user/src/features/home/components/HomeNoviceTour.tsx",
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

**搜索文献与期刊**：论文库搜索适合按关键词、年份和来源做结构化筛选。智能搜论文适合直接描述研究问题，让系统帮助拆解检索。期刊指标与目录从“学术搜索 › 期刊库搜索”进入。

**使用 AI 完成研究任务**：智能助手可以阅读附件、整理材料和生成交付物。智能写作用来维护论文项目。智能审稿用于在正式投稿或送审前发现问题。

**管理资料与发现工具**：“我的资源”集中管理文献、期刊、稿件与资源。文献区还共用 PDF Chat、文献图谱和论文矩阵分析。

scholay广场用来发现学术工具、学术skills 和学术prompts。数据集搜索与 scholay 情报归在“学术搜索”。学术资源中心是一组教程和产品文章，不是个人资料库。`,
      },
      {
        id: "choose-a-path",
        title: "按任务选择功能",
        markdown: `先判断要的是“结构化检索结果”，还是“用 AI 完成一段工作”。

有明确筛选条件时，用论文库搜索。需要自然语言拆解问题时，用智能搜论文。查期刊指标时，进入“学术搜索 › 期刊库搜索”。

需要解释论文、处理附件、翻译、写作建议或组合研究任务时，进入智能助手。需要直接维护 LaTeX 项目时，进入智能写作的高级模式。需要形成投稿前审稿报告时，进入智能审稿。

智能搜论文不是完整的期刊筛选器，它只保留有限的期刊详情工具。`,
        table: {
          columns: [
            { key: "goal", header: "目标" },
            { key: "entry", header: "入口" },
            { key: "boundary", header: "边界" },
          ],
          rows: [
            {
              goal: "筛论文、找学者",
              entry: "论文库搜索",
              boundary: "结构化检索与筛选，不是生成式对话",
            },
            {
              goal: "用自然语言找论文",
              entry: "智能搜论文",
              boundary: "只读、证据驱动，工具范围集中在论文与作者",
            },
            {
              goal: "查期刊与分区指标",
              entry: "学术搜索 › 期刊库搜索",
              boundary: "期刊库搜索与发现目录，不由智能搜论文替代",
            },
            {
              goal: "问答、读附件、做研究任务",
              entry: "智能助手",
              boundary: "通用研究助手，结果仍需核验来源",
            },
            {
              goal: "编辑论文项目",
              entry: "智能写作",
              boundary: "面向 LaTeX 项目和变更确认",
            },
            {
              goal: "投稿前预审",
              entry: "智能审稿",
              boundary: "AI 预审，不替代期刊或学校的正式评审",
            },
          ],
        },
        blocks: [
          { type: "table" },
          { type: "markdown" },
          {
            type: "article-link",
            card: {
              articleSlug: "classic-vs-smart-search",
              title: "论文库搜索 vs 智能搜论文",
              description:
                "已经有关键词就用论文库搜索；还在找说法、需要系统帮你拆问题时用智能搜论文。",
              icon: "compass",
            },
          },
        ],
      },
      {
        id: "plan-model",
        title: "比较 Free、Pro 和 Max",
        markdown: `Free 是注册后的默认套餐。Pro 和 Max 提供更高的 AI 周期额度。具体额度、周期和价格可能调整，请以页面当时显示的信息为准。下方套餐卡是界面示意，用来说明三档套餐怎样排列，不应把示例数字当成长期承诺。

论文库搜索、期刊库搜索和文献管理不消耗 AI 周期额度。智能搜论文、智能助手、智能写作、智能审稿，以及绘图、翻译等 AI 功能，共享同一份 AI 周期额度。价格页中的“约 N 次”只是按常见任务估算，不是固定可调用次数。额度数字只以 AI 周期额度页和结算页为准。`,
        embeds: [{ id: "membership-plans" }],
        blocks: [
          { type: "markdown" },
          { type: "embeds" },
          {
            type: "article-link",
            card: {
              articleSlug: "ai-usage-quota",
              title: "AI 周期额度与“约 N 次”怎样理解",
              description:
                "了解额度池、算力点、恢复周期和不同任务实际消耗为何会有差异。",
              icon: "sparkles",
            },
          },
        ],
      },
      {
        id: "home-surfaces",
        title: "首页怎样组织这些入口",
        markdown: `首页把智能助手作为主入口，并用六段产品故事依次介绍学术搜索、智能助手、智能写作、智能审稿、我的资源和学术工具。故事区中的界面画面是产品说明，不是可以直接操作的工作台。进入对应页面后，才能开始真实任务。

左侧功能轨可以固定、隐藏、重命名和恢复入口，并会保留最多四个常用功能。新手引导只负责指出页面结构，不会替用户创建搜索、写作或审稿任务。`,
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
      "frontend-user/src/app/layouts/topnav/PromoNavButton.tsx",
      "frontend-user/src/app/layouts/topnav/UserSection.tsx",
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
        blocks: [
          { type: "markdown" },
          { type: "embeds" },
          {
            type: "tip",
            tip: {
              text: "付款前同时核对购买动作、月付或年付、到期日变化与应付金额。页面没有展示的组合表示当前账户不能执行，不要根据旧截图自行推算。",
            },
          },
          {
            type: "article-link",
            card: {
              articleSlug: "subscription-lifecycle",
              sectionId: "matrix",
              title: "为什么不同账户看到的购买选项不同",
              description:
                "查看 Free、Pro 月付、Pro 年付、Max 月付与 Max 年付各自允许的新购、续费和升级组合。",
              icon: "compass",
            },
          },
        ],
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
        markdown: `套餐价和结算窗口决定订单实付金额。活动开启且当前账户不是付费会员时，顶栏会显示活动按钮；点击后打开与自动活动相同的推广弹窗。弹窗文案、二维码和展示时机来自活动配置，但按钮本身不发放会员，也不会改变账户权益。

邀请活动则是在完成有效邀请或受邀用户首次合格付费后发放科研经费，奖励会进入邀请记录和钱包流水，不会在下单前直接抵扣。活动会随运营配置启停；页面没有显示时，不要按旧截图或海报中的数字理解当前优惠。弹窗里的“今日不再弹出”只抑制当天的自动弹窗，不会关闭活动，也不会领取权益。`,
        embeds: [{ id: "promo-modal" }],
        blocks: [
          { type: "markdown" },
          { type: "embeds" },
          {
            type: "tip",
            tip: {
              text: "活动弹窗、邀请奖励和订单报价是三件事：只有结算窗口里的应付金额决定本单支付；邀请奖励在符合当期规则后进入科研经费，不在下单前抵扣。",
            },
          },
          {
            type: "article-link",
            card: {
              articleSlug: "invitation-rebate-guide",
              sectionId: "current-rebate",
              title: "邀请返利何时进入科研经费",
              description:
                "继续核对邀请关系、合格首单、退款和隐私展示规则，不把旧海报当作当前活动承诺。",
              icon: "resource",
            },
          },
          {
            type: "next-steps",
            group: {
              title: "付款前后继续核对",
              description:
                "根据当前是在比较方案、准备付款，还是已经完成支付，选择对应的下一步。",
              items: [
                {
                  articleSlug: "subscription-lifecycle",
                  sectionId: "quote",
                  title: "核对升级、续费与到期日",
                  description:
                    "确认结算页显示的目标档位、计费周期、到期日变化和本次应付金额。",
                  icon: "review",
                },
                {
                  articleSlug: "payment-orders",
                  sectionId: "quote",
                  title: "查看订单与支付记录",
                  description:
                    "了解订单报价、支付状态，以及桌面端和移动端可以查看的记录。",
                  icon: "search",
                },
                {
                  articleSlug: "invitation-rebate-guide",
                  sectionId: "binding-rules",
                  title: "确认邀请关系是否成立",
                  description:
                    "先核对绑定资格，再判断后续首单是否可能触发当期邀请奖励。",
                  icon: "compass",
                },
              ],
            },
          },
        ],
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
      "frontend-user/src/features/auth/components/ClaimInviteDialog.tsx",
      "frontend-user/src/features/auth/hooks/useInviteFilled.ts",
      "frontend-user/src/app/InviteFlowController.tsx",
      "frontend-user/src/app/layouts/topnav/ClaimInviteNavButton.tsx",
      "frontend-user/src/stores/claim-invite.store.ts",
      "backend/internal/invite/model.go",
      "backend/internal/invite/service.go",
      "backend/internal/invite/campaign_bind.go",
      "docker/mysql/migrations/0117_invite_campaign.sql",
    ],
    related: ["invite-campaign", "wallet-payg", "membership"],
    sections: [
      {
        id: "invite-hub",
        title: "顶栏邀请 Hub 的三种场景",
        markdown: `活动开放且邀请状态读取完成后，顶栏邀请 Hub 会在“填写邀请码”“推广有好礼”“获取邀请码”三张提示之间轮播；每张停留约 5 秒，鼠标悬停或弹窗打开时暂停，也可以手动切换。已经填写过邀请码的账户只保留“推广有好礼”，不会再出现补录入口。

点击 Hub 后进入同一个三场景弹窗：填写场景校验并绑定邀请码；获取场景展示客服二维码和社交渠道；推广场景展示自己的链接、邀请码与二维码。未登录用户填写的有效邀请码会暂存到注册流程，登录用户则直接提交绑定。场景入口是否出现仍取决于活动开关、登录状态和绑定资格。`,
        embeds: [{ id: "invite-nav-hub" }],
      },
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
        blocks: [
          { type: "markdown" },
          { type: "embeds" },
          {
            type: "tip",
            tip: {
              text: "绑定前先核对邀请码或邀请人。邀请关系一旦建立不能改绑；跳过邀请码不影响注册，但之后能否补录要以当期页面提醒和资格校验为准。",
            },
          },
          {
            type: "article-link",
            card: {
              articleSlug: "invite-campaign",
              sectionId: "binding",
              title: "邀请关系的完整资格规则",
              description:
                "了解一次绑定、自邀限制、注册后期限、旧账户确认，以及绑定失败与注册结果之间的边界。",
              icon: "book-open",
            },
          },
        ],
      },
      {
        id: "current-rebate",
        title: "返利什么时候到账",
        markdown: `受邀好友在活动规定时间内完成首笔符合条件的实付后，邀请人会按邀请页显示的比例获得等值科研经费。活动关闭时不再显示可用奖励，因此 Wiki 不固定写某个百分比，也不要把旧海报里的数字当作当前规则。

测试支付和已经全额退款的订单不计返利；发生部分退款时，已经发放的返利也会按比例扣回。邀请记录里只会显示经过隐藏处理的好友联系方式。`,
        blocks: [
          { type: "markdown" },
          {
            type: "next-steps",
            group: {
              title: "绑定或返利发生后",
              description: "邀请关系、奖励到账和退款调整分别有自己的记录入口。",
              items: [
                {
                  articleSlug: "wallet-payg",
                  sectionId: "balance",
                  title: "查看科研经费与流水",
                  description:
                    "确认奖励是否已经进入经费余额，并通过逐笔流水区分奖励、充值与调整。",
                  icon: "resource",
                },
                {
                  articleSlug: "invite-campaign",
                  sectionId: "rewards",
                  title: "理解奖励与退款调整",
                  description:
                    "查看合格首单、部分退款反冲以及余额不足时的记录规则。",
                  icon: "review",
                },
              ],
            },
          },
        ],
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
      "frontend-user/src/features/auth/components/AuthDialog.tsx",
      "frontend-user/src/features/auth/components/MobileAuthSheet.tsx",
      "frontend-user/src/features/auth/components/OAuthRow.tsx",
      "frontend-user/src/features/auth/components/OAuthConfirmPanel.tsx",
      "frontend-user/src/features/auth/components/InvitationCodeField.tsx",
      "frontend-user/src/features/auth/components/oauth-flow.ts",
      "frontend-user/src/features/auth/pages/OAuthCallbackPage.tsx",
      "frontend-user/src/features/auth/pages/OAuthCallbackPage.invite.test.tsx",
      "frontend-user/src/features/auth/pages/mobile/MobileAuthPage.tsx",
      "frontend-user/src/features/auth/api/auth.ts",
      "frontend-user/src/shared/api/public-config.ts",
      "backend/internal/user/handler.go",
      "backend/internal/user/service_auth.go",
      "backend/internal/user/discourse_sso.go",
      "backend/internal/user/apple_oauth.go",
      "backend/internal/common/cache/oauth_login_code.go",
      "backend/cmd/server/routes_user.go",
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
        id: "oauth-confirmation",
        title: "第三方授权前的确认层",
        markdown: `选择一个第三方登录提供方后，桌面登录窗口不会立即离站，而是先放大显示所选提供方，并再次提供邀请码输入框；确认“前往授权”后才启动 OAuth。微信也先经过这层确认，随后才显示二维码；返回按钮可以改选其他方式。手机授权表同样保留确认层，但不提供桌面微信扫码。

这套确认交互目前按**产品演示阶段**记录：界面与邀请码暂存逻辑已经存在，真实部署仍需逐个提供方验证回调、邀请归因和账户合并链路，不能仅凭确认面板认定所有提供方都已完成交付。`,
        embeds: [{ id: "oauth-confirm" }],
      },
      {
        id: "email-and-phone",
        title: "手机号与邮箱",
        markdown: `在登录窗口中，你可以切换手机号或邮箱，并选择密码或 6 位验证码。下图展示的是常见登录状态；实际可见入口会随当前部署配置变化。

如果你用验证码登录一个尚未注册的邮箱，验证通过后系统会自动创建账户并直接登录。这个新账户暂时没有密码，可以稍后到“账户安全”中设置。使用“忘记密码”时则不会自动创建新账户。`,
        embeds: [{ id: "auth-dialog" }],
        blocks: [
          { type: "markdown" },
          { type: "embeds" },
          {
            type: "tip",
            tip: {
              text: "如果目标是找回已有账户，请使用“忘记密码”。用验证码登录一个未注册邮箱会创建新账户，并不是密码找回。",
            },
          },
          {
            type: "article-link",
            card: {
              articleSlug: "email-phone-authentication",
              sectionId: "recovery",
              title: "邮箱与手机号的注册、登录和找回边界",
              description:
                "查看验证码登录、注册和密码重置各自需要的信息与页面状态。",
              icon: "book-open",
            },
          },
        ],
      },
      {
        id: "wechat",
        title: "微信登录按终端区分",
        markdown: `桌面端启用微信登录后，点击微信图标会出现二维码。下图只展示等待扫码登录的状态；请用手机微信扫码，并在手机上完成确认。二维码失效时，按页面提示刷新。

手机网页不会显示这个扫码入口，因为同一部手机无法扫描自己的屏幕。此时请使用手机号、邮箱或页面上其他可见方式。微信小程序有独立登录流程，也不需要扫描桌面二维码。`,
        embeds: [{ id: "wechat-qr-login" }],
        blocks: [
          { type: "markdown" },
          { type: "embeds" },
          {
            type: "tip",
            tip: {
              text: "只扫描自己刚在 Scholay 登录窗口发起的二维码，并在手机端核对授权页面。二维码失效后回到原窗口刷新，不要转发二维码。",
            },
          },
        ],
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

第三方平台返回的邮箱如果已经对应一个 Scholay 账户，页面可能要求你确认是否合并。请按页面提示验证原账户，不要为了跳过确认再注册一个重复账户。需要注意的是，Google 目前可用于登录，但账户设置里的“新绑定 Google”仍未接通。

Apple 后端已改为用 90 秒、一次性消费的 \`login_code\` 交换登录结果，避免把 JWT 放进回调 URL；但当前运行时 \`OAuthCallbackPage\` 仍读取旧的 \`token\` 参数，只有测试描述了交换流程。因此 Apple 新回调链路尚未完成前端接线，属于实验性集成，不能写成端到端已交付。`,
        embeds: [
          { id: "oauth-callback-states" },
          { id: "wechat-callback-state" },
        ],
        blocks: [
          { type: "markdown" },
          { type: "embeds" },
          {
            type: "tip",
            tip: {
              text: "出现账户合并确认时，先核对第三方平台、第三方邮箱和目标 Scholay 账户，再验证原账户；不要只凭邮箱相同就默认它们属于同一身份。",
            },
          },
          {
            type: "article-link",
            card: {
              articleSlug: "oauth-account-merge",
              sectionId: "why",
              title: "为什么第三方邮箱相同也不会自动合并",
              description:
                "了解一次性确认凭据、原账户验证，以及合并与创建独立账户的安全边界。",
              icon: "review",
            },
          },
          {
            type: "next-steps",
            group: {
              title: "选择并维护登录方式",
              description:
                "先选能完成当前登录的入口，登录后再维护备用方式或处理身份冲突。",
              items: [
                {
                  articleSlug: "email-phone-authentication",
                  sectionId: "entry-and-methods",
                  title: "使用邮箱或手机号登录",
                  description:
                    "在第三方入口不可见或移动端不能扫码时，改用密码或验证码完成登录。",
                  icon: "compass",
                },
                {
                  articleSlug: "oauth-wechat-login",
                  sectionId: "providers",
                  title: "理解 OAuth 与微信扫码流程",
                  description:
                    "区分动态提供方、桌面二维码和普通 OAuth 授权返回状态。",
                  icon: "book-open",
                },
                {
                  articleSlug: "account-connections",
                  sectionId: "list",
                  title: "登录后检查账户连接",
                  description:
                    "查看哪些方式已经绑定，以及哪些方式只能登录、暂时不能从设置中新增。",
                  icon: "review",
                },
              ],
            },
          },
        ],
      },
    ],
  },
  {
    slug: "academic-intelligence-interface-guide",
    title: "scholay 情报界面导览",
    summary:
      "从 scholay 情报列表按时间、热度与版块发现内容，再进入详情核对正文、来源、可信度说明和相关情报。",
    category: "knowledge",
    kind: "page",
    status: "current",
    audience: ["所有访客", "研究者", "学生"],
    aliases: [
      "scholay 情报",
      "学术资讯界面",
      "情报列表",
      "顶刊速递",
      "科研政策",
    ],
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
        markdown: `进入 scholay 情报后，正文区域先显示文章列表。“最新”按发布时间浏览近期内容，“最热”按热度信号排序；切换后列表会重新读取相应结果。每次加载一页，点击底部“加载更多”即可继续追加。加载中、请求失败和暂无情报都有独立提示，不会把旧列表伪装成新的筛选结果。`,
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
      "区分“我的资源”、scholay广场与公开内容中心，并说明文献区共用工作区的边界。",
    category: "knowledge",
    kind: "overview",
    status: "current",
    audience: ["研究者", "学生", "内容使用者"],
    aliases: ["资源入口", "我的资源", "文件夹", "scholay广场", "学术资源中心"],
    sourcePaths: [
      "frontend-user/src/app/menus.ts",
      "frontend-user/src/features/library/routes.tsx",
      "frontend-user/src/features/library/pages/LibraryPage.tsx",
      "frontend-user/src/stores/search-right-panel.store.ts",
      "frontend-user/src/features/search/components/workspace/PdfChatPanel.tsx",
      "frontend-user/src/features/search/components/workspace/CitationGraphPanel.tsx",
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
        markdown: `**我的资源**是登录用户的个人工作区，包含文献、期刊、稿件和资源；**scholay广场**是学术工具、学术skills和学术prompts的发现入口；数据集搜索与 scholay 情报位于“学术搜索”。**学术资源中心**与**产品博客**是公开长文内容页。它们分别保存个人资料、发现能力与信息、阅读发布内容，数据不会因为同属“资源”就自动互通。`,
        embeds: [
          { id: "literature-library" },
          { id: "feature-plaza" },
          { id: "resource-center" },
        ],
      },
      {
        id: "folders",
        title: "我的资源：四类资料，一个文献工作区",
        markdown: `未登录访问 \`/library\` 会看到登录引导；登录后可以在文献、期刊、稿件和资源四个分区间切换。文献分区保留单层文件夹、收藏、搜索、排序、在线搜索加入和本地 PDF 上传；Zotero 和 EndNote 导入仍是 ComingSoon 占位，不能写成已支持。

只有文献分区共用右侧工作区：PDF Chat、文献图谱和矩阵分析是互斥的功能页签，另有最多 12 个论文或期刊信息页签。切到期刊、稿件或资源不会把这些分析能力扩展到对应资料类型。文献图谱面板当前使用前端演示数据，应按实验性交互理解；PDF Chat 与矩阵仍需遵守各自的数据、额度和处理边界。

文件夹和单篇论文都可以生成分享链接。接收者可以公开预览；开启提取码时，需要先验证提取码。登录用户还可以把允许接收的内容转存到自己的默认文件夹。`,
      },
      {
        id: "playground",
        title: "scholay广场：发现工具与信息",
        markdown: `\`/tools\` 以功能 Hub 组织学术工具、学术skills和学术prompts；数据集搜索与 scholay 情报虽然也使用 \`/tools/*\` 路径，但导航归属“学术搜索”。社区技能可在学术skills入口浏览、上传和安装。工具目录支持分类、价格、访问形式、开源状态、关键词、排序和分页，详情可以指向外部网站或下载资源。外部工具由各自提供者负责，条目收录不等于 Scholay 对安全性、效果或持续可用性作保证。`,
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
      "frontend-user/src/features/landing/pages/SubmitLandingPage.tsx",
      "frontend-user/src/features/wiki/content/foundations.ts",
      "frontend-user/src/features/wiki/content/infrastructure.ts",
      "frontend-user/src/features/claw/components/chat/TemplateCards.tsx",
      "frontend-user/src/features/settings/pages/MembershipPage.tsx",
      "frontend-user/src/features/library/components/library-import-dialog/types.ts",
      "frontend-user/src/features/browser/components/paper-detail/PaperFooter.tsx",
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
        markdown: `Scholay 词条的打开方式表把原生移动 App 和电脑软件标为“规划中”，但没有给出日期或功能范围。当前界面还出现“更多创作模板陆续加入”、任务中心与签到“即将上线”、Zotero/EndNote 导入 ComingSoon、研究论坛即将上线等提示。它们只能证明入口或文案被预留，不能证明已经进入某个迭代，也不能承诺奖励、数据模型或最终交互。`,
        table: {
          columns: [
            { key: "item", header: "项目" },
            { key: "evidence", header: "当前证据" },
            { key: "safeStatus", header: "可安全表述" },
          ],
          rows: [
            {
              item: "移动 App / Desktop App",
              evidence: "打开方式表标为规划中",
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
            {
              item: "智能投稿",
              evidence: "功能介绍页存在，但主按钮当前进入智能审稿",
              safeStatus: "宣传性入口；不能据此认定期刊代投与状态追踪已交付",
            },
          ],
        },
      },
      {
        id: "stale-documents",
        title: "旧交互稿不是未来计划",
        markdown: `旧交互稿和研究目录已经从仓库移除。它们曾把智能写作、智能助手、工具广场或智能审稿写成 ComingSoon，而当前路由和服务已经实现这些功能。历史材料不能否定当前实现，也不能被当成新的开发计划。`,
      },
      {
        id: "verification-rule",
        title: "发布前如何更新状态",
        markdown: `只有同时出现当前路由或客户端入口、可执行后端服务与权限/配置，以及必要测试或可验收行为时，Wiki 才应把功能改为 current。只有 UI 文案或预留枚举时保持 planned 或 historical，并明确“无日期、无承诺”。后续若形成正式路线图，应至少补充负责人、目标版本、范围、依赖、验收条件和变更记录，再由产品负责人确认对外口径。`,
      },
    ],
  },
];
