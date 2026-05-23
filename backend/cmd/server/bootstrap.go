// ============================================================================
// Scholay学术 V1.0
// Service Bootstrap / DI Orchestrator
//
// 本文件只做三件事：
//   1. 基础设施启动（cleanup、session validator）
//   2. 调用各域 init* 构造函数（分布在 bootstrap_core/ai/platform/domains.go）
//   3. 跨域注入（SetXxx）—— 因为这些注入必须知道两个域的存在，只能集中在这里
//
// 每个域新增/删除字段时，改动集中在对应 bootstrap_<domain>.go；
// 跨域依赖变更（A 域要消费 B 域的 service）改动集中在这里。
// ============================================================================

package main

import (
	"scholar-backend/internal/announcement"
	"scholar-backend/internal/clientlog"
	"scholar-backend/internal/common/cleanup"
	appconfig "scholar-backend/internal/common/config"
	"scholar-backend/internal/common/database"
	"scholar-backend/internal/library"
	"scholar-backend/internal/peerreview"
	"scholar-backend/internal/seo"
	"scholar-backend/internal/seosubmit"
	"scholar-backend/internal/stagingarea"
	"scholar-backend/internal/thirdparty"
	"scholar-backend/internal/umami"
	"scholar-backend/internal/user"
	"scholar-backend/internal/wechat"
	"scholar-backend/internal/websocket"
)

// services 聚合所有服务与 handler，供 main 使用
type services struct {
	handlers          *allHandlers
	userService       *user.Service
	peerReviewService *peerreview.Service
	cleanupService    *cleanup.CleanupService
	thirdPartyService *thirdparty.Service
	seoService        *seo.Service
	seoSubmitService  *seosubmit.Service
	wsHub             *websocket.Hub
}

// bootstrapServices 初始化全部模块与依赖注入。
// 顺序：基础设施 → 各域构造 → 跨域注入 → 聚合 handlers。
func bootstrapServices(cfg *appconfig.Config) *services {
	db := database.GetDB()

	// ---- 基础设施 ----
	cleanupService := cleanup.NewCleanupService(db)
	cleanupService.Start()

	// ---- 各域构造 ----
	core := initCore(db, cfg)
	aiB := initAI(db, cfg)
	plat := initPlatform(db, cfg)
	alipayHandler, wechatPayHandler := initPaymentHandlers(db)
	wechatService, wechatHandler, wechatOfficialHandler := initWeChatDomain(db, aiB.aiService)

	// ---- 跨域注入 ----
	// core 域：config → user/feedback（邮件发送依赖 config）
	core.userService.SetConfigService(core.configService)
	core.feedbackService.SetConfigService(core.configService)

	// core 域：user → feedback（工单里展示用户信息）
	core.feedbackService.SetUserRepository(&feedbackUserRepoAdapter{userRepo: core.userRepo})

	// wechat → user（微信登录入口）
	core.userHandler.SetWeChatService(wechat.NewServiceAdapter(wechatService))

	// platform → config（动态 sitemap 需要热门论文 id）
	core.configHandler.SetUsageLogService(&usageLogServiceAdapter{plat.usageLogService})

	// platform → config（/paper/{slug} SSR 元数据提供）
	core.configHandler.SetPaperSEOProvider(&paperSEOProviderAdapter{svc: plat.seoService})

	// platform → config（/author/{slug} SSR 元数据提供）
	core.configHandler.SetAuthorSEOProvider(&authorSEOProviderAdapter{svc: plat.seoService})

	// platform → config (/journal/{id}/{slug} SSR 元数据提供)
	core.configHandler.SetJournalSEOProvider(&journalSEOProviderAdapter{svc: plat.seoService})

	// wechat → config（public /config/system 返回 wechat_enabled 给前端 OAuth 按钮用)
	// 走 GetActiveConfig() 是否非空判断,避免 config 包直接 import wechat 包形成循环依赖。
	core.configHandler.SetWeChatOAuthEnabledProbe(func() bool {
		cfg, err := wechatService.GetActiveConfig()
		return err == nil && cfg != nil && cfg.AppID != "" && cfg.AppSecret != ""
	})

	// AI → seo（作者详情命中 → tier=1 写入 seo_authors）
	aiB.minicodHandler.SetAuthorSEORecorder(&authorSEORecorderAdapter{svc: plat.seoService})
	aiB.minicodHandler.SetJournalSEORecorder(&journalSEORecorderAdapter{svc: plat.seoService})

	// seo → seosubmit (paper/author 写入后入队主动推送)
	plat.seoService.SetPushSubmitter(plat.seoSubmitService)

	// platform 内部：usageLog → hotContent（记录热门内容）
	plat.usageLogService.SetHotContentService(plat.hotContentService)

	// platform 内部：usageLog → seo（详情页点击写入 SEO 索引库）
	plat.usageLogService.SetSEORecorder(&seoRecorderAdapter{svc: plat.seoService})

	// cleanup → hotContent（定期清理过期热门统计）
	cleanupService.SetHotContentService(plat.hotContentService)

	// message + ws：站内信实时推送
	plat.message.SetWebSocketHub(plat.wsHub)

	// message → user（注册欢迎信）
	core.userService.SetMessageService(plat.message.GetAdapter())

	// AI 域查询结果 → user 首页聚合
	core.userHandler.SetConversationQueryService(&conversationQueryAdapter{svc: aiB.conversationService})
	core.userHandler.SetPeerReviewQueryService(&peerReviewQueryAdapter{svc: aiB.peerReviewService})

	// ---- 聚合 handlers ----
	return &services{
		handlers: &allHandlers{
			admin:           core.admin,
			dashboard:       core.dashboard,
			user:            core.userHandler,
			config:          core.configHandler,
			scholar:         aiB.minicodHandler,
			ai:              aiB.aiHandler,
			conversation:    aiB.conversationHandler,
			chat:            aiB.chatHandler,
			proxy:           plat.proxyHandler,
			pdf:             plat.pdfHandler,
			alipay:          alipayHandler,
			wechatPay:       wechatPayHandler,
			wechat:          wechatHandler,
			wechatOfficial:  wechatOfficialHandler,
			usageLog:        plat.usageLog,
			usageLogAdmin:   plat.usageLogAdmin,
			hotContent:      plat.hotContent,
			seo:             plat.seoHandler,
			message:         plat.message,
			feedback:        core.feedback,
			peerReview:      aiB.peerReviewHandler,
			peerReview2:     aiB.peerReview2Handler,
			latexWriter:     aiB.latexWriter,
			latexAgentAdmin: aiB.latexAgentAdmin,
			ws:              plat.wsHandler,
			thirdParty:      aiB.thirdPartyHandler,
			mcpUnified:      aiB.mcpUnified,
			mcpLegacy:       aiB.mcpLegacy,
			announcement:    announcement.NewHandler(),
			library: library.NewHandler(library.Deps{
				Minicod: aiB.minicodManager,
				AI:      aiB.aiService,
			}),
			stagingArea:     stagingarea.NewHandler(),
			clientLog:       clientlog.NewHandler(),
			// umami 嵌入式代登 —— 用 .env 配置或缺省 admin/umami 默认账号自动 login
			// umami:3000 + 默认 admin/umami 都写死在 client.go 里,这里只把 WebsiteID 传进去
			umami: umami.NewHandler(umami.NewClient("", "", "", appconfig.AppConfig.Umami.WebsiteID)),
		},
		userService:       core.userService,
		peerReviewService: aiB.peerReviewService,
		cleanupService:    cleanupService,
		thirdPartyService: aiB.thirdPartyService,
		seoService:        plat.seoService,
		seoSubmitService:  plat.seoSubmitService,
		wsHub:             plat.wsHub,
	}
}
