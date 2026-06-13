# 00 · 页面/流程级骨架总表

> 粗粒度全景：每行一个页面/视图及其核心用户流程。元素级细节见各模块明细表（「明细」列链接）。
> 路由来源：`frontend-user/src/app/router.tsx` + 各 `features/*/routes.tsx`（实际挂载，已核对）。
>
> 开发状态图例：✅ 已开发（代码为准） · 🟡 刚起步（部分 mock/未接线） · 🧩 仅占位/静态（有路由但无业务逻辑）

## 全局外壳

| 模块 | 路由 | 视图/区域 | 核心用户流程 | 状态 | 明细 |
|---|---|---|---|---|---|
| 全局外壳 SHELL | 所有 `/` 下路由 | AppShell + TopNav（Rail / Brand / 菜单轮播 / 全部菜单浮层 / 用户区） | 跨模块导航、登录态展示、菜单展开 | ✅ | [01](01-shell.md) |
| 工作区外壳 SHELL | 搜索/Prism 等 | WorkspaceShell（多栏布局壳） | 三栏/多窗格布局承载 | ✅ | [01](01-shell.md) |

## 已开发模块

| 模块 | 路由 | 视图/区域 | 核心用户流程 | 状态 | 明细 |
|---|---|---|---|---|---|
| 主页 HOME | `/` (index) | Hero 搜索 / 搜索模式切换 / 快捷入口 / 热门话题 / 近期活动 | 输入查询并搜索、切换搜索模式、点快捷入口跳转 | ✅ | [02](02-home.md) |
| 论文详情 DETAIL | （详情视图） | PaperDetailView：摘要 / 引用 / 参考文献 / 相关论文 | 查看论文、展开摘要、看引用/参考、跳相关 | ✅ | [02](02-home.md) |
| 学者详情 DETAIL | （详情视图） | AuthorDetailView：指标 / 作品列表 / 发文趋势图 / 相关学者 | 查看学者、浏览作品、看趋势、跳相关学者 | ✅ | [02](02-home.md) |
| 期刊详情(主页) DETAIL | （详情视图） | JournalDetailView：期次列表 | 查看期刊概况与期次 | ✅ | [02](02-home.md) |
| 搜索 SRCH | `/search` | 三栏：传统/智能检索 / 暂存区 / 矩阵（含维度设置、结果卡片） | 传统检索或智能对话检索→暂存论文→加入矩阵→配置维度→矩阵分析 | ✅ | [03](03-search.md) |
| 期刊列表 JRNL | `/journals` | 筛选栏 / 已选筛选 / 期刊结果卡片 | 检索期刊、应用筛选、进入详情 | ✅ | [04](04-journals.md) |
| 期刊详情 JRNL | `/journals/:journalId` | Hero / 指标面板 / 简介 / 期次列表 / 文章行 / Tabs | 切换 tab、浏览期次与文章 | ✅ | [04](04-journals.md) |
| 文献集 LIB | `/library` | 侧栏文献集树 / 工具栏 / 论文行 / 详情抽屉 / 矩阵面板 / 批量条 / 添加&导入向导 | 新建集、添加论文、PDF 导入、批量操作、打开详情、列设置、矩阵 | ✅ | [05](05-library.md) |

## 刚起步模块

| 模块 | 路由 | 视图/区域 | 核心用户流程 | 状态 | 明细 |
|---|---|---|---|---|---|
| 评审 REV | `/peer-review` | 评审员卡片 / 评分雷达图 / 证据面板 / 反驳撰写 / Prompt Studio 弹窗 | AI 模拟同行评审（部分 mock/未接线） | 🟡 | [06](06-peer-review.md) |

## 路由已存在（占位/逐步开发）

| 模块 | 路由 | 视图/区域 | 核心用户流程 | 状态 | 明细 |
|---|---|---|---|---|---|
| Prism PRSM | `/prism` | Header / 侧栏文件树 / CodeMirror 编辑器 / 预览面板 | LaTeX 写作、编译、预览 | 🟡/🧩 | [07](07-prism-browser.md) |
| 浏览 BRWS | `/browser` | BrowserChrome（地址栏 / 标签 / 导航按钮） | 学术资源浏览器 | 🧩 | [07](07-prism-browser.md) |
| 工具 TOOL | `/tools` | 工具卡片网格 | 学术工具箱（当前静态） | 🧩 | [08](08-tools-claw-auth-settings.md) |
| Claw CLAW | `/claw` | AI 助手对话区 / 附件问答 / 工具调用 / 思考过程 | AI 学术助手对话、检索辅助、多轮追问、附件读取 | ✅/SPEC-DRIFT | [08](08-tools-claw-auth-settings.md) |
| 认证 AUTH | `/login` `/register` `/forgot-password` | AuthCard / 表单 / 滑块验证 / OAuth 按钮 | 登录、注册、找回密码 | 🟡 | [08](08-tools-claw-auth-settings.md) |
| 设置 SET | `/settings` | 设置项分区 | 账户与偏好设置 | 🟡/🧩 | [08](08-tools-claw-auth-settings.md) |

> 说明：🟡/🧩 表示该模块在三方核对（旧版/改版/代码）中以代码现状为准，具体每个元素的真实/mock 状态见对应明细表「状态/备注」列。`✅/SPEC-DRIFT` 表示开发环境已上线真实能力，但当前仓库代码或旧规约仍未同步。
