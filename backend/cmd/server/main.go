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
	"log/slog"
	"net/http"
	"os"
	"os/signal"
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
	"scholar-backend/internal/common/logger"
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

	// Initialize structured logging
	logger.Init()

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
			slog.Warn("Failed to initialize telemetry", "err", err)
		} else {
			slog.Info("Telemetry initialized", "endpoint", telemetryCfg.Endpoint)
			slog.Info("Telemetry service", "service", telemetryCfg.ServiceName)
			slog.Info("Telemetry environment", "environment", telemetryCfg.Environment)
			slog.Info("Telemetry tracing and logging", "tracing", telemetryCfg.EnableTracing, "logging", telemetryCfg.EnableLogging)
			slog.Info("Telemetry sampling rate", "percent", telemetryCfg.SamplingRate*100)
			
			defer func() {
				shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				defer cancel()
				if err := telemetryShutdown(shutdownCtx); err != nil {
					slog.Error("Error shutting down telemetry", "err", err)
				}
			}()
		}
	} else {
		slog.Info("Telemetry disabled by configuration")
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
	slog.Info("Redis initialized successfully")

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

	// Initialize AI service (需要在scholar handler之前初始化)
	aiService := ai.NewService(database.GetDB(), thirdPartyService)
	
	// Initialize Semantic Scholar module with key rotation
	scholarManager := semanticscholar.NewManager(thirdPartyService)
	scholarHandler := semanticscholar.NewHandler(scholarManager, aiService) // 传入aiService用于查询翻译
	
	// Initialize unified MCP handler with all tool providers
	mcpUnifiedHandler := mcp.NewUnifiedHandler(mcp.HandlerConfig{
		DB:             database.GetDB(),
		ScholarManager: scholarManager,
		SerperAPIKey:   cfg.ExternalServices.SerperAPIKey,
		CrossrefEmail:  cfg.ExternalServices.CrossrefEmail,
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

	// Initialize Subscription module
	subscriptionService := subscription.NewService(database.GetDB())
	subscriptionHandler := subscription.NewHandler(subscriptionService)

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

	// Initialize Order module
	orderService := order.NewService(database.GetDB(), subscriptionService)
	orderHandler := order.NewHandler(orderService)

	// Initialize Payment module
	alipayService := payment.NewAlipayService(database.GetDB())
	alipayHandler := payment.NewAlipayHandler(alipayService, orderService)
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
	// Inject query services into user handler (move DB queries out of handler)
	userHandler.SetSubscriptionQueryService(&subscriptionQueryAdapter{svc: subscriptionService})
	userHandler.SetConversationQueryService(&conversationQueryAdapter{svc: conversationService})
	userHandler.SetPeerReviewQueryService(&peerReviewQueryAdapter{svc: peerReviewService})

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

	if cfg.SigNoz.EnableTracing {
		router.Use(middleware.OpenTelemetryGinMiddleware(cfg.SigNoz.ServiceName))
	}
	if cfg.SigNoz.EnableLogging {
		router.Use(middleware.TelemetryMiddleware())
	}

	router.Use(middleware.RateLimitMiddleware(100, 1*time.Second))
	router.Use(middleware.APITimeoutMiddleware())

	// 注册所有路由（已拆分至 routes.go）
	registerRoutes(router, &allHandlers{
		admin:              adminHandler,
		dashboard:          dashboardHandler,
		user:               userHandler,
		config:             configHandler,
		scholar:            scholarHandler,
		ai:                 aiHandler,
		conversation:       conversationHandler,
		chat:               chatHandler,
		proxy:              proxyHandler,
		pdf:                pdfHandler,
		subscription:       subscriptionHandler,
		order:              orderHandler,
		alipay:             alipayHandler,
		wechatPay:          wechatPayHandler,
		wechat:             wechatHandler,
		wechatOfficial:     wechatOfficialHandler,
		checkin:            checkinHandler,
		currency:           currencyHandler,
		currencyAdmin:      currencyAdminHandler,
		currencyMiddleware: currencyMiddleware,
		fund:               fundHandler,
		fundAdmin:          fundAdminHandler,
		usageLog:           usageLogHandler,
		usageLogAdmin:      usageLogAdminHandler,
		hotContent:         hotContentHandler,
		message:            messageHandler,
		feedback:           feedbackHandler,
		coupon:             couponHandler,
		peerReview:         peerReviewHandler,
		latexWriter:        latexWriterHandler,
		latexAgentAdmin:    latexAgentAdminHandler,
		ws:                 wsHandler,
		thirdParty:         thirdPartyHandler,
		mcpUnified:         mcpUnifiedHandler,
		mcpLegacy:          mcpHandler,
	})

	// 启动后台任务（已拆分至 background.go）
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	startBackgroundTasks(ctx, userService)

	// Setup graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	// 使用 http.Server 以支持完整的优雅退出（连接排空）
	addr := ":" + cfg.Server.Port
	srv := &http.Server{
		Addr:    addr,
		Handler: router,
	}

	slog.Info("Server starting", "addr", addr)

	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Failed to start server: %v", err)
		}
	}()

	// 等待中断信号
	<-quit
	slog.Info("Shutting down server")

	// 创建带超时的 context 用于优雅关闭 HTTP 连接
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	// 优雅关闭 HTTP 服务器：停止接受新连接，等待进行中的请求完成
	if err := srv.Shutdown(shutdownCtx); err != nil {
		slog.Error("HTTP server shutdown error", "err", err)
	}

	// 取消后台任务 context
	cancel()

	// 优雅关闭缓存工作池
	cache.ShutdownGlobalPool()

	// 关闭 WebSocket hub
	if err := wsHub.Close(); err != nil {
		slog.Error("Error closing WebSocket hub", "err", err)
	}

	// 等待后台任务清理完成
	time.Sleep(2 * time.Second)

	slog.Info("Server stopped")
}

