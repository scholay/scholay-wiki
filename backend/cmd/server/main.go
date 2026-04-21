// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================
//
// main.go 仅负责：配置加载、可观测性初始化、基础设施（Redis/DB）启动、
// HTTP Server 生命周期与优雅退出。
// 具体模块初始化与依赖注入见 bootstrap.go，路由注册见 routes.go，
// 后台任务见 background.go。

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

	"scholar-backend/internal/common/cache"
	appconfig "scholar-backend/internal/common/config"
	"scholar-backend/internal/common/database"
	"scholar-backend/internal/common/logger"
	"scholar-backend/internal/common/middleware"
	"scholar-backend/internal/common/safego"
	"scholar-backend/internal/common/telemetry"
	"scholar-backend/internal/peerreview"

	"github.com/gin-gonic/gin"
	"go.opentelemetry.io/otel/attribute"
)

func main() {
	// Load configuration
	cfg := appconfig.Load()
	// Fail-fast：release 模式下默认密钥/密码、SigNoz 启用但 endpoint 缺失等会立即终止启动，
	// 避免线上跑成 debug-grade 配置。
	if err := cfg.Validate(); err != nil {
		log.Fatalf("Configuration validation failed: %v", err)
	}

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

	var mainLogger *telemetry.Logger
	if cfg.SigNoz.EnableLogging {
		mainLogger = telemetry.NewLogger("main")
		mainLogger.Info(ctx, "Starting Scholar Backend Service",
			attribute.String("version", "1.0.0"),
			attribute.String("environment", cfg.SigNoz.Environment),
		)
	}

	// Initialize Redis
	if err := cache.InitRedis(cfg.Redis.Host, cfg.Redis.Port, cfg.Redis.Password, cfg.Redis.DB); err != nil {
		if mainLogger != nil {
			mainLogger.Fatal(ctx, "Failed to initialize Redis", err)
		}
		log.Fatalf("Failed to initialize Redis: %v", err)
	}
	if mainLogger != nil {
		mainLogger.Info(ctx, "Redis initialized successfully")
	}
	slog.Info("Redis initialized successfully")

	// Initialize cache worker pool (prevents goroutine accumulation from async cache writes)
	cache.InitWorkerPool(10, 100)

	// Initialize database
	if err := database.Initialize(cfg); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}

	// Bootstrap all application services and DI wiring
	svc := bootstrapServices(cfg)

	// Setup Gin router
	// 用 gin.New() 替代 gin.Default()：自定义 Recovery 增加 trace_id/结构化日志，
	// 同时保留 gin.Logger() 行为。
	router := gin.New()
	router.Use(gin.Logger())
	router.Use(middleware.RecoveryMiddleware())
	router.Use(middleware.CORSMiddleware())

	if cfg.SigNoz.EnableTracing {
		router.Use(middleware.OpenTelemetryGinMiddleware(cfg.SigNoz.ServiceName))
	}
	if cfg.SigNoz.EnableLogging {
		router.Use(middleware.TelemetryMiddleware())
	}

	router.Use(middleware.BodyLimitMiddleware(middleware.DefaultMaxBodySize))
	// 第一道限流：全局 IP 限流（DoS 防护），参数从 RATE_LIMIT_IP_RPS 读取。
	// 第二道限流：见 TieredRateLimitMiddleware，在认证路由组内按 user_id 限流（待挂载）。
	router.Use(middleware.RateLimitMiddleware(cfg.RateLimit.IPRPS, 1*time.Second))
	router.Use(middleware.APITimeoutMiddleware())

	registerRoutes(router, svc.handlers, cfg)

	bgCtx, cancel := context.WithCancel(context.Background())
	defer cancel()
	svc.peerReviewService.SetRootContext(bgCtx)
	startBackgroundTasks(bgCtx, svc.userService, svc.seoService)
	// 隐私审稿数据定期清理（每小时检查一次过期的隐私任务）
	startPrivateTaskCleanup(bgCtx, svc.peerReviewService)

	// Setup graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	addr := ":" + cfg.Server.Port
	srv := &http.Server{
		Addr:              addr,
		Handler:           router,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       60 * time.Second,
		// SSE/streaming endpoints rely on per-handler ctx timeouts (APITimeoutMiddleware)
		// so the server-level WriteTimeout is generous enough to cover the longest stream.
		WriteTimeout: 10 * time.Minute,
		IdleTimeout:  120 * time.Second,
		MaxHeaderBytes: 1 << 20, // 1MB
	}

	slog.Info("Server starting", "addr", addr)

	safego.Go("http-server-listen", func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Failed to start server: %v", err)
		}
	})

	<-quit
	slog.Info("Shutting down server")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		slog.Error("HTTP server shutdown error", "err", err)
	}

	cancel()

	svc.cleanupService.Stop()
	svc.thirdPartyService.Stop()

	cache.ShutdownGlobalPool()

	if err := svc.wsHub.Close(); err != nil {
		slog.Error("Error closing WebSocket hub", "err", err)
	}

	slog.Info("Server stopped")
}

// startPrivateTaskCleanup 启动隐私审稿任务清理 goroutine。
// ctx 关闭时停止 ticker，避免 server 退出后仍在后台跑。
func startPrivateTaskCleanup(ctx context.Context, peerReviewService *peerreview.Service) {
	safego.Go("private-task-cleanup", func() {
		ticker := time.NewTicker(1 * time.Hour)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				slog.Info("Private task cleanup stopped")
				return
			case <-ticker.C:
				if cleaned, err := peerReviewService.CleanupExpiredPrivateTasks(); err != nil {
					slog.Error("Failed to cleanup expired private tasks", "error", err)
				} else if cleaned > 0 {
					slog.Info("Cleaned up expired private review tasks", "count", cleaned)
				}
			}
		}
	})
}
