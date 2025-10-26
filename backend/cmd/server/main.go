package main

import (
	"log"
	"scholar-backend/internal/admin"
	"scholar-backend/internal/common/config"
	"scholar-backend/internal/common/database"
	"scholar-backend/internal/common/middleware"
	"scholar-backend/internal/user"

	"github.com/gin-gonic/gin"
)

func main() {
	// Load configuration
	cfg := config.Load()

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

	// Setup Gin router
	router := gin.Default()

	// Apply middleware
	router.Use(middleware.CORSMiddleware())

	// API routes
	api := router.Group("/api/v1")
	{
		// Admin routes
		adminHandler.RegisterRoutes(api)

		// Admin protected routes
		adminProtected := api.Group("/admin")
		adminProtected.Use(middleware.AdminAuthMiddleware())
		{
			adminProtected.GET("/profile", adminHandler.GetProfile)
			adminProtected.PUT("/password", adminHandler.UpdatePassword)
		}

		// User routes
		userHandler.RegisterRoutes(api)

		// User protected routes
		userProtected := api.Group("/user")
		userProtected.Use(middleware.UserAuthMiddleware())
		{
			userProtected.GET("/profile", userHandler.GetProfile)
			userProtected.PUT("/profile", userHandler.UpdateProfile)
		}
	}

	// Health check endpoint
	router.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"status": "ok",
			"service": "scholar-backend",
		})
	})

	// Start server
	addr := ":" + cfg.Server.Port
	log.Printf("Server starting on %s", addr)
	if err := router.Run(addr); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
