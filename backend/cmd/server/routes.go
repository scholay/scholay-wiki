// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package main

import (
	"scholar-backend/internal/admin"
	"scholar-backend/internal/agent"
	"scholar-backend/internal/ai"
	"scholar-backend/internal/config"
	"scholar-backend/internal/conversation"
	"scholar-backend/internal/feedback"
	"scholar-backend/internal/hotcontent"
	"scholar-backend/internal/latexwriter"
	"scholar-backend/internal/mcp"
	"scholar-backend/internal/message"
	"scholar-backend/internal/order"
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

	"scholar-backend/internal/common/middleware"

	"github.com/gin-gonic/gin"
)

type routeHandlers struct {
	admin              *admin.Handler
	dashboard          *admin.DashboardHandler
	config             *config.Handler
	user               *user.Handler
	thirdParty         *thirdparty.Handler
	ai                 *ai.Handler
	order              *order.Handler
	alipay             *payment.AlipayHandler
	wechatPay          *payment.WeChatPayHandler
	wechatOAuth        *wechat.Handler
	wechatOfficial     *wechatofficial.Handler
	latexAgentAdmin    *latexwriter.AdminHandler
	feedback           *feedback.Handler
	usageLogAdmin      *usagelog.AdminHandler
	usageLog           *usagelog.Handler
	hotContent         *hotcontent.Handler
	message            *message.Handler
	pdf                *pdf.Handler
	conversation       *conversation.Handler
	chat               *conversation.ChatHandler
	peerReview         *peerreview.Handler
	latexWriter        *latexwriter.Handler
	scholar            *semanticscholar.Handler
	mcpUnified         *mcp.UnifiedHandler
	mcpLegacy          *mcp.Handler
	proxy              *proxy.Handler
	ws                 *websocket.Handler
	agent              *agent.Handler
}

func registerAPIRoutes(api *gin.RouterGroup, h *routeHandlers) {
	// WebSocket (token auth via URL param)
	api.GET("/ws", h.ws.HandleWebSocket)

	// Config public routes
	h.config.RegisterRoutes(api)

	// Admin login/register routes
	h.admin.RegisterRoutes(api)

	registerAdminRoutes(api, h)
	registerPaymentCallbackRoutes(api, h)
	registerPDFRoutes(api, h)
	registerUserPublicRoutes(api, h)
	registerUserProtectedRoutes(api, h)
	registerPublicAPIRoutes(api, h)
	registerAnalysisRoutes(api, h)
	registerScholarRoutes(api, h)
	registerMCPRoutes(api, h)

	// Proxy endpoints (self-registers with auth middleware)
	h.proxy.RegisterRoutes(api, middleware.UserAuthMiddleware())
}

func registerAdminRoutes(api *gin.RouterGroup, h *routeHandlers) {
	g := api.Group("/admin")
	g.Use(middleware.AdminAuthMiddleware())
	{
		// Profile
		g.GET("/profile", h.admin.GetProfile)
		g.PUT("/password", h.admin.UpdatePassword)
		g.POST("/verify-password", h.admin.VerifyPassword)

		// Dashboard
		g.GET("/dashboard/statistics", h.dashboard.GetDashboardStatistics)

		// System configuration
		g.PUT("/privacy-policy", h.config.UpdatePrivacyPolicy)
		g.PUT("/terms-of-service", h.config.UpdateTermsOfService)
		g.GET("/email-config", h.config.GetEmailConfig)
		g.PUT("/email-config", h.config.UpdateEmailConfig)
		g.POST("/email-config/test", h.config.TestEmailConfig)
		g.GET("/sms-config", h.config.GetSMSConfig)
		g.PUT("/sms-config", h.config.UpdateSMSConfig)
		g.POST("/sms-config/test", h.config.TestSMSConfig)
		g.PUT("/system-config", h.config.UpdateSystemConfig)

		// GitHub OAuth config
		g.GET("/github-config", h.config.GetGithubOAuthConfig)
		g.PUT("/github-config", h.config.UpdateGithubOAuthConfig)

		// Code Snippets (SEO/ads)
		g.GET("/code-snippets", h.config.ListCodeSnippets)
		g.GET("/code-snippets/:id", h.config.GetCodeSnippet)
		g.POST("/code-snippets", h.config.CreateCodeSnippet)
		g.PUT("/code-snippets/:id", h.config.UpdateCodeSnippet)
		g.DELETE("/code-snippets/:id", h.config.DeleteCodeSnippet)

		// User management
		g.GET("/users/stats", h.user.GetUserStatistics)
		g.GET("/users", h.user.GetUserList)
		g.GET("/users/online", h.user.GetOnlineUsers)
		g.GET("/users/:id", h.user.GetUserDetail)
		g.DELETE("/users/:id", h.user.DeleteUser)

		// Statistics charts
		g.GET("/statistics/users", h.user.GetUserStatisticsChart)
		g.GET("/statistics/online", h.user.GetOnlineUserChart)

		// Third-party accounts
		g.GET("/third-party-accounts", h.thirdParty.ListAccounts)
		g.POST("/third-party-accounts", h.thirdParty.CreateAccount)
		g.GET("/third-party-accounts/stats", h.thirdParty.GetStats)
		g.POST("/third-party-accounts/refresh-cache", h.thirdParty.RefreshCache)
		g.GET("/third-party-accounts/:id", h.thirdParty.GetAccount)
		g.PUT("/third-party-accounts/:id", h.thirdParty.UpdateAccount)
		g.DELETE("/third-party-accounts/:id", h.thirdParty.DeleteAccount)
		g.POST("/third-party-accounts/:id/test", h.thirdParty.TestAccount)

		// Prompt templates
		g.GET("/prompt-templates", h.ai.ListPromptTemplates)
		g.POST("/prompt-templates", h.ai.CreatePromptTemplate)
		g.GET("/prompt-templates/:id", h.ai.GetPromptTemplate)
		g.PUT("/prompt-templates/:id", h.ai.UpdatePromptTemplate)
		g.DELETE("/prompt-templates/:id", h.ai.DeletePromptTemplate)

		// Analysis dimensions (admin)
		g.GET("/analysis/dimensions", h.ai.AdminGetSystemDimensions)
		g.PUT("/analysis/dimensions/:id", h.ai.AdminUpdateSystemDimension)

		// Orders
		g.GET("/orders/statistics", h.order.GetOrderStatistics)
		g.GET("/orders", h.order.AdminListOrders)

		// Alipay config
		g.GET("/payment/alipay/config", h.alipay.GetActiveConfig)
		g.GET("/payment/alipay/configs", h.alipay.ListConfigs)
		g.POST("/payment/alipay/config", h.alipay.CreateConfig)
		g.PUT("/payment/alipay/config/:id", h.alipay.UpdateConfig)
		g.DELETE("/payment/alipay/config/:id", h.alipay.DeleteConfig)
		g.POST("/payment/alipay/config/:id/activate", h.alipay.SetActiveConfig)

		// WeChat Pay config
		g.GET("/payment/wechat/config", h.wechatPay.GetActiveConfig)
		g.GET("/payment/wechat/configs", h.wechatPay.GetAllConfigs)
		g.POST("/payment/wechat/config", h.wechatPay.CreateConfig)
		g.PUT("/payment/wechat/config/:id", h.wechatPay.UpdateConfig)
		g.DELETE("/payment/wechat/config/:id", h.wechatPay.DeleteConfig)
		g.POST("/payment/wechat/config/:id/activate", h.wechatPay.ActivateConfig)

		// WeChat OAuth config
		g.GET("/wechat/config", h.wechatOAuth.GetActiveConfig)
		g.GET("/wechat/configs", h.wechatOAuth.ListConfigs)
		g.POST("/wechat/config", h.wechatOAuth.CreateConfig)
		g.PUT("/wechat/config/:id", h.wechatOAuth.UpdateConfig)
		g.DELETE("/wechat/config/:id", h.wechatOAuth.DeleteConfig)
		g.POST("/wechat/config/:id/activate", h.wechatOAuth.SetActiveConfig)

		// WeChat Official Account config
		g.GET("/wechat-official/config", h.wechatOfficial.GetConfig)
		g.PUT("/wechat-official/config", h.wechatOfficial.UpdateConfig)

		// LaTeX Agent config & models
		g.GET("/latex-agent/config", h.latexAgentAdmin.GetAgentConfig)
		g.PUT("/latex-agent/config", h.latexAgentAdmin.UpdateAgentConfig)
		g.GET("/latex-agent/model-presets", h.latexAgentAdmin.GetModelPresets)
		g.GET("/latex-agent/config-options", h.latexAgentAdmin.GetConfigOptions)
		g.GET("/latex-agent/api-formats", h.latexAgentAdmin.GetAPIFormats)
		g.POST("/latex-agent/apply-preset", h.latexAgentAdmin.ApplyModelPreset)
		g.POST("/latex-agent/test-connection", h.latexAgentAdmin.TestConnection)
		g.GET("/latex-agent/models", h.latexAgentAdmin.ListModels)
		g.POST("/latex-agent/models", h.latexAgentAdmin.CreateModel)
		g.PUT("/latex-agent/models/:id", h.latexAgentAdmin.UpdateModel)
		g.DELETE("/latex-agent/models/:id", h.latexAgentAdmin.DeleteModel)
		g.POST("/latex-agent/models/:id/set-default", h.latexAgentAdmin.SetDefaultModel)

		// Feedback management
		g.GET("/feedbacks", h.feedback.ListFeedbacks)
		g.GET("/feedbacks/stats", h.feedback.GetStats)
		g.GET("/feedbacks/:id", h.feedback.GetFeedback)
		g.PUT("/feedbacks/:id/status", h.feedback.UpdateStatus)
		g.POST("/feedbacks/:id/reply", h.feedback.ReplyFeedback)
		g.DELETE("/feedbacks/:id", h.feedback.DeleteFeedback)

		// Usage logs
		g.GET("/usage-logs", h.usageLogAdmin.List)
		g.GET("/usage-logs/summary", h.usageLogAdmin.GetStatsSummary)
		g.GET("/usage-logs/filter-options", h.usageLogAdmin.GetFilterOptions)
		g.GET("/usage-logs/features", h.usageLogAdmin.GetFeatureConfigs)
		g.GET("/usage-logs/config", h.usageLogAdmin.GetConfig)
		g.PUT("/usage-logs/config", h.usageLogAdmin.UpdateConfig)
		g.POST("/usage-logs/cleanup", h.usageLogAdmin.TriggerCleanup)
		g.DELETE("/usage-logs/all", h.usageLogAdmin.ClearAllLogs)

		// Hot content
		g.GET("/hot-content/keywords", h.hotContent.GetHotKeywords)
		g.GET("/hot-content/papers", h.hotContent.GetHotPapers)
		g.GET("/hot-content/stats", h.hotContent.GetStats)
		g.POST("/hot-content/cleanup", h.hotContent.ManualCleanup)

		// Messages
		g.POST("/messages", h.message.AdminCreateMessage)
		g.GET("/messages", h.message.AdminGetMessages)
		g.GET("/messages/stats", h.message.AdminGetMessageStats)
		g.GET("/messages/:id", h.message.AdminGetMessage)
		g.POST("/messages/:id/send", h.message.AdminSendMessage)
		g.POST("/message-templates", h.message.AdminCreateTemplate)
		g.GET("/message-templates", h.message.AdminGetTemplates)
		g.GET("/message-templates/:id", h.message.AdminGetTemplate)
		g.PUT("/message-templates/:id", h.message.AdminUpdateTemplate)
		g.DELETE("/message-templates/:id", h.message.AdminDeleteTemplate)

		// PDF cache
		g.GET("/pdf/cache/stats", h.pdf.GetCacheStats)
	}
}

func registerPaymentCallbackRoutes(api *gin.RouterGroup, h *routeHandlers) {
	api.POST("/payment/alipay/notify", h.alipay.HandleCallback)
	api.POST("/payment/wechat/notify", h.wechatPay.HandleNotify)

	wechatWebhook := api.Group("/wechat-official")
	{
		wechatWebhook.GET("/webhook", h.wechatOfficial.HandleVerification)
		wechatWebhook.POST("/webhook", h.wechatOfficial.HandleMessage)
	}
}

func registerPDFRoutes(api *gin.RouterGroup, h *routeHandlers) {
	api.POST("/pdf", h.pdf.GetPDF)
}

func registerUserPublicRoutes(api *gin.RouterGroup, h *routeHandlers) {
	h.user.RegisterRoutes(api)

	wechatPublic := api.Group("/user/wechat")
	{
		wechatPublic.GET("/login-url", h.wechatOAuth.GetLoginURL)
		wechatPublic.GET("/qrcode-config", h.wechatOAuth.GetQRCodeConfig)
		wechatPublic.POST("/callback", h.user.WeChatCallback)
	}

	githubPublic := api.Group("/user/github")
	{
		githubPublic.GET("/login-url", h.user.GetGithubLoginURL)
		githubPublic.GET("/callback", h.user.GithubCallback)
	}
}

func registerUserProtectedRoutes(api *gin.RouterGroup, h *routeHandlers) {
	g := api.Group("/user")
	g.Use(middleware.UserAuthMiddleware())
	{
		g.GET("/profile", h.user.GetProfile)
		g.PUT("/profile", h.user.UpdateProfile)
		g.POST("/logout", h.user.Logout)
		g.POST("/change-password", h.user.ChangePassword)

		// Account availability checks
		g.POST("/check-email-availability", h.user.CheckEmailAvailability)
		g.POST("/check-phone-availability", h.user.CheckPhoneAvailability)

		// Account binding
		g.POST("/bind-phone", h.user.BindPhone)
		g.POST("/bind-email", h.user.BindEmail)
		g.POST("/bind-wechat", h.user.BindWeChatAccount)
		g.POST("/bind-github", h.user.BindGitHubAccount)
		g.POST("/bind-email-with-password", h.user.BindEmailWithPassword)
		g.POST("/bind-phone-with-password", h.user.BindPhoneWithPassword)

		// Account unbinding
		g.POST("/unbind-phone", h.user.UnbindPhone)
		g.POST("/unbind-email", h.user.UnbindEmail)
		g.POST("/unbind-wechat", h.user.UnbindWeChat)
		g.POST("/unbind-github", h.user.UnbindGitHub)

		// Orders
		g.POST("/orders/create", h.order.CreateOrder)
		g.GET("/orders/my", h.order.GetMyOrders)
		g.GET("/orders/:order_no", h.order.GetOrderDetail)
		g.POST("/orders/pay", h.order.ProcessPayment)
		g.POST("/orders/cancel", h.order.CancelOrder)
		g.GET("/orders/billing-history", h.order.GetBillingHistory)

		// Payment - Alipay
		g.POST("/payment/alipay/create", h.alipay.CreatePayment)
		g.POST("/payment/simulate", h.alipay.SimulatePayment)

		// Payment - WeChat Pay
		g.POST("/payment/wechat/create", h.wechatPay.CreatePayment)

		// Feedback (authenticated)
		g.POST("/feedback", h.feedback.CreateFeedbackWithUser)

		// Task history
		g.GET("/task-history", h.user.GetTaskHistory)

		// Messages
		g.GET("/messages", h.message.GetMessages)
		g.GET("/messages/unread-count", h.message.GetUnreadCount)
		g.GET("/messages/:id", h.message.GetMessage)
		g.PUT("/messages/:id/read", h.message.MarkAsRead)
		g.PUT("/messages/read-all", h.message.MarkAllAsRead)
		g.DELETE("/messages/:id", h.message.DeleteMessage)

		// Conversations (legacy)
		g.GET("/conversations", h.conversation.GetUserConversations)
		g.POST("/conversations", h.conversation.CreateConversation)
		g.GET("/conversations/:id", h.conversation.GetConversation)
		g.DELETE("/conversations/:id", h.conversation.DeleteConversation)
		g.POST("/conversations/:id/messages", h.conversation.AddMessage)
		g.PUT("/conversations/:id/title", h.conversation.UpdateConversationTitle)
		g.GET("/conversations/:id/messages/:messageId/advanced-search", h.conversation.StreamAdvancedSearch)
		g.GET("/conversations/:id/messages/:messageId/follow-up-questions", h.conversation.GetFollowUpQuestions)
		g.POST("/conversations/:id/continue", h.conversation.StreamContinueConversation)

		// Enhanced chat (LibreChat-style)
		g.POST("/conversations/chat/new", h.chat.CreateConversationAndChat)
		g.POST("/conversations/:id/chat/stream", h.chat.StreamChatMessage)
		g.POST("/conversations/:id/chat", h.chat.QuickChat)
		g.GET("/conversations/:id/tree", h.chat.GetMessageTree)
		g.GET("/conversations/:id/history", h.chat.GetConversationHistory)
		g.POST("/conversations/messages/:messageId/regenerate", h.chat.RegenerateMessage)
		g.POST("/conversations/messages/:messageId/edit", h.chat.EditMessage)
		g.GET("/conversations/messages/:messageId/siblings", h.chat.GetSiblingMessages)
		g.GET("/conversations/messages/:messageId/branch", h.chat.GetBranchChain)

		// Peer Review
		registerPeerReviewRoutes(g, h)

		// LaTeX Writer
		registerLatexWriterRoutes(g, h)

		// Agent Proxy (V2 review via agent.scholay.com)
		h.agent.RegisterRoutes(g)
	}
}

func registerPeerReviewRoutes(userGroup *gin.RouterGroup, h *routeHandlers) {
	g := userGroup.Group("/peer-review")
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

func registerLatexWriterRoutes(userGroup *gin.RouterGroup, h *routeHandlers) {
	g := userGroup.Group("/latex-writer")
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

func registerPublicAPIRoutes(api *gin.RouterGroup, h *routeHandlers) {
	g := api.Group("/public")
	{
		// Papers (anonymous access)
		g.GET("/papers/:paperId", h.scholar.GetPaper)
		g.POST("/papers/search", h.scholar.SearchPapers)
		g.POST("/papers/batch", h.scholar.GetPaperBatch)
		g.GET("/papers/autocomplete", h.scholar.PaperAutocomplete)
		g.GET("/search/suggestions", h.scholar.GetSearchSuggestions)
		g.GET("/analysis/dimensions", h.ai.GetSystemDimensions)
		g.GET("/recommendations/papers/:paperId", h.scholar.GetRecommendationsForPaper)

		// Authors
		g.GET("/author-detail/:authorId", h.scholar.GetAuthor)
		g.GET("/author-detail/:authorId/papers", h.scholar.GetAuthorPapers)

		// Feedback (anonymous)
		g.POST("/feedback", h.feedback.CreateFeedback)
		g.POST("/feedback/upload", h.feedback.UploadAttachments)
		g.GET("/feedback/attachment/:id", h.feedback.GetAttachment)

		// Usage log
		g.POST("/usage-log", h.usageLog.Log)

		// Translation (streaming)
		g.POST("/translate/stream", h.ai.StreamTranslate)
		g.POST("/translate/paper/stream", h.ai.StreamTranslatePaper)

		// Hot content
		g.GET("/hot-content/keywords", h.hotContent.GetRecentKeywords)
		g.GET("/hot-content/papers", h.hotContent.GetRecentPapers)
	}
}

func registerAnalysisRoutes(api *gin.RouterGroup, h *routeHandlers) {
	g := api.Group("/analysis")
	g.Use(middleware.UserAuthMiddleware())
	{
		g.POST("/paper", h.ai.AnalyzePaper)
		g.POST("/papers/batch", h.ai.BatchAnalyzePapers)
		g.GET("/dimensions", h.ai.GetAnalysisDimensions)
		g.POST("/dimensions", h.ai.CreateUserDimension)
		g.PUT("/dimensions/:id", h.ai.UpdateUserDimension)
		g.DELETE("/dimensions/:id", h.ai.DeleteUserDimension)
		g.DELETE("/dimensions/reset/:dimensionKey", h.ai.ResetUserDimension)
		g.DELETE("/dimensions/reset-all", h.ai.ResetAllUserDimensions)
		g.POST("/dimensions/copy-from-system", h.ai.CopySystemDimensionsToUser)
	}
}

func registerScholarRoutes(api *gin.RouterGroup, h *routeHandlers) {
	g := api.Group("/scholar")
	g.Use(middleware.UserAuthMiddleware())
	{
		g.POST("/papers/search", h.scholar.SearchPapers)
		g.GET("/papers/:paperId", h.scholar.GetPaper)
		g.POST("/papers/batch", h.scholar.GetPaperBatch)
		g.GET("/papers/:paperId/citations", h.scholar.GetPaperCitations)
		g.GET("/papers/:paperId/references", h.scholar.GetPaperReferences)
		g.GET("/papers/:paperId/authors", h.scholar.GetPaperAuthors)

		g.GET("/authors/search", h.scholar.SearchAuthors)
		g.GET("/authors/:authorId", h.scholar.GetAuthor)
		g.GET("/authors/:authorId/papers", h.scholar.GetAuthorPapers)

		g.GET("/recommendations/papers/:paperId", h.scholar.GetRecommendationsForPaper)
		g.POST("/recommendations/papers", h.scholar.GetRecommendations)
	}
}

func registerMCPRoutes(api *gin.RouterGroup, h *routeHandlers) {
	g := api.Group("/mcp")
	g.Use(middleware.UserAuthMiddleware())
	{
		g.GET("/tools", h.mcpUnified.ListAllTools)
		g.GET("/tools/llm", h.mcpUnified.GetToolsForLLM)
		g.GET("/tools/category/:category", h.mcpUnified.ListToolsByCategory)
		g.GET("/tools/:name", h.mcpUnified.GetTool)
		g.POST("/call", h.mcpUnified.CallTool)
		g.POST("/batch", h.mcpUnified.BatchCallTools)
	}

	legacy := api.Group("/mcp-legacy")
	legacy.Use(middleware.UserAuthMiddleware())
	{
		legacy.GET("/tools", h.mcpLegacy.ListTools)
		legacy.POST("/call", h.mcpLegacy.CallTool)
	}
}
