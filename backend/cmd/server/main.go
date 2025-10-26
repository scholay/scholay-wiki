package main

import (
	"log"
	"time"
	"scholar-backend/internal/admin"
	appconfig "scholar-backend/internal/common/config"
	"scholar-backend/internal/common/database"
	"scholar-backend/internal/common/middleware"
	"scholar-backend/internal/config"
	"scholar-backend/internal/user"

	"github.com/gin-gonic/gin"
)

func main() {
	// Load configuration
	cfg := appconfig.Load()

	// Initialize database
	if err := database.Initialize(cfg); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}

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
		}

		// User routes
		userHandler.RegisterRoutes(api)

		// User protected routes
		userProtected := api.Group("/user")
		userProtected.Use(middleware.UserAuthMiddleware())
		{
			userProtected.GET("/profile", userHandler.GetProfile)
			userProtected.PUT("/profile", userHandler.UpdateProfile)
			userProtected.POST("/logout", userHandler.Logout)
			userProtected.POST("/heartbeat", userHandler.Heartbeat)
		}
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
