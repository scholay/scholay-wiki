import type { WikiArticle } from "../types";

export const researchAiArticles: WikiArticle[] = [
  {
    slug: "ai-research-workflows",
    title: "AI 科研工作流",
    summary:
      "Scholay 将同一 Agent 基础设施包装成检索、通用研究、审稿、写作、分析、绘图和演示等专门工作流。",
    category: "research-ai",
    kind: "overview",
    status: "current",
    audience: ["研究者", "学生"],
    aliases: ["AI 功能", "科研 Agent", "智能工作流"],
    sourcePaths: [
      "backend/internal/agentbridge/spec.go",
      "agent/src/server",
      "frontend-user/src/features/claw/lib/feature-meta.ts",
      "docker-compose.yml",
    ],
    related: ["smart-search", "claw", "peer-review", "prism", "agent-runtime"],
    sections: [
      {
        id: "features",
        title: "能力集合",
        markdown: `现行 Agent feature 包括智能搜索、Claw、Prism、智能审稿、演示文稿、科研绘图和数据分析。它们共享会话、模型路由、配额记账、附件与交付物协议，但使用不同的系统提示、技能目录和前端工作区。`,
      },
      {
        id: "boundaries",
        title: "共同边界",
        markdown: `AI 输出不是自动成立的学术事实。涉及引用、统计、方法、图片和论文改写时，用户仍需核对原始证据、数据和目标期刊要求。附件与工具结果会进入当前会话上下文，但不会因此获得超出账户权限的访问。`,
      },
      {
        id: "delivery",
        title: "交付物",
        markdown: `除对话文本外，Agent 可以产生图片、文档、表格、演示文件或其他 artifact。交付物在后端完成收集和持久化，前端根据格式提供下载或预览；临时工作路径不是面向用户的下载地址。`,
      },
    ],
  },
  {
    slug: "smart-search",
    title: "智能搜索",
    summary:
      "以自然语言与 Agent 会话驱动的学术检索，返回解释、论文清单和来源证据。",
    category: "research-ai",
    kind: "feature",
    status: "current",
    audience: ["登录用户", "研究者"],
    aliases: ["AI 搜索", "Smart Search", "智能检索"],
    sourcePaths: [
      "frontend-user/src/features/search/components/smart-search/SmartSearchPanel.tsx",
      "frontend-user/src/features/search/api/smart-search.ts",
      "backend/internal/smartsearch",
      "backend/internal/agentbridge",
      "agent-skills/smart-search-skills",
    ],
    related: ["academic-search", "paper", "agent-runtime", "ai-usage-quota"],
    sections: [
      {
        id: "difference",
        title: "与普通检索的区别",
        markdown: `普通检索把明确的查询与筛选条件转换为分页结果；智能搜索允许用户描述研究问题，由 Agent 规划检索、调用学术工具并组织解释。两者都返回论文，但智能搜索同时保留推理过程中的查询、来源和会话上下文。`,
      },
      {
        id: "session",
        title: "会话与连接",
        markdown: `后端为用户取得或创建智能搜索会话，并签发短时、一次性的 WebSocket ticket。浏览器用该凭据建立实时连接；长期认证令牌不直接放进 WebSocket URL。`,
      },
      {
        id: "evidence",
        title: "论文与证据",
        markdown: `搜索回答可以附带结构化论文清单和证据引用。论文卡仍连接到标准论文实体，用户应打开详情或全文验证回答中的事实，而不是只引用对话文字。`,
      },
    ],
  },
  {
    slug: "claw",
    title: "Scholay Claw",
    summary:
      "面向研究任务的通用 AI 助手，支持附件、技能、工具调用、研究图形和多格式交付物。",
    category: "research-ai",
    kind: "feature",
    status: "current",
    audience: ["登录用户", "研究者"],
    aliases: ["智能助手", "Claw Agent", "学术助手"],
    sourcePaths: [
      "frontend-user/src/features/claw/routes.tsx",
      "frontend-user/src/features/claw/pages/ClawPage.tsx",
      "frontend-user/src/features/claw/pages/mobile/MobileClawPage.tsx",
      "frontend-user/src/features/claw/components/chat/ConversationWorkspace.tsx",
      "backend/internal/claw",
      "agent-skills/claw-add",
    ],
    related: [
      "agent-runtime",
      "agent-artifacts",
      "community-skills",
      "research-data-analysis",
    ],
    sections: [
      {
        id: "workspace",
        title: "会话工作区",
        markdown: `Claw 提供会话历史、消息流、输入框、附件、技能选择和右侧交付物预览。移动 Web 使用专门页面与抽屉布局，小程序也提供 Claw 会话入口。`,
      },
      {
        id: "skills",
        title: "技能与工具",
        markdown: `用户可以在对话中启用研究技能，Agent 也会依据任务调用经过策略控制的工具。技能提供工作方法和输出规范，工具负责检索、文件或计算等动作；二者不是同一个概念。`,
      },
      {
        id: "outputs",
        title: "产物与预览",
        markdown: `Claw 能在消息中展示论文、引用、图形和工具过程，并把可交付文件集中到 artifact 面板。文档与表格等格式有相应预览，其他格式至少提供稳定下载入口。`,
      },
    ],
  },
  {
    slug: "peer-review",
    title: "智能审稿",
    summary:
      "面向期刊论文和学位论文的结构化 AI 评审工作台，包含提交向导、实时阶段与评审记录。",
    category: "research-ai",
    kind: "feature",
    status: "current",
    audience: ["作者", "研究者", "研究生"],
    aliases: ["AI 审稿", "同行评审", "Peer Review"],
    sourcePaths: [
      "frontend-user/src/features/peer-review/routes.tsx",
      "frontend-user/src/features/peer-review/layouts/PeerReviewShell.tsx",
      "frontend-user/src/features/peer-review/pages/SubmissionLandingPage.tsx",
      "frontend-user/src/features/peer-review/pages/JournalWizardPage.tsx",
      "frontend-user/src/features/peer-review/pages/ThesisWizardPage.tsx",
      "frontend-user/src/features/peer-review/pages/RecordsPage.tsx",
      "frontend-user/src/features/peer-review/pages/RecordDetailPage.tsx",
      "frontend-user/src/features/peer-review/pages/SubmitSuccessPage.tsx",
      "backend/internal/peerreview",
      "agent-skills/reviewer-skills",
    ],
    related: ["paper", "agent-runtime", "ai-usage-quota", "prism"],
    sections: [
      {
        id: "submission",
        title: "两类提交",
        markdown: `期刊论文与学位论文使用不同向导。主稿上限 50 MiB，附件每个最多 30 MiB、最多 10 个。期刊流程会收集稿件、目标期刊或领域、投稿信与必要元数据；学位论文流程按学校和论文场景组织信息。上传完成只形成草稿，不等于已经开始评审。`,
      },
      {
        id: "review",
        title: "评审过程",
        markdown: `任务主状态按 draft → queued → reviewing → completed 或 failed 推进，只有 draft 可以编辑；failed 可以重试。评审内部还会出现 idle、computing_meta、computing_letter、computing_methodology、reviewing、failed 等计算阶段。后端有恢复与清扫机制处理被中断的任务，前端通过实时流更新阶段和结果。`,
      },
      {
        id: "records",
        title: "记录与边界",
        markdown: `历史评审进入记录列表和详情页。智能审稿是投稿前的风险发现工具，不代表真实期刊决定，也不能替代领域专家、伦理审查或统计复核。`,
      },
    ],
  },
  {
    slug: "prism",
    title: "Scholay Prism",
    summary:
      "把 LaTeX 项目、结构化写作、实时预览、引用管理和 AI 修订结合在一起的学术写作工作区。",
    category: "research-ai",
    kind: "feature",
    status: "current",
    audience: ["论文作者", "研究者"],
    aliases: ["智能写作", "LaTeX 写作", "Prism"],
    sourcePaths: [
      "frontend-user/src/features/prism/routes.tsx",
      "frontend-user/src/features/prism/pages/PrismPage.tsx",
      "frontend-user/src/features/prism/components/PrismWorkspaceV2.tsx",
      "backend/internal/prism",
      "agent-skills/prism-skills",
      "prism_tex",
    ],
    related: ["agent-runtime", "agent-artifacts", "peer-review", "paper"],
    sections: [
      {
        id: "workspace",
        title: "写作工作区",
        markdown: `现行 Prism 以数据库中的项目、结构树和文本版本为权威内容，以 MinIO 保存二进制文件和编译产物。新项目使用结构化 schema；旧项目保留冻结的 legacy 文件模型。当前 \`Project.ReadOnly()\` 对项目统一返回只读，因此旧文件 CRUD 不能当作现行主编辑链路。`,
      },
      {
        id: "writing-tools",
        title: "写作工具",
        markdown: `现行界面包含引用、作者、数字、公式、质量、版本、修订、翻译和写作画像等专门入口。AI 回合先 prepare，再形成 pending diff；只有用户 apply 后变更才进入正文，reject 则放弃。界面出现的多人实时协作宣传没有对应的稳定产品入口。`,
      },
      {
        id: "compile",
        title: "编译与交付",
        markdown: `编译任务按 queued → running → success 或 error 推进；错误分 latex、infra、timeout，只有 LaTeX 错误会进入自动修复。后端把任务放入共享工作目录，LaTeX 辅助服务生成 PDF 或诊断结果，产物再进入稳定交付链路。`,
      },
    ],
  },
  {
    slug: "research-data-analysis",
    title: "AI 数据分析",
    summary:
      "在受控统计环境中读取研究数据、选择方法、执行分析并交付可复查结果。",
    category: "research-ai",
    kind: "feature",
    status: "current",
    audience: ["研究者", "学生"],
    aliases: ["数据分析", "Stat Lab", "统计分析"],
    sourcePaths: [
      "frontend-user/src/features/claw/api/stat-lab-session.ts",
      "frontend-user/src/features/claw/hooks/useStatLabConversation.ts",
      "backend/internal/statlab",
      "agent-skills/stat-lab-skills",
      "agent/stat-kit",
    ],
    related: ["claw", "agent-artifacts", "ai-usage-quota"],
    sections: [
      {
        id: "workflow",
        title: "工作流",
        markdown: `用户提供数据文件和研究问题后，Agent 先理解变量、数据质量与研究设计，再选择统计方法并执行分析。结果应同时包含方法说明、关键数值、诊断和可下载产物，而不只是自然语言结论。`,
      },
      {
        id: "environment",
        title: "执行环境",
        markdown: `统计工具在 Agent 的受控工作区中运行，支持常见表格和统计文件。文件解析失败、变量类型不明或研究设计不足时，应先澄清或报告限制，不应为了产出而猜测。`,
      },
      {
        id: "responsibility",
        title: "解释边界",
        markdown: `显著性、效应量、模型假设和缺失值处理都必须结合领域语境解释。AI 分析不能替代研究方案审查，尤其不能从观察数据自动推断因果。`,
      },
    ],
  },
  {
    slug: "research-figure-and-slides",
    title: "科研绘图与演示文稿",
    summary: "通过专门 Agent 工作流生成科研图形和可交付演示文件。",
    category: "research-ai",
    kind: "feature",
    status: "current",
    audience: ["研究者", "汇报者"],
    aliases: ["科研绘图", "Sci Draw", "制作 PPT", "Bolt Slides"],
    sourcePaths: [
      "frontend-user/src/features/claw/api/sci-draw-session.ts",
      "frontend-user/src/features/claw/api/boltslides-session.ts",
      "frontend-user/src/features/claw/pages/mobile/MpDiagramPage.tsx",
      "backend/internal/scidraw",
      "backend/internal/boltslides",
      "agent-skills/sci-draw-skills",
      "agent-skills/bolt-slides-add",
    ],
    related: ["claw", "agent-artifacts", "ai-research-workflows"],
    sections: [
      {
        id: "figures",
        title: "科研绘图",
        markdown: `科研绘图会话面向图表、科学示意图和分子/生物图形等任务。前端可以直接展示 SVG 图形并提供缩放与导出；图中数据、标签和科学关系仍需用户核对。`,
      },
      {
        id: "slides",
        title: "演示文稿",
        markdown: `演示文稿工作流根据主题、材料和受众生成页面结构与可编辑文件。交付目标是能继续修改的演示文件，而不是把每一页烘焙成不可编辑图片。`,
      },
      {
        id: "shared",
        title: "共同机制",
        markdown: `两项能力使用独立 feature 会话和技能目录，但共用 Agent 连接、会话历史、额度和 artifact 交付体系。`,
      },
    ],
  },
];
