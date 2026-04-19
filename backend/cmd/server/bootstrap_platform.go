// ============================================================================
// Scholay学术 V1.0
// Platform 域初始化：usagelog / hotcontent / message / websocket / pdf / proxy
//
// 这里的模块之间耦合较弱，集中在一个文件是因为都是"平台基础设施"类：
// 日志、热门统计、站内信、实时推送、文件代理 —— 对其它业务域的依赖基本只有 DB。
// ============================================================================

package main

import (
	"log/slog"

	"gorm.io/gorm"

	appconfig "scholar-backend/internal/common/config"
	"scholar-backend/internal/hotcontent"
	"scholar-backend/internal/message"
	"scholar-backend/internal/pdf"
	"scholar-backend/internal/proxy"
	"scholar-backend/internal/usagelog"
	"scholar-backend/internal/websocket"
)

// platformBundle 聚合平台域构造产物。
type platformBundle struct {
	usageLog        *usagelog.Handler
	usageLogService *usagelog.Service
	usageLogAdmin   *usagelog.AdminHandler

	hotContent        *hotcontent.Handler
	hotContentService *hotcontent.Service

	message *message.Handler

	wsHub     *websocket.Hub
	wsHandler *websocket.Handler

	pdfHandler   *pdf.Handler
	proxyHandler *proxy.Handler
}

// initPlatform 构造平台层所有基础设施模块。
func initPlatform(db *gorm.DB, cfg *appconfig.Config) *platformBundle {
	usageLogRepo := usagelog.NewRepository(db)
	usageLogService := usagelog.NewService(usageLogRepo)
	usageLogHandler := usagelog.NewHandler(usageLogService)
	usageLogAdminHandler := usagelog.NewAdminHandler(usageLogService)

	hotContentRepo := hotcontent.NewRepository(db)
	hotContentService := hotcontent.NewService(hotContentRepo)
	hotContentHandler := hotcontent.NewHandler(hotContentService)

	messageHandler := message.NewHandler(db)

	wsHub := websocket.NewHub()
	wsHandler := websocket.NewHandler(wsHub, cfg.JWT.Secret)

	unpaywallEmail := cfg.ExternalServices.UnpaywallEmail
	if unpaywallEmail == "" {
		unpaywallEmail = "api@scholay.com"
	}
	pdfService := pdf.NewService(unpaywallEmail)
	pdfHandler := pdf.NewHandler(pdfService)
	slog.Info("PDF service initialized", "unpaywall_email", unpaywallEmail)

	proxyHandler := proxy.NewHandler()

	return &platformBundle{
		usageLog:          usageLogHandler,
		usageLogService:   usageLogService,
		usageLogAdmin:     usageLogAdminHandler,
		hotContent:        hotContentHandler,
		hotContentService: hotContentService,
		message:           messageHandler,
		wsHub:             wsHub,
		wsHandler:         wsHandler,
		pdfHandler:        pdfHandler,
		proxyHandler:      proxyHandler,
	}
}
