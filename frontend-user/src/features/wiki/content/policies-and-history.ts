import type { WikiArticle } from "../types";

export const policyAndHistoryArticles: WikiArticle[] = [
  {
    slug: "service-policies",
    title: "服务政策与 AI 使用边界",
    summary:
      "隐私政策、服务条款和免责声明共同定义数据处理、用户责任与 AI 内容边界。",
    category: "policies",
    kind: "overview",
    status: "current",
    audience: ["所有用户"],
    aliases: ["隐私政策", "服务条款", "免责声明", "法律"],
    sourcePaths: [
      "frontend-user/src/features/help/pages/PrivacyPage.tsx",
      "frontend-user/src/features/help/pages/TermsPage.tsx",
      "frontend-user/src/features/help/pages/DisclaimerPage.tsx",
      "frontend-user/src/features/help/routes.tsx",
    ],
    related: ["scholay", "account", "feedback-and-support"],
    sections: [
      {
        id: "documents",
        title: "政策文件",
        markdown: `\`/privacy\` 说明个人信息与 Cookie 等数据处理，\`/terms\` 规定账户、内容、订阅和使用条件，\`/disclaimer\` 说明学术数据、第三方来源、AI 生成内容和服务可用性的限制。`,
      },
      {
        id: "ai",
        title: "AI 内容边界",
        markdown: `AI 回答、审稿意见、写作建议、统计结果和图形都属于研究辅助材料。用户负责核对来源、计算、知识产权、伦理和最终提交内容，不能把模型输出当作未经验证的学术结论。`,
      },
      {
        id: "version",
        title: "版本与效力",
        markdown: `Wiki 解释产品行为，但不替代正式政策页面。涉及权利义务时以当时页面展示并生效的政策文本为准。`,
      },
    ],
  },
  {
    slug: "feedback-and-support",
    title: "反馈与支持",
    summary: "用户提交问题、功能建议、内容纠错和合作请求的公开支持入口。",
    category: "policies",
    kind: "page",
    status: "current",
    audience: ["所有用户"],
    aliases: ["意见反馈", "联系我们", "客服"],
    sourcePaths: [
      "frontend-user/src/features/help/pages/FeedbackPage.tsx",
      "frontend-user/src/features/help/pages/ContactPage.tsx",
      "backend/internal/feedback",
      "backend/internal/supportcenter",
    ],
    related: ["service-policies", "scholay", "admin-console"],
    sections: [
      {
        id: "channels",
        title: "入口",
        markdown: `反馈页用于问题报告、功能建议和产品意见；联系页补充技术支持与商务合作方式。反馈可以包含分类、描述和附件，进入后台工单处理表面。`,
      },
      {
        id: "privacy",
        title: "提交前注意",
        markdown: `反馈材料可能被支持人员查看。不要上传不必要的敏感数据、未公开论文原稿或第三方机密；复现问题时优先提供去标识化信息。`,
      },
    ],
  },
  {
    slug: "promotion-banner",
    title: "站内推广活动",
    summary:
      "由后台启停的站内推广文案与二维码入口，关闭时不向用户泄露活动内容。",
    category: "membership",
    kind: "rule",
    status: "current",
    audience: ["所有用户", "运营人员"],
    aliases: ["推广弹窗", "活动二维码", "Promo"],
    sourcePaths: [
      "backend/internal/promo/model.go",
      "backend/internal/promo/service.go",
      "backend/internal/promo/handler.go",
      "frontend-user/src/stores/promo.store.ts",
    ],
    related: ["membership", "admin-console"],
    sections: [
      {
        id: "configuration",
        title: "配置",
        markdown: `推广活动使用单行后台配置控制启用状态、文案和微信二维码。公开摘要接口不包含大体积二维码数据，图片通过带内容版本的独立 URL 获取，替换图片后缓存地址也会变化。`,
      },
      {
        id: "closed",
        title: "关闭状态",
        markdown: `活动关闭时，公开接口只返回未启用状态，不返回二维码或内部文案；客户端也不应保留旧活动入口。推广活动与邀请奖励是两个独立配置域。Promo 目前只有展示和跳转，没有领取接口、资格判定或权益入账逻辑，扫码或点击本身不会给账户发会员或经费。`,
      },
    ],
  },
  {
    slug: "gift-codes",
    title: "兑换码与礼品权益",
    summary:
      "由运营或合作渠道发放、经预览确认后兑换会员或永久经费的可限次代码。",
    category: "membership",
    kind: "rule",
    status: "current",
    audience: ["登录用户", "运营人员"],
    aliases: ["礼品码", "兑换会员", "兑换经费"],
    sourcePaths: [
      "backend/internal/vip/code_batch.go",
      "backend/internal/vip/handler_code_batch.go",
      "frontend-user/src/features/admin/pages/VipCodesPage.tsx",
      "frontend-user/src/features/settings/components/redeem-confirm-dialog.tsx",
      "frontend-user/src/features/settings/components/billing-panels.tsx",
    ],
    related: ["membership", "wallet-payg", "admin-console"],
    sections: [
      {
        id: "preview",
        title: "先预览后确认",
        markdown: `用户输入代码后先向后端获取将获得的档位、期限或经费以及活动说明，再在确认弹窗中执行兑换。前端不能根据码的外观猜测权益。`,
      },
      {
        id: "grant",
        title: "发放规则",
        markdown: `新码使用排除易混字符的 \`XXXX-XXXX-XXXX-XXXX\` 格式。代码可以发会员或经费；同一用户对同一码只能成功兑换一次，但单码可配置 1–100 次总使用次数，供多人核销。失败会区分 revoked、expired、exhausted 和 already redeemed。会员码不会把用户降级，期限从当前有效到期日顺延；只有确实升档且授予时长至少覆盖一个额度周期时才触发额度满血。`,
      },
    ],
  },
  {
    slug: "marketing-pages-and-implementation-boundaries",
    title: "功能落地页与实装边界",
    summary:
      "Scholay 的功能介绍页面用于解释愿景和引导使用，不能替代对当前产品路由、限制与真实外部动作的核验。",
    category: "policies",
    kind: "page",
    status: "current",
    audience: ["所有访客", "产品运营", "内容编辑"],
    aliases: ["功能介绍", "营销页", "Landing Pages", "产品声明"],
    sourcePaths: [
      "frontend-user/src/features/landing/pages/FeaturesOverviewPage.tsx",
      "frontend-user/src/features/landing/pages/SearchLandingPage.tsx",
      "frontend-user/src/features/landing/pages/LibraryLandingPage.tsx",
      "frontend-user/src/features/landing/pages/PrismLandingPage.tsx",
      "frontend-user/src/features/landing/pages/ClawLandingPage.tsx",
      "frontend-user/src/features/landing/pages/SubmitLandingPage.tsx",
      "frontend-user/src/features/landing/pages/PeerReviewLandingPage.tsx",
      "frontend-user/src/features/landing/pages/PricingPage.tsx",
    ],
    related: [
      "product-map",
      "service-policies",
      "peer-review",
      "literature-library",
    ],
    sections: [
      {
        id: "routes",
        title: "页面入口",
        markdown: `\`/features\` 汇总产品能力；搜索、文库、Prism、Claw、投稿和同行评审各有独立 \`/features/*\` 介绍页，\`/pricing\` 展示套餐比较。它们不执行核心研究任务，CTA 会把用户带到真实工作区、注册或定价流程。`,
      },
      {
        id: "known-drift",
        title: "已知宣传漂移",
        markdown: `文库介绍中的多级目录、PDF 批注高亮、AI 标签、Zotero/EndNote 导入和平板同步尚未形成现行闭环；投稿页不向外部期刊发送稿件；同行评审是 AI 模拟，不是真人编辑部流程；Prism 没有已核实的多人实时协作入口；搜索页的语义图谱描述也不能替代当前 Auto、STC、OpenAlex、PubMed 行为。`,
      },
      {
        id: "numbers",
        title: "数字与语言声明",
        markdown: `Pricing 中的功能次数是静态估算，真实额度取决于动态 points、倍率、模型价格和计费开关。页面出现 English 或 Japanese 选择项不代表全站已经具备完整 i18n 资源与路由。Wiki 在冲突时以运行时代码和后端规则为准，并把愿景保留为营销语境。`,
      },
    ],
  },
  {
    slug: "coupon-system-legacy",
    title: "优惠券系统（遗留）",
    summary:
      "数据库基线仍保留优惠券表和订单字段，但现行产品没有发券、领券、核销或抵扣链路。",
    category: "history",
    kind: "legacy",
    status: "historical",
    audience: ["用户", "运营人员", "开发者"],
    aliases: ["优惠券", "Coupon", "折扣券", "券模板"],
    sourcePaths: [
      "docker/mysql/migrations/0001_baseline.sql",
      "docker/mysql/migrations/archive/DEPRECATED_TABLES.md",
      "backend/internal/vip/order.go",
    ],
    related: ["payment-orders", "gift-codes", "legacy-components"],
    sections: [
      {
        id: "current",
        title: "当前状态",
        markdown: `现行后端没有 coupon handler、service 或路由，订单报价与履约也不会读取 coupon_id。数据库基线里的 coupon_templates、coupon_batches、user_coupons、coupon_usage_logs 和订单关联字段属于搁置结构，不能据此宣传“可用优惠券”。`,
      },
      {
        id: "distinctions",
        title: "与其他活动区分",
        markdown: `兑换码会直接发会员或经费，邀请活动按归因发奖励，Promo 只展示营销二维码；三者都不是优惠券。若未来重启优惠券，需要重新建立用户入口、资格、计价、核销、退款反冲和审计规则。`,
      },
    ],
  },
  {
    slug: "task-center-and-checkin",
    title: "任务中心与签到",
    summary: "界面中仍有预告，但现行运行时代码和数据库已不提供的历史活动体系。",
    category: "history",
    kind: "legacy",
    status: "historical",
    audience: ["用户", "运营人员"],
    aliases: ["每日签到", "任务中心", "连续签到"],
    sourcePaths: [
      "frontend-user/src/features/settings/pages/MembershipPage.tsx",
      "docker/mysql/migrations/archive/0056_drop_stranded_marketing_tables.sql",
      "backend/internal/vip/billing_model.go",
    ],
    related: ["membership", "wallet-payg", "legacy-components"],
    sections: [
      {
        id: "current",
        title: "当前状态",
        markdown: `会员页面把任务中心标为“即将上线”，没有可执行签到按钮或现行业务处理器。旧的签到表、连续签到统计和历史奖励配置位于归档迁移，并已从当前运行表结构下线。`,
      },
      {
        id: "compatibility",
        title: "保留痕迹",
        markdown: `经费模型仍保留 \`task\` 来源常量，数据库基线的 feature_configs 也仍把 user_checkin 标为 enabled，但当前没有消费者、路由或现行签到表。这些孤立痕迹不能被解释为任务中心已经上线；本词条的“未来”只来自界面预告，并非已确认路线图。任何重启都必须重新定义迁移、服务和前端入口。`,
      },
    ],
  },
  {
    slug: "legacy-components",
    title: "已下线与兼容组件",
    summary:
      "理解旧 README、兼容重定向、归档迁移和仍保留字段时需要遵守的现行状态边界。",
    category: "history",
    kind: "legacy",
    status: "compatibility",
    audience: ["开发者", "支持人员"],
    aliases: ["旧版", "遗留模块", "兼容路径"],
    sourcePaths: [
      "CLAUDE.md",
      "README.md",
      "frontend-user/src/features/legacy-redirects/routes.tsx",
      "docker/mysql/migrations/archive",
    ],
    related: ["platform-topology", "admin-console", "task-center-and-checkin"],
    sections: [
      {
        id: "docs",
        title: "旧文档不能覆盖代码",
        markdown: `根 README 仍描述 React 18、独立后台前端、旧端口和旧迁移方式，这些内容已经过时。Wiki 以当前路由、Compose、模块和迁移为准，并只把旧资料当作历史解释。`,
      },
      {
        id: "redirects",
        title: "兼容路径",
        markdown: `旧 URL 通过前端重定向或 Nginx 规则指向现行页面。兼容路径存在不表示旧页面仍然维护；词条会把主 URL 与兼容别名分开。`,
      },
      {
        id: "data",
        title: "遗留数据",
        markdown: `明确的搁置对象包括旧 subscription_plans/user_subscriptions、payment_transactions、旧邀请表、credit_temp_lots、usage_logs/config、admin_audit_logs、message_templates、peer_review_skills、prism_chat_messages 和多数 feature_configs。统一 admin_audit_logs 写入链已经移除，不能宣称所有高风险后台动作都有同一份数据库审计。相反，orders、支付回调、退款和现行 invite 都仍活跃；archive 中称它们已移除的说法已经过时。`,
      },
    ],
  },
];
