# 06 · 评审 交互明细（🟡 刚起步）

> 列定义见 [README](README.md)。Ground truth = 前端代码实际行为（非设计图）。本模块处于早期开发，注意「状态/备注」列对 mock/未接线/占位 的标注。

## PART 1 — 页面/流程概要

> ⚠️ **重要：实际代码与「评分雷达图 / 证据面板 / 反驳撰写 / Prompt Studio」等设计设想完全不符。** 任务里点名的组件（`ReviewerCard` / `ScoreRadarChart` / `EvidencePanel` / `RebuttalComposer` / `PromptStudioDialog`）以及 `types.ts` **在代码中均不存在**。本规格只描述代码里真实存在的东西。

**路由**：`/peer-review`（含 `peer-review/*` 通配）。`routes.tsx:5` 定义 lazy 路由，`app/router.tsx:11` import、第 64 行 `...peerReviewRoutes` 展开进 `AppShell` 子路由——**已接入应用，可访问**。导航入口 `app/menus.ts:97`（label「智能审稿」/ `AI Reviewer`，`comingSoon: true`，`href: '/peer-review'`）。

**整体实现状态**：本模块仍是「即将推出」占位页，**无任何真实评审功能、无后端、无 react-query、无 API 调用、无表单**。页面 = 通用占位壳 `ComingSoonView` + 一张静态 mock 预览图 `PeerReviewPreview`。

**实际文件清单（仅 4 个）**：
- `pages/PeerReviewPage.tsx`（12 行）— 渲染 `<ComingSoonView title="智能审稿" description="..." preview={<PeerReviewPreview/>} />`。
- `components/PeerReviewPreview.tsx`（162 行）— **纯静态占位 UI**（「工单总览」：页头 + 过滤条 + 4 张工单卡），数据全为模块级 `MOCK_TICKETS`；所有按钮 `tabIndex={-1}` 且无 `onClick`。
- `components/PeerReviewSidebar.tsx`（120 行）— **已写好但全代码库无人 import 的死组件**（`grep` 仅命中其自身定义，未被 `PeerReviewPage` 使用）。内部有本地 state 交互逻辑，但当前不渲染在任何页面上。
- `routes.tsx`（11 行）。

**占位壳 `ComingSoonView`（`shared/components/ComingSoonView.tsx`，通用组件、非评审专属）实际结构**：
- `SidebarLayout` + `ComingSoonSidebar`（左 aside）：含 `SidebarHeaderNav`（顶栏菜单切换）、一段静态「即将推出」提示框、`SidebarAuthFooter`、`SidebarCollapseButton`（收起/展开侧栏）。
- 主区顶部一条 amber banner：「{title}即将推出 · {description}」。
- banner 下方：`preview` slot 外包 `aria-hidden + opacity-60 + pointer-events-none + select-none`——**整块预览不可交互、不可选中**。

> 注意：`ComingSoonView` **没有** 返回首页链接、**没有** 邮箱订阅输入框。唯一真实交互来自侧栏（顶栏菜单导航 + 折叠按钮 + 登录态 footer），均为通用组件行为。

**核心流程**：用户访问 `/peer-review` → 见占位页（banner + 灰显预览）→ 仅能通过侧栏导航离开 / 折叠侧栏。无评审业务流程落地。

**Mock / 占位数据**：
- `MOCK_TICKETS`（`PeerReviewPreview.tsx:81`）— 4 条写死工单，仅供预览展示。
- 过滤条 `count`（4 / 12，`PeerReviewPreview.tsx:27-28`）— 写死数字，无逻辑。

## PART 2 — 元素级交互表

| 用例ID | 页面/区域 | 元素 | 触发动作 | 前置条件 | 预期结果 | 边界/异常 | 数据/接口依赖 | 状态/备注 |
|---|---|---|---|---|---|---|---|---|
| REV-001 | 占位壳·主区 | amber banner「智能审稿即将推出 · 投稿前 AI 预审」 | 展示（无交互） | — | 静态展示 title + description 文案 | — | 无 | 真实渲染（占位文案）；`ComingSoonView.tsx:41-48`、`PeerReviewPage.tsx:6-10` |
| REV-002 | 占位壳·主区 | 预览容器（`opacity-60 pointer-events-none` 包 `PeerReviewPreview`） | 任意点击/选中 | — | **全部被拦截**：`pointer-events-none` 屏蔽点击，`select-none` 禁选中，`aria-hidden` 屏读隐藏 | 内部元素再有 onClick 也不触发 | mock静态 `MOCK_TICKETS` | 占位（整块禁用交互）；`ComingSoonView.tsx:52-57` |
| REV-003 | 占位壳·侧栏 | `SidebarHeaderNav`（顶栏菜单切换） | click（菜单项） | — | 通用侧栏头部导航，切换到其他 feature 路由 | — | 纯前端/无后端（通用组件） | 真实（继承通用 Sidebar 行为）；`ComingSoonView.tsx:73` |
| REV-004 | 占位壳·侧栏 | `SidebarCollapseButton` 折叠按钮 | click | — | 调 `useSidebar(s=>s.toggle)` 切换全局侧栏折叠态 | — | zustand `sidebar.store` | 真实（通用组件）；`ComingSoonView.tsx:70,89` |
| REV-005 | 占位壳·侧栏 | 「即将推出」提示框 + `SidebarAuthFooter` | 展示 / 登录态交互 | — | 提示框纯展示；footer 为通用登录态组件 | — | 通用组件 | 真实渲染（占位）；`ComingSoonView.tsx:75-86,88` |
| REV-006 | 预览·页头 | 搜索框「搜索投稿编号/标题」 | （无交互） | — | 纯展示占位文案——是 `<span>` 不是真 `<input>` | — | 无 | 占位；`PeerReviewPreview.tsx:16-19` |
| REV-007 | 预览·过滤条 | 过滤按钮（全部/待我审稿/已提交/主审决议/我的投稿） | click | — | **空操作**：`<button tabIndex={-1}>` 无 `onClick`；「全部」恒为 active（写死） | count 徽章（4 / 12）为写死数字，无过滤逻辑 | mock静态 | 占位/未接线；`PeerReviewPreview.tsx:32-57` |
| REV-008 | 预览·工单列表 | 工单卡 `TicketCard` ×4 | （无交互） | — | 遍历 `MOCK_TICKETS` 渲染：编号/期刊/标题/作者/天数/轮次 + 状态徽章（5 色编码 `STATUS_CLS`） | 标题 `truncate` 截断；外层 `overflow-hidden` 不滚动 | mock静态 `MOCK_TICKETS` | 占位（无 onClick）；`PeerReviewPreview.tsx:62-63,132,152-159` |
| REV-009 | （死组件）`PeerReviewSidebar` | 6 个 `SidebarItem`（我要投稿/期刊审稿/毕业审稿/审稿助理/智能代理/审稿记录） | click | 组件被渲染时 | `setActive(id)`→更新本地 `internal` state，选中项 `active='danger'`（danger-soft 底 + 左 3px 红边 + 加粗）；受控时回调 `onSelect(id)` | 默认选中 `'assistant'` | 纯前端/无后端 | ⚠️ **死代码**：全库无 import，当前不渲染在任何页面；`PeerReviewSidebar.tsx:40,44-49,60-110` |
| REV-010 | （死组件）`PeerReviewSidebar` | 折叠按钮 `SidebarCollapseButton` | click | 组件被渲染时 | 调 `useSidebar(s=>s.toggle)` 切换全局侧栏折叠态 | — | zustand `sidebar.store` | 死代码（同上，未挂载）；`PeerReviewSidebar.tsx:50,117` |

**未实现 / 缺口汇总**：
- 任务设想的评审核心（评审员卡片 / 评分雷达图 / 证据面板 / 反驳撰写 / Prompt Studio / `types.ts`）**代码中均不存在**——尚未开始实现。
- 整页是 `ComingSoonView` 占位，无后端 / react-query / API / SSE / 表单。
- `ComingSoonView` 本身也没有任务设想的「邮箱订阅 / 返回首页」交互，唯一真实交互来自通用侧栏（导航 + 折叠）。
- `PeerReviewPreview` 为纯静态展示，搜索/过滤/工单卡全部 no-op 占位，且被 `pointer-events-none` 整体禁用。
- `PeerReviewSidebar` 已写好交互逻辑但是死代码（无人引用），需后续接入真实页面才生效。
