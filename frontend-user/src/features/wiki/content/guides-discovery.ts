import type { WikiArticle } from "../types";

export const discoveryGuideArticles: WikiArticle[] = [
  {
    slug: "literature-search-guide",
    title: "如何使用传统文献搜索",
    summary:
      "从关键词、数据源和筛选条件出发，得到可核对的论文清单，并把候选文献送入暂存、收藏或矩阵分析。",
    category: "discovery",
    kind: "page",
    status: "current",
    audience: ["研究者", "学生", "初次使用者"],
    aliases: ["传统搜索教程", "普通文献搜索", "关键词检索步骤"],
    sourcePaths: [
      "frontend-user/src/features/search/pages/SearchPage.tsx",
      "frontend-user/src/features/search/components/SearcherColumn.tsx",
      "frontend-user/src/features/search/components/SearchSidebar.tsx",
      "frontend-user/src/features/search/hooks/useUrlFilters.ts",
      "frontend-user/src/shared/lib/search-filters.ts",
      "frontend-user/src/features/wiki/embeds/WikiEmbedClassicSearchDock.tsx",
      "frontend-user/src/features/wiki/embeds/WikiEmbedClassicSearchFilters.tsx",
      "frontend-user/src/features/wiki/embeds/WikiEmbedReviewAndStage.tsx",
    ],
    related: [
      "academic-search",
      "staging-area",
      "literature-library",
      "matrix-analysis",
    ],
    sections: [
      {
        id: "prepare-query",
        title: "先确定检索问题",
        markdown: `传统搜索适合你已经能说出主题词、作者、方法、研究对象或目标期刊的场景。进入文献搜索页后选择“传统”，先用一组能代表研究核心的关键词起步；结果太少时删去过细的限定词，结果太杂时再补充对象、方法或场景。

搜索词、筛选、排序和页码都会写入当前 URL。返回搜索页时，页面会恢复最近一次有内容的检索状态，因此可以先打开论文详情，再回到原来的结果继续筛选。`,
        embeds: [{ id: "classic-search-dock" }],
      },
      {
        id: "search-and-refine",
        title: "提交检索并逐步收窄",
        markdown: `在搜索框输入关键词并提交，新关键词会从第 1 页开始。修改任一筛选条件都会重新查询；加载期间旧结果不会继续留在页面上冒充新结果。若没有命中，优先依次尝试：缩短关键词、改用更通用的同义词、放宽年份、清除期刊或类型限制、切换数据源。

不要把结果总数当作质量结论。传统搜索最多开放前 1,000 条结果的翻页窗口，越往后的相关性通常越低；如果需要不断深翻，通常应先改写查询或增加有效筛选。`,
        embeds: [{ id: "classic-search-filters" }],
      },
      {
        id: "review-and-stage",
        title: "核对结果并加入暂存区",
        markdown: `先看题名、作者、年份、来源期刊和摘要，再打开论文详情检查 DOI、引用与参考文献信息；有合法全文线索时再打开 PDF。论文卡上的引用量、期刊指标和开放获取状态来自当前数据快照，字段缺失不等于论文不存在，也不等于质量较低。

找到候选论文后，可以逐篇暂存，也可以把当前页批量加入暂存区。批量动作只作用于当前页，不会把全部检索结果一次加入。暂存区是本次检索的短期工作台，不是长期文献库。`,
        embeds: [{ id: "review-and-stage" }],
      },
      {
        id: "continue-workflow",
        title: "把候选清单转成研究材料",
        markdown: `初筛完成后有两条常见路径：需要长期保存时，把确认过的论文收藏到个人文献集；需要横向比较时，把暂存论文送入矩阵分析并设置比较维度。无论走哪条路径，AI 摘要、引用量和检索排序都只能帮助筛选，正式论证仍应回到论文原文、版本信息和可追溯出处。`,
      },
    ],
  },
  {
    slug: "smart-literature-search-guide",
    title: "如何使用智能文献搜索",
    summary:
      "用自然语言描述研究问题，让智能搜索拆解查询、调用学术检索工具并组织论文与证据，再通过追问逐步收敛。",
    category: "research-ai",
    kind: "page",
    status: "current",
    audience: ["登录用户", "研究者", "学生"],
    aliases: ["智能搜索教程", "AI 找论文", "自然语言文献检索"],
    sourcePaths: [
      "frontend-user/src/features/search/components/smart-search/SmartSearchPanel.tsx",
      "frontend-user/src/features/search/components/smart-search/SmartSearchHero.tsx",
      "frontend-user/src/features/search/components/smart-search/PaperListScroller.tsx",
      "frontend-user/src/features/search/api/smart-search.ts",
      "frontend-user/src/features/wiki/embeds/WikiEmbedSmartPaperGroup.tsx",
      "frontend-user/src/features/wiki/embeds/WikiEmbedSmartSearchDock.tsx",
      "frontend-user/src/features/wiki/embeds/WikiEmbedSmartSearchSession.tsx",
      "frontend-user/src/features/wiki/embeds/WikiEmbedComposerAttachments.tsx",
      "agent-skills/smart-search-skills/minicod-search-strategy/SKILL.md",
    ],
    related: [
      "smart-search",
      "academic-search",
      "staging-area",
      "claw",
      "ai-usage-quota",
    ],
    sections: [
      {
        id: "frame-the-question",
        title: "把需求写成可执行的问题",
        markdown: `智能搜索适合“我知道要解决什么，但还没有一组稳定关键词”的任务。进入文献搜索页，切换到“智能”，登录后在输入框说明研究对象、方法或现象、时间范围、希望得到的结果类型和数量。例如：“找近三年关于扩散模型医学影像重建的综述，并列出常用评价指标”。

避免只写“帮我找点论文”。约束越明确，系统越容易判断应该先宽搜、拆分概念还是沿引用关系扩展；若条件之间可能冲突，智能搜索也可能先提出澄清问题。`,
        embeds: [{ id: "smart-search-dock" }],
      },
      {
        id: "start-a-session",
        title: "开始并管理一次搜索会话",
        markdown: `空白页发送第一条消息时，系统才创建真实会话；回答会通过实时连接逐步返回。左侧会话列表保存不同研究问题的历史，顶部“新对话”用于开始一个不继承旧上下文的新任务。正在生成时不要重复发送；需要中止可使用停止动作，连接未就绪或消息未送达时按页面提示重试。

同一课题的收窄、改词和补充条件应留在同一会话中；完全不同的课题应新建会话，避免旧上下文干扰检索判断。`,
        embeds: [{ id: "smart-search-session" }],
      },
      {
        id: "guide-the-search",
        title: "用追问引导检索策略",
        markdown: `智能搜索会把问题拆成概念块，尝试同义词、不同来源、引用与参考关系或相关论文。第一轮结果不理想时，每次只改一个条件：例如要求换成英文学术术语、放宽年份、限定研究对象、补找奠基论文，或只保留近年的后续工作。这样可以判断究竟是哪一个条件造成漏检。

还可以上传文件或从个人文献集引用资料，让当前会话围绕已有材料继续找文献。引用只有元数据或摘要的论文时，系统并不等于读过全文；有 PDF 的引用与仅有摘要的引用应分别核对。`,
        embeds: [{ id: "composer-attachments" }],
      },
      {
        id: "inspect-and-stage",
        title: "检查论文组并暂存候选",
        markdown: `检索工具返回的论文会以结构化论文组展示。可以展开每张论文卡查看元数据，打开标准论文详情，并逐篇或一键把本组未暂存论文加入暂存区。暂存、收藏、期刊指标补全和论文详情与传统搜索使用同一套论文实体，不需要把题名手工复制到另一个页面。

智能回答是检索过程的组织结果，不是可以直接引用的证据。对准备写进论文的判断，应继续打开论文详情或全文，核对作者、年份、版本、数据和原句。`,
        embeds: [{ id: "smart-paper-group" }],
      },
      {
        id: "coverage-and-stop-rule",
        title: "判断覆盖边界和停止时机",
        markdown: `较稳妥的停止信号是：已经用至少两组术语或来源检索，既有奠基工作也有近期进展，继续一轮只反复返回已经见过的论文。此时应整理和阅读，而不是为了数量无限扩展。

当前智能搜索使用 Graph、Discovery 和 Medicine 等学术来源，不等于检索了知网、万方或维普。中文或本土主题覆盖不足时，应明确记录缺口，并到相应数据库补检；智能搜索不能把未查询的数据源说成已经覆盖。`,
      },
    ],
  },
  {
    slug: "pdf-chat-guide",
    title: "如何与 PDF 对话",
    summary:
      "在 Scholay Claw 中上传 PDF，再围绕方法、结果、证据或写作结构连续提问；这与只负责翻页阅读的 PDF 阅读器不同。",
    category: "research-ai",
    kind: "page",
    status: "current",
    audience: ["登录用户", "研究者", "学生"],
    aliases: ["PDF Chat", "PDF 问答", "论文对话", "上传 PDF 提问"],
    sourcePaths: [
      "frontend-user/src/features/claw/pages/ClawPage.tsx",
      "frontend-user/src/features/claw/components/chat/ChatComposer.tsx",
      "frontend-user/src/shared/hooks/useComposerAttachments.ts",
      "frontend-user/src/features/claw/hooks/makeAgentConversationHook.ts",
      "frontend-user/src/features/browser/components/PdfBrowserPane.tsx",
    ],
    related: [
      "claw",
      "claw-attachments-and-references",
      "pdf-reader",
      "literature-library",
    ],
    sections: [
      {
        id: "open-claw",
        title: "从智能助手进入，而不是从阅读器进入",
        markdown: `现行 PDF 问答入口是 Scholay Claw。登录后打开智能助手并开始新对话，再通过输入框的附件入口上传 PDF。仅仅在个人文献集或 PDF 阅读器中把文件打开，并不会自动把该文件加入 Claw 的当前会话。

如果准备比较多篇论文，建议先确定这次对话的任务范围，再上传真正需要的文件；不同课题使用不同会话，后续回看时更容易判断每个回答使用了哪些附件。`,
      },
      {
        id: "upload-pdf",
        title: "上传 PDF 并等待附件就绪",
        markdown: `选择文件后会立即上传，附件条会显示上传中、完成或失败。单个普通文件上限为 30 MB，一条消息最多 10 个附件；超过限制的文件会在发送前被拦截。新对话第一次上传会先建立会话，使 PDF 落到该会话的隔离工作目录中。

等附件显示完成后再发送问题。上传失败时先按附件上的错误提示重试；不要在文件仍处于上传中时反复点击发送。扫描版、版式复杂或文本层损坏的 PDF 可能难以解析，回答质量仍取决于文件本身的可读性。`,
      },
      {
        id: "ask-grounded-questions",
        title: "提出能回到原文的问题",
        markdown: `第一问应同时写明对象、范围和输出。例如：“只根据这篇 PDF，总结研究问题、样本、方法和主要结论；不确定的地方标出来”，或“找出作者对局限性的原文位置，并解释它对结论外推的影响”。

后续可以要求比较章节、解释图表、梳理变量关系或生成待核对的阅读笔记。若一次上传多篇，应使用文件名或论文题名指定对象，并要求分开列出每篇证据，避免把不同论文的结论混在一起。`,
      },
      {
        id: "reader-vs-chat",
        title: "PDF 阅读器与 PDF 对话的区别",
        markdown: `| 能力 | PDF 阅读器 | Claw 中的 PDF 对话 |
| --- | --- | --- |
| 主要用途 | 翻页、缩放和直接阅读 | 围绕上传文件连续提问 |
| 文件入口 | 个人文献集中的 PDF 鉴权流 | Claw 输入框附件上传 |
| 上下文 | 当前可视文件 | 当前 Claw 会话及其附件 |
| 产出 | 原始页面 | AI 回答、整理或后续任务 |

两者可以配合：在阅读器中核对页码、图表和公式，在 Claw 中组织问题和比较结果。但二者没有“打开阅读器即自动传给助手”的隐式同步。`,
        embeds: [{ id: "pdf-chat-workspace" }],
      },
      {
        id: "verify-answer",
        title: "把回答当作阅读辅助而非原文替代",
        markdown: `AI 可能遗漏脚注、表格限定、数学符号或扫描页，也可能把作者的讨论推断写得过于确定。对关键数字、样本量、显著性、原句和页码，应回到 PDF 阅读器逐项核对；引用时引用原论文，不引用对话回答。

如果回答没有说明依据，可以继续追问“这一点来自哪一节、哪张表或哪段原文”；仍无法定位时，把它标记为未证实，而不是继续让模型猜测。`,
      },
    ],
  },
  {
    slug: "search-entry-comparison",
    title: "传统搜索、智能搜索与智能助手怎么选",
    summary:
      "按任务是否已有关键词、是否需要检索规划，以及是否要处理文件和完成研究任务，在三个入口之间做选择。",
    category: "research-ai",
    kind: "page",
    status: "current",
    audience: ["所有研究者", "学生", "初次使用者"],
    aliases: ["搜索入口区别", "智能助手和智能搜索区别", "传统搜索和智能搜索"],
    sourcePaths: [
      "frontend-user/src/features/search/components/SearcherColumn.tsx",
      "frontend-user/src/features/search/components/smart-search/SmartSearchPanel.tsx",
      "frontend-user/src/features/search/components/smart-search/PaperListScroller.tsx",
      "frontend-user/src/features/claw/pages/ClawPage.tsx",
      "frontend-user/src/features/claw/lib/feature-meta.ts",
      "frontend-user/src/shared/components/SearchAutocomplete.tsx",
      "frontend-user/src/features/claw/components/chat/ClawHero.tsx",
      "frontend-user/src/features/wiki/embeds/WikiEmbedSearchAutocomplete.tsx",
      "frontend-user/src/features/wiki/embeds/WikiEmbedClawHeroEntry.tsx",
      "frontend-user/src/features/wiki/embeds/fixtures/mock-chrome.tsx",
    ],
    related: [
      "academic-search",
      "smart-search",
      "claw",
      "pdf-chat-guide",
      "staging-area",
    ],
    sections: [
      {
        id: "entry-previews",
        title: "两个入口长什么样",
        markdown: "",
        embeds: [
          {
            id: "search-autocomplete",
            caption: "传统搜索",
          },
          {
            id: "claw-hero-smart-entry",
            caption: "智能搜索空态",
          },
          {
            id: "search-suggestions-dropdown",
            caption: "传统搜索建议下拉",
          },
        ],
      },
      {
        id: "quick-decision",
        title: "先用一条规则判断",
        markdown: `| 入口 | 最适合的问题 | 主要产出 | 关键边界 |
| --- | --- | --- | --- |
| 传统搜索 | 已有明确关键词，需要筛选和翻页 | 可控的分页论文列表 | 需要自己设计检索式和判断相关性 |
| 智能搜索 | 有研究问题，但关键词和检索路线尚不稳定 | 对话解释、检索过程和论文组 | 需要登录，AI 结果仍须核对全文 |
| 智能助手 | 已有文件或材料，要分析、写作、绘图、数据处理或形成交付物 | 对话、附件分析和多种研究产物 | 不是专门的筛选式论文结果页 |

一句话记忆：明确“搜什么”用传统搜索，需要系统“帮你找”用智能搜索，已经进入“拿材料做事”阶段用智能助手。`,
      },
      {
        id: "choose-classic-search",
        title: "这些任务优先用传统搜索",
        markdown: `当你已经有论文题名、作者、稳定主题词、年份区间、期刊范围或文献类型时，传统搜索更直接。它把查询、来源、筛选、排序和页码明确展示出来，适合复查同一组条件、调整单个变量，以及快速建立一份候选清单。

如果你的任务是“查 2022 年以后某主题的综述”“只看某期刊或某来源”“按引用量查看 Discovery 结果”，不需要先让 AI 解释检索计划。`,
      },
      {
        id: "choose-smart-search",
        title: "这些任务优先用智能搜索",
        markdown: `当同一概念有多种叫法、课题横跨几个领域、需要从种子论文沿引用关系扩展，或你只会描述研究问题而不会写检索式时，智能搜索更合适。它可以在会话中拆解概念、换术语、调用学术工具，并把论文按轮次组织起来。

智能搜索的核心产物仍是“找到并解释论文”。若下一步主要是比较全文、处理数据或写成一个文档，应把已确认的材料交给智能助手，而不是无限延长搜索会话。`,
      },
      {
        id: "choose-assistant",
        title: "这些任务优先用智能助手",
        markdown: `智能助手适合带附件和长上下文的研究工作：阅读 PDF、整理文献、制作演示、科研绘图、数据分析，或在同一会话中把多个步骤串起来。Claw 还可以使用已安装的 Skill 和个人文献集引用，但它的主界面不是带固定筛选器与分页器的论文搜索器。

如果只是想得到一批满足明确条件的论文，先去文献搜索；如果已经有 PDF、表格或一组收藏，直接在智能助手建立任务上下文更顺手。`,
      },
      {
        id: "handoff-between-tools",
        title: "在三个入口之间交接",
        markdown: `一个稳妥流程是：先用传统搜索获得可控的初始结果，遇到同义词或覆盖问题时用智能搜索扩展，把确认过的论文加入暂存区或个人文献集，最后在智能助手中上传 PDF 或引用文献完成比较、写作与交付。

三个入口各自维护页面或会话状态，不应假设传统搜索条件、智能搜索对话和 Claw 附件会自动共享。交接时以论文详情、个人文献集、暂存区或明确上传的文件为准。`,
      },
    ],
  },
  {
    slug: "literature-graph-status",
    title: "文献图谱：当前状态与使用边界",
    summary:
      "当前已有引用计数、参考文献列表和逐条论文跳转，但尚未提供独立的节点—连线式文献图谱页面。",
    category: "discovery",
    kind: "feature",
    status: "planned",
    audience: ["研究者", "产品用户", "支持人员"],
    aliases: ["文献关系图", "引用图谱", "知识图谱", "Citation graph"],
    sourcePaths: [
      "frontend-user/src/features/browser/components/paper-detail/PaperMetadataBlock.tsx",
      "frontend-user/src/features/browser/components/paper-detail/PaperReferences.tsx",
      "frontend-user/src/shared/api/paper-detail.ts",
      "frontend-user/src/features/browser/routes.tsx",
      "frontend-user/src/shared/lib/search-filters.ts",
    ],
    related: [
      "paper",
      "academic-search",
      "smart-search",
      "authors-and-journals",
    ],
    sections: [
      {
        id: "current-status",
        title: "当前没有独立文献图谱",
        markdown: `现行前端没有文献图谱专用路由、画布或节点—边交互组件，因此不能把“查看引用量和参考文献”描述为已经上线的可视化文献图谱。本词条标记为“计划”，用于说明边界，不代表已经提供可操作入口。

传统搜索中的数据源名称“Graph”也只是来源品牌名称，不等于文献图谱功能。选择 Graph 会改变检索来源，不会打开关系网络。`,
      },
      {
        id: "available-now",
        title: "现在可以使用的关系信息",
        markdown: `论文详情可以显示被引用数量和参考文献数量，并按需加载参考文献列表。列表中的条目如果有站内论文标识，可以继续打开对应论文详情；只有外部 URL 时则跳到外部页面。参考文献较多时，界面分批显示，避免一次挂载全部条目。

这套能力适合从一篇种子论文逐条向后追溯，但它仍是列表导航，不提供全局网络布局、聚类、路径分析或图谱导出。`,
      },
      {
        id: "missing-capabilities",
        title: "尚未提供的图谱能力",
        markdown: `当前页面不能把多篇论文自动绘制成节点与连线，也不能在画布中按作者、年份、主题或共同引用聚类；没有图谱层级的缩放、筛选、路径追踪和图片或网络数据导出。论文的引用计数是元数据字段，不代表用户能展开完整“谁引用了它”的可视网络。`,
        embeds: [{ id: "citation-graph-preview" }],
      },
      {
        id: "workaround",
        title: "上线前如何做引用扩展",
        markdown: `可以先打开高相关论文的参考文献列表寻找奠基工作，再在智能搜索中要求沿“参考文献、被引工作、相关论文”分别扩展，并把确认过的论文加入暂存区。这样能完成检索层面的滚雪球，但结果仍应按清单核对，不能声称已经做过图谱聚类或网络分析。`,
      },
    ],
  },
  {
    slug: "journal-metrics-guide",
    title: "期刊指标怎么看",
    summary:
      "解释 Scholay 当前展示的期刊身份、分区、引用、开放获取和风险信号，并说明年份、来源与缺失值边界。",
    category: "discovery",
    kind: "page",
    status: "current",
    audience: ["投稿作者", "研究者", "学生"],
    aliases: ["期刊指标含义", "影响因子怎么看", "JCR 中科院 CCF 区别"],
    sourcePaths: [
      "frontend-user/src/shared/api/types.ts",
      "frontend-user/src/features/journals/api/journals.ts",
      "frontend-user/src/features/browser/components/JournalDetailPane.tsx",
      "frontend-user/src/shared/api/journal-enrichment.ts",
    ],
    related: [
      "authors-and-journals",
      "journal-detail-page",
      "journal-search-page",
    ],
    sections: [
      {
        id: "identity-and-coverage",
        title: "先看身份与数据覆盖",
        markdown: `ISSN、刊名、出版商、国家和期刊类型用于确认“是不是同一本刊”，不是质量评分。印刷版与电子版可能有不同 ISSN；同名或更名期刊应优先用 ISSN 核对。页面中的“数据源数”表示当前记录由多少来源补全，来源多通常意味着字段更丰富，但不等于期刊质量更高。

缺少某个字段可能只是该来源没有返回、不同版本尚未合并，不能直接解释成“未收录”或“指标为零”。`,
        embeds: [{ id: "journal-detail" }],
      },
      {
        id: "citation-metrics",
        title: "影响因子、JCR 分区与 h-index",
        markdown: `**JCR 影响因子**是当前记录中由 JCR 来源提供的期刊级指标，页面会同时保留年份字段和年度趋势；它不是某一篇论文的质量分。**JCR 分区**以 Q1–Q4 表示该刊在相应 JCR 类别中的区间，具体类别和年份会影响结果。

**h-index**来自 OpenAlex 的累计期刊指标，综合反映一定数量论文及其引用表现；累计时间较长的期刊通常更占优势。详情中的 SJR、两年平均被引等字段来自其他来源，计算体系与 JCR 影响因子不同，不应把不同指标当成同一把尺子。`,
      },
      {
        id: "ranking-systems",
        title: "中科院分区、新锐分区与 CCF",
        markdown: `**中科院分区**在页面中展示大类 1–4 区和 Top 标记，与 JCR Q1–Q4 是不同体系，不能做“1 区必然等于 Q1”的直接换算。页面还可能显示独立的**中科院新锐分区**和新锐 Top 标记，应连同其年份一起阅读，不要覆盖传统分区。

**CCF A/B/C**是计算机领域的推荐等级，只在有 CCF 数据的期刊或会议上出现。没有 CCF 等级的非计算机期刊，不应因此被判断为质量较低。`,
      },
      {
        id: "access-and-risk-signals",
        title: "开放获取、预警与投稿资源",
        markdown: `**OA** 表示 OpenAlex 或 DOAJ 等来源给出了开放获取信号，不自动说明是否收取版面费，也不保证每篇文章都能以同一种方式访问。**预警**只在记录包含预警等级且年份位于最近两年窗口时显示，用于提醒继续核对，不是自动拒绝该刊的结论。

“投稿资源”只表示系统记录到投稿须知或 LaTeX 模板；它不表示期刊正在收稿、模板一定是最新版，也不代表 Scholay 与编辑部建立了投稿关系。`,
      },
      {
        id: "reading-rule",
        title: "正确的组合读法",
        markdown: `选刊时先确认刊名和 ISSN，再看研究范围是否匹配，随后按所在机构或学科要求读取 JCR、中科院或 CCF，最后补看 OA、预警、出版商和年度趋势。不要只按单个影响因子排序后直接决定投稿。

所有指标都应带着来源、年份和学科背景阅读。页面没有值时保持“未知”，正式投稿前到期刊官网及适用的官方评价来源核对最新信息。`,
      },
    ],
  },
  {
    slug: "journal-selection-guide",
    title: "如何制定期刊选刊策略",
    summary:
      "用当前可检索的分区、影响因子、出版与风险数据建立短名单，再回到期刊官方渠道核对范围和投稿要求。",
    category: "discovery",
    kind: "page",
    status: "current",
    audience: ["投稿作者", "研究生", "研究者"],
    aliases: ["选刊策略", "期刊怎么选", "投稿期刊筛选"],
    sourcePaths: [
      "frontend-user/src/features/journals/pages/JournalSearchPage.tsx",
      "frontend-user/src/features/journals/components/JournalSearchResults.tsx",
      "frontend-user/src/features/journals/hooks/useJournalUrlFilters.ts",
      "frontend-user/src/features/browser/components/JournalDetailPane.tsx",
      "frontend-user/src/shared/api/journals.ts",
      "backend/internal/minicod/handler.go",
    ],
    related: [
      "authors-and-journals",
      "journal-search-page",
      "journal-detail-page",
      "journal-submission-resources",
    ],
    sections: [
      {
        id: "define-constraints",
        title: "先写下不可妥协的条件",
        markdown: `在搜索前列出稿件主题、文章类型、目标读者、可接受的 OA 或费用政策、机构认定要求，以及必须避开的预警或不合规情形。分区和影响因子只是一部分约束；如果期刊范围与稿件不匹配，指标再高也不是合适目标。

Scholay 当前没有完整的期刊 aims & scope 文本，也不会替你判断所有单位的认定规则，因此“主题匹配”和“机构合规”必须在后续官方核对中完成。`,
      },
      {
        id: "build-shortlist",
        title: "在期刊搜索中建立短名单",
        markdown: `进入期刊搜索页，可按刊名、ISSN 或机构关键词搜索；无关键词时页面也会返回默认列表。左侧可以组合中科院分区、JCR 分区、最低影响因子档位、CCF 等级和出版商，结果可按相关度、影响因子或近期发文信号排序。

一次只加一到两个硬条件，先保留 5–10 本候选刊。筛选状态写在 URL 中，打开期刊详情后返回仍能继续原来的比较。不要一开始同时锁死分区、出版商和高 IF，以免把主题更匹配的期刊全部排除。`,
        embeds: [{ id: "journal-search" }],
      },
      {
        id: "compare-signals",
        title: "逐刊比较，而不是只看排名",
        markdown: `打开详情后核对刊名、ISSN、出版商、国家、OA、JCR 与中科院分区、h-index、CCF、预警、年度影响因子和发文趋势。不同体系的分区要分别记录；缺失字段按“未知”处理，不要擅自补成 0。

先淘汰身份不符、明确预警或不满足机构要求的期刊，再比较剩余候选的学科匹配、读者群和可接受的出版政策。高影响因子只能作为候选信号，不能替代范围匹配。`,
      },
      {
        id: "verify-official-source",
        title: "回到官方渠道做最终核对",
        markdown: `详情页“查询原刊”通过 ISSN Portal 帮助确认注册条目；正式决定前还应访问期刊官网，核对最新 aims & scope、文章类型、作者指南、费用、许可、数据政策和投稿入口。若页面提供投稿须知或 LaTeX 模板，下载后仍要与官网当前版本比对。

年度指标、预警和模板都可能在你建立短名单后更新。保存核对日期和来源，可以在投稿前做最后一次复查。`,
      },
      {
        id: "submission-boundary",
        title: "Scholay 不代替编辑部投稿",
        markdown: `当前期刊页面提供检索、比较、详情和部分投稿资源下载，没有把稿件发送给外部期刊的动作。投稿资源下载还取决于该刊是否有文件以及账户权限；“有资源”不等于“已向期刊提交”。

Scholay 不能保证录用、审稿速度、费用或编辑部决定。最终投稿应在期刊官方系统完成，并以编辑部确认和最新作者指南为准。`,
      },
    ],
  },
  {
    slug: "journal-update-cycle",
    title: "Scholay 期刊数据多久更新一次",
    summary:
      "期刊搜索与详情读取上游数据，浏览器缓存、上游构建、SEO 摄取和公开发布各有独立节奏，因此没有统一的固定更新 SLA。",
    category: "discovery",
    kind: "rule",
    status: "current",
    audience: ["期刊搜索用户", "投稿作者", "支持人员"],
    aliases: ["期刊更新周期", "期刊数据刷新", "期刊指标多久更新"],
    sourcePaths: [
      "frontend-user/src/features/journals/api/journals.ts",
      "frontend-user/src/shared/api/journals.ts",
      "frontend-user/src/shared/lib/query-config.ts",
      "backend/internal/minicod/client.go",
      "backend/cmd/server/background.go",
      "backend/internal/seoingest/service.go",
    ],
    related: [
      "authors-and-journals",
      "journal-metrics-guide",
      "journal-selection-guide",
    ],
    sections: [
      {
        id: "no-fixed-sla",
        title: "没有统一的固定更新承诺",
        markdown: `当前代码没有对用户承诺“每天几点”“实时”或“指标发布后几小时内”完成全部期刊更新。JCR、中科院、CCF、OpenAlex、DOAJ、SCImago 和投稿资源各自有不同发布节奏，上游期刊库何时重建不由 Scholay 前端决定。

因此页面上的“当前数据”应理解为最近一次可用快照，而不是所有来源在同一时刻的实时值。正式投稿或填报前仍要核对指标年份和官方来源。`,
      },
      {
        id: "interactive-query-path",
        title: "搜索与详情的数据路径",
        markdown: `期刊搜索、列表和详情通过后端调用上游期刊接口。浏览器为减少重复请求，会把搜索结果视为约 1 分钟内可复用的数据，把期刊统计和详情视为约 10 分钟内可复用的数据；超过这个时间只表示下次访问可以重新请求，不表示上游一定产生了新版本。

刷新页面也只能重新取得服务端当时可提供的数据，不能强制 JCR、中科院或其他来源立刻更新。`,
      },
      {
        id: "upstream-build-signal",
        title: "上游构建时间是变化信号，不是 SLA",
        markdown: `上游提供期刊总量和 lastBuiltAt 构建时间。Scholay 可以用该时间判断上游期刊库是否出现了比本地基线更新的构建，但代码没有规定上游必须按日、按周或按月重建。只有 lastBuiltAt 真的变新，才说明上游发布了新快照。`,
      },
      {
        id: "seo-sync-and-publish",
        title: "SEO 同步与发布是另一条链路",
        markdown: `用于期刊公开落地页、聚合页和搜索引擎发现的本地 SEO 库，需要先完成一次管理员手动全量基线。之后服务器启动约 15 分钟做首次检查，再每 24 小时检查一次上游构建时间；发现新构建后会自动重新摄取。这个 24 小时是“检查是否变化”的周期，不是“数据保证在 24 小时内更新”的服务承诺。

摄取完成的期刊先处于待发布状态，管理员分批发布后才进入公开 SEO 页面、站点地图和推送范围。同步与发布分开，是为了让数据可以先核验再公开。`,
      },
      {
        id: "freshness-boundary",
        title: "如何理解页面之间的时间差",
        markdown: `交互式期刊搜索可能已经读取到上游的新值，而 SEO 聚合页仍等待本地同步或发布；反过来，浏览器缓存也可能让刚打开过的详情短时间保留旧快照。这些时间差来自不同数据链路，并不自动表示某一页出错。

遇到差异时，先比较指标年份、数据来源、期刊 ISSN 和上游构建时间；对投稿有实质影响的信息，以期刊官网和相应官方评价来源为最终依据。`,
      },
    ],
  },
];
