# 07 · Prism + 浏览 交互明细

> 列定义见 [README](README.md)。Ground truth = 前端代码实际行为（非设计图）。

## PART 1 — 页面/流程概要

### Prism（PREFIX=PRSM）— 智能写作 / LaTeX 编辑器

- **路由**：`prism/*` → 懒加载 `PrismPage`（`features/prism/routes.tsx:3-9`）。`/prism` 下任意子路径都命中同一个页面（通配 `*`），不解析子路径参数。
- **实现状态：未开发（建设中占位页）。** `PrismPage` 只渲染 `ComingSoonView`（`features/prism/pages/PrismPage.tsx:4-12`），文案"智能写作"+ 说明 +「返回首页」CTA，右栏挂一个**纯静态、不可交互**的样式预览 `PrismPreview`。
- **CodeMirror 编辑器：不存在。** `PrismPreview` 的"编辑器"是写死的 `<pre>` 纯文本 LaTeX 片段 + 假行号（`Array.from({length:18})`），无 `@codemirror/*`，不可输入（`features/prism/components/PrismPreview.tsx:85-111`）。
- **编译 / 预览：mock 静态。** "编译"按钮 `tabIndex={-1}` 无 `onClick`（`PrismPreview.tsx:16-23`）；预览栏是写死的 HTML 段落"3 Method…"，无实时渲染、无分页逻辑（页码"第 4 页 / 共 12 页"是死字符串，`PrismPreview.tsx:115-137`）。
- **整个 preview 不可点击**：`ComingSoonView` 用 `opacity-60 pointer-events-none select-none` + `aria-hidden` 包裹 preview（`shared/components/ComingSoonView.tsx:52-57`），所以 PrismPreview 内所有元素均无交互。
- **占位页确有侧栏壳**：`ComingSoonView` 走 `SidebarLayout` + 内置 `ComingSoonSidebar`（含全局导航 SidebarHeaderNav、amber「即将推出」提示块、SidebarAuthFooter、收起按钮），这些是**真实可交互**的（`ComingSoonView.tsx:38,69-92`）。注意这里用的不是 `PrismSidebar`。
- **PrismSidebar：已写但当前页面未挂载。** `features/prism/components/PrismSidebar.tsx` 是一个完整的侧栏组件（目录 + LaTeX 源文件树），有本地 `useState` 交互，但 `PrismPage` 走 `ComingSoonView` 没有用它（无侧栏壳引用）。其交互按"代码存在即记录"列入下表并注明"组件存在但未挂载"。其数据（TOC / FILES）全部 mock 静态硬编码，点击只切本地高亮，无路由/接口。
- **核心流程（实际可走）**：进入 `/prism` → 看到建设中占位 + 静态预览 → 点「返回首页」回 `/`。

### 浏览（PREFIX=BRWS）— 论文 / 期刊 / 学者 / PDF 详情承载页

- **路由**（canonical，无 `/browser` 前缀，runtime + SEO 共用，`features/browser/routes.tsx`）：
  - `paper/:source/:paperId` → 论文详情
  - `journal/:id`、`journal/:id/:slug`（slug 仅 SEO，组件只读 `id`）→ 期刊详情
  - `author/:source/:authorId` → 学者详情
  - `pdf/:libPaperId` → 用户上传 PDF 预览（独立 lazy chunk，含 react-pdf/pdfjs ~800KB）
  - 全部懒加载同一个 `BrowserPage`。
- **实现状态：真实路由 + 真实标签状态。** `BrowserPage` 用 `useMatch` 比对当前 URL，四选一渲染 `PaperDetailPane` / `JournalDetailPane` / `AuthorDetailPane` / `PdfBrowserPane`（`features/browser/pages/BrowserPage.tsx:34-65`）；无匹配渲染 `null`（空白）。PDF pane 用 `Suspense` + spinner fallback。
- **浏览器标签：真实。** `BrowserTabsBar`（顶部 Chrome 风格 tabs 条）状态在 zustand `browser-tabs.store`，**持久化到 localStorage**（`persist` key=`scholay.browser-tabs-v1`，刷新后标签还在；上限 `MAX_TABS=30`，超限静默挤掉最早的非 active tab）。支持四种 tab kind：paper / journal / author / pdf（discriminated union）。active tab 不由 store 的 `activeTabId` 直接驱动渲染，而是 `BrowserTabsBar` 用 `useMatch` 四路由比对当前 URL 算出 `activeTabId` 再 `tabs.find`（URL = 事实源，`BrowserTabsBar.tsx:36-60`）。`tabs.length===0` 时整条 tabs bar 返回 `null`（`BrowserTabsBar.tsx:81`）。
- **地址栏：不存在。** 没有可输入的 URL 地址栏；"导航"由 tabs + 返回按钮 + 「+」QuickOpen 搜索弹层组成。「+」按钮实际是 `QuickOpenPaperDialog`（基于 **Radix Popover**，非 cmdk）的 trigger，弹出后搜论文 → 选中打开论文详情 tab。
- **核心流程**：从外部（搜索/文献集，经 `useOpenXxxInBrowser` 工厂 hook 灌 store + navigate）或 deep link 进入某详情 URL → tabs 条出现对应页签 → 可多开/切换/关闭（X 或鼠标中键）页签、点返回（回该 tab 的 `returnTo`）、点「+」搜论文开新 tab。

---

## PART 2 — 元素级交互表

### 2.1 Prism（PRSM）

| 用例ID | 页面/区域 | 元素 | 触发动作 | 前置条件 | 预期结果 | 边界/异常 | 数据/接口依赖 | 状态/备注 |
|---|---|---|---|---|---|---|---|---|
| PRSM-001 | /prism · 占位页 · ComingSoonSidebar | 收起按钮（SidebarCollapseButton）| 点击 | 在 /prism | 调 `useSidebar().toggle` 切换侧栏收起/展开 | — | zustand sidebar.store | 真实可交互（实际挂载的侧栏）。`ComingSoonView.tsx:70,89` |
| PRSM-002 | /prism · 占位页 · 顶部 banner | amber「智能写作即将推出」横幅（Sparkles + description）| 查看 | 在 /prism | 始终显示功能未上线提示 + 说明文案，纯展示无交互 | — | 纯前端（PrismPage 传入 title/description）| 真实展示。`ComingSoonView.tsx:40-48` |
| PRSM-003 | /prism · 右栏样式预览 | header「编译」按钮（Play 图标）| 点击 | 在 /prism | 无任何反应（no-op）：无 onClick 且 `tabIndex={-1}`，整 preview 被 `pointer-events-none` 屏蔽 | 预览区整体不可点击/不可选中 | mock静态 | stub/no-op。`PrismPreview.tsx:16-23`；屏蔽见 `ComingSoonView.tsx:52-57` |
| PRSM-003 | /prism · 右栏预览 · 文件树 | 文件项 main.tex / introduction.tex / method.tex / experiments.tex / references.bib | 点击 | 在 /prism | 无反应（no-op）：纯展示 `<div>`，main.tex 死高亮 active，无 onClick，且整区 pointer-events-none | — | mock静态（写死数组）| stub。`PrismPreview.tsx:32-50` |
| PRSM-004 | /prism · 右栏预览 · 目录 | 目录项 1 Introduction…5 Discussion（含 ✓ 完成标记 / 编辑中红条）| 点击 | 在 /prism | 无反应（no-op），纯展示 `<div>` | — | mock静态 | stub。`PrismPreview.tsx:55-78` |
| PRSM-005 | /prism · 右栏预览 · 预览面板 | 渲染结果区 + "第 4 页 / 共 12 页" | 任意 | 在 /prism | 始终显示写死的"3 Method"段落与死页码，无真实编译/分页/滚动 | — | mock静态 | stub。`PrismPreview.tsx:115-137` |
| PRSM-006 | PrismSidebar · 目录段 | 目录条目（TOC：Abstract…References，8 项）| 点击 | 组件被挂载时 | `setActiveToc(id)`：仅切换本地高亮（编辑中项用 danger 红，其他 primary）| — | 纯前端 useState；TOC mock静态 | 组件存在但 PrismPage 当前未挂载它。`PrismSidebar.tsx:53,91-116` |
| PRSM-007 | PrismSidebar · LaTeX 源文件段 | 文件条目（FILES：main.tex…references.bib，5 项）| 点击 | 组件被挂载时 | `setActiveFile(id)`：仅切本地 primary 高亮 | — | 纯前端 useState；FILES mock静态 | 同上未挂载。`PrismSidebar.tsx:54,134-143` |
| PRSM-008 | PrismSidebar · header | 「新建」按钮（Plus，extraEnd 与 SidebarHeaderNav 内）| 点击 | 组件被挂载时 | 无反应（no-op）：button 无 onClick | — | 纯前端 | stub；且组件未挂载。`PrismSidebar.tsx:60-70`、源文件段内 `124-132` 第二个"新建"同样无 onClick |
| PRSM-009 | PrismSidebar · 收起按钮 | SidebarCollapseButton | 点击 | 组件被挂载时 | 调 `toggleSidebar`（`useSidebar` store.toggle）切换侧栏收起 | — | zustand sidebar.store | 真实逻辑，但组件未挂载。`PrismSidebar.tsx:55,148` |
| PRSM-010 | PrismSidebar · 底部 | SidebarAuthFooter（用户/登录条）| 取决于 footer 内部 | 组件被挂载时 | 复用通用 SidebarAuthFooter 行为（登录态/用户菜单）| — | 见 auth 模块 | 组件未挂载。`PrismSidebar.tsx:147` |

### 2.2 浏览（BRWS）

| 用例ID | 页面/区域 | 元素 | 触发动作 | 前置条件 | 预期结果 | 边界/异常 | 数据/接口依赖 | 状态/备注 |
|---|---|---|---|---|---|---|---|---|
| BRWS-001 | 浏览页 · 主区 | 详情 pane（四选一）| 进入某 URL | 命中 paper/journal/author/pdf 路由 | 按 `useMatch` 渲染对应 pane：paper→PaperDetailPane / journal(含 /:slug，`/journal/:id/*`)→JournalDetailPane / author→AuthorDetailPane / pdf→PdfBrowserPane | URL 均不匹配时主区渲染 `null`（空白）| 各 pane 自带 hook/接口（详见各自模块）| 真实路由分发。`BrowserPage.tsx:35-61` |
| BRWS-002 | 浏览页 · 主区 | PDF pane 加载 | 进入 `/pdf/:libPaperId` | 命中 pdf 路由 | `Suspense` 先显示居中 spinner（Loader2 animate-spin），chunk 加载完再渲染 PdfBrowserPane | 加载中=spinner；pdf chunk 独立懒加载，仅命中 /pdf 才下载（~800KB）| 懒加载 `PdfBrowserPane` | 真实。`BrowserPage.tsx:12-16,52-60` |
| BRWS-003 | BrowserTabsBar | 整条 tabs bar | 渲染 | — | `tabs.length===0` 时整组件返回 `null`（不渲染返回按钮/「+」），仅当有 tab 时才显示 | 空 tabs=整条消失 | browser-tabs.store.tabs | 真实。`BrowserTabsBar.tsx:81`（无独立"空态文案"元素）|
| BRWS-004 | BrowserTabsBar · 左侧 | 「返回」按钮（ArrowLeft + "返回"）| 点击 | tabs 非空 | `goReturn()`：回 `activeTab.returnTo`（开此 tab 时记录的来源 URL），缺省或非 `/` 开头时回 `/`（安全校验）| returnTo 不以 `/` 开头→强制回首页 | 纯前端（react-router navigate + store returnTo）| 真实。`BrowserTabsBar.tsx:83-87,117-125` |
| BRWS-005 | BrowserTabsBar · tabs 区 | 标签页 TabPill（标题 + kind 图标 FileText/BookOpen/User）| 点击页签主体 | 该 tab 存在 | `navigate(browserTabUrl(t))` 切到该 tab 对应 URL | active 态由 `activeTabId===t.id` 决定（bg-surface-2 + kind accent 色：paper黑/journal蓝/author绿/pdf红）；切换时 scrollIntoView 居可见区 | browser-tabs.store（持久化）| 真实。`BrowserTabsBar.tsx:133-141,170-233` |
| BRWS-006 | BrowserTabsBar · tabs 区 | TabPill 内「关闭」按钮（X，opacity-70 常显）| 点击（stopPropagation）| 该 tab 存在 | `handleClose`→`closeTab(id)` 从 store 移除；若关的是 active：读 store 新 `activeTabId`（store 内按 idx 算右邻居→左邻居）并 navigate 过去，无剩余则 `navigate('/')` | 关非 active tab 只删不跳；关最后一个→回首页 | browser-tabs.store.closeTab | 真实。`BrowserTabsBar.tsx:89-108,234-242`；store 邻居算法 `browser-tabs.store.ts:285-296` |
| BRWS-007 | BrowserTabsBar · tabs 区 | TabPill 整体 | 鼠标中键点击（auxClick button===1）| 该 tab 存在 | 同关闭：`preventDefault` + 调 `onClose`（等价 X 按钮）| 仅中键(button1)生效，其他 aux 键忽略 | browser-tabs.store.closeTab | 真实。`BrowserTabsBar.tsx:206-211` |
| BRWS-008 | BrowserTabsBar · 右侧 | 「+ 新建详情页签」按钮（Plus）| 点击 | tabs 非空 | 作为 `QuickOpenPaperDialog` 的 Popover trigger，弹出搜索弹层（align='end'，按钮下方）；不直接新建空白 tab | — | Radix Popover（本地 open state）| 真实。注意 store 无 `addBlankTab`，「+」纯走 QuickOpen。`BrowserTabsBar.tsx:147-156` |
| BRWS-009 | QuickOpenPaperDialog | Popover 打开 | trigger 点击 → open=true | — | `useEffect` 重置 `query=''` 并下一帧 focus 输入框 | — | 本地 useState + RAF focus | 真实。`QuickOpenPaperDialog.tsx:36-46` |
| BRWS-010 | QuickOpenPaperDialog | 搜索输入框（原生 input，maxLength=128）| 输入文字 | 弹层打开 | `setQuery`；驱动 `useQuickPaperSearch(query)` 多源并发搜索 | 空 query(trim 后) → 显示「输入关键词后开始搜索」空提示，不发请求 | `useQuickPaperSearch`（library/api，多上游聚合，真实接口）| 真实接口。`QuickOpenPaperDialog.tsx:83-91,48,106-107` |
| BRWS-011 | QuickOpenPaperDialog | 清空按钮（X，仅 query 非空时显示）| 点击 | 输入框有值 | `setQuery('')` 清空，回到空提示态 | query 为空时按钮不渲染 | 纯前端 | 真实。`QuickOpenPaperDialog.tsx:92-101` |
| BRWS-012 | QuickOpenPaperDialog · 列表 | 初始加载态 | 触发搜索、尚无任何源返回 | `hasQuery && !allDone && totalCount===0` | 居中 spinner「搜索中…」 | 已有部分结果后即转为列表，不再显示整页 loading | useQuickPaperSearch[].isLoading | 真实。`QuickOpenPaperDialog.tsx:54-55,108-109` |
| BRWS-013 | QuickOpenPaperDialog · 列表 | 增量结果 + 列表尾部 inline loading | 各源陆续返回 | 至少一源已出结果 | 按 arrival order 拼接展示（先返回的源先列），还有源未完成时尾部显示「其他源继续加载中…」 | 后到源静默追加，不打断已展示项 | `useArrivalOrderedPapers`（前端拼接）| 真实。`QuickOpenPaperDialog.tsx:113-128,250-281` |
| BRWS-014 | QuickOpenPaperDialog · 列表 | 空结果提示 | 搜索完成无命中 | `allDone && totalCount===0 && hasQuery` | 显示「没有命中『{query}』/ 试试换个关键词」 | — | useQuickPaperSearch 结果 | 真实。`QuickOpenPaperDialog.tsx:110-111,233-243` |
| BRWS-015 | QuickOpenPaperDialog · 列表 | 论文结果行 PaperRow（图标 + 标题 + source badge + 作者/年份/引用 meta）| 点击 | 有结果 | `handlePick(paper)`→`useOpenPaperInBrowser`(openPaper)：灌 paper tab 进 store(智能合并 stub/rich) + SEO 曝光 + navigate 到 `/paper/{source}/{paperId}`；并 `setOpen(false)` 关弹层 | source 缺省 fallback `'stc'`；title 缺省「无标题」| `useOpenPaperInBrowser`（useOpenInBrowser.ts）+ browser-tabs.store.openPaperTab | 真实。`QuickOpenPaperDialog.tsx:57-60,148-214`；hook `useOpenInBrowser.ts:83-90` |
| BRWS-016 | QuickOpenPaperDialog | Popover 本体 | 关闭（Esc / 点外部）| 弹层打开 | Radix `onOpenChange(false)` → open=false 收起 | — | Radix Popover | 真实。`QuickOpenPaperDialog.tsx:63` |
