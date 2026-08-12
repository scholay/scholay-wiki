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
        markdown: `版本 0.0.80 仓库中的 seed/fallback 配置为 Pro 月付 ¥59、年付 ¥590，Max 月付 ¥269、年付 ¥2690。它不是生产租户实时价格；所有价格与“最受欢迎”档位都可由管理员配置，购买时必须以后端 quote 为准。`,
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
        markdown: `前端套餐卡用于比较档位价值，底部结算金额必须来自后端 quote。升级补差是一次性金额，不能误标为每月或每年价格；支付时还会复核被冻结的升级定价基准。每个用户同一时刻只保留一个有效 pending 订阅单；新建单会清理本用户超过 2 小时的 pending，全局清理默认 24 小时。其他操作延长到期日时，在途 upgrade 单会失效。`,
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
      "frontend-user/src/shared/lib/quota-overview.ts",
      "frontend-user/src/shared/components/QuotaNotifier.tsx",
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
        markdown: `仓库 seed/fallback 默认 Free 为每周期 300 算力点，Pro 是 Free 的 20 倍，即 6,000 点；Max 是 Pro 的 5 倍，即 30,000 点。生产值由后台动态配置；小于零的档位上限表示不限额，但收费启用时 Free 基准和周期天数不能为零。用户接口只展示百分比和窗口时间，不下发内部微元上限。`,
        embeds: [{ id: "account-assets" }],
      },
      {
        id: "accounting",
        title: "消耗与恢复",
        markdown: `额度按模型真实成本统一记账，而不是按消息条数。自然到期会恢复；实际升档，以及满足最低授予时长的兑换码或管理员授予，才按各自规则触发“满血”，并非任何权益变化都会重置。手动重置只在额度耗尽后消费最早到期的“重置次数”，不能直接用经费补足。Redis 短暂不可用时系统使用有界降级计数，但需要权威状态的重置会拒绝执行。`,
        embeds: [{ id: "billing-overview-usage" }],
      },
      {
        id: "concurrency",
        title: "并发请求边界",
        markdown: `额度门禁只发生在每个 AI 回合开始前，模型结束后才按真实成本记账；单轮或多个并发回合都可能跨过 100%，系统不会在生成中途硬切断。最终成本仍会记录，因此额度不是严格的并发事务上限，用户不应依靠并发请求规避额度。`,
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
        markdown: `经费是独立于会员的永久余额，来源包括充值、兑换码、活动奖励和管理员调账。临时经费已经退休，订阅也不再自动赠送经费。余额以可表达小数的精度保存，并留下逐笔流水。`,
        embeds: [{ id: "account-assets" }],
      },
      {
        id: "rate",
        title: "当前默认兑换率",
        markdown: `默认 ¥1 充值 100 经费，1 经费对应 3 算力点，因此 ¥1 可兑换 300 算力点；最低充值金额默认 ¥10。兑换率与最低金额可配置，并有后端校验确保按量付费不会比买满额套餐更便宜。`,
        embeds: [{ id: "wallet-recharge" }],
      },
      {
        id: "autopay",
        title: "何时扣经费",
        markdown: `“用经费继续”默认关闭，必须由用户显式开启。跨过周期上限的一轮只对 included ceiling 之外的部分收费，不会把整轮重复扣款；未开启时该轮溢出由平台承担，下一轮才拦截。起跑门禁只检查余额是否大于 0，因此余额为正但不足以覆盖整轮时，异步结算可能产生不超过在途回合成本量级的小额负数。开启开关不会预扣，也不会降低模型等级或速度。`,
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
        markdown: `活动由后台单独启停。关闭时不生成新邀请码、入口隐藏或显示未开启状态，公开接口也不会泄露未上线的奖励数值。奖励金额、每日计奖人数上限、绑定窗口和首单返利都以当期公开配置为准。`,
        embeds: [{ id: "invite-share" }],
      },
      {
        id: "binding",
        title: "邀请关系",
        markdown: `新邀请码为 8 位、排除易混字符；历史 6 位码仍可兼容。受邀用户只能绑定一次，不能自邀，邀请人账户必须早于受邀人，并且必须在配置的注册后绑定窗口内完成。注册时的邀请码是选填项，先经公开预览接口校验，再保存为候选码；新账户注册成功后才尝试自动关联。注册请求头绑定在注册事务提交后 best-effort 执行，绑定失败不会回滚新账户。

新账户没有候选码时，只有当活动开启且当前配置确实提供受邀礼，才会出现一次补录提醒；用户可以暂不填写，也可以进入“邀请好友”页确认。旧账号从邀请链接进入时不会静默归因，而是带着候选码前往邀请页由本人明确确认。落地链接和账户内手动绑定最终进入同一资格规则。`,
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
