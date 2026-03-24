package main

import (
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"scholar-backend/internal/common/middleware"
)

func setupRouter(enableTracing, enableLogging bool, telemetryServiceName string) *gin.Engine {
	router := gin.Default()
	router.Use(middleware.CORSMiddleware())

	if enableTracing {
		router.Use(middleware.OpenTelemetryGinMiddleware(telemetryServiceName))
	}
	if enableLogging {
		router.Use(middleware.TelemetryMiddleware())
	}

	router.Use(middleware.RateLimitMiddleware(100, 1*time.Second))
	router.Use(middleware.APITimeoutMiddleware())
	return router
}

func registerOperationalRoutes(
	router *gin.Engine,
	serveDynamicSitemap gin.HandlerFunc,
	serveSitemapIndex gin.HandlerFunc,
	serveIndex gin.HandlerFunc,
) {
	router.Static("/uploads", "./uploads")

	router.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"status":  "ok",
			"service": "scholar-backend",
		})
	})

	router.GET("/sitemap-papers.xml", serveDynamicSitemap)
	router.GET("/sitemap-index.xml", serveSitemapIndex)
	configureNoRoute(router, serveIndex)
}

func configureNoRoute(router *gin.Engine, serveIndex func(*gin.Context)) {
	router.NoRoute(func(c *gin.Context) {
		path := c.Request.URL.Path

		// Skip API routes and static assets
		if strings.HasPrefix(path, "/api/") ||
			strings.HasPrefix(path, "/uploads/") ||
			strings.HasPrefix(path, "/health") ||
			isStaticAsset(path) {
			c.Status(404)
			return
		}

		serveIndex(c)
	})
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

