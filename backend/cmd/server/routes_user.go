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

	// OAuth 邮箱冲突合并确认中间页 —— 三个端点共享 merge_token,无需 user auth
	// (token 本身是凭据)。详见 internal/user/handler_oauth_merge.go。
	oauthMerge := api.Group("/user/oauth")
	{
		oauthMerge.GET("/pending-merge", h.user.GetPendingOAuthMerge)
		oauthMerge.POST("/confirm-merge", h.user.ConfirmPendingOAuthMerge)
		oauthMerge.POST("/cancel-merge", h.user.CancelPendingOAuthMerge)
	}
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
		userProtected.POST("/change-password", h.user.ChangePassword)

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
		// WS 路由独立挂出,自己校验 ?token= + sessionId 归属。
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
		userProtected.POST("/claw/session/ws-ticket", h.claw.IssueWSTicket)
		// 上传走通用 UploadLimitMiddleware (50MB 上限 + 业务码 7001), 跟 feedback/library upload 一致。
		userProtected.POST("/claw/upload", middleware.UploadLimitMiddleware(middleware.UploadMaxBodySize), h.claw.UploadAttachment)

		// 多会话 API — claw 侧边栏会话列表用。smart_search 故意不暴露这一组,
		// 保持单会话语义。详见 internal/agentbridge/bridge.go 多会话方法注释。
		userProtected.GET("/claw/sessions", h.claw.ListSessions)
		userProtected.POST("/claw/sessions", h.claw.CreateNewSession)
		userProtected.PATCH("/claw/sessions/:id", h.claw.RenameSession)
		userProtected.DELETE("/claw/sessions/:id", h.claw.DeleteSession)
		userProtected.POST("/claw/sessions/:id/activate", h.claw.ActivateSession)

		// 模型切换 — sidebar ModelSelector 下拉用。GET 列出可用 model tier,
		// 切换不走 HTTP, 直接在 WS 上发 set_runtime_config (agent 协议规定)。
		userProtected.GET("/claw/models", h.claw.ListModels)
	}

	// 智能搜索 · WS 桥接 (单独挂在 /user 下,不走 UserAuthMiddleware)
	// 路径: /api/v1/user/smart-search/ws/:sessionId?token=<jwt>
	api.GET("/user/smart-search/ws/:sessionId", h.smartSearch.HandleWS)
	// 智能助手 · WS 桥接 (同 smart-search 模式)
	api.GET("/user/claw/ws/:sessionId", h.claw.HandleWS)
}

