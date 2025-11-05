package main

import (
	"log"
	"time"
	"scholar-backend/internal/admin"
	"scholar-backend/internal/ai"
	"scholar-backend/internal/common/cache"
	"scholar-backend/internal/common/cleanup"
	appconfig "scholar-backend/internal/common/config"
	"scholar-backend/internal/common/database"
	"scholar-backend/internal/common/middleware"
	"scholar-backend/internal/config"
	"scholar-backend/internal/conversation"
	"scholar-backend/internal/mcp"
	"scholar-backend/internal/order"
	"scholar-backend/internal/proxy"
	"scholar-backend/internal/semanticscholar"
	"scholar-backend/internal/subscription"
	"scholar-backend/internal/thirdparty"
	"scholar-backend/internal/user"

	"github.com/gin-gonic/gin"
)

func main() {
	// Load configuration
	cfg := appconfig.Load()

	// Initialize Redis
	if err := cache.InitRedis(cfg.Redis.Host, cfg.Redis.Port, cfg.Redis.Password, cfg.Redis.DB); err != nil {
		log.Fatalf("Failed to initialize Redis: %v", err)
	}
	log.Println("✓ Redis initialized successfully")

	// Initialize database
	if err := database.Initialize(cfg); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}

	// Initialize cleanup service
	cleanupService := cleanup.NewCleanupService(database.GetDB())
	cleanupService.Start()

	// Initialize admin module
	adminRepo := admin.NewRepository(database.GetDB())
	adminService := admin.NewService(adminRepo)
	adminHandler := admin.NewHandler(adminService)

	// Initialize default admin user
	if err := adminService.InitializeDefaultAdmin(cfg.Admin.InitialUsername, cfg.Admin.InitialPassword); err != nil {
		log.Printf("Warning: Failed to initialize default admin: %v", err)
	} else {
		log.Printf("Default admin user initialized (username: %s)", cfg.Admin.InitialUsername)
	}

	// Initialize user module
	userRepo := user.NewRepository(database.GetDB())
	userService := user.NewService(userRepo)
	userHandler := user.NewHandler(userService)

	// Initialize config module
	configRepo := config.NewRepository(database.GetDB())
	configService := config.NewService(configRepo)
	configHandler := config.NewHandler(configService)

	// Initialize default privacy policy
	if err := configService.InitializeDefaultPrivacyPolicy(); err != nil {
		log.Printf("Warning: Failed to initialize default privacy policy: %v", err)
	} else {
		log.Printf("Default privacy policy initialized")
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

	// Initialize Semantic Scholar module with key rotation
	scholarManager := semanticscholar.NewManager(thirdPartyService)
	scholarHandler := semanticscholar.NewHandler(scholarManager)
	mcpHandler := mcp.NewHandler(scholarManager) // MCP uses manager for dynamic API key access

	// Initialize AI service
	aiService := ai.NewService(database.GetDB(), thirdPartyService)
	aiHandler := ai.NewHandler(aiService)

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
	orderHandler := order.NewHandler(database.GetDB())

	// Setup Gin router
	router := gin.Default()

	// Apply middleware
	router.Use(middleware.CORSMiddleware())

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
			// Configuration management
			adminProtected.PUT("/privacy-policy", configHandler.UpdatePrivacyPolicy)
			adminProtected.PUT("/email-config", configHandler.UpdateEmailConfig)
			adminProtected.PUT("/system-config", configHandler.UpdateSystemConfig)
			// User management
			adminProtected.GET("/users/stats", userHandler.GetUserStatistics)
			adminProtected.GET("/users", userHandler.GetUserList)
			adminProtected.GET("/users/online", userHandler.GetOnlineUsers)
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
			// Subscription plan management
			adminProtected.PUT("/subscription-plans/:id", subscriptionHandler.UpdatePlan)
		}

		// User routes
		userHandler.RegisterRoutes(api)

		// Public subscription routes (no auth required)
		subscriptionPublic := api.Group("/user/subscription")
		{
			subscriptionPublic.GET("/plans", subscriptionHandler.GetPlans)
		}

		// User protected routes
		userProtected := api.Group("/user")
		userProtected.Use(middleware.UserAuthMiddleware())
		{
			userProtected.GET("/profile", userHandler.GetProfile)
			userProtected.PUT("/profile", userHandler.UpdateProfile)
			userProtected.POST("/logout", userHandler.Logout)
			userProtected.POST("/heartbeat", userHandler.Heartbeat)

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

			// Conversation routes (legacy)
			userProtected.GET("/conversations", conversationHandler.GetUserConversations)
			userProtected.POST("/conversations", conversationHandler.CreateConversation)
			userProtected.GET("/conversations/:id", conversationHandler.GetConversation)
			userProtected.DELETE("/conversations/:id", conversationHandler.DeleteConversation)
			userProtected.POST("/conversations/:id/messages", conversationHandler.AddMessage)
			userProtected.PUT("/conversations/:id/title", conversationHandler.UpdateConversationTitle)
			userProtected.GET("/conversations/:id/messages/:messageId/analysis", conversationHandler.StreamAnalysis)
			userProtected.GET("/conversations/:id/messages/:messageId/advanced-search", conversationHandler.StreamAdvancedSearch)
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
		}

		// Semantic Scholar API routes (protected - requires user authentication)
		scholar := api.Group("/scholar")
		scholar.Use(middleware.UserAuthMiddleware())
		{
			// Paper endpoints
			scholar.GET("/papers/search", scholarHandler.SearchPapers)
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

	// Health check endpoint
	router.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"status": "ok",
			"service": "scholar-backend",
		})
	})

	// Start background tasks
	// Record online user snapshots every 5 minutes
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()

		// Record initial snapshot
		if err := userService.RecordOnlineUserSnapshot(); err != nil {
			log.Printf("Failed to record initial online user snapshot: %v", err)
		}

		for range ticker.C {
			if err := userService.RecordOnlineUserSnapshot(); err != nil {
				log.Printf("Failed to record online user snapshot: %v", err)
			}
		}
	}()

	// Start server
	addr := ":" + cfg.Server.Port
	log.Printf("Server starting on %s", addr)
	if err := router.Run(addr); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
