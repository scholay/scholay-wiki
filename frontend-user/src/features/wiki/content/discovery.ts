import type { WikiArticle } from "../types";

export const discoveryArticles: WikiArticle[] = [
  {
    slug: "academic-search",
    title: "学术搜索",
    summary:
      "从一级 Hub 进入智能搜论文、论文库搜索、期刊库搜索、数据集搜索与 scholay 情报，并衔接右侧研究工作区。",
    category: "discovery",
    kind: "feature",
    status: "current",
    audience: ["研究者", "学生"],
    aliases: ["论文检索", "Search", "旧版文献搜索入口"],
    sourcePaths: [
      "frontend-user/src/app/menus.ts",
      "frontend-user/src/app/layouts/app-sidebar-records.ts",
      "frontend-user/src/features/search/routes.tsx",
      "frontend-user/src/features/search/pages/SearchPage.tsx",
      "frontend-user/src/features/search/search-mode.ts",
      "frontend-user/src/features/search/components/SearchModeSwitch.tsx",
      "frontend-user/src/features/search/components/workspace/RightPanelFeatureHub.tsx",
      "frontend-user/src/features/search/components/workspace/FunctionTabGroup.tsx",
      "frontend-user/src/stores/search-right-panel.store.ts",
      "frontend-user/src/features/search/api/papers.ts",
      "backend/internal/minicod/handler.go",
    ],
    related: [
      "site-navigation",
      "paper",
      "staging-area",
      "smart-search",
      "literature-library",
      "datasets-search",
    ],
    sections: [
      {
        id: "overview",
        title: "概览",
        markdown: `\`/search\` 不带查询参数时是“学术搜索”一级 Hub。需要对话式检索时进入“智能搜论文”（\`?mode=smart\`）；已有题名、作者或稳定关键词时进入“论文库搜索”（\`?mode=classic\`）。期刊库搜索、数据集搜索和 scholay 情报使用各自二级路由，但仍属于同一个学术搜索功能树。

在论文库搜索栏输入题目、关键词或研究主题后提交，你会先得到论文列表。

需要缩小范围时，打开筛选面板，设置时间、学科、类型或开放获取条件。

找到合适的论文后，可以在结果中查看详情，并把候选加入暂存区；之后还可以打开 PDF、收藏到“我的资源 › 文献集”，或送入右侧工作区。`,
        embeds: [
          { id: "classic-search-dock" },
          { id: "classic-search-filters" },
          { id: "review-and-stage" },
        ],
        blocks: [
          {
            type: "markdown",
            markdown:
              "学术搜索一级 Hub 会先让你选择入口；进入论文库搜索后，在搜索栏输入题目、关键词或研究主题并提交，你会得到论文列表。",
          },
          { type: "embeds", ids: ["classic-search-dock"] },
          {
            type: "markdown",
            markdown:
              "需要缩小范围时，打开筛选面板，设置时间、学科、类型或开放获取条件。",
          },
          { type: "embeds", ids: ["classic-search-filters"] },
          {
            type: "markdown",
            markdown:
              "找到合适的论文后，可以在结果中查看详情，并把候选加入暂存区；之后还可以打开 PDF、收藏到“我的资源 › 文献集”，或送入右侧工作区。",
          },
          { type: "embeds", ids: ["review-and-stage"] },
        ],
      },
      {
        id: "workspace",
        title: "搜索工作区与右栏三件套",
        markdown: `桌面搜索页由搜索器、可展开的文件区和右侧拓展区组成。URL 保存模式、检索词与筛选状态，使结果页可以被刷新和分享；服务端数据由查询缓存管理，页面不会把整份搜索结果复制进全局客户端状态。

右侧工作区的 **PDF Chat、文献图谱、矩阵分析** 是互斥功能：打开其中一个会切换到该功能，再点当前项可以取消。论文、作者、期刊和 PDF 详情则作为信息页签打开，不属于这组三件套。“浏览器”名片用于快速搜索并打开论文详情，也不是第四个工作区功能。文献图谱目前只有前端产品演示，不能与已交付的矩阵分析混写。`,
        embeds: [{ id: "search-workspace" }],
      },
      {
        id: "source",
        title: "学术数据来源",
        markdown: `当前论文、作者和期刊查询统一通过后端 Minicod 客户端及账号池访问学术数据服务。旧资料中的 Semantic Scholar 专用模块已经不再是现行实现。`,
      },
    ],
  },
  {
    slug: "paper",
    title: "论文",
    summary:
      "Scholay 中连接检索结果、详情、PDF、引用、文献集和 AI 工作流的核心学术实体。",
    category: "discovery",
    kind: "entity",
    status: "current",
    audience: ["所有访客", "研究者"],
    aliases: ["学术论文", "Paper", "文献"],
    sourcePaths: [
      "backend/internal/minicod/models.go",
      "frontend-user/src/features/browser/pages/BrowserPage.tsx",
      "frontend-user/src/features/browser/components/PaperDetailPane.tsx",
      "frontend-user/src/features/browser/components/paper-detail/PaperMetadataBlock.tsx",
      "frontend-user/src/features/browser/components/paper-detail/PaperReferences.tsx",
    ],
    related: [
      "academic-search",
      "pdf-reader",
      "literature-library",
      "citation-generator",
    ],
    sections: [
      {
        id: "identity",
        title: "实体信息",
        markdown: `论文条目以稳定标识连接标题、作者、发表时间、来源期刊、摘要、引用与参考文献、开放获取状态和 PDF 线索。不同数据源字段会在后端和前端模型中归一化。`,
      },
      {
        id: "detail",
        title: "详情页",
        markdown: `点击搜索结果中的论文，会打开包含标题、作者、摘要、元数据、引用与参考文献的详情。桌面端把详情放在当前浏览工作区里，方便你返回结果或切换其他标签。

手机端使用更紧凑的标题栏。收藏、全文和分享等按钮会按登录状态与资料是否可用而出现。`,
        embeds: [{ id: "paper-detail" }, { id: "mobile-detail-header" }],
        blocks: [
          {
            type: "markdown",
            markdown:
              "点击搜索结果中的论文，会打开包含标题、作者、摘要、元数据、引用与参考文献的详情。桌面端把详情放在当前浏览工作区里，方便你返回结果或切换其他标签。",
          },
          { type: "embeds", ids: ["paper-detail"] },
          {
            type: "markdown",
            markdown:
              "手机端使用更紧凑的标题栏。收藏、全文和分享等按钮会按登录状态与资料是否可用而出现。",
          },
          { type: "embeds", ids: ["mobile-detail-header"] },
        ],
      },
      {
        id: "actions",
        title: "相关动作",
        markdown: `用户可以把论文送入暂存区或“我的资源 › 文献集”、尝试打开全文、用于矩阵分析，并在支持论文上下文的 AI 会话中继续提问。具体可用动作取决于登录状态、数据完整度和全文可用性。`,
      },
    ],
  },
  {
    slug: "pdf-reader",
    title: "PDF 阅读器",
    summary:
      "在浏览器工作区中预览学术 PDF，并为文献管理和 AI 对话提供全文上下文。",
    category: "discovery",
    kind: "page",
    status: "current",
    audience: ["研究者"],
    aliases: ["PDF 预览", "全文阅读"],
    sourcePaths: [
      "frontend-user/src/features/browser/components/PdfBrowserPane.tsx",
      "frontend-user/src/features/browser/api/open-access.ts",
      "backend/internal/pdfparse",
      "backend/internal/openaccess",
    ],
    related: ["paper", "literature-library", "claw"],
    sections: [
      {
        id: "rendering",
        title: "阅读与渲染",
        markdown: `打开可用全文后，你会在阅读器中看到页码、缩放和文档页面；下图展示的是 PDF 已载入、单页自适应的阅读状态。中间三枚按钮依次切换单页、连续页和双页布局；右侧“自适应”是当前缩放策略，全屏只改变查看空间，不改变 PDF 文件。PDF 与论文详情会分别保留在浏览工作区的标签中，你可以来回切换而不必离开当前检索过程。

阅读器内置中日韩文字所需的 CMap 资源，但能否打开全文仍取决于论文是否提供合法文件。`,
        embeds: [{ id: "pdf-reader" }],
      },
      {
        id: "availability",
        title: "全文可用性",
        markdown: `系统会结合论文记录、开放获取查询和用户文献集中的上传文件判断可用全文。找不到可合法访问的文件时，不应把元数据链接当作可下载 PDF。`,
      },
      {
        id: "parsing",
        title: "解析与后续使用",
        markdown: `后端提供 PDF 文本解析和对象存储能力。解析结果可支持元数据识别、AI 上下文和文献管理，但原始文件、解析文本与第三方链接是不同的数据对象。`,
      },
    ],
  },
  {
    slug: "authors-and-journals",
    title: "作者与期刊",
    summary:
      "围绕作者画像、合作关系、代表作，以及期刊库搜索、期刊 Hub、学科聚合和收录信息展开的发现页面。",
    category: "discovery",
    kind: "feature",
    status: "current",
    audience: ["所有访客", "研究者"],
    aliases: ["学者", "作者详情", "期刊详情", "期刊导航"],
    sourcePaths: [
      "frontend-user/src/features/browser/components/AuthorDetailPane.tsx",
      "frontend-user/src/features/browser/components/JournalDetailPane.tsx",
      "frontend-user/src/features/journals/routes.tsx",
      "frontend-user/src/features/journals/pages/JournalHubPage.tsx",
      "frontend-user/src/features/journals/pages/JournalSearchPage.tsx",
      "backend/internal/minicod/handler.go",
    ],
    related: ["paper", "academic-search", "citation-generator"],
    sections: [
      {
        id: "authors",
        title: "作者页面",
        markdown: `点击论文中的作者名，可以查看作者信息、研究主题、代表论文、年度产出和合作作者；下图展示的是资料已载入后的作者页。你可以继续打开代表作或合作作者，沿着研究关系浏览。ORCID 与来源标签只是当前记录携带的识别线索；勾形图标不表示 Scholay 已人工认证该作者。

同名、机构和来源归并信息只是识别线索，不能视为经过人工确认的唯一身份。`,
        embeds: [{ id: "author-profile" }],
      },
      {
        id: "journals",
        title: "期刊页面",
        markdown: `学术搜索中的“期刊库搜索”进入 \`/journals/search\`；\`/journals\` 本身是期刊 Hub，不再是跳转地址。在期刊库搜索页输入刊名、ISSN 或主办机构，再使用分区、影响因子等条件缩小范围。

点击结果即可进入详情，其中会按实际数据列出标识、出版社、收录信息、影响指标和相关论文。不同期刊可用字段并不相同，空缺信息不会用推测值补齐。`,
        embeds: [{ id: "journal-search" }, { id: "journal-detail" }],
        blocks: [
          {
            type: "markdown",
            markdown:
              "从学术搜索进入期刊库搜索页，输入刊名、ISSN 或主办机构，再使用分区、影响因子等条件缩小范围。",
          },
          { type: "embeds", ids: ["journal-search"] },
          {
            type: "markdown",
            markdown:
              "点击结果即可进入详情，其中会按实际数据列出标识、出版社、收录信息、影响指标和相关论文。不同期刊可用字段并不相同，空缺信息不会用推测值补齐。",
          },
          { type: "embeds", ids: ["journal-detail"] },
        ],
      },
      {
        id: "navigation",
        title: "关系导航",
        markdown: `点击论文、作者或期刊链接时，目标会在浏览工作区中打开；如果它已经打开，系统会直接切换到原标签。下图展示标签栏和快速打开面板：“+”打开快速找论文面板，点击列表行才会建立新页签，页签上的“×”只关闭当前页签，不会删除论文、作者或期刊。每个对象也有可复制和再次访问的独立链接。`,
        embeds: [{ id: "browser-tabs-quick-open" }],
        blocks: [
          { type: "markdown" },
          { type: "embeds" },
          {
            type: "article-link",
            card: {
              articleSlug: "marketing-pages-and-implementation-boundaries",
              sectionId: "navigation-and-tabs",
              title: "汉堡菜单与浏览器页签",
              description: "了解全站导航入口、页签复用、切换与关闭的共同规则。",
              icon: "compass",
            },
          },
        ],
      },
    ],
  },
  {
    slug: "staging-area",
    title: "检索暂存区",
    summary: "在检索过程中临时收集候选论文，并把它们组织成矩阵分析输入。",
    category: "discovery",
    kind: "feature",
    status: "current",
    audience: ["登录用户", "研究者"],
    aliases: ["暂存区", "工作区", "Staging area"],
    sourcePaths: [
      "frontend-user/src/features/search/components/StagingTabs.tsx",
      "frontend-user/src/features/search/hooks/useStagingActions.ts",
      "frontend-user/src/features/search/api/staging-areas.ts",
      "frontend-user/src/features/wiki/embeds/WikiEmbedStagingUnits.tsx",
      "backend/internal/stagingarea",
    ],
    related: ["academic-search", "matrix-analysis", "literature-library"],
    sections: [
      {
        id: "purpose",
        title: "用途",
        markdown: `在搜索结果中点击“暂存”，论文会先进入当前候选区，不需要立刻决定长期收藏位置。下图展示当前已有 A–C 三个单元；系统最多可增至 A–E。字母后的数字和顶部红色计数都表示该区论文总数，右上角“+”用于新增暂存区。论文行上的绿色勾表示已进入当前暂存单元，不是长期收藏或当前单选状态；行尾箭头用于展开内容。点击字母可以切换单元，再把一组候选送入矩阵分析。`,
        embeds: [{ id: "staging-units" }],
      },
      {
        id: "persistence",
        title: "状态与同步",
        markdown: `每个账户最多有 5 个暂存区，每区最多 100 篇；界面按位置显示 A–E，不能改名或手动关闭。清空当前区后，它会在你切换到其他区时移除，其余字母再按位置排列。暂存区只适合短期筛选；准备长期保存时，请把论文整理进“我的资源 › 文献集”，并用图标与背景色区分文件夹。下图展示的是这个文件夹外观选择器，不是暂存区改名功能。

未登录时的暂存内容先保存在当前设备；登录后可以同步账户内容，但不应假定所有匿名内容都会自动完整迁移。`,
        embeds: [{ id: "folder-icon-picker" }],
      },
      {
        id: "matrix",
        title: "进入矩阵",
        markdown: `进入矩阵后，暂存论文按行排列，用户选择或自定义的分析维度按列展开。系统随后逐篇生成维度结果，并支持检查和导出。`,
      },
    ],
  },
  {
    slug: "matrix-analysis",
    title: "论文矩阵分析",
    summary: "把多篇候选论文与一组分析维度交叉排列，用于结构化比较和导出。",
    category: "discovery",
    kind: "feature",
    status: "current",
    audience: ["研究者", "学生"],
    aliases: ["矩阵分析", "文献对比", "Analysis matrix"],
    sourcePaths: [
      "frontend-user/src/features/search/components/MatrixColumn.tsx",
      "frontend-user/src/features/search/components/matrix/DimensionCell.tsx",
      "frontend-user/src/features/search/components/matrix/ExportMenu.tsx",
      "frontend-user/src/features/search/api/analysis/matrix.ts",
      "backend/internal/ai",
    ],
    related: [
      "staging-area",
      "paper",
      "literature-library",
      "academic-search",
      "ai-usage-quota",
    ],
    sections: [
      {
        id: "model",
        title: "矩阵模型",
        markdown: `从学术搜索的暂存区或“我的资源 › 文献集”打开矩阵分析后，论文按行排列，分析维度按列展开；每个交叉单元格回答“这篇论文在这个维度上的结果”。

打开维度设置，可以选用系统模板，也可以增加、编辑或删除自己的维度。开关只控制维度是否显示在矩阵中，拖拽改变列顺序；系统维度右侧按钮用于恢复默认，自定义维度右侧“×”才是删除。隐藏维度不会删除已经保存的定义。

矩阵单元格是 AI 按维度生成的比较摘要，不是论文原文；导出 CSV、Markdown 或 XLSX 前仍需打开论文核对关键数值与结论。`,
        embeds: [
          { id: "matrix-workspace" },
          { id: "matrix-dimension-settings" },
        ],
        blocks: [
          {
            type: "markdown",
            markdown:
              "从学术搜索的暂存区或“我的资源 › 文献集”打开矩阵分析后，论文按行排列，分析维度按列展开；每个交叉单元格回答“这篇论文在这个维度上的结果”。",
          },
          { type: "embeds", ids: ["matrix-workspace"] },
          {
            type: "markdown",
            markdown:
              "打开维度设置，可以选用系统模板，也可以增加、编辑或删除自己的维度。开关只控制维度是否显示在矩阵中，拖拽改变列顺序；系统维度右侧按钮用于恢复默认，自定义维度右侧“×”才是删除。隐藏维度不会删除已经保存的定义。矩阵单元格是 AI 按维度生成的比较摘要，不是论文原文；导出前仍需打开论文核对关键数值与结论。",
          },
          { type: "embeds", ids: ["matrix-dimension-settings"] },
          {
            type: "prompt-tabs",
            group: {
              id: "matrix-custom-dimensions",
              title: "可复制的维度描述",
              description:
                "复制后可作为自定义维度的分析要求。每篇论文都使用同一口径，并把“未报告”和模型推断严格区分开。",
              options: [
                {
                  id: "study-design",
                  label: "研究设计",
                  prompt:
                    "概括研究设计：研究对象与样本、数据来源、核心变量、对照或基线、采用的方法和时间范围。论文未报告的内容写“未报告”，不要推断。",
                },
                {
                  id: "main-findings",
                  label: "核心发现",
                  prompt:
                    "概括论文的主要发现，并把每项发现与对应数据、表图或实验结果关联。区分作者报告的结果和作者提出的解释，不要把相关性写成因果。",
                },
                {
                  id: "limitations",
                  label: "局限边界",
                  prompt:
                    "列出作者明确承认的局限，以及从研究设计和数据范围可以直接判断的适用边界。两类内容分开呈现，不要自行发明作者未讨论的缺陷。",
                },
                {
                  id: "reproduction",
                  label: "复现要点",
                  prompt:
                    "提取复现所需的信息：数据来源、样本筛选、预处理、参数、软件或模型版本、评价指标与随机性控制。缺失项明确写“未报告”。",
                },
              ],
            },
          },
        ],
      },
      {
        id: "generation",
        title: "生成与核对",
        markdown: `矩阵结果由 AI 分析生成，因此仍需回到论文原文核对。批量生成会受到可用论文内容、模型状态和账户额度影响；失败单元格可以与已完成结果分开处理。`,
        blocks: [
          { type: "markdown" },
          {
            type: "tip",
            tip: {
              text: "矩阵单元格是研究辅助结论，不是可直接引用的证据。缺少原文定位时，应先标记为待核对。",
              link: {
                label: "查看论文实体与原始材料边界",
                articleSlug: "paper",
                sectionId: "identity",
              },
            },
          },
          {
            type: "article-link",
            card: {
              articleSlug: "ai-usage-quota",
              title: "批量生成会使用 AI 周期额度",
              description:
                "了解算力点怎样记录、额度何时恢复，以及为什么失败单元格可以与已完成结果分开处理。",
              icon: "sparkles",
            },
          },
        ],
      },
      {
        id: "export",
        title: "导出",
        markdown: `矩阵提供面向后续整理的导出入口。导出结果是研究辅助材料，不自动成为可引用证据，引用仍应指向原论文。`,
        blocks: [
          { type: "markdown" },
          {
            type: "next-steps",
            group: {
              title: "导出后继续核对与引用",
              description:
                "先把矩阵中的判断追溯到原文，再把真正采用的论文整理成规范引用。",
              items: [
                {
                  articleSlug: "pdf-reader",
                  sectionId: "rendering",
                  title: "回到 PDF 核对原文",
                  description:
                    "检查关键数字、方法、限定条件以及矩阵记录的页码和图表位置。",
                  icon: "search",
                },
                {
                  articleSlug: "citation-dialog",
                  sectionId: "quality",
                  title: "生成并核对正式引用",
                  description:
                    "使用论文元数据生成引用，并按目标期刊要求检查作者、年份和标识符。",
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
    slug: "literature-library",
    title: "文献集",
    summary:
      "作为“我的资源”四分之一，以文件夹长期保存论文、PDF 与补充元数据，并支持工作区工具、导入和分享。",
    category: "knowledge",
    kind: "feature",
    status: "current",
    audience: ["登录用户", "研究者"],
    aliases: ["个人文献集", "文献库", "我的文献", "Library"],
    sourcePaths: [
      "frontend-user/src/features/landing/pages/LibraryLandingPage.tsx",
      "frontend-user/src/features/library/routes.tsx",
      "frontend-user/src/features/library/pages/LibraryPage.tsx",
      "frontend-user/src/features/search/components/workspace/PdfChatPanel.tsx",
      "frontend-user/src/features/search/components/workspace/CitationGraphPanel.tsx",
      "frontend-user/src/features/search/components/MatrixColumn.tsx",
      "frontend-user/src/features/library/pages/mobile/MobileLibraryPage.tsx",
      "frontend-user/src/features/library/pages/mobile/MobileFolderPage.tsx",
      "frontend-user/src/features/library/api/folders.ts",
      "frontend-user/src/features/library/api/papers.ts",
      "backend/internal/library",
    ],
    related: [
      "my-resources",
      "paper",
      "pdf-reader",
      "staging-area",
      "matrix-analysis",
      "literature-graph-status",
      "pdf-chat-guide",
      "library-sharing",
    ],
    sections: [
      {
        id: "organization",
        title: "组织方式",
        markdown: `从“我的资源”进入文献集（\`/library?section=papers\`）后，桌面端会在侧栏列出文件夹，在主区显示论文、PDF 和处理状态。列表行里的 G/D 是数据来源缩写，不是质量等级；“基础信息完整”只表示关键题录字段齐全，“PDF 完整/缺失”另行表示本账户是否有可读全文。

新建或编辑文件夹时，可以选择图标和背景色。

手机端先显示文件夹列表，再进入文件夹详情。文献集使用单层文件夹：每个账户最多 50 个文件夹、1,000 篇论文；你可以批量选择论文，但一次最多处理 500 篇。页面内继续使用“文件夹”是现行组织概念，不应与已经改名的全站入口混淆。`,
        embeds: [
          { id: "literature-library" },
          { id: "folder-icon-picker" },
          { id: "mobile-library-flow" },
          { id: "mobile-library-folder" },
        ],
        blocks: [
          {
            type: "markdown",
            markdown:
              "从“我的资源”进入文献集后，桌面端会在侧栏列出文件夹，在主区显示论文、PDF 和处理状态。列表行里的 G/D 是数据来源缩写，不是质量等级；“基础信息完整”只表示关键题录字段齐全，“PDF 完整/缺失”另行表示本账户是否有可读全文。",
          },
          { type: "embeds", ids: ["literature-library"] },
          {
            type: "article-link",
            card: {
              articleSlug: "marketing-pages-and-implementation-boundaries",
              sectionId: "reference-card",
              title: "怎样读懂论文基础信息与文件树",
              description:
                "认识全站复用的题录字段、状态标记、文件树层级，以及点击后打开的详情。",
              icon: "book-open",
            },
          },
          {
            type: "markdown",
            markdown: "新建或编辑文件夹时，可以选择图标和背景色。",
          },
          { type: "embeds", ids: ["folder-icon-picker"] },
          {
            type: "markdown",
            markdown:
              "手机端先显示文件夹列表，再进入文件夹详情。文献集使用单层文件夹：每个账户最多 50 个文件夹、1,000 篇论文；你可以批量选择论文，但一次最多处理 500 篇。",
          },
          {
            type: "embeds",
            ids: ["mobile-library-flow", "mobile-library-folder"],
            layout: "row",
          },
        ],
      },
      {
        id: "workspace-tools",
        title: "文献集复用检索工作区",
        markdown: `宽屏登录态下，文献集右侧可以打开 **矩阵分析、文献图谱、PDF Chat**。三项互斥；打开论文、期刊、作者或 PDF 详情时，详情页签会暂时占用右栏。矩阵和 PDF Chat 使用当前列表中可见或勾选的论文；文献图谱仍是前端演示面，不能据此声称已经保存真实网络分析结果。`,
      },
      {
        id: "import",
        title: "导入与识别",
        markdown: `点击文献集中的导入入口，可以从检索结果加入论文，也可以上传本地 PDF。下图展示“在线搜索加入”：检索论文后逐条加入当前文献集。PDF 上传后的识别候选与确认状态见“PDF 上传、识别与重新关联”。

单个 PDF 上限为 50 MiB。“文件已保存”和“已正确关联论文”是两个不同状态；Zotero 与 EndNote 导入目前仍显示“即将上线”。`,
        embeds: [{ id: "library-import-workbench" }],
        blocks: [
          { type: "markdown" },
          { type: "embeds" },
          {
            type: "article-link",
            card: {
              articleSlug: "pdf-upload-resolve-and-relink",
              sectionId: "resolve",
              title: "PDF 上传、识别与重新关联",
              description:
                "查看上传后的识别候选、人工确认、自由文件保存与错误关联修复。",
              icon: "resource",
            },
          },
        ],
      },
      {
        id: "maintenance",
        title: "维护能力",
        markdown: `第一张图冻结在批量删除确认：遮罩后的工具栏表明已选 3 项；确认后会永久移出这些记录，不能撤销。

第二张图展示基本信息的未保存状态。“实时预览”只反映当前输入；“已同步”表示预览同步，不代表修改已经保存，仍需点击“保存修改”。管理面板还可维护 PDF、重新关联、移动或删除；重新关联用于修复识别错误或补上学术标识，保存前仍需要你确认。`,
        embeds: [
          { id: "library-bulk-actions" },
          { id: "library-maintenance-workbench" },
        ],
        blocks: [
          {
            type: "markdown",
            markdown:
              "下图冻结在批量删除确认：遮罩后的工具栏表明已选 3 项；确认后会永久移出这些记录，不能撤销。",
          },
          { type: "embeds", ids: ["library-bulk-actions"] },
          {
            type: "markdown",
            markdown:
              "下图展示基本信息的未保存状态。“实时预览”只反映当前输入；“已同步”表示预览同步，不代表修改已经保存，仍需点击“保存修改”。管理面板还可维护 PDF、重新关联、移动或删除；重新关联用于修复识别错误或补上学术标识，保存前仍需要你确认。",
          },
          { type: "embeds", ids: ["library-maintenance-workbench"] },
        ],
      },
    ],
  },
  {
    slug: "library-sharing",
    title: "文献集分享与接收",
    summary: "通过公开分享令牌把一组文献交给其他人查看或接收。",
    category: "knowledge",
    kind: "feature",
    status: "current",
    audience: ["登录用户", "分享接收者"],
    aliases: ["分享文件夹", "接收分享", "文献分享"],
    sourcePaths: [
      "frontend-user/src/features/library/pages/SharedReceivePage.tsx",
      "frontend-user/src/features/library/routes.tsx",
      "backend/internal/library/share_handler.go",
      "backend/internal/library/share_model.go",
    ],
    related: ["my-resources", "literature-library", "paper"],
    sections: [
      {
        id: "link",
        title: "分享链接",
        markdown: `分享方创建链接后，接收者可以直接在浏览器打开，不需要先进入桌面端或手机端首页。每条链接只对应这一份分享，不会包含分享方的登录信息。每个账户最多保留 200 份有效分享，每个合集最多包含 500 篇论文。`,
      },
      {
        id: "receive",
        title: "接收行为",
        markdown: `第一张图是无需提取码的公开合集：可以先浏览，登录后再收藏整个合集。

第二张图是受保护合集尚未解锁的状态；未输入提取码时，确认按钮保持禁用。提取码连续错误 5 次会被锁定。保存时会按论文来源和标识去重，复制后的文献与原分享分别维护，不会自动同步变化。`,
        embeds: [
          {
            id: "library-share-receive",
            caption: "公开合集 · 已解锁预览",
          },
          {
            id: "share-receive-variants",
            caption: "受保护合集 · 等待提取码",
          },
        ],
        blocks: [
          {
            type: "markdown",
            markdown:
              "第一张图是无需提取码的公开合集：可以先浏览，登录后再收藏整个合集。",
          },
          { type: "embeds", ids: ["library-share-receive"] },
          {
            type: "markdown",
            markdown:
              "第二张图是受保护合集尚未解锁的状态；未输入提取码时，确认按钮保持禁用。提取码连续错误 5 次会被锁定。保存时会按论文来源和标识去重，复制后的文献与原分享分别维护，不会自动同步变化。",
          },
          { type: "embeds", ids: ["share-receive-variants"] },
        ],
      },
    ],
  },
];
