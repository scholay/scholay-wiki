import type { WikiArticle } from "../types";

export const researchAiArticles: WikiArticle[] = [
  {
    slug: "ai-research-workflows",
    title: "AI 科研工作流",
    summary:
      "Scholay 为检索、通用研究、审稿、写作、分析、绘图和演示提供不同的 AI 工作流。",
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
        markdown: `当前可以使用智能搜索、Claw、Prism、智能审稿、演示文稿、科研绘图和数据分析。它们都支持会话、附件、额度记录和文件交付，但会根据任务使用不同的工作区和处理方法。`,
      },
      {
        id: "boundaries",
        title: "共同边界",
        markdown: `AI 输出不是自动成立的学术事实。涉及引用、统计、方法、图片和论文改写时，用户仍需核对原始证据、数据和目标期刊要求。附件与工具结果会进入当前会话上下文，但不会因此获得超出账户权限的访问。`,
      },
      {
        id: "delivery",
        title: "交付物",
        markdown: `除对话文字外，助手还可以生成图片、文档、表格、演示文件等交付物。支持的格式可以直接预览，其他格式会提供下载入口；只有页面中的预览或下载按钮是正式交付入口。`,
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
        markdown: `在智能搜索输入框中直接写下完整的研究问题，例如研究对象、方法和时间范围，再发送即可；下图展示的是等待输入时的状态。智能搜索会围绕问题规划检索、整理来源并给出说明，普通检索则更适合明确关键词和筛选条件。

两种方式都能找到论文，但智能搜索还会保留这一轮对话中的查询过程和来源线索。`,
        embeds: [{ id: "smart-search-dock" }],
      },
      {
        id: "session",
        title: "会话与连接",
        markdown: `发送问题后，页面会在同一会话中依次显示检索进度、正在使用的来源和最终回答；下图展示的是搜索进行中的会话状态。连接短暂中断时，页面会提示并尝试恢复，你不需要重新复制已经送达的问题。

实时连接使用一次性的短期凭据，不会把长期登录信息直接放进连接地址。`,
        embeds: [{ id: "smart-search-session" }],
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
        markdown: `进入 Claw 后，桌面端左侧是文献工作区，主对话区顶部可以打开会话历史，中间显示消息与输入框，右侧用于查看生成的文件；你还可以在输入框中添加附件或选择 Skill。手机端把会话历史收进抽屉，并在独立页面中显示当前对话。下方三张图依次展示桌面工作区、移动端入口和移动端正在进行的会话。`,
        embeds: [
          { id: "claw-workspace" },
          { id: "mobile-claw" },
          { id: "mobile-claw-active-session" },
        ],
      },
      {
        id: "skills",
        title: "技能与工具",
        markdown: `用户可以在对话中启用研究技能，Agent 也会依据任务调用经过策略控制的工具。技能提供工作方法和输出规范，工具负责检索、文件或计算等动作；二者不是同一个概念。`,
      },
      {
        id: "outputs",
        title: "产物与预览",
        markdown: `当回答生成文档、表格、图片或其他文件时，消息中会出现产物卡片。手机上点击卡片即可打开预览，再返回对话或下载文件；下图展示的是移动端产物预览。论文、引用、图形和工具过程也会保留在对应消息中。

支持的格式会直接预览，其他格式至少提供下载入口。`,
        embeds: [{ id: "mobile-claw-artifact-preview" }],
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
        markdown: `进入智能审稿后，先选择“期刊论文”或“学位论文”；下图展示的是两类任务的起始入口。按向导上传主稿并填写目标期刊、研究领域或学校等信息，确认提交后才会开始评审。

主稿上限为 50 MiB，附件每个最多 30 MiB、最多 10 个。仅上传完成时任务仍是草稿，你还可以继续检查和修改。`,
        embeds: [{ id: "peer-review-entry" }],
      },
      {
        id: "review",
        title: "评审过程",
        markdown: `提交后，进度页会显示任务正在排队、分析稿件信息、检查投稿信与方法、生成评审结果等阶段；下图展示的是评审进行中的状态。任务会从草稿进入排队、评审，最后变为完成或失败，失败后可以重试。

只有草稿可以编辑。评审中断时系统会尝试恢复，页面会持续更新当前阶段，不需要手动刷新来判断是否完成。`,
        embeds: [{ id: "peer-review-progress" }],
      },
      {
        id: "records",
        title: "记录与边界",
        markdown: `打开评审记录，可以按状态查看过去的任务并进入详情；下图展示的是包含多种任务状态的记录列表。智能审稿用于在投稿前发现风险，不代表期刊的真实决定，也不能替代领域专家、伦理审查或统计复核。`,
        embeds: [{ id: "peer-review-records-list" }],
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
        markdown: `打开 Prism 项目后，你会看到论文结构、正文编辑区、预览和 AI 助手；选择章节即可开始阅读或写作。下图展示的是一个已打开项目的工作区，结构树中的章节对应正文的不同部分。

新项目按结构化章节保存。较早版本创建的旧式文件项目会保留，但目前以只读方式打开，不能按旧流程继续改写。`,
        embeds: [{ id: "prism-workspace" }],
      },
      {
        id: "writing-tools",
        title: "写作工具",
        markdown: `新建或进入空项目时，可以从写作起始页选择引用、作者、数字、公式、质量检查、修订或翻译等任务；下图展示的就是这个起始状态。提交 AI 修改后，默认会在本轮结束时应用变化；如果打开“逐块审阅”，你可以逐项接受或拒绝。

页面里关于多人实时协作的介绍目前没有稳定入口，请不要把它当作已经可以使用的功能。`,
        embeds: [{ id: "prism-writing-start" }],
      },
      {
        id: "compile",
        title: "编译与交付",
        markdown: `点击编译后，页面会依次显示排队、编译中、成功或失败。下图只冻结一次 LaTeX 内容编译失败的状态：错误提示会出现在工作区上方，右侧预览区也会说明 PDF 尚未生成。成功时则可以直接预览或下载 PDF。

只有 LaTeX 内容错误会尝试自动修复；其他错误需要稍后重试或根据提示处理。`,
        embeds: [{ id: "prism-compile-states" }],
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
        markdown: `在 Claw 新对话页选择“数据分析”，再附上数据文件并写清研究问题；下图中的模板卡就是这一入口。助手会先理解变量、数据质量和研究设计，再选择统计方法并执行分析。

结果应同时包含方法说明、关键数值、诊断和可下载产物，而不只是自然语言结论。`,
        embeds: [
          { id: "claw-empty-state", caption: "智能助手 · 数据分析入口" },
        ],
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
        markdown: `在 Claw 新对话页选择“科研绘图”模板，再说明图形类型、数据、标签和用途；下图展示的是包含科研创作模板的起始页。生成的 SVG 可以直接预览、缩放和导出。

如果你要制作演示文稿，也可以从同一模板区选择对应入口。无论是图形还是幻灯片，其中的数据、标签与科学关系都需要你再次核对。`,
        embeds: [
          { id: "claw-empty-state", caption: "智能助手 · 科研创作模板" },
        ],
      },
      {
        id: "slides",
        title: "演示文稿",
        markdown: `演示文稿工作流根据主题、材料和受众生成页面结构与可编辑文件。交付目标是能继续修改的演示文件，而不是把每一页烘焙成不可编辑图片。`,
      },
      {
        id: "shared",
        title: "共同机制",
        markdown: `科研绘图和演示文稿会分别保存自己的会话与任务设置，但都使用同一套会话历史、额度和文件交付方式。`,
      },
    ],
  },
];
