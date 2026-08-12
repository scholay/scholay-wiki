# Scholay Wiki 前端页面与功能审计

> 审计基线：`scholay-wiki` 分支创建点 `f23d0003`（与当时 `origin/main` 一致）。
> 审计范围：`frontend-user/` 的桌面端、移动端、公开落地页与 `/admin` 产品面。正在建设的 `features/wiki/` 不作为“现有产品能力”的来源。
> 本文描述的是前端实际暴露的入口、交互与约束；涉及计费、权限、数据完整性的最终事实仍须以后端审计为准。

## 1. 阅读方法与角色口径

- **访客**：无登录态也能进入或读取；某些写动作会在点击时弹出登录。
- **登录用户**：任意有效用户 token；并不等于有额度或付费会员。
- **Free / Pro / Max**：会员等级。AI 功能通常同时受会员额度、模型可选范围、全局计费开关与余额影响。
- **operations / admin / super_admin**：后台角色。`operations` 只有查看用户、内容运营、分析权限；`admin` 除角色任命外拥有大部分权限；`super_admin` 额外拥有角色任命及全部权限。
- **路由鉴权与动作鉴权不同**：搜索、Claw、Prism 等页面常允许访客进入，但真正发送、收藏、保存时再登录；设置、文库、同行评审和后台则有页面级保护。
- **营销描述不是上线事实**：`features/*`、`pricing` 等落地页的文案在本文单独标注，不能直接转写为功能说明。

主要入口来源：

- 总路由：`frontend-user/src/app/router.tsx`
- 桌面壳：`frontend-user/src/app/layouts/AppShell.tsx`
- 移动壳：`frontend-user/src/app/layouts/MobileShell.tsx`
- 应用 Provider：`frontend-user/src/app/App.tsx`
- 顶部导航：`frontend-user/src/app/components/TopNav.tsx`、`frontend-user/src/app/components/TopMenu.tsx`
- 后台路由与导航：`frontend-user/src/features/admin/routes.tsx`、`nav.ts`、`permissions.ts`

## 2. 全站入口、壳层与导航

| 页面/入口 | 路由 | 角色 | 可见功能与状态 | 主要源码与依赖 |
|---|---|---|---|---|
| 首页 | `/` | 访客 | 论文/期刊/作者联想搜索；经典搜索可直接跳转，智能搜索在动作时要求登录；展示新闻与页脚。 | `src/features/home/HomePage.tsx`，`shared/components/SearchAutocomplete.tsx`，`shared/api/quick-search.ts`、`news.ts` |
| 桌面主壳 | 除独立入口外的 `/...` | 访客 | 顶部导航、侧栏、登录/注册、消息、邀请、活动弹窗、额度提示、全局分享与收藏夹选择器。宽屏/紧凑导航随视口切换。 | `src/app/layouts/AppShell.tsx`，`app/components/*`，`shared/components/NotificationBell.tsx`、`PromoModalGate.tsx`、`QuotaNotifierGate.tsx` |
| 移动主壳 | `/m/*` | 访客 | 底栏四项：浏览、Claw、工具、我的；全局搜索、分享与登录 Sheet；路由切换保留 Feed 状态。 | `src/app/layouts/MobileShell.tsx`，`features/mobile/*`，`stores/mobile-search.store.ts`、`share.store.ts` |
| 公开分享页 | `/s/:token` | 访客 | 接收论文集合、单篇论文或期刊分享；可受提取码、有效期与“允许保存”控制。 | `features/library/pages/SharedReceivePage.tsx`，`shared/api/library-share.ts`、`library-browse.ts` |
| 小程序图表页 | `/mp/diagram` | 访客/嵌入端 | 在小程序 WebView 中展示图表；不挂全站弹窗与普通导航。 | `features/claw/pages/mobile/MpDiagramPage.tsx` |
| 路由 SEO/错误态 | 全站 | 访客 | 路由元信息、加载失败边界、页面提交 watchdog、统一空态/加载态/资源错误。 | `shared/components/RouteSEO.tsx`、`RouteErrorBoundary.tsx`、`RouteCommitWatchdog.tsx`、`EmptyState.tsx`、`LoadingState.tsx`、`ResourceError.tsx` |

桌面顶部“产品”菜单共七个主要入口：论文检索 `/search`、期刊检索 `/journals/search`、Claw `/claw`、Prism `/prism`、同行评审 `/peer-review`、文库 `/library`、工具 `/tools`。菜单按检索、AI、资源分类。邀请入口与促销弹窗是两套独立配置。

设备路由规则：手机 UA 访问部分桌面入口会映射到 `/m/*`；桌面 UA 访问 `/m/*` 会回到对应桌面入口。并非所有功能都有移动实现：Prism、同行评审、矩阵分析等在移动端主要显示“请在电脑使用”的引导。

### 2.1 兼容跳转与已废弃入口

- `/search-results`、`/advanced-search` 转到 `/search`；旧论文/作者 slug 入口回首页。
- `/latex-writer` 转到 `/prism`，`/features/latex-writer` 转到 `/features/prism`。
- `/assistant`、`/chat` 转到 `/claw`；`/peer-review-v2` 转到 `/peer-review`。
- `/skills` 转到 `/tools/skills`；`/qa` 转到 `/help`，但 `/qa/:slug` 仍保留详情页。
- 后台旧入口 `code-snippets`、`usage-logs`、`promo-config`、`third-party`、`agent-config`、`wechat-miniprogram` 均重定向到新的聚合页。

### 2.2 路由计数（可复核口径）

按“能渲染独立页面的 URL pattern”计数，不把父壳、index redirect、`*` 404 和纯兼容 redirect 算成产品页：

| 区域 | 现行产品 URL pattern | 另有兼容/索引 redirect | 说明 |
|---|---:|---:|---|
| 桌面与公开用户面 | **71** | **13** | 71 包含首页、独立 landing/help/share/embed/callback 与 AppShell 业务页；13 是 10 个历史用户路径、`features/latex-writer`、`qa`、`skills`。不含正在新增的 Wiki。 |
| 移动 `/m` | **18** | **2** | 产品页含 Feed 3、工具 4、Claw 2、文库 2、我的/设置 6、认证 1；`/m` 与 `/m/search` 是 redirect。 |
| 后台 `/admin` | **31** | **14** | 31 个实际后台页面；6 个后台内部旧路径 redirect，另有 8 个更早的后台顶层兼容路径。 |

若只看当前 route object 的可匹配 pattern，总计是 **149**（120 个产品页面 + 29 个 redirect），另有桌面 `*` 404；这个总数不含正在建设的 Wiki 路由。数组生成的 4 个期刊榜单和 6 个 OAuth callback 按实际 URL 各计一次。

## 3. 账户、认证与用户设置

### 3.1 登录、注册、找回与 OAuth

| 页面/功能 | 路由 | 角色 | 动作、状态与限制 | 主要源码与依赖 |
|---|---|---|---|---|
| 桌面认证弹窗 | 任意桌面页动作触发 | 访客 | 登录、注册、忘记密码、微信二维码；邮箱或手机号；密码或验证码；同意条款。失败保留表单并展示服务端消息。 | `features/auth/components/AuthDialog.tsx` 及其子组件，`stores/auth-dialog.store.ts`，`features/auth/api/auth.ts`、`public-config.ts` |
| 移动认证页/Sheet | `/m/auth` 或动作触发 | 访客 | 邮箱/手机登录注册与重置；不提供桌面二维码面板。 | `features/auth/pages/mobile/MobileAuthPage.tsx`，`features/auth/routes.tsx` |
| OAuth 回调 | `/github/callback`、`/google/callback`、`/apple/callback`、`/orcid/callback`、`/microsoft/callback`、`/discourse/callback` | 访客 | 按公开配置启用；换取站内 token，错误时回到认证入口。 | `features/auth/pages/OAuthCallbackPage.tsx`，`api/auth.ts` |
| 微信回调 | `/wechat/callback` | 访客 | 独立于普通 AppShell，处理微信扫码/网页授权回调。 | `features/auth/pages/WeChatCallbackPage.tsx` |
| 账号合并 | OAuth 邮箱冲突时 | 访客 | 要求先用目标账号登录，再确认或取消合并。 | `features/auth/components/OAuthMergeConfirmDialog.tsx`，`api/oauth-merge.ts` |

认证规则：

- 注册密码前端限制 8–64 位；验证码为 6 位。重置密码同样要求 8–64 位。
- 邮箱路径和手机验证码路径接入 Turnstile；实际是否必填来自公开配置。
- 发送验证码有 60 秒倒计时。注册必须勾选服务条款和隐私政策。
- 可配置的 OAuth 提供方实际是 7 个：GitHub、Google、WeChat、Apple、ORCID、Microsoft、Discourse；个别源码注释中“8 个”是陈旧口径。
- 启动时 `auth.store.ts` 用本地 token 拉取 profile；过期、撤销或角色失效会清空会话并提示。普通用户回登录，后台入口回站点。
- 邀请码候选会跨认证流程暂存；新用户注册后尝试自动绑定，老用户仍需经过资格、有效期、重复绑定等校验。

### 3.2 设置与资产

| 页面 | 路由 | 角色 | 可见功能与限制 | 主要源码与依赖 |
|---|---|---|---|---|
| 设置壳 | `/settings/*` | 登录用户；loader 保护 | 左侧个人资料、会员资产、邀请、安全、账号连接；根路径转到 profile。 | `features/settings/routes.tsx`、`pages/SettingsLayout.tsx` |
| 个人资料 | `/settings/profile`；移动 `/m/me/profile` | 登录用户 | 修改昵称（最多 40）、简介（最多 200）、头像 URL；加载/保存/失败态。 | `pages/ProfilePage.tsx`、`pages/mobile/MobileProfilePage.tsx`，`features/auth/api/profile.ts`、`shared/api/profile.ts` |
| 会员与资产 | `/settings/membership`；移动 `/m/me/billing` | 登录用户 | 当前等级、到期日、周期额度、credit 余额；订阅/续费/升级、充值、兑换码、流水；邀请赚取为待建设提示。 | `pages/MembershipPage.tsx`、`pages/mobile/MobileBillingPage.tsx`，`api/membership.ts`，`shared/api/membership.ts`，`shared/components/subscribe-dialog.tsx`、`wechat-pay-dialog.tsx` |
| 邀请 | `/settings/invite`；移动 `/m/me/invite` | 登录用户且活动启用 | 邀请码/链接/海报/二维码、绑定候选、奖励与统计；入口是否显示由活动配置决定。 | `pages/InvitePage.tsx`、`pages/mobile/MobileInvitePage.tsx`，`api/invite.ts`，`shared/api/user-invite.ts`、`invite-campaign.ts` |
| 安全 | `/settings/security`；移动 `/m/me/security` | 登录用户 | 改密码（前端最少 8 位）、换绑邮箱/手机；旧、新地址验证码流程；无直接“解绑所有方式”。 | `pages/SecurityPage.tsx`、`pages/mobile/MobileSecurityPage.tsx`，`features/auth/api/profile.ts` |
| 账号连接 | `/settings/connections`；移动 `/m/me/connections` | 登录用户 | 绑定/解绑邮箱、手机和启用的 OAuth；至少保留一种可登录方式。 | `pages/ConnectionsPage.tsx`、`pages/mobile/MobileConnectionsPage.tsx`，`api/connections.ts` |
| 移动“我的” | `/m/me` | 访客/登录用户 | 未登录展示认证入口；登录后展示资料、会员资产、邀请、安全、连接与退出。 | `pages/mobile/MobileMePage.tsx` |

会员/计费在前端的真实表现：

- 会员等级由后端计划配置驱动；Free、Pro、Max 共享一种永久 credit 资产，周期额度按点数展示为百分比。
- Free 的体验周期从首次使用开始，默认 7 天；周期额度不结转。管理员可发“重置券/重置次数”触发人工重置。
- 余额自动补足默认关闭，必须由用户明确开启；只有支持超额消费的场景才会从 credit 折算点数。
- 订阅是一次性购买，没有自动续费。相同等级为续期；升级按剩余价值折算且通常保持原到期日/周期锁；降级按钮禁用。
- 支付方式由动态配置决定：支付宝、微信 Native/H5/JSAPI；微信内/外与桌面展示不同入口。支付返回只接受站内约定的 localStorage 状态，不盲目信任 URL。
- 兑换码可发会员或 credit，期限单位支持天/月/年；具体生效值以后端响应为准。

## 4. 检索、浏览与期刊

### 4.1 论文检索与矩阵工作台

| 页面/模式 | 路由 | 角色 | 动作、状态与限制 | 主要源码与依赖 |
|---|---|---|---|---|
| 论文检索 | `/search` | 访客可读；收藏/AI/持久化动作需登录 | URL 持久化查询、模式、筛选与分页；经典/智能两种模式。最近查询写入 `scholay.last-search`。左侧结果与右侧工作台可拖拽，宽度 380–900，矩阵模式至少 480。 | `features/search/routes.tsx`、`pages/SearchPage.tsx`、`hooks/useUrlFilters.ts`、`useSearcherUrlState.ts` |
| 经典检索 | `/search?mode=classic` | 访客 | 数据源 Auto/STC/OpenAlex/PubMed；Auto 依次尝试 STC→OpenAlex→PubMed。查询为空、加载、错误、无结果均有独立状态。 | `features/search/api/papers.ts`、`components/*Search*` |
| 暂存区 | 检索页右侧 | 访客本地；登录后部分动作同步 | A–E 五个固定暂存区；每区最多 100 篇；添加、移除、折叠、恢复、当前页全选。 | `stores/staging-areas.store.ts`、`staging-ui.store.ts`，`api/staging-areas.ts`，`hooks/useStagingActions.ts`、`useStagingSync.ts` |
| 分析矩阵 | 检索页右侧 | 登录用户且有额度 | 默认维度、用户维度增删改排序/恢复；逐篇 AI 分析、失败重试；CSV/Markdown/XLSX 导出；可从当前结果导入或空白开始；清空需确认。 | `features/search/api/analysis/matrix.ts`、`analysis/dimensions.ts`、`components/matrix/*` |
| 智能检索 | `/search?mode=smart` | 页面可访客进入，发送需登录及额度 | 多会话、新建/重命名/删除；模型、附件、文库引用；停止、失败重试、阻断后重发；论文结果可继续暂存/收藏。 | `api/smart-search.ts`，`stores/smart-search-session.store.ts`，`shared/components/chat/*` |

经典检索规则：

- 每页 20 或 50 条，结果最多访问前 1000 条。
- 时间：全部、近 1/3/5 年、自定义；另有 23 个学科、文献类型、开放获取与排序。
- STC/Auto 只允许相关性排序；OpenAlex 支持相关性、引用数、最新、最早；PubMed 支持相关性、最新。
- PubMed 隐藏学科、类型、开放获取和最低引用；OpenAlex 学科单选；不同数据源的文献类型选项不同。
- 状态模型中存在 `minCitations`，但未找到对应可见控件；`venues` 也没有稳定的 UI 入口，见 coverage gaps。
- 智能会话默认取 100 条历史、DOM 先渲染约 60 条再增量；停止等待 20 秒兜底，发送 ack 约 10 秒超时；繁忙会话禁止新发。WebSocket 被另一标签页占用时显示 displaced banner。

### 4.2 论文、作者、期刊与 PDF 浏览器

| 页面 | 路由 | 角色 | 可见功能与状态 | 主要源码与依赖 |
|---|---|---|---|---|
| 论文详情 | `/paper/:source/:paperId` | 访客可读；收藏/私有资源需登录 | 标题、最多 12 位作者、摘要、年份、来源、DOI、引用/影响、原文链接；收藏到文件夹、取消收藏、翻译、引用、开放获取。私有文库版本还可读上传 PDF 与编辑元数据。 | `features/browser/pages/BrowserPage.tsx`、`components/PaperDetailPane.tsx`，`shared/api/paper-detail.ts`、`paper-enrich.ts`，`browser/api/open-access.ts` |
| 作者详情 | `/author/:source/:authorId` | 访客 | 统计、研究主题、年度曲线、Top 5 作品、Top 8 合作者；加载、空数据和错误态。 | `features/browser/components/AuthorDetailPane.tsx`，`shared/api/authors.ts` |
| 期刊详情 | `/journal/:id`、`/journal/:id/:slug` | 访客 | 基本元数据、ISSN、来源站、复制/分享、质量/OA/预警徽章、指标分组、趋势、投稿资源。 | `features/browser/components/JournalDetailPane.tsx`，`shared/api/journals.ts`、`journal-enrichment.ts`，`shared/components/Journal*` |
| 私有 PDF 阅读 | `/pdf/:libPaperId` | 登录用户且拥有文库记录 | 单页/连续/双页、缩放、适宽/适高；无 PDF、解析失败、加载错误状态。 | `shared/components/PdfViewer.tsx`、`pdf-viewer/*`，`features/library/api/pdf.ts` |

浏览器标签存储于 `stores/browser-tabs.store.ts`，支持 paper/journal/author/pdf 四种标签，最多 30 个；超限淘汰最早且非当前的标签。收藏要求登录，未登录动作写入 `pending-action.store.ts` 后唤起登录。已收藏论文再次收藏不会自动移动文件夹；取消收藏是破坏性动作，会连同用户上传 PDF 与本地编辑信息删除。

引用弹窗支持五种格式；单击切换当前格式，双击设为默认。论文讨论区仅有“即将上线”提示。开放获取通过 DOI 调用 Unpaywall 类接口，失败时回退原文链接。

### 4.3 期刊检索、榜单与目录

| 页面 | 路由 | 角色 | 功能与规则 | 主要源码与依赖 |
|---|---|---|---|---|
| 期刊检索 | `/journals/search` | 访客 | 默认质量榜；CAS 1–4、JCR Q1–Q4、IF ≥5/10/20/30、CCF A/B/C、出版社等筛选；每页 8。 | `features/journals/pages/JournalSearchPage.tsx`、`api/journals.ts`、`hooks/useJournalUrlFilters.ts` |
| SEO 榜单 | `/journals/sci-q1`、`cas-zone1`、`ccf-a`、`high-impact-factor` | 访客 | 四个预设集合页；卡片展示指标、分区、预警、OA、出版社/国家与投稿资料。 | `pages/JournalCollectionPage.tsx` |
| 期刊目录首页 | `/journals/browse` | 访客 | 分类、国家、预警、OA 入口及最近更新的 20 本期刊。 | `pages/JournalHubBrowsePage.tsx`、`api/journal-hubs.ts` |
| 期刊目录列表 | `/journals/category/:slug/:page?`、`country/:cc/:page?`、`warning`、`oa/:page?` | 访客 | 服务端目录，每页 50，分页；无结果与 API 错误有独立提示。 | `pages/JournalHubListPage.tsx` |

期刊详情中的“投稿资源”只有 Max 用户可下载写作指南 Markdown 与 LaTeX zip；非 Max 会看到价格/升级入口。指标、趋势和完整元数据是否出现取决于 enrichment 数据。预警重点展示近两年记录。当前没有可靠的“收藏期刊”动作，部分注释/旧 API 命名不能当作已上线能力。

## 5. 文库、分享与引用生成器

| 页面/功能 | 路由 | 角色 | 动作、状态与限制 | 主要源码与依赖 |
|---|---|---|---|---|
| 桌面文库 | `/library` | 登录用户；未登录显示登录/注册空态 | 单层文件夹、默认文件夹、列表/分页、搜索、排序；选择当前页、批量移动/删除；打开论文/PDF；创建分享。 | `features/library/pages/LibraryPage.tsx`、`api/folders.ts`、`papers.ts`，`hooks/useLibrarySelection.ts` |
| PDF 与元数据工作台 | 文库内 | 登录用户 | 添加检索结果或本地 PDF；编辑元数据；重新关联；SSE 解析 PDF 后人工确认。Zotero/EndNote 导入只显示“即将上线”。 | `api/pdf.ts`、`relink.ts`、`upload-resolve.ts`，`hooks/useMetadataForm.ts` |
| 移动文库 | `/m/library`、`/m/library/:folderId` | 登录用户；未登录转“我的” | 文件夹列表、创建、无限滚动、下拉刷新、搜索/排序、富化、分享、引用、取消收藏。 | `pages/mobile/MobileLibraryPage.tsx`、`MobileFolderPage.tsx` |
| 接收分享 | `/s/:token` | 访客；保存需登录且分享方允许 | 集合、单篇、期刊三种载荷；提取码、过期、已撤销、无权限、空集合状态；集合按引用量排序，可去重保存。 | `pages/SharedReceivePage.tsx`，`shared/api/library-share.ts`、`library-browse.ts` |
| 引用生成器 | `/citation-generator` | 访客 | DOI/Crossref 检索或手工录入，生成五种引用格式并复制；查无 DOI、网络错误、字段不全有提示。 | `features/citation/pages/CitationGeneratorPage.tsx`、`features/citation/routes.tsx` |

文库约束：

- 只有一级文件夹；桌面端前置限制最多 50 个。默认文件夹不可删除，删除自定义文件夹会把论文移回默认文件夹。
- URL 保存当前文件夹、查询、页码与排序；搜索输入最多 64 字，约 300 ms 防抖；每页 20/50。
- “根目录论文”不是正常可见模型；默认文件夹是兜底归属。
- PDF 前端限制 50 MiB，同时做扩展名/文件头校验；请求最长约 10 分钟。源码边界常量按 `50 MiB - 4096 bytes` 预留协议空间。
- 批量删除是永久删除，连带 PDF、用户编辑与私有状态；需要确认。
- 只有非空集合能创建分享。接收端按 `source + source_id` 去重；服务端容量限制会以“部分保存/达到上限”提示体现。
- 单篇论文或期刊分享在已解锁且为桌面环境时可直接跳详情；移动端保留接收落地页。

## 6. Claw、PPT、科研绘图与统计分析

| 页面/模式 | 路由 | 角色 | 功能、状态与限制 | 主要源码与依赖 |
|---|---|---|---|---|
| Claw 工作台 | `/claw`、`/claw/:sessionId` | 页面可访客进入；发送需登录、模型可用且有额度 | 科研检索、阅读、期刊咨询与写作；新建/重命名/删除会话；模型选择、附件、文库引用、已安装 Skill；过程、工具调用、结果、失败/暂停/阻断/配额状态。 | `features/claw/pages/ClawPage.tsx`，`hooks/useClawConversation.ts`，`api/session.ts`、`socket.ts`，`shared/components/chat/*` |
| BoltSlides | Claw 桌面模式 | 登录用户且有额度 | 从文本/资料生成 HTML 演示；预览，导出 PDF、可编辑 PPT、图片型 PPT。 | `hooks/useBoltslidesConversation.ts`、`api/boltslides-session.ts`，`components/boltslides/*` |
| 科研绘图 | Claw 桌面模式 | 登录用户且有额度 | 生成/修订矢量科研图；预览，下载 SVG/PNG。 | `hooks/useSciDrawConversation.ts`、`api/sci-draw-session.ts`，`components/sci-draw/*` |
| 统计实验室 | Claw 桌面模式 | 登录用户且有额度 | 上传数据并生成分析、表格、Methods/Results 文本；不提供文库引用。 | `hooks/useStatLabConversation.ts`、`api/stat-lab-session.ts`，`components/stat-lab/*` |
| 移动 Claw | `/m/claw`、`/m/claw/:sessionId` | 页面可访客进入；发送需登录 | 原生 Claw 会话、历史、模型、附件、引用、Skill 与产物；没有 PPT、绘图、统计三种桌面模板。 | `pages/mobile/MobileClawPage.tsx` |

共同会话行为：

- WebSocket 会话支持流式文本、工具过程与产物；另一标签页接管时展示 `AgentDisplacedBanner`。
- 发送 ack 约 10 秒超时；停止请求约 20 秒兜底；约 180 秒无进展会出现停滞提示；断线可重连。
- 默认先取约 100 条历史消息，DOM 先渲染约 60 条，再向上增量加载。
- 额度阻断写入 `quota.store.ts`，充值/重置后可从阻断卡继续发送，而不是静默丢失输入。
- 产物渲染类型包含图片、安全化 SVG、figure JSON、PDF、沙箱 HTML、Markdown、表格、DOCX、JSON/代码/文本；未知类型只提供下载。
- 表格预览最多约 500 行 × 60 列，下载仍保留完整文件。

附件规则来自 `frontend-user/src/shared/hooks/useComposerAttachments.ts`：单次最多 10 个；图片每个 5 MB，普通文件每个 30 MB。图片支持 PNG/JPG/JPEG/WebP/GIF；文档支持 PDF/DOCX/XLSX/PPTX/ODT/RTF 及常见文本/代码格式。SVG、BMP、旧版 Office 被拒绝；SPSS/Stata/SAS 文件会引导转 CSV/XLSX。Skill 安装上限以后端为准，公开配置不可用时前端兜底为 5 个（`shared/api/skills.ts`）。

## 7. Prism 学术写作

| 页面/工作区 | 路由 | 角色 | 功能、状态与限制 | 主要源码与依赖 |
|---|---|---|---|---|
| Prism 项目首页 | `/prism`，可用 `?p=:projectId` | 页面可访客进入；项目 API/AI 动作需登录 | 创建项目（标题最多 80）、项目卡片与侧栏、重命名、删除；加载/空项目/API 错误状态。删除会永久移除资产、历史与聊天。 | `features/prism/pages/PrismPage.tsx`、`api/prism.ts` |
| 旧版 LaTeX 工作区 | 项目内 legacy 类型 | 项目所有者；只读分享可克隆 | 文件树、结构大纲、CodeMirror、保存、编译、PDF、AI 修改 diff、版本；只读项目先克隆再编辑。 | `features/prism/components/PrismWorkspace.tsx` 及 legacy 子组件 |
| V2 结构化编辑器 | 项目内 V2 类型 | 项目所有者 | 标题、作者/单位、摘要、正文块；自动保存；图片、公式、文库引用、模板、规范/质量检查、编译、PDF/DOCX；AI block diff 可接受/拒绝。 | `components/PrismWorkspaceV2.tsx`、`components/v2/*` |
| Prism AI 对话 | 项目内 | 登录用户且有额度 | 草稿、扩写、摘要、标题、双语；润色、改写、压缩；三步翻译与术语；审稿回复；投稿材料；persona；附件与会话。 | `hooks/usePrismChat.ts`、`api/socket.ts`、`api/blocked.ts`，`shared/components/chat/*` |

重要规则：

- V2 编译失败可自动修复，前端最多尝试 2 次；AI 给出的块级修改必须由用户接受后才写入正文。
- 引用选择器读取用户真实文库，不是示例参考文献。
- “审稿回复”解析并管理多个审稿意见，每项 AI 操作都可能单独消耗额度；可导出 `response-letter.md`。
- AI 返回涉及数字/引用时会做来源成员关系检查，但不等于事实核验或学术正确性保证。
- Prism 没有原生移动工作区；移动工具入口显示电脑端使用指引。

## 8. AI 同行评审模拟

| 页面 | 路由 | 角色 | 功能、状态与限制 | 主要源码与依赖 |
|---|---|---|---|---|
| 入口 | `/peer-review` | 登录用户；壳级鉴权 | 选择期刊论文或学位论文流程；显示历史草稿/最近提交。 | `features/peer-review/layouts/PeerReviewShell.tsx`、`pages/SubmissionLandingPage.tsx` |
| 期刊论文向导 | `/peer-review/journal` | 登录用户且有额度 | 四步：上传、目标与元数据、投稿信、最终确认；按 URL 的 id/step 恢复草稿。 | `pages/JournalWizardPage.tsx`、`components/wizard/*`，`api/submissions.ts`、`stream.ts` |
| 学位论文向导 | `/peer-review/thesis` | 登录用户且有额度 | 同样四步，但目标和评价维度针对学位论文。 | `pages/ThesisWizardPage.tsx` |
| 记录列表 | `/peer-review/records` | 登录用户 | 每页 20，按状态分桶；继续、查看、重试、删除。删除不可恢复。 | `pages/RecordsPage.tsx`、`api/submissions.ts` |
| 评审详情 | `/peer-review/records/:id` | 登录用户且拥有记录 | 轮询部分进度；编辑初筛、3 位评审与主编裁决；方法学阶段、评分、建议；重试剩余步骤、下载报告。 | `pages/RecordDetailPage.tsx`、`api/reports.ts`，`shared/components/peer-review-record/*` |
| 提交成功 | `/peer-review/submitted/:id` | 登录用户 | 显示平台生成的追踪编号和处理预期；不是期刊真实收稿回执。 | `pages/SubmitSuccessPage.tsx` |

评审规则与状态：

- 正文必须是非空 `.docx` 或 `.pdf`，API 前端校验上限 50 MB；补充附件最多 10 个、每个 30 MB。
- 第二步标题必填；目标期刊可留空，留空进入通用评审。
- 每一步结果按输入指纹缓存；输入未变时可复用，变化后重新运行。额度使用达到约 80% 时显示预警。
- 最终提交前须确认内容真实性/作者责任，并同意条款、隐私及目标说明。
- 产品实质是 **AI 同行评审模拟**，没有向外部期刊投稿、编辑部受理或真人审稿动作。
- 向导上传区文案仍声称主文/附件可到 200 MB，与实际 50/30 MB 校验冲突；“3–5 分钟”提示与成功页“约 10 分钟”预期也不一致。
- 移动端没有原生评审流程，只显示电脑端指引。

## 9. 工具目录与 Skill 市场

| 页面 | 路由 | 角色 | 功能、状态与限制 | 主要源码与依赖 |
|---|---|---|---|---|
| 工具目录 | `/tools` | 访客 | 关键词、12 类分类、价格/访问方式/排序筛选；每页 24；在线工具卡片、加载/空态/错误态。 | `features/tools/pages/ToolsLayout.tsx`、`ToolsCatalogPage.tsx`，`api/tools.ts` |
| 工具详情 | `/tools/:idOrSlug` | 访客 | 官网/下载/提取码、厂商、价格、试用、替代方案、教程、FAQ、免责声明与规格。外链离站。 | `pages/ToolDetailPage.tsx`、`api/tools.ts` |
| Skill 市场 | `/tools/skills`；`/skills` 重定向到此 | 访客；安装需登录 | 每页 24；搜索、热门、最新；安全化 Markdown、工具/文件 manifest、Claude 安装脚本；安装/卸载到 Claw、举报。 | `features/tools/pages/ToolsSkillsPage.tsx`，`shared/components/SkillMarketGrid.tsx`、`SkillCard.tsx`，`shared/api/skills.ts` |
| 我的 Skill | `/skills/mine` | API 要求登录，路由未设 loader | 查看原创/转载、草稿/待审/通过/驳回/下架；编辑、撤回发布、删除。 | `features/skills/pages/MySkillsPage.tsx`、`shared/api/skills.ts` |
| 创建 Skill | `/skills/new` | API 要求登录，路由未设 loader | 文件夹、zip 或文本创建；填写原创/转载与安全声明；上传后进入审核。 | `pages/SkillCreatePage.tsx` |
| Skill 详情 | `/skills/:idOrSlug` | 访客；管理动作需所有者 | 说明、文件、安装状态、审核状态与举报；自己的 Skill 可管理。 | `pages/SkillDetailPage.tsx` |
| 移动工具首页 | `/m/tools` | 访客 | Claw、文库为原生入口；Prism、评审、矩阵等为电脑端提示；工具搜索与分类。 | `features/tools/pages/mobile/MobileToolsHomePage.tsx` |
| 移动全部工具/详情 | `/m/tools/all`、`/m/tools/:idOrSlug` | 访客 | 虚拟滚动、筛选、下拉刷新、分享与工具详情。 | `MobileToolsPage.tsx`、`MobileToolDetailPage.tsx` |
| 移动 PC 功能指引 | `/m/tools/pc/:key` | 访客 | 对无移动实现的功能解释并引导电脑使用。 | `MobilePcOnlyPage.tsx` |

Skill 创建限制：单文件最多 10 MB、总包最多 30 MB；允许文件夹、zip、文本三类来源。用户必须声明来源与安全责任。聊天中直接上传并创建 Skill 仍是“即将上线”。安装总数以后端配置为准，前端不可把兜底 5 当固定商业规则。管理页删除使用浏览器原生 `window.confirm`，与全站统一确认组件不一致。

## 10. 移动 Feed、新闻、帮助与反馈

### 10.1 移动发现页

| 页面 | 路由 | 角色 | 功能与状态 | 主要源码与依赖 |
|---|---|---|---|---|
| 移动论文 Feed | `/m/feed`；`/m` 重定向到此 | 访客；收藏需登录 | 卡片式论文流、滑动/翻页、缓存种子和当前位置、下拉刷新；收藏、引用、打开详情。 | `features/mobile/pages/FeedPage.tsx`、`api/feed.ts`，`shared/components/MobilePaperRow.tsx` |
| 移动期刊 Feed | `/m/feed/journals` | 访客 | 期刊发现流、指标徽章、打开详情、下拉刷新。 | `pages/JournalFeedPage.tsx`、`api/journal-feed.ts` |
| 移动新闻 Feed | `/m/feed/news` | 访客 | 新闻流、分类/热度、打开详情。 | `pages/NewsPage.tsx`，`shared/api/news.ts` |
| 移动搜索兼容入口 | `/m/search` | 访客 | 当前重定向到 `/m/feed`；搜索由壳层 overlay 提供，不是独立结果页。 | `features/mobile/routes.tsx`、`stores/mobile-search.store.ts` |

`features/mobile/components/FeedPrefetcher.tsx` 在移动壳内预取 Feed。Feed 的 seed/位置缓存用于返回恢复，不保证内容永久不变；刷新会重置相应游标。

### 10.2 新闻、帮助和静态信息

| 页面 | 路由 | 角色 | 功能与状态 | 主要源码与依赖 |
|---|---|---|---|---|
| 新闻列表 | `/news` | 访客 | 分类、排序、无限加载；热度/来源与发布时间；空态和请求失败。 | `features/news/pages/NewsListPage.tsx`，`shared/api/news.ts`、`shared/components/news/*` |
| 新闻详情 | `/news/:slug` | 访客 | 安全化正文、来源、可信度信息、相关内容。 | `pages/NewsDetailPage.tsx` |
| 帮助中心 | `/help` | 访客 | 后台维护的问答分类、搜索与展开；旧 `/qa` 跳转到此。 | `features/help/pages/HelpCenterPage.tsx`、`api/content.ts` |
| 旧问答详情 | `/qa/:slug` | 访客 | 单条问答详情兼容页。 | `pages/QADetailPage.tsx` |
| 资源/博客列表 | `/resources`、`/blog` | 访客 | 内容分类、卡片、空态；两者复用资源中心页。 | `pages/ResourceCenterPage.tsx`、`api/content.ts` |
| 资源/博客详情 | `/resources/:slug`、`/blog/:slug` | 访客 | Markdown/富文本、目录、相关文章、CTA。 | `pages/ResourceDetailPage.tsx`、`BlogDetailPage.tsx`，`shared/components/TableOfContents.tsx` |
| 关于/联系 | `/about`、`/contact` | 访客 | 品牌介绍；联系邮箱、备注和企微/飞书二维码来自后台配置。 | `pages/AboutPage.tsx`、`ContactPage.tsx`，`api/contact.ts` |
| 法务页面 | `/privacy`、`/terms`、`/disclaimer` | 访客 | 隐私政策、服务条款、免责声明。 | `pages/PrivacyPage.tsx`、`TermsPage.tsx`、`DisclaimerPage.tsx` |
| 用户反馈 | `/feedback` | 访客 | 邮箱必填、分类、正文、附件；提交成功/失败。 | `pages/FeedbackPage.tsx`、`api/contact.ts` |

反馈页面前端正文限制为 10–2000 字；附件图片最多 10 个、其他文件最多 5 个，单文件 10 MB、合计 50 MB；支持 JPEG/PNG/GIF/WebP、PDF、DOC/DOCX、XLS/XLSX、TXT、ZIP。后端模型处可能允许到 5000 字，前后端口径需统一。

## 11. 营销页、定价与邀请落地页

| 页面 | 路由 | 角色 | 当前 UI 目的 | 主要源码与依赖 |
|---|---|---|---|---|
| 功能总览 | `/features` | 访客 | 汇总检索、文库、Prism、Claw、投稿/评审能力并引导注册。 | `features/landing/pages/FeaturesOverviewPage.tsx` |
| 单功能落地页 | `/features/search`、`library`、`prism`、`claw`、`submit`、`peer-review` | 访客 | 营销说明、截图/示意、CTA；不执行核心业务。 | `pages/SearchLandingPage.tsx`、`LibraryLandingPage.tsx`、`PrismLandingPage.tsx`、`ClawLandingPage.tsx`、`SubmitLandingPage.tsx`、`PeerReviewLandingPage.tsx` |
| 定价 | `/pricing` | 访客 | Free/Pro/Max 静态权益与估算、动态购买入口。 | `pages/PricingPage.tsx`、`api/plans.ts`，`shared/components/membership-plan-card.tsx` |
| 邀请落地页 | `/i/:code` | 访客/登录用户 | 捕获并标准化邀请码，并发做 preview 与打开计数；访客立即转首页注册流，登录用户转设置绑定流。页面本身只显示短暂 loading；无效码由异步结果静默清除，奖励说明在后续邀请 UI 展示。 | `pages/InviteLandingPage.tsx`、`api/invite.ts`，`stores/invite.store.ts` |

定价页当前静态估算（不是后端硬上限）：

| 等级 | 页面展示的五类常规估算 | 其他展示 |
|---|---|---|
| Free | 4 / 3 / 2 / 1 / 5 | 约 15 次轻量能力；不含重型能力与完整评审 |
| Pro | 85 / 60 / 40 / 27 / 75 | 约 300 次；重型约 12、评审约 9 |
| Max | 430 / 300 / 200 / 135 / 375 | 约 1500 次；重型约 57、评审约 45 |

这些数字由静态文案组合得到，和后台动态“点数、倍率、模型价格、功能扣费”存在漂移风险。Wiki 应把它们描述成页面估算，并链接当前计划配置，而非当作固定配额。

### 11.1 邀请与促销活动在用户端的表现

- 邀请活动配置决定顶部/设置入口是否出现、邀请人和被邀请人注册奖励、每日奖励上限、绑定窗口、首购窗口与返利比例。
- 前端会拦截自邀、重复绑定、过期/关闭活动；最终资格与入账以后端为准。
- 邀请分享支持链接、二维码与海报，绑定可在注册自动发生，也可登录后手动确认。
- 促销弹窗只对匿名或 Free 用户展示，付费用户隐藏；可配置顶部入口、首次进站自动弹、额度耗尽弹出、标题/正文/CTA/二维码。
- 促销配置请求失败时用户端选择隐藏，不展示一个可能过期的兜底活动。

### 11.2 营销声明与产品实装的边界

- 文库落地页提到多级树、批注高亮、AI 标签、Zotero/EndNote 导入与平板同步；实际当前是一级文件夹，PDF 阅读器无批注工具，Zotero/EndNote 明示“即将上线”。
- 投稿页容易让人理解为“实际代投”；当前产品只做材料生成和 AI 评审模拟，没有把稿件发送到外部期刊。
- 同行评审页的编辑部工作流、候选审稿人/冲突图等描述，不能替代当前“四步 AI 模拟 + 记录详情”的真实行为。
- Prism 的多人协作、实时协同等宣传未在当前工作区找到稳定入口。
- 语言选择器中的 English/Japanese 只是展示项，未找到完整 i18n 切换链路。
- 部分 demo/whitepaper CTA 使用页内锚点，但对应可交互内容可能不存在。
- 检索落地页的语义图谱/跨库融合是宣传口径；公开检索实际源和智能会话行为应按第 4 节记录。

## 12. 共用组件、状态库与跨页面规则

### 12.1 Zustand 状态库

| Store | 跨页面职责 | 关键行为/风险 |
|---|---|---|
| `stores/auth.store.ts` | token、profile、登录态启动恢复 | token 失效清理；后台角色变化会被重新校验。 |
| `auth-dialog.store.ts` | 桌面/移动认证入口 | 保存当前 tab 与认证意图。 |
| `pending-action.store.ts` | 登录后续做的用户动作 | 收藏、智能检索等在登录后恢复；需避免跨账号残留。 |
| `browser-tabs.store.ts` | 论文/期刊/作者/PDF 浏览标签 | 持久化，最多 30；淘汰非当前最旧标签。 |
| `staging-areas.store.ts`、`staging-ui.store.ts`、`stage-fly.store.ts` | 检索暂存 A–E、当前区与飞入动画 | 每区 100；匿名本地持久化。store 注释仍称服务端迁移待 follow-up，不能假定所有匿名数据登录后已可靠上云。 |
| `smart-search-session.store.ts` | 智能检索当前/新会话 | 路由切换保留草稿与会话上下文。 |
| `search-visible-papers.store.ts` | 当前可见论文 | 供矩阵/批量动作读取，须防止换页后旧选择。 |
| `collect-picker.store.ts` | 全局收藏文件夹选择 | 论文详情、列表和 Feed 复用。 |
| `quota.store.ts` | AI 阻断、重试与恢复 | 跨 Claw/Prism/搜索显示额度弹窗；支付后可恢复原动作。 |
| `invite-entry.store.ts`、`invite.store.ts` | 邀请候选与面板 | 候选跨认证持久化，活动关闭/过期时清除。 |
| `promo.store.ts` | 促销展示频次/关闭状态 | 与邀请状态独立。 |
| `share.store.ts` | 移动/桌面全局分享面板 | 支持论文、期刊、集合与海报。 |
| `mobile-search.store.ts` | 移动搜索 overlay | `/m/search` 本身不承载结果。 |
| `sidebar.store.ts` | 桌面侧栏展开/收起 | 影响检索与工作台布局。 |
| `favorite-burst.store.ts` | 收藏成功动效 | 纯 UI，不代表写入成功；应以 mutation 结果触发。 |

### 12.2 共享 API 与 UI 语义

- 公共内容/详情 API：`shared/api/paper-detail.ts`、`paper-enrich.ts`、`authors.ts`、`journals.ts`、`journal-enrichment.ts`、`news.ts`、`hot-content.ts`。
- 文库/分享 API：`library-share.ts`、`library-browse.ts`、`user-library-papers.ts`、`user-library-mutations.ts`。
- 用户/计费/活动 API：`membership.ts`、`profile.ts`、`notifications.ts`、`public-config.ts`、`promo.ts`、`invite-campaign.ts`、`user-invite.ts`、`wechat-pay.ts`。
- AI 共用 API：`models.ts`、`skills.ts`、`agent-sessions.ts`、`agent-attach.ts`、`translate.ts`。
- 统一论文卡：`shared/components/PaperResultCard/*`；移动论文行：`MobilePaperRow.tsx`；期刊语义：`JournalBadges.tsx`、`JournalDecisionCard.tsx`、`JournalMetricsGroups.tsx`、`JournalSubmissionCard.tsx`、`JournalTrendChart.tsx`。
- 聊天渲染：`shared/components/chat/*` 负责安全 Markdown、代码、Mermaid、SVG、HTML 沙箱、工具过程、附件/引用、模型选择、额度/暂停/错误状态。
- 统一动作 UI：`ConfirmDialog.tsx`、`ConfirmPopover.tsx`、`ToastHost.tsx`、`CitationDialog.tsx`、`FavoritePaperButton.tsx`、`TranslatePaperButton.tsx`、`membership-action-dialog.tsx`。
- PDF：`shared/components/PdfViewer.tsx` 与 `pdf-viewer/*`；分享：`shared/components/share/*`；邀请海报：`shared/components/invite/*`。

`src/app/App.tsx` 全局挂载 Toast、确认框、pointer-lock 保护、额度通知、促销弹窗、附件管理器与收藏夹选择器；`/mp/*` 嵌入页有意跳过这些全局层。路径切换会关闭大多数全局模态框，但额度恢复链路有例外，以免支付后丢失待办动作。

## 13. `/admin` 后台产品面

### 13.1 入口、角色与权限模型

后台根路由 `/admin` 使用 `adminGuard`：必须有 token，且 profile 角色是 `operations`、`admin` 或 `super_admin`。普通用户不能进入后台壳。主要来源：

- 路由：`frontend-user/src/features/admin/routes.tsx`
- 壳与命令面板：`layouts/AdminShell.tsx`
- 导航：`nav.ts`
- 权限：`permissions.ts`
- 统一配置写保护：`components/ConfigPageGuard.tsx`
- 告警：`components/TodayPanel.tsx`、`hooks/useAdminAlerts.ts`

| 权限键 | operations | admin | super_admin | 典型用途 |
|---|---:|---:|---:|---|
| `users.view` | ✓ | ✓ | ✓ | 用户列表与详情 |
| `users.manage` | — | ✓ | ✓ | 冻结、删除、资产和会员变更 |
| `users.role.assign` | — | — | ✓ | 任命 operations/admin |
| `content.manage` | ✓ | ✓ | ✓ | 公告、内容、工具、Skill、活动内容 |
| `analytics.view` | ✓ | ✓ | ✓ | 数据、用量、订单查看 |
| `config.manage` | — | ✓ | ✓ | 系统、计费、OAuth、支付、上游配置 |
| `finance.refund` | — | ✓ | ✓ | 登记退款 |

注意：子路由 loader 大多只验证“可进后台”，没有逐页验证上表权限；侧栏/命令面板会过滤菜单，页面按钮也常按权限隐藏，但直接输入 URL 仍可能进入页面壳并由 API 返回 403。后台安全边界必须在服务端，Wiki 不应写成“隐藏菜单即完成授权”。

AdminShell 还提供 `Cmd/Ctrl+K` 页面与用户搜索、当前角色展示、token 失效自动退出。侧栏徽标/首页待办来自六类健康检查：待处理反馈、草稿消息、第三方账号失败率、维护模式、支付宝、微信支付；只有支付宝和微信都不可用时才报“无支付渠道”。任一检查失败会进入“状态不完整”降级态，不能显示误导性的全绿。

### 13.2 后台路由总表

| 分组/页面 | 路由 | 最低前端权限 | 主要页面/API 来源 | 核心用途 |
|---|---|---|---|---|
| 总览 | `/admin` | 后台角色 | `pages/DashboardPage.tsx`、`api/dashboard.ts` | 今日待办、用户/营收/订单/成本/资产 KPI、30 日趋势 |
| 用户管理 | `/admin/users` | `users.view` | `pages/UsersPage.tsx`、`api/users.ts`、`user-metrics.ts` | 查用户、画像、登录与资产、冻结/角色/会员/额度 |
| 公告 | `/admin/announcements` | `content.manage` | `pages/AnnouncementsPage.tsx`、`api/announcements.ts` | Banner/弹窗/维护公告 |
| 热门内容 | `/admin/hot-content` | `analytics.view`；修改配置需 `config.manage` | `pages/HotContentPage.tsx`、`api/hot-content.ts` | 热搜词、热门论文、留存清理 |
| 期刊同步 | `/admin/journal-sync` | `config.manage` | `pages/JournalSyncPage.tsx`、`api/journal-sync.ts` | 上游拉取、暂存、发布、回滚 |
| 工具管理 | `/admin/tools` | `content.manage` | `pages/FeatureToolsPage.tsx`、`api/feature-tools.ts` | 工具元数据、状态、SEO、索引 |
| 工具导入 | `/admin/tools-import` | `content.manage` | `pages/FeatureToolImportPage.tsx`、`api/feature-tools.ts` | JSON/zip 批量导入 |
| 导入任务 | `/admin/tools-jobs` | `content.manage` | `pages/FeatureToolJobsPage.tsx` | 任务阶段、成功/失败明细 |
| 工具 Webhook | `/admin/tools-webhooks` | `content.manage` | `pages/FeatureToolWebhooksPage.tsx` | 订阅、HMAC、测试、投递记录 |
| Skill 审核 | `/admin/skills-review` | `content.manage` | `pages/SkillReviewPage.tsx`、`api/skills.ts` | 审批、拒绝、举报、强制下架 |
| 用户反馈 | `/admin/feedback` | `content.manage` | `pages/FeedbackPage.tsx`、`api/feedback.ts` | 处理、回复、关闭反馈 |
| 消息中心 | `/admin/messages` | `content.manage` | `pages/MessagesPage.tsx`、`api/messages.ts` | 草稿、受众、预览、发送 |
| 邮件收件箱 | `/admin/mail-center` | `content.manage` | `pages/MailCenterPage.tsx`、`api/support-center.ts` | IMAP 收取、SMTP 回复/新邮件 |
| 客服配置 | `/admin/support-config` | `config.manage` | `pages/SupportCenterConfigPage.tsx`、`api/support-center.ts` | 联系方式、IMAP/SMTP、飞书告警 |
| 邮件/短信日志 | `/admin/email-logs` | `analytics.view` | `pages/EmailLogsPage.tsx`、`api/email-logs.ts` | 发送统计、筛选、失败原文 |
| 会话监控 | `/admin/session-monitor` | `analytics.view` | `pages/SessionMonitorPage.tsx`、`api/session-monitor.ts`、`peer-review-monitor.ts` | AI 会话与评审记录只读巡检 |
| 站点分析 | `/admin/analytics` | `analytics.view` | `pages/AnalyticsPage.tsx`、`api/analytics.ts` | Umami 访问分析与爬虫统计 |
| 功能用量 | `/admin/usage-stats` | `analytics.view` | `pages/UsageStatsPage.tsx`、`api/usage-stats.ts` | 功能事件、活跃用户、评审漏斗 |
| Token 用量 | `/admin/token-usage` | `analytics.view` | `pages/TokenUsageStatsPage.tsx`、`api/token-usage.ts` | 模型 token、点数、成本、明细导出 |
| 邀请分析 | `/admin/invites` | `analytics.view` | `pages/InvitesPage.tsx`、`api/invites.ts` | 邀请漏斗、奖励、首购与返利 |
| 订单 | `/admin/orders` | `analytics.view`；退款需 `finance.refund` | `pages/OrdersPage.tsx`、`api/orders.ts` | 营收、订单、退款登记 |
| VIP 码 | `/admin/vip-codes` | `config.manage` | `pages/VipCodesPage.tsx`、`api/vip-codes.ts` | 批量生成、复制/导出、核销管理 |
| 运营活动 | `/admin/activities` | `content.manage`；邀请配置需 `config.manage` | `pages/ActivitiesPage.tsx`、`api/invite-campaign.ts`、`promo-config.ts` | 邀请活动与促销弹窗 |
| 计费配置 | `/admin/billing-config` | `config.manage` | `pages/BillingConfigPage.tsx`、`api/billing-config.ts` | 点数周期、倍率、价格、充值规则 |
| AI 上游 | `/admin/model-catalog` | `config.manage` | `pages/AiUpstreamPage.tsx`、`api/model-catalog.ts`、`third-party.ts`、`agent-config.ts` | Provider、模型、账号池、模型绑定 |
| 分析维度 | `/admin/dimensions` | `config.manage` | `pages/DimensionsPage.tsx`、`api/dimensions.ts` | 矩阵系统维度与 prompt |
| 微信公众号 | `/admin/wechat-official` | `config.manage` | `pages/WechatOfficialPage.tsx`、`api/wechat-official.ts` | OA 凭据、加密、自动回复 |
| 新闻 Webhook | `/admin/news-webhook` | `config.manage` | `pages/NewsWebhookConfigPage.tsx`、`api/news-webhook.ts` | 新闻摄入、签名、事件与重试 |
| 系统配置 | `/admin/system` | `config.manage` | `pages/SystemConfigPage.tsx`、`api/system-config.ts`、`code-snippets.ts` | 基础、验证码、埋点、邮件/短信、代码片段 |
| OAuth | `/admin/oauth` | `config.manage` | `pages/OAuthConfigPage.tsx`、`api/oauth.ts`、`wechat-miniprogram.ts` | 七种 OAuth 与小程序凭据 |
| 支付 | `/admin/payment` | `config.manage` | `pages/PaymentConfigPage.tsx`、`api/payment.ts` | 支付宝/微信商户、测试、激活 |

旧文件 `CodeSnippetsPage.tsx`、`PromoConfigPage.tsx`、`ModelCatalogPage.tsx`、`ThirdPartyPage.tsx` 等仍存在，但对应能力已嵌入聚合页；旧路由只做 redirect，不能列作两个独立产品页面。

### 13.3 总览、用户与商业后台

#### 总览 `/admin`

- KPI 包括总用户/新增用户、净营收、已付/待付订单、付费/免费用户、今日及 30 日 AI 成本和点数、已兑换权益码。
- 展示近 30 日用户、营收和成本趋势，并记录数据更新时间；各模块有独立错误态。
- “今日待办”按危险程度排序。第三方失败率超过 10%、待处理反馈、无支付渠道是高优先；维护模式是警告；草稿消息为弱提醒。
- 第三方告警仍跳旧 `/admin/third-party`，依赖 redirect 到 `/admin/model-catalog`，是兼容链路而非真实页面。

#### 用户 `/admin/users`

- 可按用户 ID、用户名、邮箱、手机搜索；按角色、会员、状态、邮箱验证、注册日期筛选；按会员、注册、最后活跃、登录排序；每页 20。
- 用户分析展示注册/活跃趋势、来源、24 小时活动、MAU。详情抽屉包括身份/联系方式、注册来源、订单、钱包、兑换、登录方式、IP、冻结状态、会员、额度、重置次数、功能用量与 LLM 用量，各区可独立失败。
- `users.manage` 可冻结（原因 1–255 字）、解冻、撤销 token/强制退出、删除用户、增减 credit、发会员、取消会员、发重置次数。
- 不能冻结 admin/super_admin。删除必须输入 `DELETE`，并明确会级联订单、反馈、会话等；批量操作只覆盖当前选中页。
- 只有 super_admin 能任命角色，且不能修改其他 super_admin。可任命 `user`、`operations`、`admin`。
- 会员赠送限 Pro/Max，支持自然日/月/年；最大 3650 天、120 月或 10 年，超过一年二次确认。取消会员回 Free，但不会自动清除 credit 或重置次数。
- credit 增减进入不可变流水；减额最低到 0。重置次数一次最多 1000，并可设置有效天数。

#### 订单 `/admin/orders`

- 7/30/90 日视窗；今日/视窗/全周期的流水、退款、净收入；订阅/充值、paid/pending/expired；营收趋势。
- 搜索框只查用户字段，不查订单号/交易号，这是明显的运营检索缺口。
- 退款功能只“登记站内退款”，不会自动调用支付网关；操作人必须先在支付宝/微信侧退款，再填退款原因（最多 255）、网关退款号（最多 64）、金额、幂等键并输入订单号确认。
- 支持全额/部分退款。充值退款按比例追回 credit，余额不足记平台损失；订阅退款可选择撤销会员，全额默认撤销、部分默认不撤销。撤销可能清空累积会员期限。
- 原订单仍显示 paid，并附退款徽标/历史；不能把状态词解释成“未退款”。

#### VIP 码 `/admin/vip-codes`

- 每批 1–1000 个；可发 Pro/Max 时长或 credit；单码可用 1–100 次；有效期 1–30 天；可写批次备注。
- 按批次/备注搜索、类型/会员筛选，每页 30。单批可加载最多 1000 个，支持自定义分隔符复制全批与 Excel 导出。
- 页面还提供查看批次/码状态及撤销类管理动作；具体剩余次数与核销记录以后端返回为准。

#### 计费配置 `/admin/billing-config`

- 全局 `enabled=false` 表示 AI 不扣费/不受点数约束，是高风险开关。
- 配置 Free 周期点数与窗口天数、Pro/Max 倍率；倍率 `<=0` 表示不限制。
- 配置月价/年价（分）、充值汇率、credit→points 折算、最低充值、热门方案。年价为 0 会隐藏年付入口。
- 重置次数折算在页面只读展示。保存前展示字段 diff 并二次确认；后端配置有约 30 秒缓存，用户端不会绝对即时变化。

### 13.4 内容、运营与客服

#### 公告 `/admin/announcements`

- 类型：Banner、弹窗、维护；级别：info/warning/danger/success；受众：全部、已登录、付费用户。
- 可配置标题/内容/链接、开始结束时间、可关闭、启用和优先级；列表推导草稿、定时、已过期、直播中状态。
- 新建默认立即发布，保存前确认。多个生效公告在用户端只展示最高优先级者，不能假设会轮播全部。

#### 热门内容 `/admin/hot-content`

- 热搜分论文/期刊，字段是 `search_count`；热门论文展示曝光、搜索结果点击、SEO 直访，旧 `view_count` 已停止写入。
- 可切 30 日等窗口并分页；后台统计接口返回全表 `keywords_count`、`papers_count` 及清理策略。源码注释记录过旧字段导致 KPI 错显的历史风险，Wiki 应使用当前字段名。
- 清理策略范围：保留 1–3650 天，最大 100–10,000,000 条；修改和手动清理需要配置权限。日常任务约 04:30 执行，手动取消/清理后的最终行数以后端为准。

#### 期刊同步 `/admin/journal-sync`

- 工作流是上游抓取 → staged 暂存 → 选择分层 → 正式发布，而不是抓取即上线。
- 展示状态计数、T1–T4/未评级分布；全量任务按 1–1.2 秒节流时可达约 70 分钟。
- 支持启动、暂停、恢复、取消；每 5 秒轮询。取消保留已抓取暂存行。
- 发布数量最多 50,000，可按 tier 选择并触发 sitemap、IndexNow、百度推送；支持批次回滚。

#### 工具管理 `/admin/tools*`

- 工具列表支持搜索、分类、draft/pending/published/archived 与 SEO 状态；编辑元数据、来源、使用场景、SEO 和发布状态，并提供人工索引批准。
- JSON/zip 导入接受顶层数组或 `{items}`/`{tools}`；按 `source_topic_id` 或 slug 幂等；可选择通知下游。任务页显示阶段、成功/失败条目和错误详情。
- Webhook 可订阅 created/updated/deleted，配置可选 HMAC secret；支持测试、投递历史、HTTP 响应与重试错误。删除/发布会通知已配置下游。

#### Skill 审核 `/admin/skills-review`

- Tab：待审核、被举报、已通过、全部；可通过、填写驳回原因、处理举报。
- 强制下架是 kill switch，要求输入 `TAKEDOWN`；举报可标记已处理/驳回。
- 审核页面只做内容/运营判断，不等于恶意代码已在沙箱中完成安全审计。

#### 用户反馈 `/admin/feedback`

- 状态：pending、processed、replied、closed；支持数量、搜索、详情、来源/IP、附件。
- 回复同时发邮件与站内消息并把状态改为 replied；可重新打开或关闭。
- 没有明确的工单指派/负责人字段，只有处理/回复人员痕迹。

#### 消息 `/admin/messages`

- 类别：system、promo、transaction；受众：全部、按计划、批量用户；先保存草稿，再进行不可逆发送。
- 发送全部用户必须输入 `SEND`；预览正文、链接、过期、已读人数/比例。
- 草稿没有完整的编辑/删除工作流。`by_plan` 仍依赖旧字段 `subscription_plan`，而当前会员主字段是 `vip_tier`，可能匹配不到用户，属于高风险缺口。
- 列表响应不返回 specific user IDs，后台无法事后核对一个批量消息精确发给了谁。

#### 邮件中心与客服配置

- `/admin/mail-center`：IMAP 收件箱 master-detail、状态/搜索、立即轮询；SMTP 回复和新建邮件。HTML 邮件在沙箱中渲染。
- `/admin/support-config`：公开联系邮箱、备注、企微/飞书二维码；二维码实际受 data URL 约 300 KB 上限影响，页面建议约 220 KB 源图。
- IMAP 可配 TLS、轮询与连接测试；SMTP 支持客服配置或回退系统 SMTP；飞书 Webhook 支持签名及反馈/邮箱/支付事件开关与测试。
- 测试按钮只测试“已保存配置”；表单有未保存修改时会禁用测试，避免测到错误版本。

### 13.5 观测、统计与审计读取

#### 邮件/短信日志 `/admin/email-logs`

- 邮件和短信两个 Tab；总量/成功/失败统计，按状态、类别、搜索筛选；详情可复制原始错误。

#### 会话监控 `/admin/session-monitor`

- Tab：智能检索、Claw、PPT、科研绘图、统计、Prism、同行评审。
- 对话列表每 30 秒轮询、搜索、每页 20；显示模型、轮次、重置、时间。详情以用户侧相同语义只读展示消息、工具、产物、附件。
- 同行评审显示完整记录和 raw debug；这是运维读取能力，不提供从后台修改用户科研内容的入口。

#### 站点分析 `/admin/analytics`

- 依赖 Umami `WEBSITE_ID`；按日期查看访客、会话、PV、跳出率、平均访问时长、实时在线。
- 趋势按小时/日，维度包括页面、来源、国家、浏览器、OS、设备；另有 24h/7d/30d 爬虫统计。
- 页面区分“真实为 0”和“接口/配置失败”，不能把空图一律解释成无访问。

#### 功能用量 `/admin/usage-stats`

- 基于 `usage_events`，展示总事件、今日、登录用户/匿名用户、每日趋势、功能排行。
- 同行评审提供五步漏斗；它衡量页面/事件经过，不代表外部投稿成功率。

#### Token 用量 `/admin/token-usage`

- 时间：今天、7/30/90 天、自定义；筛选 feature、source、model、provider、用户/匿名。
- 总量：点数、估算成本、tokens、cache、调用、用户、未定价调用；1 point 的页面折算口径为 ¥0.001。
- 图表可切维度/token/calls；breakdown 到模型、功能、来源、提供方、Top 用户；日志每页 30，可按时间/成本/token 排序并导出 CSV。
- 功能枚举覆盖 smart、claw、review、matrix、translate、wechat、prism、boltslides、draw、stat；source 中 backend/agent 是调用来源，不是用户产品名。

#### 邀请分析 `/admin/invites`

- 五个 KPI；列表追踪邀请码打开、注册、奖励、转化，支持搜索与每页 20。
- 详情展示注册来源/方式、双方赠送、首单、返利、退款冲销和余额不足造成的平台损失。

### 13.6 活动、AI 上游与系统集成

#### 运营活动 `/admin/activities`

邀请活动：

- 注册奖励上限 1,000,000,000 credit；邀请人每日奖励上限 1,000,000，0 表示不限；绑定/首购窗口 1–3650 天；返利 0–100%，最多两位小数；帮助链接最多 500 字且须 HTTP(S)。
- 启用或高成本配置需要二次确认；关闭后用户端立即隐藏且停止新绑定，但已有绑定在规则窗口内仍可能继续兑现。
- 页面显示历史累计成本并可跳邀请分析。写邀请活动需要 `config.manage`，因此 operations 虽能进入活动页，无法改该 Tab。

促销弹窗：

- 可配置启用、导航入口、首次访问弹出、额度耗尽弹出、标题、文案、按钮、目标链接与二维码。
- 二维码仅 PNG/JPEG/WebP，最多 300 KB；右侧提供用户端实时预览。
- 活动页整体菜单按 `content.manage` 开放，促销写动作还需以后端权限为准。

#### AI 上游 `/admin/model-catalog`

- Provider：DeepSeek 默认项，官方预设 Qwen/Kimi/Zhipu/Doubao/MiniMax，以及自定义 OpenAI-compatible 上游。
- 模型维护 context/output、输入/输出/cache 四类价格、启用、用户可选、能力、会员范围、视觉/推理等。启用且用户可选但未定价会被阻止。
- 保存后自动推送 agent 配置，显示 pending/success/failed；“孤儿模型”提示数据库与配置不同步。
- 模型绑定共 10 个槽：`system.main`、`system.fast`，以及 `chat_default.smart_search`、`chat_default.claw`、`chat_default.prism`、`peerreview.meta`、`peerreview.methodology`、`project.translate`、`project.analysis`、`project.wechat_oa`；具体枚举以当前 API 为准。
- 第三方账号池分 AI model 与 MiniCod，支持优先级、启停、成功率/延迟、测试、重置、删除。Reveal 模式会一次加载所有秘密并自动关闭，属于敏感高风险操作。

#### 分析维度 `/admin/dimensions`

- 维护矩阵系统维度：key 不可变，名称最多 100，描述/prompt、排序、启用；变化直接影响用户矩阵分析提示词。
- 源码注释中“固定 8 个”与动态列表并存，应以 API 返回为准，不把数量写死。

#### 微信公众号 `/admin/wechat-official`

- AppID、secret、token、AES key；明文/兼容/安全三种消息加密模式；系统提示词与自动回复开关。
- 关闭自动回复需要确认；实际模型来自 AI 上游的微信绑定，而不是本页自由选择。

#### 新闻 Webhook `/admin/news-webhook`

- “用户端展示新闻”开关只控制 UI，不停止上游摄入。
- 展示只读接收 URL、HMAC secret；事件 created/updated/heat；服务端去重。
- 失败重试约 1m、5m、30m、2h、6h，共五轮后进入 dead letter。

### 13.7 系统、OAuth 与支付

#### 系统配置 `/admin/system`

- 基础：邮箱验证、Turnstile、GA/GTM；邮件 SMTP 和短信服务凭据、测试、启用。
- 代码片段已嵌入系统页：SEO/analytics/ad/social/other，位置 head/body-start/body-end，优先级、idle、全局/范围、启用。
- 代码片段允许注入任意 HTML/JS，是供应链与 XSS 高风险能力，应只授予可信管理员并保留变更审计。
- 多数配置是“整行 PUT”，`ConfigPageGuard` 用版本/脏状态保护避免多个管理员互相覆盖；仍应以后端并发控制为最终保证。

#### OAuth `/admin/oauth`

- 配置 GitHub、Google、Apple、ORCID、Microsoft、Discourse、WeChat 七种提供方；字段随 provider 变化，支持 secret reveal。
- 用户端彩色可用圆点读公开配置；保存秘密走整记录保护。
- 微信小程序凭据（AppID/secret/enabled）并入同页，但仍是独立配置对象。

#### 支付 `/admin/payment`

- 支付宝支持多个商户，只能激活一个；沙箱/生产决定 gateway；配置 notify/return、私钥、公钥。激活沙箱商户会明确警告。
- 微信支持多个商户：商户号、AppID、序列号、APIv3 key、私钥、可选证书；平台公钥模式或平台证书模式；支付/退款回调。
- 微信支付方式至少选择一项：扫码 `native`、手机浏览器 `h5`、微信内 `jsapi`；未勾选的场景下单会被后端拒绝。
- 修改凭据会使测试结果失效并取消激活；商户必须测试有效后才能激活。测试最多约 60 秒，不产生真实交易。
- 用户端只有在商户“active 且 valid”时显示该支付入口。删除、切换激活、生产/沙箱变更均需要确认。

## 14. Wiki 必须建立的独立条目

以下是从前端信息架构反推的最小“独立词条”集合。每个反引号标题应有自己的 canonical 页面；列表页可作为分类导航，但不应把这些概念全部压进一篇长文。

### 14.1 账户、商业规则与全局概念

1. `Scholay 产品与入口总览`
2. `桌面端、移动端与小程序能力差异`
3. `注册、登录与找回密码`
4. `OAuth 与微信登录`
5. `账号冲突与账号合并`
6. `个人资料`
7. `密码、邮箱与手机号安全`
8. `第三方账号连接与解绑`
9. `会员等级：Free、Pro、Max`
10. `周期额度、points、credit 与重置次数`
11. `订阅、续费、升级与降级`
12. `充值、余额自动补足与支付方式`
13. `兑换码`
14. `邀请活动、绑定与返利`
15. `促销弹窗与活动入口`
16. `通知中心`
17. `额度耗尽、阻断与恢复`
18. `隐私、服务条款与免责声明`

### 14.2 检索、浏览、期刊与文库

19. `经典论文检索`
20. `检索数据源：Auto、STC、OpenAlex、PubMed`
21. `论文筛选、排序、分页与 1000 条上限`
22. `智能检索`
23. `智能检索会话、模型、附件与文库引用`
24. `A–E 暂存区`
25. `AI 分析矩阵与自定义维度`
26. `论文详情、开放获取与翻译`
27. `作者详情`
28. `期刊详情、指标、分区与预警`
29. `期刊检索`
30. `期刊榜单与目录`
31. `期刊投稿资源`
32. `论文收藏与取消收藏`
33. `文库文件夹与论文管理`
34. `PDF 上传、解析、元数据与重新关联`
35. `PDF 阅读器`
36. `文库分享、提取码与接收保存`
37. `引用弹窗与引用格式`
38. `引用生成器`

### 14.3 AI 创作与评审

39. `Claw 科研助手`
40. `Claw 会话、历史与模型`
41. `AI 附件、文库引用与已安装 Skill`
42. `AI 工具过程、流式状态、停止与重试`
43. `AI 产物类型、预览与下载`
44. `BoltSlides 演示生成与导出`
45. `科研绘图与 SVG/PNG 导出`
46. `统计实验室与数据文件`
47. `Prism 项目与工作区`
48. `Prism 结构化编辑器、编译与导出`
49. `Prism 旧版 LaTeX 工作区`
50. `Prism AI 写作、润色与翻译`
51. `Prism 审稿回复与投稿材料`
52. `AI 同行评审模拟`
53. `期刊论文与学位论文四步向导`
54. `评审记录、阶段、报告与重试`
55. `AI 使用边界：非真人审稿、非外部投稿、非事实保证`

### 14.4 工具、内容与支持

56. `科研工具目录与筛选`
57. `工具详情、下载、提取码与外链安全`
58. `Skill 市场、安装与卸载`
59. `创建、发布与管理 Skill`
60. `Skill 审核、举报与安全责任`
61. `移动 Feed：论文、期刊与新闻`
62. `新闻列表、来源与可信度`
63. `帮助中心与学术问答`
64. `资源中心与产品博客`
65. `联系 Scholay`
66. `提交反馈与附件限制`
67. `分享卡片、海报与移动分享`

### 14.5 管理后台

68. `后台角色、权限与安全边界`
69. `后台总览与今日待办`
70. `用户查询与用户画像`
71. `冻结、强制退出、删除与角色任命`
72. `管理员赠送会员、credit 与重置次数`
73. `订单、营收与退款登记`
74. `VIP 码批量生成与核销`
75. `计费配置与缓存生效`
76. `公告、受众与优先级`
77. `热门搜索、热门论文与清理策略`
78. `期刊同步、暂存、发布与回滚`
79. `工具管理、批量导入与导入任务`
80. `工具 Webhook、HMAC 与投递重试`
81. `Skill 审核与强制下架`
82. `反馈处理、回复与状态`
83. `站内消息、受众与发送`
84. `邮件中心、客服配置与飞书告警`
85. `邮件/短信发送日志`
86. `AI 会话与同行评审监控`
87. `站点访问分析与爬虫统计`
88. `功能用量与同行评审漏斗`
89. `Token、点数、成本与未定价调用`
90. `邀请漏斗、首购返利与退款冲销`
91. `邀请活动配置`
92. `促销弹窗配置`
93. `AI Provider 与模型目录`
94. `第三方账号池与秘密 Reveal`
95. `系统模型绑定`
96. `分析矩阵系统维度`
97. `微信公众号自动回复`
98. `新闻 Webhook 与 dead letter`
99. `系统基础配置、邮件、短信与 Turnstile`
100. `自定义代码片段与注入风险`
101. `OAuth 与微信小程序配置`
102. `支付宝商户配置、测试与激活`
103. `微信支付商户、模式、测试与激活`

## 15. 最高优先级事实纠错

| 优先级 | 容易被写错的说法 | 源码支持的正确说法 | 证据入口 |
|---|---|---|---|
| P0 | “同行评审会替用户投稿并返回期刊收稿号” | 这是 AI 评审模拟；成功页追踪号是平台记录，不是期刊回执，也无外部投递动作。 | `features/peer-review/*`，尤其 `SubmitSuccessPage.tsx`、`api/submissions.ts` |
| P0 | “同行评审支持 200 MB 文件” | 页面说明写 200 MB，但实际正文校验 50 MB、附件每个 30 MB、最多 10 个。Wiki 必须写实际限制并标注 UI 待修。 | `features/peer-review/components/wizard/*`、`api/submissions.ts` |
| P0 | “后台点退款会向支付渠道自动退款” | 后台只登记；管理员须先在支付宝/微信完成退款，再填网关退款号。 | `features/admin/pages/OrdersPage.tsx`、`api/orders.ts` |
| P0 | “按会员等级发送消息可靠可用” | 页面仍按 legacy `subscription_plan` 选人，而主会员字段已是 `vip_tier`，存在发给 0 人/错人的风险；修复前不应对外承诺。 | `features/admin/api/messages.ts`、`pages/MessagesPage.tsx` |
| P0 | “营销页列出的文库能力都已上线” | 当前仅一级文件夹；无 PDF 批注/高亮；Zotero/EndNote 标记即将上线；AI 标签/平板同步未找到实装入口。 | `features/library/*`、`landing/pages/LibraryLandingPage.tsx` |
| P0 | “Pricing 数字是固定配额” | 页面是静态估算；真实用量取决于动态 points、倍率、模型价与全局计费开关。 | `landing/pages/PricingPage.tsx`、`admin/api/billing-config.ts`、`shared/api/membership.ts` |
| P0 | “进不了菜单就没有后台权限” | 子路由主要只有总后台 guard；菜单/按钮隐藏不是安全边界，API 必须鉴权。 | `admin/routes.tsx`、`permissions.ts`、`nav.ts` |
| P1 | “文库分享就是公开链接” | 分享可设提取码、过期、撤销和是否允许保存；单篇/期刊/集合行为不同。 | `library/pages/SharedReceivePage.tsx`、`shared/api/library-share.ts` |
| P1 | “取消收藏只移除收藏标记” | 会删除私有文库记录，并可能连带上传 PDF 与编辑元数据。 | `shared/api/user-library-mutations.ts`、`features/library/*` |
| P1 | “有微信/支付宝配置就能支付” | 只有商户 active 且 valid 才展示；微信还必须启用对应 native/h5/jsapi 场景。 | `admin/api/payment.ts`、`components/WechatPayPanel.tsx`、`WechatPayConfigDialog.tsx` |
| P1 | “促销关闭后所有活动权益都失效” | 促销与邀请是两套配置；邀请关闭只停止新曝光/绑定，既有绑定仍可能在窗口内兑现。 | `admin/api/invite-campaign.ts`、`promo-config.ts`，`shared/api/invite-campaign.ts` |
| P1 | “所有 AI 功能移动端等价可用” | 移动端原生支持 Claw，Prism/同行评审/矩阵/PPT/绘图/统计多为电脑端引导。 | `features/tools/pages/mobile/*`、各 mobile routes |
| P1 | “期刊可以收藏” | 当前期刊详情与列表没有稳定的收藏写动作；旧注释不能视为功能。 | `features/journals/*`、`features/browser/components/JournalDetailPane.tsx` |
| P2 | “OAuth 有 8 个提供方” | 当前普通 OAuth 6 个，加独立微信共 7 个；源码个别注释是旧口径。 | `features/auth/routes.tsx`、`admin/pages/OAuthConfigPage.tsx` |
| P2 | “所有页面支持英语/日语” | 营销页语言文字未形成完整 i18n 路由/资源切换链路。 | `features/landing/*` |

## 16. Coverage gaps

### 16.1 产品/实现缺口

1. **评审上传限制冲突**：200 MB 文案与 50/30 MB 实际校验冲突；时间预期也有 3–5 分钟与约 10 分钟两套口径。
2. **消息受众字段漂移**：`by_plan` 仍使用 `subscription_plan`；列表又不返回批量 specific IDs，发送前后均难审计真实受众。
3. **营销与实装漂移**：文库多级目录/批注/导入、真实投稿、评审编辑部流程、Prism 协作等均有过度承诺风险。
4. **静态定价漂移**：Pricing 的次数估算与后台动态计费没有单一事实源。
5. **检索控件缺口**：状态/请求模型有 `minCitations`（及 venue 相关能力），页面没有稳定可见控件。
6. **暂存区同步不确定**：本地 store 明确支持匿名持久化，但注释仍将登录后服务端迁移称为待 follow-up；必须经真实登录迁移测试后才能写“自动同步”。
7. **移动功能不对等**：Prism、同行评审、矩阵、PPT、绘图、统计没有原生移动工作区；`/m/search` 也只是回 Feed。
8. **移动文库校验不齐**：桌面有 50 文件夹前置限制，移动创建路径未找到相同客户端 guard；部分接口字段注释提到 public/private/access counts 尚未接齐。
9. **Skill 页面路由缺少 loader**：`/skills/mine`、`/skills/new` 依赖 API 401/页面兜底，而不是路由级登录保护。
10. **反馈长度口径不同**：用户页最多 2000 字，后端模型可能允许 5000；需要统一产品规则。
11. **订单检索不完整**：后台不能用订单号/交易号搜索，只能查用户字段。
12. **期刊收藏缺失**：界面展示了大量期刊信息，但没有与论文同等的收藏闭环。
13. **后台逐页权限不在 router loader 强制**：直接 URL 可进入壳，依赖页面/API 拒绝；需保持服务端测试覆盖。
14. **配置整行覆盖风险**：多个后台配置使用整行 PUT；虽有 `ConfigPageGuard`，并发管理员和旧缓存仍需后端版本控制。
15. **任意代码片段风险**：系统页可注入 HTML/JS；前端没有能力证明供应链安全、CSP 兼容或审计留存。
16. **旧入口链路仍在关键告警使用**：第三方健康告警跳 `/admin/third-party` 再 redirect，重构时易断。
17. **确认组件不统一**：部分 Skill 删除仍使用 `window.confirm`，无统一文案、无 typed confirmation，也不利于自动化测试。

### 16.2 本次静态审计尚未覆盖的验证

- 未启动浏览器逐路由点击，也未对 120 个产品 URL 做视觉回归、无障碍、断点或真实设备 UA 测试。
- 未用真实账号覆盖 visitor、Free、Pro、Max、operations、admin、super_admin 七类身份的 API 成功/403/配额状态。
- 未连接真实 STC/OpenAlex/PubMed、支付、OAuth、IMAP/SMTP、微信公众号、新闻 Webhook、Agent WebSocket，因此第三方返回结构和超时恢复只按前端代码记录。
- 未执行支付、退款、删除用户、批量消息、期刊发布、代码片段注入等破坏性或外部副作用流程。
- 运行时公开配置、后台开关、模型目录和会员计划会改变 UI；本文是代码基线，不是某一生产租户的即时截图。
- 只审计了 `frontend-user`；API 权限、数据库约束、计费原子性、任务调度和真实数值须与 `backend`/agent 审计交叉确认。
- 当前工作区已有 Wiki 开发中的未提交路由/文件；本文刻意排除它们，路由计数以创建分支时的现有产品为基线。

## 17. 建议的 Wiki 事实模板

每个独立条目至少维护以下字段，才能避免上述漂移：

1. **入口与角色**：桌面/移动路由、访客能否进入、哪个动作开始要求登录。
2. **用户能做什么**：正常路径、可逆/不可逆动作、是否会触发外部系统。
3. **状态**：加载、空态、错误、权限不足、额度耗尽、已过期/撤销、后台降级。
4. **限制**：数量、大小、时间、格式、分页、会员或模型限制；注明是前端前置还是后端硬限制。
5. **依赖**：对应页面、API hook、store、公共配置与后台开关。
6. **产品边界**：尤其 AI 模拟、自动生成、外部投稿、事实核验、真人服务之间的界线。
7. **最后核验版本**：commit、测试身份、运行时配置和核验日期。
