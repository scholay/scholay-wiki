import type { WikiArticle } from "../types";

export const platformArticles: WikiArticle[] = [
  {
    slug: "agent-runtime",
    title: "Agent 执行器与会话桥",
    summary:
      "由 Go 后端持有业务状态、独立执行器完成模型回合和工具调用的 Web 原生 Agent 架构。",
    category: "platform",
    kind: "architecture",
    status: "current",
    audience: ["开发者", "平台管理员"],
    aliases: ["Agent bridge", "Executor", "会话运行时"],
    sourcePaths: [
      "agent/src/turn",
      "agent/src/server",
      "agent/src/tools",
      "backend/internal/agentbridge",
      "backend/internal/agentbridge/spec.go",
      "backend/internal/agentbridge/hub.go",
      "backend/internal/agentbridge/hub_turncap_test.go",
      "backend/internal/vip/quota.go",
      "backend/internal/agentrun",
      "docker-compose.yml",
    ],
    related: [
      "ai-research-workflows",
      "agent-artifacts",
      "platform-topology",
      "community-skills",
    ],
    sections: [
      {
        id: "ownership",
        title: "状态归属",
        markdown: `Go 后端保存用户、feature 与会话的映射，并通过事件日志保留可恢复历史。执行器在每个回合接收所需历史、配置和工作区；容器里的临时 transcript 只服务于当次执行，不能单独用来恢复产品会话。`,
      },
      {
        id: "transport",
        title: "实时连接",
        markdown: `浏览器通过后端 WebSocket 桥发送用户消息并接收模型、工具、权限、进度与终帧。连接使用短时 ticket、会话归属检查、心跳和轮级超时，防止长期令牌泄露或挂死回合占用执行槽。`,
      },
      {
        id: "policy",
        title: "模型与工具策略",
        markdown: `模型由后台目录和 feature 绑定决定，运行时可以在允许列表中显式切换，不会在会话中途悄悄换模型。不同 feature 使用各自禁用工具、工作目录和权限模式；默认不允许 shell，只有明确需要的能力才开启。`,
      },
      {
        id: "skills",
        title: "技能加载",
        markdown: `平台内置技能从只读挂载目录加载；用户启用的社区技能会作为受限指南加入当前会话。技能只描述做事方法，能否调用具体工具仍由执行器和后端策略决定。`,
      },
      {
        id: "turn-cost-cap",
        title: "回合成本上限",
        markdown: `Claw、智能搜论文、Prism、科研绘图、数据分析和 Boltslides 的 Spec 注入 TurnCostCapFn。桥在回合开始时按周期剩余额度、允许续用的经费能力和安全下限计算上限；每次模型调用后解析 \`turn_usage_delta\`，用模型目录的输入、输出、缓存写入与缓存读取四类价格累计成本。达到上限后只发一次 \`stop_generation\`，并把回合标为 aborted，已完成输出不会回滚。

这是一层 fail-open 的过冲保护：模型未知、目录无价格、旧 Executor 不上报 delta 或没有配置函数时不会硬停，最终仍按真实成本结算。智能审稿未接入回合内上限，因为它需要完成多阶段任务，使用自己的启动门禁。`,
      },
    ],
  },
  {
    slug: "agent-artifacts",
    title: "Agent 交付物",
    summary:
      "把 Agent 工作区中的文档、表格、图片等文件收集到对象存储并提供稳定预览和下载。",
    category: "platform",
    kind: "architecture",
    status: "current",
    audience: ["AI 功能用户", "开发者"],
    aliases: ["Artifacts", "成果文件", "交付文件"],
    sourcePaths: [
      "backend/internal/agentartifact/model.go",
      "backend/internal/agentartifact/delivery.go",
      "backend/internal/agentbridge/artifact_dispatch.go",
      "frontend-user/src/features/claw/components/chat/TurnArtifacts.tsx",
      "frontend-user/src/features/claw/components/preview/ClawArtifactPanel.tsx",
    ],
    related: ["agent-runtime", "claw", "prism", "research-data-analysis"],
    sections: [
      {
        id: "durability",
        title: "耐久化",
        markdown: `执行器工作目录是临时空间。每轮结束时，后端列出会话交付目录，把新增或变化文件收集进 MinIO，并在数据库保存名称、类型、大小、哈希、归属和存储键。`,
      },
      {
        id: "deduplication",
        title: "去重与更新",
        markdown: `同一会话中的相对路径用于稳定识别文件；再次收集同一路径时会更新原记录，不会追加重复文件。系统用文件大小和修改时间发现变化，并保存内容哈希供完整性核对。`,
      },
      {
        id: "access",
        title: "访问与生命周期",
        markdown: `下载必须经过会话归属检查，不能把内部工作路径直接暴露给用户。交付物生命周期与会话关联，删除或重置会话时同步清理元数据和对象存储。`,
      },
    ],
  },
  {
    slug: "agent-runs",
    title: "Agent Run 任务",
    summary:
      "把可恢复的多步骤 Agent 工作表示为有状态运行、步骤、租约与最终交付，而不只是一段聊天消息。",
    category: "platform",
    kind: "entity",
    status: "experimental",
    audience: ["开发者", "平台管理员", "AI 功能用户"],
    aliases: ["Agent Run", "运行任务", "Run 状态机", "Agent 步骤"],
    sourcePaths: [
      "backend/internal/agentrun/model.go",
      "backend/internal/agentrun/engine.go",
      "backend/internal/agentrun/handler.go",
      "backend/internal/agentrun/repo.go",
    ],
    related: ["agent-runtime", "agent-artifacts", "ai-research-workflows"],
    sections: [
      {
        id: "states",
        title: "运行状态",
        markdown: `Run 按 planning → running 推进，运行中可进入 awaiting_user 后再回到 running，最后到 done、failed 或 canceled。终态不可逆；当前 Phase 1 流程实际上不会进入 awaiting_user，因此这个状态属于模型已预留、但尚未被当前执行路径使用的能力。`,
      },
      {
        id: "steps",
        title: "步骤与恢复",
        markdown: `每个步骤使用 pending、running、done、failed 状态。执行器以租约认领工作并可在失联后重试；默认租约 15 分钟、一次最多认领 8 个任务，但部署环境可以覆盖这些值。幂等步骤和事件记录用于避免恢复时重复产生业务副作用。`,
      },
      {
        id: "limits",
        title: "并发与路由",
        markdown: `默认每个用户全局只允许一个活跃 Run。相关 API 是否挂载取决于服务器启动时是否成功装配 Agent Run 依赖，因此看到模型或处理器文件不等于部署环境一定开放入口。`,
      },
    ],
  },
  {
    slug: "payment-orders",
    title: "支付与订单",
    summary:
      "会员和充值订单从后端报价、建单、支付渠道回调到幂等履约与退款的完整链路。",
    category: "membership",
    kind: "architecture",
    status: "current",
    audience: ["付费用户", "客服", "管理员"],
    aliases: ["订单", "微信支付", "支付宝", "退款"],
    sourcePaths: [
      "backend/internal/vip/order.go",
      "backend/internal/vip/refund.go",
      "backend/internal/payment/alipay_service.go",
      "backend/internal/payment/wechat_pay_service.go",
      "frontend-user/src/features/admin/pages/OrdersPage.tsx",
      "frontend-user/src/shared/components/wechat-pay-dialog.tsx",
    ],
    related: [
      "membership",
      "subscription-lifecycle",
      "wallet-payg",
      "invite-campaign",
    ],
    sections: [
      {
        id: "quote",
        title: "报价与建单",
        markdown: `用户选择会员档位或充值金额后，结算页会先展示目标权益、计费周期、支付方式和本次应付金额；订单创建后，可以在桌面端“订单明细”中筛选订阅或充值，也可以在手机端切换“经费流水”和“订单记录”。下图依次展示桌面订单列表，以及移动端这两个页签的代表状态。桌面列表里的“已退款”是叠加在原支付记录上的状态，原实付金额会保留用于核对，不应把这一行理解成负数流水。

确认提交时，后端会根据当前档位、周期、到期日和计费配置生成 quote 并创建订单；客户端先前显示的金额不能单独作为履约依据。`,
        embeds: [{ id: "billing-orders" }, { id: "mobile-billing-ledger" }],
      },
      {
        id: "payment",
        title: "支付渠道",
        markdown: `平台支持支付宝和微信支付配置。微信网页流程展示扫码对话框并轮询订单状态；渠道异步回调需要验签、校验金额和订单状态，再进入统一履约。`,
      },
      {
        id: "fulfillment",
        title: "幂等履约与退款",
        markdown: `管理员可以在订单页按状态查看充值与订阅记录，打开已支付订单后登记退款；营收图则把毛收入、退款和净收入分开呈现。下图分别展示订单与退款记录，以及退款计入后的营收趋势。

重复支付回调不会重复延长会员或重复充值。当前后台的“退款”不会替你调用支付宝或微信网关：必须先在商户后台完成真实退款，再把金额、网关退款号和幂等键登记进 Scholay。系统随后按已退金额关联原订单，并避免重复追回充值经费和邀请首单返利。`,
        embeds: [{ id: "admin-orders" }, { id: "admin-order-revenue-chart" }],
      },
      {
        id: "refund-boundaries",
        title: "退款边界与状态口径",
        markdown: `系统支持全额和部分退款；用户记录会同时显示原支付金额和已退金额。充值退款会按比例追回经费，余额不足记为平台损失；订阅全额退款默认撤销会员，部分退款是否撤销由操作人选择，目前没有唯一的权益折算规则。原订单可能仍标为 paid 并附带退款记录，因此 paid 不等于“从未退款”。支付宝支付成功后的用户主动查单没有与微信等价的状态自愈链路，异常单仍需依赖回调或人工核对。`,
      },
    ],
  },
];
