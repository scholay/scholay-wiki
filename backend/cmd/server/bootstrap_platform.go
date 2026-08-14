// ============================================================================
// Scholay学术 V1.0
// Platform 域初始化：usagestat / hotcontent / seo / message / websocket
//
// 这里的模块之间耦合较弱，集中在一个文件是因为都是"平台基础设施"类：
// 日志、热门统计、SEO 索引、站内信、实时推送、文件代理 —— 对其它业务域的依赖基本只有 DB。
// ============================================================================

package main

import (
	"gorm.io/gorm"

	appconfig "scholar-backend/internal/common/config"
	"scholar-backend/internal/hotcontent"
	"scholar-backend/internal/llmusage"
	"scholar-backend/internal/message"
	"scholar-backend/internal/seo"
	"scholar-backend/internal/seosubmit"
	"scholar-backend/internal/usagestat"
	"scholar-backend/internal/vip"
	"scholar-backend/internal/websocket"
)

// platformBundle 聚合平台域构造产物。
type platformBundle struct {
	usageStat        *usagestat.Handler
	usageStatService *usagestat.Service

	// 统一 LLM token 账本 (项目侧 internal/ai + agent 侧)。注入给 ai.Service /
	// wechatofficial / smartsearch / claw / peerreview, 各自在 LLM 调用咽喉点 Record。
	llmUsageService *llmusage.Service
	llmUsageAdmin   *llmusage.AdminHandler // 后台 token 用量看板 (读侧聚合/明细/导出)

	// 会员(VIP):兑换码 + 按等级日限额。service 注入给 4 个 AI 功能做限额;handler 提供
	// 用户兑换/会员状态 + 管理端生码/列表。
	vipService *vip.Service
	vipHandler *vip.Handler

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
	// 功能使用统计 v2 (usage_events) —— 旧 usagelog(v1)已于 2026-07 整体下线,
	// 仅 usage_logs / usage_log_config 两张表作为 stranded 历史数据保留(无代码读写)。
	usageStatService := usagestat.NewService(usagestat.NewRepository(db))
	usageStatHandler := usagestat.NewHandler(usageStatService)

	// 统一 LLM token 账本 (llm_token_usage)。异步落库, best-effort。
	llmUsageService := llmusage.NewService(llmusage.NewRepository(db))
	llmUsageAdminHandler := llmusage.NewAdminHandler(llmUsageService)

	// 会员(VIP)。
	vipService := vip.NewService(vip.NewRepository(db))
	vipHandler := vip.NewHandler(vipService)

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
	wsHandler := websocket.NewHandler(wsHub)

	return &platformBundle{
		usageStat:         usageStatHandler,
		usageStatService:  usageStatService,
		llmUsageService:   llmUsageService,
		llmUsageAdmin:     llmUsageAdminHandler,
		vipService:        vipService,
		vipHandler:        vipHandler,
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
