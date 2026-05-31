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
	"context"
	"log/slog"
	"net/url"
	"os"
	"time"

	"scholar-backend/internal/agent"
	"scholar-backend/internal/agentbridge"
	"scholar-backend/internal/agentconfig"
	"scholar-backend/internal/announcement"
	"scholar-backend/internal/peerreview"
	"scholar-backend/internal/claw"
	"scholar-backend/internal/smartsearch"
	"scholar-backend/internal/clientlog"
	"scholar-backend/internal/common/cleanup"
	appconfig "scholar-backend/internal/common/config"
	"scholar-backend/internal/common/database"
	"scholar-backend/internal/common/safego"
	"scholar-backend/internal/library"
	"scholar-backend/internal/promptregistry"
	"scholar-backend/internal/seo"
	"scholar-backend/internal/seosubmit"
	"scholar-backend/internal/stagingarea"
	"scholar-backend/internal/thirdparty"
	"scholar-backend/internal/umami"
	"scholar-backend/internal/user"
	"scholar-backend/internal/wechat"
	"scholar-backend/internal/websocket"
)

// domainFromSiteURL 从 https://www.scholay.com → www.scholay.com,给 umami
// auto-create website 时填 domain 字段。失败回落 localhost(纯本地起服不影响)。
func domainFromSiteURL() string {
	raw := os.Getenv("SITE_URL")
	if raw == "" {
		raw = "https://www.scholay.com"
	}
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" {
		return "localhost"
	}
	return u.Host
}

// siteName 从 SITE_NAME env 拿,缺省 Scholay。
func siteName() string {
	if v := os.Getenv("SITE_NAME"); v != "" {
		return v
	}
	return "Scholay"
}

// services 聚合所有服务与 handler，供 main 使用
type services struct {
	handlers          *allHandlers
	userService       *user.Service
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

	// agent_config:DB 服务 + HTTP 推送客户端解耦构造,
	// 一是 handler 需要 service,二是启动后还要发一次 SyncOnce。
	agentConfigService := agentconfig.NewService(db)
	agentClient := agent.LoadFromEnv()
	agentConfigService.SetAgentClient(agentClient)
	safego.Go("agent-config-startup-sync", func() {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		if err := agentConfigService.SyncOnce(ctx); err != nil {
			slog.Warn("agent config startup sync failed", "err", err)
		}
	})

	// promptregistry: 通用 prompt 注册表 service, 给 agentbridge.Picker 用。
	// 必须在 agentBridge.For(spec) 前构造好, 因为 smart_search/claw 的 spec
	// (via BuildSpec) 持有指向此 service 的闭包。
	promptSvc := promptregistry.NewService(promptregistry.NewRepository(db))

	// agent 桥接: 一份 Bridge 多 feature 复用; 每个 feature 通过 Bridge.For(spec)
	// 拿到自己的 *FeatureBridge, 在 handler 里只调几个 thin 方法。
	agentBridge := agentbridge.New(agentClient, agentbridge.NewRepository(db))

	// 各 feature Spec —— smartsearch / claw 走 BuildSpec(promptSvc) 注入 Picker;
	// peerreview.Spec 是静态 var (Picker=nil, 业务自管 prompt)。
	smartSearchSpec := smartsearch.BuildSpec(promptSvc)
	clawSpec := claw.BuildSpec(promptSvc)
	smartSearchFeature := agentBridge.For(smartSearchSpec)
	peerReviewFeature := agentBridge.For(peerreview.Spec)
	clawFeature := agentBridge.For(clawSpec)

	// 启动时 upsert 全部 feature 的 subagent 定义到 scholar_agent /api/agents。
	// Picker=nil 的 spec (peerreview) 自动跳过推送, 见 agentbridge/skill.go。
	// 失败不阻塞起服, 下次重启再推。
	safego.Go("agent-skill-startup-sync", func() {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		for _, spec := range []agentbridge.FeatureSpec{smartSearchSpec, peerreview.Spec, clawSpec} {
			if err := agentBridge.UpsertSkill(ctx, spec); err != nil {
				slog.Warn("agent skill startup sync failed",
					"feature", spec.Key, "err", err)
			}
		}
	})

	// 智能审稿 service —— 持有 4 个 PersonaRandomPicker 做 prompt 选择 +
	// peerReviewFeature 做 agent 编排; repo 用普通 GORM。
	// 4 个 picker 都从 promptSvc 取数据 (feature_prompts 表里 feature_key='peerreview'
	// persona ∈ {alpha,beta,gamma,chief} 的候选池)。
	peerReviewService := peerreview.NewService(
		peerreview.NewRepository(db),
		promptSvc,
		peerReviewFeature,
		agentbridge.NewPersonaRandomPicker(promptSvc, peerreview.FeatureKey, "alpha"),
		agentbridge.NewPersonaRandomPicker(promptSvc, peerreview.FeatureKey, "beta"),
		agentbridge.NewPersonaRandomPicker(promptSvc, peerreview.FeatureKey, "gamma"),
		agentbridge.NewPersonaRandomPicker(promptSvc, peerreview.FeatureKey, "chief"),
		agentConfigService, // meta/letter 走 haiku_model, review 走 main_model
	)
	peerReviewHandler := peerreview.NewHandler(peerReviewService)
	// 复位上次进程残留的卡死 computing / 审稿行 + 起后台周期兜底 (stuck-draft 防线)。
	peerReviewService.ReconcileStaleOnBoot()
	peerReviewService.StartStaleSweeper()

	// ---- 各域构造 ----
	core := initCore(db, cfg)
	aiB := initAI(db, cfg)
	plat := initPlatform(db, cfg)
	alipayHandler, wechatPayHandler := initPaymentHandlers(db)
	wechatService, wechatHandler, wechatOfficialHandler := initWeChatDomain(db, aiB.aiService)
	// library handler 提前构造命名变量, 跨域注入(usage recorder)需要在它上面调 setter
	libraryHandler := library.NewHandler(library.Deps{Minicod: aiB.minicodManager})

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
	core.configHandler.SetPaperSEOProvider(plat.seoService)

	// platform → config（/author/{slug} SSR 元数据提供）
	core.configHandler.SetAuthorSEOProvider(plat.seoService)

	// platform → config (/journal/{id}/{slug} SSR 元数据提供)
	core.configHandler.SetJournalSEOProvider(plat.seoService)

	// wechat → config（public /config/system 返回 wechat_enabled 给前端 OAuth 按钮用)
	// 走 GetActiveConfig() 是否非空判断,避免 config 包直接 import wechat 包形成循环依赖。
	core.configHandler.SetWeChatOAuthEnabledProbe(func() bool {
		cfg, err := wechatService.GetActiveConfig()
		return err == nil && cfg != nil && cfg.AppID != "" && cfg.AppSecret != ""
	})

	// AI → seo（作者详情命中 → tier=1 写入 seo_authors）
	aiB.minicodHandler.SetAuthorSEORecorder(plat.seoService)
	aiB.minicodHandler.SetJournalSEORecorder(plat.seoService)

	// 热门内容: 搜索词 / 论文曝光 / 点击 ← minicod 搜索与详情接口;
	// SEO 直访 ← seo /paper/:slug。同一个 hotContentService 满足两个接口。
	aiB.minicodHandler.SetHotContentRecorder(plat.hotContentService)
	plat.seoHandler.SetHotContentRecorder(plat.hotContentService)

	// 功能使用统计: 5 个菜单功能 (paper_search / journal_search / claw / peer_review / library)
	// 在"用户实际使用"那一刻记一条 usage_logs。各模块依赖 usagelog.FeatureRecorder 接口,
	// 由同一个 plat.usageLogService 满足。 claw 用 package-level 懒绑定 (PreUserMessage 闭包),
	// 所以注入顺序可后于 Bridge.For(claw.Spec)。
	aiB.minicodHandler.SetUsageRecorder(plat.usageLogService)
	peerReviewHandler.SetUsageRecorder(plat.usageLogService)
	libraryHandler.SetUsageRecorder(plat.usageLogService)
	claw.SetUsageRecorder(plat.usageLogService)

	// seo → seosubmit (paper/author 写入后入队主动推送)
	plat.seoService.SetPushSubmitter(plat.seoSubmitService)

	// platform 内部：usageLog → hotContent（记录热门内容）
	plat.usageLogService.SetHotContentService(plat.hotContentService)

	// cleanup → hotContent（定期清理过期热门统计）
	cleanupService.SetHotContentService(plat.hotContentService)

	// message + ws：站内信实时推送
	plat.message.SetWebSocketHub(plat.wsHub)

	// message → user（注册欢迎信）
	core.userService.SetMessageService(plat.message.GetAdapter())

	// ---- 聚合 handlers ----
	return &services{
		handlers: &allHandlers{
			admin:           core.admin,
			dashboard:       core.dashboard,
			user:            core.userHandler,
			config:          core.configHandler,
			scholar:         aiB.minicodHandler,
			ai:              aiB.aiHandler,
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
			ws:              plat.wsHandler,
			thirdParty:      aiB.thirdPartyHandler,
			announcement:    announcement.NewHandler(),
			library:         libraryHandler,
			stagingArea:     stagingarea.NewHandler(),
			clientLog:       clientlog.NewHandler(),
			agentConfig:     agentconfig.NewHandler(agentConfigService),
			smartSearch:     smartsearch.NewHandler(smartSearchFeature),
			peerReview:      peerReviewHandler,
			claw:            claw.NewHandler(clawFeature),
			promptRegistry:  promptregistry.NewHandler(promptSvc),
			// umami HTTP API 接入 —— admin /analytics 自渲染图表 + tracker website id 自动 bootstrap
			// 详见 internal/umami/client.go:EnsureWebsiteID。
			// WebsiteID env 配了用配的;空 → 启动后首次需要时 list+create 自动建一个 Scholay website。
			umami: umami.NewHandler(umami.NewClient(
				"", "", "",
				appconfig.AppConfig.Umami.WebsiteID,
				siteName(),
				domainFromSiteURL(),
			)),
		},
		userService:       core.userService,
		cleanupService:    cleanupService,
		thirdPartyService: aiB.thirdPartyService,
		seoService:        plat.seoService,
		seoSubmitService:  plat.seoSubmitService,
		wsHub:             plat.wsHub,
	}
}
