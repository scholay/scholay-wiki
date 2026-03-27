// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package main

import (
	"scholar-backend/internal/admin"
	"scholar-backend/internal/ai"
	appconfig "scholar-backend/internal/common/config"
	"scholar-backend/internal/common/middleware"
	"scholar-backend/internal/common/utils"
	"scholar-backend/internal/config"
	"scholar-backend/internal/conversation"
	"scholar-backend/internal/feedback"
	"scholar-backend/internal/hotcontent"
	"scholar-backend/internal/latexwriter"
	"scholar-backend/internal/mcp"
	"scholar-backend/internal/message"
	"scholar-backend/internal/payment"
	"scholar-backend/internal/pdf"
	"scholar-backend/internal/peerreview"
	"scholar-backend/internal/proxy"
	"scholar-backend/internal/semanticscholar"
	"scholar-backend/internal/thirdparty"
	"scholar-backend/internal/usagelog"
	"scholar-backend/internal/user"
	"scholar-backend/internal/wechat"
	"scholar-backend/internal/wechatofficial"
	"scholar-backend/internal/websocket"

	"github.com/gin-gonic/gin"
)

// allHandlers 聚合所有 handler 实例，用于路由注册
type allHandlers struct {
	admin          *admin.Handler
	dashboard      *admin.DashboardHandler
	user           *user.Handler
	config         *config.Handler
	scholar        *semanticscholar.Handler
	ai             *ai.Handler
	conversation   *conversation.Handler
	chat           *conversation.ChatHandler
	proxy          *proxy.Handler
	pdf            *pdf.Handler
	alipay         *payment.AlipayHandler
	wechatPay      *payment.WeChatPayHandler
	wechat         *wechat.Handler
	wechatOfficial *wechatofficial.Handler
	usageLog       *usagelog.Handler
	usageLogAdmin  *usagelog.AdminHandler
	hotContent     *hotcontent.Handler
	message        *message.Handler
	feedback       *feedback.Handler
	peerReview     *peerreview.Handler
	latexWriter    *latexwriter.Handler
	latexAgentAdmin *latexwriter.AdminHandler
	ws             *websocket.Handler
	thirdParty     *thirdparty.Handler
	mcpUnified     *mcp.UnifiedHandler
	mcpLegacy      *mcp.Handler
}

// registerRoutes 注册所有 API 路由
func registerRoutes(router *gin.Engine, h *allHandlers) {
	api := router.Group("/api/v1")
	{
		// WebSocket 端点（认证通过 URL 参数）
		api.GET("/ws", h.ws.HandleWebSocket)

		// 公共配置路由
		h.config.RegisterRoutes(api)

		// 管理员登录路由
		h.admin.RegisterRoutes(api)

		registerAdminRoutes(api, h)
		registerPaymentCallbackRoutes(api, h)
		registerPublicUserRoutes(api, h)
		registerProtectedUserRoutes(api, h)
		registerPublicAPIRoutes(api, h)
		registerAnalysisRoutes(api, h)
		registerScholarRoutes(api, h)
		registerMCPRoutes(api, h)

		// 代理端点
		h.proxy.RegisterRoutes(api, middleware.UserAuthMiddleware())
	}

	// 静态文件服务
	router.Static("/uploads", "./uploads")

	// 健康检查
	router.GET("/health", func(c *gin.Context) {
		utils.Success(c, gin.H{
			"status":  "ok",
			"service": "scholar-backend",
		})
	})

	// SEO 动态 sitemap
	router.GET("/sitemap-papers.xml", h.config.ServeDynamicSitemap)
	router.GET("/sitemap-index.xml", h.config.ServeSitemapIndex)

	// SPA 兜底路由（SSR 代码片段注入）
	router.NoRoute(func(c *gin.Context) {
		path := c.Request.URL.Path
		if isAPIOrStaticPath(path) {
			c.Status(404)
			return
		}
		h.config.ServeIndexHTML(c)
	})
}

// registerAdminRoutes 注册管理员受保护路由
func registerAdminRoutes(api *gin.RouterGroup, h *allHandlers) {
	adminProtected := api.Group("/admin")
	adminProtected.Use(middleware.AdminAuthMiddleware())
	{
		adminProtected.GET("/profile", h.admin.GetProfile)
		adminProtected.PUT("/password", h.admin.UpdatePassword)
		adminProtected.POST("/verify-password", h.admin.VerifyPassword)

		// 仪表板
		adminProtected.GET("/dashboard/statistics", h.dashboard.GetDashboardStatistics)

		// 系统配置
		adminProtected.PUT("/privacy-policy", h.config.UpdatePrivacyPolicy)
		adminProtected.PUT("/terms-of-service", h.config.UpdateTermsOfService)
		adminProtected.GET("/email-config", h.config.GetEmailConfig)
		adminProtected.PUT("/email-config", h.config.UpdateEmailConfig)
		adminProtected.POST("/email-config/test", h.config.TestEmailConfig)
		adminProtected.GET("/sms-config", h.config.GetSMSConfig)
		adminProtected.PUT("/sms-config", h.config.UpdateSMSConfig)
		adminProtected.POST("/sms-config/test", h.config.TestSMSConfig)
		adminProtected.PUT("/system-config", h.config.UpdateSystemConfig)
		adminProtected.GET("/github-config", h.config.GetGithubOAuthConfig)
		adminProtected.PUT("/github-config", h.config.UpdateGithubOAuthConfig)

		// 代码片段管理
		adminProtected.GET("/code-snippets", h.config.ListCodeSnippets)
		adminProtected.GET("/code-snippets/:id", h.config.GetCodeSnippet)
		adminProtected.POST("/code-snippets", h.config.CreateCodeSnippet)
		adminProtected.PUT("/code-snippets/:id", h.config.UpdateCodeSnippet)
		adminProtected.DELETE("/code-snippets/:id", h.config.DeleteCodeSnippet)

		// 用户管理
		adminProtected.GET("/users/stats", h.user.GetUserStatistics)
		adminProtected.GET("/users", h.user.GetUserList)
		adminProtected.GET("/users/online", h.user.GetOnlineUsers)
		adminProtected.GET("/users/:id", h.user.GetUserDetail)
		adminProtected.DELETE("/users/:id", h.user.DeleteUser)

		// 统计图表
		adminProtected.GET("/statistics/users", h.user.GetUserStatisticsChart)
		adminProtected.GET("/statistics/online", h.user.GetOnlineUserChart)

		// 第三方账号管理
		adminProtected.GET("/third-party-accounts", h.thirdParty.ListAccounts)
		adminProtected.POST("/third-party-accounts", h.thirdParty.CreateAccount)
		adminProtected.GET("/third-party-accounts/stats", h.thirdParty.GetStats)
		adminProtected.POST("/third-party-accounts/refresh-cache", h.thirdParty.RefreshCache)
		adminProtected.GET("/third-party-accounts/:id", h.thirdParty.GetAccount)
		adminProtected.PUT("/third-party-accounts/:id", h.thirdParty.UpdateAccount)
		adminProtected.DELETE("/third-party-accounts/:id", h.thirdParty.DeleteAccount)
		adminProtected.POST("/third-party-accounts/:id/test", h.thirdParty.TestAccount)

		// Prompt 模板管理
		adminProtected.GET("/prompt-templates", h.ai.ListPromptTemplates)
		adminProtected.POST("/prompt-templates", h.ai.CreatePromptTemplate)
		adminProtected.GET("/prompt-templates/:id", h.ai.GetPromptTemplate)
		adminProtected.PUT("/prompt-templates/:id", h.ai.UpdatePromptTemplate)
		adminProtected.DELETE("/prompt-templates/:id", h.ai.DeletePromptTemplate)

		// 分析维度管理
		adminProtected.GET("/analysis/dimensions", h.ai.AdminGetSystemDimensions)
		adminProtected.PUT("/analysis/dimensions/:id", h.ai.AdminUpdateSystemDimension)

		// 支付宝配置
		adminProtected.GET("/payment/alipay/config", h.alipay.GetActiveConfig)
		adminProtected.GET("/payment/alipay/configs", h.alipay.ListConfigs)
		adminProtected.POST("/payment/alipay/config", h.alipay.CreateConfig)
		adminProtected.PUT("/payment/alipay/config/:id", h.alipay.UpdateConfig)
		adminProtected.DELETE("/payment/alipay/config/:id", h.alipay.DeleteConfig)
		adminProtected.POST("/payment/alipay/config/:id/activate", h.alipay.SetActiveConfig)

		// 微信支付配置
		adminProtected.GET("/payment/wechat/config", h.wechatPay.GetActiveConfig)
		adminProtected.GET("/payment/wechat/configs", h.wechatPay.GetAllConfigs)
		adminProtected.POST("/payment/wechat/config", h.wechatPay.CreateConfig)
		adminProtected.PUT("/payment/wechat/config/:id", h.wechatPay.UpdateConfig)
		adminProtected.DELETE("/payment/wechat/config/:id", h.wechatPay.DeleteConfig)
		adminProtected.POST("/payment/wechat/config/:id/activate", h.wechatPay.ActivateConfig)

		// 微信 OAuth 配置
		adminProtected.GET("/wechat/config", h.wechat.GetActiveConfig)
		adminProtected.GET("/wechat/configs", h.wechat.ListConfigs)
		adminProtected.POST("/wechat/config", h.wechat.CreateConfig)
		adminProtected.PUT("/wechat/config/:id", h.wechat.UpdateConfig)
		adminProtected.DELETE("/wechat/config/:id", h.wechat.DeleteConfig)
		adminProtected.POST("/wechat/config/:id/activate", h.wechat.SetActiveConfig)

		// 微信公众号配置
		adminProtected.GET("/wechat-official/config", h.wechatOfficial.GetConfig)
		adminProtected.PUT("/wechat-official/config", h.wechatOfficial.UpdateConfig)

		// LaTeX Agent 配置
		adminProtected.GET("/latex-agent/config", h.latexAgentAdmin.GetAgentConfig)
		adminProtected.PUT("/latex-agent/config", h.latexAgentAdmin.UpdateAgentConfig)
		adminProtected.GET("/latex-agent/model-presets", h.latexAgentAdmin.GetModelPresets)
		adminProtected.GET("/latex-agent/config-options", h.latexAgentAdmin.GetConfigOptions)
		adminProtected.GET("/latex-agent/api-formats", h.latexAgentAdmin.GetAPIFormats)
		adminProtected.POST("/latex-agent/apply-preset", h.latexAgentAdmin.ApplyModelPreset)
		adminProtected.POST("/latex-agent/test-connection", h.latexAgentAdmin.TestConnection)
		adminProtected.GET("/latex-agent/models", h.latexAgentAdmin.ListModels)
		adminProtected.POST("/latex-agent/models", h.latexAgentAdmin.CreateModel)
		adminProtected.PUT("/latex-agent/models/:id", h.latexAgentAdmin.UpdateModel)
		adminProtected.DELETE("/latex-agent/models/:id", h.latexAgentAdmin.DeleteModel)
		adminProtected.POST("/latex-agent/models/:id/set-default", h.latexAgentAdmin.SetDefaultModel)

		// 反馈管理
		adminProtected.GET("/feedbacks", h.feedback.ListFeedbacks)
		adminProtected.GET("/feedbacks/stats", h.feedback.GetStats)
		adminProtected.GET("/feedbacks/:id", h.feedback.GetFeedback)
		adminProtected.PUT("/feedbacks/:id/status", h.feedback.UpdateStatus)
		adminProtected.POST("/feedbacks/:id/reply", h.feedback.ReplyFeedback)
		adminProtected.DELETE("/feedbacks/:id", h.feedback.DeleteFeedback)

		// 使用日志管理
		adminProtected.GET("/usage-logs", h.usageLogAdmin.List)
		adminProtected.GET("/usage-logs/summary", h.usageLogAdmin.GetStatsSummary)
		adminProtected.GET("/usage-logs/filter-options", h.usageLogAdmin.GetFilterOptions)
		adminProtected.GET("/usage-logs/features", h.usageLogAdmin.GetFeatureConfigs)
		adminProtected.GET("/usage-logs/config", h.usageLogAdmin.GetConfig)
		adminProtected.PUT("/usage-logs/config", h.usageLogAdmin.UpdateConfig)
		adminProtected.POST("/usage-logs/cleanup", h.usageLogAdmin.TriggerCleanup)
		adminProtected.DELETE("/usage-logs/all", h.usageLogAdmin.ClearAllLogs)

		// 热门内容管理
		adminProtected.GET("/hot-content/keywords", h.hotContent.GetHotKeywords)
		adminProtected.GET("/hot-content/papers", h.hotContent.GetHotPapers)
		adminProtected.GET("/hot-content/stats", h.hotContent.GetStats)
		adminProtected.POST("/hot-content/cleanup", h.hotContent.ManualCleanup)

		// 站内信管理
		adminProtected.POST("/messages", h.message.AdminCreateMessage)
		adminProtected.GET("/messages", h.message.AdminGetMessages)
		adminProtected.GET("/messages/stats", h.message.AdminGetMessageStats)
		adminProtected.GET("/messages/:id", h.message.AdminGetMessage)
		adminProtected.POST("/messages/:id/send", h.message.AdminSendMessage)
		adminProtected.POST("/message-templates", h.message.AdminCreateTemplate)
		adminProtected.GET("/message-templates", h.message.AdminGetTemplates)
		adminProtected.GET("/message-templates/:id", h.message.AdminGetTemplate)
		adminProtected.PUT("/message-templates/:id", h.message.AdminUpdateTemplate)
		adminProtected.DELETE("/message-templates/:id", h.message.AdminDeleteTemplate)

		// PDF 缓存管理
		adminProtected.GET("/pdf/cache/stats", h.pdf.GetCacheStats)
	}
}

// registerPaymentCallbackRoutes 注册支付回调路由（公开，无需认证）
func registerPaymentCallbackRoutes(api *gin.RouterGroup, h *allHandlers) {
	api.POST("/payment/alipay/notify", h.alipay.HandleCallback)
	api.POST("/payment/wechat/notify", h.wechatPay.HandleNotify)

	// PDF 下载
	api.POST("/pdf", h.pdf.GetPDF)

	// 微信公众号 webhook
	wechatOfficialWebhook := api.Group("/wechat-official")
	{
		wechatOfficialWebhook.GET("/webhook", h.wechatOfficial.HandleVerification)
		wechatOfficialWebhook.POST("/webhook", h.wechatOfficial.HandleMessage)
	}
}

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
}

// registerProtectedUserRoutes 注册用户受保护路由
func registerProtectedUserRoutes(api *gin.RouterGroup, h *allHandlers) {
	userProtected := api.Group("/user")
	userProtected.Use(middleware.UserAuthMiddleware())
	{
		userProtected.GET("/profile", h.user.GetProfile)
		userProtected.PUT("/profile", h.user.UpdateProfile)
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
		userProtected.POST("/bind-email-with-password", h.user.BindEmailWithPassword)
		userProtected.POST("/bind-phone-with-password", h.user.BindPhoneWithPassword)

		// 账号解绑
		userProtected.POST("/unbind-phone", h.user.UnbindPhone)
		userProtected.POST("/unbind-email", h.user.UnbindEmail)
		userProtected.POST("/unbind-wechat", h.user.UnbindWeChat)
		userProtected.POST("/unbind-github", h.user.UnbindGitHub)

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

		// AI 审稿
		registerPeerReviewRoutes(userProtected, h)

		// LaTeX Writer
		registerLatexWriterRoutes(userProtected, h)
	}
}

// registerPeerReviewRoutes 注册 AI 审稿路由
func registerPeerReviewRoutes(parent *gin.RouterGroup, h *allHandlers) {
	g := parent.Group("/peer-review")
	{
		g.GET("/draft", h.peerReview.GetDraft)
		g.PUT("/draft", h.peerReview.SaveDraft)
		g.DELETE("/draft", h.peerReview.ClearDraft)
		g.POST("/draft/submit", h.peerReview.SubmitDraft)
		g.POST("/tasks", h.peerReview.CreateTask)
		g.GET("/tasks", h.peerReview.GetTaskList)
		g.GET("/tasks/:id", h.peerReview.GetTaskDetail)
		g.GET("/tasks/:id/progress", h.peerReview.GetTaskProgress)
		g.GET("/tasks/:id/steps", h.peerReview.GetTaskSteps)
		g.GET("/tasks/:id/watch", h.peerReview.WatchTaskProgress)
		g.DELETE("/tasks/:id", h.peerReview.DeleteTask)
		g.POST("/tasks/:id/start", h.peerReview.StartTask)
		g.POST("/upload", h.peerReview.UploadFile)
		g.POST("/attachments", h.peerReview.UploadAttachment)
		g.DELETE("/attachments/:id", h.peerReview.DeleteAttachment)
		g.DELETE("/manuscript", h.peerReview.DeleteManuscript)
		g.GET("/files/:id/download", h.peerReview.DownloadFile)
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

// registerPublicAPIRoutes 注册公开 API 路由
func registerPublicAPIRoutes(api *gin.RouterGroup, h *allHandlers) {
	publicAPI := api.Group("/public")
	{
		publicAPI.GET("/papers/:paperId", h.scholar.GetPaper)
		publicAPI.POST("/papers/search", h.scholar.SearchPapers)
		publicAPI.POST("/papers/batch", h.scholar.GetPaperBatch)
		publicAPI.GET("/papers/autocomplete", h.scholar.PaperAutocomplete)
		publicAPI.GET("/search/suggestions", h.scholar.GetSearchSuggestions)
		publicAPI.GET("/analysis/dimensions", h.ai.GetSystemDimensions)
		publicAPI.GET("/recommendations/papers/:paperId", h.scholar.GetRecommendationsForPaper)
		publicAPI.GET("/author-detail/:authorId", h.scholar.GetAuthor)
		publicAPI.GET("/author-detail/:authorId/papers", h.scholar.GetAuthorPapers)
		publicAPI.POST("/feedback", h.feedback.CreateFeedback)
		publicAPI.POST("/feedback/upload", h.feedback.UploadAttachments)
		publicAPI.GET("/feedback/attachment/:id", h.feedback.GetAttachment)
		publicAPI.POST("/usage-log", h.usageLog.Log)
		publicAPI.POST("/translate/stream", h.ai.StreamTranslate)
		publicAPI.POST("/translate/paper/stream", h.ai.StreamTranslatePaper)
		publicAPI.GET("/hot-content/keywords", h.hotContent.GetRecentKeywords)
		publicAPI.GET("/hot-content/papers", h.hotContent.GetRecentPapers)
	}
}

// registerAnalysisRoutes 注册论文分析路由（已移除扣费中间件）
func registerAnalysisRoutes(api *gin.RouterGroup, h *allHandlers) {
	analysisGroup := api.Group("/analysis")
	analysisGroup.Use(middleware.UserAuthMiddleware())
	{
		analysisGroup.POST("/paper", h.ai.AnalyzePaper)
		analysisGroup.POST("/papers/batch", h.ai.BatchAnalyzePapers)
		analysisGroup.GET("/dimensions", h.ai.GetAnalysisDimensions)
		analysisGroup.POST("/dimensions", h.ai.CreateUserDimension)
		analysisGroup.PUT("/dimensions/:id", h.ai.UpdateUserDimension)
		analysisGroup.DELETE("/dimensions/:id", h.ai.DeleteUserDimension)
		analysisGroup.DELETE("/dimensions/reset/:dimensionKey", h.ai.ResetUserDimension)
		analysisGroup.DELETE("/dimensions/reset-all", h.ai.ResetAllUserDimensions)
		analysisGroup.POST("/dimensions/copy-from-system", h.ai.CopySystemDimensionsToUser)
	}
}

// registerScholarRoutes 注册学术搜索路由
func registerScholarRoutes(api *gin.RouterGroup, h *allHandlers) {
	scholar := api.Group("/scholar")
	scholar.Use(middleware.UserAuthMiddleware())
	{
		scholar.POST("/papers/search", h.scholar.SearchPapers)
		scholar.GET("/papers/:paperId", h.scholar.GetPaper)
		scholar.POST("/papers/batch", h.scholar.GetPaperBatch)
		scholar.GET("/papers/:paperId/citations", h.scholar.GetPaperCitations)
		scholar.GET("/papers/:paperId/references", h.scholar.GetPaperReferences)
		scholar.GET("/papers/:paperId/authors", h.scholar.GetPaperAuthors)
		scholar.GET("/authors/search", h.scholar.SearchAuthors)
		scholar.GET("/authors/:authorId", h.scholar.GetAuthor)
		scholar.GET("/authors/:authorId/papers", h.scholar.GetAuthorPapers)
		scholar.GET("/recommendations/papers/:paperId", h.scholar.GetRecommendationsForPaper)
		scholar.POST("/recommendations/papers", h.scholar.GetRecommendations)
	}
}

// registerMCPRoutes 注册 MCP 路由
func registerMCPRoutes(api *gin.RouterGroup, h *allHandlers) {
	mcpGroup := api.Group("/mcp")
	mcpGroup.Use(middleware.UserAuthMiddleware())
	{
		mcpGroup.GET("/tools", h.mcpUnified.ListAllTools)
		mcpGroup.GET("/tools/llm", h.mcpUnified.GetToolsForLLM)
		mcpGroup.GET("/tools/category/:category", h.mcpUnified.ListToolsByCategory)
		mcpGroup.GET("/tools/:name", h.mcpUnified.GetTool)
		mcpGroup.POST("/call", h.mcpUnified.CallTool)
		mcpGroup.POST("/batch", h.mcpUnified.BatchCallTools)
	}

	mcpLegacy := api.Group("/mcp-legacy")
	mcpLegacy.Use(middleware.UserAuthMiddleware())
	{
		mcpLegacy.GET("/tools", h.mcpLegacy.ListTools)
		mcpLegacy.POST("/call", h.mcpLegacy.CallTool)
	}
}

// isAPIOrStaticPath 判断路径是否为 API、上传或静态资源路径
func isAPIOrStaticPath(path string) bool {
	if len(path) >= 5 && path[:5] == "/api/" {
		return true
	}
	if len(path) >= 9 && path[:9] == "/uploads/" {
		return true
	}
	if len(path) >= 8 && path[:8] == "/health" {
		return true
	}
	return isStaticAsset(path)
}
