// ============================================================================
// Scholay学术 V1.0
// AI 域初始化：thirdparty / ai / scholar / minicod / mcp /
// peerreview / latexwriter / conversation
//
// 这些模块有较强的内部依赖链：
//   thirdparty → ai / scholar
//   ai + scholar → minicod / conversation
//   ai + mcpServer → peerreview
//   ai → latexwriter
// 合并在一个域文件内，比跨文件互相调用更好读。
// ============================================================================

package main

import (
	"log/slog"
	"time"

	"gorm.io/gorm"

	"scholar-backend/internal/ai"
	appconfig "scholar-backend/internal/common/config"
	"scholar-backend/internal/conversation"
	"scholar-backend/internal/latexwriter"
	"scholar-backend/internal/mcp"
	"scholar-backend/internal/minicod"
	"scholar-backend/internal/peerreview"
	"scholar-backend/internal/semanticscholar"
	"scholar-backend/internal/thirdparty"
)

// aiBundle 聚合 AI 域构造产物。
type aiBundle struct {
	thirdPartyService *thirdparty.Service
	thirdPartyHandler *thirdparty.Handler

	aiService *ai.Service
	aiHandler *ai.Handler

	scholarManager *semanticscholar.Manager
	minicodHandler *minicod.Handler

	mcpUnified *mcp.UnifiedHandler
	mcpLegacy  *mcp.Handler

	peerReviewService *peerreview.Service
	peerReviewHandler *peerreview.Handler

	latexWriter     *latexwriter.Handler
	latexAgentAdmin *latexwriter.AdminHandler

	conversationService *conversation.Service
	conversationHandler *conversation.Handler
	chatHandler         *conversation.ChatHandler
}

// initAI 构造 AI 域所有模块，并启动 thirdparty 缓存刷新任务。
func initAI(db *gorm.DB, cfg *appconfig.Config) *aiBundle {
	thirdPartyRepo := thirdparty.NewRepository(db)
	thirdPartyService := thirdparty.NewService(thirdPartyRepo)
	thirdPartyHandler := thirdparty.NewHandler(thirdPartyService)
	thirdPartyService.StartCacheRefreshTask(5 * time.Minute)
	slog.Info("Third-party account service initialized with cache refresh")

	aiService := ai.NewService(db, thirdPartyService)
	aiHandler := ai.NewHandler(aiService)

	scholarManager := semanticscholar.NewManager(thirdPartyService)

	minicodManager := minicod.NewManager(thirdPartyService)
	minicodHandler := minicod.NewHandler(minicodManager, aiService)

	mcpUnifiedHandler := mcp.NewUnifiedHandler(mcp.HandlerConfig{
		DB:             db,
		ScholarManager: scholarManager,
		SerperAPIKey:   cfg.ExternalServices.SerperAPIKey,
		CrossrefEmail:  cfg.ExternalServices.CrossrefEmail,
	})
	mcpLegacyHandler := mcp.NewHandler(scholarManager)
	mcpServer := mcp.NewMCPServer(scholarManager)

	peerReviewService := peerreview.NewService(db, aiService, mcpServer, thirdPartyService)
	peerReviewHandler := peerreview.NewHandler(peerReviewService)

	latexWriterService := latexwriter.NewService(db, aiService)
	latexWriterHandler := latexwriter.NewHandler(latexWriterService)
	latexAgentConfigRepo := latexwriter.NewAgentConfigRepository(db)
	latexAgentAdminHandler := latexwriter.NewAdminHandler(latexAgentConfigRepo, db)

	conversationRepo := conversation.NewRepository(db)
	conversationService := conversation.NewService(conversationRepo, scholarManager, aiService)
	conversationHandler := conversation.NewHandler(conversationService)
	chatHandler := conversation.NewChatHandler(conversationRepo, aiService, conversationService)

	return &aiBundle{
		thirdPartyService:   thirdPartyService,
		thirdPartyHandler:   thirdPartyHandler,
		aiService:           aiService,
		aiHandler:           aiHandler,
		scholarManager:      scholarManager,
		minicodHandler:      minicodHandler,
		mcpUnified:          mcpUnifiedHandler,
		mcpLegacy:           mcpLegacyHandler,
		peerReviewService:   peerReviewService,
		peerReviewHandler:   peerReviewHandler,
		latexWriter:         latexWriterHandler,
		latexAgentAdmin:     latexAgentAdminHandler,
		conversationService: conversationService,
		conversationHandler: conversationHandler,
		chatHandler:         chatHandler,
	}
}
