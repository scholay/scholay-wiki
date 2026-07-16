// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package main

import (
	"scholar-backend/internal/common/middleware"
	"scholar-backend/internal/peerreview"

	"github.com/gin-gonic/gin"
)

// registerPublicUserRoutes 注册公开的用户路由（无需认证）
func registerPublicUserRoutes(api *gin.RouterGroup, h *allHandlers) {
	h.user.RegisterRoutes(api)

	wechatPublic := api.Group("/user/wechat")
	{
		wechatPublic.GET("/login-url", h.wechat.GetLoginURL)
		wechatPublic.GET("/qrcode-config", h.wechat.GetQRCodeConfig)
		wechatPublic.POST("/callback", h.user.WeChatCallback)
		// 小程序 wx.login 一键登录(jscode2session → 复用 LoginOrRegisterWithWeChat)。
		// 免登录;账号自动建号,IP 限流已在 api 组顶层挂。
		wechatPublic.POST("/miniprogram/login", h.user.MiniProgramLogin)
	}

	githubPublic := api.Group("/user/github")
	{
		githubPublic.GET("/login-url", h.user.GetGithubLoginURL)
		githubPublic.GET("/callback", h.user.GithubCallback)
	}

	googlePublic := api.Group("/user/google")
	{
		googlePublic.GET("/client-id", h.user.GetGoogleClientID)
		googlePublic.POST("/id-token-login", h.user.GoogleIDTokenLogin)
	}

	orcidPublic := api.Group("/user/orcid")
	{
		orcidPublic.GET("/login-url", h.user.GetOrcidLoginURL)
		orcidPublic.GET("/callback", h.user.OrcidCallback)
	}

	applePublic := api.Group("/user/apple")
	{
		applePublic.GET("/login-url", h.user.GetAppleLoginURL)
		applePublic.POST("/callback", h.user.AppleCallback)
	}

	microsoftPublic := api.Group("/user/microsoft")
	{
		microsoftPublic.GET("/login-url", h.user.GetMicrosoftLoginURL)
		microsoftPublic.GET("/callback", h.user.MicrosoftCallback)
	}

	discoursePublic := api.Group("/user/discourse")
	{
		discoursePublic.GET("/login-url", h.user.GetDiscourseSSOLoginURL)
		discoursePublic.GET("/callback", h.user.DiscourseSSOCallback)
	}

	// OAuth 邮箱冲突合并确认中间页 —— pending-merge(读摘要)/ cancel-merge(新建独立账号)
	// 无需 auth(merge_token 是凭据);但 confirm-merge(并入已有账号)改为受保护路由,
	// 见 registerProtectedUserRoutes —— 必须先登录目标账号本人,只持 merge_token 不足以合并。
	oauthMerge := api.Group("/user/oauth")
	{
		oauthMerge.GET("/pending-merge", h.user.GetPendingOAuthMerge)
		oauthMerge.POST("/cancel-merge", h.user.CancelPendingOAuthMerge)
	}

	// (已移除)scholar_agent token 用量 HTTP 旁路回调:token 账本改走带内 —— agent 把 per-call
	// 明细 + 会话累计随 message_complete / token_usage 帧经已鉴权 WS 带回, 后端在 ws.go pipe 记账
	// (归属来自会话本身,无需反查 / 无需内网共享密钥)。InternalAgentAuthMiddleware 已无调用方。

	// 计费套餐(公开):价格/倍率/赠送/起充等非敏感配置, 给落地价格页 + 套餐卡用。
	api.GET("/billing/plans", h.vip.PublicPlans)

	// ── Skills 市场公开端点(免登录;只服务 public+approved+active)——
	// 跨 agent 分发:install.md 安装说明 / marketplace.json 目录 / :slug/download tar.gz /
	// :slug 匿名详情(分享落地页)/ :slug/SKILL.md 原始文本。静态段(install.md/marketplace.json)
	// 与 :slug param 在 gin 1.9 同层共存(静态优先)。
	api.GET("/skills/install.md", h.skillMarket.InstallMd)
	api.GET("/skills/marketplace.json", h.skillMarket.MarketplaceJSON)
	api.GET("/skills/:slug/download", h.skillMarket.DownloadBundle)
	api.GET("/skills/:slug/SKILL.md", h.skillMarket.PublicSkillMd)
	api.GET("/skills/:slug", h.skillMarket.PublicDetail)
}

// registerProtectedUserRoutes 注册用户受保护路由
func registerProtectedUserRoutes(api *gin.RouterGroup, h *allHandlers, tieredRL gin.HandlerFunc) {
	userProtected := api.Group("/user")
	userProtected.Use(middleware.UserAuthMiddleware(), tieredRL)
	{
		userProtected.GET("/profile", h.user.GetProfile)
		userProtected.PUT("/profile", h.user.UpdateProfile)
		// 「设置 → 已连接账号」一站拉全:邮箱/手机 + 8 个第三方 provider 的状态
		userProtected.GET("/connections", h.user.GetUserConnections)
		userProtected.POST("/logout", h.user.Logout)
		userProtected.POST("/logout-all", h.user.LogoutAll) // 一键退出所有设备(user-level revoke)
		userProtected.POST("/change-password", h.user.ChangePassword)

		// 站内信 WS 一次性 ticket:前端拿它升级 /api/v1/ws(替代裸 JWT in query)。
		userProtected.POST("/ws-ticket", h.ws.IssueWSTicket)

		// OAuth 合并「确认并入已有账号」—— 受保护:JWT 证明你就是目标账号本人,
		// FinalizePendingMerge 再校验 userID == merge 目标。详见 handler_oauth_merge.go。
		userProtected.POST("/oauth/confirm-merge", h.user.ConfirmPendingOAuthMerge)

		// 会员(VIP): 状态(等级/到期/今日 token 额度/经费余额) + 兑换码兑换
		userProtected.GET("/membership", h.vip.GetMembership)
		// 模型目录(P2 用户选模型):对话选择器的可选模型列表(?feature=smart_search|claw|prism)
		userProtected.GET("/models", h.modelCatalog.ListUserModels)
		userProtected.POST("/redeem-code/preview", h.vip.PreviewCode) // 兑换前预览(确认弹窗)
		userProtected.POST("/redeem-code", h.vip.RedeemCode)

		// 期刊投稿资源下载(投稿须知 .md / LaTeX 模板 .zip)—— Max 会员专享。
		// 后端校验 tier=max + 代理拉取(上游 key 与真实下载地址都不暴露给前端)。
		userProtected.GET("/journals/:id/submission/:kind", h.scholar.DownloadJournalSubmission)

		// 计费/账户资产: 总览 + 手动重置额度 + 经费流水(自动重置开关已下线)
		billingG := userProtected.Group("/billing")
		{
			billingG.GET("/overview", h.vip.BillingOverview)
			billingG.POST("/reset", h.vip.ResetQuota)
			billingG.GET("/transactions", h.vip.ListTransactions)
			billingG.GET("/usage-calendar", h.vip.UsageCalendar)   // 当月每日 token 用量(热力图)
			billingG.GET("/orders", h.vip.ListOrders)              // 已支付订单明细(明细查看)
			billingG.POST("/recharge", h.vip.CreateRecharge)       // 建充值订单
			billingG.GET("/subscribe/quote", h.vip.SubscribeQuote) // 订阅/续期/升级报价(不建单)
			billingG.POST("/subscribe", h.vip.CreateSubscription)  // 建订阅订单
			billingG.POST("/test-pay", h.vip.TestPay)              // 测试支付(PAYMENT_TEST_ENABLED 时可用)
		}

		// 智能写作 (Prism · LaTeX IDE): 项目/文件 CRUD + 编译(异步)+ 取 PDF。
		prismG := userProtected.Group("/prism")
		{
			prismG.POST("/projects", h.prism.CreateProject)
			prismG.GET("/projects", h.prism.ListProjects)
			prismG.GET("/projects/:id", h.prism.GetProject)
			prismG.PATCH("/projects/:id", h.prism.UpdateProject)
			prismG.DELETE("/projects/:id", h.prism.DeleteProject)
			prismG.GET("/projects/:id/files/:fileId", h.prism.GetFile)
			prismG.PUT("/projects/:id/files/:fileId", h.prism.SaveFile)
			prismG.POST("/projects/:id/files", h.prism.CreateFile)
			prismG.POST("/projects/:id/files/:fileId/rename", h.prism.RenameFile)
			prismG.DELETE("/projects/:id/files/:fileId", h.prism.DeleteFile)
			prismG.POST("/projects/:id/compile", h.prism.Compile)
			prismG.GET("/projects/:id/compile/:compileId", h.prism.GetCompile)
			prismG.GET("/projects/:id/pdf", h.prism.GetPDF)
			// 历史:文件版本(查看/回滚)。对话历史走 WS 的 /session/messages(agent jsonl)。
			prismG.GET("/projects/:id/files/:fileId/versions", h.prism.ListVersions)
			prismG.POST("/projects/:id/files/:fileId/versions/:versionId/restore", h.prism.RestoreVersion)
			// \cite 文献库 RAG(检索真实库行 + 写 references.bib)
			prismG.GET("/projects/:id/cite/search", h.prism.CiteSearch)
			prismG.POST("/projects/:id/cite/apply", h.prism.CiteApply)
			// struct 轨(新版结构体工作台)—— 见 docs/research/prism-render-surface-2026-06 Part III。
			prismG.GET("/templates", h.prism.ListTemplates)
			prismG.GET("/projects/:id/struct", h.prism.GetStruct)
			prismG.PUT("/projects/:id/struct", h.prism.SaveStruct)
			prismG.GET("/projects/:id/struct/versions", h.prism.ListStructVersions)                       // 结构体版本历史
			prismG.POST("/projects/:id/struct/versions/:versionId/restore", h.prism.RestoreStructVersion) // 恢复某历史版本
			prismG.POST("/projects/:id/template", h.prism.SetJournalTemplate) // 确定性换刊
			prismG.GET("/projects/:id/conformance", h.prism.GetConformance)
			// 写作画像(Phase 3):base 文体/学科人格。查看 + 用户覆盖 + planner 自动识别。
			prismG.GET("/projects/:id/writing-profile", h.prism.GetWritingProfile)
			prismG.PUT("/projects/:id/writing-profile", h.prism.SetWritingProfile)
			prismG.POST("/projects/:id/writing-profile/plan", h.prism.PlanWritingProfile)
			// 质量回执(Phase 4):确定性双轨检查(悬空引用/未定义交叉引用/前置缺失/超长句)。
			prismG.GET("/projects/:id/quality-check", h.prism.GetQualityCheck)
			// 快通道评议(V3-4.5-1):选区级只读点评(解释/找漏洞/审稿人视角),结果进 popover 不碰正文。
			prismG.POST("/projects/:id/inline-review", h.prism.InlineReview)
			// 修改意见回应工作流(V4-③):粘贴任何修改意见 → 拆条 → 逐条改稿 → response letter。
			prismG.POST("/projects/:id/revision/parse", h.prism.ParseRevision)
			prismG.GET("/projects/:id/revision", h.prism.ListRevision)
			prismG.PATCH("/projects/:id/revision/:itemId", h.prism.UpdateRevision)
			prismG.GET("/projects/:id/revision/letter", h.prism.RevisionLetter)
			// 数字成员校验(V4-⑤ 轻版):生成段数字 ⊆ 源表数字(纯函数零存储)。
			prismG.POST("/projects/:id/verify-numbers", h.prism.VerifyNumbers)
			// 项目术语表(V4-④):真源 DB,轮前物化 cwd terminology.md。
			prismG.GET("/projects/:id/terminology", h.prism.GetTerminology)
			prismG.PUT("/projects/:id/terminology", h.prism.PutTerminology)
			prismG.POST("/projects/:id/clone-to-struct", h.prism.CloneToStruct) // 逃生口:旧项目→新版
			prismG.GET("/projects/:id/export/docx", h.prism.ExportDocx)        // struct→Pandoc→Word
			prismG.POST("/projects/:id/assets", h.prism.UploadAsset)           // 上传图片 → figure 块
			// agent-native 用户 WS 编辑(实时流式 + diff + 应用门 + 重入续流)。
			// 输入框附件:上传 / 引用文献集 —— agentattach 通用实现(2026-07-14 三 feature
			// 输入框统一);会话 per-project,handler 内解析。上传走通用 UploadLimitMiddleware。
			prismG.POST("/projects/:id/upload", middleware.UploadLimitMiddleware(middleware.UploadMaxBodySize), h.prism.UploadAttachment)
			prismG.POST("/projects/:id/reference", h.prism.ReferenceLibrary)
			prismG.GET("/projects/:id/session/file", h.prism.GetSessionImage) // 历史回放图片缩略图/放大(cookie 鉴权)
			// AI 对话走下面独立挂的 /prism/ws/:sessionId;这里是轮次边界 HTTP 端点。
			prismG.POST("/projects/:id/ws-ticket", h.prism.IssueWSTicket)
			prismG.POST("/projects/:id/session/reset", h.prism.ResetSession) // 手动重开会话(V3-4.6-1:文稿零损失)
			prismG.GET("/projects/:id/session/messages", h.prism.GetWSMessages)
			prismG.GET("/projects/:id/session/context", h.prism.GetContext)       // 上下文水位(token 占用)
			prismG.POST("/projects/:id/round/prepare", h.prism.PrepareRound)      // 铺源 DB→cwd
			prismG.GET("/projects/:id/round/pending", h.prism.PendingRound)       // 待应用 diff(重入)
			prismG.POST("/projects/:id/round/apply", h.prism.ApplyRound)          // 固化 cwd→DB
			prismG.POST("/projects/:id/round/reject", h.prism.RejectRound)        // 丢弃(重铺源还原)
			prismG.GET("/projects/:id/workspace/file", h.prism.ReadWorkspaceFile) // 读 cwd(实时 diff refetch)
		}

		// 账号绑定
		userProtected.POST("/bind-phone", h.user.BindPhone)
		userProtected.POST("/bind-email", h.user.BindEmail)
		userProtected.POST("/bind-wechat", h.user.BindWeChatAccount)
		userProtected.POST("/bind-github", h.user.BindGitHubAccount)
		userProtected.POST("/bind-google", h.user.BindGoogleAccount)
		userProtected.POST("/bind-apple", h.user.BindAppleAccount)
		// Apple form_post 流的「绑定」入口:颁发 bind_nonce + 把 user_id 写入 Redis,
		// 然后返回 Apple 授权 URL(state 含 "bind:<nonce>")。AppleCallback 解析到
		// "bind:" state 前缀就走绑定分支,直接 302 重定向回前端 /apple/callback?bind=success
		userProtected.GET("/apple/bind-url", h.user.GetAppleBindURL)
		userProtected.POST("/bind-orcid", h.user.BindOrcidAccount)
		userProtected.POST("/bind-microsoft", h.user.BindMicrosoftAccount)
		userProtected.POST("/bind-discourse", h.user.BindDiscourseAccount)

		// 账号解绑
		userProtected.POST("/unbind-phone", h.user.UnbindPhone)
		userProtected.POST("/unbind-email", h.user.UnbindEmail)
		userProtected.POST("/unbind-wechat", h.user.UnbindWeChat)
		userProtected.POST("/unbind-github", h.user.UnbindGitHub)
		userProtected.POST("/unbind-google", h.user.UnbindGoogle)
		userProtected.POST("/unbind-apple", h.user.UnbindApple)
		userProtected.POST("/unbind-orcid", h.user.UnbindOrcid)
		userProtected.POST("/unbind-microsoft", h.user.UnbindMicrosoft)
		userProtected.POST("/unbind-discourse", h.user.UnbindDiscourse)

		// 支付 (用户端支付发起;simulate 调试入口已下线)
		userProtected.POST("/payment/alipay/create", h.alipay.CreatePayment)
		userProtected.POST("/payment/wechat/create", h.wechatPay.CreatePayment)

		// 反馈
		userProtected.POST("/feedback", h.feedback.CreateFeedbackWithUser)

		// 小程序内容安全预检(UGC 发送前调用;违规拦在发送前,过审硬前置)
		userProtected.POST("/wechat/msg-check", h.user.CheckContent)

		// 小程序手机号绑定(wx.getPhoneNumber code → 换手机号 → 绑到当前账号)
		userProtected.POST("/wechat/miniprogram/bind-phone", h.user.BindMiniProgramPhone)

		// 站内信 (前端只用 list + unread-count + read + read-all + delete; 单条 GET 已下线)
		userProtected.GET("/messages", h.message.GetMessages)
		userProtected.GET("/messages/unread-count", h.message.GetUnreadCount)
		userProtected.PUT("/messages/:id/read", h.message.MarkAsRead)
		userProtected.PUT("/messages/read-all", h.message.MarkAllAsRead)
		userProtected.DELETE("/messages/:id", h.message.DeleteMessage)

		// 文献集 v1（单默认收藏夹）
		h.library.RegisterRoutes(userProtected)

		// 检索工作区 · 暂存区（每用户最多 5 个，每个最多 100 篇）
		h.stagingArea.RegisterRoutes(userProtected)

		// 智能搜索 · 用户唯一会话 (HTTP)。
		// WS 端点不放这里 —— 浏览器 WS 不能带 Authorization header,
		// WS 路由独立挂出,自己校验 ?ws_token=<ticket> + sessionId 归属。
		//
		// 改造背景: 0.2 之前是 "每次进页面新建 session 不留映射",留下大量孤儿 jsonl。
		// 现在改成 1 用户 1 行的持久化绑定 (smart_search_sessions),get-or-create
		// 复用、reset 显式换。详见 docker/mysql/migrations/0050_smart_search_sessions_fields.sql。
		userProtected.GET("/smart-search/session", h.smartSearch.GetSession)
		userProtected.POST("/smart-search/session/reset", h.smartSearch.ResetSession)
		userProtected.GET("/smart-search/session/messages", h.smartSearch.GetSessionMessages)
		userProtected.GET("/smart-search/session/context", h.smartSearch.GetContextEstimate)
		// 一次性短命 ws ticket 颁发 —— 前端打开 WS 前调一次,30s TTL, 用即销毁。
		// 替代直接把 JWT 放到 WS URL query (会被 nginx access log 落盘长期暴露)。
		userProtected.POST("/smart-search/session/ws-ticket", h.smartSearch.IssueWSTicket)
		// 输入框附件:上传 / 引用文献集 —— 与 claw 同一套 agentattach 实现
		// (2026-07-14 三 feature 输入框统一)。上传同样走通用 UploadLimitMiddleware。
		userProtected.POST("/smart-search/upload", middleware.UploadLimitMiddleware(middleware.UploadMaxBodySize), h.smartSearch.UploadAttachment)
		userProtected.POST("/smart-search/reference", h.smartSearch.ReferenceLibrary)
		userProtected.GET("/smart-search/session/file", h.smartSearch.GetSessionFile) // 历史回放图片缩略图/放大(cookie 鉴权)

		// 多会话 (2026-07: 与 claw 同型 ChatGPT 风格会话列表)。前端侧边栏会话历史 + "新对话" 用。
		// messages/context/ws-ticket 上面几行已支持 ?session_id= 指定会话。
		userProtected.GET("/smart-search/sessions", h.smartSearch.ListSessions)
		userProtected.POST("/smart-search/sessions", h.smartSearch.CreateNewSession)
		userProtected.PATCH("/smart-search/sessions/:id", h.smartSearch.RenameSession)
		userProtected.POST("/smart-search/sessions/:id/rename", h.smartSearch.RenameSession) // 别名: 兼容不支持 PATCH 的客户端
		userProtected.DELETE("/smart-search/sessions/:id", h.smartSearch.DeleteSession)
		userProtected.POST("/smart-search/sessions/:id/activate", h.smartSearch.ActivateSession)

		// 智能审稿 v3 —— 投稿 wizard + 审稿记录 + agent 编排的 4 份报告。
		// 路由表见 internal/peerreview/routes.go, 全部需要登录。
		peerreview.RegisterRoutes(userProtected.Group("/peer-review"), h.peerReview)

		// 智能助手 (Claw) — 通用对话 + 文件 / 图片上传 + Minicod MCP 检索。
		// 跟 smart-search 一样的 session / ws-ticket 模式, 额外多一个 upload 端点。
		userProtected.GET("/claw/session", h.claw.GetSession)
		userProtected.POST("/claw/session/reset", h.claw.ResetSession)
		userProtected.GET("/claw/session/messages", h.claw.GetSessionMessages)
		userProtected.GET("/claw/session/context", h.claw.GetContextEstimate)
		// 历史回放里图片缩略图/放大: 浏览器 <img src> 按 path 回取会话 cwd 内的原图 (cookie 鉴权)。
		userProtected.GET("/claw/session/file", h.claw.GetSessionFile)
		// 成果交付: 列出会话 ./out 交付目录的产物 + 下载/预览单个产物 (agent 产出 → web 用户)。
		userProtected.GET("/claw/session/artifacts", h.claw.GetSessionArtifacts)
		userProtected.GET("/claw/artifact/:id", h.claw.DownloadArtifactByID)        // MinIO 交付物按 id 取(预览/下载)
		userProtected.GET("/claw/session/artifact", h.claw.DownloadSessionArtifact) // 实时回退(storage 未启用)
		userProtected.GET("/claw/session/artifact.zip", h.claw.DownloadArtifactZip) // 实时回退:目录打包下载
		userProtected.POST("/claw/session/ws-ticket", h.claw.IssueWSTicket)
		// 上传走通用 UploadLimitMiddleware (50MB 上限 + 业务码 7001), 跟 feedback/library upload 一致。
		userProtected.POST("/claw/upload", middleware.UploadLimitMiddleware(middleware.UploadMaxBodySize), h.claw.UploadAttachment)
		userProtected.POST("/claw/reference", h.claw.ReferenceLibrary) // 引用文献集论文/文件夹 → 物化进会话 cwd

		// 多会话 API — claw 侧边栏会话列表用。smart_search 故意不暴露这一组,
		// 保持单会话语义。详见 internal/agentbridge/bridge.go 多会话方法注释。
		userProtected.GET("/claw/sessions", h.claw.ListSessions)
		userProtected.POST("/claw/sessions", h.claw.CreateNewSession)
		userProtected.PATCH("/claw/sessions/:id", h.claw.RenameSession)
		// POST 别名:微信小程序 wx.request 不支持 PATCH,给它一条 POST 通道(同 handler)。
		userProtected.POST("/claw/sessions/:id/rename", h.claw.RenameSession)
		userProtected.DELETE("/claw/sessions/:id", h.claw.DeleteSession)
		userProtected.POST("/claw/sessions/:id/activate", h.claw.ActivateSession)

		// 模型切换 — sidebar ModelSelector 下拉用。GET 列出可用 model tier,
		// 切换不走 HTTP, 直接在 WS 上发 set_runtime_config (agent 协议规定)。
		userProtected.GET("/claw/models", h.claw.ListModels)

		// 数学公式渲染:TeX → PNG(agent MathJax 渲染 + Redis 缓存)。小程序 rich-text
		// 跑不了 KaTeX,前端把 $$…$$ 送这里换成图内联。挂 claw handler 仅为复用 AgentClient。
		userProtected.POST("/render/math", h.claw.RenderMath)
		userProtected.POST("/render/mermaid", h.claw.RenderMermaid) // 图表 → PNG(agent Chromium,Redis 长缓存)

		// per-user 长期记忆 (C4): 查看/编辑/删除自己的记忆块 (隐私/GDPR)。
		// agent 侧注入(读)由 agentbridge.Bridge 负责, 不在此暴露; 这里只给用户管理面。
		userProtected.GET("/memory", h.memory.List)
		userProtected.PUT("/memory/:label", h.memory.SetBlock)
		userProtected.DELETE("/memory/:label", h.memory.DeleteBlock)
		userProtected.DELETE("/memory", h.memory.Clear)

		// ── Skills 市场(用户上传/分享 skill + claw 动态加载)──
		// 注:userProtected 组前缀已是 /api/v1/user,故此处路径不再带 /user(否则会变成 /user/user/…)。
		// 浏览 / 详情 / 举报
		userProtected.GET("/skills/market", h.skillMarket.ListMarket)
		userProtected.GET("/skills/market/:idOrSlug", h.skillMarket.GetDetail)
		userProtected.POST("/skills/report/:id", h.skillMarket.Report)
		// 我的 skills(上传走通用 UploadLimitMiddleware,与 feedback/claw 一致;bundle ≤2MB)
		userProtected.GET("/skills", h.skillMarket.ListMySkills)
		userProtected.POST("/skills", middleware.UploadLimitMiddleware(middleware.UploadMaxBodySize), h.skillMarket.CreateSkill)
		userProtected.PATCH("/skills/:id", h.skillMarket.UpdateMeta)
		userProtected.PUT("/skills/:id/content", middleware.UploadLimitMiddleware(middleware.UploadMaxBodySize), h.skillMarket.UpdateContent)
		userProtected.POST("/skills/:id/publish", h.skillMarket.Publish)
		userProtected.POST("/skills/:id/unpublish", h.skillMarket.Unpublish)
		userProtected.DELETE("/skills/:id", h.skillMarket.DeleteSkill)
		// 安装 / 启用(claw 启用面板)—— 独立 path 段避免与 /skills/:id 的 param 混淆
		userProtected.GET("/skill-installs", h.skillMarket.ListInstalled)
		userProtected.POST("/skill-installs", h.skillMarket.Install)
		userProtected.PATCH("/skill-installs/:id", h.skillMarket.SetEnabled)
		userProtected.DELETE("/skill-installs/:id", h.skillMarket.Uninstall)
	}

	// 智能搜索 · WS 桥接 (单独挂在 /user 下,不走 UserAuthMiddleware)
	// 路径: /api/v1/user/smart-search/ws/:sessionId?ws_token=<ticket> (30s 一次性, 用即销毁)
	api.GET("/user/smart-search/ws/:sessionId", h.smartSearch.HandleWS)
	// 智能助手 · WS 桥接 (同 smart-search 模式)
	api.GET("/user/claw/ws/:sessionId", h.claw.HandleWS)
	// 智能写作 (Prism) · WS 桥接 (ticket 已校验项目归属;agent-native 实时编辑)
	api.GET("/user/prism/ws/:sessionId", h.prism.HandleWS)
}
