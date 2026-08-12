import type { WikiArticle } from "../types";

export const workflowGuideArticles: WikiArticle[] = [
  {
    slug: "claw-interface-guide",
    title: "智能助手界面导览",
    summary:
      "认识 Scholay 智能助手的会话历史、消息区、输入工具、模型选择和交付物扩展区。",
    category: "research-ai",
    kind: "page",
    status: "current",
    audience: ["智能助手用户", "研究者", "学生"],
    aliases: ["Claw 界面", "智能助手怎么用", "智能助手工作区"],
    sourcePaths: [
      "frontend-user/src/features/claw/pages/ClawPage.tsx",
      "frontend-user/src/features/claw/components/chat/ConversationWorkspace.tsx",
      "frontend-user/src/features/claw/components/chat/ChatComposer.tsx",
      "frontend-user/src/features/claw/components/sidebar/UnifiedSidebar.tsx",
      "frontend-user/src/features/claw/components/preview/ClawArtifactPanel.tsx",
    ],
    related: [
      "claw",
      "claw-sessions",
      "claw-attachments-and-references",
      "claw-stream-tool-states",
    ],
    sections: [
      {
        id: "entry-and-modes",
        title: "入口与任务模式",
        markdown: `进入智能助手时，\`/claw\` 是一条尚未落地的新对话；发出第一条消息、上传文件或引用文献后，系统才创建会话并把地址更新为 \`/claw/:sessionId\`。空白页除了普通对话，还提供制作 PPT、科研绘图和数据分析等任务模板。选模板会切换到相应的专用工作流；不同模式共用统一的会话外观，但附件、引用和产物能力会按模式变化。`,
        embeds: [{ id: "claw-empty-state" }],
      },
      {
        id: "layout",
        title: "从左到右看界面",
        markdown: `左侧是文献工作区；会话历史位于主区顶部的会话条，可打开、重命名或删除自己拥有的会话。中间是本次对话的消息流，思考、工具过程、正文和文件产物会按轮次组织；顶部提供“新对话”和“扩展区”开关；右侧扩展区集中列出可预览或下载的交付文件。桌面端可以拖动分栏，窄屏则把扩展区改成主动打开的抽屉，避免一进入旧会话就遮住输入框。`,
        embeds: [{ id: "claw-workspace" }],
      },
      {
        id: "composer",
        title: "输入框与上下文工具",
        markdown: `底部输入框用于发消息、停止生成和查看上下文水位。普通智能助手支持选择或拖入附件、从个人文献集加入结构化引用，以及选择已安装的 Skill；模型选择器也位于输入区。只有完成上传的附件和成功加入的文献引用才会随本轮发送。开启 Skill 是为会话提供方法指南，不会自动扩大账户或工具权限。`,
        embeds: [{ id: "claw-context-composer" }],
      },
      {
        id: "artifacts",
        title: "交付物、预览与下载",
        markdown: `Agent 生成的文档、表格、演示稿或其他文件会进入扩展区；支持的格式可直接预览，其余格式保留下载入口。科研绘图的图片类产物会直接出现在对话流中，制作 PPT 则会在新产物出现后打开右侧预览。消息文字和文件交付物是两种不同结果：需要继续编辑或正式提交时，应下载文件并检查内容，而不是只依赖对话中的摘要。`,
        embeds: [{ id: "claw-artifact-output" }],
      },
      {
        id: "reading-states",
        title: "如何识别运行状态",
        markdown: `界面会区分生成中、停止中、工具执行、断线重连、停滞提醒、额度阻断和其他标签页接管等状态。连接异常时，输入框会明确显示正在重连；额度不足而未真正送达的消息不会伪装成已发送。无论回答看起来多完整，引用、计算、图表和研究判断仍需要回到原始材料核对。`,
        embeds: [{ id: "claw-run-states" }],
      },
    ],
  },
  {
    slug: "prism-interface-guide",
    title: "智能写作界面导览",
    summary:
      "从项目首页进入 Scholay Prism，理解大纲、AI 对话、所见即所得正文、模板、编译和导出区域。",
    category: "research-ai",
    kind: "page",
    status: "current",
    audience: ["论文作者", "研究者", "学生"],
    aliases: ["Prism 界面", "智能写作工作区", "LaTeX 写作界面"],
    sourcePaths: [
      "frontend-user/src/features/prism/pages/PrismPage.tsx",
      "frontend-user/src/features/prism/components/PrismHome.tsx",
      "frontend-user/src/features/prism/components/PrismWorkspaceV2.tsx",
      "frontend-user/src/features/prism/components/sidebar/PrismStructSidebar.tsx",
      "frontend-user/src/features/prism/components/PrismChatPanel.tsx",
    ],
    related: ["prism", "prism-writing-workflow", "latex-project-guide"],
    sections: [
      {
        id: "home",
        title: "项目首页",
        markdown: `Prism 首页左侧列出已有项目，主区可以新建项目或打开历史项目。项目名可以留空并以“未命名项目”开始，之后再重命名。地址中的 \`?p=<projectId>\` 表示当前打开的项目；项目不存在或不属于当前账户时，页面会返回项目列表，而不会挂载一个无法工作的空编辑器。`,
        embeds: [{ id: "prism-home" }],
      },
      {
        id: "workspace",
        title: "工作区的三部分",
        markdown: `进入现行结构化项目后，左侧栏显示文章大纲、已插入配图和本项目的对话历史；中间栏是 AI 写作对话；右侧是可直接编辑的所见即所得文档。标题、摘要、关键词与正文都属于同一篇稿件，不依附于某一条对话，因此新建或切换对话不会另复制一篇论文。`,
        embeds: [{ id: "prism-workspace" }],
      },
      {
        id: "editing",
        title: "编辑、自动保存与 AI 改动",
        markdown: `正文修改会自动保存，顶栏会显示保存中、已保存或保存失败。向 AI 发出写作指令前，前端会先落库尚未保存的编辑，避免 AI 在旧稿上修改。默认模式会在 AI 一轮结束后应用改动并在正文中标出变化；开启“逐块审阅”后，本轮改动先进入确认层，用户可以在所见即所得文档中继续取舍，再选择应用或放弃。`,
      },
      {
        id: "tools-and-output",
        title: "模板、编译与导出",
        markdown: `顶栏提供新对话、目标模板、编译和导出 Word；编辑区工具栏负责插入图片、公式和文献引用。点击“编译”会生成或更新精确 PDF，成功后 PDF 面板自动展开并提供下载。LaTeX 正文错误可能出现“让 AI 修复”，但参考文献格式、服务异常或超时并不一定能靠改正文解决，界面会保留相应的重试提示。`,
        embeds: [
          { id: "prism-compile-states" },
          { id: "prism-document-insert-dialogs" },
        ],
      },
      {
        id: "project-boundary",
        title: "新版项目与旧项目",
        markdown: `新建项目使用结构化文档作为真相源，再由系统投影和编译为 LaTeX/PDF。历史裸 LaTeX 项目属于兼容轨，现行页面可能只允许查看、编译、导出或克隆升级；因此旧版文件树中的任意文件编辑能力不能当作新项目的主工作方式。`,
      },
    ],
  },
  {
    slug: "prism-writing-workflow",
    title: "怎样完成一次智能写作",
    summary:
      "从创建项目、确定写作目标到引用、审阅、编译和交付的一条完整 Prism 工作流。",
    category: "research-ai",
    kind: "rule",
    status: "current",
    audience: ["论文作者", "研究者", "学生"],
    aliases: ["Prism 完整流程", "智能写作流程", "AI 写论文"],
    sourcePaths: [
      "frontend-user/src/features/prism/components/PrismHome.tsx",
      "frontend-user/src/features/prism/components/PrismWorkspaceV2.tsx",
      "frontend-user/src/features/prism/components/PrismRevisionDialog.tsx",
      "frontend-user/src/features/prism/components/PrismTranslateDialog.tsx",
      "backend/internal/prism/struct_service.go",
    ],
    related: [
      "prism",
      "prism-interface-guide",
      "latex-project-guide",
      "citation-dialog",
    ],
    sections: [
      {
        id: "prepare",
        title: "第一步：先确定任务边界",
        markdown: `新建项目后，先写清文章类型、研究问题、目标读者、目标期刊或格式要求，以及哪些材料可以作为证据。若已有稿件，先把标题、摘要和主体结构放进文档；若从空白开始，先让 AI 帮助搭建提纲，而不是一次要求生成可投稿全文。目标模板影响排版，不会替你判断研究设计是否成立。`,
      },
      {
        id: "draft",
        title: "第二步：分阶段形成正文",
        markdown: `按“提纲 → 章节 → 段落 → 句面”的顺序推进，每轮告诉 AI 要改的范围、期望幅度和必须保留的数字、引用或公式。Prism 支持同一项目创建多条对话，适合把结构调整、翻译、数字核查和回复意见分开处理；这些对话共享当前文档，切换前应确认上一轮改动已经保存或完成审阅。`,
        embeds: [
          { id: "prism-writing-start" },
          { id: "prism-writing-tools-dialogs" },
        ],
      },
      {
        id: "evidence",
        title: "第三步：补齐证据、引用与素材",
        markdown: `需要引用时，从个人文献集加入真实论文并插入引用键；需要图和公式时使用编辑区入口，使它们进入结构化文档和编译链。AI 可以帮助解释、组织或改写材料，但不能把未经核对的论文、数字和统计结论当成事实。正式写入前，应打开原文确认作者、年份、结论和适用范围。`,
      },
      {
        id: "review",
        title: "第四步：逐轮审阅改动",
        markdown: `默认模式下，AI 改动会应用后在正文中留下可导航的变化标记；需要更强控制时打开逐块审阅，在确认层中保留、删改或放弃本轮。每一轮至少核对四件事：事实与引用是否对应、数字和公式是否未被改坏、论断强度是否超出证据、章节之间是否仍然连贯。不要把“AI 已应用”理解为“内容已经正确”。`,
        embeds: [{ id: "prism-history-inline-edit" }],
      },
      {
        id: "deliver",
        title: "第五步：编译、修正与交付",
        markdown: `选择目标模板并编译 PDF，检查页数、图表、公式、引用和换页效果。正文类 LaTeX 错误可以尝试有限的 AI 自动修复，参考文献或基础设施错误则按界面提示人工检查或重试。最后下载 PDF、导出 Word，并对照目标期刊的最新作者指南做一次人工验收；Prism 的成功编译只证明文件能生成，不代表内容已经满足投稿规范。`,
      },
    ],
  },
  {
    slug: "latex-project-guide",
    title: "什么是 LaTeX 工程",
    summary:
      "理解 LaTeX 工程的组成和优势，以及 Prism、内置模板与期刊模板下载之间的真实关系。",
    category: "research-ai",
    kind: "overview",
    status: "current",
    audience: ["论文作者", "LaTeX 初学者", "研究者"],
    aliases: ["LaTeX 项目", "TeX 工程", "Prism 与 LaTeX", "期刊 LaTeX 模板"],
    sourcePaths: [
      "frontend-user/src/features/prism/components/PrismWorkspaceV2.tsx",
      "frontend-user/src/shared/components/JournalSubmissionCard.tsx",
      "backend/internal/prism/projector.go",
      "backend/internal/prism/texclient.go",
      "backend/internal/prism/model.go",
    ],
    related: [
      "prism",
      "prism-interface-guide",
      "prism-writing-workflow",
      "journal-submission-resources",
    ],
    sections: [
      {
        id: "definition",
        title: "LaTeX 工程包含什么",
        markdown: `传统 LaTeX 工程不只是一个 PDF，通常由正文源文件、文档类或样式、参考文献数据库、图片等素材共同组成，再由编译器生成最终版面。源内容、引用和素材之间存在路径与标识关系，所以移动、缺失或改名其中一项都可能导致编译失败。PDF 是一次编译产物，不是工程本身。`,
      },
      {
        id: "benefits",
        title: "LaTeX 的主要好处",
        markdown: `LaTeX 适合长篇学术文档：内容与排版规则相对分离，公式、编号、交叉引用和参考文献可以统一管理，同一份内容也能按模板重新排版。它的代价是编译链更严格，类文件、宏包、引用条目和特殊字符都可能产生错误；因此“格式自动化”并不等于“无需检查”。`,
      },
      {
        id: "prism-relation",
        title: "Prism 与 LaTeX 的关系",
        markdown: `现行 Prism 新项目不把一棵任意的 \`.tex\` 文件目录直接暴露为主编辑面，而是以结构化文档保存标题、正文、引用和素材，再由后端投影成 LaTeX 并送入隔离编译服务。用户在所见即所得界面写作，同时仍能获得目标模板、公式、引用和 PDF 编译结果。历史裸 LaTeX 项目已经进入只读兼容轨，不能据此推断新项目支持任意文件级编辑。`,
      },
      {
        id: "journal-template",
        title: "从期刊详情下载模板",
        markdown: `部分期刊详情会显示“投稿须知”或“LaTeX 模板”。只有上游确实提供相应资源时才显示；当前下载由 Scholay 后端代理，LaTeX 模板以 \`.zip\` 提供，并受 Max 会员权限控制。这个下载动作与 Prism 的目标模板选择是两条独立链路：下载压缩包不会自动导入 Prism，也不会自动把当前稿件变成该期刊的合规投稿文件。`,
      },
      {
        id: "final-check",
        title: "交付前的边界",
        markdown: `Prism 的模板列表由后端当前配置提供，期刊下载资源则来自期刊数据源，两者可能在版本和覆盖面上不同。投稿前应以目标期刊当时发布的作者指南、类文件版本和必交材料为准，并逐项核对 PDF、源文件、参考文献、图片授权和补充材料。`,
      },
    ],
  },
  {
    slug: "manuscript-vs-publication",
    title: "稿件与出版物有什么区别",
    summary:
      "区分作者正在写作或送审的稿件，与已经形成公开书目信息的出版物记录。",
    category: "research-ai",
    kind: "overview",
    status: "current",
    audience: ["论文作者", "研究者", "学生"],
    aliases: ["Manuscript vs Publication", "稿件", "出版物", "论文版本"],
    sourcePaths: [
      "frontend-user/src/features/prism/components/PrismWorkspaceV2.tsx",
      "frontend-user/src/features/peer-review/components/wizard/UploadStep.tsx",
      "frontend-user/src/features/peer-review/components/wizard/FinalReviewStep.tsx",
      "frontend-user/src/features/browser/components/PaperDetailPane.tsx",
      "frontend-user/src/features/browser/components/paper-detail/PaperMetadataBlock.tsx",
    ],
    related: ["prism", "peer-review", "paper", "peer-review-workflow-guide"],
    sections: [
      {
        id: "definitions",
        title: "两个词指向不同阶段",
        markdown: `稿件是作者正在创作、修改、准备提交或接受评议的版本，可以还没有期刊、卷期、页码或正式发布日期。出版物是已经公开发布并形成书目信息的研究成果记录，通常带有作者、期刊或会议、年份以及 DOI 等标识。两者可能内容相近，但不能仅凭标题相同就认定是同一个版本。`,
      },
      {
        id: "product-surfaces",
        title: "在 Scholay 中分别出现在哪里",
        markdown: `Prism 项目和智能审稿上传区处理的是用户自己的稿件：内容可继续编辑，元数据也可能由 AI 识别后再由用户修正。文献搜索与论文详情主要展示来自学术数据源或个人文献集的论文记录，包括摘要、作者、发表时间、期刊、引用和参考文献等信息。把稿件上传到个人空间或智能审稿，不会自动把它登记为公开出版物。`,
      },
      {
        id: "version-control",
        title: "版本与引用要分别核对",
        markdown: `预印本、作者接受稿和出版社最终版可能同时存在，页码、图表、补充材料甚至结论措辞都可能变化。写作时要记录自己实际阅读和引用的是哪个版本；正式引用应核对 DOI、发表状态和目标格式。Prism 的项目版本、智能审稿的提交记录和论文详情中的出版记录是不同数据对象，不会自动互相覆盖。`,
      },
      {
        id: "review-boundary",
        title: "AI 审稿不会改变发表状态",
        markdown: `智能审稿只对上传稿件生成模拟评议和修改建议。页面中的“投递”“录用”“返修”或“拒稿”是 Scholay 内部 AI 工作流的表达，不是期刊、学校或出版社发出的正式回执，也不会使稿件成为出版物。真实投稿、同行评审、录用和出版仍需在相应机构的正式系统中完成。`,
      },
    ],
  },
  {
    slug: "peer-review-workflow-guide",
    title: "智能审稿操作流程",
    summary:
      "选择期刊论文或毕业论文，完成四步材料核对，并理解 AI 评议任务的运行状态与边界。",
    category: "research-ai",
    kind: "rule",
    status: "current",
    audience: ["论文作者", "研究生", "研究者"],
    aliases: ["智能审稿流程", "期刊论文审稿", "毕业论文审稿", "AI 盲审"],
    sourcePaths: [
      "frontend-user/src/features/peer-review/pages/SubmissionLandingPage.tsx",
      "frontend-user/src/features/peer-review/pages/JournalWizardPage.tsx",
      "frontend-user/src/features/peer-review/pages/ThesisWizardPage.tsx",
      "frontend-user/src/features/peer-review/components/wizard/UploadStep.tsx",
      "frontend-user/src/features/wiki/embeds/WikiEmbedPeerReviewWizard.tsx",
      "backend/internal/peerreview/service.go",
    ],
    related: [
      "peer-review",
      "peer-review-results-guide",
      "peer-review-dimensions-guide",
      "manuscript-vs-publication",
    ],
    sections: [
      {
        id: "scope",
        title: "先选择论文场景",
        markdown: `入口分为“期刊投稿”和“毕业审稿”两条模拟流程。期刊论文按目标期刊或通用 STM 场景组织评议；毕业论文按学校、学位和学科背景组织评议。这里的“论文类型”指产品流程的期刊论文与毕业论文；期刊流程中还可以把稿件元数据标为 Research、Review 或 Short Communication，两套分类不要混为一谈。`,
        embeds: [{ id: "peer-review-entry" }],
      },
      {
        id: "journal-flow",
        title: "期刊论文的四步流程",
        markdown: `第 1 步上传一份 \`.docx\` 或 PDF 主稿及可选附件；第 2 步核对 AI 识别的标题、摘要、关键词和稿件类型，并选择或自定义目标期刊；第 3 步检查 AI 起草的 Cover Letter；第 4 步回看全部材料并确认开始评议。当前硬上限为主稿 50 MiB、附件每个 30 MiB、附件最多 10 个；真正校验以后端和上传区即时提示为准。`,
        embeds: [{ id: "peer-review-wizard" }],
      },
      {
        id: "thesis-flow",
        title: "毕业论文的四步流程",
        markdown: `第 1 步同样上传主稿与附件；第 2 步核对稿件元数据，并填写学校、学位与学科信息；第 3 步检查面向评阅场景的信件；第 4 步确认材料并开始评议。学校、学位和学科是 AI 的场景背景，不代表真实院校已经收到论文，也不代表已进入学校的正式盲审系统。`,
      },
      {
        id: "runtime",
        title: "提交后的运行阶段",
        markdown: `记录主状态按草稿 → 排队 → 审稿中 → 已完成或失败推进。系统先通读材料并编排方法论视角，再依次形成审稿人 A、B、C 和主审报告；详情页会实时显示当前阶段。失败时已完成的部分意见可以保留，重试用于补齐未完成部分。配额不足而未真正开始时，系统会保留稿件和已填信息。`,
        embeds: [{ id: "peer-review-progress" }],
      },
      {
        id: "not-a-submission",
        title: "它不是正式投稿或盲审",
        markdown: `点击最终确认只会在 Scholay 内部启动 AI 模拟评议，不会把稿件发送给期刊编辑部、学校、导师或出版社。页面生成的投稿编号、成功提示、审稿人、主审、处理时间和决议均属于产品内工作流，不是外部机构回执。不要据此宣称“已投稿”“已送审”或“已录用”；正式流程必须另行在目标机构的系统中完成。`,
        embeds: [{ id: "peer-review-submit-success" }],
      },
    ],
  },
  {
    slug: "peer-review-results-guide",
    title: "智能审稿结果怎么看",
    summary:
      "阅读编辑部初审、三位 AI 审稿人和主审决议，并正确理解录用、返修与拒稿。",
    category: "research-ai",
    kind: "page",
    status: "current",
    audience: ["智能审稿用户", "论文作者", "研究生"],
    aliases: ["审稿结果", "录用返修拒稿", "主审决议", "审稿分页"],
    sourcePaths: [
      "frontend-user/src/features/peer-review/pages/RecordDetailPage.tsx",
      "frontend-user/src/shared/components/peer-review-record/StatusGrid.tsx",
      "frontend-user/src/shared/components/peer-review-record/EditorialCheckPanel.tsx",
      "frontend-user/src/shared/components/peer-review-record/ChiefVerdictPanel.tsx",
      "frontend-user/src/shared/lib/peer-review/recommendation.ts",
    ],
    related: [
      "peer-review",
      "peer-review-workflow-guide",
      "peer-review-dimensions-guide",
    ],
    sections: [
      {
        id: "tabs",
        title: "初审、审稿人与终审分页",
        markdown: `结果详情使用五个页签：编辑部初审、审稿人 A、审稿人 B、审稿人 C、主审决议。顶部状态格显示每一阶段是否已生成报告；审稿进行中时，页面默认跟随当前正在等待的页签，用户手动切到其他页后会停留在那里。三位审稿人的意见彼此独立，主审页再对三份意见逐一回应并形成综合结论。`,
        embeds: [{ id: "peer-review-result-overview" }],
      },
      {
        id: "decisions",
        title: "录用、返修与拒稿",
        markdown: `系统内部按修改严重度记录“小修、大修、拒稿”，界面对作者显示为“（修改后）录用、返修、拒稿”。绿色表示建议修改后录用，琥珀色表示需要较大返修，红色表示模拟拒稿。它们只是 AI 对当前稿件的建议等级，不是目标期刊或学校的正式录用、返修通知或拒稿信。`,
      },
      {
        id: "reviewer-output",
        title: "审稿人页看什么",
        markdown: `每位审稿人页包含综合分、推荐等级、四维度评分、逐句意见、整体性评价和综合理由。逐句意见会标出位置、维度与严重度，并把原句、问题、同行常见处理和修改建议分开。先处理“必改”，再判断“建议”和“参考”是否适合自己的研究设计；不要无差别接受所有改写。`,
        embeds: [{ id: "peer-review-report" }],
      },
      {
        id: "chief-output",
        title: "主审页看什么",
        markdown: `主审不是简单平均三位分数，而是对 A、B、C 的意见分别给出同意程度和复审理由，最后汇总决议、必改清单、建议和面向作者的摘要。界面还可能展示 AI 生成的修订期限；该期限仅用于本次模拟的行动建议，不是外部编辑部规定的返修截止日。`,
      },
      {
        id: "editorial-warning",
        title: "编辑部初审页的特殊边界",
        markdown: `当前“编辑部初审”是产品中的固定演示层：提交成功即按约定显示通过，查重率、AIGC 率、排版符合度和选题匹配度等数值来自前端预设展示，不是对这份稿件执行真实检测后得到的测量结果。它不能作为查重报告、AIGC 检测证明、排版验收或期刊送审凭证。`,
        embeds: [{ id: "peer-review-editorial-check" }],
      },
    ],
  },
  {
    slug: "peer-review-dimensions-guide",
    title: "智能审稿的维度与评价方式",
    summary:
      "理解科学性、严谨性、创新性、可读性四维评分，以及原句、问题与建议之间的关系。",
    category: "research-ai",
    kind: "overview",
    status: "current",
    audience: ["论文作者", "研究生", "智能审稿用户"],
    aliases: ["审稿维度", "四维评分", "原句与建议", "逐句意见"],
    sourcePaths: [
      "backend/internal/peerreview/persona_schema.go",
      "backend/internal/peerreview/output.go",
      "frontend-user/src/shared/lib/peer-review/types.ts",
      "frontend-user/src/shared/components/peer-review-record/ReviewerDetailPanel.tsx",
      "frontend-user/src/shared/components/peer-review-record/ChiefVerdictPanel.tsx",
    ],
    related: [
      "peer-review",
      "peer-review-workflow-guide",
      "peer-review-results-guide",
    ],
    sections: [
      {
        id: "four-dimensions",
        title: "四个结构化维度",
        markdown: `每位 AI 审稿人都按科学性、严谨性、创新性和可读性给出等级与解释。科学性关注问题、证据和结论是否成立；严谨性关注研究设计、方法、统计与可复核性；创新性关注与相关工作的差异及贡献；可读性关注结构、术语、论证和图表表达。具体审查重点还会随稿件领域与审稿视角调整。`,
      },
      {
        id: "grades-and-score",
        title: "等级、综合分与推荐",
        markdown: `单项等级使用 A+ 到 D 的等级序列，报告另给 0–100 综合分。当前输出契约要求综合分与内部建议自洽：75 分及以上对应小修，50–74 分对应大修，低于 50 分对应拒稿；界面再把它们转成“（修改后）录用、返修、拒稿”。这是一套产品内的模拟分档，不是任何期刊、学校或学科共同采用的官方评分线。`,
      },
      {
        id: "line-comments",
        title: "原句、问题与建议如何配对",
        markdown: `逐句意见先用“位置”定位章节、图表或段落，再以“原句”摘录稿件中的对应文字；其后依次说明问题、同行常见处理和可执行建议。原句用于帮助作者找到修改对象，不代表被引用的整句话都错误；建议是候选处置，不应脱离上下文直接替换。每条还会标为必改、建议或参考，便于安排优先级。`,
      },
      {
        id: "macro-and-chief",
        title: "整体性评价与主审汇总",
        markdown: `除逐句意见外，审稿人还会针对章节比例、证据—结论链条和叙事等宏观方面给出立场与说明。主审随后复核三位审稿人的意见，区分全部同意、部分同意或有所保留，并整理必改项和建议项。不同层级承担不同任务：维度用于扫描质量面，逐句意见用于定位，整体评价用于看结构，主审用于形成行动优先级。`,
      },
      {
        id: "limitations",
        title: "评价的使用边界",
        markdown: `分数、等级、原句摘录和建议都由 AI 依据可读取到的稿件内容生成，可能遗漏上下文、误判领域惯例或引用不完整材料。超长或难以解析的文档也可能限制覆盖范围。修改前应回到原稿、数据、代码、真实文献和目标机构规范逐项核对；涉及伦理、统计、法律或专业事实时，应由合适的人类专家复核。`,
      },
    ],
  },
];
