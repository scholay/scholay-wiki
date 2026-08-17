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
	"scholar-backend/internal/agentattach"
	"scholar-backend/internal/agentbridge"
	"scholar-backend/internal/agentconfig"
	"scholar-backend/internal/agentrun"
	"scholar-backend/internal/ai"
	"scholar-backend/internal/announcement"
	"scholar-backend/internal/boltslides"
	"scholar-backend/internal/claw"
	"scholar-backend/internal/clientlog"
	"scholar-backend/internal/common/cache"
	appconfig "scholar-backend/internal/common/config"
	"scholar-backend/internal/common/database"
	"scholar-backend/internal/common/middleware"
	"scholar-backend/internal/common/utils"
	"scholar-backend/internal/config"
	"scholar-backend/internal/content"
	"scholar-backend/internal/emaillog"
	"scholar-backend/internal/featuretool"
	"scholar-backend/internal/feedback"
	"scholar-backend/internal/hotcontent"
	"scholar-backend/internal/invite"
	"scholar-backend/internal/library"
	"scholar-backend/internal/llmusage"
	"scholar-backend/internal/message"
	"scholar-backend/internal/minicod"
	"scholar-backend/internal/modelcatalog"
	"scholar-backend/internal/news"
	"scholar-backend/internal/openaccess"
	"scholar-backend/internal/payment"
	"scholar-backend/internal/peerreview"
	"scholar-backend/internal/prism"
	"scholar-backend/internal/promo"
	"scholar-backend/internal/scidraw"
	"scholar-backend/internal/seo"
	"scholar-backend/internal/seoingest"
	"scholar-backend/internal/skillmarket"
	"scholar-backend/internal/smartsearch"
	"scholar-backend/internal/stagingarea"
	"scholar-backend/internal/statlab"
	"scholar-backend/internal/supportcenter"
	"scholar-backend/internal/thirdparty"
	"scholar-backend/internal/umami"
	"scholar-backend/internal/usagestat"
	"scholar-backend/internal/user"
	"scholar-backend/internal/usermemory"
	"scholar-backend/internal/vip"
	"scholar-backend/internal/websocket"
	"scholar-backend/internal/wechat"
	"scholar-backend/internal/wechatofficial"
	"scholar-backend/internal/wikimcp"

	"github.com/gin-gonic/gin"
)

// allHandlers 聚合所有 handler 实例，用于路由注册
type allHandlers struct {
	admin          *admin.Handler
	dashboard      *admin.DashboardHandler
	user           *user.Handler
	config         *config.Handler
	scholar        *minicod.Handler
	ai             *ai.Handler
	alipay         *payment.AlipayHandler
	wechatPay      *payment.WeChatPayHandler
	wechat         *wechat.Handler
	wechatOfficial *wechatofficial.Handler
	usageStats     *usagestat.Handler
	llmUsageAdmin  *llmusage.AdminHandler // 后台 token 用量看板 (llm_token_usage 聚合/明细/导出)
	vip            *vip.Handler           // 会员: 用户兑换/状态 + 管理端生码/列表
	hotContent     *hotcontent.Handler
	seo            *seo.Handler
	seoIngest      *seoingest.Handler // 期刊全量摄取/发布(admin 同步 run 控制 + 分批发布)
	message        *message.Handler
	feedback       *feedback.Handler
	emailLog       *emaillog.Handler // 邮件发送记录(后台「邮件记录」菜单)
	ws             *websocket.Handler
	thirdParty     *thirdparty.Handler
	announcement   *announcement.Handler
	library        *library.Handler
	stagingArea    *stagingarea.Handler
	clientLog      *clientlog.Handler     // 前端错误上报 → docker logs
	umami          *umami.Handler         // admin /analytics 查询 umami HTTP API 渲染自有图表
	agentConfig    *agentconfig.Handler   // 通用 agent 服务 (scholar_agent) 的模型/端点配置
	modelCatalog   *modelcatalog.Handler  // 模型目录 + 能力绑定 (取代 4 槽位, P1)
	smartSearch    *smartsearch.Handler   // 智能搜索 backend 桥接 (HTTP 创会话 + WS 双向 pipe)
	peerReview     *peerreview.Handler    // 智能审稿 v3 (我要投稿 + 审稿记录,服务端 4 轮编排)
	claw           *claw.Handler          // 智能助手 (通用对话 + 上传附件 + Minicod MCP)
	agentRun       *agentrun.Handler      // 科研内核 Run 引擎 (Phase 1: 创建/查询/取消长任务)
	boltSlides     *boltslides.Handler    // 制作PPT (bolt-slides 演示稿创作;智能助手页选项卡切入)
	sciDraw        *scidraw.Handler       // 科研绘图 (原创矢量科研图;智能助手页模板卡切入)
	statLab        *statlab.Handler       // 数据分析 (statkit 引擎守门 + 合规交付物;智能助手页模板卡切入)
	skillMarket    *skillmarket.Handler   // Skills 市场 (用户上传/分享 skill + claw 动态加载)
	prism          *prism.Handler         // 智能写作 (LaTeX IDE: 项目/文件/编译沙箱; Phase 1 接 agent)
	featureTool    *featuretool.Handler   // 功能大全 (学术工具黄页: 导入/CRUD/webhook 同步/公开浏览)
	agentBridge    *agentbridge.Bridge    // agent 内网回调端点 (带外 token 用量上报: title-gen 等)
	supportCenter  *supportcenter.Handler // 客服与联系中心 (联系方式配置/IMAP 收件箱/飞书通知/写信)
	promo          *promo.Handler         // 限时领取会员推广 (开关/二维码/文案 + 公开下发)
	news           *news.Handler          // 情报 (学术新闻): webhook 接收/落库 + 公开读 + admin 配置
	memory         *usermemory.Handler    // per-user 长期记忆 (查看/编辑/删除; agent 注入由 Bridge 负责)
	openAccess     *openaccess.Handler    // 合法 OA 全文查找 (DOI → Unpaywall 免费链接; 论文详情页兜底)
	invite         *invite.Handler        // 邀请注册 (一人一码 + 落地页打开计数 + 新用户归因)
	// attachment: agent 输入框附件的**统一**取回/删除端点 (0112 耐久化)。
	// 全仓一条路由服务全部 feature —— 刻意不做成 per-feature 镜像:老的 session/file
	// 就是四份镜像,结果 stat_lab/sci_draw/boltslides 三个 feature 的那条从没被注册过。
	attachment *agentattach.ServeHandler
}

// headResponseWriter 保留 handler 产生的状态码与响应头，但丢弃响应体。
// Gin/httptest 不会像真实 net/http server 那样自动抑制 HEAD body；显式包装可让
// 线上行为、单元测试与 RFC HEAD 语义一致，也覆盖返回 404/500 的 sitemap handler。
type headResponseWriter struct {
	gin.ResponseWriter
}

func (w *headResponseWriter) Write(data []byte) (int, error) {
	return len(data), nil
}

func (w *headResponseWriter) WriteString(data string) (int, error) {
	return len(data), nil
}

func headOnly(handler gin.HandlerFunc) gin.HandlerFunc {
	return func(c *gin.Context) {
		original := c.Writer
		c.Writer = &headResponseWriter{ResponseWriter: original}
		defer func() { c.Writer = original }()
		handler(c)
	}
}

// registerGETAndHEAD 为只读 SEO 资源注册同一个 handler。
// HEAD 会完整执行 handler 以保持与 GET 相同的状态码/缓存头/MIME，但不传输正文。
func registerGETAndHEAD(router *gin.Engine, path string, handler gin.HandlerFunc) {
	router.GET(path, handler)
	router.HEAD(path, headOnly(handler))
}

// indexableOnly 非权威环境(APP_ENV=test/dev,或显式 SEO_INDEXABLE=false)一律 404。
//
// 用在 sitemap 全家桶上。只把 robots.txt 改成 Disallow 是不够的:sitemap 的 URL
// 是可以被直接猜到/被历史外链带出来的,而它恰恰是「整份可抓 URL 清单」——
// 对不守 robots 协议的爬虫,留着 sitemap 等于把地图递过去。
//
// 404 而不是 403:对爬虫而言 404 是「这里没有东西」,是最干净的信号;
// 403 反而暗示「有东西但不给你」,某些爬虫会继续重试。
func indexableOnly(handler gin.HandlerFunc) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !appconfig.RequestIndexable(c.Request.Host) {
			c.Status(http.StatusNotFound)
			c.Abort()
			return
		}
		handler(c)
	}
}

func registerSEOReadRoutes(router *gin.Engine, h *allHandlers) {
	registerGETAndHEAD(router, "/sitemap.xml", indexableOnly(h.seo.ServeSitemapIndex))
	registerGETAndHEAD(router, "/sitemap-static.xml", indexableOnly(h.seo.ServeStaticSitemap))
	registerGETAndHEAD(router, "/sitemap-blogs.xml", indexableOnly(h.seo.ServeBlogSitemap))
	registerGETAndHEAD(router, "/sitemap-resources.xml", indexableOnly(h.seo.ServeResourceSitemap))
	registerGETAndHEAD(router, "/sitemap-qa.xml", indexableOnly(h.seo.ServeQASitemap))
	registerGETAndHEAD(router, "/sitemap-papers-:page.xml", indexableOnly(h.seo.ServePaperSitemap))
	registerGETAndHEAD(router, "/sitemap-authors-:page.xml", indexableOnly(h.seo.ServeAuthorSitemap))
	registerGETAndHEAD(router, "/sitemap-journals-:page.xml", indexableOnly(h.seo.ServeJournalSitemap))
	// 期刊枢纽页 sitemap(/journals/browse 与各维度枢纽含路径分页;nginx 的
	// sitemap-*.xml 正则已覆盖此文件名)。
	registerGETAndHEAD(router, "/sitemap-journal-hubs.xml", indexableOnly(h.seo.ServeJournalHubSitemap))
	// 功能大全工具 sitemap（匿名收录）—— 索引 + 分页。
	registerGETAndHEAD(router, "/sitemap-tools.xml", indexableOnly(h.featureTool.ServeToolSitemapIndex))
	registerGETAndHEAD(router, "/sitemap-tools-:page.xml", indexableOnly(h.featureTool.ServeToolSitemap))
	// 情报 sitemap（由 news 提供；seo 索引引用其 URL）。
	registerGETAndHEAD(router, "/sitemap-news.xml", indexableOnly(h.news.ServeNewsSitemap))
	// Google News sitemap:仅最近 48h 的文章 + news: 命名空间(官方两天窗口要求)。
	registerGETAndHEAD(router, "/sitemap-news-latest.xml", indexableOnly(h.news.ServeGoogleNewsSitemap))
	// robots.txt 不套 indexableOnly:它必须始终 200,只是内容换成 Disallow: /。
	// 404 的 robots 在多数爬虫眼里等同「没有限制,随便抓」,恰好是反效果。
	registerGETAndHEAD(router, "/robots.txt", h.seo.ServeRobotsTxt)
}

// registerRoutes 注册所有 API 路由
func registerRoutes(router *gin.Engine, h *allHandlers, cfg *appconfig.Config) {
	// 第二道限流：按 user_id（认证用户）/ IP（匿名）分级限流，挂在认证路由组内层，
	// 以便 UserAuthMiddleware 已经把 user_id 写入 ctx 后立刻生效。
	// 使用 Redis 后端，多实例部署下计数共享；Redis 不可用时自动降级到内存版。
	tieredRL := middleware.TieredRedisRateLimitMiddleware(middleware.TieredRateLimitOptions{
		IPRPS:     cfg.RateLimit.IPRPS,
		IPBurst:   cfg.RateLimit.IPBurst,
		UserRPS:   cfg.RateLimit.UserRPS,
		UserBurst: cfg.RateLimit.UserBurst,
	})

	api := router.Group("/api/v1")
	// 维护模式拦截 — 启用后普通用户走 503,管理员/白名单正常通过
	api.Use(middleware.MaintenanceModeMiddleware())
	// 邀请码透传 — 把 X-Invite-Code 请求头写进 request ctx(只透传不校验,一次 header 读取,
	// 开销可忽略)。挂整组是因为消费点分散在 email/phone/各 OAuth 共 9 条注册成功路径,
	// 仅在「新用户创建成功(事务提交后)」被 internal/invite 归因钩子消费。
	api.Use(middleware.InviteCodeMiddleware())
	{
		// WebSocket 端点（认证通过 URL 参数）
		api.GET("/ws", h.ws.HandleWebSocket)

		// 公共配置路由
		h.config.RegisterRoutes(api)
		// 用户端「联系我们」展示数据(免登录;空字段前端自然隐藏)
		api.GET("/config/support-contact", h.supportCenter.GetPublicContact)
		// 限时领取会员推广配置(免登录;关闭时只回 enabled=false,不泄漏二维码/文案)
		api.GET("/config/promo", h.promo.GetPublic)
		api.GET("/config/promo/summary", h.promo.GetPublicSummary)
		api.GET("/config/promo/qr", h.promo.GetPublicQR)

		// 内容中心(博客 / 学术资源)公开 API —— 正文单一真源 internal/content(go:embed),
		// 前端文章列表 / 详情页取数;SSR 也读同一份 content 包渲染 noscript 全文。无鉴权、无状态。
		contentHandler := content.NewHandler()
		api.GET("/content/:kind", contentHandler.ListArticles)
		api.GET("/content/:kind/:slug", contentHandler.GetArticle)

		// Wiki MCP：公开、匿名、只读的全站 Wiki 知识端点。单端点同时支持
		// 2026-07-28 无会话协议和 initialize 时代客户端的兼容请求；不接业务写服务。
		wikiMCPHandler := wikimcp.NewHandler()
		api.POST(wikimcp.RoutePath, wikiMCPHandler.Handle)
		api.GET(wikimcp.RoutePath, wikiMCPHandler.MethodNotAllowed)
		api.DELETE(wikimcp.RoutePath, wikiMCPHandler.MethodNotAllowed)

		// 情报(学术新闻)公开 API —— 列表 / 热榜 / 详情(免登录;enabled 关闭时返空/404)。
		// 静态段 trending / detail 与 /news 同层,避免 :param 同层冲突(故详情走 /news/detail/:slug)。
		api.GET("/news", h.news.ListPublic)
		api.GET("/news/trending", h.news.TrendingPublic)
		api.GET("/news/detail/:slug", h.news.GetDetailPublic)

		// 注:遗留的 POST /api/v1/admin/login 已下线 —— 它绕过了用户登录入口的全部
		// 防爆破加固(Turnstile / 专属限流 / dummy-bcrypt 防枚举),且前端早已统一走
		// /api/v1/user/login。管理员凭 role=admin 的 token 进 /admin。

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

	// SEO sitemap/robots：GET + HEAD 同状态/同响应头，HEAD 无正文。
	registerSEOReadRoutes(router, h)

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
