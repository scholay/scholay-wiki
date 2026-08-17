import type { WikiArticle } from "../types";

export const membershipArticles: WikiArticle[] = [
  {
    slug: "membership",
    title: "会员体系",
    summary:
      "Free、Pro、Max 三档共享核心功能，以周期 AI 额度、价格和可购买权益区分。",
    category: "membership",
    kind: "overview",
    status: "current",
    audience: ["所有用户", "管理员"],
    aliases: ["VIP", "订阅", "套餐", "Free Pro Max"],
    sourcePaths: [
      "frontend-user/src/features/landing/pages/PricingPage.tsx",
      "frontend-user/src/features/settings/pages/MembershipPage.tsx",
      "frontend-user/src/features/settings/pages/mobile/MobileBillingPage.tsx",
      "frontend-user/src/features/wiki/embeds/WikiEmbedMembershipPlans.tsx",
      "backend/internal/vip/config.go",
      "backend/internal/vip/billing_model.go",
    ],
    related: [
      "subscription-lifecycle",
      "ai-usage-quota",
      "wallet-payg",
      "invite-campaign",
    ],
    sections: [
      {
        id: "tiers",
        title: "三个档位",
        markdown: `等级顺序固定为 free < pro < max。Free 是账户默认档；Pro 与 Max 提供更高的周期 AI 额度，Max 的额度基于 Pro 再放大。发放权益不会把已有用户降级；历史无到期日记录兼容为永久会员。文献收藏等非 AI 基础能力不应因为额度耗尽而停止。营销页提到的服务优先级没有在本轮后端审计中发现独立的技术保障。`,
      },
      {
        id: "pricing",
        title: "当前默认价格",
        markdown: `在会员页切换月付或年付，可以并排比较 Free、Pro 和 Max 的额度与权益，再从套餐卡进入购买。下图展示默认年付视图：卡片主价是年付总额折算的月均价，实际一次支付金额见卡片说明；切到月付后才显示单月价。0.0.80 版本的默认价格为 Pro 月付 ¥59、年付 ¥590，Max 月付 ¥269、年付 ¥2690。

这些价格和“最受欢迎”标记都可以调整，最终应以你进入结算页时看到的报价为准。`,
        embeds: [{ id: "membership-plans" }],
      },
      {
        id: "renewal",
        title: "续费方式",
        markdown: `会员不会自动续费。用户主动选择月付或年付并完成支付后生效；订阅本身不再额外赠送经费，周期额度和经费钱包是两套不同权益。`,
      },
    ],
  },
  {
    slug: "subscription-lifecycle",
    title: "会员购买、升级与续费规则",
    summary: "五种当前会员场景对应的合法购买组合、计价动作与到期日变化。",
    category: "membership",
    kind: "rule",
    status: "current",
    audience: ["购买会员的用户", "客服", "管理员"],
    aliases: ["升级规则", "续费规则", "年付规则", "补差价"],
    sourcePaths: [
      "frontend-user/src/shared/lib/membership-options.ts",
      "frontend-user/src/shared/components/membership-action-dialog.tsx",
      "backend/internal/vip/order.go",
      "backend/internal/vip/subscription_matrix_test.go",
    ],
    related: ["membership", "wallet-payg", "payment-orders"],
    sections: [
      {
        id: "matrix",
        title: "合法选项矩阵",
        markdown: `- Free：可新购 Pro 或 Max，并选择开放的月付/年付。
- Pro 月付：可升 Max 月付或 Max 年付，也可续 Pro 月付/年付。
- Pro 年付：可升 Max，但升级按年费基准补差；只能续 Pro 年付。
- Max 月付：已无更高档，可续 Max 月付/年付。
- Max 年付：只能续 Max 年付。

降级不属于购买流程，后端会拒绝。年费会员也不能通过一次月付续费把周期改回月度。`,
      },
      {
        id: "actions",
        title: "四种计价动作",
        markdown: `**new** 是首次购买完整周期；**renew** 在现有到期日后叠加一个自然月或自然年；**upgrade** 对剩余有效期补档位差价、到期日不变、不得改变当前周期且最低收费 1 分；**switch** 供月费会员升档并转年付，收目标档整年价，在原到期日后叠加一年。自然月和自然年使用 no-overflow 算术，月末会钳到目标月的最后一天。`,
      },
      {
        id: "quote",
        title: "报价与支付",
        markdown: `选择套餐后，结算页会列出当前会员、目标档位、计费周期、到期日变化、支付方式和本次应付金额。确认这些信息后再付款；下图展示的是 Pro 月付升级 Max 时按剩余天数补差的示例，图中金额不是你的实时报价。

升级补差是一次性金额，不是新的月价或年价；付款时还会再次核对生成报价时的升级基准。每位用户同一时间只保留一笔有效的待支付订阅单；超过 2 小时的个人待支付单会在新建订单时清理，系统还会按默认 24 小时做全局清理。若其他操作已延长到期日，原先等待支付的升级单会失效，需要重新报价。`,
        embeds: [{ id: "subscription-checkout" }],
      },
    ],
  },
  {
    slug: "ai-usage-quota",
    title: "AI 周期额度",
    summary: "所有 AI 功能共享的成本额度，以首次真实消耗为锚点按周期自动恢复。",
    category: "membership",
    kind: "rule",
    status: "current",
    audience: ["AI 功能用户", "客服", "管理员"],
    aliases: ["AI 额度", "算力点", "七天额度", "Quota"],
    sourcePaths: [
      "backend/internal/vip/quota.go",
      "backend/internal/vip/config.go",
      "backend/internal/agentbridge/spec.go",
      "backend/internal/agentbridge/hub.go",
      "backend/internal/agentbridge/hub_turncap_test.go",
      "frontend-user/src/shared/lib/quota-overview.ts",
      "frontend-user/src/shared/components/QuotaNotifier.tsx",
      "frontend-user/src/shared/components/RhinoMenuAssets.tsx",
      "frontend-user/src/shared/components/funds-reminder/FundsReminder.tsx",
      "frontend-user/src/stores/funds-reminder.store.ts",
      "frontend-user/src/features/claw/components/chat/ConversationWorkspace.tsx",
      "frontend-user/src/features/search/components/smart-search/SmartSearchPanel.tsx",
      "frontend-user/src/features/prism/components/PrismChatPanel.tsx",
    ],
    related: [
      "membership",
      "wallet-payg",
      "smart-search",
      "claw",
      "peer-review",
      "prism",
    ],
    sections: [
      {
        id: "window",
        title: "周期如何开始",
        markdown: `用户第一次发生真实 AI 消耗时才建立周期锚点。默认周期为 7 天；到期后读取时按满额处理，下一次真实消耗再开启新周期。因此从未使用或周期已经结束的账户会显示满额，而不是从登录或购买时开始倒计时。`,
      },
      {
        id: "amounts",
        title: "当前默认额度",
        markdown: `进入账户资产页，你会看到当前会员、剩余额度百分比、距离恢复的时间、经费余额和可用重置次数；额度条表示“还剩多少”，不是“已经用了多少”。下图中的数值只是界面示例。当前默认值为 Free 每周期 300 算力点，Pro 为 6,000 点，Max 为 30,000 点。

实际额度可以调整，页面以百分比和周期时间呈现；某档上限设为负数时表示不限额。收费开启时，Free 基准额度和周期天数不能为零。`,
        embeds: [{ id: "account-assets" }],
        blocks: [
          { type: "markdown" },
          { type: "embeds" },
          {
            type: "tip",
            tip: {
              text: "额度上限和周期可能调整。判断当前还能否使用、何时恢复时，以账户资产页当时显示的剩余百分比和恢复时间为准，不把示例数值当作长期承诺。",
            },
          },
          {
            type: "article-link",
            card: {
              articleSlug: "marketing-pages-and-implementation-boundaries",
              sectionId: "agent-status",
              title: "怎样读懂剩余额度与进度状态",
              description:
                "区分剩余百分比、恢复时间、任务进度和停止状态，避免把进度条当作完成证据。",
              icon: "sparkles",
            },
          },
        ],
      },
      {
        id: "accounting",
        title: "消耗与恢复",
        markdown: `在会员总览中，你可以查看额度条、恢复时间、近期流水和用量日历；下图展示的是有剩余额度和账户流水时的代表状态。额度按模型的实际成本计算，不按消息条数计算。

周期到期会自然恢复；实际升档，以及满足最短授予时长的兑换码或管理员赠送，会按各自规则恢复额度，并非任何权益变化都会重置。手动重置只能在额度耗尽后使用最早到期的重置次数，经费不能直接换成一次重置。系统无法可靠确认额度时，会暂时拒绝重置以避免重复扣除次数。`,
        embeds: [{ id: "billing-overview-usage" }],
        blocks: [
          { type: "markdown" },
          { type: "embeds" },
          {
            type: "article-link",
            card: {
              articleSlug: "quota-block-and-recovery",
              sectionId: "recovery-actions",
              title: "额度耗尽后有哪些恢复方式",
              description:
                "了解一次重置、用经费继续和升级会员各自何时可用，以及被拦消息怎样保留。",
              icon: "compass",
            },
          },
        ],
      },
      {
        id: "reset-pass-lots",
        title: "重置次数的批次与到期日",
        markdown: `后端额度总览会按到期时间返回可用重置次数批次，牛犀犀资产菜单悬停时会逐批显示“张数 · 到期日”。真正执行重置仍优先消耗最早到期批次。

这项能力目前只完成了机器可读返回和牛犀犀菜单展示：前端公共类型只保留张数与到期时间，没有呈现后端的来源字段；设置页仍主要显示总数和最近到期日。因此“设置页完整批次明细”属于进行中的界面补全，不能写成已经全站一致交付。`,
      },
      {
        id: "funds-reminder",
        title: "经费不足提醒与四类出口",
        markdown: `Claw、智能搜论文和 Prism 在输入框上方使用就地提醒；其他页面可以打开全局对话框。提醒会根据会员、经费、自动续用和重置次数条件，从四类出口中给出可用动作，而不是始终同时显示四个按钮：有重置次数时可“立即恢复”；Free 可“升级会员”，Pro 可“升级 Max”；付费会员有余额但尚未开启时可“用经费继续”；需要补充余额时可“充值经费”。Max 没有更高档升级按钮。

标题会按账户资产显示“额度已用完”或“经费不足”。选择动作只完成相应的重置、开启续用或打开购买/充值流程；原任务是否自动恢复要以所在功能的发送状态为准。`,
        embeds: [{ id: "funds-reminder" }],
      },
      {
        id: "concurrency",
        title: "回合成本上限与并发边界",
        markdown: `每个 AI 回合开始前仍会经过额度门禁；进入回合后，Claw、智能搜论文、Prism、科研绘图、数据分析和 Boltslides 会按执行器上报的每次模型调用增量成本累计本轮用量。达到动态 TurnCostCap 时，桥接层只发送一次停止生成命令，并把该回合标为 aborted；已经生成的内容会保留，所以单个回答确实可能在中途停止。

TurnCostCap 由当前周期剩余额度、允许续用的经费能力和安全下限共同确定。未知模型、旧执行器未上报用量或无法计算价格时会 fail-open，最终真实成本仍照常记账，因此它是过冲保护而非严格事务上限。智能审稿为了完成整套任务，不使用这一回合内硬停机制，而是依赖自己的起跑门禁。多个并发回合仍可能各自持有在途预算，用户不应依靠并发请求规避额度。`,
        blocks: [
          { type: "markdown" },
          {
            type: "tip",
            tip: {
              text: "不要用并发请求测试或绕过额度。TurnCostCap 会尽力限制单轮过冲，但最终仍按真实成本记账；看到“已停止”时先保留完成内容，再检查资产与恢复入口。",
            },
          },
          {
            type: "next-steps",
            group: {
              title: "额度不足时",
              description: "先保留当前任务，再根据已有资产选择恢复方式。",
              items: [
                {
                  articleSlug: "quota-block-and-recovery",
                  sectionId: "blocked-message",
                  title: "恢复被拦下的 AI 任务",
                  description:
                    "确认消息是否真正发送，再选择重置、经费续用或升级会员。",
                  icon: "compass",
                },
                {
                  articleSlug: "wallet-payg",
                  sectionId: "autopay",
                  title: "了解“用经费继续”",
                  description:
                    "核对开关、实际成本结算与经费流水，再决定是否按量续用。",
                  icon: "resource",
                },
              ],
            },
          },
        ],
      },
    ],
  },
  {
    slug: "wallet-payg",
    title: "经费钱包与按量付费",
    summary:
      "充值或活动获得的永久经费，可在周期额度耗尽后按真实成本继续使用 AI。",
    category: "membership",
    kind: "rule",
    status: "current",
    audience: ["AI 功能用户", "管理员"],
    aliases: ["科研经费", "钱包", "充值", "用经费继续", "Pay as you go"],
    sourcePaths: [
      "backend/internal/vip/wallet.go",
      "backend/internal/vip/quota.go",
      "backend/internal/agentbridge/hub.go",
      "backend/internal/vip/billing_model.go",
      "backend/internal/vip/config.go",
      "frontend-user/src/features/settings/components/account-assets-card.tsx",
      "frontend-user/src/features/landing/pages/PricingPage.tsx",
    ],
    related: [
      "ai-usage-quota",
      "membership",
      "payment-orders",
      "invite-campaign",
    ],
    sections: [
      {
        id: "balance",
        title: "经费是什么",
        markdown: `账户资产卡会把经费余额与会员周期额度分开显示，并提供“用经费继续”的开关；开关为绿色表示已允许在周期额度耗尽后按超出部分扣经费，这与使用重置次数是两条恢复路径。下图展示的是同时有额度、经费和重置次数的示例状态。经费来自充值、兑换码、活动奖励或管理员调账，余额支持小数、长期保留，并留下逐笔流水。

临时经费已经停止使用，订阅也不会自动赠送经费。`,
        embeds: [{ id: "account-assets" }],
        blocks: [
          { type: "markdown" },
          { type: "embeds" },
          {
            type: "article-link",
            card: {
              articleSlug: "ai-usage-quota",
              sectionId: "accounting",
              title: "科研经费与 AI 周期额度不是同一项权益",
              description:
                "周期额度会按规则恢复；科研经费长期保留，只在用户开启按量续用或发生其他钱包交易时变化。",
              icon: "sparkles",
            },
          },
        ],
      },
      {
        id: "rate",
        title: "当前默认兑换率",
        markdown: `在“经费充值”中选择预设金额或输入其他金额，再核对到账经费、支付方式和实付金额后提交；下图展示的是选择 ¥100 和微信支付的示例。默认 ¥1 充值 100 经费，1 经费对应 3 算力点，因此 ¥1 可兑换 300 算力点；最低充值金额默认 ¥10。

兑换率和最低金额可能调整，结算前请以页面显示为准；系统会限制价格，避免按量付费比购买同等套餐额度更便宜。`,
        embeds: [{ id: "wallet-recharge" }],
        blocks: [
          { type: "markdown" },
          { type: "embeds" },
          {
            type: "tip",
            tip: {
              text: "充值前只以当前结算窗口显示的实付金额、到账经费和支付方式为准。Wiki 与演示组件中的数字用于解释计算关系，不是固定报价。",
            },
          },
        ],
      },
      {
        id: "autopay",
        title: "何时扣经费",
        markdown: `“用经费继续”默认关闭，必须由用户显式开启。跨过周期上限的一轮只对 included ceiling 之外的部分收费，不会把整轮重复扣款；未开启时不能把经费作为后续回合预算。开启开关不会预扣，也不会降低模型等级或速度。

支持 TurnCostCap 的 Agent 会把可用经费能力计入本轮动态上限，并在累计估算成本达到上限时请求停止，以降低单轮透支；未知模型、旧执行器或并发在途回合仍可能无法被严格截断。最终以异步写入的钱包流水为准，不能把保护上限理解成预授权或绝不会出现小额负数的承诺。`,
        blocks: [
          { type: "markdown" },
          {
            type: "tip",
            tip: {
              text: "开启前先查看经费余额。开关不会预扣，实际成本在回合结束后写入流水；余额很低时，仍可能因在途回合结算出现小额负数。",
            },
          },
          {
            type: "next-steps",
            group: {
              title: "使用或补充科研经费",
              description:
                "根据当前是额度耗尽、准备充值，还是需要核对一笔交易继续操作。",
              items: [
                {
                  articleSlug: "quota-block-and-recovery",
                  sectionId: "recovery-actions",
                  title: "从被拦任务开启经费续用",
                  description:
                    "在保留原消息的前提下选择恢复方式，并在成功后重新发送任务。",
                  icon: "compass",
                },
                {
                  articleSlug: "payment-orders",
                  sectionId: "quote",
                  title: "核对充值订单",
                  description:
                    "查看充值报价、支付状态与订单记录，不用旧截图推算到账经费。",
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
    slug: "invite-campaign",
    title: "邀请有礼",
    summary:
      "由管理员启停和配置的邀请归因活动，可包含双方注册奖励与邀请人首单返利。",
    category: "membership",
    kind: "rule",
    status: "current",
    audience: ["登录用户", "新用户", "运营人员"],
    aliases: ["邀请好友", "邀请码", "注册奖励", "首单返利"],
    sourcePaths: [
      "backend/internal/invite/model.go",
      "backend/internal/invite/service.go",
      "backend/internal/invite/campaign_bind.go",
      "frontend-user/src/features/settings/pages/InvitePage.tsx",
      "frontend-user/src/features/settings/pages/mobile/MobileInvitePage.tsx",
      "frontend-user/src/features/landing/pages/InviteLandingPage.tsx",
      "frontend-user/src/features/auth/components/InviteAuthNotice.tsx",
      "frontend-user/src/features/auth/components/PostRegisterInviteDialog.tsx",
      "frontend-user/src/app/InviteFlowController.tsx",
    ],
    related: ["account", "wallet-payg", "membership"],
    sections: [
      {
        id: "availability",
        title: "活动开关与公开规则",
        markdown: `活动开启后，“邀请好友”页会显示你的 8 位邀请码、邀请链接、二维码和奖励统计，你可以直接复制或分享；下图展示的是分享信息已加载的状态。奖励金额、每日计奖人数上限、绑定期限和首单返利以页面当期公布的规则为准。

活动关闭时不会生成新邀请码，入口会隐藏或显示未开启，也不会提前展示未上线的奖励数值。`,
        embeds: [{ id: "invite-share" }],
      },
      {
        id: "binding",
        title: "邀请关系",
        markdown: `注册时邀请码可以不填。填写后，页面会先校验并显示候选码，注册成功后才尝试建立邀请关系。新账户没有候选码时，如果当期活动确实提供受邀礼，登录后会出现一次补录提醒；你可以暂不填写，也可以进入“邀请好友”页确认。下图展示的就是这条补录提醒。

新邀请码为 8 位并排除易混字符，历史 6 位码仍可使用。每位受邀用户只能绑定一次，不能邀请自己，邀请人账户必须更早创建，而且要在规定的注册后期限内完成。旧账号从邀请链接进入时也不会被自动归因，仍需本人确认。即使绑定失败，新账户注册本身也不会被撤销。`,
        embeds: [{ id: "invite-code-prompt" }],
      },
      {
        id: "rewards",
        title: "奖励与退款",
        markdown: `绑定时会快照奖励、窗口、返利比例和兑换率，之后修改活动配置不追溯已有关系。每日上限只限制邀请人的“计奖注册数”：超限时关系仍保存，但双方注册奖励不发。晚绑定会回看窗口内首笔合格实付；测试支付和已全退订单不计。关系、奖励、钱包和流水事务化写入；部分退款按累计退款比例反冲返利，并分别记录实际回收和余额不足的 shortfall。`,
      },
      {
        id: "privacy",
        title: "隐私",
        markdown: `邀请人查看注册明细时，被邀请人的姓名或邮箱在后端脱敏，原始联系方式和用户 ID 不下发。奖励数值可以展示，因为它属于查看者自己的钱包变化。`,
      },
    ],
  },
];
