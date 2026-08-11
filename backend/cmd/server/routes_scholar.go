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

	// 情报(Minicod news webhook):上游 server-to-server 推送,验签即闸,禁挂认证中间件。
	api.POST("/webhook/minicod-news", h.news.ReceiveWebhook)
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
func registerPublicAPIRoutes(api *gin.RouterGroup, h *allHandlers, tieredRL gin.HandlerFunc) {
	publicAPI := api.Group("/public")
	{
		// 论文
		publicAPI.GET("/papers/:paperId", h.scholar.GetPaper)
		// search / journals / translate 是公开路由, 但"使用统计"要把登录用户的操作归到
		// 其名下 → 挂 OptionalUserAuth: 带 token 取 user_id, 没 token 按匿名(X-Anon-Id 去重)。
		publicAPI.POST("/papers/search", middleware.OptionalUserAuthMiddleware(), h.scholar.SearchPapers)
		publicAPI.POST("/papers/batch", h.scholar.GetPaperBatch)
		publicAPI.GET("/papers/:paperId/references", h.scholar.GetPaperReferences)
		publicAPI.GET("/search/suggestions", h.scholar.GetSearchSuggestions)

		// 合法 OA 全文查找(DOI → Unpaywall 免费链接)。论文详情页在 Minicod 未给
		// openAccessPdf 时兜底探测;只链接合法 OA 副本,绝不代理盗版。
		// 限流:每 IP 每分钟 30 次(外部上游 + 已有 Redis 缓存,够用)。
		publicAPI.GET("/oa/resolve",
			middleware.RateLimitMiddleware(30, time.Minute),
			h.openAccess.Resolve,
		)

		// Matrix 多维分析: 公开拿系统默认维度 (登录用户的自定义维度走 /analysis/dimensions)
		publicAPI.GET("/analysis/dimensions", h.ai.GetSystemDimensions)

		// 作者
		publicAPI.GET("/author-detail/:authorId", h.scholar.GetAuthor)
		publicAPI.GET("/author-detail/:authorId/papers", h.scholar.GetAuthorPapers)

		// 反馈 (提交 + 附件上传/下载, 附件本体走 MinIO)
		// OptionalUserAuthMiddleware:带 token → 反馈记到具体用户(飞书通知也才显示真实用户名),
		// 匿名仍可提交。**必须挂** —— 前端不论登没登录都只调这个公开入口(http 拦截器对 /public/*
		// 也注入 Authorization),不挂就永远取不到 user_id,所有反馈全成匿名(2026-07 实测 4/4 匿名)。
		publicAPI.POST("/feedback", middleware.OptionalUserAuthMiddleware(), h.feedback.CreateFeedback)
		publicAPI.POST("/feedback/upload", middleware.UploadLimitMiddleware(middleware.UploadMaxBodySize), h.feedback.UploadAttachments)
		publicAPI.GET("/feedback/attachment/:id", h.feedback.GetAttachment)

		// 翻译 (SSE 流) —— 仅论文翻译; 旧的"划词翻译" StreamTranslate 已下线。
		// 已改强制登录 (UserAuthMiddleware + tieredRL): 翻译是项目侧 LLM 调用, 要可归属
		// 到用户 + 计入 token 账本 (feature=translate), 不再允许匿名。路径仍在 /public 下
		// 是为兼容前端既有调用, 语义上它已是登录端点。匿名请求会拿到 401。
		publicAPI.POST("/translate/paper/stream", middleware.UserAuthMiddleware(), tieredRL, h.ai.StreamTranslatePaper)

		// umami tracker 运行时配置 —— 前端 index.html 加载时 fetch
		publicAPI.GET("/umami-config", h.umami.GetTrackerConfig)

		// 历史 SEO expose 兼容 ACK：客户端元数据不再写库，真实 seed
		// 只来自 minicod 服务端已验证响应。保留限流避免旧客户端流量滥用。
		publicAPI.POST("/seo/expose",
			middleware.RateLimitMiddleware(60, time.Minute),
			h.seo.ExposeSeeds,
		)
		// 热门内容上报 (智能搜索曝光 / 站内点击 / SEO 直访) —— 前端 fire-and-forget sendBeacon。
		// 传统/期刊搜索的关键词+曝光仍由 SearchPapers/SearchJournals 服务端记, 不走这里 (防双计)。
		publicAPI.POST("/hot-content/track",
			middleware.RateLimitMiddleware(60, time.Minute),
			h.hotContent.Track,
		)
		// 功能使用统计上报 (暂存 / 收藏 等前端事件) —— OptionalUserAuth: 带 token 取
		// user_id, 否则按匿名(anon_id)记。白名单见 usagestat.Handler.Track。
		publicAPI.POST("/usage-events/track",
			middleware.OptionalUserAuthMiddleware(),
			middleware.RateLimitMiddleware(120, time.Minute),
			h.usageStats.Track,
		)
		// 文献集分享:收件人公开获取(免登录;OptionalUserAuth 让登录访客记到名下)。
		// 带提取码的分享缺/错 code 时只回最小信息让前端弹输入框。转存仍需登录(在 /user 下)。
		// 限流:每 IP 每分钟 60 次 —— 4 位提取码组合有限,配合 handler 内的
		// per-(token,IP) 错码熔断(错 5 次锁 10 分钟)双层防在线爆破;也防匿名刷 view 流水。
		publicAPI.GET("/share/:token",
			middleware.OptionalUserAuthMiddleware(),
			middleware.RateLimitMiddleware(60, time.Minute),
			h.library.PublicGetShare,
		)

		// SEO slug 解析 (前端 /paper/:slug、/author/:slug 首屏用)
		publicAPI.GET("/seo/paper/:slug", h.seo.ResolveBySlug)
		publicAPI.GET("/seo/author/:slug", h.seo.ResolveAuthorBySlug)

		// 期刊枢纽(发现层)—— SPA 的 /journals/browse 等枢纽页取数。
		// SSR 由 config 包直连 seo.Service 渲染整页 HTML,这两条只服务浏览器端 React;
		// 匿名、utils.Success 信封、限流继承 public 组。响应形状是与前端的精确契约
		// (JournalCard 见 internal/seo/journal_hub.go)。
		publicAPI.GET("/journal-hubs/overview", h.seo.JournalHubOverviewAPI)
		publicAPI.GET("/journal-hubs/list", h.seo.JournalHubListAPI)

		// JNL Journal (前端用到 search/list/get/stats/suggest/byNames; filters/byIssn/compare/batch 已下线)
		publicAPI.POST("/journals/search", middleware.OptionalUserAuthMiddleware(), h.scholar.SearchJournals)
		publicAPI.POST("/journals/list", h.scholar.ListJournals)
		publicAPI.POST("/journals/get", h.scholar.GetJournal)
		publicAPI.POST("/journals/stats", h.scholar.GetJournalStats)
		publicAPI.POST("/journals/suggest", h.scholar.SuggestJournals)
		publicAPI.POST("/journals/byNames", h.scholar.JournalsByNames)

		// 功能大全 (学术工具黄页) 公开浏览。
		// detail 走 /tools/detail/:idOrSlug, categories 走 /tools/categories —— 都是
		// /tools 的静态子节点, 避免 gin "static vs :param" 同层冲突。
		publicAPI.GET("/tools", h.featureTool.PublicList)
		publicAPI.GET("/tools/categories", h.featureTool.PublicCategories)
		publicAPI.GET("/tools/detail/:idOrSlug", h.featureTool.PublicGet)
		// 工具 logo 从 MinIO 流式服务 (导入 zip 时上传), 永久缓存
		publicAPI.GET("/tools/logo/:slug", h.featureTool.PublicLogo)

		// 社区技能(Skills 市场)公开浏览 —— 让技能像全网工具一样可匿名浏览/被收录(功能广场融合)。
		// OptionalUserAuthMiddleware:带 token 则 ListMarket 显示 installed 标记,匿名则 user_id=0 无标记。
		// 复用 authed 侧同一 handler(它已读 c.GetUint("user_id"))。详情匿名走已有 /api/v1/skills/:slug。
		publicAPI.GET("/skills", middleware.OptionalUserAuthMiddleware(), h.skillMarket.ListMarket)
	}
}
