# 04 · 期刊（列表 + 详情） 交互明细

> 列定义见 [README](README.md)。Ground truth = 前端代码实际行为（非设计图）。

## PART 1 — 页面/流程概要

### 路由
- 列表路由：`/journals/search` → `JournalSearchPage`（`features/journals/routes.tsx`，菜单 `app/menus.ts:68` 指向它，`match: startsWith('/journals')`）。
- 详情路由：**`/journal/:id`（单数 journal，非 journals）** → `JournalDetailPane`（位于 `features/browser/`，非 journals feature；通过 `useMatch('/journal/:id/*')` 匹配）。详情以 **browser tab** 形态承载：点列表卡片 `useOpenJournalInBrowser` → 写 browser-tabs store + navigate `/journal/:id`。注意 HomePage.tsx:26 / Pane 注释里写的「/journals/:id」是笔误，真实路径是 `/journal/:id`。
- 任务列举的文件名（`JournalsPage`/`JournalDetailPage`/`JournalResultCard`/`JournalFiltersBar`/`JournalActiveFilters`/`detail/*`/feature 内 hooks 目录多文件）**在真实代码中不存在**。下表按真实文件编写。

### 真实文件
- 页面：`features/journals/pages/JournalSearchPage.tsx`（壳：SidebarLayout + SEO + 注册折叠 rail）
- 组件：`features/journals/components/JournalSidebar.tsx`（左栏筛选）、`JournalSearchResults.tsx`（右栏 Hero+结果+分页，含内联 `JournalCard`）、`JournalExploreOverview.tsx`（统计概览，**当前未被任何页面挂载**，见备注）
- 详情：`features/browser/components/JournalDetailPane.tsx`（tab 内详情面板）
- hook：`features/journals/hooks/useJournalUrlFilters.ts`（侧栏 5 维筛选 ↔ URL）、`shared/hooks/useOpenInBrowser.ts:useOpenJournalInBrowser`（点卡片开 tab）
- api（**真实 HTTP**，非 mock）：`features/journals/api/journals.ts`（`useJournalStats`/`useJournalList`/`useJournalSearch`，POST `/public/journals/*`）、`shared/api/journals.ts`（`useJournalDetail`，POST `/public/journals/detail`）、`features/journals/api/library.ts`（`useLibraryFoldersForJournals`，GET `/user/library/folders`）
- 类型：`features/journals/types.ts`（`JournalFilters` + 筛选选项常量）、`shared/api/types`（`Journal`/`JournalSearchResult`/`JournalStats`）

### 区域（`/journals/search`，SidebarLayout 两栏）
- **左 sidebar `JournalSidebar`**：① 文献集快捷段（登录态：文件夹列表；未登录：登录 CTA）；② 5 组单选筛选（中科院分区 / JCR 分区 / 影响因子阈值 / CCF 推荐 / 出版商），每组首项「不限」=清空该维度；有筛选时显示「清空」。
- **右 main `JournalSearchResults`**：Hero（标题 + 右侧 3 KPI + 搜索表单）→ 结果头（标题随状态变 + 3 个排序切换按钮）→ 错误/空/卡片网格 → 分页（Prev/Next，cursor/hasMore 形态）。

### 核心流程
进入即查（`useJournalSearch` 始终 enabled，无关键词也返回默认列表，sort 默认按影响因子降序）→ 改搜索框/侧栏筛选/排序/翻页 → 写 URL query → react-query 重查 → 点卡片 `useOpenJournalInBrowser` 在 browser tab 打开 `JournalDetailPane`（payload 直接带 journal 数据，命中即不再 fetch）。

### 实现状态
**真实后端对接，全部经 `shared/lib/http`（axios）POST/GET，无 mock。** 后端是上游 `/v1/jnl/*` 包装，响应在前端 `normalizeSearchPayload`/`normalizeDetail`/`normalizeJournal` 规范化。注意点：
- 上游**不返 total**，分页用 `has_more`（cursor 形态），`total` 仅为 UI 估算文案。
- `JournalExploreOverview` 存在且数据真实（`useJournalStats`），但 `JournalSearchResults` 未渲染它，KPI 统计被内联进 Hero —— **该组件目前是 dead code（无挂载点）**。
- 详情面板末尾「外链」是 Google 搜索该刊名（非站内）。

## PART 2 — 元素级交互表

| 用例ID | 页面/区域 | 元素 | 触发动作 | 前置条件 | 预期结果 | 边界/异常 | 数据/接口依赖 | 状态/备注 |
|---|---|---|---|---|---|---|---|---|
| JRNL-001 | 列表/Hero | 搜索输入框 `input[type=search]` | 输入文本 (onChange) | — | 仅更新本地受控 state `input`，**不立即查询**；URL keyword 变化时 effect 反向同步回 input | — | 纯前端 useState | 真实；JournalSearchResults.tsx:65-66,166-172 |
| JRNL-002 | 列表/Hero | 搜索框「清空」按钮（X） | 点击 | `input` 非空（按钮才渲染） | `setInput('')` 清空输入框文本 | 不触发查询、不改 URL（需再提交） | 纯前端 | 真实；JournalSearchResults.tsx:173-182 |
| JRNL-003 | 列表/Hero | 搜索表单「搜索期刊」按钮 / 回车 | submit | — | `submitSearch`：trim 后非空 set `q`、空则 delete `q`；删除 `page`（回首页）；写 URL → `useJournalSearch` 重查（keyword 进 body.keyword） | 仅 trim 空白；提交空=清关键词回默认列表 | `useJournalSearch`（真实 POST /public/journals/search） | 真实；JournalSearchResults.tsx:93-101,163 / journals.ts:171 |
| JRNL-004 | 列表/结果头 | 排序按钮 ×3「相关度/影响因子/最新」 | 点击 (setSort) | — | `relevance`→无 sortBy（后端默认）；`if`→sortBy=jcr_impact_factor_num desc；`recent`→sortBy=openalex_works_count desc；写 `sort` 到 URL（默认值 delete）+ 删 `page`；激活按钮高亮 | 默认 sortKey：有 keyword 时 `relevance`，无 keyword 时 `if` | `useJournalSearch`（真实） | 真实；SORT_TO_BACKEND；JournalSearchResults.tsx:49-53,103-109,216-235 |
| JRNL-005 | 列表/分页 | 「上一页」按钮 | 点击 (goPage) | `page>1`（否则 disabled） | `page=1` 时 delete `page`，否则 set `page`；URL 变触发重查上一页 | 第 1 页禁用；`isFetching` 时整组禁用 | `useJournalSearch`（真实） | 真实；JournalSearchResults.tsx:111-117,272-279 / PaginationPrevNext.tsx |
| JRNL-006 | 列表/分页 | 「下一页」按钮 | 点击 (goPage) | `has_more` 为真（否则 disabled） | `page+1` 写 URL，重查下一页 | 上游无 total，靠 `has_more` 判断是否还有下一页；`isFetching` 禁用 | `useJournalSearch`（真实，has_more） | 真实；normalizeSearchPayload has_more / PaginationPrevNext.tsx |
| JRNL-007 | 列表/结果区 | 检索中状态（结果头标题） | 自动（isLoading\|\|isFetching） | 查询进行中 | 结果头标题显示「检索中…」+ spinner | keepPreviousData 未启用，翻页/改筛选时 isFetching 触发该态 | `useJournalSearch.isLoading/isFetching` | 真实；JournalSearchResults.tsx:199-203 |
| JRNL-008 | 列表/结果区 | 结果头标题文本 | 自动 | 非检索中 | 有 keyword→「关键词 "x" 的搜索结果」；无→「期刊列表」；副行显示当前排序名，无 keyword 且无筛选时追加「· 默认推荐高质量期刊」 | — | `useJournalSearch` data | 真实；JournalSearchResults.tsx:204-213 |
| JRNL-009 | 列表/结果区 | 错误提示条 | 自动（error） | `searchQ.error` 存在 | 显示「搜索期刊出错了,请稍后重试」红色提示条 | 无重试按钮（改筛选/翻页可隐式重查） | `useJournalSearch.error` → toApiError | 真实；JournalSearchResults.tsx:240-245 |
| JRNL-010 | 列表/结果区 | 空结果态 `EmptyState` | 自动 | 非 loading、无 error 且 `items.length===0` | 渲染 EmptyState：有 keyword→「没有匹配 "x" 的期刊…」；否则→「当前筛选条件下没有期刊…」 | — | `useJournalSearch` data.items | 真实；JournalSearchResults.tsx:247-257 |
| JRNL-011 | 列表/Hero | 右侧 3 个 KPI（收录期刊/数据源覆盖/同步状态） | 自动渲染 | — | 收录期刊=stats.totalJournals；数据源覆盖=sourceCoverage 求和；同步状态固定「实时」；stats 未就绪显示「—」 | stats 加载/失败时回退「—」 | `useJournalStats`（真实 POST /public/journals/stats，staleTime 10min） | 真实；JournalSearchResults.tsx:126-130,148-158 |
| JRNL-012 | 列表/结果卡片 | `JournalCard`（整卡 `button`） | 点击 (onOpen) | 有结果 | `useOpenJournalInBrowser(journal)`：调 `exposeJournalDetail`（SEO 曝光 beacon）+ `openTab({type:'journal-detail', payload:{journal}})` 在 browser 工作区开详情 tab | 当前在独立 `/journals/search` 页时是否真切到 workspace 取决于 browser-tabs store 行为 | `useOpenJournalInBrowser` + browser-tabs store | 真实；JournalSearchResults.tsx:262-266 / useOpenInBrowser.ts:17-32 |
| JRNL-013 | 列表/结果卡片 | 卡片内容（封面/刊名/出版社·国家·OA/预警徽章/3 KPI 格/类型·数据源标/查看详情标签） | 自动渲染 | 有结果 | 显示 `JournalCover`、canonical_name、publisher(缺省「出版社未知」)+country+「OA」；`gjqk_warning` 真→「⚠ 预警」；KPI 三格=影响因子(+JCR 分区)/中科院分区/CCF；type 标签、source_count 标签按数据条件渲染 | 非交互；缺值显示「—」；预警仅近 2 年判定有效 | `Journal`（真实，normalizeJournal） | 真实；JournalSearchResults.tsx:303-380 / journals.ts:281-347 |
| JRNL-014 | 列表/结果区 | 搜索结果曝光（SEO seed） | 自动（items 变化 effect） | `items.length>0` | `exposeJournals(items)` 用 sendBeacon best-effort 上报 tier=2 SEO seed，不阻塞 UI | react-query 缓存命中时 items 同引用，effect 不重复触发 | `exposeJournals`（真实 beacon） | 真实；JournalSearchResults.tsx:89-91 |
| JRNL-015 | 列表/sidebar | 学科/分区单选 radio（5 组 × FilterRadioGroup） | 选择 (onSelect) | — | `patch(field, value)` → `onFiltersChange` → `setFilters`（useJournalUrlFilters.encode 写对应短 key：fqb/jcr/if/ccf/pub）；删 `page`；queryKey 变 → `useJournalSearch` 重查 | 选每组首项「不限」=传 undefined=delete 该 key | `useJournalUrlFilters` + `useJournalSearch`（真实） | 真实；JournalSidebar.tsx:48-51,95-133 / useJournalUrlFilters.ts:58-91 |
| JRNL-016 | 列表/sidebar | 「清空」按钮（筛选段 action） | 点击 (clearAll) | `hasActive`（任一筛选非空时才渲染） | 5 个筛选字段全置 undefined → 删除 fqb/jcr/if/ccf/pub（保留 `q`、`sort`、`page` 由 setFilters 删 page） | 不清关键词/排序；无筛选时按钮隐藏 | `useJournalUrlFilters` | 真实；JournalSidebar.tsx:53-67,84-93 |
| JRNL-017 | 列表/sidebar | 文献集快捷段：未登录「登录 / 注册」按钮 | 点击 | 未登录（`!user`） | `openDialog('login')` 打开登录弹窗 | 未登录时该段为登录 CTA 卡片 | `useAuthStore` + `useAuthDialog` | 真实；JournalSidebar.tsx:147-171 |
| JRNL-018 | 列表/sidebar | 文献集快捷段：文件夹项 `LeaveToLibraryLink` | 点击 | 已登录且有文件夹 | 跳转 `/library?folder={id}`（离开当前 SPA 区到文献集） | 加载中显「加载中…」；空显「还没有文件夹 · 去创建」 | `useLibraryFoldersForJournals`（真实 GET /user/library/folders，enabled=有 token） | 真实；JournalSidebar.tsx:173-218 / library.ts |
| JRNL-019 | 列表/sidebar | 「管理」链接 | 点击 | 已登录 | 跳 `/library` | — | 纯前端路由 | 真实；JournalSidebar.tsx:180-185 |
| JRNL-020 | 列表/sidebar | 折叠态顶栏 rail chip（我的文献集 / 筛选器） | 点击 | sidebar 折叠 | 滚动/聚焦到对应 section（`sectionId`）| 依赖 sidebar.store 的 rail 注册 | `useRegisterSidebarRail` | 真实；JournalSearchPage.tsx:27-40 |
| JRNL-021 | 详情/Pane | `JournalDetailPane` 渲染 | 自动（tab 打开后） | tab.payload 带 journal 或 journalId | payload 有完整 journal→直接用；仅 journalId→`useJournalDetail(id)` fetch fallback；渲染封面/刊名/出版社·国家/ISSN/4 指标卡/详情字段/Google 外链 | needsFetch 且 loading→「加载期刊详情中…」；无 journal→「未找到期刊信息」 | `useJournalDetail`（真实 POST /public/journals/detail，enabled=id!=null） | 真实；JournalDetailPane.tsx:31-54 / shared/api/journals.ts:13-30 |
| JRNL-022 | 详情/Pane | 4 指标卡（影响因子/中科院分区/CCF/h-index） | 自动渲染 | journal 存在 | 显示 jcr_impact_factor.toFixed(1)(+JCR 分区 sub)/fqb_quartile 区/ccf_rank/openalex_h_index；缺值「—」 | 非交互 | `Journal`（真实，normalizeDetail） | 真实；JournalDetailPane.tsx 指标卡区 |
| JRNL-023 | 详情/Pane | 详情字段行（类型/开放获取/全部 ISSN/数据源） | 自动渲染 | 对应字段非空 | 按 type / is_oa / issns / sources 条件渲染对应行 | 字段缺失则该行不渲染 | `Journal`（真实） | 真实；JournalDetailPane.tsx 详情字段区 |
| JRNL-024 | 详情/Pane | 「在 Google 检索此期刊」外链 `a` | 点击 | journal 存在 | 新标签打开 `https://www.google.com/search?q={刊名}`（target=_blank, rel=noopener） | 站外链接，非详情数据接口 | 纯前端 | 真实；JournalDetailPane.tsx Google 外链 |
| JRNL-025 | （dead code）概览 | `JournalExploreOverview`（KPI + JCR/中科院分区分布 + 数据源覆盖） | 自动渲染 | — | 设计上无搜索时展示期刊大盘统计；加载时显 4 个骨架占位 | **当前无任何页面挂载该组件**（JournalSearchResults 未引用它，KPI 已内联进 Hero） | `useJournalStats`（真实） | dead code；JournalExploreOverview.tsx:17-122 |
| JRNL-026 | （未实现）详情路由 | `/journals/:journalId` | 直接访问 URL | — | 期望：以路由形式打开 `JournalDetailPane` | **路由未注册**：journals/routes.tsx 仅有 `journals/search`；HomePage/Pane 注释标「占位/复用」但无 RouteObject | — | 缺失/TODO；routes.tsx:3-11 |
