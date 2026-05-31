// ============================================================================
// Scholay学术 V1.0
// Platform 域初始化：usagelog / hotcontent / seo / message / websocket
//
// 这里的模块之间耦合较弱，集中在一个文件是因为都是"平台基础设施"类：
// 日志、热门统计、SEO 索引、站内信、实时推送、文件代理 —— 对其它业务域的依赖基本只有 DB。
// ============================================================================

package main

import (

	"gorm.io/gorm"

	appconfig "scholar-backend/internal/common/config"
	"scholar-backend/internal/hotcontent"
	"scholar-backend/internal/message"
	"scholar-backend/internal/seo"
	"scholar-backend/internal/seosubmit"
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

	seoHandler *seo.Handler
	seoService *seo.Service

	seoSubmitService *seosubmit.Service

	message *message.Handler

	wsHub     *websocket.Hub
	wsHandler *websocket.Handler
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

	seoRepo := seo.NewRepository(db)
	seoService := seo.NewService(seoRepo)
	seoHandler := seo.NewHandler(seoService)

	// 主动 SEO 提交(IndexNow + 百度)
	// siteOrigin 来自 SEO_BASE_URL,与 sitemap loc / canonical 同源,确保推送 URL host 与 IndexNow key 验证文件 host 一致
	seoSubmitService := seosubmit.NewService(cfg.SEOSubmit, appconfig.CanonicalBaseURL())

	messageHandler := message.NewHandler(db)

	wsHub := websocket.NewHub()
	wsHandler := websocket.NewHandler(wsHub, cfg.JWT.Secret)

	return &platformBundle{
		usageLog:          usageLogHandler,
		usageLogService:   usageLogService,
		usageLogAdmin:     usageLogAdminHandler,
		hotContent:        hotContentHandler,
		hotContentService: hotContentService,
		seoHandler:        seoHandler,
		seoService:        seoService,
		seoSubmitService:  seoSubmitService,
		message:           messageHandler,
		wsHub:             wsHub,
		wsHandler:         wsHandler,
	}
}
