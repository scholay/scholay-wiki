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
	"scholar-backend/internal/peerreview"
	"scholar-backend/internal/seosubmit"
	"scholar-backend/internal/storage"

	"github.com/gin-gonic/gin"
)

func main() {
	// Load configuration
	cfg := appconfig.Load()
	// Fail-fast：release 模式下默认密钥/密码等会立即终止启动，避免线上跑成 debug-grade 配置。
	if err := cfg.Validate(); err != nil {
		log.Fatalf("Configuration validation failed: %v", err)
	}

	// Initialize structured logging
	logger.Init()

	// Initialize Redis
	if err := cache.InitRedis(cfg.Redis.Host, cfg.Redis.Port, cfg.Redis.Password, cfg.Redis.DB); err != nil {
		log.Fatalf("Failed to initialize Redis: %v", err)
	}
	slog.Info("Redis initialized successfully")

	// Initialize cache worker pool (prevents goroutine accumulation from async cache writes)
	cache.InitWorkerPool(10, 100)

	// Initialize database
	if err := database.Initialize(cfg); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}

	// Initialize object storage (MinIO) —— 配置缺失时 IsEnabled()=false,
	// PDF 上传/下载相关接口将返回 503,其余功能不受影响
	if err := storage.Init(storage.Config{
		Endpoint:        cfg.MinIO.Endpoint,
		AccessKey:       cfg.MinIO.AccessKey,
		SecretKey:       cfg.MinIO.SecretKey,
		BucketPaperPDFs: cfg.MinIO.BucketPaperPDFs,
		UseSSL:          cfg.MinIO.UseSSL,
	}); err != nil {
		log.Fatalf("Failed to initialize object storage: %v", err)
	}

	// Bootstrap all application services and DI wiring
	svc := bootstrapServices(cfg)

	// Setup Gin router
	// 用 gin.New() 替代 gin.Default()：自定义 Recovery 增加 trace_id/结构化日志，
	// 同时保留 gin.Logger() 行为。
	router := gin.New()
	// RequestID 必须最早:Recovery / utils.Error 等的 slog 输出都会带上它,
	// 这样 docker logs 里搜一个 X-Request-Id 就能串起整条请求的所有日志。
	router.Use(middleware.RequestIDMiddleware())
	router.Use(gin.Logger())
	router.Use(middleware.RecoveryMiddleware())
	router.Use(middleware.CORSMiddleware())

	router.Use(middleware.BodyLimitMiddleware(middleware.DefaultMaxBodySize))
	// 第一道限流：全局 IP 限流（DoS 防护），参数从 RATE_LIMIT_IP_RPS 读取。
	// 第二道限流：见 TieredRateLimitMiddleware，在认证路由组内按 user_id 限流（待挂载）。
	router.Use(middleware.RateLimitMiddleware(cfg.RateLimit.IPRPS, 1*time.Second))
	router.Use(middleware.APITimeoutMiddleware())

	registerRoutes(router, svc.handlers, cfg)

	// IndexNow 协议要求站点根 /{key}.txt 200 OK,这条路由必须先于 NoRoute SPA 兜底注册
	seosubmit.RegisterKeyFileRoute(router, svc.seoSubmitService)

	bgCtx, cancel := context.WithCancel(context.Background())
	defer cancel()
	svc.peerReviewService.SetRootContext(bgCtx)
	startBackgroundTasks(bgCtx, svc.seoService)
	// 隐私审稿数据定期清理（每小时检查一次过期的隐私任务）
	startPrivateTaskCleanup(bgCtx, svc.peerReviewService)

	// 主动 SEO 提交 worker:写入即推 + 启动期一次性 seed
	svc.seoSubmitService.StartWorker(bgCtx)
	svc.seoSubmitService.BootstrapEnqueue(bgCtx, &seoSeedSourceAdapter{seoSvc: svc.seoService}, 5000)

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
