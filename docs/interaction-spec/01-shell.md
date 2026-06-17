# 01 · 全局外壳与导航 交互明细

> 列定义见 [README](README.md)。Ground truth = 前端代码实际行为（非设计图）。

## PART 1 — 页面/流程概要

### 区域清单

| 区域 | 组件 | 文件 | 说明 |
|---|---|---|---|
| 全局外壳 | `AppShell` | `app/layouts/AppShell.tsx` | `flex flex-col min-h-screen` 容器：顶部 `TopNav` + `<main>` 包 `ErrorBoundary` 包 `<Outlet />`。挂载 3 个全局登录后副作用 hook |
| 工作区外壳 | `WorkspaceShell` | `app/layouts/WorkspaceShell.tsx` | 可调宽度多窗格（`react-resizable-panels`）：sidebar(必填) + 主区 + rightPanel(可选)，无 TopNav |
| 顶部导航 | `TopNav` | `app/layouts/TopNav.tsx` | `sticky top-0 z-30` `h-16`，CSS Grid 三列 `[minmax(0,1fr) auto minmax(0,1fr)]`：左 Brand+Rail / 中 Carousel(几何居中) / 右 User |
| 品牌区 | `BrandSection` | `topnav/BrandSection.tsx` | ☰ 收合按钮 + Logo（`BrandLogo`），Logo 点击回首页 |
| 侧栏快捷入口 | `RailLinks` | `topnav/RailLinks.tsx` | 渲染 `sidebar.store.rail`，sidebar 展开或 rail 空时不渲染 |
| 菜单轮播 | `MenuCarousel` | `topnav/MenuCarousel.tsx` | 浏览器入口 + 首页按钮 + 上/下箭头 + 3 拷贝无缝循环 carousel + 全站功能浮层触发 |
| 全站功能浮层 | `AllMenusOverlay` | `topnav/AllMenusOverlay.tsx` | Radix HoverCard（非 modal），列表/网格双视图，渲染 `MENUS` 按分类分组 |
| 用户区 | `UserSection` | `topnav/UserSection.tsx` | 反馈入口 + (登录态)通知铃铛 + 用户头像下拉 / (未登录)登录·注册 CTA |
| 用户下拉内容 | `UserMenuContent` | `shared/components/UserMenuContent.tsx` | 个人主页/设置/订阅/(管理后台)/退出登录 |
| 通知铃铛 | `NotificationBell` | `shared/components/NotificationBell.tsx` | 红点未读数，点击进 `/messages` |

### 菜单配置（`app/menus.ts`，单一来源 `MENUS`）

7 个菜单 / 3 分类（检索 search · 智能 ai · 资源 resource）：
- 检索：文献搜索 `/search`、期刊搜索 `/journals/search`
- 智能：智能助手 `/claw`(soon)、智能写作 `/prism`(soon)、智能审稿 `/peer-review`(soon)
- 资源：文献集 `/library`、功能广场 `/tools`(soon)

`comingSoon: true` 仍可点击跳转，仅 chip 上加 amber「即将推出」角标。每个菜单有 `match(pathname)` 前缀判定 active。`findActiveMenuIndex` 无匹配（如首页 `/`）返回 0（仅决定居中位置，不点亮）。

### 全局流程

- **单向数据流（carousel）**：URL 是唯一真理。任何点击 → `navigate` → `location.pathname` 变 → `activeIndex` 派生 → carousel 滑动同步，无反向 navigate（MenuCarousel.tsx:26-30, 51-54）。
- **3 拷贝无缝循环**：`MENUS` 渲染 3 份，`trackIndex` 走最短方向；wrap 到 clone 段后 `onTransitionEnd` silent snap 回 main 段（MenuCarousel.tsx:67-118）。
- **登录后副作用**（AppShell.tsx:24-28）：`useStagingSync`（暂存区推云端）/ `useReplayPendingAction`（重放未登录动作）/ `useNotificationSocket`（通知 WS）。
- **登录入口**：未登录点「登录/注册」开 `useAuthDialog` 弹窗（不跳 `/login` 路由）（UserSection.tsx:79-88）。

### 实现状态

| 项 | 状态 |
|---|---|
| 路由导航（useNavigate / Link） | 真实（react-router-dom） |
| active 派生与 carousel 同步 | 真实（location 派生 + useState/useLayoutEffect） |
| 侧栏开合 / rail / flash | 真实（`stores/sidebar.store.ts`，expanded 持久化 localStorage） |
| 登录态 user | 真实（`stores/auth.store.ts`，persist + cookie 同步） |
| 登录/注册弹窗开关 | 真实（`stores/auth-dialog.store.ts`） |
| 浏览器 tabs | 真实（`stores/browser-tabs.store.ts`） |
| 通知未读数 | 真实 react-query（`useUnreadCount`）+ WS 推送 |
| 菜单数据 | 静态常量（`app/menus.ts`） |
| 全站功能浮层视图偏好 | 真实（`useLocalStorage` 持久化） |

## PART 2 — 元素级交互表

| 用例ID | 页面/区域 | 元素 | 触发动作 | 前置条件 | 预期结果 | 边界/异常 | 数据/接口依赖 | 状态/备注 |
|---|---|---|---|---|---|---|---|---|
| SHELL-001 | 全局外壳 / AppShell | `<main>` 主体 | 路由级渲染异常 | 子路由抛错 | `ErrorBoundary` 局部捕获，壳本身不崩 | — | 纯前端（ErrorBoundary） | 真实，AppShell.tsx:33-36 |
| SHELL-002 | 全局外壳 / AppShell | 外壳挂载 | 进入任意 AppShell 路由 | — | 挂 `useStagingSync`/`useReplayPendingAction`/`useNotificationSocket`；登录态变化时触发对应同步 | 未登录时各 hook 内部应空转 | 真实 hook + WS | 真实，AppShell.tsx:24-28 |
| SHELL-003 | 工作区外壳 / WorkspaceShell | 面板分隔条 ResizableHandle | 拖拽 | — | 调整左/右栏宽度；`autoSaveId` 存在时宽度持久化 localStorage | min/max size 限制（sidebar 10-25%，right 18-45%） | 纯前端（react-resizable-panels） | 真实，WorkspaceShell.tsx:54-80 |
| SHELL-004 | 工作区外壳 / WorkspaceShell | rightPanel 区 | 是否传入 rightPanel | `rightPanel` 为空 | 降级为两栏（不渲染右 handle + 右栏），主区占满剩余 | — | 纯前端 | 真实，WorkspaceShell.tsx:64-80 |
| SHELL-005 | 顶部导航 / TopNav | header 容器 | 任意时刻 | — | `sticky top-0 z-30`，CSS Grid 三列；中列 carousel 始终几何居中（不被左 Rail 挤压） | — | 纯前端 | 真实，TopNav.tsx:29-34 |
| SHELL-006 | 顶部导航 / TopNav | Brand 与 Rail 间竖线 | rail 是否显示 | `!expanded && rail.length>0` | 显示 1px 竖线 + RailLinks；否则两者都不渲染 | — | `useSidebar` | 真实，TopNav.tsx:26, 38-43 |
| SHELL-007 | 品牌区 / BrandSection | ☰ 侧栏按钮 | 点击 | `canToggle=true`（当前路由有 panel） | `onToggleSidebar` → `useSidebar.toggle()` 切换 expanded（写盘 localStorage） | `canToggle=false`（无侧栏页）按钮 disabled 灰显，无 tooltip | `useSidebar` (hasPanel/toggle) | 真实，BrandSection.tsx:28-35 + TopNav.tsx:25,37 |
| SHELL-008 | 品牌区 / BrandSection | Logo（BrandLogo） | 点击 | — | `<Link to="/">` 跳转首页 | — | 纯前端 | 真实，BrandSection.tsx:36-38 |
| SHELL-009 | 侧栏快捷入口 / RailLinks | rail chip 按钮 | 点击 | sidebar 收合且 rail 非空 | `setExpanded(true)` 展开 sidebar；若 chip 有 `sectionId` 则 `flashSection` 触发对应段闪烁高亮 1800ms | sidebar 已 expanded 或 rail 为空时整个 nav 不渲染 | `useSidebar`（rail/expanded/setExpanded/flashSection） | 真实，RailLinks.tsx:16-52 |
| SHELL-010 | 侧栏快捷入口 / RailLinks | rail chip | hover | — | `hover:bg-surface-2 hover:text-foreground` | 全部 chip 同一样式，无 active 高亮 | 纯前端 | 真实，RailLinks.tsx:43-46 |
| SHELL-011 | 侧栏快捷入口 / RailLinks | nav 容器 | chip 溢出 | chip 多到挤不下 | 容器内部横向滚动（scrollbar 隐藏），不影响 TopNav 居中布局 | — | 纯前端 | 真实，RailLinks.tsx:27-34 |
| SHELL-012 | 菜单轮播 / MenuCarousel | 浏览器入口（Globe）按钮 | 点击 | 存在浏览器 tab（`tabs.length>0`） | 跳到活跃 tab 的 URL；若当前不在 detail pane 则把当前路径写为该 tab 的 returnTo | 无任何 tab 时整颗按钮不渲染（非 disabled）；已在 detail pane 时不改 returnTo | `useBrowserTabs`（tabs/activeTabId/refreshReturnTo） | 真实，MenuCarousel.tsx:144-180 |
| SHELL-013 | 菜单轮播 / MenuCarousel | 浏览器入口按钮 | 路由在 detail pane | 路径匹配 `/(paper\|author\|journal\|pdf)/` | active 态：黑底白字 `bg-foreground text-background`，cursor-default | — | 纯前端（正则判定） | 真实，MenuCarousel.tsx:136-139, 170-175 |
| SHELL-014 | 菜单轮播 / MenuCarousel | 首页（Home）按钮 | 点击 | — | `navigate('/')` 跳首页 | — | 纯前端 | 真实，MenuCarousel.tsx:182-197 |
| SHELL-015 | 菜单轮播 / MenuCarousel | 首页按钮 | 路由为 `/` | `location.pathname === '/'` | active 态：黑底白字，cursor-default，hover 同色（不变浅） | — | 纯前端 | 真实，MenuCarousel.tsx:134, 186-193 |
| SHELL-016 | 菜单轮播 / MenuCarousel | 上一个菜单「‹」 | 点击 | — | `navigate(MENUS[(activeIndex-1+N)%N].href)` 跳上一菜单（环绕） | — | 静态 MENUS | 真实，MenuCarousel.tsx:120-123, 201-208 |
| SHELL-017 | 菜单轮播 / MenuCarousel | 下一个菜单「›」 | 点击 | — | `navigate(MENUS[(activeIndex+1)%N].href)` 跳下一菜单（环绕） | — | 静态 MENUS | 真实，MenuCarousel.tsx:124-127, 259-266 |
| SHELL-018 | 菜单轮播 / MenuCarousel | 居中 active chip | URL 变化 | activeIndex 改变 | track 走最短方向平滑滑动（300ms），active chip 长大为黑底白字 h-9，inactive 灰色 h-7 | wrap 边界用 clone 段过渡后 silent snap 回 main，视觉无跳变 | location 派生 | 真实，MenuCarousel.tsx:67-118, 290-330 |
| SHELL-019 | 菜单轮播 / MenuCarousel | menu chip | 点击 | — | 仅当 `!menu.match(pathname)`（未在该菜单页）才 `navigate(menu.href)`；已在则吞掉避免重复跳转 | 在 `/` 上点首项「文献搜索」不会被误判已激活（用 match 真值判断） | location + 静态 MENUS | 真实，MenuCarousel.tsx:245-251 |
| SHELL-020 | 菜单轮播 / MenuCarousel | comingSoon 菜单 chip | 点击 | `comingSoon=true` | 仍正常 `navigate(href)`（不阻止），chip 右侧带 amber「即将推出」角标 | 进入页面后由各 Page 渲染占位（本模块外） | 静态 MENUS | 真实，MenuCarousel.tsx:315-327 |
| SHELL-021 | 菜单轮播 / MenuCarousel | carousel viewport | 窗口缩放 | — | resize 重测 DOM 重算 translateX，保持居中 | — | 纯前端（resize 监听） | 真实，MenuCarousel.tsx:92-104 |
| SHELL-022 | 全站功能浮层 / AllMenusOverlay | 触发按钮（LayoutGrid） | hover | — | Radix HoverCard 展开浮层（openDelay 120ms），鼠标可平滑移入内容；非 modal，不锁滚动不抢 ESC | — | 纯前端（Radix HoverCard） | 真实，AllMenusOverlay.tsx:46-52 + MenuCarousel.tsx:270-280 |
| SHELL-023 | 全站功能浮层 / AllMenusOverlay | 触发按钮 | 移出 | 浮层打开 | closeDelay 180ms 后自动关闭 | — | 纯前端 | 真实，AllMenusOverlay.tsx:46 |
| SHELL-024 | 全站功能浮层 / AllMenusOverlay | 视图切换按钮 | 点击 | — | list ↔ grid 切换并持久化到 localStorage（`scholay.all-menus.view`），下次打开记忆 | — | `useLocalStorage` | 真实，AllMenusOverlay.tsx:30-34, 59-75 |
| SHELL-025 | 全站功能浮层 / AllMenusOverlay | 列表项 ListItem | 点击 | view=list | `navigate(menu.href)` 跳转 | — | 静态 MENUS | 真实，AllMenusOverlay.tsx:41-43, 140-142 |
| SHELL-026 | 全站功能浮层 / AllMenusOverlay | 列表项 | hover / active | 当前菜单匹配（flatIdx===activeIndex） | active 或 hover 均 `bg-surface-1` | — | location 派生 | 真实，AllMenusOverlay.tsx:111-119, 143-146 |
| SHELL-027 | 全站功能浮层 / AllMenusOverlay | 网格卡片 GridView | 点击 | view=grid | `navigate(menu.href)` 跳转 | comingSoon 项右上角 amber「即将推出」角标 | 静态 MENUS | 真实，AllMenusOverlay.tsx:198-208 |
| SHELL-028 | 用户区 / UserSection | 反馈入口（Headphones） | 点击 | — | `navigate('/feedback')`（public 路由，登录与否都给入口） | — | 纯前端 | 真实，UserSection.tsx:37-44 |
| SHELL-029 | 用户区 / UserSection | 通知铃铛 NotificationBell | 渲染 | `user` 非 null（已登录） | 显示铃铛；未读数 >0 时铃铛右上角 brand-red 红点（>99 显示「99+」），WS 推送即时更新 | 未登录不渲染（/user/messages 是 protected） | react-query `useUnreadCount` + WS | 真实，UserSection.tsx:46-48 + NotificationBell.tsx:47-54 |
| SHELL-030 | 用户区 / NotificationBell | 铃铛按钮 | 点击 | 已登录 | Radix Popover 展开（align end，宽 380），含 全部已读 / 全部·未读 tab / 通知列表 | — | Radix Popover | 真实，NotificationBell.tsx:41-68 |
| SHELL-031 | 通知 Popover | 「全部已读」按钮 | 点击 | Popover 打开 | `markAll.mutate()` 标记全部已读 | `unread===0` 或 mutation pending 时 disabled（cursor-not-allowed） | react-query `useMarkAllRead` | 真实，NotificationBell.tsx:79-92 |
| SHELL-032 | 通知 Popover | 全部 / 未读 tab | 点击 | Popover 打开 | 切换 `tab` 状态，列表按 `{is_read:false}` 过滤；active tab 底部 brand-red 下划线 | — | react-query `useNotificationList` | 真实，NotificationBell.tsx:97-165 |
| SHELL-033 | 通知 Popover | 通知列表 | 加载/渲染 | Popover 打开 | loading 显示 spinner；error 显示「通知加载失败」；空显示 Inbox 占位（区分未读/全部文案） | loading/error/empty 三态 | react-query `useNotificationList` | 真实，NotificationBell.tsx:172-197 |
| SHELL-034 | 通知 Popover | 单条通知 | 点击 | — | 未读则 `markRead.mutate(id)`；有 `link_url` 内链经 `isValidAppPath` 校验后 navigate（失效则 toast.warning 不跳），外链 `window.open` 新窗口；之后关闭 Popover | 无 link_url 时仅标记已读不跳转；内链失效给可解释提示 | `useMarkRead` + `isValidAppPath` + sonner | 真实，NotificationBell.tsx:237-256 |
| SHELL-035 | 通知 Popover | 单条「×」删除 | 点击 | hover 行时显现 | `stopPropagation` + `remove.mutate(id)` 删除该通知 | 仅 group-hover 时 opacity 显示 | react-query `useDeleteNotification` | 真实，NotificationBell.tsx:295-306 |
| SHELL-036 | 通知 Popover | 「加载更多」 | 点击 | `hasNextPage` 为真 | `fetchNextPage()` 加载下一页 | fetching 时 disabled + spinner | react-query 无限分页 | 真实，NotificationBell.tsx:206-221 |
| SHELL-037 | 用户区 / UserSection | 用户头像 pill | 点击 | 已登录 | Radix DropdownMenu 展开 UserMenuContent（240 宽） | 头像无 avatar 时回退 username/email 首字母大写；pill 文案用 username 或 maskEmail | `useAuthStore.user` | 真实，UserSection.tsx:50-76 |
| SHELL-038 | 用户区 / UserSection | 「登录」按钮 | 点击 | 未登录（`user` 为 null） | `openDialog('login')` 打开登录弹窗（不跳 `/login` 路由） | — | `useAuthDialog` | 真实，UserSection.tsx:79-81 |
| SHELL-039 | 用户区 / UserSection | 「注册」按钮 | 点击 | 未登录 | `openDialog('register')` 打开注册弹窗 | — | `useAuthDialog` | 真实，UserSection.tsx:82-88 |
| SHELL-040 | 用户下拉 / UserMenuContent | 头部（头像+名+邮箱+角色徽章） | 渲染 | 下拉打开 | 显示大头像、displayName（username 或 email 前缀）、email、角色徽章（admin 红 / 普通 绿） | `user` 为 null 时整个 content 返回 null | `useAuthStore.user` | 真实，UserMenuContent.tsx:39-76 |
| SHELL-041 | 用户下拉 / UserMenuContent | 「个人资料」 | 点击 | 下拉打开 | `navigate('/settings/profile')` | — | 纯前端 | 真实，UserMenuContent.tsx:85-91 |
| SHELL-042 | 用户下拉 / UserMenuContent | 「安全设置」 | 点击 | 下拉打开 | `navigate('/settings/security')` | — | 纯前端 | 真实，UserMenuContent.tsx:92-98 |
| SHELL-043 | 用户下拉 / UserMenuContent | 「已连接账号」 | 点击 | 下拉打开 | `navigate('/settings/connections')` | — | 纯前端 | 真实，UserMenuContent.tsx:99-105 |
| SHELL-044 | 用户下拉 / UserMenuContent | 「帮助中心」 | 点击 | 下拉打开 | `navigate('/help')` | — | 纯前端 | 真实，UserMenuContent.tsx:106-112 |
| SHELL-045 | 用户下拉 / UserMenuContent | 「管理员后台」 | 点击 | `isAdminRole(user.role)`（admin/super_admin） | `navigate('/admin')` | 非管理员角色不渲染该项 | `useAuthStore.user.role` | 真实，UserMenuContent.tsx:113-121 |
| SHELL-046 | 用户下拉 / UserMenuContent | 「退出登录」（红） | 点击 | 下拉打开 | `http.post('/user/logout')`（失败也继续）→ `clearAuth()` 清 token+cookie+user → `qc.clear()` 清 query 缓存 | 服务端失败不阻塞本地清理；无 toast、无主动 navigate | `useAuthStore.clear` + `http` + queryClient | 真实，UserMenuContent.tsx:46-54, 128-134 |
| SHELL-047 | 用户下拉 / UserMenuContent | 任意菜单项 | 键盘 ↑↓ / Enter / Esc | 下拉打开 | Radix DropdownMenuItem 内置键盘导航与关闭 | — | 纯前端（Radix） | 真实，UserMenuContent.tsx:31 |
