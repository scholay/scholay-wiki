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
	"scholar-backend/internal/featuretool"
	"scholar-backend/internal/library"
	"scholar-backend/internal/prism"
	"scholar-backend/internal/promptregistry"
	"scholar-backend/internal/seo"
	"scholar-backend/internal/seosubmit"
	"scholar-backend/internal/stagingarea"
	"scholar-backend/internal/storage"
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

	// 各 feature Spec —— smartsearch / claw 的 prompt 已迁回代码静态管理 (internal/prompts),
	// BuildSpec 内部用 agentbridge.StaticPicker, 不再依赖 promptSvc;
	// peerreview.Spec 是静态 var (Picker=nil, 业务自管 prompt)。
	// promptSvc 目前仍由 peerreview 的 4 个 PersonaRandomPicker (下方) 与 admin 注册表 handler 使用。
	smartSearchSpec := smartsearch.BuildSpec()
	clawSpec := claw.BuildSpec()
	smartSearchFeature := agentBridge.For(smartSearchSpec)
	peerReviewFeature := agentBridge.For(peerreview.Spec)
	clawFeature := agentBridge.For(clawSpec)
	// 智能写作 (Prism): AI 定点编辑走 ServerSideChatStreaming;会话禁写盘工具(见 prism.BuildSpec)。
	prismFeature := agentBridge.For(prism.BuildSpec())

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

	// 智能审稿 service —— 审稿人选择已移进 agent(reviewer-roster skill), 后端不再持有 picker;
	// promptSvc 仅传给 service 给 handler 渲染老报告 (GetPromptByID legacy 回退)。
	peerReviewService := peerreview.NewService(
		peerreview.NewRepository(db),
		promptSvc,
		peerReviewFeature,
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

	// 热门内容: 搜索词 + 论文曝光 ← minicod 搜索接口 (传统/期刊搜索, 服务端记)。
	// 点击量 / SEO 直访量改由前端上报 POST /public/hot-content/track (见 hotcontent.Handler.Track)。
	aiB.minicodHandler.SetHotContentRecorder(plat.hotContentService)

	// 功能使用统计 v2 (usage_events): 用户实际使用功能那一刻记一条事件。
	// 旧 usagelog (usage_logs) 已废弃 —— 埋点全移除, 旧模块/旧页/旧表保留为历史只读。
	//   minicod: 传统/期刊搜索;  ai: 矩阵维度修改 + 论文翻译;  peerreview: 审稿各步骤(连贯);
	//   smartsearch/claw: agent PreUserMessage 钩子, 每次提问/对话一条 (package-level 懒绑定,
	//   注入顺序可后于 Bridge.For)。暂存 / 收藏走前端上报, 不在这里注入。
	aiB.minicodHandler.SetUsageStatRecorder(plat.usageStatService)
	aiB.aiHandler.SetUsageStatRecorder(plat.usageStatService)
	peerReviewHandler.SetUsageStatRecorder(plat.usageStatService)
	smartsearch.SetUsageRecorder(plat.usageStatService)
	claw.SetUsageRecorder(plat.usageStatService)
	prism.SetUsageStatRecorder(plat.usageStatService) // WS preUserMessageChain 用(包级 var,区别于 Handler 方法)

	// 统一 LLM token 账本 (llm_token_usage):
	//   - 项目侧 ai.Service: executeWithRetry 咽喉点每次成功落一行 (source=project),
	//     覆盖 matrix / translate / wechat_oa (后者 user_id=NULL)。
	//   - agent 侧 smart_search/claw: 每轮 message_complete 落一行 (source=agent)。
	//   - peerreview: 在 ServerSideChatStreaming 内部记账 (下方 peerreview 注入)。
	aiB.aiService.SetLLMUsageRecorder(plat.llmUsageService)
	smartsearch.SetLLMUsageRecorder(plat.llmUsageService)
	claw.SetLLMUsageRecorder(plat.llmUsageService)
	prism.SetLLMUsageRecorder(plat.llmUsageService) // WS onMessageComplete 落 token 账本(source=agent)
	// peerreview 的 server-side chat 走 Bridge.ServerSideChatStreaming, 在其内部落账本。
	agentBridge.SetLLMUsageRecorder(plat.llmUsageService)

	// 会员(VIP)按等级日限额:注入给 4 个受限 AI 功能。未注入则各自回落到旧 env 日额度/不限。
	smartsearch.SetVIPChecker(plat.vipService)
	prism.SetVIPChecker(plat.vipService)
	claw.SetVIPChecker(plat.vipService)
	aiB.aiHandler.SetVIPChecker(plat.vipService)
	peerReviewService.SetVIPChecker(plat.vipService) // 注入到 service(在 Submit 内扣额度), 不在 handler

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

	// 功能大全 (学术工具黄页): repo → dispatcher(webhook) → service → handler
	featureToolRepo := featuretool.NewRepository(db)
	featureToolDisp := featuretool.NewDispatcher(featureToolRepo)
	featureToolSvc := featuretool.NewService(featureToolRepo, featureToolDisp)
	featureToolHandler := featuretool.NewHandler(featureToolSvc, featureToolDisp)
	// 功能大全工具详情页 /tools/{slug} SSR 元数据(匿名 SEO)
	core.configHandler.SetToolSEOProvider(featureToolSvc)

	// 智能写作 (Prism) handler —— 提前构造以注入功能使用统计录入器(同 peerReview/claw)。
	prismHandler := prism.NewHandler(prism.NewService(
		prism.NewRepository(db),
		prism.NewTexClient(os.Getenv("PRISM_WORK_DIR")),
		storage.PrismBucket(),
		prismFeature,
		agentClient, // 每项目独立 agent 会话:prism 直接建/管 session,存 prism_projects.agent_session_id
		aiB.aiService, // 轻量模型(ModelLow)给项目按首条指令自动起名
	))
	prismHandler.SetUsageStatRecorder(plat.usageStatService)

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
			usageStats:      plat.usageStat,
			llmUsageAdmin:   plat.llmUsageAdmin,
			vip:             plat.vipHandler,
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
			featureTool:     featureToolHandler,
			// 智能写作 (Prism): DB 真源 + 编译沙箱(共享卷 watcher)+ AI 定点编辑(prismFeature/agent)。
			prism: prismHandler,
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
