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
      "frontend-user/src/features/wiki/embeds/WikiEmbedRhinoAssistant.tsx",
    ],
    related: ["service-policies", "scholay", "admin-console"],
    sections: [
      {
        id: "channels",
        title: "入口",
        markdown: `遇到产品问题或想提出建议时，进入反馈页，选择分类、填写说明并按需添加附件；完整表单要求说明至少 10 字、最多 2,000 字，并填写联系邮箱。需要技术支持或商务合作时，改用联系页列出的对应渠道。牛犀犀助手里也有一份更精简的反馈表单。下方三张图依次展示完整反馈表单、联系渠道和助手里的精简表单。

提交后的反馈会进入后台处理列表，但它不是即时在线聊天；图中的响应或修复时效是一般预期，不构成服务承诺，紧急程度和预计响应时间以联系页当前说明为准。`,
        embeds: [
          { id: "feedback-form" },
          { id: "contact-support" },
          {
            id: "rhino-assistant-feedback-panel",
            caption: "牛犀犀助手 · 精简反馈表单",
          },
        ],
      },
      {
        id: "privacy",
        title: "提交前注意",
        markdown: `反馈材料可能被支持人员查看。不要上传不必要的敏感数据、未公开论文原稿或第三方机密；复现问题时优先提供去标识化信息。`,
        blocks: [
          { type: "markdown" },
          {
            type: "tip",
            tip: {
              text: "不要上传未公开稿件、第三方机密或与问题无关的敏感信息。截图和日志应先遮盖账户标识、密钥与个人数据。",
            },
          },
          {
            type: "next-steps",
            group: {
              title: "提交前再核对",
              items: [
                {
                  articleSlug: "service-policies",
                  sectionId: "ai",
                  title: "确认数据与 AI 使用边界",
                  description:
                    "了解反馈材料、AI 输出与正式政策之间的责任范围。",
                  icon: "review",
                },
                {
                  articleSlug: "help-center-and-qa",
                  sectionId: "hub",
                  title: "先查帮助中心",
                  description:
                    "常见使用问题可以先从公开问答与资源入口快速定位答案。",
                  icon: "search",
                },
              ],
            },
          },
        ],
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
        markdown: `活动开启时，用户会在首页或额度不足场景看到带标题、福利说明、微信二维码和关闭按钮的推广弹窗；下图展示的是配置已经生效的一种代表状态。运营人员在后台控制启用状态、文案和二维码。

公开摘要 API 不直接返回大体积二维码数据，客户端会通过带内容版本的独立 URL 读取图片；替换图片后地址随版本变化，避免继续显示旧缓存。`,
        embeds: [{ id: "promo-modal" }],
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
        markdown: `在兑换页输入代码并提交预览后，你会先看到可获得的会员档位、期限或经费，以及活动说明；核对无误再点击确认兑换。下图只展示会员码“Pro 3 个月”的确认前状态；经费码会显示经费数额，不会出现会员档位或期限字段。

权益以预览结果为准，客户端不能根据兑换码的外观自行猜测。`,
        embeds: [{ id: "redeem-preview" }],
      },
      {
        id: "grant",
        title: "发放规则",
        markdown: `管理员在兑换码后台选择会员或经费权益、生成批次，再进入批次查看和导出单码；需要时可以通过操作弹窗延期、增加总次数或调整会员授予时长。下方四张图依次展示批次总览、生成面板、单码列表和后续操作弹窗。

新码使用排除易混字符的 \`XXXX-XXXX-XXXX-XXXX\` 格式。每个账号对同一码只能成功一次，但一组码仍可设置 1–100 次总使用次数，供不同账号在耗尽前核销。失败状态区分已撤销（revoked）、已过期（expired）、次数耗尽（exhausted）和本账号已兑换（already redeemed）。会员码不会降低现有档位，期限从当前有效到期日顺延；只有确实升档且授予时长至少覆盖一个额度周期时，才会恢复满额。`,
        embeds: [
          { id: "admin-gift-codes", caption: "后台 · 兑换码生成与核销" },
          { id: "admin-gift-code-generator" },
          { id: "admin-gift-code-list" },
          { id: "admin-gift-code-action-dialog" },
        ],
      },
    ],
  },
  {
    slug: "marketing-pages-and-implementation-boundaries",
    title: "功能页面与元素说明",
    summary:
      "识别 Scholay 各功能页面反复出现的导航、研究对象、工作区、智能体状态与额度反馈，并理解点击后的结果。",
    category: "getting-started",
    kind: "page",
    status: "current",
    audience: ["所有用户", "首次使用者", "支持人员"],
    aliases: [
      "界面元素",
      "通用组件",
      "功能页面",
      "页面说明",
      "拓展区",
      "拓展区标签页",
    ],
    sourcePaths: [
      "frontend-user/src/app/layouts/topnav/CompactNavMenu.tsx",
      "frontend-user/src/features/browser/components/BrowserTabsBar.tsx",
      "frontend-user/src/shared/components/PaperResultCard/DefaultCard.tsx",
      "frontend-user/src/shared/components/PaperResultCard/MetaLine.tsx",
      "frontend-user/src/features/claw/components/preview/ClawArtifactPanel.tsx",
      "frontend-user/src/features/claw/components/preview/SpreadsheetPreview.tsx",
      "frontend-user/src/features/prism/components/sidebar/PrismFileSidebar.tsx",
      "frontend-user/src/shared/components/chat/ToolCallBlock.tsx",
      "frontend-user/src/shared/components/chat/ThinkingFold.tsx",
      "frontend-user/src/features/settings/components/account-assets-card.tsx",
      "frontend-user/src/shared/components/peer-review-record/StatusGrid.tsx",
      "frontend-user/src/features/wiki/embeds/WikiEmbedCommonElements.tsx",
    ],
    related: [
      "product-map",
      "paper-detail-and-actions",
      "claw-interface-guide",
      "prism-interface-guide",
      "ai-usage-quota",
    ],
    sections: [
      {
        id: "navigation-and-tabs",
        title: "汉堡菜单与浏览器页签",
        markdown: `**汉堡菜单**是窄屏顶栏的统一导航出口。视口小于 1200 px 时，宽屏上平铺的首页、浏览器、功能入口、活动与反馈会收进这颗按钮；它们只是换了收纳位置，并没有从产品中消失。点击路由项会进入对应页面，点击活动项则打开相应弹层。只有已经打开论文、期刊、学者或 PDF 详情时，菜单中才会出现“浏览器”。

**浏览器页签**位于详情页面顶部，用来并行保留多个研究对象。论文、期刊、学者和 PDF 使用不同图标；当前页签由地址决定。点击页签切换对象，点击关闭会转到相邻页签，全部关闭后回到首页；最右侧“+”用于按题名或 DOI 快速打开论文。“返回”则回到打开当前对象之前的搜索、文库或其他任务页面。

这组页签有时会被口头称为“拓展区标签页”，但现行界面名称是**浏览器页签**，不要与 Claw 右侧的“扩展区”混淆。`,
        embeds: [{ id: "common-navigation-tabs" }],
        blocks: [
          { type: "markdown" },
          { type: "embeds", ids: ["common-navigation-tabs"] },
          {
            type: "tip",
            tip: {
              text: "汉堡菜单只在窄屏接管导航；桌面端仍以顶栏入口为主。浏览器入口只有在至少存在一个详情页签时才会显示。",
            },
          },
        ],
      },
      {
        id: "reference-card",
        title: "参考文献基础信息卡片",
        markdown: `**参考文献基础信息卡片**是搜索结果、智能搜索和文献选择器中反复出现的论文摘要单元。它不是一份完整书目记录，而是帮助你判断“要不要打开这篇论文”的扫描视图。

- **题名**：论文的主要识别信息；点击后在浏览器中打开论文详情，并保留当前任务页面作为返回位置。
- **来源、作者与年份**：来源匹配到站内期刊记录时可进入期刊详情；带来源 ID 的作者可进入学者详情；“+N”只展开其余作者名单。
- **评价标签**：可能包括 JCR、中科院分区、CCF、影响因子、被引数与学科。它们是来自不同体系的辅助信号，不能互相替代，也不等于论文质量结论。
- **摘要**：默认只显示两行，内容来自论文数据源或补全结果；缺少摘要表示当前没有取得该字段，不表示论文没有摘要。
- **动作区**：暂存、收藏、打开合法开放原文、翻译和折叠各自独立。暂存是加入当前搜索工作区，收藏是保存到个人文献集；“原文链接”只在取得合法 OA 地址时出现，并在新窗口打开。`,
        embeds: [{ id: "common-reference-card" }],
        blocks: [
          { type: "markdown" },
          { type: "embeds", ids: ["common-reference-card"] },
          {
            type: "article-link",
            card: {
              articleSlug: "paper-detail-and-actions",
              sectionId: "content",
              title: "继续了解论文详情页",
              description:
                "查看基础卡片打开后会出现的完整元数据、参考文献与页面动作。",
              icon: "book-open",
            },
          },
        ],
      },
      {
        id: "workspaces",
        title: "扩展区、扩展区标签页与文件树",
        markdown: `**扩展区**（有时被写作“拓展区”，现行产品统一使用“扩展区”）是 Claw 及部分 Agent 功能中位于对话之外的交付物工作面。桌面端通常显示为右侧可调整宽度的分栏，窄屏改为整屏面板。它会收集本会话生成的文档、表格、演示稿和其他文件：点击普通文件进入预览，点击下载取得原文件；文件夹不能直接预览，会打包为 ZIP。进入预览后，“返回列表”回到本会话的全部交付物。

**扩展区标签页**只在被预览的文件本身包含多个视图时出现。例如 XLSX 有多个工作表时，顶部会显示工作表标签；点击标签只切换同一个文件里的工作表，不会切换会话或论文。扩展区自身不是多文档浏览器，文件之间仍通过“返回列表”选择。科研绘图的图片会直接出现在对话流中，因此不会重复进入扩展区。

**文件树**用于 Prism 项目内的源文件导航。点击文件行会把文件载入编辑器；当前文件以左侧强调线和底色标识。行尾更多菜单可重命名或删除非主文件，主文件不能删除；AI 正在生成待审改动时，文件增删改会暂时禁用。文件树下面的大纲是另一种导航：它跳到当前文件中的标题位置，不会换文件。`,
        embeds: [{ id: "common-workspaces" }],
        blocks: [
          { type: "markdown" },
          { type: "embeds", ids: ["common-workspaces"] },
          {
            type: "article-link",
            card: {
              articleSlug: "agent-artifacts",
              title: "交付物如何保存与下载",
              description:
                "了解扩展区文件如何从临时工作目录进入稳定存储，以及访问边界。",
              icon: "resource",
            },
          },
        ],
      },
      {
        id: "agent-status",
        title: "Function call、推理过程、剩余额度与进度条",
        markdown: `**Function call 卡片**（界面中通常显示为“工具调用”）表示智能体正在调用检索、读取、写入或分析工具。卡片标题给出工具的用户可读名称，中间摘要显示关键入参，右侧图标区分执行中、成功、未成功与已暂停。展开后可以查看脱敏后的入参和结果；单次工具未成功不一定等于整轮失败，智能体可能调整参数后自动重试。

**推理过程**是低优先级的可折叠过程提示。生成中默认展开并跟随最新内容，完成后自动收起并保留首行摘要与耗时。它用于解释当前在做什么，不是参考文献、计算证明或最终结论；研究判断仍应以正文中的来源、数据和可复核交付物为准。

**剩余额度显示**回答“这一周期还能使用多少 AI 能力”：百分比表示剩余比例，旁边的时间表示何时自动回满，经费与重置次数是额度耗尽后的不同恢复方式。**进度条**回答“当前任务做到哪一步”：例如智能审稿的阶段 1/5 与预计剩余时间。两种条形外观相近，但分母、刷新条件和可执行动作完全不同，不能把任务完成 68% 理解成额度还剩 68%。`,
        embeds: [{ id: "common-agent-status" }],
        blocks: [
          { type: "markdown" },
          { type: "embeds", ids: ["common-agent-status"] },
          {
            type: "tip",
            tip: {
              text: "推理过程和工具卡用于解释执行状态，不构成学术证据。引用结论时，回到论文来源、可下载数据或最终报告核对。",
              link: {
                articleSlug: "claw-stream-tool-states",
                sectionId: "stream",
                label: "卡住或发不出去时怎么办",
              },
            },
          },
          {
            type: "next-steps",
            group: {
              title: "从元素进入真实任务",
              description:
                "根据刚才识别到的页面区域，继续查看对应功能的完整工作流。",
              items: [
                {
                  articleSlug: "claw-interface-guide",
                  title: "使用智能助手工作区",
                  description:
                    "认识会话、输入区、扩展区和交付物之间的完整协作关系。",
                  icon: "sparkles",
                },
                {
                  articleSlug: "prism-interface-guide",
                  title: "使用 Prism 写作界面",
                  description:
                    "继续理解项目文件、编辑器、AI 改动与编译区域的分工。",
                  icon: "review",
                },
                {
                  articleSlug: "ai-usage-quota",
                  sectionId: "amounts",
                  title: "查看额度计算与恢复",
                  description:
                    "区分周期额度、经费、重置次数和任务进度，避免误读状态。",
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
        markdown: `当前后端没有注册 coupon handler、service 或路由，订单报价与履约也不会读取 coupon_id。数据库基线虽然保留 coupon_templates、coupon_batches、user_coupons、coupon_usage_logs 和订单关联字段，但这些只是搁置结构，不能据此宣传“优惠券可用”。`,
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
        markdown: `经费模型仍保留 \`task\` 来源常量，数据库基线的 feature_configs 也仍把 user_checkin 标为 enabled，但当前没有使用这些值的处理流程、路由或签到表。孤立字段不能证明任务中心已经上线；这里的“未来”只来自界面预告，不是已确认路线图。若重新启动该功能，仍需重新定义迁移、服务和前端入口。`,
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
