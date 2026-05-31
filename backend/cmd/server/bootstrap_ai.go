// ============================================================================
// Scholay学术 V1.0
// AI 域初始化:thirdparty / ai / minicod
//
// 历史上这里还构造过 peerreview / peerreview2 / latexwriter / mcp 服务,
// 旧版本一并下线后 (migration 0049/0053/0054), AI 域瘦身到只剩这三块基础设施 +
// 多维分析/划词翻译这类极薄的衍生服务。新版 AI 功能(智能搜索/审稿/写作)都走
// scholar_agent + agentbridge 架构, 不再回到这个 aiBundle 里堆。
// ============================================================================

package main

import (
	"log/slog"
	"time"

	"gorm.io/gorm"

	"scholar-backend/internal/ai"
	appconfig "scholar-backend/internal/common/config"
	"scholar-backend/internal/minicod"
	"scholar-backend/internal/thirdparty"
)

// aiBundle 聚合 AI 域构造产物。
type aiBundle struct {
	thirdPartyService *thirdparty.Service
	thirdPartyHandler *thirdparty.Handler

	aiService *ai.Service
	aiHandler *ai.Handler

	minicodManager *minicod.Manager
	minicodHandler *minicod.Handler
}

// initAI 构造 AI 域所有模块,并启动 thirdparty 缓存刷新任务。
func initAI(db *gorm.DB, _ *appconfig.Config) *aiBundle {
	thirdPartyRepo := thirdparty.NewRepository(db)
	thirdPartyService := thirdparty.NewService(thirdPartyRepo)
	thirdPartyHandler := thirdparty.NewHandler(thirdPartyService)
	thirdPartyService.StartCacheRefreshTask(5 * time.Minute)
	slog.Info("Third-party account service initialized with cache refresh")

	aiService := ai.NewService(db, thirdPartyService)
	aiHandler := ai.NewHandler(aiService)

	minicodManager := minicod.NewManager(thirdPartyService)
	minicodHandler := minicod.NewHandler(minicodManager)

	return &aiBundle{
		thirdPartyService: thirdPartyService,
		thirdPartyHandler: thirdPartyHandler,
		aiService:         aiService,
		aiHandler:         aiHandler,
		minicodManager:    minicodManager,
		minicodHandler:    minicodHandler,
	}
}
