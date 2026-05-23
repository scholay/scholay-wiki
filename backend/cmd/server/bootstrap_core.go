// ============================================================================
// Scholay学术 V1.0
// Core 域初始化：admin / feedback / user / config
//
// 原则同 bootstrap_domains.go：
//   - 只做构造 + 同域 side-effect（如 InitializeDefault*）
//   - 跨域 Set*()/inject 留在 bootstrapServices（避免这里知道其它域的存在）
// ============================================================================

package main

import (
	"log/slog"

	"gorm.io/gorm"

	"scholar-backend/internal/admin"
	appconfig "scholar-backend/internal/common/config"
	"scholar-backend/internal/config"
	"scholar-backend/internal/feedback"
	"scholar-backend/internal/user"
)

// coreBundle 聚合 core 域构造产物，供 orchestrator 进一步跨域注入。
type coreBundle struct {
	admin           *admin.Handler
	adminService    *admin.Service
	dashboard       *admin.DashboardHandler
	feedback        *feedback.Handler
	feedbackService *feedback.Service
	userRepo        *user.Repository
	userService     *user.Service
	userHandler     *user.Handler
	configService   *config.Service
	configHandler   *config.Handler
}

// initCore 构造 admin / feedback / user / config 四个核心域，
// 并执行同域默认值初始化（admin 默认账户、隐私政策、服务条款、系统配置）。
func initCore(db *gorm.DB, cfg *appconfig.Config) *coreBundle {
	adminRepo := admin.NewRepository(db)
	adminService := admin.NewService(adminRepo)
	adminHandler := admin.NewHandler(adminService)
	dashboardHandler := admin.NewDashboardHandler(db)

	if err := adminService.InitializeDefaultAdmin(cfg.Admin.InitialUsername, cfg.Admin.InitialPassword); err != nil {
		slog.Warn("Failed to initialize default admin", "err", err)
	} else {
		slog.Info("Default admin user initialized", "username", cfg.Admin.InitialUsername)
	}

	feedbackRepo := feedback.NewRepository(db)
	feedbackService := feedback.NewService(feedbackRepo)
	feedbackHandler := feedback.NewHandler(feedbackService)

	userRepo := user.NewRepository(db)
	userService := user.NewService(userRepo)
	userHandler := user.NewHandler(userService, db)

	configRepo := config.NewRepository(db)
	configService := config.NewService(configRepo)
	configHandler := config.NewHandler(configService)

	// 隐私政策 / 服务条款 已下线为代码常量(见 frontend-v2 legal-content.ts + 0046 迁移),不再 init
	if err := configService.InitializeDefaultSystemConfig(); err != nil {
		slog.Warn("Failed to initialize default system config", "err", err)
	} else {
		slog.Info("Default system config initialized")
	}

	return &coreBundle{
		admin:           adminHandler,
		adminService:    adminService,
		dashboard:       dashboardHandler,
		feedback:        feedbackHandler,
		feedbackService: feedbackService,
		userRepo:        userRepo,
		userService:     userService,
		userHandler:     userHandler,
		configService:   configService,
		configHandler:   configHandler,
	}
}
