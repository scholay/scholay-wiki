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
        markdown: `当前可以直接使用智能搜论文、Claw、Prism 高级模式、智能审稿、演示文稿和科研绘图。数据分析的专用会话与后端仍存在，但当前没有公开的新会话入口，只有部署另行提供入口或已有会话时才能进入。各项能力使用不同的工作区和处理方法，不能从首页故事画面或“即将推出”卡片推断已经交付。`,
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
    slug: "ai-models-and-runtime-config",
    title: "选模型、思考深度和大约能用多少次",
    summary:
      "看看现在能选哪些基础、经济和高级模型，思考深度是什么意思，以及 Pro、Max 和科研经费大概能用多少次。",
    category: "research-ai",
    kind: "rule",
    status: "current",
    audience: ["AI 功能用户", "研究者", "管理员"],
    aliases: [
      "模型选择",
      "运行配置",
      "思考深度",
      "模型价格",
      "购买力",
      "大约能用多少次",
      "AI Model",
    ],
    sourcePaths: [
      "frontend-user/src/shared/api/models.ts",
      "frontend-user/src/shared/components/chat/ModelSelector.tsx",
      "backend/internal/modelcatalog/model.go",
      "backend/internal/modelcatalog/service.go",
      "backend/internal/llmusage/model.go",
      "backend/internal/usagestat/model.go",
      "docker/mysql/migrations/0085_cost_based_quota.sql",
    ],
    related: [
      "ai-research-workflows",
      "smart-search",
      "claw",
      "prism",
      "peer-review",
      "ai-usage-quota",
      "wallet-payg",
    ],
    sections: [
      {
        id: "runtime-config",
        title: "怎样选择模型和思考深度",
        markdown: `在智能搜论文、智能助手、智能写作和智能审稿里，可以看到当前用的模型和思考深度。模型和思考深度都只对当前这次任务生效。

思考深度有轻、中、高、极高四档。档位越高，模型通常会想得更久、步骤更多，等待时间也会更长，消耗一般也会更多。换思考深度不会换成另一个模型，只是让同一个模型更认真地做这一轮。

这个选择会跟着当前对话保存。刷新页面或换一台设备，原来的对话仍会沿用你选过的模型。新开对话时，如果没有另外选择，就用该功能的默认模型。某个模型下线、你的会员不够用，或者暂时不能选时，页面会回到还能用的选项。`,
      },
      {
        id: "current-models",
        title: "现在可以选哪些模型",
        markdown: `截止今日更新，站内正在提供的模型分成三档。这 8 个模型目前都已开放，Free、Pro、Max 都可以选。之后名单可能调整，请以输入框里当时看到的列表为准。

基础模型更省额度，适合日常提问；经济模型更均衡；高级模型更适合难一些的任务，但一次会用掉更多额度。只有写了“可以看图”的模型，才适合把图片一起发给它。能发送图片，不代表它一定能看懂图里的全部细节。对话太长时，较早的内容可能被收短，以免超出模型能记住的范围。`,
        table: {
          columns: [
            { key: "model", header: "模型" },
            { key: "tier", header: "档位" },
            { key: "bestFor", header: "比较适合" },
            { key: "vision", header: "看图" },
          ],
          rows: [
            {
              model: "Qwen3.7 Flash",
              tier: "基础模型",
              bestFor: "日常提问，也比较省额度",
              vision: "可以",
            },
            {
              model: "DeepSeek V4.1 Flash",
              tier: "经济模型",
              bestFor: "日常问答，也可以看图",
              vision: "可以",
            },
            {
              model: "Qwen3.7 Plus",
              tier: "经济模型",
              bestFor: "日常研究和看图",
              vision: "可以",
            },
            {
              model: "Qwen3.8 Flash",
              tier: "经济模型",
              bestFor: "较快完成，也可以看图",
              vision: "可以",
            },
            {
              model: "GLM 5.3 Flash",
              tier: "经济模型",
              bestFor: "较快完成，也可以看图",
              vision: "可以",
            },
            {
              model: "DeepSeek V4 Pro",
              tier: "高级模型",
              bestFor: "复杂推理、较长回答",
              vision: "不可以",
            },
            {
              model: "Qwen3.8 Max",
              tier: "高级模型",
              bestFor: "难一些的任务，也可以看图",
              vision: "可以",
            },
            {
              model: "GLM 5.3",
              tier: "高级模型",
              bestFor: "复杂推理，不看图",
              vision: "不可以",
            },
          ],
        },
        blocks: [{ type: "markdown" }, { type: "table" }],
      },
      {
        id: "pricing",
        title: "不同模型怎么计费",
        markdown: `额度按实际用量扣，不按你点了几次发送来扣。系统会分别计算：模型读了你多少内容、写了多少回答，以及有没有复用刚才已经读过的内容。读得越多、写得越长、选的模型越强，通常扣得越多。

有两类情况会临时更贵。DeepSeek 在工作日北京时间 9:00–12:00 和 14:00–18:00 用量会按更高标准计算。Qwen3.7 Plus 和 Qwen3.7 Flash 则是内容特别长时更贵：一次读入的内容越多，越可能按更高一档来算。

下表用“读你的内容 / 生成回答 / 复用已读内容”三列价格来对照，单位是每 100 万用量多少元。页面上最终显示的是算力点。已经发生过的消耗不会因为后来改价而重算。`,
        table: {
          columns: [
            { key: "model", header: "模型" },
            { key: "base", header: "平时价格" },
            { key: "tier", header: "什么时候更贵" },
          ],
          rows: [
            {
              model: "Qwen3.7 Flash",
              base: "0.2 / 0.8 / 0.04",
              tier: "内容较长或特别长时更贵",
            },
            {
              model: "DeepSeek V4.1 Flash",
              base: "1 / 4 / 0.02",
              tier: "工作日高峰约贵一倍",
            },
            {
              model: "Qwen3.7 Plus",
              base: "2 / 8 / 0.4",
              tier: "内容特别长时更贵",
            },
            {
              model: "Qwen3.8 Flash",
              base: "0.8 / 2.7 / 0.1",
              tier: "平时就是这个价格",
            },
            {
              model: "GLM 5.3 Flash",
              base: "0.8 / 2.8 / 0.23",
              tier: "平时就是这个价格",
            },
            {
              model: "DeepSeek V4 Pro",
              base: "4.5 / 13.5 / 0.15",
              tier: "工作日高峰约贵一倍",
            },
            {
              model: "Qwen3.8 Max",
              base: "12 / 36 / 1.5",
              tier: "平时就是这个价格",
            },
            {
              model: "GLM 5.3",
              base: "8 / 28 / 2",
              tier: "平时就是这个价格",
            },
          ],
        },
        blocks: [
          { type: "markdown" },
          { type: "table" },
          {
            type: "tip",
            tip: {
              text: "模型名单和价格都可能调整。开始任务前，以输入框里当前显示的模型为准。",
            },
          },
        ],
      },
      {
        id: "formula",
        title: "一次使用为什么有时贵、有时便宜",
        markdown: `点一次发送，不一定只扣一次。模型可能先读你的问题，再去查资料或改稿，再写出回答。附件越长、对话越久、选的模型档位越高，这一轮通常越贵。

同样一件事，基础模型往往最省，经济模型居中，高级模型一次会用掉更多额度。所以不要只按输入框里的字数去估算最终用量。智能审稿更明显：一次提交会经过好几步，整次提交的消耗，通常高于普通的一问一答。`,
      },
      {
        id: "feature-bindings",
        title: "哪些功能可以自己选模型",
        markdown: `智能搜论文、智能助手、智能写作、智能审稿、制作 PPT、科研绘图和数据分析，都可以自己选模型。截止今日更新，这些功能的默认模型都是基础模型 Qwen3.7 Flash。制作 PPT、科研绘图和数据分析，没有单独另一套默认模型，跟智能助手相同。

论文翻译和矩阵分析目前不能每次换模型，会按系统为该功能指定的模型来做，一般按基础模型来理解。已经保存在旧对话里的可用模型，不会因为默认模型调整而被自动换掉。`,
      },
      {
        id: "purchasing-power",
        title: "Pro、Max 与科研经费大约能用多少次",
        markdown: `截止今日更新，预估标准按模型档位分开看，先不把思考深度算进去。选基础、经济还是高级模型，次数差会比较大。额度什么时候恢复、用完后怎样继续，见额度说明；要对着套餐看次数，以下面三档为准。

会员按周看次数，经费按每 1,000 看次数。Pro 一周额度相当于 2,000 经费，所以 1,000 经费大约是 Pro 一周的一半。制作 PPT、科研绘图和数据分析没有单独一张表，次数可参照智能助手。论文翻译和矩阵分析目前还不能换模型，只写在基础模型里。

这里的“一次”按页面上的动作来理解：对话是发一条，写作是改一轮，审稿是提交一次，翻译是译一次，矩阵分析是分析一篇论文。附件更长、任务更难时，次数会变少。`,
        blocks: [
          { type: "markdown" },
          {
            type: "tip",
            tip: {
              text: "这是截止今日更新的预估标准，不是保证次数。同一档里换一个具体模型，或把思考深度调高，实际次数还会再变。",
            },
          },
        ],
      },
      {
        id: "purchasing-power-basic",
        title: "基础模型大约能用多少次",
        markdown: `基础模型目前主要是 Qwen3.7 Flash，也是多数功能的默认选择。论文翻译和矩阵分析目前一般也按这一档来理解。`,
        table: {
          columns: [
            { key: "feature", header: "功能" },
            { key: "pro", header: "Pro（次/周）" },
            { key: "max", header: "Max（次/周）" },
            { key: "funds", header: "每 1,000 经费（次）" },
          ],
          rows: [
            {
              feature: "智能助手/次提问",
              pro: "≈ 120",
              max: "≈ 600",
              funds: "≈ 60",
            },
            {
              feature: "智能搜论文/次提问",
              pro: "≈ 74",
              max: "≈ 371",
              funds: "≈ 37",
            },
            {
              feature: "智能写作/次编辑",
              pro: "≈ 87",
              max: "≈ 439",
              funds: "≈ 43",
            },
            {
              feature: "智能审稿/次提交",
              pro: "≈ 29",
              max: "≈ 148",
              funds: "≈ 14",
            },
            {
              feature: "矩阵分析/篇",
              pro: "≈ 1,700",
              max: "≈ 8,800",
              funds: "≈ 850",
            },
            {
              feature: "论文翻译/次翻译",
              pro: "≈ 2,000",
              max: "≈ 10,300",
              funds: "≈ 1,000",
            },
          ],
        },
        blocks: [{ type: "markdown" }, { type: "table" }],
      },
      {
        id: "purchasing-power-economy",
        title: "经济模型大约能用多少次",
        markdown: `经济模型目前包括 DeepSeek V4.1 Flash、Qwen3.7 Plus、Qwen3.8 Flash 和 GLM 5.3 Flash。比基础模型更均衡，一次消耗也更高。`,
        table: {
          columns: [
            { key: "feature", header: "功能" },
            { key: "pro", header: "Pro（次/周）" },
            { key: "max", header: "Max（次/周）" },
            { key: "funds", header: "每 1,000 经费（次）" },
          ],
          rows: [
            {
              feature: "智能助手/次提问",
              pro: "≈ 48",
              max: "≈ 243",
              funds: "≈ 24",
            },
            {
              feature: "智能搜论文/次提问",
              pro: "≈ 45",
              max: "≈ 229",
              funds: "≈ 22",
            },
            {
              feature: "智能写作/次编辑",
              pro: "≈ 31",
              max: "≈ 159",
              funds: "≈ 15",
            },
            {
              feature: "智能审稿/次提交",
              pro: "≈ 12",
              max: "≈ 60",
              funds: "≈ 6",
            },
          ],
        },
        blocks: [{ type: "markdown" }, { type: "table" }],
      },
      {
        id: "purchasing-power-advanced",
        title: "高级模型大约能用多少次",
        markdown: `高级模型目前包括 DeepSeek V4 Pro、Qwen3.8 Max 和 GLM 5.3。更适合难一些的任务，同一周能用的次数会明显变少。`,
        table: {
          columns: [
            { key: "feature", header: "功能" },
            { key: "pro", header: "Pro（次/周）" },
            { key: "max", header: "Max（次/周）" },
            { key: "funds", header: "每 1,000 经费（次）" },
          ],
          rows: [
            {
              feature: "智能助手/次提问",
              pro: "≈ 15",
              max: "≈ 77",
              funds: "≈ 7",
            },
            {
              feature: "智能搜论文/次提问",
              pro: "≈ 12",
              max: "≈ 61",
              funds: "≈ 6",
            },
            {
              feature: "智能写作/次编辑",
              pro: "≈ 8",
              max: "≈ 40",
              funds: "≈ 4",
            },
            {
              feature: "智能审稿/次提交",
              pro: "≈ 6",
              max: "≈ 30",
              funds: "≈ 3",
            },
          ],
        },
        blocks: [
          { type: "markdown" },
          { type: "table" },
          {
            type: "article-link",
            card: {
              articleSlug: "ai-usage-quota",
              sectionId: "amounts",
              title: "额度用完后怎么办",
              description:
                "查看 Free、Pro、Max 每个周期有多少额度，以及用完后怎样恢复或用科研经费继续。",
              icon: "resource",
            },
          },
        ],
      },
    ],
  },
  {
    slug: "smart-search",
    title: "智能搜论文",
    summary:
      "以自然语言与 Agent 会话驱动的学术检索，返回解释、论文清单和来源证据。",
    category: "research-ai",
    kind: "feature",
    status: "current",
    audience: ["登录用户", "研究者"],
    aliases: ["AI 搜索", "Smart Search", "智能检索", "自然语言搜论文"],
    sourcePaths: [
      "frontend-user/src/features/search/components/smart-search/SmartSearchPanel.tsx",
      "frontend-user/src/features/search/components/smart-search/SmartSearchBibliography.tsx",
      "frontend-user/src/features/search/components/smart-search/SmartSearchSessionDock.tsx",
      "frontend-user/src/features/search/components/smart-search/SmartSearchClawHandoff.tsx",
      "frontend-user/src/features/search/components/smart-search/collect-session-papers.ts",
      "frontend-user/src/features/search/api/smart-search.ts",
      "backend/internal/smartsearch",
      "backend/internal/agentbridge",
      "agent-skills/smart-search-skills",
    ],
    related: [
      "academic-search",
      "paper",
      "agent-runtime",
      "ai-usage-quota",
      "ai-models-and-runtime-config",
    ],
    sections: [
      {
        id: "difference",
        title: "与论文库搜索的区别",
        markdown: `在智能搜论文输入框中直接写下完整的研究问题，例如研究对象、方法和时间范围，再发送即可；下图展示的是等待输入时的状态。智能搜论文会围绕问题规划检索、整理来源并给出说明，论文库搜索则更适合明确检索词和筛选条件。

两种方式都能找到论文，但智能搜论文还会保留这一轮对话中的查询过程和来源线索。`,
        embeds: [{ id: "smart-search-dock" }],
        blocks: [
          { type: "markdown" },
          {
            type: "article-link",
            card: {
              articleSlug: "smart-literature-search-guide",
              sectionId: "frame-the-question",
              title: "把研究需求写成可执行的第一问",
              description:
                "按学科复制提问模板，明确对象、时间、结果类型与证据边界。",
              icon: "sparkles",
            },
          },
          { type: "embeds" },
        ],
      },
      {
        id: "session",
        title: "会话与连接",
        markdown: `发送问题后，页面会在同一会话中逐步形成回答。下图展示已经得到回答和论文组的结果态；折叠的“思考过程”用于查看本轮过程摘要，论文可逐篇选择或一键暂存。底部会话 Dock 展示最近任务的标题、时间和结果数，可以切换当前任务，或开启一个不继承旧上下文的新会话。每个会话独立保存消息与检索结果。

连接短暂中断时，页面会另行提示并尝试恢复，你不需要重新复制已经送达的问题。实时连接使用一次性的短期凭据，不会把长期登录信息直接放进连接地址。`,
        embeds: [{ id: "smart-search-session" }],
        blocks: [
          { type: "markdown" },
          { type: "embeds" },
          {
            type: "article-link",
            card: {
              articleSlug: "marketing-pages-and-implementation-boundaries",
              sectionId: "agent-status",
              title: "推理过程和任务状态怎样读",
              description:
                "区分可展开的过程摘要、工具执行、任务进度与最终回答。",
              icon: "sparkles",
            },
          },
        ],
      },
      {
        id: "evidence",
        title: "论文与证据",
        markdown: `回答可以附带结构化论文清单和证据引用。右侧参考文献栏会汇总当前会话中工具实际返回的去重论文，补全元数据并按轮次分组；可以逐篇选择或把整组加入暂存区。它不是模型凭文字临时编造的书目，也不代表论文已经保存到“我的资源”。论文卡仍连接到标准论文实体，用户应打开详情或全文验证回答中的事实，而不是只引用对话文字。`,
      },
      {
        id: "claw-handoff",
        title: "检索完成后转到 Claw",
        markdown: `一轮检索完成后，页面会显示“检索到这里，深挖去智能助手”的交接入口，并导航到 \`/claw\`。当前交接只负责换到通用研究助手，不会自动把智能搜论文的会话、论文清单或回答作为 Claw 上下文传递；需要继续深挖时，应自行暂存论文、引用必要材料或重新说明任务。`,
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
      "frontend-user/src/features/landing/pages/ClawLandingPage.tsx",
      "frontend-user/src/features/claw/routes.tsx",
      "frontend-user/src/features/claw/pages/ClawPage.tsx",
      "frontend-user/src/features/claw/pages/mobile/MobileClawPage.tsx",
      "frontend-user/src/features/claw/components/chat/ConversationWorkspace.tsx",
      "frontend-user/src/features/claw/components/chat/ClawHero.tsx",
      "frontend-user/src/features/claw/components/chat/ClawNoviceTour.tsx",
      "frontend-user/src/features/claw/components/chat/TemplateCards.tsx",
      "backend/internal/claw",
      "agent-skills/claw-add",
    ],
    related: [
      "agent-runtime",
      "agent-artifacts",
      "community-skills",
      "research-data-analysis",
      "ai-models-and-runtime-config",
    ],
    sections: [
      {
        id: "workspace",
        title: "会话工作区",
        markdown: `进入 Claw 后，桌面端左侧是文献工作区，主对话区顶部可以打开会话历史，中间显示消息与输入框，右侧扩展区用于查看生成的文件；你还可以在输入框中添加附件或选择 Skill。

手机端把会话历史收进抽屉，当前对话单独成页。左边是新对话入口，可以从推荐任务开始；右边是正在进行的会话，消息、处理步骤和生成文件都在同一屏。`,
        embeds: [
          { id: "claw-workspace" },
          { id: "mobile-claw" },
          { id: "mobile-claw-active-session" },
        ],
        blocks: [
          {
            type: "markdown",
            markdown:
              "进入 Claw 后，桌面端左侧是文献工作区，主对话区顶部可以打开会话历史，中间显示消息与输入框，右侧扩展区用于查看生成的文件；你还可以在输入框中添加附件或选择 Skill。",
          },
          { type: "embeds", ids: ["claw-workspace"] },
          {
            type: "article-link",
            card: {
              articleSlug: "marketing-pages-and-implementation-boundaries",
              sectionId: "workspaces",
              title: "扩展区、标签页与文件树",
              description:
                "了解桌面工作区的通用分栏，以及窄屏中如何改为抽屉或整屏查看。",
              icon: "resource",
            },
          },
          {
            type: "markdown",
            markdown:
              "手机端把会话历史收进抽屉，当前对话单独成页。左边是新对话入口，可以从推荐任务开始；右边是正在进行的会话，消息、处理步骤和生成文件都在同一屏。",
          },
          {
            type: "embeds",
            ids: ["mobile-claw", "mobile-claw-active-session"],
            layout: "row",
          },
        ],
      },
      {
        id: "onboarding-and-templates",
        title: "首次引导与创作模板",
        markdown: `首次引导依次聚焦输入框、模型、Skill、附件/文库引用和模板区，并配合牛犀犀动作提示；它只说明控件位置，不会替用户发送消息。

当前模板扇面有五张卡：制作PPT、科研绘图、scholay 选刊、矩阵分析和 PDF-Chat。只有制作PPT与科研绘图已经接到专用会话；后三张点击后只显示“即将推出”，属于产品占位。普通研究问答仍可直接在输入框开始，不需要先选模板。`,
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
      "以期刊论文和学位论文为完整流程，另有会议论文占位与复用期刊向导的其他稿件入口。",
    category: "research-ai",
    kind: "feature",
    status: "current",
    audience: ["作者", "研究者", "研究生"],
    aliases: ["AI 审稿", "同行评审", "Peer Review"],
    sourcePaths: [
      "frontend-user/src/features/landing/pages/PeerReviewLandingPage.tsx",
      "frontend-user/src/features/peer-review/routes.tsx",
      "frontend-user/src/app/layouts/app-sidebar-records.ts",
      "frontend-user/src/features/peer-review/layouts/PeerReviewShell.tsx",
      "frontend-user/src/features/peer-review/pages/SubmissionLandingPage.tsx",
      "frontend-user/src/features/peer-review/pages/JournalWizardPage.tsx",
      "frontend-user/src/features/peer-review/pages/ThesisWizardPage.tsx",
      "frontend-user/src/features/peer-review/pages/RecordsPage.tsx",
      "frontend-user/src/features/peer-review/pages/RecordDetailPage.tsx",
      "frontend-user/src/features/peer-review/pages/SubmitSuccessPage.tsx",
      "frontend-user/src/features/peer-review/api/stream.ts",
      "backend/internal/peerreview/stream.go",
      "backend/internal/peerreview/service.go",
      "backend/internal/peerreview",
      "agent-skills/reviewer-skills",
    ],
    related: [
      "paper",
      "agent-runtime",
      "ai-usage-quota",
      "ai-models-and-runtime-config",
      "prism",
    ],
    sections: [
      {
        id: "submission",
        title: "四个入口，两套完整向导",
        markdown: `智能审稿 Hub 显示期刊论文、学位论文、会议论文和其他四个入口。期刊论文与学位论文拥有各自完整向导；会议论文当前标为“即将推出”，访问 \`/peer-review/conference\` 会回到 Hub；“其他”可以通过 \`/peer-review/other\` 进入，但暂时复用期刊论文向导，不应写成独立稿件流程。按向导上传主稿并填写目标期刊、研究领域或学校等信息，确认提交后才会开始评审。

主稿上限为 50 MiB，附件每个最多 30 MiB、最多 10 个。仅上传完成时任务仍是草稿，你还可以继续检查和修改。`,
        embeds: [{ id: "peer-review-entry" }],
      },
      {
        id: "review",
        title: "评审过程",
        markdown: `提交后，进度页会显示任务正在排队、分析稿件信息、检查投稿信与方法、生成评审结果等阶段；下图冻结在“初审已通过、三位审稿人与主审仍等待、阶段 1/5 通读全文”的状态。顶部“阶段 1/5”是当前运行阶段，不等于已经得到 20% 的评审结果；初审已通过与审稿人仍等待可以同时出现，预计剩余时间只是估算。任务会从草稿进入排队、评审，最后变为完成或失败，失败后可以重试。

只有草稿可以编辑。服务在数据库状态写入后，会通过按提交与槽位分组的 SSE 广播 \`state\`、\`report_ready\` 等控制帧；前端据此刷新提交与报告，刷新页面时可先拿到状态快照。推送是 best-effort，数据库才是事实来源，断线或漏帧时仍会慢速轮询恢复，不能把实时消息当成唯一完成凭据。`,
        embeds: [{ id: "peer-review-progress" }],
      },
      {
        id: "records",
        title: "记录与边界",
        markdown: `打开评审记录，可以按状态查看过去的任务并进入详情；下图展示的是包含多种任务状态的记录列表。列表中的进度条表示 Scholay 内部审稿任务阶段，不是期刊外审或投稿处理进度。智能审稿用于在投稿前发现风险，不代表期刊的真实决定，也不能替代领域专家、伦理审查或统计复核。`,
        embeds: [{ id: "peer-review-records-list" }],
        blocks: [
          { type: "markdown" },
          { type: "embeds" },
          {
            type: "article-link",
            card: {
              articleSlug: "ai-models-and-runtime-config",
              sectionId: "purchasing-power",
              title: "按模型档位查看大约能用多少次",
              description:
                "基础、经济和高级模型分开对照 Pro、Max 每周大约几次，以及每 1,000 经费大约几次。",
              icon: "review",
            },
          },
        ],
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
      "frontend-user/src/features/landing/pages/PrismLandingPage.tsx",
      "frontend-user/src/features/prism/routes.tsx",
      "frontend-user/src/features/prism/pages/PrismPage.tsx",
      "frontend-user/src/app/layouts/FeatureHub.tsx",
      "frontend-user/src/app/layouts/app-sidebar-records.ts",
      "frontend-user/src/features/prism/components/PrismWorkspaceV2.tsx",
      "frontend-user/src/features/prism/api/prism.ts",
      "frontend-user/src/shared/hooks/useNotificationSocket.ts",
      "frontend-user/src/shared/lib/compile-events.ts",
      "backend/internal/prism/compile_notify.go",
      "backend/internal/prism",
      "agent-skills/prism-skills",
      "prism_tex",
    ],
    related: [
      "agent-runtime",
      "agent-artifacts",
      "peer-review",
      "paper",
      "ai-models-and-runtime-config",
    ],
    sections: [
      {
        id: "modes",
        title: "快速模式与高级模式",
        markdown: `Prism Hub 同时展示“快速模式”和“高级模式”。高级模式从 \`/prism?mode=advanced\` 进入项目列表，是当前可用的科研级 LaTeX 工作区；快速模式标记为“即将推出”，\`/prism\` 和 \`/prism?mode=quick\` 都只会回到 Hub，不存在已经可编辑的短文工作区。已有项目 ID 仍会直接打开对应项目。`,
      },
      {
        id: "workspace",
        title: "写作工作区",
        markdown: `打开 Prism 项目后，你会看到论文结构、AI 写作对话与正文编辑区；选择章节即可开始阅读或写作。下图同时冻结在“逐块审阅待确认”状态：AI 改动尚未写入正文，必须先选择“应用”或“丢弃”，输入框才会恢复。编译后的 PDF 预览不在这张图中。

新项目按结构化章节保存。较早版本创建的旧式文件项目会保留，但目前以只读方式打开，不能按旧流程继续改写。`,
        embeds: [{ id: "prism-workspace" }],
      },
      {
        id: "writing-tools",
        title: "写作工具",
        markdown: `新建或进入空项目时，空对话起始页提供生成摘要、全文润色、整篇翻译、意见回应、投稿材料和数字校验；下图展示的就是这个起始状态。引用与公式从编辑器工具栏进入，作者/机构和质量检查从各自的顶栏入口进入。提交 AI 修改后，默认会在本轮结束时应用变化；如果打开“逐块审阅”，你可以逐项接受或拒绝。

页面里关于多人实时协作的介绍目前没有稳定入口，请不要把它当作已经可以使用的功能。`,
        embeds: [{ id: "prism-writing-start" }],
      },
      {
        id: "compile",
        title: "编译与交付",
        markdown: `点击编译后，页面会依次显示排队、编译中、成功或失败。下图只冻结一次 LaTeX 内容编译失败的状态：错误提示会出现在工作区上方，右侧预览区也会说明 PDF 尚未生成。成功时则可以直接预览或下载 PDF。

只有 LaTeX 内容错误会尝试自动修复；其他错误需要稍后重试或根据提示处理。

后端在编译状态写库后，会通过用户通知 WebSocket best-effort 推送完整编译对象；前端把 \`compile_status\` 转成页面事件，并以轮询作为漏推或断线时的兜底。数据库仍是状态事实来源，所以通知到达更快不等于编译成功，最终以重新读取的任务状态和可用 PDF 为准。`,
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
        markdown: `数据分析的专用会话与后端仍存在，但当前 Claw 新对话模板扇面不再提供“数据分析”卡；可见的五张卡是制作PPT、科研绘图、scholay 选刊、矩阵分析和 PDF-Chat，后三张还是占位。因此不能把下方旧起始页示意当成当前可点击入口；只有部署另行提供的数据分析入口或已有会话才能进入专用流程。进入后，应附上数据文件并写清研究问题，助手再理解变量、数据质量和研究设计并选择统计方法。

结果应同时包含方法说明、关键数值、诊断和可下载产物，而不只是自然语言结论。`,
        embeds: [
          { id: "claw-empty-state", caption: "智能助手 · 数据分析入口" },
        ],
        blocks: [
          { type: "markdown" },
          {
            type: "prompt-tabs",
            group: {
              id: "research-data-analysis-question",
              title: "先写清研究设计，再要求选择方法",
              description:
                "复制最接近的数据结构，替换文件名、变量、单位与编码说明。",
              options: [
                {
                  id: "two-group-comparison",
                  label: "两组比较",
                  prompt:
                    "只分析附件【文件名】。研究问题是【问题】；结局变量为【变量】，分组变量为【变量】，单位与编码为【说明】，缺失值编码为【说明】。先检查变量类型、样本量、缺失、异常值和研究设计；信息不足时先提问，不要自行假设。请选择当前支持范围内合适的两组比较方法，并报告描述统计、假设检查、效应量、区间、p 值和方法选择理由。不要把组间差异表述为因果关系。",
                },
                {
                  id: "multi-group-comparison",
                  label: "多组比较",
                  prompt:
                    "只分析附件【文件名】。比较【组别变量】的多个组在【结局变量】上的差异。先检查每组样本量、分布、方差与缺失；在当前支持范围内选择合适的多组检验，并报告整体检验、效应量和必要的后续比较建议。若当前工具不能完成所需比较，请明确说明，不要用不等价方法替代。",
                },
                {
                  id: "paired-observations",
                  label: "配对数据",
                  prompt:
                    "附件【文件名】包含同一对象在【两个时间点/两个条件】下的配对观测。对象标识为【ID】，结果变量为【变量】。请先验证配对关系和缺失情况，再选择配对检验，报告配对差值、描述统计、假设检查、效应量、区间和 p 值。",
                },
                {
                  id: "categorical-data",
                  label: "分类资料",
                  prompt:
                    "分析附件【文件名】中【变量 A】与【变量 B】的分类资料关系。先列出列联表、样本量与期望频数，再在当前支持范围内选择卡方或精确检验，并说明选择理由、效应大小与限制。稀疏单元格或编码不清时先报告问题。",
                },
              ],
            },
          },
          {
            type: "article-link",
            card: {
              articleSlug: "stat-lab-method-boundary",
              sectionId: "methods",
              title: "先核对当前支持的统计方法",
              description:
                "查看两组、多组、配对与分类资料的真实方法目录，不从已安装依赖推断能力。",
              icon: "review",
            },
          },
          { type: "embeds" },
        ],
      },
      {
        id: "environment",
        title: "执行环境",
        markdown: `统计工具在 Agent 的受控工作区中运行，支持常见表格和统计文件。文件解析失败、变量类型不明或研究设计不足时，应先澄清或报告限制，不应为了产出而猜测。`,
        blocks: [
          { type: "markdown" },
          {
            type: "tip",
            tip: {
              text: "提交数据前保留一份原始文件，并另附变量字典：至少写清列名、含义、单位、分组编码和缺失值编码。SPSS、Stata、SAS 专有文件需先转换为 CSV 或 XLSX。",
              link: {
                articleSlug: "claw-attachments-and-references",
                sectionId: "unsupported",
                label: "查看附件格式与转换说明",
              },
            },
          },
        ],
      },
      {
        id: "responsibility",
        title: "解释边界",
        markdown: `显著性、效应量、模型假设和缺失值处理都必须结合领域语境解释。AI 分析不能替代研究方案审查，尤其不能从观察数据自动推断因果。`,
        blocks: [
          { type: "markdown" },
          {
            type: "next-steps",
            group: {
              title: "下一步",
              description:
                "完成计算后，不要停在自然语言结论；继续核对方法、文件与可复现信息。",
              items: [
                {
                  articleSlug: "stat-lab-method-boundary",
                  sectionId: "workflow",
                  title: "复核计算与报告链路",
                  description: "检查方法卡、假设检查和报告 bundle 是否对应。",
                  icon: "review",
                },
                {
                  articleSlug: "claw-interface-guide",
                  sectionId: "artifacts",
                  title: "下载并打开分析交付物",
                  description:
                    "核对表格、图形、数据文件和方法说明，而不只阅读聊天文字。",
                  icon: "resource",
                },
                {
                  articleSlug: "agent-artifacts",
                  sectionId: "access",
                  title: "确认交付文件的访问与归属",
                  description: "了解文件怎样被收集、更新并与当前会话关联。",
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
        blocks: [
          { type: "markdown" },
          {
            type: "prompt-tabs",
            group: {
              id: "research-figure-brief",
              title: "按图形任务写清内容与证据边界",
              description:
                "复制最接近的图形类型；生成后仍需逐项核对标签、数据和科学关系。",
              options: [
                {
                  id: "mechanism-diagram",
                  label: "机制示意图",
                  prompt:
                    "根据【材料/论文】制作一张用于【论文/组会/项目申请】的机制示意图。必须体现【实体】、【关系】和【方向】，标签使用【中文/英文】。只画材料能够支持的关系；不确定或假设性关系使用明确的视觉区分并在图注说明。交付可编辑 SVG，并附节点与连线清单。",
                },
                {
                  id: "method-flowchart",
                  label: "方法流程图",
                  prompt:
                    "把【研究方法/实验流程】整理成从【起点】到【终点】的方法流程图。包含输入、关键步骤、判断分支、输出和失败/排除条件；步骤顺序以附件为准，不要补造未提供的环节。交付可编辑 SVG，并附一段可用于论文方法部分的图注。",
                },
                {
                  id: "data-visualization",
                  label: "数据图",
                  prompt:
                    "只使用附件【文件名】中的数据制作【图形类型】。横轴为【变量】，纵轴为【变量与单位】，分组为【变量】，误差表示【标准差/标准误/置信区间】。不得改变数值或隐藏缺失；请同时交付可编辑图形、作图数据和图注草稿。",
                },
                {
                  id: "graphical-abstract",
                  label: "图形摘要",
                  prompt:
                    "把【研究问题—方法—主要发现—意义】压缩为一张图形摘要。每部分只保留一个核心信息，所有数字和关系必须能在附件中定位。使用【期刊/会议】适合的版式，交付可编辑 SVG，并列出仍需作者确认的内容。",
                },
              ],
            },
          },
          { type: "embeds" },
        ],
      },
      {
        id: "slides",
        title: "演示文稿",
        markdown: `演示文稿工作流根据主题、材料和受众生成页面结构与可编辑文件。交付目标是能继续修改的演示文件，而不是把每一页烘焙成不可编辑图片。`,
        blocks: [
          { type: "markdown" },
          {
            type: "prompt-tabs",
            group: {
              id: "research-slides-brief",
              title: "按汇报场景设置叙事重点",
              description:
                "替换受众、时长和核心问题，并把材料中没有的内容留作待确认项。",
              options: [
                {
                  id: "lab-meeting",
                  label: "组会汇报",
                  prompt:
                    "基于【附件/材料】制作一份面向【受众】的【组会汇报】演示文稿，时长【分钟】，约【页数】页。叙事主线是【核心问题】。每页只表达一个判断，区分背景、证据、方法、结果、局限和下一步；所有数字、图表与引用都标明来源。不要补造材料中没有的结果。交付可继续编辑的演示文件，并附逐页标题、讲述要点和仍需确认的内容。强调当前进展、问题和下周决策。",
                },
                {
                  id: "proposal-defense",
                  label: "开题报告",
                  prompt:
                    "基于【附件/材料】制作一份面向【受众】的【开题报告】演示文稿，时长【分钟】，约【页数】页。叙事主线是【核心问题】。每页只表达一个判断，区分背景、证据、方法、结果、局限和下一步；所有数字、图表与引用都标明来源。不要补造材料中没有的结果。交付可继续编辑的演示文件，并附逐页标题、讲述要点和仍需确认的内容。强调研究空白、问题、设计、可行性和风险。",
                },
                {
                  id: "conference-talk",
                  label: "学术会议",
                  prompt:
                    "基于【附件/材料】制作一份面向【受众】的【学术会议】演示文稿，时长【分钟】，约【页数】页。叙事主线是【核心问题】。每页只表达一个判断，区分背景、证据、方法、结果、局限和下一步；所有数字、图表与引用都标明来源。不要补造材料中没有的结果。交付可继续编辑的演示文件，并附逐页标题、讲述要点和仍需确认的内容。强调一条核心贡献、关键证据和时间控制。",
                },
                {
                  id: "thesis-defense",
                  label: "毕业答辩",
                  prompt:
                    "基于【附件/材料】制作一份面向【受众】的【毕业答辩】演示文稿，时长【分钟】，约【页数】页。叙事主线是【核心问题】。每页只表达一个判断，区分背景、证据、方法、结果、局限和下一步；所有数字、图表与引用都标明来源。不要补造材料中没有的结果。交付可继续编辑的演示文件，并附逐页标题、讲述要点和仍需确认的内容。强调贡献、方法合理性、结果、局限和可能追问。",
                },
              ],
            },
          },
        ],
      },
      {
        id: "shared",
        title: "共同机制",
        markdown: `科研绘图和演示文稿会分别保存自己的会话与任务设置，但都使用同一套会话历史、额度和文件交付方式。`,
        blocks: [
          { type: "markdown" },
          {
            type: "next-steps",
            group: {
              title: "下一步",
              description: "生成文件之后，按交付目标继续检查和整理。",
              items: [
                {
                  articleSlug: "claw-interface-guide",
                  sectionId: "artifacts",
                  title: "预览并下载交付物",
                  description: "打开真正的 SVG 或演示文件，确认它仍可编辑。",
                  icon: "resource",
                },
                {
                  articleSlug: "research-data-analysis",
                  sectionId: "responsibility",
                  title: "复核数据与解释边界",
                  description:
                    "图中包含统计结果时，回查分析方法、单位和数据来源。",
                  icon: "review",
                },
                {
                  articleSlug: "prism-writing-workflow",
                  sectionId: "evidence",
                  title: "把图形带入论文写作",
                  description: "补齐图注、引用与材料来源，再进入正文和编译。",
                  icon: "compass",
                },
              ],
            },
          },
        ],
      },
    ],
  },
];
