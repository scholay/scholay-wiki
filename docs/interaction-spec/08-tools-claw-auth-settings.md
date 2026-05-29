# 08 · 工具 / Claw / 认证 / 设置 交互明细

> 列定义见 [README](README.md)。Ground truth = 前端代码实际行为（非设计图）。

## PART 1 — 页面/流程概要

### 工具（TOOL）— 功能广场 `功能广场`

- **路由**：`tools/*` → `ToolsPage`（`features/tools/routes.tsx:5` lazy）。
- **页面结构**：`ToolsPage` 只是把 `ComingSoonView`（`shared/components/ComingSoonView.tsx`）包了一层，传入 `title="功能广场"`、一段 description、`preview={<ToolsPreview/>}`。
- **区域**：
  1. 左侧 `ComingSoonSidebar`（`SidebarHeaderNav` 全局菜单 + 一段"即将推出"提示卡片 + `SidebarAuthFooter` + `SidebarCollapseButton`）。
  2. 主区顶部 amber banner：`{title}即将推出 · {description}`。
  3. 主区下方 `ToolsPreview` 样式预览：整块包在 `aria-hidden + opacity-60 + pointer-events-none + select-none` 容器里，**不可交互**。
- **`ToolsPreview` 内容**：header（Compass 图标 + "功能广场" + "Playground · 全部功能与玩法" + "{12} 个工具"）+ "热门工具" 段标 + 3 列网格 12 张静态 `ToolCard`（AI 文献摘要 / 论文翻译 / 引用网络 / PDF 解析 / 高亮笔记 / 影响因子查询 / 研究问题生成 / 统计分析助手 / 阅读理解练习 / 研究图谱 / 智能任务清单 / 思维链推理，部分带"热门/新"标签）。
- **实现状态**：**纯静态占位（Coming Soon）**。无 API、无 react-query、无任何业务逻辑。整个预览被禁用交互。

### Claw（CLAW）— 智能助手 `智能助手`

- **路由**：`claw/*` → `ClawPage`（`features/claw/routes.tsx:5` lazy）。
- **页面结构**：同 TOOL，`ClawPage` 包 `ComingSoonView`，`title="智能助手"`，`preview={<ClawPreview/>}`。
- **`ClawPreview` 内容**：header（Sparkles 绿 + "智能助手" + "Claw AI"）+ 一段写死的对话流（2 条 `UserMsg` + 2 条 `AIMsg`，硬编码 Mamba vs Transformer 综述示例）+ 底部一个 `disabled` 的输入框（placeholder "向智能助手提问..."）。
- **实现状态**：**纯静态占位（Coming Soon）**。输入框 `disabled`，且外层 `pointer-events-none`，零交互。

### 认证（AUTH）— 登录 / 注册 / 找回密码 + OAuth

- **没有独立 `/login` `/register` `/forgot` 页面**：认证主体是全局唯一弹窗 `AuthDialog`（挂在 Providers 之下，由 `useAuthDialog` store 控制 open/mode/initialAccountType），不是路由页。三套表单（`LoginForm` / `RegisterForm` / `ForgotPasswordForm`）按 `mode` 在同一个 Dialog 内切换。
- **AUTH 相关路由（仅 OAuth 回调中转页）**（`features/auth/routes.tsx`）：
  - `github|google|apple|orcid|microsoft|discourse /callback` → `OAuthCallbackPage`
  - `wechat/callback` → `WeChatCallbackPage`
- **AuthDialog 4 个 mode**（`AuthDialog.tsx:17`）：`login` / `register` / `forgot` / `wechat-qr`。前 3 个共享"表单 + 分隔线 + `OAuthRow`"结构；`wechat-qr` 原地切换为微信扫码面板（左上返回箭头回 login，不嵌套二层 Dialog）。
- **核心流程**：
  1. **账号密码 / 验证码登录**：邮箱或手机号 × 密码或验证码 4 种组合 → 4 个 mutation（`/user/login`、`/user/login-phone`、`/user/login-with-code`、`/user/login-phone-with-code`）→ `handleAuthSuccess`（写 token + `qc.invalidateQueries()` 全量失效）→ toast + 关弹窗。
  2. **注册**：邮箱/手机 + 验证码 + 密码 + 可选邀请码 + 强制同意条款 → `/user/register` 或 `/user/register-phone` → `handleAuthSuccess`。
  3. **找回密码**：账号 + 验证码 + 新密码 → `/user/reset-password(-phone)` → 成功后切回 login（不自动登录）。
  4. **OAuth**：8 家 provider（GitHub/Google/微信/Apple/ORCID/Microsoft/Discourse），按 `usePublicConfig().enable_*` 动态显示。Google 走 GIS 一键登录；微信走 wxLogin iframe 扫码；其余整页 redirect → 后端 callback → `OAuthCallbackPage` 处理（登录 / 合并确认 / 错误）。
  5. **发码**：`SendCodeButton` 60s 倒计时（`useCountdown`），调 `/user/send-code` 或 `/user/send-phone-code`，带 `purpose`。
  6. **Turnstile**：`TurnstileField` 仅在 `enable_turnstile && turnstile_site_key` 时渲染，token 回传父表单，未拿到 token 时禁用提交。
- **实现状态**：**全部真实**（react-query mutation + 真实后端端点 + auth.store 落 session）。

### 设置（SET）— 账号设置

- **路由**（`features/settings/routes.tsx`）：`settings`（`SettingsLayout`，带 `ensureAuthed` loader）→ 子路由 `index`（重定向到 `profile`）/ `profile` / `security` / `connections`。
- **登录守卫**：`ensureAuthed` loader 读 `localStorage.auth_token`，无 token → `redirect('/?login=required')`（在 React 树外执行，早于组件渲染）。
- **`SettingsLayout`**：标题"设置" + 左侧 3 个 `NavLink`（个人资料 / 安全 / 已连接账号）+ 右侧 `Outlet`。
- **3 个子页**：
  - `ProfilePage`：编辑 昵称 / 简介 / 头像 URL → `PUT /user/profile`。
  - `SecurityPage`：修改密码 / 换绑邮箱 / 换绑手机（换绑已绑场景需双验证码）。
  - `ConnectionsPage`：8 种 provider 绑定/解绑（最后一种登录方式禁止解绑）。
- **实现状态**：**全部真实**（react-query query/mutation + 真实后端端点）。注意 `ProfilePage`/`SecurityPage` 用 `useState` + 裸 `useMutation`（不是表单库），`SecurityPage` 校验逻辑写在 mutationFn 里。

---

## PART 2 — 元素级交互表

### 工具（TOOL）

| 用例ID | 页面/区域 | 元素 | 触发动作 | 前置条件 | 预期结果 | 边界/异常 | 数据/接口依赖 | 状态/备注 |
|---|---|---|---|---|---|---|---|---|
| TOOL-001 | 路由 | `/tools`（`tools/*`） | 访问 URL | — | lazy 加载 `ToolsPage`，渲染 `ComingSoonView` | — | 纯前端 | 真实路由，stub 页 · `features/tools/routes.tsx:5` |
| TOOL-002 | ComingSoon banner | amber banner "功能广场即将推出 · {description}" | 仅展示 | — | 静态展示文案；description=翻译/引用网络/PDF 解析/高亮笔记/研究问题生成 | — | 纯前端 | 静态 · `ToolsPage.tsx:7`、`ComingSoonView.tsx:41` |
| TOOL-003 | ComingSoon 主区 | `ToolsPreview` 整块预览 | 任意点击/hover | — | **无响应**：外层 `aria-hidden + opacity-60 + pointer-events-none + select-none` | 完全禁用交互 | 纯前端 | 静态 · `ComingSoonView.tsx:52-57` |
| TOOL-004 | ToolsPreview header | "{TOOLS.length} 个工具" 计数 | 仅展示 | — | 显示 "12 个工具"（数组长度，写死 12 项） | — | mock静态 | 静态 · `ToolsPreview.tsx:30,56-69` |
| TOOL-005 | ToolsPreview 网格 | 12 张 `ToolCard`（图标+标题+描述+可选 tag） | 仅展示 | — | 3 列网格静态卡片；tag "热门"/"新" 展示在 danger-soft pill | — | mock静态 | 静态数组 `TOOLS` · `ToolsPreview.tsx:56-90` |
| TOOL-006 | ComingSoonSidebar | 全局菜单 `SidebarHeaderNav` / 收起按钮 / `SidebarAuthFooter` | 点击 | — | 这些是共享 sidebar 组件，保留全局导航/收起/登录态交互（不属本 feature 业务） | — | 共享组件 | 见 01-shell · `ComingSoonView.tsx:72-90` |

### Claw（CLAW）

| 用例ID | 页面/区域 | 元素 | 触发动作 | 前置条件 | 预期结果 | 边界/异常 | 数据/接口依赖 | 状态/备注 |
|---|---|---|---|---|---|---|---|---|
| CLAW-001 | 路由 | `/claw`（`claw/*`） | 访问 URL | — | lazy 加载 `ClawPage`，渲染 `ComingSoonView` title="智能助手" | — | 纯前端 | 真实路由，stub 页 · `features/claw/routes.tsx:5` |
| CLAW-002 | ComingSoon banner | amber banner "智能助手即将推出 · {description}" | 仅展示 | — | 静态文案：推荐文献 / 解释概念 / 调用文献集做总结 | — | 纯前端 | 静态 · `ClawPage.tsx:7` |
| CLAW-003 | ClawPreview 对话流 | 4 条硬编码气泡（2 UserMsg + 2 AIMsg） | 仅展示 | — | 渲染写死的 Mamba vs Transformer 综述示例对话 | — | mock静态 | 静态 · `ClawPreview.tsx:20-39` |
| CLAW-004 | ClawPreview 输入框 | "向智能助手提问..." input | 点击/输入 | — | **无响应**：input 本身 `disabled`，外层又 `pointer-events-none` | 双重禁用 | mock静态 | 静态 · `ClawPreview.tsx:45-50` + `ComingSoonView.tsx:54` |
| CLAW-005 | ComingSoonSidebar | 同 TOOL-006 | 点击 | — | 共享 sidebar 交互保留 | — | 共享组件 | 见 01-shell |

### 认证（AUTH）

> AuthDialog 由 `useAuthDialog` store 驱动（`open` / `mode` / `initialAccountType` / `setMode` / `close`）。`AccountType = 'email' | 'phone'`，`LoginCredentialType = 'password' | 'code'`。校验全部 zod + react-hook-form（Login/Register/Forgot）；Settings 页是裸 useState（见 SET 表）。

#### 校验规则（从代码直接提取，三表单共用）

- 邮箱 `emailRule`：`min(1,'请输入邮箱')` + `.email('邮箱格式有误…(如 user@example.com)')`
- 手机号 `phoneRule`：`min(1,'请输入手机号')` + `regex(/^1[3-9]\d{9}$/,'请输入 11 位中国手机号(如 13812345678)')`
- 验证码 `codeRule`：Login=`length(6,'验证码为 6 位数字')`；Register/Forgot=`length(6,…).regex(/^\d{6}$/,'验证码为 6 位数字')`
- 密码 Login：`z.string().min(1,'请输入密码')`；Register/Forgot `passwordRule`：`min(8,'密码至少 8 位,建议含字母和数字').max(64,'密码长度不能超过 64 位')`
- 同意条款 Register：`z.literal(true,{...'请勾选同意用户协议和隐私政策'})`

| 用例ID | 页面/区域 | 元素 | 触发动作 | 前置条件 | 预期结果 | 边界/异常 | 数据/接口依赖 | 状态/备注 |
|---|---|---|---|---|---|---|---|---|
| **AUTH-001** | AuthDialog 壳 | Dialog 容器 | `useAuthDialog().open()` 任意触发 | store open=true | 渲染弹窗，标题/描述按 mode 取 `TITLES`（login=欢迎回来 / register=创建账号 / forgot=找回密码 / wechat-qr=使用微信扫一扫） | — | `auth-dialog.store` | 真实 · `AuthDialog.tsx:17,34-40` |
| AUTH-002 | AuthDialog 壳 | 遮罩/Esc 关闭 | `onOpenChange(false)` | 弹窗已开 | 调 `close()` 关闭弹窗 | — | `auth-dialog.store` | 真实 · `AuthDialog.tsx:40` |
| AUTH-003 | AuthDialog 壳 | 左上返回箭头（仅 wechat-qr） | 点击 | mode='wechat-qr' | `setMode('login')` 切回登录表单 | 非 wechat-qr 模式不渲染该箭头 | 纯前端 | 真实 · `AuthDialog.tsx:44-53` |
| **AUTH-004** | LoginForm | 账号类型 tab（邮箱/手机号 `AccountTypeTabs`） | 点击 | mode=login | `setAccountType` 切换，输入框 label/type/placeholder 随之变、zod schema 重建 | — | 纯前端 | 真实 · `LoginForm.tsx:103`、`AccountTypeTabs.tsx` |
| AUTH-005 | LoginForm | "使用验证码登录 / 使用密码登录" 切换 | 点击 | mode=login | `setCredType` 在 password↔code 间切换，secret 字段改渲染（密码框 / 验证码框+发码按钮） | — | 纯前端 | 真实 · `LoginForm.tsx:105-111` |
| AUTH-006 | LoginForm | 账号输入框（account） | 输入+提交 | — | 邮箱按 `emailRule`、手机按 `phoneRule` 校验，失败显示 `FormMessage` | 空/格式错→对应 zod 文案 | 纯前端校验 | 真实 · `LoginForm.tsx:29-33,115-134` |
| AUTH-007 | LoginForm | 密码输入框（credType=password） | 输入+提交 | — | `min(1,'请输入密码')` | 空→"请输入密码"（注意 placeholder 写"至少 8 位"但登录不校验 8 位） | 纯前端校验 | 真实 · `LoginForm.tsx:40,142-151` |
| AUTH-008 | LoginForm | 验证码框（credType=code） | 输入+提交 | — | `length(6)` 校验，`maxLength=6 inputMode=numeric` | 非 6 位→"验证码为 6 位数字" | 纯前端校验 | 真实 · `LoginForm.tsx:34,153-170` |
| AUTH-009 | LoginForm | `SendCodeButton`（code 模式） | 点击 | account 字段校验通过且非空 | 调 `/user/send-code`(email)或`/user/send-phone-code`(phone) `{purpose:'login'}`→toast"验证码已发送"→60s 倒计时 | account 校验未过→不发；account 空→toast"请先输入邮箱/手机号…"；失败→toast 错误；倒计时中按钮 disabled 显示 `{n}s` | `useSendEmailCode`/`useSendPhoneCode` | 真实 · `LoginForm.tsx:164-169`、`SendCodeButton.tsx:36-57` |
| AUTH-010 | LoginForm | `TurnstileField` | 完成人机校验 | `enable_turnstile && turnstile_site_key` | 渲染 Cloudflare Turnstile，成功回传 token；关闭时不渲染、token=null | 加载中渲染 65px 占位；error/expire→token=null；管理员关后自动归位 | `usePublicConfig` | 真实 · `LoginForm.tsx:178`、`TurnstileField.tsx` |
| **AUTH-011** | LoginForm | 提交按钮"登录" | 点击/回车 | 表单校验通过 | 按 (account×cred) 4 选 1 调 mutation→成功 toast"登录成功"+`close()`+全量 invalidate | turnstileBlocked（开了但无 token）→按钮 disabled title"请先完成人机验证"；pending→禁用显"登录中…"；失败→toast(err.message 或"登录失败,请检查网络后重试") | `useLoginEmailPassword`/`useLoginPhonePassword`/`useLoginEmailCode`/`useLoginPhoneCode` | 真实 · `LoginForm.tsx:78-97,180-188`、`auth.ts:94-161` |
| AUTH-012 | LoginForm | "忘记密码?" 链接 | 点击 | mode=login | `onSwitchMode('forgot')`→切到 ForgotPasswordForm | — | 纯前端 | 真实 · `LoginForm.tsx:215-221` |
| AUTH-013 | LoginForm | "还没有账号? 立即注册" | 点击 | mode=login | `onSwitchMode('register')`→切到 RegisterForm | — | 纯前端 | 真实 · `LoginForm.tsx:222-228` |
| AUTH-014 | LoginForm | 服务条款 / 隐私政策链接 | 点击 | — | 新标签打开 `/terms`、`/privacy`（`target=_blank`）。登录隐式同意，无 checkbox | — | 纯前端 | 真实 · `LoginForm.tsx:193-212` |
| **AUTH-015** | RegisterForm | 账号类型 tab | 点击 | mode=register | `setAccountType` 切换，schema 重建 | — | 纯前端 | 真实 · `RegisterForm.tsx:114` |
| AUTH-016 | RegisterForm | 账号输入框 | 输入+提交 | — | email/phone 按对应 rule 校验 | 空/格式错→zod 文案 | 纯前端校验 | 真实 · `RegisterForm.tsx:116-134` |
| AUTH-017 | RegisterForm | 验证码框 + `SendCodeButton` | 输入/点击 | account 校验通过 | 校验 `length(6).regex(/^\d{6}$/)`；发码 `purpose:'register'` | 同 AUTH-009 异常 | `useSendEmailCode`/`useSendPhoneCode` | 真实 · `RegisterForm.tsx:136-163` |
| AUTH-018 | RegisterForm | 密码框 | 输入+提交 | — | `passwordRule` min8/max64 校验 | <8→"密码至少 8 位…"；>64→"密码长度不能超过 64 位" | 纯前端校验 | 真实 · `RegisterForm.tsx:31,165-183` |
| AUTH-019 | RegisterForm | 邀请码框（可选） | 输入 | — | `z.string().optional()`，空字符串提交时转 undefined | 不校验 | 纯前端 | 真实 · `RegisterForm.tsx:38,91,185-200` |
| AUTH-020 | RegisterForm | 同意条款 Checkbox | 勾选+提交 | — | 未勾选→`z.literal(true)` 校验失败 | 未勾→"请勾选同意用户协议和隐私政策" | 纯前端校验 | 真实 · `RegisterForm.tsx:39-41,202-229` |
| AUTH-021 | RegisterForm | `TurnstileField` | 同 AUTH-010 | — | 同 AUTH-010 | 同 AUTH-010 | `usePublicConfig` | 真实 · `RegisterForm.tsx:232` |
| **AUTH-022** | RegisterForm | 提交按钮"注册并登录" | 点击 | 表单校验通过 | email→`/user/register`，phone→`/user/register-phone`→`handleAuthSuccess`→toast"注册成功,欢迎加入 Scholay~"+`close()` | turnstileBlocked→disabled；pending→"注册中…"；失败→toast(err.message 或"注册失败,请检查网络后重试") | `useRegisterEmail`/`useRegisterPhone` | 真实 · `RegisterForm.tsx:83-109,234-242`、`auth.ts:167-213` |
| AUTH-023 | RegisterForm | "返回登录" | 点击 | mode=register | `onSwitchMode('login')` | — | 纯前端 | 真实 · `RegisterForm.tsx:244-253` |
| **AUTH-024** | ForgotPasswordForm | 账号类型 tab / 账号框 | 切换/输入 | mode=forgot | 同 email/phone 校验 | zod 文案 | 纯前端校验 | 真实 · `ForgotPasswordForm.tsx:86-105` |
| AUTH-025 | ForgotPasswordForm | 验证码框 + `SendCodeButton` | 输入/点击 | account 校验通过 | `length(6).regex`；发码 `purpose:'reset_password'` | 同 AUTH-009 | `useSendEmailCode`/`useSendPhoneCode` | 真实 · `ForgotPasswordForm.tsx:107-133` |
| AUTH-026 | ForgotPasswordForm | 新密码框 | 输入+提交 | — | `passwordRule` min8/max64 | <8 / >64→zod 文案 | 纯前端校验 | 真实 · `ForgotPasswordForm.tsx:135-153` |
| **AUTH-027** | ForgotPasswordForm | 提交按钮"重置密码" | 点击 | 校验通过 | email→`/user/reset-password`，phone→`/user/reset-password-phone`→成功 toast"密码已重置,请使用新密码登录"→`onSwitchMode('login')`（**不自动登录**） | pending→"重置中…"；失败→toast(err.message 或"重置失败,请稍后重试") | `useResetPasswordEmail`/`useResetPasswordPhone` | 真实 · `ForgotPasswordForm.tsx:61-81,155-157`、`auth.ts:219-242` |
| AUTH-028 | ForgotPasswordForm | "返回登录" | 点击 | — | `onSwitchMode('login')` | — | 纯前端 | 真实 · `ForgotPasswordForm.tsx:159-168` |
| **AUTH-029** | OAuthRow | provider 按钮组 | 渲染 | — | 仅渲染 `useEnabledProviders()` 返回的 provider（管理员开关）；空数组→整组不渲染 | providers.length===0→`return null` | `useEnabledProviders`(`usePublicConfig`) | 真实 · `OAuthRow.tsx:42,62-87` |
| AUTH-030 | OAuthRow | GitHub/ORCID/Microsoft/Discourse 按钮 | 点击 | provider 已启用 | `GET /user/<x>/login-url`→`window.location.href=url` 整页跳转 | url 为空→toast"{label} 登录暂未开通…"；请求失败→toast(err.message) | `http.get`（裸调，OAuth 入口） | 真实 · `OAuthRow.tsx:46-60,72-86` |
| AUTH-031 | OAuthRow | Apple 按钮 | 点击 | apple 已启用 | `GET /user/apple/login-url`→整页跳转 | 同 AUTH-030 | `http.get` | 真实 · `OAuthRow.tsx:36,46-60` |
| AUTH-032 | OAuthRow | 微信按钮 | 点击 | wechat 已启用 | `setMode('wechat-qr')`→AuthDialog 原地切换扫码面板（无整页跳转、无 url 请求） | — | `auth-dialog.store` | 真实 · `OAuthRow.tsx:35,73` |
| AUTH-033 | OAuthRow | Google 按钮（GIS） | 点击 | google_client_id 存在 | 渲染 GIS 官方 icon 按钮；授权后回调 `POST /user/google/id-token-login {id_token}`→`handleAuthSuccess`+toast"登录成功" | clientId 缺→不渲染(`return null`)；GIS 脚本加载失败→静默(不弹 toast)；登录失败→toast"Google 登录失败,请稍后重试" | `usePublicConfig`(google_client_id) + `http.post` | 真实 · `GoogleSignInButton.tsx:70-130` |
| **AUTH-034** | WeChatQRPanel | 二维码 iframe | mode='login' 加载 | wechat 配置存在 | `GET /user/wechat/qrcode-config`→加载 wxLogin.js→注入 iframe 二维码；监听 postMessage(`scholay-wechat-callback`)→`POST /user/wechat/callback`→`handleAuthSuccess`+toast"登录成功"+`onSuccess()`(关弹窗) | app_id 空→静默不渲染；脚本/配置失败→静默(容器空白)；callback 失败→toast"微信登录失败,请稍后重试"；postMessage 跨源/形状不符→忽略 | `http.get/post`（wxLogin SDK 集成） | 真实 · `WeChatQRPanel.tsx:101-176` |
| AUTH-035 | WeChatQRPanel | 二维码 iframe（mode='bind'） | 扫码完成 | 已登录，从设置页触发 | `POST /user/bind-wechat`→失效 connections+profile query→toast"微信已成功绑定"+`onSuccess()` | 绑定失败→toast"微信绑定失败,请稍后重试" | `http.post` | 真实 · `WeChatQRPanel.tsx:114-118` |
| AUTH-036 | WeChatQRDialog | 独立绑定弹窗壳 | open=true | settings 触发 | 包 `WeChatQRPanel`（mode 由 prop）；标题随 mode "绑定微信/使用微信扫一扫"；open=false 不挂载 Panel | — | 纯前端壳 | 真实 · `WeChatQRDialog.tsx` |
| **AUTH-037** | OAuthCallbackPage | `/<provider>/callback` | 页面加载 | URL 带 code/token/merge_token | 四态：loading→正常登录(`handleAuthSuccess`+toast+navigate('/'))/`merge_required`(弹合并)/error(显错误+返回首页按钮)；bind 上下文则调 `bind-<provider>`→跳回 `/settings/connections` | `?error`→error 显 error_description；缺 code/provider→"回调参数不完整"；token 解析失败→"登录响应解析失败"；bind 中途登出→降级走登录分支 | `http.get(/user/<p>/callback)`、`handleAuthSuccess` | 真实 · `OAuthCallbackPage.tsx:68-239` |
| AUTH-038 | OAuthCallbackPage | Apple 直返 token / merge_token | 加载 | `?token=` 或 `?merge_token=` | token→直接落 session；merge_token→`merge_required`；`?bind=success/error`→绑定结果分支 | `?bind=error`→显 `?msg` 或"{provider}绑定失败" | `http`、`handleAuthSuccess` | 真实 · `OAuthCallbackPage.tsx:69-111` |
| AUTH-039 | OAuthCallbackPage | Discourse SSO 分支 | 加载 | provider=discourse | 读 `sso`+`sig`（非 code/state）→登录 `GET /user/discourse/callback?sso&sig` 或绑定 `POST /user/bind-discourse` | 缺 sso/sig→"回调参数不完整"；失败→toast/error | `http` | 真实 · `OAuthCallbackPage.tsx:117-169` |
| AUTH-040 | OAuthMergeConfirmDialog | "绑定到现有账号(推荐)" | 点击 | merge_required 且 pending-merge 拉到 | `POST /user/oauth/confirm-merge {token}`→`handleAuthSuccess`→`onDone`(toast+navigate('/')) | 失败→toast"账号合并失败,请重试"；pending→按钮 disabled | `useConfirmOAuthMerge`、`usePendingMerge` | 真实 · `OAuthMergeConfirmDialog.tsx:63-110`、`oauth-merge.ts` |
| AUTH-041 | OAuthMergeConfirmDialog | "新建一个独立账号" | 点击 | 同上 | `POST /user/oauth/cancel-merge {token}`→`handleAuthSuccess`→`onDone` | 失败→toast"操作失败,请稍后重试" | `useCancelOAuthMerge` | 真实 · `OAuthMergeConfirmDialog.tsx:71-78,113-129` |
| AUTH-042 | OAuthMergeConfirmDialog | 加载/过期态 | — | `usePendingMerge` 状态 | isLoading→"正在加载合并选项…"；isError/无 info→"链接已过期…(10 分钟内未确认会自动失效)" | `GET /pending-merge` 404→不重试(`retry:false`) | `usePendingMerge` | 真实 · `OAuthMergeConfirmDialog.tsx:41-59`、`oauth-merge.ts:24-38` |
| AUTH-043 | OAuthMergeConfirmDialog | "取消并返回首页" | 点击 | — | `window.location.href='/'` | pending 时 disabled | 纯前端 | 真实 · `OAuthMergeConfirmDialog.tsx:139-147` |
| AUTH-044 | WeChatCallbackPage | `/wechat/callback` | 加载 | URL 带 code | iframe 内→`postMessage` 给父窗(WeChatQRPanel)显"扫码成功"；独立打开→`POST /user/wechat/callback`→登录+navigate('/') | 缺 code→"未收到微信授权码,请重试扫码"；独立登录失败→"微信登录失败" | `http.post`、`handleAuthSuccess` | 真实 · `WeChatCallbackPage.tsx:33-69` |
| AUTH-045 | SendCodeButton | 倒计时态 | — | 发码成功后 | 按钮 disabled 显 `{seconds}s`，60s→0 自动恢复"获取验证码" | pending→"发送中…" disabled | `useCountdown(60)` | 真实 · `SendCodeButton.tsx:31,59-69`、`useCountdown.ts` |
| AUTH-046 | （全局）logout | `useLogout` | 调用 | 已登录 | `POST /user/logout`→`onSettled` 清 auth.store + `qc.clear()`（即使服务端失败也清本地） | 服务端失败仍清本地 | `useLogout` | 真实 · `auth.ts:249-265`（入口在 shell，非本模块组件） |

### 设置（SET）

| 用例ID | 页面/区域 | 元素 | 触发动作 | 前置条件 | 预期结果 | 边界/异常 | 数据/接口依赖 | 状态/备注 |
|---|---|---|---|---|---|---|---|---|
| **SET-001** | 路由守卫 | `/settings/*` 进入 | 访问 | — | `ensureAuthed` loader 读 `localStorage.auth_token`，有→放行 | 无 token→`redirect('/?login=required')` | localStorage | 真实 · `settings/routes.tsx:14-22` |
| SET-002 | 路由 | `/settings`（index） | 访问 | 已登录 | `<Navigate to="profile" replace/>` 重定向到个人资料 | — | 纯前端 | 真实 · `routes.tsx:31` |
| SET-003 | SettingsLayout | 左侧 3 个 NavLink（个人资料/安全/已连接账号） | 点击 | — | 路由切换，激活项 `bg-surface-2 font-semibold` | — | 纯前端 | 真实 · `SettingsLayout.tsx:24-42` |
| **SET-004** | ProfilePage | 加载态 | 进入 | — | `useProfile` isLoading→"正在加载…"；加载后回填 username/bio/avatar_url 到 useState | — | `useProfile`(`['auth','profile']`) | 真实 · `ProfilePage.tsx:13,19-25,42` |
| SET-005 | ProfilePage | 昵称输入框 | 输入 | — | 受控 useState，`maxLength=40` | — | 纯前端 | 真实 · `ProfilePage.tsx:59-65` |
| SET-006 | ProfilePage | 简介 textarea | 输入 | — | 受控，`maxLength=200`，rows=3 不可 resize | — | 纯前端 | 真实 · `ProfilePage.tsx:70-77` |
| SET-007 | ProfilePage | 头像图片地址框 | 输入 | — | 受控 useState（无 URL 校验） | 不校验格式 | 纯前端 | 真实 · `ProfilePage.tsx:82-87` |
| **SET-008** | ProfilePage | "保存"按钮 | 点击(submit) | — | `PUT /user/profile {username,bio,avatar_url}`→成功失效 `['auth','profile']`+toast"资料已保存" | pending→"保存中…" disabled；失败→toast(err.message 或"没能保存成功,请检查网络后再试") | 裸 `useMutation`+`http.put` | 真实（非表单库，无字段校验）· `ProfilePage.tsx:27-40,45-50,91-93` |
| **SET-009** | SecurityPage·改密码 | 当前/新/确认密码 3 个框 | 输入 | — | 受控 useState | — | 纯前端 | 真实 · `SecurityPage.tsx:115-135` |
| SET-010 | SecurityPage·改密码 | "修改密码"按钮 | 点击 | oldPwd && newPwd 非空 | mutationFn 内校验：两次不一致→throw"两次输入的新密码不一样…"；<8→throw"新密码至少要 8 位"；通过→`POST /user/change-password {old_password,new_password}`→清空 3 框+toast"密码已更新,下次登录请使用新密码" | 空 old/new→按钮 disabled；pending→"提交中…"；失败→toast(err.message 或"密码没能修改成功,请确认当前密码是否填对了") | 裸 `useMutation`+`http.post`（校验在 mutationFn） | 真实 · `SecurityPage.tsx:27-44,137-143` |
| **SET-011** | SecurityPage·邮箱 | 标题/当前邮箱展示 | — | `useProfile` | `hasExistingEmail`(profile.email 非空)→"换绑邮箱"，否则"绑定邮箱"；展示当前邮箱或"还没有绑定" | — | `useProfile` | 真实 · `SecurityPage.tsx:53,152-158` |
| SET-012 | SecurityPage·邮箱 | 旧邮箱验证码框 + SendCodeButton（仅换绑） | 输入/点击 | hasExistingEmail | 仅已绑场景渲染；发码 `account=profile.email purpose='change_email' validate=()=>true` | — | `SendCodeButton`(email) | 真实 · `SecurityPage.tsx:162-178` |
| SET-013 | SecurityPage·邮箱 | 新邮箱框 + 新邮箱验证码 + SendCodeButton | 输入/点击 | — | 发码 `account=newEmail purpose='bind' validate=()=>/\S+@\S+\.\S+/.test(newEmail)` | 新邮箱不含 @ 格式→不发码 | `SendCodeButton`(email) | 真实 · `SecurityPage.tsx:181-203` |
| **SET-014** | SecurityPage·邮箱 | "绑定邮箱/换绑邮箱"按钮 | 点击 | — | `POST /user/bind-email {email,code,old_email_code?}`→失效 profile+connections+toast"邮箱已更新"，清空框 | disabled 条件：pending‖!newEmail‖!emailCode‖(hasExistingEmail&&!oldEmailCode)；失败→toast(err 或"邮箱换绑没成功,请稍后重试") | 裸 `useMutation`+`http.post` | 真实 · `SecurityPage.tsx:55-76,204-221` |
| SET-015 | SecurityPage·手机 | 标题/当前手机展示 | — | `useProfile` | `hasExistingPhone`→"换绑手机号"否则"绑定手机号"；展示当前手机或"还没有绑定" | — | `useProfile` | 真实 · `SecurityPage.tsx:82,229-235` |
| SET-016 | SecurityPage·手机 | 旧手机验证码 + SendCodeButton（仅换绑） | 输入/点击 | hasExistingPhone | 发码 `account=profile.phone purpose='change_phone' validate=()=>true` | — | `SendCodeButton`(phone) | 真实 · `SecurityPage.tsx:239-256` |
| SET-017 | SecurityPage·手机 | 新手机框 + 验证码 + SendCodeButton | 输入/点击 | — | 发码 `account=newPhone purpose='bind' validate=()=>/^1[3-9]\d{9}$/.test(newPhone)` | 新手机非 11 位中国号→不发码 | `SendCodeButton`(phone) | 真实 · `SecurityPage.tsx:258-280` |
| **SET-018** | SecurityPage·手机 | "绑定/换绑手机号"按钮 | 点击 | — | `POST /user/bind-phone {phone,code,old_phone_code?}`→失效 profile+connections+toast"手机号已更新"，清空 | disabled：pending‖!newPhone‖!phoneCode‖(hasExistingPhone&&!oldPhoneCode)；失败→toast(err 或"手机号换绑没成功,请稍后重试") | 裸 `useMutation`+`http.post` | 真实 · `SecurityPage.tsx:84-105,281-298` |
| **SET-019** | ConnectionsPage | 加载/计数 | 进入 | — | isLoading→spinner；展示 `login_methods_count` "种登录方式" | data 为空→`return null` | `useUserConnections`(`['settings','connections']`) | 真实 · `ConnectionsPage.tsx:75,82-89,150-156`、`connections.ts:30-39` |
| SET-020 | ConnectionsPage | provider 行可见性过滤 | — | — | email/phone 总显示；第三方仅 `enabledProviders.includes` 或已 `bound` 才显示 | — | `useEnabledProviders` | 真实 · `ConnectionsPage.tsx:93-96` |
| SET-021 | ConnectionsPage | 已绑行 状态展示 | — | c.bound | 显示绿 CheckCircle + display_name/provider_user_id/"已绑定" + "· 绑定于 {created_at}" | — | 数据展示 | 真实 · `ConnectionsPage.tsx:182-195` |
| **SET-022** | ConnectionsPage | "绑定"按钮（未绑第三方） | 点击 | !bound | github/google/microsoft/orcid/discourse→`useStartBindingProvider`(写 sessionStorage 标记 + 跳 login-url)；apple→`GET /user/apple/bind-url` 跳转；wechat→打开 `WeChatQRDialog` mode='bind' | 已绑再点→toast"…已经绑定过了…"；email/phone→toast"邮箱和手机号请到「安全设置」里修改"；url 空→throw/toast；startBind.isPending→disabled | `useStartBindingProvider` | 真实 · `ConnectionsPage.tsx:98-119,209-218`、`connections.ts:81-118` |
| **SET-023** | ConnectionsPage | "解绑"按钮（已绑第三方） | 点击 | bound | `useConfirm` 弹确认("解绑{label}?"…danger)→确认后 `POST /user/unbind-<provider>`→toast"{label} 已解绑"+失效 connections+profile | lastMethod(count<=1)→按钮 disabled+title"…不能解绑"且点击 toast"这是你最后一种登录方式…"；email/phone→toast"…请到「安全设置」里解绑(需要验证码)"；取消确认→不操作；失败→toast"解绑失败,请稍后重试" | `useUnbindProvider`、`useConfirm` | 真实 · `ConnectionsPage.tsx:121-145,197-207`、`connections.ts:45-60` |
| SET-024 | ConnectionsPage | WeChatQRDialog（绑定） | 触发 | 点微信"绑定" | `setWechatBindOpen(true)` 打开 mode='bind' 弹窗，扫码走 AUTH-035 | — | `WeChatQRDialog` | 真实 · `ConnectionsPage.tsx:108-111,225-229` |
