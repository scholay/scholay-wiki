// ============================================================================
// Scholay学术 V1.0
// Service Bootstrap / DI Container
// 集中处理所有模块的初始化与依赖注入，保持 main.go 简洁
// ============================================================================

package main

import (
	"log/slog"
	"time"

	"scholar-backend/internal/admin"
	"scholar-backend/internal/ai"
	"scholar-backend/internal/common/cleanup"
	appconfig "scholar-backend/internal/common/config"
	"scholar-backend/internal/common/database"
	"scholar-backend/internal/common/middleware"
	"scholar-backend/internal/config"
	"scholar-backend/internal/conversation"
	"scholar-backend/internal/feedback"
	"scholar-backend/internal/hotcontent"
	"scholar-backend/internal/latexwriter"
	"scholar-backend/internal/mcp"
	"scholar-backend/internal/message"
	"scholar-backend/internal/minicod"
	"scholar-backend/internal/pdf"
	"scholar-backend/internal/peerreview"
	"scholar-backend/internal/proxy"
	"scholar-backend/internal/semanticscholar"
	"scholar-backend/internal/thirdparty"
	"scholar-backend/internal/usagelog"
	"scholar-backend/internal/user"
	"scholar-backend/internal/wechat"
	"scholar-backend/internal/websocket"
)

// services 聚合所有服务与 handler，供 main 使用
type services struct {
	handlers          *allHandlers
	userService       *user.Service
	peerReviewService *peerreview.Service
	cleanupService    *cleanup.CleanupService
	thirdPartyService *thirdparty.Service
	wsHub             *websocket.Hub
}

// bootstrapServices 初始化全部模块与依赖注入
// 注意：顺序保持与原 main.go 一致，以避免破坏隐式依赖链
func bootstrapServices(cfg *appconfig.Config) *services {
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
	feedbackHandler := feedback.NewHandler(feedbackService)

	// Initialize default admin user
	if err := adminService.InitializeDefaultAdmin(cfg.Admin.InitialUsername, cfg.Admin.InitialPassword); err != nil {
		slog.Warn("Failed to initialize default admin", "err", err)
	} else {
		slog.Info("Default admin user initialized", "username", cfg.Admin.InitialUsername)
	}

	// Initialize user module
	userRepo := user.NewRepository(database.GetDB())
	userService := user.NewService(userRepo)
	userHandler := user.NewHandler(userService, database.GetDB())

	// Inject session creator into admin handler so admin logins create sessions
	adminHandler.SetSessionCreator(userService)

	// Initialize config module
	configRepo := config.NewRepository(database.GetDB())
	configService := config.NewService(configRepo)
	configHandler := config.NewHandler(configService)

	// Inject config service into user service (for email sending)
	userService.SetConfigService(configService)

	// Inject config service into feedback service (for reply email sending)
	feedbackService.SetConfigService(configService)

	// Inject user repository into feedback service (for user info lookup)
	feedbackService.SetUserRepository(&feedbackUserRepoAdapter{userRepo: userRepo})

	// Initialize default privacy policy
	if err := configService.InitializeDefaultPrivacyPolicy(); err != nil {
		slog.Warn("Failed to initialize default privacy policy", "err", err)
	} else {
		slog.Info("Default privacy policy initialized")
	}

	// Initialize default terms of service
	if err := configService.InitializeDefaultTermsOfService(); err != nil {
		slog.Warn("Failed to initialize default terms of service", "err", err)
	} else {
		slog.Info("Default terms of service initialized")
	}

	// Initialize default system config
	if err := configService.InitializeDefaultSystemConfig(); err != nil {
		slog.Warn("Failed to initialize default system config", "err", err)
	} else {
		slog.Info("Default system config initialized")
	}

	// Initialize Third-party Account Management
	thirdPartyRepo := thirdparty.NewRepository(database.GetDB())
	thirdPartyService := thirdparty.NewService(thirdPartyRepo)
	thirdPartyHandler := thirdparty.NewHandler(thirdPartyService)

	// Start cache refresh task (every 5 minutes)
	thirdPartyService.StartCacheRefreshTask(5 * time.Minute)
	slog.Info("Third-party account service initialized with cache refresh")

	// Initialize AI service (需要在 scholar handler 之前初始化)
	aiService := ai.NewService(database.GetDB(), thirdPartyService)

	// Initialize Semantic Scholar module with key rotation (kept for MCP module)
	scholarManager := semanticscholar.NewManager(thirdPartyService)

	// Initialize Minicod module (replaces Semantic Scholar for direct search)
	minicodManager := minicod.NewManager(thirdPartyService)
	minicodHandler := minicod.NewHandler(minicodManager, aiService)

	// Initialize unified MCP handler with all tool providers
	mcpUnifiedHandler := mcp.NewUnifiedHandler(mcp.HandlerConfig{
		DB:             database.GetDB(),
		ScholarManager: scholarManager,
		SerperAPIKey:   cfg.ExternalServices.SerperAPIKey,
		CrossrefEmail:  cfg.ExternalServices.CrossrefEmail,
	})
	mcpHandler := mcp.NewHandler(scholarManager)
	aiHandler := ai.NewHandler(aiService)

	// Initialize Peer Review module
	mcpServer := mcp.NewMCPServer(scholarManager)
	peerReviewService := peerreview.NewService(database.GetDB(), aiService, mcpServer, thirdPartyService)
	peerReviewHandler := peerreview.NewHandler(peerReviewService)

	// Initialize LaTeX Writer module
	latexWriterService := latexwriter.NewService(database.GetDB(), aiService)
	latexWriterHandler := latexwriter.NewHandler(latexWriterService)
	latexAgentConfigRepo := latexwriter.NewAgentConfigRepository(database.GetDB())
	latexAgentAdminHandler := latexwriter.NewAdminHandler(latexAgentConfigRepo, database.GetDB())

	// Initialize Conversation module
	conversationRepo := conversation.NewRepository(database.GetDB())
	conversationService := conversation.NewService(conversationRepo, scholarManager, aiService)
	conversationHandler := conversation.NewHandler(conversationService)
	chatHandler := conversation.NewChatHandler(conversationRepo, aiService, conversationService)

	// Initialize Proxy module
	proxyHandler := proxy.NewHandler()

	// Initialize PDF module
	unpaywallEmail := cfg.ExternalServices.UnpaywallEmail
	if unpaywallEmail == "" {
		unpaywallEmail = "api@scholay.com"
	}
	pdfService := pdf.NewService(unpaywallEmail)
	pdfHandler := pdf.NewHandler(pdfService)
	slog.Info("PDF service initialized", "unpaywall_email", unpaywallEmail)

	// 支付域
	alipayHandler, wechatPayHandler := initPaymentHandlers(database.GetDB())

	// 微信域（小程序 + 公众号）
	wechatService, wechatHandler, wechatOfficialHandler := initWeChatDomain(database.GetDB(), aiService)

	// 跨域注入：微信 service 适配后注入 user handler
	userHandler.SetWeChatService(wechat.NewServiceAdapter(wechatService))

	// Initialize UsageLog module (功能使用统计)
	usageLogRepo := usagelog.NewRepository(database.GetDB())
	usageLogService := usagelog.NewService(usageLogRepo)
	usageLogHandler := usagelog.NewHandler(usageLogService)
	usageLogAdminHandler := usagelog.NewAdminHandler(usageLogService)

	// Inject usageLogService into configHandler (for dynamic sitemap generation)
	configHandler.SetUsageLogService(&usageLogServiceAdapter{usageLogService})

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
	wsHub.SetSessionUpdater(userService)

	// Inject user service into WebSocket hub for real-time snapshot recording
	wsHub.SetSnapshotRecorder(userService)

	// Inject WebSocket hub into services for real-time online statistics
	userService.SetOnlineStatsProvider(wsHub)
	userHandler.SetOnlineStatsProvider(wsHub)
	dashboardHandler.SetOnlineStatsProvider(wsHub)

	// Inject message service into user service (for welcome message)
	userService.SetMessageService(messageHandler.GetAdapter())
	// Inject query services into user handler
	userHandler.SetConversationQueryService(&conversationQueryAdapter{svc: conversationService})
	userHandler.SetPeerReviewQueryService(&peerReviewQueryAdapter{svc: peerReviewService})

	return &services{
		handlers: &allHandlers{
			admin:           adminHandler,
			dashboard:       dashboardHandler,
			user:            userHandler,
			config:          configHandler,
			scholar:         minicodHandler,
			ai:              aiHandler,
			conversation:    conversationHandler,
			chat:            chatHandler,
			proxy:           proxyHandler,
			pdf:             pdfHandler,
			alipay:          alipayHandler,
			wechatPay:       wechatPayHandler,
			wechat:          wechatHandler,
			wechatOfficial:  wechatOfficialHandler,
			usageLog:        usageLogHandler,
			usageLogAdmin:   usageLogAdminHandler,
			hotContent:      hotContentHandler,
			message:         messageHandler,
			feedback:        feedbackHandler,
			peerReview:      peerReviewHandler,
			latexWriter:     latexWriterHandler,
			latexAgentAdmin: latexAgentAdminHandler,
			ws:              wsHandler,
			thirdParty:      thirdPartyHandler,
			mcpUnified:      mcpUnifiedHandler,
			mcpLegacy:       mcpHandler,
		},
		userService:       userService,
		peerReviewService: peerReviewService,
		cleanupService:    cleanupService,
		thirdPartyService: thirdPartyService,
		wsHub:             wsHub,
	}
}
