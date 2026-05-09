// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package main

import (
	"time"

	"scholar-backend/internal/common/middleware"

	"github.com/gin-gonic/gin"
)

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
		publicAPI.GET("/papers/:paperId/citations", h.scholar.GetPaperCitations)
		publicAPI.GET("/papers/:paperId/references", h.scholar.GetPaperReferences)
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

		// SEO 搜索曝光批量 seed（前端搜索结果加载后上报）
		// 限流: 每 IP 每分钟最多 60 次。NAT 出口同 IP 的多用户共享配额,
		// 一个学校/公司 60/min 的搜索量基本够用; 进一步可考虑 user-id+ip 双维度。
		publicAPI.POST("/seo/expose",
			middleware.RateLimitMiddleware(60, time.Minute),
			h.seo.ExposeSeeds,
		)
		// SEO slug 解析（前端 /paper/:slug、/author/:slug 首屏用）
		publicAPI.GET("/seo/paper/:slug", h.seo.ResolveBySlug)
		publicAPI.GET("/seo/author/:slug", h.seo.ResolveAuthorBySlug)

		// Public JNL Journal routes
		publicAPI.POST("/journals/search", h.scholar.SearchJournals)
		publicAPI.POST("/journals/list", h.scholar.ListJournals)
		publicAPI.POST("/journals/get", h.scholar.GetJournal)
		publicAPI.POST("/journals/filters", h.scholar.GetJournalFilters)
		publicAPI.POST("/journals/stats", h.scholar.GetJournalStats)
		publicAPI.POST("/journals/byIssn", h.scholar.GetJournalByISSN)
		publicAPI.POST("/journals/compare", h.scholar.CompareJournals)
	}
}

// registerAnalysisRoutes 注册论文分析路由（已移除扣费中间件）
func registerAnalysisRoutes(api *gin.RouterGroup, h *allHandlers, tieredRL gin.HandlerFunc) {
	analysisGroup := api.Group("/analysis")
	analysisGroup.Use(middleware.UserAuthMiddleware(), tieredRL)
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
func registerScholarRoutes(api *gin.RouterGroup, h *allHandlers, tieredRL gin.HandlerFunc) {
	scholar := api.Group("/scholar")
	scholar.Use(middleware.UserAuthMiddleware(), tieredRL)
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

		// JNL Journal routes
		scholar.POST("/journals/search", h.scholar.SearchJournals)
		scholar.POST("/journals/list", h.scholar.ListJournals)
		scholar.POST("/journals/get", h.scholar.GetJournal)
		scholar.POST("/journals/filters", h.scholar.GetJournalFilters)
		scholar.POST("/journals/stats", h.scholar.GetJournalStats)
		scholar.POST("/journals/byIssn", h.scholar.GetJournalByISSN)
		scholar.POST("/journals/compare", h.scholar.CompareJournals)
	}
}

// registerMCPRoutes 注册 MCP 路由
func registerMCPRoutes(api *gin.RouterGroup, h *allHandlers, tieredRL gin.HandlerFunc) {
	mcpGroup := api.Group("/mcp")
	mcpGroup.Use(middleware.UserAuthMiddleware(), tieredRL)
	{
		mcpGroup.GET("/tools", h.mcpUnified.ListAllTools)
		mcpGroup.GET("/tools/llm", h.mcpUnified.GetToolsForLLM)
		mcpGroup.GET("/tools/category/:category", h.mcpUnified.ListToolsByCategory)
		mcpGroup.GET("/tools/:name", h.mcpUnified.GetTool)
		mcpGroup.POST("/call", h.mcpUnified.CallTool)
		mcpGroup.POST("/batch", h.mcpUnified.BatchCallTools)
	}

	mcpLegacy := api.Group("/mcp-legacy")
	mcpLegacy.Use(middleware.UserAuthMiddleware(), tieredRL)
	{
		mcpLegacy.GET("/tools", h.mcpLegacy.ListTools)
		mcpLegacy.POST("/call", h.mcpLegacy.CallTool)
	}
}
