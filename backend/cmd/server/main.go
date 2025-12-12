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
	"syscall"
	"time"
	"scholar-backend/internal/admin"
	"scholar-backend/internal/ai"
	"scholar-backend/internal/checkin"
	"scholar-backend/internal/currency"
	"scholar-backend/internal/feedback"
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
	"scholar-backend/internal/peerreview"
	"scholar-backend/internal/proxy"
	"scholar-backend/internal/semanticscholar"
	"scholar-backend/internal/subscription"
	"scholar-backend/internal/thirdparty"
	"scholar-backend/internal/user"
	"scholar-backend/internal/wechat"
	"scholar-backend/internal/wechatofficial"

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

	// Start coupon scheduler for automated tasks
	couponScheduler := coupon.NewScheduler(couponService)
	couponScheduler.Start()

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

	// Initialize Subscription module
	subscriptionService := subscription.NewService(database.GetDB())
	subscriptionHandler := subscription.NewHandler(database.GetDB())

	// Initialize Conversation module
	conversationRepo := conversation.NewRepository(database.GetDB())
	conversationService := conversation.NewService(conversationRepo, scholarManager, aiService, subscriptionService)
	conversationHandler := conversation.NewHandler(conversationService)
	chatHandler := conversation.NewChatHandler(conversationRepo, aiService, conversationService, subscriptionService)

	// Initialize Proxy module
	proxyHandler := proxy.NewHandler()

	// Initialize Order module
	orderService := order.NewService(database.GetDB())
	orderHandler := order.NewHandlerWithService(orderService)

	// Initialize Payment module
	alipayHandler := payment.NewAlipayHandler(database.GetDB())
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
	// Inject currency service into user service (for register gift)
	userService.SetCurrencyService(currencyService)
	// Inject currency service into checkin service (for checkin gold reward)
	checkinService.SetCurrencyService(currencyService)
	// Inject currency service into coupon service (for invite diamond reward)
	couponService.SetCurrencyService(currencyService)
	// Inject currency service into chat handler (for AI chat deduction)
	chatHandler.SetCurrencyService(currencyService)
	// Inject currency service into conversation handler (for smart analysis deduction)
	conversationHandler.SetCurrencyService(currencyService)
	// Inject currency service into user handler (for user list wallet info)
	userHandler.SetCurrencyService(currencyService)

	// Initialize Membership Gift Scheduler (会员月度赠送/清空调度器)
	membershipGiftScheduler := currency.NewMembershipGiftScheduler(currencyService, func(planCodes []string) ([]currency.MemberSubscription, error) {
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
	// 设置过期会员获取函数（用于清空经费）
	membershipGiftScheduler.SetExpiredMemberGetter(func(graceDays int) ([]currency.ExpiredMember, error) {
		members, err := subscriptionService.GetExpiredMembersWithGracePeriod(graceDays)
		if err != nil {
			return nil, err
		}
		result := make([]currency.ExpiredMember, len(members))
		for i, m := range members {
			result[i] = currency.ExpiredMember{
				UserID:    m.UserID,
				PlanCode:  m.PlanCode,
				ExpiredAt: m.ExpiredAt,
			}
		}
		return result, nil
	})
	membershipGiftScheduler.Start()
	defer membershipGiftScheduler.Stop()

	// Inject membership gift service into order service (for activation gift)
	orderService.SetMembershipGiftService(membershipGiftScheduler)

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
		}

		// Payment callback routes (public, no auth required)
		api.POST("/payment/alipay/notify", alipayHandler.HandleCallback)
		api.POST("/payment/wechat/notify", wechatPayHandler.HandleNotify)

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
			userProtected.POST("/heartbeat", userHandler.Heartbeat)

			// Wallet routes (钱包)
			userProtected.GET("/wallet", currencyHandler.GetWallet)
			userProtected.GET("/wallet/check", currencyHandler.CheckBalance)
			userProtected.GET("/wallet/transactions", currencyHandler.ListTransactions)
			userProtected.GET("/wallet/transactions/:transaction_no", currencyHandler.GetTransaction)
			userProtected.GET("/wallet/recharge-info", currencyHandler.GetRechargeInfo)
			userProtected.GET("/wallet/exchange-info", currencyHandler.GetExchangeInfo)
			userProtected.GET("/wallet/exchange/preview", currencyHandler.PreviewExchange)
			userProtected.POST("/wallet/exchange", currencyHandler.ExchangeDiamondToGold)

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

			// Check-in routes (User) - 用户签到功能
			checkinHandler.RegisterRoutes(userProtected)

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
		}

		// Public API routes (no authentication required)
		publicAPI := api.Group("/public")
		{
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
			// Public paper analysis endpoint - AI-powered abstract analysis
			publicAPI.POST("/papers/analyze", aiHandler.AnalyzePaper)
			// Public analysis dimensions endpoint - get system default dimensions
			publicAPI.GET("/analysis/dimensions", aiHandler.GetSystemDimensions)
			// Public recommendations endpoint - for anonymous access to similar papers
			publicAPI.GET("/recommendations/papers/:paperId", scholarHandler.GetRecommendationsForPaper)

			// Public author endpoints - for anonymous access from author detail page
			publicAPI.GET("/authors/:authorId", scholarHandler.GetAuthor)
			publicAPI.GET("/authors/:authorId/papers", scholarHandler.GetAuthorPapers)

			// Public feedback endpoints
			publicAPI.POST("/feedback", feedbackHandler.CreateFeedback)
			publicAPI.POST("/feedback/upload", feedbackHandler.UploadAttachments)
			publicAPI.GET("/feedback/attachment/:id", feedbackHandler.GetAttachment)
		}

		// Analysis dimensions routes (protected - requires user authentication)
		analysisGroup := api.Group("/analysis")
		analysisGroup.Use(middleware.UserAuthMiddleware())
		{
			// Analyze paper with user's custom dimensions (需扣费)
			analysisGroup.POST("/paper", currencyMiddleware.Deduct("paper_analysis"), aiHandler.AnalyzePaper)
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
