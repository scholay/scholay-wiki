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
        markdown: `当你已经知道主题词、作者、方法、研究对象或目标期刊时，优先使用传统搜索。进入文献搜索页并选择“传统”，在下图所示输入框中先写一组核心关键词。结果太少时删掉过细的限制，结果太杂时再补充研究对象、方法或场景。

搜索词、筛选、排序和页码都会写入当前 URL。返回搜索页时，页面会恢复最近一次有内容的检索状态，因此可以先打开论文详情，再回到原来的结果继续筛选。`,
        embeds: [{ id: "classic-search-dock" }],
        blocks: [
          { type: "markdown" },
          {
            type: "tip",
            tip: {
              text: "先用 2—4 个能区分主题的核心检索词建立基线，再逐项增加对象、方法和年份；完整条件一次堆得太多，反而不容易判断是哪项限制导致漏检。",
            },
          },
          {
            type: "article-link",
            card: {
              articleSlug: "academic-search",
              title: "文献搜索的范围与共同边界",
              description:
                "了解传统搜索、智能搜索共同使用的论文实体、数据来源和核对原则。",
              icon: "search",
            },
          },
          { type: "embeds" },
        ],
      },
      {
        id: "search-and-refine",
        title: "提交检索并逐步收窄",
        markdown: `提交关键词后，新查询会从第 1 页开始。点击“筛选”会打开下图所示面板，你可以调整数据源、时间、学科、文献类型和开放获取条件。每改一个条件，页面都会重新查询。

如果没有结果，依次尝试缩短关键词、换成更常见的同义词、放宽年份、清除期刊或类型限制，最后再切换数据源。

不要把结果总数当作质量结论。传统搜索最多开放前 1,000 条结果的翻页窗口，越往后的相关性通常越低；如果需要不断深翻，通常应先改写查询或增加有效筛选。`,
        embeds: [{ id: "classic-search-filters" }],
        blocks: [
          { type: "markdown" },
          {
            type: "tip",
            tip: {
              text: "每轮只改一个检索条件，并记录结果数量和相关性变化。这样才能把“没有结果”定位到术语、年份、来源或类型中的具体一项。",
            },
          },
          { type: "embeds" },
        ],
      },
      {
        id: "review-and-stage",
        title: "核对结果并加入暂存区",
        markdown: `结果出现后，先看题名、作者、年份、来源期刊和摘要，再打开论文详情检查 DOI、引用和参考文献；有可用全文时再打开 PDF。下图使用的是示例论文和示例指标，只用于说明论文卡与暂存区的位置，不代表实时数据。

论文卡上的引用量、期刊指标和开放获取状态来自当前数据快照。字段缺失不等于论文不存在，也不能直接说明质量较低。

找到候选论文后，可以逐篇暂存，也可以把当前页批量加入暂存区。批量动作只作用于当前页，不会把全部检索结果一次加入。暂存区是本次检索的短期工作台，不是长期文献库。`,
        embeds: [{ id: "review-and-stage" }],
        blocks: [
          { type: "markdown" },
          {
            type: "article-link",
            card: {
              articleSlug: "staging-area",
              title: "检索暂存区",
              description:
                "了解逐篇暂存、当前页批量暂存，以及从候选论文进入矩阵分析的方式。",
              icon: "resource",
            },
          },
          { type: "embeds" },
          {
            type: "markdown",
            markdown:
              "图中左侧红勾表示论文已加入当前暂存区，不是收藏；右侧是当前打开的论文详情标签。顶部“PDF 对话”和“引用图谱”只是工作区入口，不表示这些任务已经执行。",
          },
          {
            type: "article-link",
            card: {
              articleSlug: "marketing-pages-and-implementation-boundaries",
              sectionId: "reference-card",
              title: "怎样读懂论文基础信息卡片",
              description:
                "了解题名、作者、来源、年份、DOI、OA 与引用量分别表达什么。",
              icon: "book-open",
            },
          },
        ],
      },
      {
        id: "continue-workflow",
        title: "把候选清单转成研究材料",
        markdown: `初筛完成后有两条常见路径：需要长期保存时，把确认过的论文收藏到个人文献集；需要横向比较时，把暂存论文送入矩阵分析并设置比较维度。无论走哪条路径，AI 摘要、引用量和检索排序都只能帮助筛选，正式论证仍应回到论文原文、版本信息和可追溯出处。`,
        blocks: [
          { type: "markdown" },
          {
            type: "next-steps",
            group: {
              title: "下一步",
              description: "根据这轮检索的完成度，选择一个明确的后续动作。",
              items: [
                {
                  articleSlug: "literature-library",
                  title: "保存到个人文献集",
                  description: "把已经核对的论文长期归档，再补充文件与分类。",
                  icon: "resource",
                },
                {
                  articleSlug: "matrix-analysis",
                  title: "建立矩阵分析",
                  description: "把候选论文按同一组维度横向比较。",
                  icon: "review",
                },
                {
                  articleSlug: "smart-literature-search-guide",
                  sectionId: "guide-the-search",
                  title: "补做智能搜索",
                  description: "当术语或覆盖仍不稳定时，用追问扩展检索路线。",
                  icon: "sparkles",
                },
              ],
            },
          },
        ],
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
        markdown: `当你知道要解决什么问题，却还没有稳定关键词时，可以使用智能搜索。进入文献搜索页并切换到“智能”，在下图所示输入框里写清研究对象、方法或现象、时间范围，以及希望得到的结果类型和数量。例如：“找近三年关于扩散模型医学影像重建的综述，并列出常用评价指标”。

避免只写“帮我找点论文”。约束越明确，系统越容易判断应该先宽搜、拆分概念还是沿引用关系扩展；若条件之间可能冲突，智能搜索也可能先提出澄清问题。`,
        embeds: [{ id: "smart-search-dock" }],
        blocks: [
          { type: "markdown" },
          {
            type: "prompt-tabs",
            group: {
              id: "smart-search-first-question",
              title: "按学科改写第一轮提问",
              description:
                "复制最接近的版本，再替换方括号中的研究对象、范围和数量。",
              options: [
                {
                  id: "general-research",
                  label: "通用研究",
                  prompt:
                    "围绕【研究主题】检索【年份范围】内的研究。重点关注【研究对象/场景】、【方法或现象】与【结果变量】。优先返回【文献类型】，筛选【数量】篇高相关论文，并按“研究问题—方法—主要发现—证据限制”整理。最后列出本轮使用的中英文检索词、尚未覆盖的数据源，以及建议补检的方向。",
                },
                {
                  id: "medicine",
                  label: "医学",
                  prompt:
                    "检索【疾病/人群】中【干预或暴露】与【结局】的研究，时间范围为【年份】。优先纳入【系统综述/RCT/队列研究】，返回【数量】篇高相关论文。请区分研究人群、干预、对照、结局与随访时间，不要混合人体和动物证据；如结论冲突，请说明冲突来自哪些研究设计或样本差异。",
                },
                {
                  id: "humanities-social-sciences",
                  label: "人文社科",
                  prompt:
                    "检索关于【概念/事件/文本】在【地区与时期】中的研究，兼顾【理论传统】与【材料类型】。返回【数量】篇代表性研究，区分理论论述、历史材料与实证案例，并列出常见中英文术语、不同译名及各自使用语境。不要把研究者的解释写成已被材料直接证明的事实。",
                },
                {
                  id: "engineering-computing",
                  label: "工程计算",
                  prompt:
                    "检索【技术/算法】用于【任务或应用场景】的研究，范围为【年份】。返回【数量】篇代表性论文，比较数据集、基线方法、评价指标、计算成本、主要改进与开源状态。请区分论文声称的优势和实验实际支持的范围。",
                },
              ],
            },
          },
          { type: "embeds" },
        ],
      },
      {
        id: "start-a-session",
        title: "开始并管理一次搜索会话",
        markdown: `在空白页发出第一条消息后，系统才会创建并保存这次搜索会话。下图展示的是已经得到回答和论文结果的状态。折叠的“思考过程”只用于查看当前轮过程摘要；论文组可逐篇选择或一键暂存。底部数字是历史会话数量，“新对话”会开启一个不继承旧上下文的新任务。

回答会逐步返回。正在生成时不要重复发送同一个问题；需要中止时使用停止按钮，连接未就绪或消息未送达时按页面提示重试。

同一课题的收窄、改词和补充条件应留在同一会话中；完全不同的课题应新建会话，避免旧上下文干扰检索判断。`,
        embeds: [{ id: "smart-search-session" }],
        blocks: [
          { type: "markdown" },
          { type: "embeds" },
          {
            type: "article-link",
            card: {
              articleSlug: "marketing-pages-and-implementation-boundaries",
              sectionId: "agent-status",
              title: "思考过程与任务状态",
              description:
                "了解过程摘要、工具执行、任务进度和最终回答之间的区别。",
              icon: "sparkles",
            },
          },
        ],
      },
      {
        id: "guide-the-search",
        title: "用追问引导检索策略",
        markdown: `智能搜索会把问题拆成概念块，尝试同义词、不同来源、引用与参考关系或相关论文。第一轮结果不理想时，每次只改一个条件：例如要求换成英文学术术语、放宽年份、限定研究对象、补找奠基论文，或只保留近年的后续工作。这样可以判断究竟是哪一个条件造成漏检。

还可以通过下图中的“+”菜单上传文件，或打开个人文献集选择资料，让当前会话围绕已有材料继续找文献。图中冻结的是已经展开菜单、并已挂上一份 CSV 附件的状态。附件卡会显示文件名、格式和大小，右上角“×”会在发送前移除它；“引用文献集”把选中论文交给本轮任务，不等于上传其原始 PDF。引用只有元数据或摘要的论文时，系统并不等于读过全文；有 PDF 的引用与仅有摘要的引用应分别核对。`,
        embeds: [{ id: "composer-attachments" }],
        blocks: [
          { type: "markdown" },
          {
            type: "prompt-tabs",
            group: {
              id: "smart-search-follow-up",
              title: "一次只改变一个检索条件",
              description:
                "按当前缺口选择一条追问，并要求系统说明这一轮实际改变了什么。",
              options: [
                {
                  id: "replace-terms",
                  label: "换术语",
                  prompt:
                    "在不改变当前研究对象的前提下，把核心概念换成该领域常用的英文学术术语、缩写和同义词重新检索。列出新增检索词，并只返回本轮新增的论文。",
                },
                {
                  id: "foundational-work",
                  label: "找奠基工作",
                  prompt:
                    "以当前高相关论文为种子，沿参考文献寻找更早的奠基工作。优先返回首次提出核心概念、方法或测量工具的论文，并说明它与种子论文的关系。",
                },
                {
                  id: "recent-progress",
                  label: "找近期进展",
                  prompt:
                    "沿当前论文的被引工作和相关论文补找【年份】以来的后续进展。只保留对方法、数据或结论有实质推进的研究，并说明推进点。",
                },
                {
                  id: "narrow-scope",
                  label: "收窄范围",
                  prompt:
                    "保留【研究对象】，把结果限定为【方法/地区/人群/文献类型】。其他条件不变，只说明这一项限制带来了哪些新增、删除或遗漏。",
                },
              ],
            },
          },
          {
            type: "article-link",
            card: {
              articleSlug: "literature-graph-status",
              sectionId: "workaround",
              title: "没有文献图谱时怎样做引用扩展",
              description:
                "用参考文献、被引工作和相关论文完成可核对的滚雪球检索。",
              icon: "search",
            },
          },
          { type: "embeds" },
        ],
      },
      {
        id: "inspect-and-stage",
        title: "检查论文组并暂存候选",
        markdown: `检索工具返回的论文会组成一个结果组，如下图所示。标题中的“1 已暂存”是当前论文组的同步状态；“一键暂存 2 篇”只加入尚未暂存者，左侧勾选用于逐篇控制。你也可以展开论文卡查看元数据或打开论文详情。

暂存、收藏、期刊指标和论文详情与传统搜索使用同一套论文数据，不需要手工复制题名到另一个页面。

智能回答是检索过程的组织结果，不是可以直接引用的证据。对准备写进论文的判断，应继续打开论文详情或全文，核对作者、年份、版本、数据和原句。`,
        embeds: [{ id: "smart-paper-group" }],
        blocks: [
          { type: "markdown" },
          { type: "embeds" },
          {
            type: "article-link",
            card: {
              articleSlug: "marketing-pages-and-implementation-boundaries",
              sectionId: "reference-card",
              title: "论文基础信息卡片的共同字段",
              description:
                "理解来源、作者、年份、DOI、OA 和指标，避免把暂存状态当成收藏。",
              icon: "book-open",
            },
          },
        ],
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
        blocks: [
          { type: "markdown" },
          {
            type: "article-link",
            card: {
              articleSlug: "claw-interface-guide",
              sectionId: "composer",
              title: "找到智能助手的附件与上下文入口",
              description: "认识输入框中的附件、个人文献集、Skill 与模型选择。",
              icon: "sparkles",
            },
          },
        ],
      },
      {
        id: "upload-pdf",
        title: "上传 PDF 并等待附件就绪",
        markdown: `选择文件后会立即上传，附件条会显示上传中、完成或失败。单个普通文件上限为 30 MB，一条消息最多 10 个附件；超过限制的文件会在发送前被拦截。新对话第一次上传时，系统会先建立会话，文件只会归入当前这次对话。

等附件显示完成后再发送问题。上传失败时先按附件上的错误提示重试；不要在文件仍处于上传中时反复点击发送。扫描版、版式复杂或文本层损坏的 PDF 可能难以解析，回答质量仍取决于文件本身的可读性。`,
        blocks: [
          { type: "markdown" },
          {
            type: "tip",
            tip: {
              text: "多篇比较时先统一文件名，并在提问中逐一写出文件名；“第一篇”“第二篇”在后续追加附件后容易失去指向。",
              link: {
                articleSlug: "claw-attachments-and-references",
                sectionId: "attachment-limits",
                label: "查看附件格式与数量限制",
              },
            },
          },
        ],
      },
      {
        id: "ask-grounded-questions",
        title: "提出能回到原文的问题",
        markdown: `第一问应同时写明对象、范围和输出。例如：“只根据这篇 PDF，总结研究问题、样本、方法和主要结论；不确定的地方标出来”，或“找出作者对局限性的原文位置，并解释它对结论外推的影响”。

后续可以要求比较章节、解释图表、梳理变量关系或生成待核对的阅读笔记。若一次上传多篇，应使用文件名或论文题名指定对象，并要求分开列出每篇证据，避免把不同论文的结论混在一起。`,
        blocks: [
          { type: "markdown" },
          {
            type: "prompt-tabs",
            group: {
              id: "pdf-grounded-question",
              title: "按阅读任务选择提问模板",
              description:
                "把文件名写进提问，并要求回答标出页码、章节或表图位置。",
              options: [
                {
                  id: "quick-understanding",
                  label: "快速读懂",
                  prompt:
                    "只根据【文件名】回答。总结研究问题、样本、数据、方法和主要结论；每项注明对应章节、页码或表图位置。文中没有明确说明的内容写“未报告”，不要自行补全。",
                },
                {
                  id: "method-review",
                  label: "方法审查",
                  prompt:
                    "审查【文件名】的方法部分：研究设计是否能回答研究问题，样本与变量如何定义，统计或分析方法依赖哪些假设。分别列出“文中明确说明”“需要进一步核对”“可能影响结论的限制”，并附原文位置。",
                },
                {
                  id: "result-evidence",
                  label: "结果证据",
                  prompt:
                    "核对【文件名】中的主要结论。为每条结论找到对应的数字、表格、图或原文段落，并区分“数据直接支持”“作者推断”“当前材料无法验证”。不要只复述摘要。",
                },
                {
                  id: "multi-document-comparison",
                  label: "多文比较",
                  prompt:
                    "比较【文件 A】与【文件 B】。分别列出研究问题、样本、方法、主要发现和局限，再说明一致、冲突与不可直接比较之处。每条判断都标明来自哪一个文件及其章节或页码，不要混合两篇论文的证据。",
                },
              ],
            },
          },
        ],
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

两者可以配合：在阅读器中核对页码、图表和公式，在 Claw 中组织问题和比较结果。但二者没有“打开阅读器即自动传给助手”的隐式同步。下图展示 PDF 已可阅读、但尚未建立对话的过渡状态。点击“开始 PDF 对话”后，系统会切到智能助手并为当前 PDF 建立新会话；图中尚未出现问答区。`,
        embeds: [{ id: "pdf-chat-workspace" }],
        blocks: [
          { type: "markdown" },
          {
            type: "article-link",
            card: {
              articleSlug: "pdf-reader",
              sectionId: "rendering",
              title: "PDF 阅读器",
              description:
                "了解全文可用性、翻页核对和解析结果与原始文件的区别。",
              icon: "book-open",
            },
          },
          { type: "embeds" },
        ],
      },
      {
        id: "verify-answer",
        title: "把回答当作阅读辅助而非原文替代",
        markdown: `AI 可能遗漏脚注、表格限定、数学符号或扫描页，也可能把作者的讨论推断写得过于确定。对关键数字、样本量、显著性、原句和页码，应回到 PDF 阅读器逐项核对；引用时引用原论文，不引用对话回答。

如果回答没有说明依据，可以继续追问“这一点来自哪一节、哪张表或哪段原文”；仍无法定位时，把它标记为未证实，而不是继续让模型猜测。`,
        blocks: [
          { type: "markdown" },
          {
            type: "prompt-tabs",
            group: {
              id: "pdf-answer-verification",
              title: "把关键回答重新送回复核",
              description:
                "选择最需要核对的风险点；无法定位的内容应保留为“未证实”。",
              options: [
                {
                  id: "locate-basis",
                  label: "定位依据",
                  prompt:
                    "请定位你刚才这项判断的依据：来自哪一节、哪一页、哪张表或哪段原文？给出足以让我回到 PDF 核对的位置。找不到时请明确写“当前文件中无法定位”。",
                },
                {
                  id: "verify-numbers",
                  label: "核对数字",
                  prompt:
                    "重新核对刚才回答中的所有数字，包括样本量、比例、效应量、置信区间和 p 值。逐项列出原值、单位、对应页码或表格；不要根据上下文推算未报告的数字。",
                },
                {
                  id: "separate-inference",
                  label: "区分推断",
                  prompt:
                    "把刚才的回答拆成三类：“作者原文明确陈述”“由数据可以合理推断”“模型补充解释”。无法归类或缺少依据的内容标记为未证实。",
                },
              ],
            },
          },
          {
            type: "article-link",
            card: {
              articleSlug: "research-evidence-kernel",
              sectionId: "trust",
              title: "证据可追踪不等于结论自动成立",
              description:
                "了解工具证据、来源本身与模型推断之间仍需人工复核的边界。",
              icon: "review",
            },
          },
          {
            type: "next-steps",
            group: {
              title: "下一步",
              description: "完成定位后，把结果变成可复查的研究材料。",
              items: [
                {
                  articleSlug: "literature-library",
                  title: "保存原文与论文记录",
                  description: "把确认使用的论文和可用全文归入个人文献集。",
                  icon: "resource",
                },
                {
                  articleSlug: "matrix-analysis",
                  title: "比较多篇论文",
                  description: "用统一维度整理方法、发现与证据边界。",
                  icon: "review",
                },
                {
                  articleSlug: "prism-writing-workflow",
                  sectionId: "evidence",
                  title: "带着核对结果进入写作",
                  description:
                    "在正文中插入来源，并继续核对作者、年份与结论范围。",
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
    slug: "search-entry-comparison",
    title: "智能助手 vs 智能搜索",
    summary:
      "两个都是对话，但智能搜索用来找论文，智能助手用来拿已有材料继续做事。",
    category: "research-ai",
    kind: "page",
    status: "current",
    audience: ["所有研究者", "学生", "初次使用者"],
    aliases: [
      "智能助手和智能搜索区别",
      "智能助手与智能搜索的区别",
      "从智能搜索的角度查看区别",
      "搜索入口区别",
    ],
    sourcePaths: [
      "frontend-user/src/features/search/components/smart-search/SmartSearchPanel.tsx",
      "frontend-user/src/features/claw/pages/ClawPage.tsx",
      "frontend-user/src/features/claw/lib/feature-meta.ts",
      "frontend-user/src/features/wiki/embeds/WikiEmbedSmartSearchDock.tsx",
      "frontend-user/src/features/wiki/embeds/WikiEmbedClawEmptyState.tsx",
    ],
    related: [
      "classic-vs-smart-search",
      "smart-search",
      "claw",
      "claw-interface-guide",
      "staging-area",
    ],
    sections: [
      {
        id: "difference",
        title: "先看差别",
        markdown: `智能搜索在文献搜索页里，用对话帮你拆问题、找论文、解释来源。它的结果仍然是论文和检索过程，不是写好的文稿或分析报告。

智能助手是单独的工作台。适合已经有 PDF、表格或一组文献之后，继续阅读、比较、写作、绘图，或把几步研究任务串起来。

一句话：还在找论文，用智能搜索；已经有材料要做事，用智能助手。`,
        embeds: [
          { id: "smart-search-dock", caption: "智能搜索 · 输入栏" },
          { id: "claw-empty-state", caption: "智能助手 · 新对话" },
        ],
        blocks: [
          {
            type: "markdown",
            markdown:
              "智能搜索在文献搜索页里，用对话帮你拆问题、找论文、解释来源。它的结果仍然是论文和检索过程，不是写好的文稿或分析报告。",
          },
          { type: "embeds", ids: ["smart-search-dock"] },
          {
            type: "markdown",
            markdown:
              "智能助手是单独的工作台。适合已经有 PDF、表格或一组文献之后，继续阅读、比较、写作、绘图，或把几步研究任务串起来。",
          },
          { type: "embeds", ids: ["claw-empty-state"] },
          {
            type: "markdown",
            markdown:
              "一句话：还在找论文，用智能搜索；已经有材料要做事，用智能助手。",
          },
        ],
      },
      {
        id: "choose-smart-search",
        title: "什么时候用智能搜索",
        markdown: `同一概念有多种叫法、课题横跨几个领域、需要从一篇种子论文往外扩，或你只会描述研究问题、写不出检索式时，用智能搜索。

它可以在会话里换术语、换来源，并把这一轮找到的论文组织起来。核心产物仍是“找到并解释论文”。下一步如果是比较全文、处理数据或写成文档，把确认过的材料交给智能助手，而不要无限延长搜索会话。`,
      },
      {
        id: "choose-assistant",
        title: "什么时候用智能助手",
        markdown: `已经有 PDF、表格、一组收藏，或要把阅读、整理、绘图、数据分析连在一起做时，用智能助手。它可以使用已安装的 Skill，也可以引用个人文献集，但主界面不是带筛选器和翻页的论文结果页。

如果只是想得到一批满足明确条件的论文，先去文献搜索。`,
        blocks: [
          { type: "markdown" },
          {
            type: "article-link",
            card: {
              articleSlug: "claw-interface-guide",
              sectionId: "entry-and-modes",
              title: "智能助手界面导览",
              description:
                "查看新对话、任务模板、输入区和交付物工作区。",
              icon: "sparkles",
            },
          },
        ],
      },
      {
        id: "handoff",
        title: "找完论文之后",
        markdown: `确认过的论文可以加入暂存区或个人文献集，再在智能助手里引用或上传 PDF。两边不会自动共享检索条件或对话记录，交接时以论文详情、文献集、暂存区或你明确上传的文件为准。`,
        blocks: [
          { type: "markdown" },
          {
            type: "article-link",
            card: {
              articleSlug: "classic-vs-smart-search",
              title: "传统搜索 vs 智能搜索",
              description:
                "如果还在文献搜索页里犹豫用关键词还是用对话，先看这一篇。",
              icon: "compass",
            },
          },
        ],
      },
    ],
  },
  {
    slug: "classic-vs-smart-search",
    title: "传统搜索 vs 智能搜索",
    summary:
      "已经有题名、作者或稳定关键词时用传统搜索；还在找说法、需要系统帮你拆问题时用智能搜索。",
    category: "discovery",
    kind: "page",
    status: "current",
    audience: ["所有研究者", "学生", "初次使用者"],
    aliases: ["传统搜索和智能搜索", "传统搜索与智能搜索的区别"],
    sourcePaths: [
      "frontend-user/src/features/search/components/SearcherColumn.tsx",
      "frontend-user/src/features/search/components/smart-search/SmartSearchPanel.tsx",
      "frontend-user/src/shared/components/SearchAutocomplete.tsx",
      "frontend-user/src/features/landing/pages/SearchLandingPage.tsx",
      "frontend-user/src/features/wiki/embeds/WikiEmbedSearchAutocomplete.tsx",
      "frontend-user/src/features/wiki/embeds/WikiEmbedClawHeroEntry.tsx",
    ],
    related: [
      "search-entry-comparison",
      "academic-search",
      "smart-search",
      "literature-search-guide",
      "smart-literature-search-guide",
    ],
    sections: [
      {
        id: "difference",
        title: "先看差别",
        markdown: `传统搜索直接执行你写下的关键词和筛选条件。输入题名、作者、期刊或主题词后提交，就会得到可以筛选、可以翻页的论文列表。

输入时还会出现联想结果，方便按已经出现过的题名、作者或期刊快速定位。

智能搜索先在会话里理解问题，再去检索。适合关键词还不稳、需要系统帮你拆问题的时候。

一句话：明确“搜什么”用传统搜索，需要系统“帮你找”用智能搜索。`,
        embeds: [
          { id: "search-autocomplete", caption: "传统搜索" },
          {
            id: "search-suggestions-dropdown",
            caption: "传统搜索建议下拉",
          },
          { id: "claw-hero-smart-entry", caption: "智能搜索空态" },
        ],
        blocks: [
          {
            type: "markdown",
            markdown:
              "传统搜索直接执行你写下的关键词和筛选条件。输入题名、作者、期刊或主题词后提交，就会得到可以筛选、可以翻页的论文列表。",
          },
          { type: "embeds", ids: ["search-autocomplete"] },
          {
            type: "markdown",
            markdown:
              "输入时还会出现联想结果，方便按已经出现过的题名、作者或期刊快速定位。",
          },
          { type: "embeds", ids: ["search-suggestions-dropdown"] },
          {
            type: "markdown",
            markdown:
              "智能搜索先在会话里理解问题，再去检索。适合关键词还不稳、需要系统帮你拆问题的时候。\n\n一句话：明确“搜什么”用传统搜索，需要系统“帮你找”用智能搜索。",
          },
          { type: "embeds", ids: ["claw-hero-smart-entry"] },
        ],
      },
      {
        id: "choose-classic-search",
        title: "什么时候用传统搜索",
        markdown: `已经有论文题名、作者、稳定主题词、年份、期刊范围或文献类型时，用传统搜索。查询、来源、筛选、排序和页码都摊在页面上，适合改一个条件再查一次，也适合快速拉一份候选清单。

例如“查 2022 年以后某主题的综述”“只看某期刊或某来源”，不必先让 AI 解释检索计划。`,
      },
      {
        id: "choose-smart-search",
        title: "什么时候用智能搜索",
        markdown: `同一概念有多种叫法、课题跨几个领域、需要从种子论文往外扩，或你只会描述研究问题、写不出检索式时，用智能搜索。

它会在会话里拆概念、换术语、调用学术工具，并把论文按轮次放在一起。结果仍要打开详情或全文核对。`,
      },
      {
        id: "handoff",
        title: "两种搜索可以一起用",
        markdown: `可以先用传统搜索拿到一批可控结果，遇到同义词或覆盖不够时再切到智能搜索扩展。确认过的论文加入暂存区或个人文献集。

两个入口各自记住自己的状态，不会自动共享检索条件或对话。下一步如果是读全文、写作或处理文件，再看智能助手。`,
        blocks: [
          { type: "markdown" },
          {
            type: "article-link",
            card: {
              articleSlug: "search-entry-comparison",
              title: "智能助手 vs 智能搜索",
              description:
                "找论文用智能搜索；已经有材料要继续做事，用智能助手。",
              icon: "sparkles",
            },
          },
        ],
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
        markdown: `下面的图是设计预览，用来说明未来的文献图谱可能怎样呈现节点、连线和聚类；它不是当前可操作页面。现阶段，Scholay 不能把多篇论文自动绘制成关系网络，也不能在画布中按作者、年份、主题或共同引用聚类；图谱缩放、路径追踪和网络数据导出同样尚未开放。

论文详情中的引用计数只是元数据字段，不能据此认为你已经查看了完整的被引网络。`,
        embeds: [{ id: "citation-graph-preview" }],
      },
      {
        id: "workaround",
        title: "上线前如何做引用扩展",
        markdown: `可以先打开高相关论文的参考文献列表寻找奠基工作，再在智能搜索中要求沿“参考文献、被引工作、相关论文”分别扩展，并把确认过的论文加入暂存区。这样能完成检索层面的滚雪球，但结果仍应按清单核对，不能声称已经做过图谱聚类或网络分析。`,
        blocks: [
          { type: "markdown" },
          {
            type: "article-link",
            card: {
              articleSlug: "smart-literature-search-guide",
              sectionId: "guide-the-search",
              title: "用追问完成滚雪球检索",
              description:
                "按奠基工作、近期进展或范围收窄逐轮扩展，并只比较每轮新增结果。",
              icon: "search",
            },
          },
        ],
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
        markdown: `进入期刊搜索页，可按刊名、ISSN 或机构关键词搜索；无关键词时页面也会返回默认列表。图中筛选面板尚未展开；右上角“筛选”徽标的数字表示当前已生效条件数。打开后才可组合中科院分区、JCR 分区、最低影响因子档位、CCF 等级和出版商，结果可按相关度、影响因子或近期发文信号排序。

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
