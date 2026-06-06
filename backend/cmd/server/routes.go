// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package main

import (
	"context"
	"net/http"
	"time"

	"scholar-backend/internal/admin"
	"scholar-backend/internal/agentbridge"
	"scholar-backend/internal/agentconfig"
	"scholar-backend/internal/ai"
	"scholar-backend/internal/announcement"
	"scholar-backend/internal/common/cache"
	appconfig "scholar-backend/internal/common/config"
	"scholar-backend/internal/common/database"
	"scholar-backend/internal/common/middleware"
	"scholar-backend/internal/common/utils"
	"scholar-backend/internal/config"
	"scholar-backend/internal/featuretool"
	"scholar-backend/internal/feedback"
	"scholar-backend/internal/hotcontent"
	"scholar-backend/internal/clientlog"
	"scholar-backend/internal/library"
	"scholar-backend/internal/message"
	"scholar-backend/internal/minicod"
	"scholar-backend/internal/payment"
	"scholar-backend/internal/prism"
	"scholar-backend/internal/seo"
	"scholar-backend/internal/claw"
	"scholar-backend/internal/smartsearch"
	"scholar-backend/internal/stagingarea"
	"scholar-backend/internal/thirdparty"
	"scholar-backend/internal/umami"
	"scholar-backend/internal/usagelog"
	"scholar-backend/internal/llmusage"
	"scholar-backend/internal/usagestat"
	"scholar-backend/internal/vip"
	"scholar-backend/internal/peerreview"
	"scholar-backend/internal/user"
	"scholar-backend/internal/wechat"
	"scholar-backend/internal/wechatofficial"
	"scholar-backend/internal/websocket"

	"github.com/gin-gonic/gin"
)

// allHandlers 聚合所有 handler 实例，用于路由注册
type allHandlers struct {
	admin           *admin.Handler
	dashboard       *admin.DashboardHandler
	user            *user.Handler
	config          *config.Handler
	scholar         *minicod.Handler
	ai              *ai.Handler
	alipay          *payment.AlipayHandler
	wechatPay       *payment.WeChatPayHandler
	wechat          *wechat.Handler
	wechatOfficial  *wechatofficial.Handler
	usageLog        *usagelog.Handler
	usageLogAdmin   *usagelog.AdminHandler
	usageStats      *usagestat.Handler
	llmUsageAdmin   *llmusage.AdminHandler // 后台 token 用量看板 (llm_token_usage 聚合/明细/导出)
	vip             *vip.Handler           // 会员: 用户兑换/状态 + 管理端生码/列表
	hotContent      *hotcontent.Handler
	seo             *seo.Handler
	message         *message.Handler
	feedback        *feedback.Handler
	ws              *websocket.Handler
	thirdParty      *thirdparty.Handler
	announcement    *announcement.Handler
	library         *library.Handler
	stagingArea     *stagingarea.Handler
	clientLog       *clientlog.Handler // 前端错误上报 → docker logs
	umami           *umami.Handler     // admin /analytics 查询 umami HTTP API 渲染自有图表
	agentConfig     *agentconfig.Handler // 通用 agent 服务 (scholar_agent) 的模型/端点配置
	smartSearch     *smartsearch.Handler // 智能搜索 backend 桥接 (HTTP 创会话 + WS 双向 pipe)
	peerReview      *peerreview.Handler  // 智能审稿 v3 (我要投稿 + 审稿记录,服务端 4 轮编排)
	claw            *claw.Handler        // 智能助手 (通用对话 + 上传附件 + Minicod MCP)
	prism           *prism.Handler       // 智能写作 (LaTeX IDE: 项目/文件/编译沙箱; Phase 1 接 agent)
	featureTool     *featuretool.Handler // 功能大全 (学术工具黄页: 导入/CRUD/webhook 同步/公开浏览)
	agentBridge     *agentbridge.Bridge  // agent 内网回调端点 (带外 token 用量上报: title-gen 等)
}

// registerRoutes 注册所有 API 路由
func registerRoutes(router *gin.Engine, h *allHandlers, cfg *appconfig.Config) {
	// 第二道限流：按 user_id（认证用户）/ IP（匿名）分级限流，挂在认证路由组内层，
	// 以便 UserAuthMiddleware 已经把 user_id/is_vip 写入 ctx 后立刻生效。
	// 使用 Redis 后端，多实例部署下计数共享；Redis 不可用时自动降级到内存版。
	tieredRL := middleware.TieredRedisRateLimitMiddleware(middleware.TieredRateLimitOptions{
		IPRPS:         cfg.RateLimit.IPRPS,
		IPBurst:       cfg.RateLimit.IPBurst,
		UserRPS:       cfg.RateLimit.UserRPS,
		UserBurst:     cfg.RateLimit.UserBurst,
		VIPMultiplier: cfg.RateLimit.VIPMultiplier,
	})

	api := router.Group("/api/v1")
	// 维护模式拦截 — 启用后普通用户走 503,管理员/白名单正常通过
	api.Use(middleware.MaintenanceModeMiddleware())
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
		registerProtectedUserRoutes(api, h, tieredRL)
		registerPublicAPIRoutes(api, h, tieredRL)
		registerAnalysisRoutes(api, h, tieredRL)

		// 前端错误上报 —— 无需登录,IP rate-limit 已经在 api 组顶层挂了
		// 实现见 internal/clientlog/handler.go,只 slog.Warn 不入库
		api.POST("/log/client-error", h.clientLog.ReportClientError)
	}

	// 静态文件服务
	router.Static("/uploads", "./uploads")

	// 健康检查（含 MySQL/Redis 连通性探测）
	router.GET("/health", func(c *gin.Context) {
		status := "ok"
		httpStatus := http.StatusOK
		checks := gin.H{}

		// MySQL ping
		ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
		defer cancel()
		sqlDB, err := database.GetDB().DB()
		if err != nil {
			checks["mysql"] = "error: " + err.Error()
			status = "degraded"
			httpStatus = http.StatusServiceUnavailable
		} else if err := sqlDB.PingContext(ctx); err != nil {
			checks["mysql"] = "unreachable"
			status = "degraded"
			httpStatus = http.StatusServiceUnavailable
		} else {
			checks["mysql"] = "ok"
		}

		// Redis ping
		rdb := cache.GetRedis()
		if rdb != nil {
			if err := rdb.Ping(ctx).Err(); err != nil {
				checks["redis"] = "unreachable"
				status = "degraded"
				httpStatus = http.StatusServiceUnavailable
			} else {
				checks["redis"] = "ok"
			}
		} else {
			checks["redis"] = "not configured"
		}

		c.JSON(httpStatus, utils.Response{
			Code:    0,
			Message: status,
			Data: gin.H{
				"status":  status,
				"service": "scholar-backend",
				"checks":  checks,
			},
		})
	})

	// SEO sitemap（基于 seo_papers / seo_authors 永久索引库 + 前端静态内容索引）
	router.GET("/sitemap.xml", h.seo.ServeSitemapIndex)
	router.GET("/sitemap-static.xml", h.seo.ServeStaticSitemap)
	router.GET("/sitemap-blogs.xml", h.seo.ServeBlogSitemap)
	router.GET("/sitemap-resources.xml", h.seo.ServeResourceSitemap)
	router.GET("/sitemap-papers-:page.xml", h.seo.ServePaperSitemap)
	router.GET("/sitemap-authors-:page.xml", h.seo.ServeAuthorSitemap)
	router.GET("/sitemap-journals-:page.xml", h.seo.ServeJournalSitemap)
	// 功能大全工具 sitemap(匿名收录)—— 索引 + 分页, robots.txt 里独立列出。
	router.GET("/sitemap-tools.xml", h.featureTool.ServeToolSitemapIndex)
	router.GET("/sitemap-tools-:page.xml", h.featureTool.ServeToolSitemap)
	router.GET("/robots.txt", h.seo.ServeRobotsTxt)

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
