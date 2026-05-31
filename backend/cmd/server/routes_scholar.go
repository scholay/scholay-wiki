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

// registerPaymentCallbackRoutes 注册支付回调路由(公开,无需认证)。
// 这些路由是外部商户/平台主动回调进来的, 不会出现在前端代码里。
func registerPaymentCallbackRoutes(api *gin.RouterGroup, h *allHandlers) {
	api.POST("/payment/alipay/notify", h.alipay.HandleCallback)
	api.POST("/payment/wechat/notify", h.wechatPay.HandleNotify)

	// 微信公众号 webhook
	wechatOfficialWebhook := api.Group("/wechat-official")
	{
		wechatOfficialWebhook.GET("/webhook", h.wechatOfficial.HandleVerification)
		wechatOfficialWebhook.POST("/webhook", h.wechatOfficial.HandleMessage)
	}
}

// registerAnalysisRoutes 注册 Matrix 多维分析路由 (需登录, 用户维度 + 论文批量分析)
func registerAnalysisRoutes(api *gin.RouterGroup, h *allHandlers, tieredRL gin.HandlerFunc) {
	analysisGroup := api.Group("/analysis")
	analysisGroup.Use(middleware.UserAuthMiddleware(), tieredRL)
	{
		analysisGroup.POST("/papers/batch", h.ai.BatchAnalyzePapers)
		analysisGroup.GET("/dimensions", h.ai.GetAnalysisDimensions)
		analysisGroup.GET("/dimensions/settings", h.ai.GetDimensionSettings)
		analysisGroup.PATCH("/dimensions/visibility", h.ai.SetDimensionVisibility)
		analysisGroup.PATCH("/dimensions/reorder", h.ai.ReorderDimensions)
		analysisGroup.POST("/dimensions", h.ai.CreateUserDimension)
		analysisGroup.PUT("/dimensions/:id", h.ai.UpdateUserDimension)
		analysisGroup.DELETE("/dimensions/:id", h.ai.DeleteUserDimension)
		analysisGroup.DELETE("/dimensions/reset/:dimensionKey", h.ai.ResetUserDimension)
	}
}

// registerPublicAPIRoutes 注册公开 API 路由。
//
// 历史上这里曾有 paper autocomplete / paper citations / recommendations / feedback 附件 /
// usage-log / hot-content public / journals 的 filters/byIssn/compare/batch 一组路由,
// 经过前端反查全部无人调用, 已下线 (handler 方法连带删)。
// `/scholar/*` 鉴权版整组 (registerScholarRoutes) 也是 `/public/*` 的重复, 一并下线。
func registerPublicAPIRoutes(api *gin.RouterGroup, h *allHandlers) {
	publicAPI := api.Group("/public")
	{
		// 论文
		publicAPI.GET("/papers/:paperId", h.scholar.GetPaper)
		publicAPI.POST("/papers/search", h.scholar.SearchPapers)
		publicAPI.POST("/papers/batch", h.scholar.GetPaperBatch)
		publicAPI.GET("/papers/:paperId/references", h.scholar.GetPaperReferences)
		publicAPI.GET("/search/suggestions", h.scholar.GetSearchSuggestions)

		// Matrix 多维分析: 公开拿系统默认维度 (登录用户的自定义维度走 /analysis/dimensions)
		publicAPI.GET("/analysis/dimensions", h.ai.GetSystemDimensions)

		// 作者
		publicAPI.GET("/author-detail/:authorId", h.scholar.GetAuthor)
		publicAPI.GET("/author-detail/:authorId/papers", h.scholar.GetAuthorPapers)

		// 反馈 (提交 + 附件上传/下载, 附件本体走 MinIO)
		publicAPI.POST("/feedback", h.feedback.CreateFeedback)
		publicAPI.POST("/feedback/upload", middleware.UploadLimitMiddleware(middleware.UploadMaxBodySize), h.feedback.UploadAttachments)
		publicAPI.GET("/feedback/attachment/:id", h.feedback.GetAttachment)

		// 翻译 (SSE 流) —— 仅论文翻译; 旧的"划词翻译" StreamTranslate 已下线
		publicAPI.POST("/translate/paper/stream", h.ai.StreamTranslatePaper)

		// umami tracker 运行时配置 —— 前端 index.html 加载时 fetch
		publicAPI.GET("/umami-config", h.umami.GetTrackerConfig)

		// SEO 搜索曝光批量 seed (前端搜索结果加载后上报)
		// 限流: 每 IP 每分钟最多 60 次
		publicAPI.POST("/seo/expose",
			middleware.RateLimitMiddleware(60, time.Minute),
			h.seo.ExposeSeeds,
		)
		// SEO slug 解析 (前端 /paper/:slug、/author/:slug 首屏用)
		publicAPI.GET("/seo/paper/:slug", h.seo.ResolveBySlug)
		publicAPI.GET("/seo/author/:slug", h.seo.ResolveAuthorBySlug)

		// JNL Journal (前端用到 search/list/get/stats/suggest/byNames; filters/byIssn/compare/batch 已下线)
		publicAPI.POST("/journals/search", h.scholar.SearchJournals)
		publicAPI.POST("/journals/list", h.scholar.ListJournals)
		publicAPI.POST("/journals/get", h.scholar.GetJournal)
		publicAPI.POST("/journals/stats", h.scholar.GetJournalStats)
		publicAPI.POST("/journals/suggest", h.scholar.SuggestJournals)
		publicAPI.POST("/journals/byNames", h.scholar.JournalsByNames)
	}
}
