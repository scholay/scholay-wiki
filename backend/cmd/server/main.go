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

	// 可选 correctness 键专用 Redis(noeviction)。未配置则跳过,相关键回落主实例。
	if err := cache.InitRedisPersist(cfg.RedisPersist.Host, cfg.RedisPersist.Port, cfg.RedisPersist.Password, cfg.RedisPersist.DB); err != nil {
		log.Fatalf("Failed to initialize persist Redis: %v", err)
	}

	// Initialize database
	if err := database.Initialize(cfg); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}

	// Initialize object storage (MinIO) —— 配置缺失时 IsEnabled()=false,
	// PDF 上传/下载相关接口将返回 503,其余功能不受影响
	if err := storage.Init(storage.Config{
		Endpoint:                  cfg.MinIO.Endpoint,
		AccessKey:                 cfg.MinIO.AccessKey,
		SecretKey:                 cfg.MinIO.SecretKey,
		BucketPaperPDFs:           cfg.MinIO.BucketPaperPDFs,
		BucketFeedbackAttachments: cfg.MinIO.BucketFeedbackAttachments,
		BucketPeerReviewAssets:    cfg.MinIO.BucketPeerReviewAssets,
		BucketPrism:               cfg.MinIO.BucketPrism,
		BucketFeatureTools:        cfg.MinIO.BucketFeatureTools,
		BucketAgentArtifacts:      cfg.MinIO.BucketAgentArtifacts,
		BucketSkillBundles:        cfg.MinIO.BucketSkillBundles,
		UseSSL:                    cfg.MinIO.UseSSL,
	}); err != nil {
		log.Fatalf("Failed to initialize object storage: %v", err)
	}

	// Bootstrap all application services and DI wiring
	svc := bootstrapServices(cfg)

	// Setup Gin router
	// gin 全局模式跟随 GIN_MODE —— 不设的话 gin 默认 debug, 既打印调试噪声也让一些
	// "release 才生效"的安全分支(默认密钥 fail-fast / 支付金额校验 / JSON 日志)失活。
	gin.SetMode(cfg.App.GinMode)
	// 测试支付开关的生效状态在启动时打一条,让「开关开着但被 release 硬闸压掉」可见:
	// vip.testPaymentEnabled 在 release 模式下无视 PAYMENT_TEST_ENABLED(生产资损硬闸)。
	if cfg.App.TestPaymentEnabled {
		if cfg.App.IsRelease {
			slog.Warn("PAYMENT_TEST_ENABLED=true 但 GIN_MODE=release,测试支付已被生产硬闸关闭;本地要用请设 GIN_MODE=debug")
		} else {
			slog.Warn("测试支付已开启(PAYMENT_TEST_ENABLED=true, GIN_MODE=debug)——任何登录用户可免网关履约订单,勿用于生产")
		}
	}
	// 用 gin.New() 替代 gin.Default()：自定义 Recovery 增加 trace_id/结构化日志，
	// 同时保留 gin.Logger() 行为。
	router := gin.New()
	// 反代信任边界:不设的话 gin 默认信任所有代理,c.ClientIP() 会直接回显客户端
	// 伪造的 X-Forwarded-For 最左值,使所有按 IP 的限流/风控形同虚设(改一个 header
	// 就换一个令牌桶)。这里只信任 nginx 所在的私网段,让 ClientIP() 取到 nginx 追加
	// 的真实客户端 IP。配置见 cfg.App.TrustedProxies(TRUSTED_PROXIES 可覆盖)。
	if err := router.SetTrustedProxies(cfg.App.TrustedProxies); err != nil {
		slog.Error("failed to set trusted proxies, falling back to trust-none", "err", err)
		_ = router.SetTrustedProxies(nil)
	}
	// RequestID 必须最早:Recovery / utils.Error 等的 slog 输出都会带上它,
	// 这样 docker logs 里搜一个 X-Request-Id 就能串起整条请求的所有日志。
	router.Use(middleware.RequestIDMiddleware())
	// 访问日志跳过 /health —— docker healthcheck 每 10s 探一次, 否则 access log 被它刷屏,
	// 既稀释信号又加速 json-file 轮转(性能审计 be-http)。其余路径照常记录。
	router.Use(gin.LoggerWithConfig(gin.LoggerConfig{SkipPaths: []string{"/health"}}))
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
	startBackgroundTasks(bgCtx, svc.seoService)

	// (已移除)跨实例「多窗口接管」订阅 —— 抢占模型已被「多端实时同步扇出 Hub」取代
	// (见 internal/agentbridge/hub.go);同一 session 的多个浏览器现在共享一条上游 agent WS,不再互踢。

	// 客服邮箱 IMAP 收件轮询(配置未启用时空转;间隔随后台配置即时生效)
	safego.Go("supportcenter-imap-poll", func() {
		svc.supportCenterService.StartPoller(bgCtx.Done())
	})

	// 主动 SEO 提交 worker:写入即推 + 启动期一次性 seed
	svc.seoSubmitService.StartWorker(bgCtx)
	svc.seoSubmitService.BootstrapEnqueue(bgCtx, svc.seoService, 5000)

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
		// 三层超时对齐(性能审计 P0):nginx 900s ⊇ 本 WriteTimeout 16min ⊇ APITimeoutMiddleware ctx 15min。
		// 旧值 10min < ctx 15min,长 SSE 流被本层(最弱一环)在 10 分钟处掐断;抬到 16min 让 ctx 成为硬顶、
		// 本层只做 backbone backstop。(nginx user.conf 长流 location=900s;timeout.go SSE ctx=15min。)
		WriteTimeout:   16 * time.Minute,
		IdleTimeout:    120 * time.Second,
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

	if err := svc.wsHub.Close(); err != nil {
		slog.Error("Error closing WebSocket hub", "err", err)
	}

	// 计费水位同步落库(2026-08-02 审计 P1-13):每轮的落库是 best-effort 异步,发版时正在飞的
	// 那笔可能还没提交进程就没了 → 新进程回源到旧水位,上一轮被当成新增量再记一遍(重复扣额度)。
	// 必须在 ShutdownJournal 之前:两者都写 DB,水位是钱、journal 是历史,先保钱。
	svc.agentBridge.FlushAllTokenWatermarks()

	// M5:drain agent 事件日志写通道(把未落盘事件写完再退,防重启丢历史)。
	svc.agentBridge.ShutdownJournal(shutdownCtx)

	slog.Info("Server stopped")
}
