# 03 · 搜索工作区 交互明细

> 列定义见 [README](README.md)。Ground truth = 前端代码实际行为（非设计图）。

## PART 1 — 页面/流程概要

> **现状说明**：任务给定的部分路径与实际不符。实际页面是 `pages/SearchPage.tsx`；侧栏三件套是 `components/SearchSidebar.tsx` + `components/search-sidebar/LibrarySection.tsx`；搜索器列为 `components/SearcherColumn.tsx`；暂存 tab 为 `components/StagingTabs.tsx`；卡片为 `PaperResultCard/{index,DefaultCard,StagedRow,CollapsedRow,MetaLine,tags}`；矩阵为 `components/MatrixColumn.tsx` + `components/matrix/{PaperCell,DimensionCell,ExportMenu,MatrixMoreToolsMenu}`；维度设置为 `components/dimension-settings/{DimensionSettingsDialog,DimensionRow,EditInlineForm,AddDimensionForm,DeleteConfirmDialog,use-save-dimension}`。

**路由**：`/search`（`routes.tsx` lazy 加载 `SearchPage`）。SEO title 随 `?q=` 动态；`?q / ?src / ?tr / ?yf / ?yt / ?ven / ?sub / ?pt / ?oa / ?mc / ?s / ?p / ?ps / ?mode` 全部 URL-backed。无 params 进入时从 `localStorage['scholay.last-search']` 自动恢复上次搜索串（`SearchPage.tsx:80-101`）。

**布局**（`SearchPage.tsx`）：`SidebarLayout` 包裹，内部纯 flex 三栏：
1. **侧栏**（`SearchSidebar`）：`LibrarySection`（我的文献集，登录引导）+ 筛选器（数据源/排序/时间/学科/类型/OA），无「应用」按钮，改即查。
2. **搜索器列**（`SearcherColumn`，px 固定宽度，可拖手柄改，记忆 `localStorage['search.searcher-width']`）：模式切换（传统/智能）+ 搜索框 + 计数 + 结果列（`PaperResultCard`）+ 分页。
3. **右侧工作区**（lazy）：任一暂存区有论文 → `MatrixColumn`（暂存 tabs + 单 `<table>` 矩阵：左 sticky-left 论文列 `PaperCell` + 右维度列 `DimensionCell`）；全空 → `WelcomeBoard`（`MockMatrixPreview` 假表 + `EmptyImportButton` CTA）。

**关键流程**：
- **输入查询并搜索**：输入框提交 → 写 `?q` + 删 `?p` → `useSearchPapers` 重查（蒙层 loading）。
- **暂存论文**：卡片「+ 暂存」→ `useStagingActions.stagePaper` → 匿名走 zustand、登录走 backend mutation；暂存后 auto-collapse 该卡。
- **加入矩阵**：暂存即进入 active 区，`MatrixColumn` 把该区 papers 渲为表行。
- **配置维度**：「设置列」→ `DimensionSettingsDialog`（dnd-kit 拖拽重排 / Switch 显隐 / 编辑名+提示词 / 新增 / 删除或重置）。
- **矩阵分析**：`useMatrixAnalysis` 每篇一个 `useQuery`，经 `paperBatcher` microtask 合并成 ≤10/批 `POST /analysis/papers/batch`。

**实现状态**：
- **真实 react-query 接口**：论文搜索、文献集、收藏 check、暂存区 CRUD（`/user/staging-areas/*`）、维度 CRUD（`/analysis/dimensions*`）、矩阵分析（`POST /analysis/papers/batch`）、导出（纯前端 CSV/MD + 动态 import xlsx）。
- **无 SSE**：矩阵分析是批量 POST + react-query `useQueries`，非流式。
- **mock 静态**：智能模式整块（`SmartSearchPreview`，`pointer-events-none`，标「即将推出」）+ 空态假表（`MockMatrixPreview` MOCK_ROWS/MOCK_DIMENSIONS）。
- **登录门控**：暂存/收藏/维度/矩阵分析均需 token；矩阵在未登录时显「登录后展开 AI 维度分析」。

## PART 2 — 元素级交互表

| 用例ID | 页面/区域 | 元素 | 触发动作 | 前置条件 | 预期结果 | 边界/异常 | 数据/接口依赖 | 状态/备注 |
|---|---|---|---|---|---|---|---|---|
| SRCH-001 | 页面挂载 | 自动恢复上次搜索 | 进入 `/search` 且 URL 无任何 param | localStorage 有 `scholay.last-search` 且长度>1 | `navigate({search: saved}, replace)` 还原上次搜索串 | URL 已带 param→跳过；无 saved→跳过 | localStorage(纯前端) | real；`SearchPage.tsx:80-91` |
| SRCH-002 | 页面挂载 | 搜索状态持久化 | URL params 变化 | params 非空 | 写 `localStorage['scholay.last-search']=?<params>` | params 空→不覆写 | localStorage | real；`SearchPage.tsx:97-101` |
| SRCH-003 | 搜索器 header | 模式切换「传统」 | click | mode=smart | `onModeChange('classic')`，删 `?mode`，渲染搜索框/结果 | — | 纯前端(URL) | real；`SearcherColumn.tsx:174` |
| SRCH-004 | 搜索器 header | 模式切换「智能」 | click | mode=classic | `setMode('smart')`，写 `?mode=smart`(replace)，整块换 `SmartSearchPreview` | 功能未上线，内容纯静态预览 | 纯前端(URL) | mock；按钮带「即将推出」气泡；`SearcherColumn.tsx:185-204` |
| SRCH-005 | 智能模式区 | 整个预览面板 | hover/click 任意元素 | mode=smart | 无反应（`pointer-events-none` + `aria-hidden`），仅顶部「即将推出」提示条 | 全禁用 | mock静态 | mock；`SmartSearchPreview.tsx` |
| SRCH-006 | 搜索器 searchRow | 关键词输入框 | type | mode=classic | 更新本地 `input` state（不触发查询；URL 不变） | — | 纯前端(useState) | real；`SearcherColumn.tsx:219-225` |
| SRCH-007 | 搜索器 searchRow | URL `?q` 变化同步 | 外部 navigate/back 改 `?q` | — | `useEffect` 把 `queryFromUrl` 写回输入框 | 用户敲字时 URL 不变，不反向覆写 | 纯前端 | real；`SearcherColumn.tsx:76-78` |
| SRCH-008 | 搜索器 searchRow | 「搜索」按钮 / Enter 提交 | click submit / 表单 submit | mode=classic | trim→写 `?q`(或删)+ 删 `?p` 回第1页(replace)→ `useSearchPapers` 重查 | 空输入→删 `?q`，结果区回「试试搜点什么」 | `useSearchPapers` `POST /public/papers/search` | real；`SearcherColumn.tsx:146-158` |
| SRCH-009 | 搜索器 结果区 | 检索请求 | query/filter/page 任一变化 | query 非空 | 触发 `useSearchPapers`，`isFetching` 期间显蒙层 spinner「检索中…」 | 空 query→hook disabled 不发请求 | react-query `['search','papers',...]`；staleTime 60s；无 placeholderData | real；`papers.ts:67-126` |
| SRCH-010 | 搜索器 结果区 | 空查询占位 | 渲染 | 无 query | `EmptyState`「试试搜点什么」 | — | 纯前端 | real；`SearcherColumn.tsx:249-255` |
| SRCH-011 | 搜索器 结果区 | 无结果占位 | 渲染 | query 非空 + 非 loading + papers.length=0 | `EmptyState`「没找到相关论文…换关键词或切数据源」 | — | react-query 返回空 | real；`SearcherColumn.tsx:256-262` |
| SRCH-012 | 搜索器 计数行 | 「找到 N 篇」 | 渲染 | query 非空 + 非 loading | 显示 `total.toLocaleString()` 篇 | loading 中故意留空 | react-query data.total | real；`SearcherColumn.tsx:238-242` |
| SRCH-013 | 搜索器 结果区 | PMD 源摘要补全 | 搜索 source=pmd 且有结果 | — | 链式 `enrichPmdAbstracts`(`/public/papers/batch`)补 abstract 合并 | 非 pmd 或空结果→跳过 | react-query queryFn 内链式调用 | real；`papers.ts:116-120` |
| SRCH-014 | 论文卡 标题 | 标题 | click | — | `useOpenPaperInBrowser(paper)` 打开论文详情 | 无标题→显「无标题」 | 纯前端导航 | real；`DefaultCard.tsx:60-68` |
| SRCH-015 | 论文卡 标题行 | 「OA PDF」按钮 | click | `paper.openAccessPdf.url` 存在 | 新窗口打开 OA PDF 直链(`stopPropagation`) | 无 url→不渲染 | 上游透传 url | real；`DefaultCard.tsx:69-81` |
| SRCH-016 | 论文卡 meta | venue | click | journalEnrichment.id 存在 | `useOpenJournalInBrowser` 跳期刊详情(虚线下划线可点) | 无 enrichment→纯文本不可点 | `useJournalEnrichments`(异步) | real；`MetaLine.tsx:76-90` |
| SRCH-017 | 论文卡 meta | 作者名 | click | author.authorId 存在 | `useOpenAuthorInBrowser` 跳学者详情 | 无 id / source=local→纯文本不可点 | 纯前端导航 | real；`MetaLine.tsx:99-110` |
| SRCH-018 | 论文卡 meta | 「+N 作者」 | hover | 作者>2 | Tooltip 列出剩余作者名 | — | 纯前端 | real；`MetaLine.tsx:115-133` |
| SRCH-019 | 论文卡 标签 | 期刊/引用/学科 chips | 渲染 | enrichment 或 citationCount 等存在 | 渲染 JCR/IF/中科院/CCF/预警/引用/学科标签(`pickTags`) | 全空→不渲染标签行 | `useJournalEnrichments` + paper 字段 | real；`tags.tsx:33-94` |
| SRCH-020 | 论文卡 摘要 | 高亮 | 渲染 | 有 query + 非译文态 | `renderHighlight` 用 `<mark>` 包命中词 | 未命中→原文 | 纯前端 | real；`tags.tsx:111-124` |
| SRCH-021 | 论文卡 摘要 | TruncatedText 2 行 | hover→「更多」 | 摘要超 2 行 | 弹 popover 看全文 | — | 纯前端 `TruncatedText` | real；`DefaultCard.tsx:105-112` |
| SRCH-022 | 论文卡 action | 「+ 暂存」按钮 | click | 未暂存 | `onStage`→`stagePaper`，按钮变绿「已暂存」，卡 auto-collapse | 登录:重复→toast「已在该暂存区」；满 100→toast；未登录→走 zustand | `useStagingActions.stagePaper`；登录 `POST /user/staging-areas/{id}/papers` | real；`DefaultCard.tsx:117-137` |
| SRCH-023 | 论文卡 action | 「已暂存」按钮 | click | 已暂存 | `onUnstage`→跨所有区 `removePaper` | — | 登录 `DELETE .../papers/{source}/{id}`；匿名 store | real；`SearchPage.tsx:139-149` |
| SRCH-024 | 论文卡 action | 收藏按钮 | click | — | `FavoritePaperButton` toggle 收藏 | 未登录→弹登录(组件内) | `useFavoritePaper`(shared) | real(委托 shared 组件)；`DefaultCard.tsx:139-144` |
| SRCH-025 | 论文卡 action | 「AI 翻译」按钮 | click | 标题/摘要含可译文本 | `TranslatePaperButton` 翻译，缓存 `zh`，切换显原文/译文 | 无可译文本→不渲染 | `useTranslatePaper`(shared) | real；`DefaultCard.tsx:146-160` |
| SRCH-026 | 论文卡 action | 译文切换 | click(已有缓存) | 已翻译过 | `setShowZh(v=>!v)` 切原文/译文标题+摘要 | — | 纯前端 state | real；`DefaultCard.tsx:48-51,156` |
| SRCH-027 | 论文卡 action | 「折叠」按钮 | hover 显→click | 未折叠 | `onFold`→加 `manuallyCollapsedIds`，卡收成 `CollapsedRow` 灰行 | 平时 opacity-0，hover/focus 才显 | 纯前端 state | real；`DefaultCard.tsx:165-173` |
| SRCH-028 | 论文卡 折叠行(已暂存) | StagedRow ⌄ 展开 | click | 已暂存+已折叠 | `onUnfold`→加 `expandedOverrides`，还原完整卡(仍暂存) | — | 纯前端 state | real；`StagedRow.tsx:29-37` |
| SRCH-029 | 论文卡 折叠行(已暂存) | StagedRow × 取消暂存 | click | 已暂存+已折叠 | `onUnstage` 从暂存区移除，变灰色 CollapsedRow | — | `removePaper` | real；`StagedRow.tsx:38-46` |
| SRCH-030 | 论文卡 折叠行(未暂存) | CollapsedRow 「还原」 | click | 未暂存+已折叠 | `onUnfold`→移出 manuallyCollapsed，展开完整卡 | — | 纯前端 state | real；`CollapsedRow.tsx:22-29` |
| SRCH-031 | 搜索器 分页 | 页码按钮 | click | total>0 | `setPage(p)`→写 `?p`，重查该页 | 当前页 disabled；省略号不可点 | react-query offset | real；`SearcherPagination.tsx:86-99` |
| SRCH-032 | 搜索器 分页 | 上一页/下一页 | click | total>0 | `onChange(page±1)` | page≤1 上一页 disabled；page≥totalPages 下一页 disabled | react-query | real；`SearcherPagination.tsx:68-76,101-109` |
| SRCH-033 | 搜索器 分页 | pageSize 20/50 | click | total>0 | `setPageSize`→写 `?ps`+删 `?p` 回第1页 | 仅 20/50 两档 | `useSearcherUrlState` | real；`SearcherPagination.tsx:48-63` |
| SRCH-034 | 搜索器 分页 | 总页数封顶 | 渲染 | total 很大 | 最多翻 `MAX_RESULTS=1000` 条对应页数 | 超出部分不可翻 | 纯前端 | real；`SearcherColumn.tsx:52,161-162` |
| SRCH-035 | 搜索器列 | 拖手柄调宽 | pointer drag | — | 实时改 `searcherWidth`(380–900px)，松手记忆 localStorage | 越界 clamp | localStorage `search.searcher-width` | real；`SearchPage.tsx:228-254` |
| SRCH-036 | 侧栏 筛选器 | 数据源单选 radio | click | — | `handleSourceChange`→`pruneFiltersForSource` 剪掉新源不支持值，写 URL，重查 | pmd 切换→隐藏 学科/类型/OA/排序组 | 纯前端→`useSearchPapers` | real；`SearchSidebar.tsx:162-208` |
| SRCH-037 | 侧栏 筛选器 | 数据源行 | hover | — | Tooltip 显示源名称+描述(`SOURCE_META`) | — | 纯前端 | real；`SearchSidebar.tsx:193-203` |
| SRCH-038 | 侧栏 筛选器 | 排序 radio | click | 候选>1(仅 olx/pmd) | `patch('sort',v)`→写 `?s`，重查 | stc 仅「相关度」一项→整组不显示 | 纯前端→`useSearchPapers` | real；`SearchSidebar.tsx:212-239` |
| SRCH-039 | 侧栏 筛选器 | 发表时间 radio | click | — | `patch('timeRange',v)`，`resolveYearRange` 解析 yearFrom/To，重查 | custom 用 yf/yt | 纯前端→`useSearchPapers` | real；`SearchSidebar.tsx:242-267` |
| SRCH-040 | 侧栏 筛选器 | 学科 checkbox/radio | click | source 支持(stc/olx) | `toggleInList`/`patch`，olx 强制单选，重查 | pmd→隐藏整组；已选 radio 再点取消 | 纯前端→`useSearchPapers` | real；`SearchSidebar.tsx:273-314` |
| SRCH-041 | 侧栏 筛选器 | 文献类型 checkbox | click | source 支持 | `toggleInList('publicationTypes')`，重查 | stc 去 preprint/thesis；olx 去 conference；pmd 隐藏 | 纯前端→`useSearchPapers` | real；`SearchSidebar.tsx:316-327` |
| SRCH-042 | 侧栏 筛选器 | 「仅 OA」checkbox | toggle | source 支持(stc/olx) | `patch('openAccess')`，重查 | pmd→隐藏 | 纯前端→`useSearchPapers` | real；`SearchSidebar.tsx:329-348` |
| SRCH-043 | 侧栏 筛选器 | 活跃 chip | click | 有活跃筛选 | `c.remove` 移除该筛选(auto-animate) | 无筛选→不渲染 | 纯前端 `buildFilterChips` | real；`SearchSidebar.tsx:143-159` |
| SRCH-044 | 侧栏 筛选器 | 「清空」按钮 | click | 有 chip | reset 时间/venues/subjects/types/oa/minCitations | 保留 source/sort | 纯前端 | real；`SearchSidebar.tsx:104-114,131-139` |
| SRCH-045 | 侧栏 文献集 | 「登录/注册」按钮 | click | 未登录 | `openAuthDialog('login')` | 未登录显引导卡 | `useAuthDialog` | real；`LibrarySection.tsx:34-43` |
| SRCH-046 | 侧栏 文献集 | 文件夹列表 | 渲染 | 已登录 | `useLibraryFoldersSummary` 列文件夹+数量 | loading→「加载中…」；空→「去创建」 | react-query `GET /user/library/folders` | real；`LibrarySection.tsx:49-95` |
| SRCH-047 | 侧栏 文献集 | 文件夹项 | click | 已登录 | `LeaveToLibraryLink` 跳 `/library?folder=X` | — | 纯前端导航 | real；`LibrarySection.tsx:78-93` |
| SRCH-048 | 侧栏 | 折叠侧栏按钮 | click | — | `useSidebar.toggle` | — | zustand | real；`SearchSidebar.tsx:353` |
| SRCH-049 | 工作区/空态 | WelcomeBoard 假表 | 渲染 | 所有暂存区 papers=0 | `MockMatrixPreview`(opacity-20，不可交互)+ CTA | 任一区有 paper→换 MatrixColumn | mock静态 MOCK_ROWS | mock；`WelcomeBoard.tsx`，`EmptyMatrixPreview.tsx:102-184` |
| SRCH-050 | 工作区/空态 | 「从搜索器一键导入」 | click | — | 未登录:存 pending action + 弹登录 + toast；已登录有 papers:`bulkStagePapers` + 汇总 toast | 无 papers→toast「先搜索」；busy 禁用 | `useStagingActions.bulkStagePapers` + `useSearchVisiblePapers` | real；`EmptyMatrixPreview.tsx:256-313` |
| SRCH-051 | 暂存 tabs | tab 项 | click | — | `setActive(id)` 切区；旧 active 若空则后台删除 | — | `useStagingActions.setActive`；登录后台 `DELETE`空区 | real；`StagingTabs.tsx:75-82` |
| SRCH-052 | 暂存 tabs | 「+」新建区 | click | areas<5 | `createArea()` 新建并激活 | areas=5→按钮隐藏；登录超限→toast「最多5个」 | 登录 `POST /user/staging-areas` | real；`StagingTabs.tsx:42-52` |
| SRCH-053 | 矩阵 header | 「设置列」按钮 | click | 已登录 | 打开 `DimensionSettingsDialog` | 未登录→disabled，title「登录后可设置」 | 纯前端 state | real；`MatrixColumn.tsx:135-144` |
| SRCH-054 | 矩阵 header | 「导出 ▾」 | hover/click | papers>0 且 dimensions>0 | 展开下拉(Excel/CSV/Markdown)；hover 120ms 开/220ms 关 | 空 papers 或 dim→disabled，title 提示 | 纯前端导出 | real；`ExportMenu.tsx` |
| SRCH-055 | 矩阵 导出菜单 | 导出 CSV | select | — | `buildMatrixRows`+`exportCsv`(UTF-8 BOM)下载 .csv | 失败→toast「导出失败」 | 纯前端 `export.ts` | real；`ExportMenu.tsx:103-118` |
| SRCH-056 | 矩阵 导出菜单 | 导出 Markdown | select | — | `exportMarkdown` 下载 .md(管道/换行转义) | 同上 | 纯前端 | real；`export.ts:122-140` |
| SRCH-057 | 矩阵 导出菜单 | 导出 Excel | select | — | 动态 import `xlsx`，生成 .xlsx(列宽+bold 表头)下载 | 加载 spinner；失败→toast | 纯前端 `import('xlsx')` | real；`export.ts:146-182` |
| SRCH-058 | 矩阵 header | 「更多 ▾」(<lg) | hover | 窄屏 | HoverCard 折叠 设置列+3 导出 | 窄屏才显；disabled 同上 | 纯前端 | real；`MatrixMoreToolsMenu.tsx` |
| SRCH-059 | 矩阵 表格 | 维度表头 | 渲染 | 已登录+dimensions>0 | 渲染各维度名(sticky-top)，title=dimensionKey | 未登录→单列「维度」+登录门；无 dim→「维度未配置」/「加载维度配置…」 | `useAnalysisDimensions` `GET /analysis/dimensions` | real；`MatrixColumn.tsx:196-221` |
| SRCH-060 | 矩阵 单元格 | DimensionCell | 渲染 | 已登录 | 显示 AI 分析:prose+内联 `[[tag]]` chips；命中缓存显 DB 图标 | loading→skeleton；失败→灰斜体+错误；「未提及」→减号+tooltip；无摘要→「无摘要,无法分析」 | `useMatrixAnalysis`→`POST /analysis/papers/batch`(批量,非SSE) | real；`DimensionCell.tsx` |
| SRCH-061 | 矩阵 单元格 | 长内容「更多」 | hover row→click | prose>6 行 | 弹 popover 看全文 | — | 纯前端 `TruncatedText` | real；`DimensionCell.tsx:127-139` |
| SRCH-062 | 矩阵 单元格 | 未登录门 | click | 未登录 | 「登录后展开 AI 维度分析」→`openAuthDialog('login')` | — | `useAuthDialog` | real；`MatrixColumn.tsx:265-275` |
| SRCH-063 | 矩阵 论文列 | PaperCell 移除 × | hover row 显→click | — | `onRemove`→`removePaper(activeArea.id, id)` | hover 才显 | `useStagingActions.removePaper` | real；`PaperCell.tsx:49-60` |
| SRCH-064 | 矩阵 论文列 | PaperCell 收藏 | click | — | `FavoritePaperButton` toggle | 已收藏常驻红；未收藏 hover 显 | `useStagedFavorites`(按 source 分组 check) | real；`PaperCell.tsx:41-48` |
| SRCH-065 | 矩阵 论文列 | PaperCell 摘要「更多」 | hover→click | 摘要超 4 行 | popover 全文 | 无摘要→「无摘要」 | 纯前端 | real；`PaperCell.tsx:70-82` |
| SRCH-066 | 矩阵 footer | 「× 清空」 | click | papers>0 | `clearArea(activeArea.id)` 清空当前区(保留区) | papers=0→不显示 | 登录 `DELETE /user/staging-areas/{id}/papers`；匿名 store | real；`MatrixColumn.tsx:84-88,325-333` |
| SRCH-067 | 矩阵 footer | 「登录后启用矩阵分析」 | click | 未登录 | `openAuthDialog('login')` | — | `useAuthDialog` | real；`MatrixColumn.tsx:339-346` |
| SRCH-068 | 维度设置 dialog | 整体 | 打开 | 已登录 | `useDimensionSettings` 列全部维度(含隐藏)，计数「共N·M可见」 | loading→spinner；error→提示；空→「点上方新建」 | react-query `GET /analysis/dimensions/settings` | real；`DimensionSettingsDialog.tsx:48-141` |
| SRCH-069 | 维度设置 行 | 拖拽手柄 | drag(≥5px) | — | dnd-kit 重排→`useReorderDimensions`(乐观更新，不重拉矩阵) | <5px 当点击；失败 toast | `PATCH /analysis/dimensions/reorder` | real；`DimensionRow.tsx:78-90` |
| SRCH-070 | 维度设置 行 | 可见性 Switch | toggle | — | `useToggleDimensionVisibility`(乐观，矩阵列即增/删，不重拉) | pending 禁用；失败回滚 | `PATCH /analysis/dimensions/visibility` | real；`DimensionRow.tsx:59-99` |
| SRCH-071 | 维度设置 行 | 编辑(铅笔) | click | 非隐藏 | 行换 `EditInlineForm`(prompt 模式，改名+提示词) | 隐藏态→disabled | 纯前端切态 | real；`DimensionRow.tsx:124-138` |
| SRCH-072 | 维度设置 行 | 删除/重置 | click | 非隐藏 | 弹 `DeleteConfirmDialog`；系统维度走重置、自定义走删除 | 隐藏→disabled；系统未改→不可删 | `DeleteConfirmDialog` | real；`DimensionRow.tsx:141-167` |
| SRCH-073 | 维度 编辑表单 | 名称输入 | type / Enter / Esc | 编辑态 | Enter→保存,Esc→取消(name 模式) | 名称空→toast；未改→直接关 | `useSaveDimension` | real；`EditInlineForm.tsx:64-75` |
| SRCH-074 | 维度 编辑表单 | 提示词 textarea + 保存 | type→click 保存 | prompt 模式 | `save({name,description})`→系统维度 upsert / 自定义 PUT；失效矩阵缓存 | 名称/提示词空→toast；busy 禁用 | `POST` 或 `PUT /analysis/dimensions[/:id]` | real；`EditInlineForm.tsx:96-124` |
| SRCH-075 | 维度设置 | 「添加新维度」按钮 | click | 未达上限 | 展开 `AddDimensionForm` | atMax→disabled，title「已达上限 N 个」 | `data.maxDimensions`(默认15) | real；`DimensionSettingsDialog.tsx:187-213` |
| SRCH-076 | 维度 新增表单 | 名称+提示词+提交 | type→click 添加 | — | `save` upsert(临时 key `custom_<ts>`)，toast「已添加」 | 名称或提示词空→toast；busy 禁用 | `POST /analysis/dimensions` | real；`AddDimensionForm.tsx:32-81` |
| SRCH-077 | 维度 新增/编辑 | 取消按钮 | click | — | 关闭表单,回到行/按钮态 | — | 纯前端 state | real；`AddDimensionForm.tsx:66-70` |
| SRCH-078 | 维度 删除确认 | 确认删除/重置 | click | target 存在 | 系统→`useResetDimension`；自定义→`useDeleteUserDimension`，toast | busy 禁用；失败 toast | `DELETE /analysis/dimensions/reset/{key}` 或 `/{id}` | real；`DeleteConfirmDialog.tsx:30-43` |
| SRCH-079 | 维度 删除确认 | 取消 | click | — | `onClose` 关闭 | — | 纯前端 | real；`DeleteConfirmDialog.tsx:62-68` |
| SRCH-080 | 矩阵分析 | 增量加载 | 暂存新增 1 篇 | 已登录 | 仅该论文一个 `useQuery` 触发，其余读缓存(单行 skeleton) | 无摘要→直接占位「无摘要,无法分析」；最多分析 MAX_PAPERS=100 篇 | `useQueries` + `paperBatcher`(microtask 合并 ≤10/批) | real；`matrix.ts:43-98` |

**附注**：
- 暂存区上限：5 个区(`MAX_AREAS`)，每区 100 篇(`MAX_PAPERS_PER_AREA`)；`bulkStagePapers` 返回 `{added, skipped, capped}` 用于汇总 toast。
- 数据源/排序/学科/类型按 source 联动剪枝(`types.ts` `pruneFiltersForSource`)，pmd 仅支持 query/time/venue/sort。
- 匿名 vs 登录双轨：匿名走 zustand+localStorage，登录走 backend mutation，登录后由全局 `useStagingSync`（挂在 AppShell）迁移。
- 矩阵分析全程批量 HTTP POST，**无 SSE/流式**。
