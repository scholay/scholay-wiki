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
	"scholar-backend/internal/peerreview2"
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
	minicodManager *minicod.Manager
	minicodHandler *minicod.Handler

	mcpUnified *mcp.UnifiedHandler
	mcpLegacy  *mcp.Handler

	peerReviewService *peerreview.Service
	peerReviewHandler *peerreview.Handler

	peerReview2Handler *peerreview2.Handler

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

	// V2: 接入 peer.scholay.com 外部审稿 API
	peerReview2Repo := peerreview2.NewRepository(db)
	peerReview2Client := peerreview2.NewClient(cfg.PeerReviewV2.BaseURL, cfg.PeerReviewV2.APIKey)
	peerReview2Service := peerreview2.NewService(peerReview2Repo, peerReview2Client)
	peerReview2Handler := peerreview2.NewHandler(peerReview2Service)
	if !peerReview2Service.IsConfigured() {
		slog.Warn("PEER_REVIEW_API_KEY 未配置,/peer-review2 接口将返回 503")
	}

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
		minicodManager:      minicodManager,
		minicodHandler:      minicodHandler,
		mcpUnified:          mcpUnifiedHandler,
		mcpLegacy:           mcpLegacyHandler,
		peerReviewService:   peerReviewService,
		peerReviewHandler:   peerReviewHandler,
		peerReview2Handler:  peerReview2Handler,
		latexWriter:         latexWriterHandler,
		latexAgentAdmin:     latexAgentAdminHandler,
		conversationService: conversationService,
		conversationHandler: conversationHandler,
		chatHandler:         chatHandler,
	}
}
