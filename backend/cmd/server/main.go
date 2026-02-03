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
	"os/signal"
	"strings"
	"syscall"
	"time"

	"scholar-backend/internal/admin"
	"scholar-backend/internal/ai"
	"scholar-backend/internal/checkin"
	"scholar-backend/internal/currency"
	"scholar-backend/internal/feedback"
	"scholar-backend/internal/fund"
	"scholar-backend/internal/latexwriter"
	"scholar-backend/internal/message"
	"scholar-backend/internal/common/cache"
	"scholar-backend/internal/common/cleanup"
	appconfig "scholar-backend/internal/common/config"
	"scholar-backend/internal/common/database"
	"scholar-backend/internal/common/middleware"
	"scholar-backend/internal/common/telemetry"
	"scholar-backend/internal/config"
	"scholar-backend/internal/conversation"
	"scholar-backend/internal/coupon"
	"scholar-backend/internal/mcp"
	"scholar-backend/internal/order"
	"scholar-backend/internal/payment"
	"scholar-backend/internal/pdf"
	"scholar-backend/internal/peerreview"
	"scholar-backend/internal/proxy"
	"scholar-backend/internal/semanticscholar"
	"scholar-backend/internal/subscription"
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

	// Initialize coupon module
	baseURL := "http://localhost:" + cfg.Server.Port // TODO: Configure from env
	redisClient := cache.GetRedis()
	couponService := coupon.NewService(database.GetDB(), userRepo, redisClient, baseURL)
	couponHandler := coupon.NewHandler(couponService)

	// Inject config service into user service (for email sending)
	userService.SetConfigService(configService)

	// Inject config service into feedback service (for reply email sending)
	feedbackService.SetConfigService(configService)

	// Inject user repository into feedback service (for user info lookup)
	feedbackService.SetUserRepository(&feedbackUserRepoAdapter{userRepo: userRepo})

	// Inject coupon service into user service (for invitation handling)
	userService.SetCouponService(couponService)

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
	mcpHandler := mcp.NewHandler(scholarManager) // MCP uses manager for dynamic API key access
	aiHandler := ai.NewHandler(aiService)

	// Initialize Peer Review module
	mcpServer := mcp.NewMCPServer(scholarManager)
	peerReviewService := peerreview.NewService(database.GetDB(), aiService, mcpServer, thirdPartyService)
	peerReviewHandler := peerreview.NewHandler(peerReviewService)

	// Initialize LaTeX Writer module
	latexWriterService := latexwriter.NewService(database.GetDB(), aiService)
	latexWriterHandler := latexwriter.NewHandler(latexWriterService)

	// Initialize Subscription module
	subscriptionService := subscription.NewService(database.GetDB())
	subscriptionHandler := subscription.NewHandler(subscriptionService)

	// Initialize Conversation module
	conversationRepo := conversation.NewRepository(database.GetDB())
	conversationService := conversation.NewService(conversationRepo, scholarManager, aiService, subscriptionService)
	conversationHandler := conversation.NewHandler(conversationService)
	chatHandler := conversation.NewChatHandler(conversationRepo, aiService, conversationService, subscriptionService)

	// Initialize Proxy module
	proxyHandler := proxy.NewHandler()

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
	orderService := order.NewService(database.GetDB(), subscriptionService)
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

	// Initialize Check-in module
	checkinRepo := checkin.NewRepository(database.GetDB())
	checkinService := checkin.NewService(checkinRepo)
	checkinHandler := checkin.NewHandler(checkinService)

	// Initialize Currency module (货币系统)
	currencyRepo := currency.NewRepository(database.GetDB(), cache.GetRedis())
	currencyService := currency.NewService(currencyRepo)
	currencyHandler := currency.NewHandler(currencyService)
	currencyAdminHandler := currency.NewAdminHandler(currencyService)
	currencyMiddleware := currency.NewDeductMiddleware(currencyService)
	currencyBatchService := currency.NewBatchService(currencyRepo, currencyService)

	// Initialize Fund module (会员基金)
	fundRepo := fund.NewRepository(database.GetDB())
	fundService := fund.NewService(fundRepo)
	fundHandler := fund.NewHandler(fundService)
	fundAdminHandler := fund.NewAdminHandler(fundService)

	// Initialize UsageLog module (功能使用统计)
	usageLogRepo := usagelog.NewRepository(database.GetDB())
	usageLogService := usagelog.NewService(usageLogRepo)
	usageLogHandler := usagelog.NewHandler(usageLogService)
	usageLogAdminHandler := usagelog.NewAdminHandler(usageLogService)

	// Inject usageLogService into configHandler (for dynamic sitemap generation)
	configHandler.SetUsageLogService(&usageLogServiceAdapter{usageLogService})

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

	// Inject currency service into user service (for register gift)
	userService.SetCurrencyService(currencyService)
	// Inject message service into user service (for welcome message)
	userService.SetMessageService(messageHandler.GetAdapter())
	// Inject currency service into checkin service (for checkin gold reward)
	checkinService.SetCurrencyService(currencyService)
	// Inject currency service into coupon service (for invite diamond reward)
	couponService.SetCurrencyService(currencyService)
	// Inject message service into coupon service (for invite notification)
	couponService.SetMessageService(messageHandler.GetAdapter())
	// Inject currency service into chat handler (for AI chat deduction)
	chatHandler.SetCurrencyService(currencyService)
	// Inject currency service into conversation handler (for smart analysis deduction)
	conversationHandler.SetCurrencyService(currencyService)
	// Inject currency service into user handler (for user list wallet info)
	userHandler.SetCurrencyService(currencyService)
	// Inject currency service into order service (for recharge order)
	orderService.SetCurrencyService(currencyService)
	// Inject currency service into peer review service (for review completion deduction)
	peerReviewService.SetCurrencyService(currencyService)
	// Inject currency service into ai handler (for batch analysis deduction)
	aiHandler.SetCurrencyService(currencyService)

	// Initialize Membership Gift Service (会员经费业务服务)
	// 负责处理会员经费/恩特币的发放和清空逻辑，与定时任务调度器解耦
	membershipGiftService := currency.NewMembershipGiftService(currencyService)
	
	// 设置订阅获取函数（用于月度发放）
	membershipGiftService.SetSubscriptionGetter(func(planCodes []string) ([]currency.MemberSubscription, error) {
		subs, err := subscriptionService.GetActiveSubscriptionsByPlanCodes(planCodes)
		if err != nil {
			return nil, err
		}
		result := make([]currency.MemberSubscription, len(subs))
		for i, sub := range subs {
			result[i] = currency.MemberSubscription{
				UserID:   sub.UserID,
				PlanCode: sub.PlanCode,
			}
		}
		return result, nil
	})
	
	// 设置非会员用户获取函数（用于清空经费）- 已废弃，保留兼容
	// 获取所有当前没有活跃 pro/max 订阅且有经费的用户
	membershipGiftService.SetNonMemberGetter(func() ([]currency.NonMember, error) {
		members, err := subscriptionService.GetNonMembersWithGold()
		if err != nil {
			return nil, err
		}
		result := make([]currency.NonMember, len(members))
		for i, m := range members {
			result[i] = currency.NonMember{
				UserID:              m.UserID,
				Gold:                m.Gold,
				LastSubscriptionEnd: m.LastSubscriptionEnd,
			}
		}
		return result, nil
	})

	// 设置宽限期内会员获取函数（用于发送宽限期提醒）
	membershipGiftService.SetMembersInGracePeriodGetter(func(graceDays int) ([]currency.MemberInGracePeriod, error) {
		members, err := subscriptionService.GetMembersInGracePeriod(graceDays)
		if err != nil {
			return nil, err
		}
		result := make([]currency.MemberInGracePeriod, len(members))
		for i, m := range members {
			result[i] = currency.MemberInGracePeriod{
				UserID:    m.UserID,
				Gold:      m.Gold,
				ExpiredAt: m.ExpiredAt,
			}
		}
		return result, nil
	})

	// 设置超过宽限期的非会员获取函数（用于清空经费）
	membershipGiftService.SetNonMembersAfterGraceGetter(func(graceDays int) ([]currency.NonMember, error) {
		members, err := subscriptionService.GetNonMembersWithGoldAfterGrace(graceDays)
		if err != nil {
			return nil, err
		}
		result := make([]currency.NonMember, len(members))
		for i, m := range members {
			result[i] = currency.NonMember{
				UserID:              m.UserID,
				Gold:                m.Gold,
				LastSubscriptionEnd: m.LastSubscriptionEnd,
			}
		}
		return result, nil
	})

	// 设置即将到期会员获取函数（用于发送到期提醒）
	membershipGiftService.SetExpiringMembersGetter(func(days int) ([]currency.ExpiringMember, error) {
		members, err := subscriptionService.GetExpiringMembers(days)
		if err != nil {
			return nil, err
		}
		result := make([]currency.ExpiringMember, len(members))
		for i, m := range members {
			result[i] = currency.ExpiringMember{
				UserID:   m.UserID,
				PlanCode: m.PlanCode,
				EndDate:  m.EndDate,
			}
		}
		return result, nil
	})

	// 设置宽限期即将结束会员获取函数（用于发送宽限期结束提醒）
	membershipGiftService.SetGracePeriodEndingGetter(func(graceDays, reminderDays int) ([]currency.GracePeriodEndingMember, error) {
		members, err := subscriptionService.GetMembersWithGracePeriodEnding(graceDays, reminderDays)
		if err != nil {
			return nil, err
		}
		result := make([]currency.GracePeriodEndingMember, len(members))
		for i, m := range members {
			result[i] = currency.GracePeriodEndingMember{
				UserID:       m.UserID,
				Gold:         m.Gold,
				ExpiredAt:    m.ExpiredAt,
				GraceEndDate: m.GraceEndDate,
			}
		}
		return result, nil
	})

	// 设置月底提醒非会员获取函数（用于发送月底清空提醒，排除宽限期用户）
	membershipGiftService.SetNonMembersForMonthEndGetter(func(graceDays int) ([]currency.NonMember, error) {
		members, err := subscriptionService.GetNonMembersForMonthEndReminder(graceDays)
		if err != nil {
			return nil, err
		}
		result := make([]currency.NonMember, len(members))
		for i, m := range members {
			result[i] = currency.NonMember{
				UserID:              m.UserID,
				Gold:                m.Gold,
				LastSubscriptionEnd: m.LastSubscriptionEnd,
			}
		}
		return result, nil
	})

	// 设置今天到期会员获取函数（用于发送会员到期当天提醒）
	membershipGiftService.SetExpiredTodayMembersGetter(func() ([]currency.ExpiredTodayMember, error) {
		members, err := subscriptionService.GetMembersExpiredToday()
		if err != nil {
			return nil, err
		}
		result := make([]currency.ExpiredTodayMember, len(members))
		for i, m := range members {
			result[i] = currency.ExpiredTodayMember{
				UserID:   m.UserID,
				PlanCode: m.PlanCode,
				EndDate:  m.EndDate,
			}
		}
		return result, nil
	})

	// 设置宽限期刚结束用户获取函数（用于宽限期结束后清空经费）
	membershipGiftService.SetGraceExpiredMembersGetter(func(graceDays int) ([]currency.GraceExpiredMember, error) {
		members, err := subscriptionService.GetMembersWithGraceExpiredYesterday(graceDays)
		if err != nil {
			return nil, err
		}
		result := make([]currency.GraceExpiredMember, len(members))
		for i, m := range members {
			result[i] = currency.GraceExpiredMember{
				UserID:       m.UserID,
				Gold:         m.Gold,
				GraceEndDate: m.GraceEndDate,
			}
		}
		return result, nil
	})

	// 设置消息服务（用于发送会员相关站内信通知）
	membershipGiftService.SetMessageService(messageHandler.GetAdapter())

	// 设置会员经费服务到管理员处理器（用于手动触发定时任务）
	currencyAdminHandler.SetMembershipGiftService(membershipGiftService)

	// 设置批量发放服务的消息发送器并注入到管理员处理器
	currencyBatchService.SetMessageSender(messageHandler.GetAdapter())
	currencyAdminHandler.SetBatchService(currencyBatchService)

	// 设置会员激活回调 - 当用户开通会员时自动发放奖励
	// 这是解耦支付方式和奖励发放的关键：无论通过何种支付方式开通会员，
	// 只要调用 UpgradeSubscription，就会自动触发奖励发放
	subscriptionService.SetActivationCallback(membershipGiftService.OnSubscriptionActivated)
	
	// Initialize Cron Scheduler (定时任务调度器)
	// 使用 robfig/cron 库实现稳定的定时任务调度
	cronScheduler := currency.NewCronScheduler(membershipGiftService)
	if err := cronScheduler.Start(); err != nil {
		log.Fatalf("Failed to start cron scheduler: %v", err)
	}
	defer cronScheduler.Stop()

	// Setup Gin router
	router := gin.Default()

	// Apply global middleware
	router.Use(middleware.CORSMiddleware())
	
	// Add telemetry middleware only if enabled
	if cfg.SigNoz.EnableTracing {
		// Add OpenTelemetry middleware for distributed tracing
		router.Use(middleware.OpenTelemetryGinMiddleware(cfg.SigNoz.ServiceName))
	}
	
	if cfg.SigNoz.EnableLogging {
		// Add comprehensive telemetry middleware for logging
		router.Use(middleware.TelemetryMiddleware())
	}

	// Add rate limiting middleware (100 requests per second per IP)
	// This prevents DoS attacks and ensures fair resource allocation
	router.Use(middleware.RateLimitMiddleware(100, 1*time.Second))

	// Add adaptive timeout middleware
	// Automatically adjusts timeout based on endpoint type
	router.Use(middleware.APITimeoutMiddleware())

	// API routes
	api := router.Group("/api/v1")
	{
		// WebSocket endpoint (认证通过 URL 参数)
		api.GET("/ws", wsHandler.HandleWebSocket)

		// Config routes (public)
		configHandler.RegisterRoutes(api)

		// Admin routes
		adminHandler.RegisterRoutes(api)

		// Admin protected routes
		adminProtected := api.Group("/admin")
		adminProtected.Use(middleware.AdminAuthMiddleware())
		{
			adminProtected.GET("/profile", adminHandler.GetProfile)
			adminProtected.PUT("/password", adminHandler.UpdatePassword)
		adminProtected.POST("/verify-password", adminHandler.VerifyPassword)
			// Dashboard statistics
			adminProtected.GET("/dashboard/statistics", dashboardHandler.GetDashboardStatistics)
			// Configuration management
			// System configuration
			adminProtected.PUT("/privacy-policy", configHandler.UpdatePrivacyPolicy)
			adminProtected.PUT("/terms-of-service", configHandler.UpdateTermsOfService)
			adminProtected.GET("/email-config", configHandler.GetEmailConfig)
			adminProtected.PUT("/email-config", configHandler.UpdateEmailConfig)
			adminProtected.POST("/email-config/test", configHandler.TestEmailConfig)
			adminProtected.GET("/sms-config", configHandler.GetSMSConfig)
			adminProtected.PUT("/sms-config", configHandler.UpdateSMSConfig)
			adminProtected.POST("/sms-config/test", configHandler.TestSMSConfig)
			adminProtected.PUT("/system-config", configHandler.UpdateSystemConfig)
			// GitHub OAuth configuration
			adminProtected.GET("/github-config", configHandler.GetGithubOAuthConfig)
			adminProtected.PUT("/github-config", configHandler.UpdateGithubOAuthConfig)
			// Code Snippets (SEO/广告) management
			adminProtected.GET("/code-snippets", configHandler.ListCodeSnippets)
			adminProtected.GET("/code-snippets/:id", configHandler.GetCodeSnippet)
			adminProtected.POST("/code-snippets", configHandler.CreateCodeSnippet)
			adminProtected.PUT("/code-snippets/:id", configHandler.UpdateCodeSnippet)
			adminProtected.DELETE("/code-snippets/:id", configHandler.DeleteCodeSnippet)
			// User management
			adminProtected.GET("/users/stats", userHandler.GetUserStatistics)
			adminProtected.GET("/users", userHandler.GetUserList)
			adminProtected.GET("/users/online", userHandler.GetOnlineUsers)
			adminProtected.GET("/users/:id", userHandler.GetUserDetail)
			adminProtected.DELETE("/users/:id", userHandler.DeleteUser)
			adminProtected.POST("/users/:id/grant-subscription", orderHandler.AdminGrantSubscription)
			// Statistics charts
			adminProtected.GET("/statistics/users", userHandler.GetUserStatisticsChart)
			adminProtected.GET("/statistics/online", userHandler.GetOnlineUserChart)
			// Third-party account management
			adminProtected.GET("/third-party-accounts", thirdPartyHandler.ListAccounts)
			adminProtected.POST("/third-party-accounts", thirdPartyHandler.CreateAccount)
			adminProtected.GET("/third-party-accounts/stats", thirdPartyHandler.GetStats)
			adminProtected.POST("/third-party-accounts/refresh-cache", thirdPartyHandler.RefreshCache)
			adminProtected.GET("/third-party-accounts/:id", thirdPartyHandler.GetAccount)
			adminProtected.PUT("/third-party-accounts/:id", thirdPartyHandler.UpdateAccount)
			adminProtected.DELETE("/third-party-accounts/:id", thirdPartyHandler.DeleteAccount)
			adminProtected.POST("/third-party-accounts/:id/test", thirdPartyHandler.TestAccount)
			// Prompt template management
			adminProtected.GET("/prompt-templates", aiHandler.ListPromptTemplates)
			adminProtected.POST("/prompt-templates", aiHandler.CreatePromptTemplate)
			adminProtected.GET("/prompt-templates/:id", aiHandler.GetPromptTemplate)
			adminProtected.PUT("/prompt-templates/:id", aiHandler.UpdatePromptTemplate)
			adminProtected.DELETE("/prompt-templates/:id", aiHandler.DeletePromptTemplate)
			// Analysis dimensions management (Admin only)
			adminProtected.GET("/analysis/dimensions", aiHandler.AdminGetSystemDimensions)
			adminProtected.PUT("/analysis/dimensions/:id", aiHandler.AdminUpdateSystemDimension)
			// Subscription plan management
			adminProtected.PUT("/subscription-plans/:id", subscriptionHandler.UpdatePlan)

			// Order management (Admin only)
			adminProtected.GET("/orders/statistics", orderHandler.GetOrderStatistics)
			adminProtected.GET("/orders", orderHandler.AdminListOrders)

			// Alipay payment configuration (Admin only)
			adminProtected.GET("/payment/alipay/config", alipayHandler.GetActiveConfig)
			adminProtected.GET("/payment/alipay/configs", alipayHandler.ListConfigs)
			adminProtected.POST("/payment/alipay/config", alipayHandler.CreateConfig)
			adminProtected.PUT("/payment/alipay/config/:id", alipayHandler.UpdateConfig)
			adminProtected.DELETE("/payment/alipay/config/:id", alipayHandler.DeleteConfig)
			adminProtected.POST("/payment/alipay/config/:id/activate", alipayHandler.SetActiveConfig)

			// WeChat Pay configuration (Admin only)
			adminProtected.GET("/payment/wechat/config", wechatPayHandler.GetActiveConfig)
			adminProtected.GET("/payment/wechat/configs", wechatPayHandler.GetAllConfigs)
			adminProtected.POST("/payment/wechat/config", wechatPayHandler.CreateConfig)
			adminProtected.PUT("/payment/wechat/config/:id", wechatPayHandler.UpdateConfig)
			adminProtected.DELETE("/payment/wechat/config/:id", wechatPayHandler.DeleteConfig)
			adminProtected.POST("/payment/wechat/config/:id/activate", wechatPayHandler.ActivateConfig)

			// WeChat OAuth configuration (Admin only)
			adminProtected.GET("/wechat/config", wechatHandler.GetActiveConfig)
			adminProtected.GET("/wechat/configs", wechatHandler.ListConfigs)
			adminProtected.POST("/wechat/config", wechatHandler.CreateConfig)
			adminProtected.PUT("/wechat/config/:id", wechatHandler.UpdateConfig)
			adminProtected.DELETE("/wechat/config/:id", wechatHandler.DeleteConfig)
			adminProtected.POST("/wechat/config/:id/activate", wechatHandler.SetActiveConfig)

			// WeChat Official Account configuration (Admin only)
			adminProtected.GET("/wechat-official/config", wechatOfficialHandler.GetConfig)
			adminProtected.PUT("/wechat-official/config", wechatOfficialHandler.UpdateConfig)

			// Coupon management (Admin only)
			adminProtected.POST("/coupon-templates", couponHandler.CreateTemplate)
			adminProtected.GET("/coupon-templates", couponHandler.ListTemplates)
			adminProtected.GET("/coupon-templates/:id", couponHandler.GetTemplate)
			adminProtected.PUT("/coupon-templates/:id", couponHandler.UpdateTemplate)
			adminProtected.DELETE("/coupon-templates/:id", couponHandler.DeleteTemplate)
			adminProtected.POST("/coupon-templates/:id/activate", couponHandler.ActivateTemplate)
			adminProtected.POST("/coupon-templates/:id/pause", couponHandler.PauseTemplate)

			// Coupon distribution (Admin only)
			adminProtected.POST("/coupons/distribute", couponHandler.DistributeCoupons)
			adminProtected.GET("/coupons/distributed", couponHandler.AdminListAllDistributedCoupons)
			adminProtected.GET("/coupons/statistics", couponHandler.GetStatistics)

			// Batch distribution (Admin only)
			adminProtected.POST("/coupon-batches", couponHandler.CreateBatch)
			adminProtected.GET("/coupon-batches", couponHandler.ListBatches)
			adminProtected.GET("/coupon-batches/:id", couponHandler.GetBatch)
			adminProtected.POST("/coupon-batches/:id/execute", couponHandler.ExecuteBatch)
			adminProtected.POST("/coupon-batches/:id/cancel", couponHandler.CancelBatch)

			// Feedback management (Admin only)
			adminProtected.GET("/feedbacks", feedbackHandler.ListFeedbacks)
			adminProtected.GET("/feedbacks/stats", feedbackHandler.GetStats)
			adminProtected.GET("/feedbacks/:id", feedbackHandler.GetFeedback)
			adminProtected.PUT("/feedbacks/:id/status", feedbackHandler.UpdateStatus)
			adminProtected.POST("/feedbacks/:id/reply", feedbackHandler.ReplyFeedback)
			adminProtected.DELETE("/feedbacks/:id", feedbackHandler.DeleteFeedback)

			// Currency management (Admin only) - 货币系统管理
			adminProtected.POST("/currency/recharge", currencyAdminHandler.AdminRecharge)
			adminProtected.POST("/currency/deduct", currencyAdminHandler.AdminDeduct)
			adminProtected.GET("/currency/wallet/:user_id", currencyAdminHandler.GetUserWallet)
			adminProtected.GET("/currency/deduct-configs", currencyAdminHandler.ListDeductConfigs)
			adminProtected.POST("/currency/deduct-configs", currencyAdminHandler.SaveDeductConfig)
			// 货币配置管理
			adminProtected.GET("/currency/configs", currencyAdminHandler.ListCurrencyConfigs)
			adminProtected.GET("/currency/configs/:key", currencyAdminHandler.GetCurrencyConfig)
			adminProtected.PUT("/currency/configs/:key", currencyAdminHandler.UpdateCurrencyConfig)
			// 定时任务手动触发（用于测试）
			adminProtected.POST("/currency/trigger-daily-reminders", currencyAdminHandler.TriggerDailyReminders)
			adminProtected.POST("/currency/trigger-monthly-tasks", currencyAdminHandler.TriggerMonthlyTasks)
			// 批量发放管理
			adminProtected.POST("/currency/batch-distribute", currencyAdminHandler.BatchDistribute)
			adminProtected.POST("/currency/batch-distribute/preview", currencyAdminHandler.GetTargetUserCount)
			adminProtected.GET("/currency/batches", currencyAdminHandler.ListBatches)
			adminProtected.GET("/currency/batches/:id", currencyAdminHandler.GetBatch)
			adminProtected.POST("/currency/batches/:id/cancel", currencyAdminHandler.CancelBatch)
			adminProtected.GET("/currency/batches/:id/distributions", currencyAdminHandler.GetBatchDistributions)

			// Fund management (Admin only) - 会员基金管理
			adminProtected.GET("/funds", fundAdminHandler.ListFunds)
			adminProtected.GET("/funds/stats", fundAdminHandler.GetStats)
			adminProtected.GET("/funds/:id", fundAdminHandler.GetFund)
			adminProtected.POST("/funds", fundAdminHandler.CreateFund)
			adminProtected.PUT("/funds/:id", fundAdminHandler.UpdateFund)
			adminProtected.DELETE("/funds/:id", fundAdminHandler.DeleteFund)

			// Usage logs admin routes (功能使用统计)
			adminProtected.GET("/usage-logs", usageLogAdminHandler.List)
			adminProtected.GET("/usage-logs/summary", usageLogAdminHandler.GetStatsSummary)
			adminProtected.GET("/usage-logs/filter-options", usageLogAdminHandler.GetFilterOptions)
			adminProtected.GET("/usage-logs/features", usageLogAdminHandler.GetFeatureConfigs)
			adminProtected.GET("/usage-logs/config", usageLogAdminHandler.GetConfig)
			adminProtected.PUT("/usage-logs/config", usageLogAdminHandler.UpdateConfig)
			adminProtected.POST("/usage-logs/cleanup", usageLogAdminHandler.TriggerCleanup)
			adminProtected.DELETE("/usage-logs/all", usageLogAdminHandler.ClearAllLogs)

			// Message management (站内信管理)
			adminProtected.POST("/messages", messageHandler.AdminCreateMessage)
			adminProtected.GET("/messages", messageHandler.AdminGetMessages)
			adminProtected.GET("/messages/stats", messageHandler.AdminGetMessageStats)
			adminProtected.GET("/messages/:id", messageHandler.AdminGetMessage)
			adminProtected.POST("/messages/:id/send", messageHandler.AdminSendMessage)
			// Message template management
			adminProtected.POST("/message-templates", messageHandler.AdminCreateTemplate)
			adminProtected.GET("/message-templates", messageHandler.AdminGetTemplates)
			adminProtected.GET("/message-templates/:id", messageHandler.AdminGetTemplate)
			adminProtected.PUT("/message-templates/:id", messageHandler.AdminUpdateTemplate)
			adminProtected.DELETE("/message-templates/:id", messageHandler.AdminDeleteTemplate)

			// PDF cache management
			adminProtected.GET("/pdf/cache/stats", pdfHandler.GetCacheStats)
		}

		// Payment callback routes (public, no auth required)
		api.POST("/payment/alipay/notify", alipayHandler.HandleCallback)
		api.POST("/payment/wechat/notify", wechatPayHandler.HandleNotify)

		// PDF download route (public, no auth required for preview)
		api.POST("/pdf", pdfHandler.GetPDF)

		// WeChat Official Account webhook (public, no auth required)
		wechatOfficialWebhook := api.Group("/wechat-official")
		{
			wechatOfficialWebhook.GET("/webhook", wechatOfficialHandler.HandleVerification)
			wechatOfficialWebhook.POST("/webhook", wechatOfficialHandler.HandleMessage)
		}

		// User routes
		userHandler.RegisterRoutes(api)

		// Public subscription routes (no auth required)
		subscriptionPublic := api.Group("/user/subscription")
		{
			subscriptionPublic.GET("/plans", subscriptionHandler.GetPlans)
			subscriptionPublic.GET("/plans/:code", subscriptionHandler.GetPlanByCode)
		}

		// Public WeChat routes (no auth required)
		wechatPublic := api.Group("/user/wechat")
		{
			wechatPublic.GET("/login-url", wechatHandler.GetLoginURL)
			wechatPublic.GET("/qrcode-config", wechatHandler.GetQRCodeConfig)
			wechatPublic.POST("/callback", userHandler.WeChatCallback)
		}

		// Public GitHub OAuth routes (no auth required)
		githubPublic := api.Group("/user/github")
		{
			githubPublic.GET("/login-url", userHandler.GetGithubLoginURL)
			githubPublic.GET("/callback", userHandler.GithubCallback)
		}

		// User protected routes
		userProtected := api.Group("/user")
		userProtected.Use(middleware.UserAuthMiddleware())
		{
			userProtected.GET("/profile", userHandler.GetProfile)
			userProtected.PUT("/profile", userHandler.UpdateProfile)
			userProtected.POST("/logout", userHandler.Logout)
			userProtected.POST("/change-password", userHandler.ChangePassword)
			// NOTE: /heartbeat 接口已移除，由 WebSocket 连接替代

			// Wallet routes (钱包)
			userProtected.GET("/wallet", currencyHandler.GetWallet)
			userProtected.GET("/wallet/check", currencyHandler.CheckBalance)
			userProtected.GET("/wallet/check-by-biz", currencyHandler.CheckBalanceByBizType)
			userProtected.GET("/wallet/transactions", currencyHandler.ListTransactions)
			userProtected.GET("/wallet/transactions/:transaction_no", currencyHandler.GetTransaction)
			userProtected.GET("/wallet/recharge-info", currencyHandler.GetRechargeInfo)
			userProtected.GET("/wallet/exchange-info", currencyHandler.GetExchangeInfo)
			userProtected.GET("/wallet/exchange/preview", currencyHandler.PreviewExchange)
			userProtected.POST("/wallet/exchange", currencyHandler.ExchangeDiamondToGold)
			userProtected.GET("/wallet/biz-display-infos", currencyHandler.GetBizDisplayInfos)

			// Fund routes (会员基金)
			userProtected.GET("/funds/distributions", fundHandler.GetMyDistributions)

			// Account availability check routes (protected)
			userProtected.POST("/check-email-availability", userHandler.CheckEmailAvailability)
			userProtected.POST("/check-phone-availability", userHandler.CheckPhoneAvailability)

			// Account binding routes (protected)
			userProtected.POST("/bind-phone", userHandler.BindPhone)
			userProtected.POST("/bind-email", userHandler.BindEmail)
			userProtected.POST("/bind-wechat", userHandler.BindWeChatAccount)
			userProtected.POST("/bind-github", userHandler.BindGitHubAccount)
			userProtected.POST("/bind-email-with-password", userHandler.BindEmailWithPassword)
			userProtected.POST("/bind-phone-with-password", userHandler.BindPhoneWithPassword)

			// Account unbinding routes (protected)
			userProtected.POST("/unbind-phone", userHandler.UnbindPhone)
			userProtected.POST("/unbind-email", userHandler.UnbindEmail)
			userProtected.POST("/unbind-wechat", userHandler.UnbindWeChat)
			userProtected.POST("/unbind-github", userHandler.UnbindGitHub)

			// Subscription routes (protected)
			userProtected.GET("/subscription/my", subscriptionHandler.GetMySubscription)
			userProtected.GET("/subscription/usage", subscriptionHandler.GetMyUsageQuota)
			userProtected.POST("/subscription/upgrade", subscriptionHandler.UpgradeSubscription)
			userProtected.POST("/subscription/renew", subscriptionHandler.RenewSubscription)
			userProtected.GET("/subscription/check-quota", subscriptionHandler.CheckQuota)

			// Order routes
			userProtected.POST("/orders/create", orderHandler.CreateOrder)
			userProtected.POST("/orders/recharge", orderHandler.CreateRechargeOrder) // 恩特币充值订单
			userProtected.GET("/orders/my", orderHandler.GetMyOrders)
			userProtected.GET("/orders/:order_no", orderHandler.GetOrderDetail)
			userProtected.POST("/orders/pay", orderHandler.ProcessPayment)
			userProtected.POST("/orders/cancel", orderHandler.CancelOrder)
			userProtected.GET("/orders/billing-history", orderHandler.GetBillingHistory)

			// Payment routes (Alipay)
			userProtected.POST("/payment/alipay/create", alipayHandler.CreatePayment)
			userProtected.POST("/payment/simulate", alipayHandler.SimulatePayment)

			// Payment routes (WeChat Pay)
			userProtected.POST("/payment/wechat/create", wechatPayHandler.CreatePayment)

			// Coupon routes (User)
			userProtected.GET("/coupons", couponHandler.GetMyCoupons)
			userProtected.GET("/coupons/available", couponHandler.GetAvailableCoupons)
			userProtected.POST("/coupons/claim", couponHandler.ClaimCoupon)
			userProtected.POST("/coupons/apply", couponHandler.ApplyCoupon)
			userProtected.GET("/coupons/calculate-discount", couponHandler.CalculateDiscount)

			// Invitation routes (User)
			userProtected.POST("/invitation/generate", couponHandler.GenerateInvitation)
			userProtected.GET("/invitation/my", couponHandler.GetMyInvitation)
			userProtected.GET("/invitation/statistics", couponHandler.GetInvitationStatistics)

			// Feedback routes (User) - 已登录用户提交反馈会关联用户信息
			userProtected.POST("/feedback", feedbackHandler.CreateFeedbackWithUser)

			// Task history routes (User) - 任务历史（智能分析+AI审稿）
			userProtected.GET("/task-history", userHandler.GetTaskHistory)

			// Check-in routes (User) - 用户签到功能
			checkinHandler.RegisterRoutes(userProtected)

			// Message routes (User) - 站内信
			userProtected.GET("/messages", messageHandler.GetMessages)
			userProtected.GET("/messages/unread-count", messageHandler.GetUnreadCount)
			userProtected.GET("/messages/:id", messageHandler.GetMessage)
			userProtected.PUT("/messages/:id/read", messageHandler.MarkAsRead)
			userProtected.PUT("/messages/read-all", messageHandler.MarkAllAsRead)
			userProtected.DELETE("/messages/:id", messageHandler.DeleteMessage)

			// Conversation routes (legacy)
			userProtected.GET("/conversations", conversationHandler.GetUserConversations)
			userProtected.POST("/conversations", conversationHandler.CreateConversation)
			userProtected.GET("/conversations/:id", conversationHandler.GetConversation)
			userProtected.DELETE("/conversations/:id", conversationHandler.DeleteConversation)
			userProtected.POST("/conversations/:id/messages", conversationHandler.AddMessage)
			userProtected.PUT("/conversations/:id/title", conversationHandler.UpdateConversationTitle)
			userProtected.GET("/conversations/:id/messages/:messageId/advanced-search", conversationHandler.StreamAdvancedSearch)
			userProtected.GET("/conversations/:id/messages/:messageId/follow-up-questions", conversationHandler.GetFollowUpQuestions)
			userProtected.POST("/conversations/:id/continue", conversationHandler.StreamContinueConversation)

			// Enhanced chat routes (LibreChat-style with message chains)
			userProtected.POST("/conversations/chat/new", chatHandler.CreateConversationAndChat)
			userProtected.POST("/conversations/:id/chat/stream", chatHandler.StreamChatMessage)
			userProtected.POST("/conversations/:id/chat", chatHandler.QuickChat)
			userProtected.GET("/conversations/:id/tree", chatHandler.GetMessageTree)
			userProtected.GET("/conversations/:id/history", chatHandler.GetConversationHistory)
			userProtected.POST("/conversations/messages/:messageId/regenerate", chatHandler.RegenerateMessage)
			userProtected.POST("/conversations/messages/:messageId/edit", chatHandler.EditMessage)
			userProtected.GET("/conversations/messages/:messageId/siblings", chatHandler.GetSiblingMessages)
			userProtected.GET("/conversations/messages/:messageId/branch", chatHandler.GetBranchChain)

			// Peer Review routes (AI审稿人) - 新版任务管理API
			peerReviewGroup := userProtected.Group("/peer-review")
			{
				// 草稿管理（每个用户一个草稿）
				peerReviewGroup.GET("/draft", peerReviewHandler.GetDraft)       // 获取草稿
				peerReviewGroup.PUT("/draft", peerReviewHandler.SaveDraft)      // 保存草稿
				peerReviewGroup.DELETE("/draft", peerReviewHandler.ClearDraft)  // 清空草稿（删除主稿件和附件）
				peerReviewGroup.POST("/draft/submit", peerReviewHandler.SubmitDraft) // 提交草稿开始审稿
				
				// 任务管理
				peerReviewGroup.POST("/tasks", peerReviewHandler.CreateTask)
				peerReviewGroup.GET("/tasks", peerReviewHandler.GetTaskList)
				peerReviewGroup.GET("/tasks/:id", peerReviewHandler.GetTaskDetail)
				peerReviewGroup.GET("/tasks/:id/progress", peerReviewHandler.GetTaskProgress)
				peerReviewGroup.GET("/tasks/:id/steps", peerReviewHandler.GetTaskSteps)
				peerReviewGroup.GET("/tasks/:id/watch", peerReviewHandler.WatchTaskProgress)
				peerReviewGroup.DELETE("/tasks/:id", peerReviewHandler.DeleteTask)
				peerReviewGroup.POST("/tasks/:id/start", peerReviewHandler.StartTask) // 启动草稿任务
				
				// 文件上传（解析文件并保存到草稿）
				peerReviewGroup.POST("/upload", peerReviewHandler.UploadFile)

				// 附件管理（最多5个附件）
				peerReviewGroup.POST("/attachments", peerReviewHandler.UploadAttachment)
				peerReviewGroup.DELETE("/attachments/:id", peerReviewHandler.DeleteAttachment)

				// 主稿件管理
				peerReviewGroup.DELETE("/manuscript", peerReviewHandler.DeleteManuscript) // 删除主稿件

				// 文件下载
				peerReviewGroup.GET("/files/:id/download", peerReviewHandler.DownloadFile)
			}

			// LaTeX Writer routes (AI论文编辑器)
			latexWriterGroup := userProtected.Group("/latex-writer")
			{
				// AI 对话
				latexWriterGroup.POST("/chat/stream", latexWriterHandler.StreamChat)
				// AI 任务执行
				latexWriterGroup.POST("/task/stream", latexWriterHandler.ExecuteTask)
				latexWriterGroup.POST("/section/stream", latexWriterHandler.ExecuteSection)
				// 获取可用任务和章节列表
				latexWriterGroup.GET("/tasks", latexWriterHandler.GetAvailableTasks)
				latexWriterGroup.GET("/sections", latexWriterHandler.GetAvailableSections)
				// 文档管理
				latexWriterGroup.GET("/files", latexWriterHandler.GetDocuments)
				latexWriterGroup.POST("/files", latexWriterHandler.CreateDocument)
				latexWriterGroup.GET("/files/:id", latexWriterHandler.GetDocument)
				latexWriterGroup.PUT("/files/:id", latexWriterHandler.UpdateDocument)
				latexWriterGroup.DELETE("/files/:id", latexWriterHandler.DeleteDocument)
			}
		}

		// Public API routes (no authentication required)
		publicAPI := api.Group("/public")
		{
			// Public fund routes (会员基金 - 公开访问)
			publicAPI.GET("/funds", fundHandler.ListFunds)
			publicAPI.GET("/funds/current", fundHandler.GetCurrentFund)
			publicAPI.GET("/funds/:id", fundHandler.GetFundDetail)

			// Public paper detail endpoint - for anonymous access from paper detail page
			publicAPI.GET("/papers/:paperId", scholarHandler.GetPaper)
			// Public search endpoint - for anonymous access from home page
			publicAPI.POST("/papers/search", scholarHandler.SearchPapers)
			// Public paper batch endpoint - for anonymous access to get multiple papers
			publicAPI.POST("/papers/batch", scholarHandler.GetPaperBatch)
			// Public paper autocomplete endpoint - for search suggestions dropdown
			publicAPI.GET("/papers/autocomplete", scholarHandler.PaperAutocomplete)
			// Public search suggestions endpoint - combined paper + author suggestions
			publicAPI.GET("/search/suggestions", scholarHandler.GetSearchSuggestions)
			// Public analysis dimensions endpoint - get system default dimensions (for display only)
			publicAPI.GET("/analysis/dimensions", aiHandler.GetSystemDimensions)
			// Public recommendations endpoint - for anonymous access to similar papers
			publicAPI.GET("/recommendations/papers/:paperId", scholarHandler.GetRecommendationsForPaper)

		// Public author endpoints - for anonymous access from author detail page
		// 路径已重命名为 author-detail，避免旧版本前端循环请求
		publicAPI.GET("/author-detail/:authorId", scholarHandler.GetAuthor)
		publicAPI.GET("/author-detail/:authorId/papers", scholarHandler.GetAuthorPapers)

			// Public feedback endpoints
			publicAPI.POST("/feedback", feedbackHandler.CreateFeedback)
			publicAPI.POST("/feedback/upload", feedbackHandler.UploadAttachments)
			publicAPI.GET("/feedback/attachment/:id", feedbackHandler.GetAttachment)

			// Usage log endpoint - for tracking feature usage from frontend
			publicAPI.POST("/usage-log", usageLogHandler.Log)

			// Public translation endpoint - for translating abstract/TLDR to Chinese (streaming)
			publicAPI.POST("/translate/stream", aiHandler.StreamTranslate)

			// Public paper translation endpoint - for translating title/abstract/TLDR at once (streaming)
			publicAPI.POST("/translate/paper/stream", aiHandler.StreamTranslatePaper)
		}

		// Analysis dimensions routes (protected - requires user authentication)
		analysisGroup := api.Group("/analysis")
		analysisGroup.Use(middleware.UserAuthMiddleware())
		{
			// Analyze paper with user's custom dimensions (需扣费，同一篇论文+同一维度配置只扣一次)
			// handler 会设置 deduct_biz_id = paperId + "_" + dimensionHash
			analysisGroup.POST("/paper", currencyMiddleware.DeductAfterWithDynamicBizID("paper_analysis"), aiHandler.AnalyzePaper)
			// Batch analyze multiple papers (批量分析，扣费在handler中手动处理)
			// 支持1-10篇论文，每篇独立扣费去重
			analysisGroup.POST("/papers/batch", aiHandler.BatchAnalyzePapers)
			// Get user's dimensions (custom or system default)
			analysisGroup.GET("/dimensions", aiHandler.GetAnalysisDimensions)
			// Create custom dimension
			analysisGroup.POST("/dimensions", aiHandler.CreateUserDimension)
			// Update custom dimension
			analysisGroup.PUT("/dimensions/:id", aiHandler.UpdateUserDimension)
			// Delete custom dimension
			analysisGroup.DELETE("/dimensions/:id", aiHandler.DeleteUserDimension)
			// Reset single dimension to default
			analysisGroup.DELETE("/dimensions/reset/:dimensionKey", aiHandler.ResetUserDimension)
			// Reset all dimensions to default
			analysisGroup.DELETE("/dimensions/reset-all", aiHandler.ResetAllUserDimensions)
			// Copy system dimensions to user (deprecated, kept for compatibility)
			analysisGroup.POST("/dimensions/copy-from-system", aiHandler.CopySystemDimensionsToUser)
		}

		// Semantic Scholar API routes (protected - requires user authentication)
		scholar := api.Group("/scholar")
		scholar.Use(middleware.UserAuthMiddleware())
		{
			// Paper endpoints
			scholar.POST("/papers/search", scholarHandler.SearchPapers) // 学术检索（改为POST）
			scholar.GET("/papers/:paperId", scholarHandler.GetPaper)
			scholar.POST("/papers/batch", scholarHandler.GetPaperBatch)
			scholar.GET("/papers/:paperId/citations", scholarHandler.GetPaperCitations)
			scholar.GET("/papers/:paperId/references", scholarHandler.GetPaperReferences)
			scholar.GET("/papers/:paperId/authors", scholarHandler.GetPaperAuthors)

			// Author endpoints
			scholar.GET("/authors/search", scholarHandler.SearchAuthors)
			scholar.GET("/authors/:authorId", scholarHandler.GetAuthor)
			scholar.GET("/authors/:authorId/papers", scholarHandler.GetAuthorPapers)

			// Recommendations endpoints
			scholar.GET("/recommendations/papers/:paperId", scholarHandler.GetRecommendationsForPaper)
			scholar.POST("/recommendations/papers", scholarHandler.GetRecommendations)
		}

		// MCP endpoints (protected - requires user authentication)
		mcpGroup := api.Group("/mcp")
		mcpGroup.Use(middleware.UserAuthMiddleware())
		{
			mcpGroup.GET("/tools", mcpHandler.ListTools)
			mcpGroup.POST("/call", mcpHandler.CallTool)
		}

		// Proxy endpoints (protected - requires user authentication)
		proxyHandler.RegisterRoutes(api, middleware.UserAuthMiddleware())
	}

	// Serve uploaded files (feedback attachments)
	router.Static("/uploads", "./uploads")

	// Health check endpoint
	router.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"status": "ok",
			"service": "scholar-backend",
		})
	})

	// Dynamic sitemap endpoints (for SEO - includes popular paper pages)
	router.GET("/sitemap-papers.xml", configHandler.ServeDynamicSitemap)
	router.GET("/sitemap-index.xml", configHandler.ServeSitemapIndex)

	// SSR Code Snippet Injection - serve index.html with injected code snippets
	// This handles all non-API routes for the frontend SPA, enabling code snippets
	// to be visible in page source (for SEO and third-party verification)
	router.NoRoute(func(c *gin.Context) {
		path := c.Request.URL.Path

		// Skip API routes and static assets - let Nginx handle them
		if strings.HasPrefix(path, "/api/") ||
			strings.HasPrefix(path, "/uploads/") ||
			strings.HasPrefix(path, "/health") ||
			isStaticAsset(path) {
			c.Status(404)
			return
		}

		// Serve index.html with SSR code snippets for all other routes
		configHandler.ServeIndexHTML(c)
	})

	// Create context for graceful shutdown
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Start database connection pool monitoring
	database.StartConnectionPoolMonitoring(ctx, 5*time.Minute)

	// Start background tasks
	// Record online user snapshots every 5 minutes
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()

		log.Println("Online user snapshot task started")

		// Record initial snapshot
		if err := userService.RecordOnlineUserSnapshot(); err != nil {
			log.Printf("Failed to record initial online user snapshot: %v", err)
		}

		for {
			select {
			case <-ticker.C:
				if err := userService.RecordOnlineUserSnapshot(); err != nil {
					log.Printf("Failed to record online user snapshot: %v", err)
				}
			case <-ctx.Done():
				log.Println("Online user snapshot task stopped")
				return
			}
		}
	}()

	// Setup graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	// Start server in a goroutine
	addr := ":" + cfg.Server.Port
	log.Printf("Server starting on %s", addr)

	go func() {
		if err := router.Run(addr); err != nil {
			log.Fatalf("Failed to start server: %v", err)
		}
	}()

	// Wait for interrupt signal
	<-quit
	log.Println("Shutting down server...")

	// Cancel context to stop background tasks
	cancel()

	// Shutdown cache worker pool gracefully
	cache.ShutdownGlobalPool()

	// Close WebSocket hub
	if err := wsHub.Close(); err != nil {
		log.Printf("Error closing WebSocket hub: %v", err)
	}

	// Give background tasks time to cleanup
	time.Sleep(2 * time.Second)

	log.Println("Server stopped")
}

// feedbackUserRepoAdapter adapts user.Repository to feedback.UserRepository interface
type feedbackUserRepoAdapter struct {
	userRepo *user.Repository
}

func (a *feedbackUserRepoAdapter) FindByID(id uint) (*feedback.UserInfo, error) {
	u, err := a.userRepo.FindByID(id)
	if err != nil || u == nil {
		return nil, err
	}
	return &feedback.UserInfo{
		ID:        u.ID,
		Username:  u.Username,
		Email:     u.Email,
		Phone:     u.Phone,
		AvatarURL: u.AvatarURL,
	}, nil
}

func (a *feedbackUserRepoAdapter) FindByIDs(ids []uint) (map[uint]*feedback.UserInfo, error) {
	users, err := a.userRepo.FindByIDs(ids)
	if err != nil {
		return nil, err
	}
	result := make(map[uint]*feedback.UserInfo)
	for id, u := range users {
		result[id] = &feedback.UserInfo{
			ID:        u.ID,
			Username:  u.Username,
			Email:     u.Email,
			Phone:     u.Phone,
			AvatarURL: u.AvatarURL,
		}
	}
	return result, nil
}

// isStaticAsset checks if the path is a static asset (should be served by frontend container)
func isStaticAsset(path string) bool {
	staticExtensions := []string{
		".js", ".css", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico",
		".woff", ".woff2", ".ttf", ".eot", ".otf",
		".map", ".json", ".txt", ".xml", ".webp",
		".mp3", ".mp4", ".webm", ".ogg", ".wav",
		".pdf", ".zip", ".bcmap",
	}

	pathLower := strings.ToLower(path)
	for _, ext := range staticExtensions {
		if strings.HasSuffix(pathLower, ext) {
			return true
		}
	}

	// Also check for static directories
	if strings.HasPrefix(path, "/static/") ||
		strings.HasPrefix(path, "/assets/") ||
		strings.HasPrefix(path, "/fonts/") ||
		strings.HasPrefix(path, "/images/") ||
		strings.HasPrefix(path, "/favicon") ||
		strings.HasPrefix(path, "/manifest") ||
		strings.HasPrefix(path, "/robots") ||
		strings.HasPrefix(path, "/sitemap") {
		return true
	}

	return false
}

// usageLogServiceAdapter adapts usagelog.Service to config.UsageLogService interface
type usageLogServiceAdapter struct {
	service *usagelog.Service
}

func (a *usageLogServiceAdapter) GetPopularPaperIDs(days int, limit int) ([]config.PopularPaper, error) {
	papers, err := a.service.GetPopularPaperIDs(days, limit)
	if err != nil {
		return nil, err
	}
	result := make([]config.PopularPaper, len(papers))
	for i, p := range papers {
		result[i] = config.PopularPaper{
			PaperID: p.PaperID,
			Count:   p.Count,
		}
	}
	return result, nil
}
