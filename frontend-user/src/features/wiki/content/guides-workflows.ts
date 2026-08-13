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
        markdown: `打开智能助手后，你会先看到一个空白的新对话，如下图所示。可以直接在输入框描述任务，也可以从制作 PPT、科研绘图和数据分析中选择一个模板。模板只是帮你更快进入对应工作流，不会替你自动发送消息。

只有当你发出第一条消息、上传文件或引用文献后，系统才会创建并保存这次会话。此后刷新页面或从历史记录返回，才能继续查看同一任务。`,
        embeds: [{ id: "claw-empty-state" }],
      },
      {
        id: "layout",
        title: "从左到右看界面",
        markdown: `进入已有会话后，界面分成三个工作区。左侧放文献与文件，中间显示对话，右侧集中展示生成的文件。下图展示的是一条已打开的桌面会话；会话历史在对话区顶部，可以从那里切换、重命名或删除会话。

桌面端可以拖动分隔线调整宽度。屏幕较窄时，右侧文件区会收进抽屉，需要时再打开，因此不会遮住底部输入框。`,
        embeds: [{ id: "claw-workspace" }],
      },
      {
        id: "composer",
        title: "输入框与上下文工具",
        markdown: `底部输入框不仅用来写问题。下图展示了展开后的输入区：点击“+”可以上传附件，从个人文献集加入论文，或选择已经安装的 Skill；模型选择也在输入框内。文件仍在上传时先不要发送，只有显示上传完成的附件和成功加入的文献才会进入这一轮对话。

Skill 相当于给助手补充一套做事方法，不会改变你的会员档位，也不会自动获得额外工具权限。`,
        embeds: [{ id: "claw-context-composer" }],
      },
      {
        id: "artifacts",
        title: "交付物、预览与下载",
        markdown: `助手生成文档、表格、演示稿或其他文件后，右侧扩展区会列出这些交付物。下图展示了文件已经生成、可以预览或下载的状态；科研绘图通常也会直接出现在对应的对话轮次中。

对话里的文字说明不是文件本身。准备继续编辑、发送给他人或正式提交时，请下载并打开交付文件，核对内容、格式和引用。`,
        embeds: [{ id: "claw-artifact-output" }],
      },
      {
        id: "reading-states",
        title: "如何识别运行状态",
        markdown: `生成过程中，你可能看到“正在思考”、工具执行、停止中、重新连接或任务停滞等提示。下图只展示“长时间没有新内容”的停滞提醒：这时可以继续等待，也可以主动停止；提示出现本身不会打断任务。

连接断开时先等页面尝试恢复，不要在仍显示处理中时反复发送同一条消息。额度不足而没有真正送达的消息不会显示成已发送。即使任务顺利完成，引用、计算、图表和研究结论仍应回到原始材料核对。`,
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
      "frontend-user/src/features/prism/components/PrismLivePreview.tsx",
      "frontend-user/src/features/prism/components/sidebar/PrismStructSidebar.tsx",
      "frontend-user/src/features/prism/components/PrismChatPanel.tsx",
    ],
    related: ["prism", "prism-writing-workflow", "latex-project-guide"],
    sections: [
      {
        id: "home",
        title: "项目首页",
        markdown: `打开 Prism 后，左侧会列出已有项目，主区用于新建或继续最近的项目。下图展示的是还没有选中项目的首页；点击主区按钮即可开始新项目，点击左侧条目则继续已有项目。项目名可以暂时留空，系统会先以“未命名项目”保存，你可以稍后再改名。

如果链接里的项目已被删除，或不属于当前账户，页面会回到项目列表。此时从列表重新选择项目即可，不需要反复刷新失效的地址。`,
        embeds: [{ id: "prism-home" }],
      },
      {
        id: "workspace",
        title: "工作区的三部分",
        markdown: `打开项目后，工作区分为三栏：左侧查看大纲、配图和对话历史，中间与 AI 讨论写作任务，右侧直接编辑正文。下图展示的是正文和对话都已打开的状态。标题、摘要、关键词和正文始终属于同一篇稿件；新建或切换对话，只会改变聊天上下文，不会复制一份新的论文。`,
        embeds: [{ id: "prism-workspace" }],
      },
      {
        id: "editing",
        title: "编辑、自动保存与 AI 改动",
        markdown: `你在正文中的修改会自动保存，顶栏会显示“保存中”“已保存”或“保存失败”。向 AI 提交写作任务时，系统会先保存尚未同步的内容，避免 AI 基于旧稿修改。

默认模式会直接应用 AI 的改动，并在正文中标出变化。如果希望逐段确认，请先打开“逐块审阅”；这一轮修改会暂存在确认层，你可以逐项保留、调整或放弃。下图展示 AI 写入后生成的整篇只读预览，正文引用与文末参考文献保持同源。`,
        embeds: [{ id: "prism-live-preview" }],
      },
      {
        id: "tools-and-output",
        title: "模板、编译与导出",
        markdown: `顶栏可以新建对话、选择目标模板、编译 PDF 或导出 Word；编辑区工具栏用于插入图片、公式和文献引用。第一张图只展示一次 LaTeX 内容编译失败的可恢复状态，第二张图展示从个人文献集插入引用的窗口，第三张图展示公式编辑窗口。

编译成功后，PDF 面板会自动展开并提供下载。正文中的 LaTeX 错误有时可以交给 AI 尝试修复；如果问题来自参考文献、服务异常或超时，请按页面提示检查或重试。`,
        embeds: [
          { id: "prism-compile-states" },
          { id: "prism-document-insert-dialogs" },
          { id: "prism-math-editor-dialog" },
        ],
      },
      {
        id: "project-boundary",
        title: "新版项目与旧项目",
        markdown: `新建项目会按标题、章节、引用和素材分别保存，再由系统生成 LaTeX 和 PDF。较早创建的 LaTeX 文件项目会继续保留，但目前可能只能查看、编译、导出或复制为新版项目；旧项目里的文件编辑方式不适用于新项目。`,
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
      "frontend-user/src/features/prism/components/PrismWritingProfileDialog.tsx",
      "frontend-user/src/features/prism/components/PrismRevisionDialog.tsx",
      "frontend-user/src/features/prism/components/PrismTranslateDialog.tsx",
      "frontend-user/src/features/prism/components/PrismNumbersDialog.tsx",
      "frontend-user/src/features/prism/components/MathEditorDialog.tsx",
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
        markdown: `新建项目后，先写下文章类型、研究问题、目标读者、目标期刊或格式要求，以及可以使用哪些材料。已有稿件时，先导入或整理标题、摘要和主体结构；从空白开始时，先让 AI 帮你搭提纲，不要一开始就要求生成整篇可投稿论文。下图展示写作画像窗口，用于明确文体、学科语气和材料来源。模板只负责排版，不能替你判断研究设计是否成立。`,
        embeds: [{ id: "prism-writing-profile-dialog" }],
        blocks: [
          { type: "markdown" },
          { type: "embeds" },
          {
            type: "prompt-tabs",
            group: {
              id: "prism-research-brief",
              title: "按研究类型选择提问模板",
              description:
                "选择最接近的学科场景，替换【】中的内容，再交给智能写作帮助你收敛问题和提纲。",
              options: [
                {
                  id: "empirical-paper",
                  label: "实证论文",
                  prompt: `先不要写整篇正文。请根据以下信息设计一份可审阅的论文提纲：
文章类型：【类型】
研究问题：【问题】
目标读者/期刊：【对象】
可使用材料：【材料】
不能越过的证据边界：【边界】

为每一节写明：本节要回答的问题、需要使用的证据、与前后章节的逻辑关系、作者必须补充的信息。另请明确研究假设、样本与变量、识别或分析方法、稳健性检查，以及结论可以外推的范围。不要生成不存在的数据、引用或研究结果。`,
                },
                {
                  id: "literature-review",
                  label: "文献综述",
                  prompt: `先不要写整篇正文。请根据以下信息设计一份可审阅的论文提纲：
文章类型：【类型】
研究问题：【问题】
目标读者/期刊：【对象】
可使用材料：【材料】
不能越过的证据边界：【边界】

为每一节写明：本节要回答的问题、需要使用的证据、与前后章节的逻辑关系、作者必须补充的信息。另请明确综述范围、检索概念、纳入与排除条件、质量评价方式、证据冲突和研究空白。不要把尚未执行的检索写成已经完成，也不要生成不存在的数据、引用或研究结果。`,
                },
                {
                  id: "humanities-theory",
                  label: "人文理论",
                  prompt: `先不要写整篇正文。请根据以下信息设计一份可审阅的论文提纲：
文章类型：【类型】
研究问题：【问题】
目标读者/期刊：【对象】
可使用材料：【材料】
不能越过的证据边界：【边界】

为每一节写明：本节要回答的问题、需要使用的证据、与前后章节的逻辑关系、作者必须补充的信息。另请定义核心概念，区分文本、史料与二手研究，呈现从材料到解释的推理链，并列出需要回应的对立解释。不要生成不存在的数据、引用、史料或研究结果。`,
                },
                {
                  id: "engineering-method",
                  label: "工程方法",
                  prompt: `先不要写整篇正文。请根据以下信息设计一份可审阅的论文提纲：
文章类型：【类型】
研究问题：【问题】
目标读者/期刊：【对象】
可使用材料：【材料】
不能越过的证据边界：【边界】

为每一节写明：本节要回答的问题、需要使用的证据、与前后章节的逻辑关系、作者必须补充的信息。另请明确系统输入与输出、方法模块、基线、评价指标、实验与消融、误差来源和复现条件。没有数据支持的性能表述应标为待验证假设；不要生成不存在的数据、引用或研究结果。`,
                },
              ],
            },
          },
          {
            type: "tip",
            tip: {
              text: "提问模板是任务说明的起点。发送前应替换占位内容，并删除不适用于当前研究设计的要求。",
            },
          },
        ],
      },
      {
        id: "draft",
        title: "第二步：分阶段形成正文",
        markdown: `按“提纲 → 章节 → 段落 → 句子”的顺序推进。每次只交代一个清晰任务，并说明修改范围、改动幅度，以及必须保留的数字、引用或公式。下方三张图依次展示空项目的任务入口、质量检查窗口和整篇翻译窗口。

同一项目可以建立多条对话。你可以把结构调整、翻译、数字核查和回复审稿意见分开处理，但它们仍共享同一篇正文；切换对话前，先确认上一轮改动已经保存或审阅完毕。`,
        embeds: [
          { id: "prism-writing-start" },
          { id: "prism-writing-tools-dialogs" },
          { id: "prism-translate-dialog" },
        ],
        blocks: [
          { type: "markdown" },
          { type: "embeds" },
          {
            type: "prompt-tabs",
            group: {
              id: "prism-staged-drafting",
              title: "按写作阶段选择提问模板",
              description:
                "这些场景共享同一原则：说明修改对象、允许改动的范围，以及不能被改坏的证据。",
              options: [
                {
                  id: "local-rewrite",
                  label: "局部改写",
                  prompt: `只修改【章节 / 段落 / 句子】，不要改动其他内容。

修改目标：【压缩 / 扩写 / 澄清 / 调整学术语气】
原文：【粘贴文本】
必须保留的数字、公式、引用标记和专有名词：【内容】
允许调整的幅度：【轻微 / 中等 / 较大】
目标长度：【长度】

请先说明准备修改什么，再给出修订稿。不要增加原文和已提供材料之外的新事实、数据或引用；若发现证据跳跃，请单独标出，不要自行补造。`,
                },
                {
                  id: "structural-reorganization",
                  label: "结构重组",
                  prompt: `请重组【章节名称】的论证结构，不要改变研究问题、证据内容或结论强度。

现有正文：【粘贴文本】
本节必须回答的问题：【问题】
必须保留的材料、数字和引用：【内容】
与上一节和下一节的关系：【关系】
目标结构或篇幅：【要求】

请依次输出：当前结构问题、建议的新顺序、每一部分承担的论证任务、重组后的正文。没有证据支持的连接请标为“待作者补充”，不要用过渡句掩盖推理缺口。`,
                },
                {
                  id: "translation",
                  label: "翻译",
                  prompt: `请把以下内容从【原语言】翻译为【目标语言】，保持【学科】论文的正式语气。

原文：【粘贴文本】
术语表与固定译法：【内容】
必须原样保留的公式、变量、数字、引用标记和专有名词：【内容】
目标读者或期刊：【对象】

请保持原有论证强度和段落关系，不新增解释或引用。对存在多种译法的关键术语，先列出选择及理由；无法确定的内容保留原文并标记，不要猜测。`,
                },
                {
                  id: "number-check",
                  label: "数字核查",
                  prompt: `请只核查以下内容中的数字、单位、百分比、样本量、统计量、公式和表图引用，不改写其他文字。

待核查正文：【粘贴文本】
对应数据、表格或计算依据：【粘贴材料】
允许使用的舍入与显著位规则：【规则】
必须保持的变量和单位约定：【约定】

请逐项列出：正文值、依据值、是否一致、可能原因、建议修改。区分计算错误、舍入差异、口径差异和材料不足；没有依据时写“无法核对”，不要推算或补造结果。`,
                },
                {
                  id: "review-response",
                  label: "回复审稿",
                  prompt: `请协助我处理一条审稿或导师意见，先判断问题，再提出修改方案，不要直接承诺无法证明的改动。

意见原文：【】
稿件对应位置：【】
现有正文与证据：【】
可以补充的分析或材料：【】
不能改变的研究边界：【】

请输出：
1. 对意见核心诉求的准确复述；
2. 拟修改内容与位置；
3. 修改后的候选文本；
4. 给审稿人或导师的逐点回应；
5. 若无法完全满足，说明原因和替代处理。

不要虚构新增实验、数据或文献。`,
                },
              ],
            },
          },
        ],
      },
      {
        id: "evidence",
        title: "第三步：补齐证据、引用与素材",
        markdown: `需要引用时，从个人文献集选择论文并插入引用；需要图片或公式时，使用编辑区对应入口，让素材进入正文和编译结果。下方两张图分别展示从个人文献集选择论文的引用窗口和公式编辑窗口。

AI 可以帮助解释、组织或改写材料，但不能替你确认事实。正式写入前，请打开原文核对作者、年份、结论和适用范围。`,
        embeds: [
          { id: "prism-document-insert-dialogs" },
          { id: "prism-math-editor-dialog" },
        ],
        blocks: [
          { type: "markdown" },
          { type: "embeds" },
          {
            type: "article-link",
            card: {
              articleSlug: "literature-library",
              title: "先把确认过的论文放进个人文献集",
              description:
                "从个人文献集插入论文，可以沿用已经核对的元数据与 PDF 状态，减少手工复制时的信息缺失。",
              icon: "resource",
            },
          },
          {
            type: "article-link",
            card: {
              articleSlug: "citation-dialog",
              title: "引用格式不能替代元数据核对",
              description:
                "了解 Prism 与论文详情使用的引用格式、默认偏好，以及正式提交前仍须核对的字段。",
              icon: "book-open",
            },
          },
        ],
      },
      {
        id: "review",
        title: "第四步：逐轮审阅改动",
        markdown: `默认模式会直接应用 AI 的修改，并在正文中留下可定位的变化标记。如果改动较大，先打开“逐块审阅”，再逐项保留、调整或放弃。下方三张图依次展示版本历史、逐条回应修改意见和数字校验结果。

每一轮至少检查四件事：事实是否有对应来源，数字和公式是否被改坏，表述强度是否超过证据，以及前后章节是否连贯。“已经应用”只代表修改写进了正文，不代表内容已经正确。`,
        embeds: [
          { id: "prism-history-inline-edit" },
          { id: "prism-revision-dialog" },
          { id: "prism-numbers-dialog" },
        ],
        blocks: [
          { type: "markdown" },
          { type: "embeds" },
          {
            type: "tip",
            tip: {
              text: "“已经应用”只表示改动写入正文，不表示事实、数字、公式和引用已经正确。大范围修改应优先使用逐块审阅。",
            },
          },
        ],
      },
      {
        id: "deliver",
        title: "第五步：编译、修正与交付",
        markdown: `选择目标模板并编译 PDF，逐项检查页数、图表、公式、引用和换页。下图只展示一次 LaTeX 内容错误导致的编译失败状态；可以先根据提示定位正文，再尝试让 AI 修复。参考文献、服务异常或超时问题则需要按页面提示人工检查或重试。

最后下载 PDF 或导出 Word，并对照目标期刊最新的作者指南再检查一次。编译成功只说明文件能够生成，不代表内容和格式已经满足投稿要求。`,
        embeds: [{ id: "prism-compile-states" }],
        blocks: [
          { type: "markdown" },
          { type: "embeds" },
          {
            type: "tip",
            tip: {
              text: "编译成功只证明当前文件能够生成。投稿前仍需按期刊官网核对作者指南、模板版本、必交材料和引用要求。",
              link: {
                label: "查看期刊投稿资源的使用边界",
                articleSlug: "journal-submission-resources",
                sectionId: "boundary",
              },
            },
          },
          {
            type: "next-steps",
            group: {
              title: "下一步",
              description: "文件生成后，根据当前阶段继续预审或准备投稿材料。",
              items: [
                {
                  articleSlug: "peer-review-workflow-guide",
                  title: "用智能审稿做投稿前预审",
                  description:
                    "上传最终候选稿，获得一份需要由作者继续核验的 AI 模拟评议。",
                  icon: "review",
                },
                {
                  articleSlug: "journal-submission-resources",
                  title: "核对期刊指南与模板",
                  description:
                    "回到目标期刊的现行要求，确认模板、格式、许可和必交材料。",
                  icon: "book-open",
                },
              ],
            },
          },
        ],
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
        markdown: `Prism 新项目会分别保存标题、正文、引用和素材，再自动生成 LaTeX 并编译 PDF。你可以在所见即所得界面中写作，同时使用目标模板、公式和引用。较早创建的纯 LaTeX 文件项目目前以只读方式保留，不能按旧方式继续编辑任意文件。`,
      },
      {
        id: "journal-template",
        title: "从期刊详情下载模板",
        markdown: `部分期刊详情会显示“投稿须知”或“LaTeX 模板”，只有确实存在相应资源时才会出现。LaTeX 模板以 \`.zip\` 压缩包提供，并受 Max 会员权限控制。下载压缩包不会自动导入 Prism，也不会自动把当前稿件变成符合该期刊要求的投稿文件。`,
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
        markdown: `入口分为“期刊投稿”和“毕业审稿”两条模拟流程，下图展示的就是这两个起点。期刊论文按目标期刊或通用 STM 场景组织评议；毕业论文按学校、学位和学科背景组织评议。这里的“论文类型”指产品流程的期刊论文与毕业论文；期刊流程中还可以把稿件标为 Research、Review 或 Short Communication，两套分类不要混为一谈。`,
        embeds: [{ id: "peer-review-entry" }],
      },
      {
        id: "journal-flow",
        title: "期刊论文的四步流程",
        markdown: `第 1 步上传一份 \`.docx\` 或 PDF 主稿及可选附件；第 2 步核对 AI 识别的标题、摘要、关键词和稿件类型，并选择或自定义目标期刊；第 3 步检查 AI 起草的 Cover Letter；第 4 步回看全部材料并确认开始评议。下图展示的是第 2 步，已上传稿件并正在选择目标期刊。

主稿上限为 50 MiB，附件每个最多 30 MiB、最多 10 个；如果页面给出更具体的上传提示，以当时的提示为准。`,
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
        markdown: `提交后，任务会从草稿进入排队和审稿，最后显示完成或失败。下图展示的是审稿进行中的进度页：系统会先通读材料，再依次形成审稿人 A、B、C 和主审报告。失败时，已经完成的意见会保留，重试用于补齐其余部分。额度不足而未真正开始时，稿件和已填信息也会保留。`,
        embeds: [{ id: "peer-review-progress" }],
      },
      {
        id: "not-a-submission",
        title: "它不是正式投稿或盲审",
        markdown: `点击最终确认只会在 Scholay 内部启动 AI 模拟评议，不会把稿件发送给期刊编辑部、学校、导师或出版社。下图中的投稿编号和成功提示也只表示模拟任务已经建立，不是外部机构回执。

页面中的审稿人、主审、处理时间和决议同样属于产品内流程。不要据此宣称“已投稿”“已送审”或“已录用”；正式流程必须另行在目标机构的系统中完成。`,
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
        markdown: `结果详情使用五个页签：编辑部初审、审稿人 A、审稿人 B、审稿人 C、主审决议。下图展示的是报告已生成后的总览，顶部状态格可以确认每一阶段是否完成。审稿进行中时，页面默认跟随当前等待的页签；你手动切到其他页后，页面会停留在那里。三位审稿人的意见彼此独立，主审页再对三份意见逐一回应并形成综合结论。`,
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
        markdown: `每位审稿人页包含综合分、推荐等级、四维度评分、逐句意见、整体性评价和综合理由。下图展示的是一份审稿人报告；逐句意见会标出位置、维度与严重度，并把原句、问题、同行常见处理和修改建议分开。先处理“必改”，再判断“建议”和“参考”是否适合自己的研究设计；不要无差别接受所有改写。`,
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
        markdown: `下图中的“编辑部初审”是固定演示内容：提交成功后会按预设显示通过，查重率、AIGC 率、排版符合度和选题匹配度也不是针对这份稿件实际检测得出的结果。它不能作为查重报告、AIGC 检测证明、排版验收或期刊送审凭证。`,
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
