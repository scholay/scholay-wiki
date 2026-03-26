// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package main

import (
	"context"
	"log"
	"os"
	"time"

	"scholar-backend/internal/admin"
	"scholar-backend/internal/agent"
	"scholar-backend/internal/ai"
	"scholar-backend/internal/feedback"
	"scholar-backend/internal/latexwriter"
	"scholar-backend/internal/message"
	"scholar-backend/internal/common/adapter"
	"scholar-backend/internal/common/cache"
	"scholar-backend/internal/common/cleanup"
	appconfig "scholar-backend/internal/common/config"
	"scholar-backend/internal/common/database"
	"scholar-backend/internal/common/middleware"
	"scholar-backend/internal/common/telemetry"
	"scholar-backend/internal/config"
	"scholar-backend/internal/conversation"
	"scholar-backend/internal/mcp"
	"scholar-backend/internal/order"
	"scholar-backend/internal/payment"
	"scholar-backend/internal/pdf"
	"scholar-backend/internal/peerreview"
	"scholar-backend/internal/proxy"
	"scholar-backend/internal/semanticscholar"
	"scholar-backend/internal/hotcontent"
	"scholar-backend/internal/thirdparty"
	"scholar-backend/internal/user"
	"scholar-backend/internal/usagelog"
	"scholar-backend/internal/wechat"
	"scholar-backend/internal/wechatofficial"
	"scholar-backend/internal/websocket"

	"github.com/gin-gonic/gin"
	"go.opentelemetry.io/otel/attribute"
)

func main() {
	// Load configuration
	cfg := appconfig.Load()

	// Set Gin mode based on environment
	if cfg.SigNoz.Environment == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	// Initialize OpenTelemetry with SigNoz
	ctx := context.Background()
	if cfg.SigNoz.EnableTracing || cfg.SigNoz.EnableLogging {
		telemetryCfg := &telemetry.Config{
			Endpoint:      cfg.SigNoz.Endpoint,
			ServiceName:   cfg.SigNoz.ServiceName,
			Environment:   cfg.SigNoz.Environment,
			EnableTracing: cfg.SigNoz.EnableTracing,
			EnableLogging: cfg.SigNoz.EnableLogging,
			EnableMetrics: cfg.SigNoz.EnableMetrics,
			SamplingRate:  cfg.SigNoz.SamplingRate,
		}
		
		// Set global endpoint for logger
		telemetry.SetGlobalEndpoint(telemetryCfg.Endpoint)
		
		telemetryShutdown, err := telemetry.Initialize(ctx, telemetryCfg)
		if err != nil {
			log.Printf("Warning: Failed to initialize telemetry: %v", err)
		} else {
			log.Printf("✓ Telemetry initialized (SigNoz endpoint: %s)", telemetryCfg.Endpoint)
			log.Printf("  - Service: %s", telemetryCfg.ServiceName)
			log.Printf("  - Environment: %s", telemetryCfg.Environment)
			log.Printf("  - Tracing: %v, Logging: %v", telemetryCfg.EnableTracing, telemetryCfg.EnableLogging)
			log.Printf("  - Sampling Rate: %.1f%%", telemetryCfg.SamplingRate*100)
			
			defer func() {
				shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				defer cancel()
				if err := telemetryShutdown(shutdownCtx); err != nil {
					log.Printf("Error shutting down telemetry: %v", err)
				}
			}()
		}
	} else {
		log.Println("✓ Telemetry disabled by configuration")
	}

	// Create logger for main (only if telemetry is enabled)
	var logger *telemetry.Logger
	if cfg.SigNoz.EnableLogging {
		logger = telemetry.NewLogger("main")
		logger.Info(ctx, "Starting Scholar Backend Service",
			attribute.String("version", "1.0.0"),
			attribute.String("environment", cfg.SigNoz.Environment),
		)
	}

	// Initialize Redis
	if err := cache.InitRedis(cfg.Redis.Host, cfg.Redis.Port, cfg.Redis.Password, cfg.Redis.DB); err != nil {
		if logger != nil {
			logger.Fatal(ctx, "Failed to initialize Redis", err)
		}
		log.Fatalf("Failed to initialize Redis: %v", err)
	}
	if logger != nil {
		logger.Info(ctx, "Redis initialized successfully")
	}
	log.Println("✓ Redis initialized successfully")

	// Initialize cache worker pool (prevents goroutine accumulation from async cache writes)
	cache.InitWorkerPool(10, 100) // 10 workers, queue size 100

	// Initialize database
	if err := database.Initialize(cfg); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}

	// Initialize cleanup service
	cleanupService := cleanup.NewCleanupService(database.GetDB())
	cleanupService.Start()

	// Initialize session validator for single sign-on (with Redis cache)
	sessionValidator := middleware.NewCachedSessionValidator(database.GetDB())
	middleware.SetSessionValidator(sessionValidator)

	// Initialize admin module
	adminRepo := admin.NewRepository(database.GetDB())
	adminService := admin.NewService(adminRepo)
	adminHandler := admin.NewHandler(adminService)

	// Initialize dashboard handler
	dashboardHandler := admin.NewDashboardHandler(database.GetDB())

	// Initialize feedback module
	feedbackRepo := feedback.NewRepository(database.GetDB())
	feedbackService := feedback.NewService(feedbackRepo)
	feedbackHandler := feedback.NewHandler(feedbackService, "./uploads")

	// Initialize default admin user
	if err := adminService.InitializeDefaultAdmin(cfg.Admin.InitialUsername, cfg.Admin.InitialPassword); err != nil {
		log.Printf("Warning: Failed to initialize default admin: %v", err)
	} else {
		log.Printf("Default admin user initialized (username: %s)", cfg.Admin.InitialUsername)
	}

	// Initialize user module
	userRepo := user.NewRepository(database.GetDB())
	userService := user.NewService(userRepo)
	userHandler := user.NewHandler(userService, database.GetDB())

	// Initialize config module
	configRepo := config.NewRepository(database.GetDB())
	configService := config.NewService(configRepo)
	configHandler := config.NewHandler(configService)

	// Inject config service into user service (for email sending)
	userService.SetConfigService(configService)

	// Inject config service into feedback service (for reply email sending)
	feedbackService.SetConfigService(configService)

	// Inject user repository into feedback service (for user info lookup)
	feedbackService.SetUserRepository(adapter.NewFeedbackUserRepoAdapter(userRepo))

	// Initialize default privacy policy
	if err := configService.InitializeDefaultPrivacyPolicy(); err != nil {
		log.Printf("Warning: Failed to initialize default privacy policy: %v", err)
	} else {
		log.Printf("Default privacy policy initialized")
	}

	// Initialize default terms of service
	if err := configService.InitializeDefaultTermsOfService(); err != nil {
		log.Printf("Warning: Failed to initialize default terms of service: %v", err)
	} else {
		log.Printf("Default terms of service initialized")
	}

	// Initialize default system config
	if err := configService.InitializeDefaultSystemConfig(); err != nil {
		log.Printf("Warning: Failed to initialize default system config: %v", err)
	} else {
		log.Printf("Default system config initialized")
	}

	// Initialize Third-party Account Management
	thirdPartyRepo := thirdparty.NewRepository(database.GetDB())
	thirdPartyService := thirdparty.NewService(thirdPartyRepo)
	thirdPartyHandler := thirdparty.NewHandler(thirdPartyService)

	// Start cache refresh task (every 5 minutes)
	thirdPartyService.StartCacheRefreshTask(5 * time.Minute)
	log.Printf("Third-party account service initialized with cache refresh")

	// Initialize AI service (需要在scholar handler之前初始化)
	aiService := ai.NewService(database.GetDB(), thirdPartyService)
	
	// Initialize Semantic Scholar module with key rotation
	scholarManager := semanticscholar.NewManager(thirdPartyService)
	scholarHandler := semanticscholar.NewHandler(scholarManager, aiService) // 传入aiService用于查询翻译
	
	// Initialize unified MCP handler with all tool providers
	mcpUnifiedHandler := mcp.NewUnifiedHandler(mcp.HandlerConfig{
		DB:             database.GetDB(),
		ScholarManager: scholarManager,
		SerperAPIKey:   os.Getenv("SERPER_API_KEY"),   // 可选：网络搜索 API
		CrossrefEmail:  os.Getenv("CROSSREF_EMAIL"),   // 可选：Crossref Polite Pool
	})
	// 保留旧的 handler 以保持向后兼容
	mcpHandler := mcp.NewHandler(scholarManager)
	aiHandler := ai.NewHandler(aiService)

	// Initialize Peer Review module
	mcpServer := mcp.NewMCPServer(scholarManager)
	peerReviewService := peerreview.NewService(database.GetDB(), aiService, mcpServer, thirdPartyService)
	peerReviewHandler := peerreview.NewHandler(peerReviewService)

	// Initialize LaTeX Writer module
	latexWriterService := latexwriter.NewService(database.GetDB(), aiService)
	latexWriterHandler := latexwriter.NewHandler(latexWriterService)
	// LaTeX Agent 管理员配置
	latexAgentConfigRepo := latexwriter.NewAgentConfigRepository(database.GetDB())
	latexAgentAdminHandler := latexwriter.NewAdminHandler(latexAgentConfigRepo, database.GetDB())

	// Initialize Conversation module
	conversationRepo := conversation.NewRepository(database.GetDB())
	conversationService := conversation.NewService(conversationRepo, scholarManager, aiService)
	conversationHandler := conversation.NewHandler(conversationService)
	chatHandler := conversation.NewChatHandler(conversationRepo, aiService, conversationService)

	// Initialize Proxy module
	proxyHandler := proxy.NewHandler()

	// Initialize Agent proxy module (V2 review via agent.scholay.com)
	agentHandler := agent.NewHandler()

	// Initialize PDF module
	// Unpaywall API 需要邮箱，从环境变量读取或使用默认值
	unpaywallEmail := os.Getenv("UNPAYWALL_EMAIL")
	if unpaywallEmail == "" {
		unpaywallEmail = "api@scholay.com" // 默认邮箱
	}
	pdfService := pdf.NewService(unpaywallEmail)
	pdfHandler := pdf.NewHandler(pdfService)
	log.Printf("PDF service initialized (Unpaywall email: %s)", unpaywallEmail)

	// Initialize Order module
	orderService := order.NewService(database.GetDB())
	orderHandler := order.NewHandler(orderService)

	// Initialize Payment module
	alipayHandler := payment.NewAlipayHandler(database.GetDB(), orderService)
	wechatPayRepo := payment.NewWeChatPayRepository(database.GetDB())
	wechatPayService := payment.NewWeChatPayService(wechatPayRepo)
	wechatPayHandler := payment.NewWeChatPayHandler(wechatPayService, orderService)

	// Initialize WeChat module
	wechatService := wechat.NewService(database.GetDB())
	wechatHandler := wechat.NewHandler(database.GetDB())

	// Create adapter and inject into user handler
	wechatAdapter := wechat.NewServiceAdapter(wechatService)
	userHandler.SetWeChatService(wechatAdapter)

	// Initialize WeChat Official Account module
	wechatOfficialService := wechatofficial.NewService(database.GetDB(), aiService)
	wechatOfficialHandler := wechatofficial.NewHandler(wechatOfficialService)

	// Initialize UsageLog module (功能使用统计)
	usageLogRepo := usagelog.NewRepository(database.GetDB())
	usageLogService := usagelog.NewService(usageLogRepo)
	usageLogHandler := usagelog.NewHandler(usageLogService)
	usageLogAdminHandler := usagelog.NewAdminHandler(usageLogService)

	// Inject usageLogService into configHandler (for dynamic sitemap generation)
	configHandler.SetUsageLogService(adapter.NewUsageLogServiceAdapter(usageLogService))

	// Initialize HotContent module (热门内容统计)
	hotContentRepo := hotcontent.NewRepository(database.GetDB())
	hotContentService := hotcontent.NewService(hotContentRepo)
	hotContentHandler := hotcontent.NewHandler(hotContentService)

	// Inject hotContentService into usageLogService (for recording hot content)
	usageLogService.SetHotContentService(hotContentService)

	// Inject hotContentService into cleanupService (for scheduled cleanup)
	cleanupService.SetHotContentService(hotContentService)

	// Initialize Message module (站内信)
	messageHandler := message.NewHandler(database.GetDB())

	// Initialize WebSocket module (实时消息推送)
	wsHub := websocket.NewHub()
	wsHandler := websocket.NewHandler(wsHub, cfg.JWT.Secret)

	// Inject WebSocket hub into message service for real-time notifications
	messageHandler.SetWebSocketHub(wsHub)

	// Inject user service into WebSocket hub for session activity updates
	// This replaces the HTTP heartbeat endpoint with WebSocket-based session tracking
	wsHub.SetSessionUpdater(userService)

	// Inject user service into WebSocket hub for real-time snapshot recording
	// This records online count on every connect/disconnect for accurate tracking
	wsHub.SetSnapshotRecorder(userService)

	// Inject WebSocket hub into services for real-time online statistics
	// This replaces the old session-based online user counting
	userService.SetOnlineStatsProvider(wsHub)
	userHandler.SetOnlineStatsProvider(wsHub)
	dashboardHandler.SetOnlineStatsProvider(wsHub)

	// Inject message service into user service (for welcome message)
	userService.SetMessageService(messageHandler.GetAdapter())

	// Setup Gin router and global middleware
	router := setupRouter(cfg.SigNoz.EnableTracing, cfg.SigNoz.EnableLogging, cfg.SigNoz.ServiceName)

	// API routes
	api := router.Group("/api/v1")
	registerAPIRoutes(api, &routeHandlers{
		admin:              adminHandler,
		dashboard:          dashboardHandler,
		config:             configHandler,
		user:               userHandler,
		thirdParty:         thirdPartyHandler,
		ai:                 aiHandler,
		order:              orderHandler,
		alipay:             alipayHandler,
		wechatPay:          wechatPayHandler,
		wechatOAuth:        wechatHandler,
		wechatOfficial:     wechatOfficialHandler,
		latexAgentAdmin:    latexAgentAdminHandler,
		feedback:           feedbackHandler,
		usageLogAdmin:      usageLogAdminHandler,
		usageLog:           usageLogHandler,
		hotContent:         hotContentHandler,
		message:            messageHandler,
		pdf:                pdfHandler,
		conversation:       conversationHandler,
		chat:               chatHandler,
		peerReview:         peerReviewHandler,
		latexWriter:        latexWriterHandler,
		scholar:            scholarHandler,
		mcpUnified:         mcpUnifiedHandler,
		mcpLegacy:          mcpHandler,
		proxy:              proxyHandler,
		ws:                 wsHandler,
		agent:              agentHandler,
	})

	registerOperationalRoutes(
		router,
		configHandler.ServeDynamicSitemap,
		configHandler.ServeSitemapIndex,
		configHandler.ServeIndexHTML,
	)

	// Create context for graceful shutdown
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Start database connection pool monitoring
	database.StartConnectionPoolMonitoring(ctx, 5*time.Minute)

	// Start background tasks
	startOnlineSnapshotTask(ctx, userService)

	runServerWithGracefulShutdown(router, cfg.Server.Port, func() {
		cancel()
		cache.ShutdownGlobalPool()
		if err := wsHub.Close(); err != nil {
			log.Printf("Error closing WebSocket hub: %v", err)
		}
		time.Sleep(2 * time.Second)
		log.Println("Server stopped")
	})
}
