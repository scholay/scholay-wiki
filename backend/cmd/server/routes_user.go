// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package main

import (
	appconfig "scholar-backend/internal/common/config"
	"scholar-backend/internal/common/middleware"
	"scholar-backend/internal/peerreview"
	"scholar-backend/internal/peerreview2"

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

		// 账号可用性检查
		userProtected.POST("/check-email-availability", h.user.CheckEmailAvailability)
		userProtected.POST("/check-phone-availability", h.user.CheckPhoneAvailability)

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
		userProtected.POST("/bind-email-with-password", h.user.BindEmailWithPassword)
		userProtected.POST("/bind-phone-with-password", h.user.BindPhoneWithPassword)

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

		// 支付（保留支付宝支付逻辑）
		userProtected.POST("/payment/alipay/create", h.alipay.CreatePayment)
		if appconfig.AppConfig != nil && !appconfig.AppConfig.App.IsRelease {
			userProtected.POST("/payment/simulate", h.alipay.SimulatePayment)
		}
		userProtected.POST("/payment/wechat/create", h.wechatPay.CreatePayment)

		// 反馈
		userProtected.POST("/feedback", h.feedback.CreateFeedbackWithUser)

		// 任务历史
		userProtected.GET("/task-history", h.user.GetTaskHistory)

		// 站内信
		userProtected.GET("/messages", h.message.GetMessages)
		userProtected.GET("/messages/unread-count", h.message.GetUnreadCount)
		userProtected.GET("/messages/:id", h.message.GetMessage)
		userProtected.PUT("/messages/:id/read", h.message.MarkAsRead)
		userProtected.PUT("/messages/read-all", h.message.MarkAllAsRead)
		userProtected.DELETE("/messages/:id", h.message.DeleteMessage)

		// 对话
		userProtected.GET("/conversations", h.conversation.GetUserConversations)
		userProtected.POST("/conversations", h.conversation.CreateConversation)
		userProtected.GET("/conversations/:id", h.conversation.GetConversation)
		userProtected.DELETE("/conversations/:id", h.conversation.DeleteConversation)
		userProtected.POST("/conversations/:id/messages", h.conversation.AddMessage)
		userProtected.PUT("/conversations/:id/title", h.conversation.UpdateConversationTitle)
		userProtected.GET("/conversations/:id/messages/:messageId/advanced-search", h.conversation.StreamAdvancedSearch)
		userProtected.GET("/conversations/:id/messages/:messageId/follow-up-questions", h.conversation.GetFollowUpQuestions)
		userProtected.POST("/conversations/:id/continue", h.conversation.StreamContinueConversation)

		// 增强聊天
		userProtected.POST("/conversations/chat/new", h.chat.CreateConversationAndChat)
		userProtected.POST("/conversations/:id/chat/stream", h.chat.StreamChatMessage)
		userProtected.POST("/conversations/:id/chat", h.chat.QuickChat)
		userProtected.GET("/conversations/:id/tree", h.chat.GetMessageTree)
		userProtected.GET("/conversations/:id/history", h.chat.GetConversationHistory)
		userProtected.POST("/conversations/messages/:messageId/regenerate", h.chat.RegenerateMessage)
		userProtected.POST("/conversations/messages/:messageId/edit", h.chat.EditMessage)
		userProtected.GET("/conversations/messages/:messageId/siblings", h.chat.GetSiblingMessages)
		userProtected.GET("/conversations/messages/:messageId/branch", h.chat.GetBranchChain)

		// LaTeX Writer
		registerLatexWriterRoutes(userProtected, h)

		// 文献集 v1（单默认收藏夹）
		h.library.RegisterRoutes(userProtected)

		// 检索工作区 · 暂存区（每用户最多 5 个，每个最多 100 篇）
		h.stagingArea.RegisterRoutes(userProtected)
	}
}

// registerPeerReviewPublicRoutes 注册 AI 审稿路由（使用 OptionalUserAuth，支持匿名使用）
// 需要登录的操作（附件、任务列表等）在 handler 内部检查 user_id
func registerPeerReviewPublicRoutes(api *gin.RouterGroup, h *allHandlers, tieredRL gin.HandlerFunc) {
	g := api.Group("/user/peer-review")
	// DeviceIDMiddleware: 为匿名试用识别下发 HttpOnly cookie
	g.Use(middleware.OptionalUserAuthMiddleware(), peerreview.DeviceIDMiddleware(), tieredRL)
	{
		// 草稿管理（匿名：按 anon_token 查询；登录：按 user_id 查询）
		g.GET("/draft", h.peerReview.GetDraft)
		g.PUT("/draft", h.peerReview.SaveDraft)
		g.DELETE("/draft", h.peerReview.ClearDraft)

		// 上传和提交（匿名或登录均可）
		g.POST("/upload", h.peerReview.UploadFile)
		g.POST("/draft/submit", h.peerReview.SubmitDraft)

		// 任务管理
		g.POST("/tasks", h.peerReview.CreateTask)       // handler 内部要求登录
		g.GET("/tasks", h.peerReview.GetTaskList)       // handler 内部要求登录
		g.GET("/tasks/:id", h.peerReview.GetTaskDetail) // 匿名或登录均可（通过 anon_token 验证）
		g.GET("/tasks/:id/progress", h.peerReview.GetTaskProgress)
		g.GET("/tasks/:id/steps", h.peerReview.GetTaskSteps)
		g.GET("/tasks/:id/watch", h.peerReview.WatchTaskProgress)
		g.DELETE("/tasks/:id", h.peerReview.DeleteTask) // 匿名或登录均可（通过 anon_token 验证）
		g.POST("/tasks/:id/start", h.peerReview.StartTask)

		// 附件管理（handler 内部要求登录，防止匿名垃圾文件）
		g.POST("/attachments", h.peerReview.UploadAttachment)
		g.DELETE("/attachments/:id", h.peerReview.DeleteAttachment)
		g.DELETE("/manuscript", h.peerReview.DeleteManuscript)

		// 文件下载（匿名或登录均可）
		g.GET("/files/:id/download", h.peerReview.DownloadFile)

		// 匿名试用状态 & 登录后认领
		g.GET("/trial-status", h.peerReview.TrialStatus)
		g.POST("/claim-task", h.peerReview.ClaimTask) // 单任务认领（保留兼容）
		g.POST("/claim-all", h.peerReview.ClaimAll)   // 批量认领
	}
}

// registerPeerReviewV2Routes 注册 V2 审稿路由 (对接 peer.scholay.com)。
// 与老 peer-review 完全独立的路径前缀,支持匿名 (OptionalUserAuth + DeviceID 中间件)。
// 流式接口 /turns/:turn_id/stream 不进 tieredRL,避免长连接被限流误杀。
func registerPeerReviewV2Routes(api *gin.RouterGroup, h *allHandlers, tieredRL gin.HandlerFunc) {
	g := api.Group("/user/peer-review2")
	g.Use(middleware.OptionalUserAuthMiddleware(), peerreview2.DeviceIDMiddleware())
	{
		// 试用余额 & 认领 (无副作用,放限流外)
		g.GET("/trial-status", h.peerReview2.TrialStatus)
		g.POST("/claim-all", h.peerReview2.ClaimAll)

		// 列表 / 详情 / 删除 / 上传 (有副作用,过限流)
		rl := g.Group("", tieredRL)
		{
			rl.POST("/conversations", h.peerReview2.CreateConversation)
			rl.GET("/conversations", h.peerReview2.ListConversations)
			rl.GET("/conversations/:id", h.peerReview2.GetConversation)
			rl.DELETE("/conversations/:id", h.peerReview2.DeleteConversation)
			rl.GET("/conversations/:id/turns", h.peerReview2.ListTurns)
			rl.GET("/conversations/:id/messages", h.peerReview2.ListMessages)
			rl.POST("/conversations/:id/messages", h.peerReview2.SendMessage)
			rl.POST("/conversations/:id/pause", h.peerReview2.PauseConversation)
			rl.POST("/conversations/:id/resume", h.peerReview2.ResumeConversation)
		}

		// 流式接口:不走 tieredRL,长连接占席位会被误判
		g.GET("/conversations/:id/turns/:turn_id/stream", h.peerReview2.StreamTurn)
	}
}

// registerLatexWriterRoutes 注册 LaTeX Writer 路由
func registerLatexWriterRoutes(parent *gin.RouterGroup, h *allHandlers) {
	g := parent.Group("/latex-writer")
	{
		g.GET("/models", h.latexWriter.GetAvailableModels)
		g.POST("/chat/stream", h.latexWriter.StreamChat)
		g.POST("/task/stream", h.latexWriter.ExecuteTask)
		g.POST("/section/stream", h.latexWriter.ExecuteSection)
		g.GET("/tasks", h.latexWriter.GetAvailableTasks)
		g.GET("/sections", h.latexWriter.GetAvailableSections)
		g.GET("/files", h.latexWriter.GetDocuments)
		g.POST("/files", h.latexWriter.CreateDocument)
		g.GET("/files/:id", h.latexWriter.GetDocument)
		g.PUT("/files/:id", h.latexWriter.UpdateDocument)
		g.DELETE("/files/:id", h.latexWriter.DeleteDocument)
		g.GET("/documents/:id/conversation", h.latexWriter.GetDocumentConversation)
		g.GET("/documents/:id/conversation/messages", h.latexWriter.GetConversationHistory)
		g.POST("/documents/:id/chat/stream", h.latexWriter.StreamChatWithContext)
		g.DELETE("/documents/:id/conversation", h.latexWriter.ClearConversation)
		g.POST("/export/word", h.latexWriter.ExportToWord)
	}
}
