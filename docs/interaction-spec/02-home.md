# 02 · 主页 + 详情页 交互明细

> 列定义见 [README](README.md)。Ground truth = 前端代码实际行为（非设计图）。

## PART 1 — 页面/流程概要

> **现状说明**：任务清单里假设的 `features/home/components/home/*`、`features/home/components/detail/*` 在代码库中**均不存在**。真实代码：
> - **主页（HOME）** = `features/home/`：`HomePage.tsx`、`NotFoundPage.tsx`、`components/HomeSidebar.tsx`、`api/library.ts`。搜索条复用 `shared/components/SearchAutocomplete.tsx`。
> - **详情页（DETAIL）** = `features/browser/`：论文/期刊/学者/PDF 详情统一由 `pages/BrowserPage.tsx` shell + `BrowserTabsBar` 承载，三类 Pane（`PaperDetailPane` / `AuthorDetailPane` / `JournalDetailPane`）+ 子段组件。

### 路由（`app/router.tsx`）
- **主页**：`'/'` index → `<HomePage>`（**非 lazy**，首屏即时加载；NotFoundPage 同样即时加载，作 `errorElement`）。
- **404**：`path:'*'` → `<NotFoundPage>`。
- **详情页**（`features/browser/routes.tsx`，无 `/browser` 前缀，canonical 同时供 runtime + SEO）：
  - `/paper/:source/:paperId` → 论文详情
  - `/author/:source/:authorId` → 学者详情
  - `/journal/:id` 与 `/journal/:id/:slug` → 期刊详情（slug 仅 SEO，组件只读 id）
  - `/pdf/:libPaperId` → 用户上传 PDF 预览
  - 全部 `lazy`，且都 `import('./pages/BrowserPage')` — 同一 shell，按 `useMatch` 决定渲染哪个 Pane。

### 主页区域（HomePage，挂 `SidebarLayout` + `HomeSidebar`）
- 左侧 `HomeSidebar`：`menus.ts` 分类（检索 / 智能 / 资源）渲染 RichMenuItem；library 卡副文已登录拉真实计数。
- 主区：`BrandLogo` + tagline + `SearchAutocomplete`（640 宽搜索条 + 联想下拉）+「智能搜索」CTA（红底 destructive 按钮 + amber「即将推出」角标）+ `Footer`。

### 详情页区域
- **BrowserPage shell**：顶部 `BrowserTabsBar`（返回 + 多页签滚动条 + "+" QuickOpenPaperDialog）+ 详情 Pane（四选一），无侧栏。tabs 为空 → BrowserTabsBar 返回 null。
- **PaperDetailPane**：880 居中阅读栏 = PaperHeader（metaRow + 大标题 + 作者[可点跳学者] + PaperMetadataBlock + PaperActionRow）+ PaperAbstract + PaperReferences（非 local 才渲染）+ PaperFooter（引用本文/BibTeX/讨论占位/meta）。
- **AuthorDetailPane**：AuthorHero（avatar + 名 + 4 stats + 个人主页/原始档案链接）+ TopicSection（研究方向 chips）+ 双列 FeaturedPapersCol（代表作 top5 按引用）/ CollaboratorsCol（top8 合作者）+ YearlyChart（自渲染年度柱状图）。
- **JournalDetailPane**：Hero（cover + badges + 标题 + 描述 + 查询原刊/分享）+ 分区与影响因子 4 卡 + 双列（出版与收录真数据 / 评分占位）+ 投稿/编委/论坛占位。
- **PdfBrowserPane**：标题条 + `PdfViewer`（pdfjs 自取鉴权 URL，不走 react-query）。

### 关键流程
- **搜索**：HomePage 输入 → SearchAutocomplete 联想（论文多源 fan-out + 作者 + 期刊推荐）；回车/点搜索按钮 → `/search?q=`；hover 搜索按钮 → picker 切「期刊检索」→ `/journals/search?q=`。
- **切换搜索模式**：HomePage「智能搜索」CTA → `/search?mode=smart`（占位预览）。
- **查看详情**：选论文/学者/期刊联想项 → `useOpenPaperInBrowser` / `useOpenAuthorInBrowser` / `useOpenJournalInBrowser`（写 browser-tabs store + SEO seed + navigate）。
- **查看引用**：PaperReferences 拉 `/public/papers/:id/references`，引用项点击 → 站内打开该论文详情（有 paperId）/ 外链（仅 url）。
- **相关学者**：AuthorDetailPane 的 CollaboratorsCol（从作品作者聚合）+ PaperHeader 作者跳转 + FeaturedPapersCol → 论文详情。

### 实现状态（真实接口 vs mock）
- **全部真实 react-query**，无 mock 静态数据：`useFetchPaperDetail` / `useFetchPaperReferences` / `useAuthorDetail` / `useAuthorPapers` / `useJournalDetail` / `useMultiSourceSearchSuggestions` / `useJournalSuggestions` / `useQuickPaperSearch` / `useLibraryFoldersForHome`。
- **派生数据（纯前端聚合）**：研究方向 / 合作学者 / 年度趋势 / 代表作均从 `useAuthorPapers` 结果聚合。
- **占位（未上线）**：智能搜索、期刊评分/投稿要求/编委/论坛、论文「读者笔记与讨论」、学者「关注」。
- **skeleton/loading**：无独立 DetailSkeletons 文件；各 Pane 用内联 `Loader2` spinner + EmptyState 处理 loading/error/失效三态；PDF chunk 用 `Suspense` fallback spinner。

## PART 2 — 元素级交互表

| 用例ID | 页面/区域 | 元素 | 触发动作 | 前置条件 | 预期结果 | 边界/异常 | 数据/接口依赖 | 状态/备注 |
|---|---|---|---|---|---|---|---|---|
| HOME-001 | 主页/Hero 搜索条 | input 文本框 | 输入文字 | 在 `/` | onChange 更新 q；trim 后 ≥1 且有结果时弹联想 dropdown | 输入非数组返回 → `asArray` 兜底；零 loading 态(无数据不弹) | `useMultiSourceSearchSuggestions` `GET /public/search/suggestions` + `useJournalSuggestions` `POST /public/journals/suggest` | 真实多源 fan-out；SearchAutocomplete.tsx:88-103 |
| HOME-002 | 主页/Hero 搜索条 | input | 按 Enter（提交 form） | input 有/无文字 | `submitPapers(trimmed)` → `goSearch`：有词 `/search?q=<enc>`，空 `/search` | 空 query → 跳 `/search` 无 q | 纯前端导航 | HomePage.tsx:50-56 |
| HOME-003 | 主页/Hero 搜索条 | input | 按 Escape | dropdown/picker 开 | 关闭 focused + picker | — | 纯前端 | SearchAutocomplete.tsx:200-205 |
| HOME-004 | 主页/Hero 搜索条 | 清空按钮(X) | 点击 | value 非空 | 清空 value 并 focus 回 input | value 空时按钮不渲染 | 纯前端 | SearchAutocomplete.tsx:210-223 |
| HOME-005 | 主页/Hero 搜索条 | 搜索按钮(放大镜) | 点击(submit) | — | 同 Enter，提交论文搜索 → `/search?q=` | — | 纯前端导航 | SearchAutocomplete.tsx:224-232 |
| HOME-006 | 主页/Hero 搜索条 | 搜索按钮 | hover 进入 | trim 长度>0 | 弹出 picker 浮层(论文/期刊切换)，与联想互斥 | trim 为空不弹；离开 120ms 宽限延迟防误关 | 纯前端 | SearchAutocomplete.tsx:101,148-161 |
| HOME-007 | 主页/picker | 「期刊检索」行 | 点击 | picker 开 | `submitJournals` → `onSearchJournals`：有词 `/journals/search?q=`，空 `/journals/search` | — | 纯前端导航 | HomePage.tsx:92-98 |
| HOME-008 | 主页/联想 dropdown | 论文项(PaperSection) | 点击 | 有论文联想 | `onPickPaper` → `useOpenPaperInBrowser` 打开论文详情 tab；无 handler 时 fallback onSubmit(title) | — | 联想接口 + browser-tabs store | HomePage.tsx:105-111 |
| HOME-009 | 主页/联想 dropdown | 作者项(AuthorSection) | 点击 | 有作者联想 | `onPickAuthor`：有 authorId → `useOpenAuthorInBrowser` 开学者详情；无 id 直接 return | 无 authorId 不跳转 | 联想接口 + store | HomePage.tsx:112-122 |
| HOME-010 | 主页/联想 dropdown | 期刊项(JournalSection,米黄底) | 点击 | 有期刊联想 | `onPickJournal` → `useOpenJournalInBrowser` 开期刊详情 `/journal/:id` | — | `useJournalSuggestions` + store | HomePage.tsx:99-104 |
| HOME-011 | 主页/Hero | 「智能搜索」CTA 按钮 | 点击 | — | `handleSmartSearch` → `/search?mode=smart`(+q 若有)；进 SearchPage 智能 tab | 仍为占位预览，挂「即将推出」角标 | 纯前端导航 | HomePage.tsx:58-66,128-142 |
| HOME-012 | 主页 | 整页加载（带 `?login=required`） | 进入(effect) | 未登录且 query 含 login=required | 弹 AuthDialog(login) 并清掉该 query(replace) | 已登录则不弹 | `useAuthDialog`/`useAuthStore` 纯前端 | HomePage.tsx:41-48 |
| HOME-013 | 主页/侧栏 | RichMenuItem 菜单行 | 点击(NavLink) | — | 导航到 `m.href`；active 态高亮 bg-surface-1 | comingSoon 项显示「即将推出」标 | `menus.ts` 静态配置 | HomeSidebar.tsx:60-130 |
| HOME-014 | 主页/侧栏 | library 卡副文 | 渲染 | 已登录(有 token) | 显示真实「N 篇 · M 个文件夹」，否则默认文案 | 未登录/无 data → 默认 SUBTITLES.library | `useLibraryFoldersForHome` `GET /user/library/folders` | HomeSidebar.tsx:39-43；library api.ts |
| HOME-015 | 主页/侧栏 | SidebarCollapseButton | 点击 | — | `useSidebar.toggle()` 折叠/展开侧栏 | — | `sidebar.store` 纯前端 | HomeSidebar.tsx |
| HOME-016 | 404 页 | 整页 | 进入(effect) | 路径过 `isValidAppPath` 白名单且本路径未 reload 过 | 显示 spinner，50ms 后 `location.reload()` 一次(自愈旧 chunk) | sessionStorage 守卫：同路径只兜一次防死循环 | 纯前端 | NotFoundPage.tsx:36-51 |
| HOME-017 | 404 页 | 整页 | 渲染 | 路径不过白名单 / 已 reload 过 | 显示 404 UI(展示 requested 路径) | — | 纯前端 | NotFoundPage.tsx:53-72 |
| HOME-018 | 404 页 | 「返回首页」按钮 | 点击 | 404 UI 可见 | Link 跳 `/` | — | 纯前端 | NotFoundPage.tsx:65-67 |
| HOME-019 | 404 页 | 「访问帮助中心」按钮 | 点击 | 404 UI 可见 | Link 跳 `/help` | — | 纯前端 | NotFoundPage.tsx:68-70 |
| DETAIL-001 | 浏览器/tabs 条 | 「返回」按钮 | 点击 | tabs 非空 | navigate 到 activeTab.returnTo(非 `/` 开头兜底 `/`) | 无 activeTab → `/` | browser-tabs store | BrowserTabsBar.tsx:83-87 |
| DETAIL-002 | 浏览器/tabs 条 | TabPill | 点击 | — | `navigate(browserTabUrl(t))` 切到该 tab | — | store | BrowserTabsBar.tsx:133-141,205 |
| DETAIL-003 | 浏览器/tabs 条 | TabPill 关闭(X) | 点击 | — | closeTab；若关的是 active → 跳右/左邻居，全关完回 `/` | 关 active 后无邻居 → `/` | store | BrowserTabsBar.tsx:89-108 |
| DETAIL-004 | 浏览器/tabs 条 | TabPill | 鼠标中键(auxclick btn1) | — | 同关闭(阻止默认 + onClose) | — | store | BrowserTabsBar.tsx:206-211 |
| DETAIL-005 | 浏览器/tabs 条 | 「+」新页签按钮 | 点击 | — | 打开 QuickOpenPaperDialog(anchored popover,align=end) | — | 纯前端 | BrowserTabsBar.tsx:147-156 |
| DETAIL-006 | 浏览器/QuickOpen | 搜索 input | 输入 | popover 开 | debounce 280ms 后三源并行搜索；到达顺序铺结果 | 空查询→空白提示；首条前→全局 loading；无结果→NoResultsHint | `useQuickPaperSearch` `POST /public/papers/search` ×3(stc/olx/pmd) | QuickOpenPaperDialog.tsx:48-129 |
| DETAIL-007 | 浏览器/QuickOpen | 清空(X) | 点击 | query 非空 | setQuery('') | query 空时不渲染 | 纯前端 | QuickOpenPaperDialog.tsx:92-101 |
| DETAIL-008 | 浏览器/QuickOpen | PaperRow | 点击 | 有结果 | `openPaper(paper)` 开论文详情 + 关 popover | — | `useOpenPaperInBrowser` + store | QuickOpenPaperDialog.tsx:57-60,148-214 |
| DETAIL-009 | 浏览器/QuickOpen | popover 打开 | open 变 true | — | 清空 query + 下一帧 focus input | — | 纯前端 | QuickOpenPaperDialog.tsx:41-46 |
| DETAIL-010 | 论文详情/Pane | 整 pane | 进入/URL 解析 | 命中 `/paper/:source/:paperId` | tab 缺数据/缺 abstract → fallback 拉接口；local 用 libRow 转 paper | loading→spinner；error→「论文加载失败」；无 paper→「页签已失效」 | `useFetchPaperDetail` `GET /public/papers/:id` + `useLibraryPaperByUpstream` | PaperDetailPane.tsx:47-132 |
| DETAIL-011 | 论文详情/Header | 作者名(有 authorId 非 local) | 点击 | — | `useOpenAuthorInBrowser` 开学者详情 tab | 无 authorId / local → 纯文本不可点；最多 12 个，超出「…(N 位)」 | store | PaperHeader.tsx:62-72,108-119 |
| DETAIL-012 | 论文详情/Metadata | DOI 链接 | 点击 | 有 DOI | 新标签打开 `https://doi.org/<doi>` | externalIds 无 DOI 不渲染整行 | 来自 paper.externalIds | PaperMetadataBlock.tsx:46-58 |
| DETAIL-013 | 论文详情/Metadata | DOI 复制按钮 | 点击 | 有 DOI | `copyToClipboard` → toast 成功/失败 | 复制失败 → toast.error | 纯前端 clipboard | PaperMetadataBlock.tsx:151-166 |
| DETAIL-014 | 论文详情/Metadata | 「PDF 直链」 | 点击 | 有 openAccessPdf.url | 新标签打开 OA PDF url | 无 url 不渲染 | paper 字段 | PaperMetadataBlock.tsx:98-109 |
| DETAIL-015 | 论文详情/ActionRow | 「查看 PDF」 | 点击 | libRow.pdf_uploaded_at 存在 | `useOpenPdfInBrowser` 开 `/pdf/:libPaperId` tab | 无上传 PDF 不显示该 action | store | PaperActionRow.tsx:49-72 |
| DETAIL-016 | 论文详情/ActionRow | 「OA 原文」 | 点击 | 有 pdfUrl(openAccessPdf 或 isOpenAccess+url) | 新标签打开 pdfUrl | 无则不渲染 | paper 字段 | PaperActionRow.tsx:73-80 |
| DETAIL-017 | 论文详情/ActionRow | 「原始链接」 | 点击 | 有 paper.url | 新标签打开 origin | 无 url 不渲染 | paper 字段 | PaperActionRow.tsx:82-88 |
| DETAIL-018 | 论文详情/ActionRow | 「引用」 | 点击 | — | 平滑滚动到 `#cite-block` | — | 纯前端 scrollIntoView | PaperActionRow.tsx:89-97 |
| DETAIL-019 | 论文详情/ActionRow | 收藏按钮(FavoritePaperButton) | 点击 | source≠local | 切换收藏(组件内 mutation)，showToast | local 来源不显示收藏 | FavoritePaperButton mutation | PaperActionRow.tsx:144-156 |
| DETAIL-020 | 论文详情/ActionRow | 「AI 翻译」按钮 | 点击 | 原文含可翻译文字(needsTranslation) | 拉翻译结果 → onTranslated 回灌 → 切中文标题/摘要；再点 onToggleZh 切换原文/译文 | 不含拉丁字母不显示按钮 | TranslatePaperButton + translate API | PaperActionRow.tsx:46-48,158-173 |
| DETAIL-021 | 论文详情/Abstract | 摘要段 | 渲染 | — | 有 abstract 显示正文 + Keywords；无则占位「该论文未提供摘要」 | 空 abstract → 占位卡 | 纯展示(paper 字段) | PaperAbstract.tsx:8-35 |
| DETAIL-022 | 论文详情/References | 参考文献区 | 渲染/拉取 | 非 local 且 referenceCount>0 | 拉 references → APA prose 列表 | hasReferences=false→空态；loading→spinner；error→红条；空→「数据源暂未提供」 | `useFetchPaperReferences` `GET /public/papers/:id/references?limit=100` | PaperReferences.tsx:17-91 |
| DETAIL-023 | 论文详情/References | 引用条目 | 点击 | 该引用有 paperId | `useOpenPaperInBrowser` 站内打开该论文详情(从前缀推 source) | 仅 url → 外链 _blank；都无 → 纯文本 | store | PaperReferences.tsx:93-158 |
| DETAIL-024 | 论文详情/Footer | 引用格式 tab(bibtex/apa/mla/chicago) | 单击 | — | setFormat 切换当前格式正文 | — | 纯前端 `generateCitation` | PaperFooter.tsx:69-86 |
| DETAIL-025 | 论文详情/Footer | 引用格式 tab | 双击 | — | `setAsDefault` 写 localStorage `scholay.cite-format` + toast | — | localStorage | PaperFooter.tsx:50-53,74 |
| DETAIL-026 | 论文详情/Footer | 「复制」按钮 | 点击 | — | 复制当前格式(stripItalic) → toast 成功/失败 | 复制失败 → toast.error | clipboard | PaperFooter.tsx:44-48,101-109 |
| DETAIL-027 | 论文详情/Footer | 「查看全部 →」(讨论) | 点击 | — | `toast.info('研究论坛正在开发中…')` | 占位，无真实功能 | 纯前端 | PaperFooter.tsx:132-138 |
| DETAIL-028 | 学者详情/Pane | 整 pane | 进入/URL 解析 | 命中 `/author/:source/:authorId` | tab 缺 hIndex/paperCount → detailQ 补；author 定→拉作品(limit50) | loading→spinner；error→「学者信息加载失败」；无 author→「页签已失效」 | `useAuthorDetail` + `useAuthorPapers` `GET /public/author-detail/:id(/papers)` | AuthorDetailPane.tsx:34-117 |
| DETAIL-029 | 学者详情/Hero | 「个人主页」 | 点击 | author.homepage 存在 | 新标签打开 homepage | 无则不渲染 | author 字段 | AuthorHero.tsx:69-79 |
| DETAIL-030 | 学者详情/Hero | 「原始档案」 | 点击 | author.url 存在 | 新标签打开 url | 无则不渲染 | author 字段 | AuthorHero.tsx:80-90 |
| DETAIL-031 | 学者详情/Hero | 4 stats(发表/被引/H/篇均) | 渲染 | — | 显示数值，无值显「—」；篇均=被引/发表四舍五入 | 缺字段→「—」 | 纯前端派生 | AuthorHero.tsx:52-64,96-112 |
| DETAIL-032 | 学者详情/TopicSection | 研究方向 chips | 渲染 | 有作品 | 从 papers.fieldsOfStudy 聚合 top10 | loading 中→「统计中…」；非 loading 且空→整段不渲染 | 前端聚合 `useAuthorPapers` | TopicSection.tsx:16-65 |
| DETAIL-033 | 学者详情/代表作 | FeaturedPaper 卡 | 点击 | 有作品 | `openPaper(p)` 开论文详情 | error→红条；loading→spinner；空→Inbox 空态 | store + `useAuthorPapers`(top5 按引用) | FeaturedPapersCol.tsx:61-110 |
| DETAIL-034 | 学者详情/合作学者 | 合作者跳转(ArrowUpRight) | 点击 | 有 authorId | `useOpenAuthorInBrowser` 开该合作者详情 | 无 authorId 不渲染按钮；loading→spinner；空→Users 空态 | store + 前端聚合(top8) | CollaboratorsCol.tsx:24-32,96-105 |
| DETAIL-035 | 学者详情/YearlyChart | 年度柱状图 | 渲染 | 有 papers | 自渲染近10年柱图，峰值年 amber，下方均值文案 | 无有效年份 → 整段不渲染 | 前端聚合(非图表库) | YearlyChart.tsx:9-104 |
| DETAIL-036 | 期刊详情/Pane | 整 pane | 进入/URL 解析 | 命中 `/journal/:id(/*)` | tab 不在 store → fallback 拉 | loading→spinner；error→「期刊加载失败」；无 journal→「页签已失效」 | `useJournalDetail` `POST /public/journals/get {id,full}` | JournalDetailPane.tsx:37-92 |
| DETAIL-037 | 期刊详情/Hero | 「查询原刊」 | 点击 | journal.issns[0] 存在 | 新标签打开 `portal.issn.org/resource/ISSN/<issn>` | 无 ISSN 不渲染 | journal 字段 | JournalDetailPane.tsx:169-183 |
| DETAIL-038 | 期刊详情/Hero | 「分享」按钮 | 点击 | — | `copyToClipboard(location.href)` → toast 成功/失败 | 非安全上下文走 execCommand 兜底 | clipboard | JournalDetailPane.tsx:184-198 |
| DETAIL-039 | 期刊详情 | 影响因子/分区 4 卡 | 渲染 | — | JCR/中科院/H-index/IF；缺值显「—」 | 缺数据→「—」+「未收录」 | journal 字段 | JournalDetailPane.tsx:208-240 |
| DETAIL-040 | 期刊详情 | 评分/投稿/编委/论坛占位 | 渲染 | — | 显示虚线「即将上线」占位卡 | 永远占位(功能未上线) | 纯前端 | JournalDetailPane.tsx:262-298 |
| DETAIL-041 | PDF 详情/Pane | 整 pane | 进入/URL 解析 | 命中 `/pdf/:libPaperId` | 包装鉴权 stream URL 给 PdfViewer 渲染 | id 非法→「无效的 PDF 链接」；无 token→「需要登录」；BrowserPage Suspense fallback spinner | `GET /api/v1/user/library/papers/:id/pdf`(pdfjs 直取,非 react-query) | PdfBrowserPane.tsx:24-88 |
| DETAIL-042 | 浏览器/tabs 条 | 横向滚动容器 | activeTab 变化(effect) | tabs 非空 | 选中 tab `scrollIntoView` 居可见区(smooth/nearest) | — | 纯前端 | BrowserTabsBar.tsx:66-79 |
