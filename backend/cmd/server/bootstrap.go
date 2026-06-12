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
	"scholar-backend/internal/agentartifact"
	"scholar-backend/internal/agentbridge"
	"scholar-backend/internal/agentconfig"
	"scholar-backend/internal/announcement"
	"scholar-backend/internal/claw"
	"scholar-backend/internal/clientlog"
	"scholar-backend/internal/common/cleanup"
	appconfig "scholar-backend/internal/common/config"
	"scholar-backend/internal/common/database"
	"scholar-backend/internal/common/safego"
	"scholar-backend/internal/common/utils"
	"scholar-backend/internal/emaillog"
	"scholar-backend/internal/featuretool"
	"scholar-backend/internal/library"
	"scholar-backend/internal/peerreview"
	"scholar-backend/internal/prism"
	"scholar-backend/internal/promptregistry"
	"scholar-backend/internal/seo"
	"scholar-backend/internal/seosubmit"
	"scholar-backend/internal/smartsearch"
	"scholar-backend/internal/stagingarea"
	"scholar-backend/internal/storage"
	"scholar-backend/internal/supportcenter"
	"scholar-backend/internal/thirdparty"
	"scholar-backend/internal/umami"
	"scholar-backend/internal/user"
	"scholar-backend/internal/websocket"
	"scholar-backend/internal/wechat"
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
	// supportCenter 客服与联系中心(IMAP 收件轮询在 startBackgroundTasks 启动)
	supportCenterService *supportcenter.Service
}

// bootstrapServices 初始化全部模块与依赖注入。
// 顺序：基础设施 → 各域构造 → 跨域注入 → 聚合 handlers。
func bootstrapServices(cfg *appconfig.Config) *services {
	db := database.GetDB()

	// ---- 基础设施 ----
	// 注:cleanupService.Start() 延后到所有 Set*(hotContent / 归属对账)注入完之后再调,
	// 因为归属对账任务在 Start() 内按依赖是否注入决定要不要注册。
	cleanupService := cleanup.NewCleanupService(db)

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
	agentSessionRepo := agentbridge.NewRepository(db)
	agentBridge := agentbridge.New(agentClient, agentSessionRepo)

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
	// 支付回调履约由 vip 的 OrderService 承接(充值入账永久经费 / 订阅开通会员 + 赠临时经费)。
	alipayHandler, wechatPayHandler := initPaymentHandlers(db, plat.vipService.Order())
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

	// 会员(VIP)按等级日限额 + token 计费:**所有付费 AI 功能必须在此注入**。
	// ⚠️ 漏接线 = 该功能静默无配额、无计费(收入泄漏)。新增付费 feature 时务必在这里加一行 SetVIPChecker
	//    (CLAUDE.md「加新 feature 最小动作」已补此步)。vipService 由 bootstrap 构造,理论不为 nil;
	//    防御性断言一下,nil 则 fail-fast 而非让全部付费功能静默免费。
	if plat.vipService == nil {
		panic("bootstrap: vipService is nil — 付费功能将无配额/无计费,拒绝启动")
	}
	smartsearch.SetVIPChecker(plat.vipService)
	prism.SetVIPChecker(plat.vipService)
	claw.SetVIPChecker(plat.vipService)
	aiB.aiHandler.SetVIPChecker(plat.vipService)
	peerReviewService.SetVIPChecker(plat.vipService) // 注入到 service(在 Submit 内扣额度), 不在 handler

	// 统一 token 额度计数:llmusage 每记一行账本 → 同步累加进用户当日 token 预算(billing/vip)。
	// 这是「按 token 限制」的唯一扣减点;预检(CheckDailyQuota)只读闸门, 真实消耗在此累加。
	plat.llmUsageService.SetObserver(func(userID uint, tokens int) {
		plat.vipService.AddUsage(context.Background(), userID, tokens)
	})

	// seo → seosubmit (paper/author 写入后入队主动推送)
	plat.seoService.SetPushSubmitter(plat.seoSubmitService)

	// platform 内部：usageLog → hotContent（记录热门内容）
	plat.usageLogService.SetHotContentService(plat.hotContentService)

	// cleanup → hotContent（定期清理过期热门统计）
	cleanupService.SetHotContentService(plat.hotContentService)

	// cleanup → agent_sessions 归属对账(self-heal):实体级 feature 的业务表 → 归属表补漏。
	// best-effort 双写漏写后,这里周期性扫平,支撑「对账清零后删 prism Trusted 后门」。
	cleanupService.SetAgentSessionReconciler(agentSessionRepo, []agentbridge.OwnerReconcileTarget{
		{FeatureKey: prism.FeatureKey, OwnerKind: "project", SourceTable: "prism_projects", SessionCol: "agent_session_id"},
		{FeatureKey: peerreview.FeatureKey, OwnerKind: "submission", SourceTable: "peer_review_submissions", SessionCol: "agent_session_id"},
	})

	// cleanup → 临时经费过期清扫(账本可对账;余额读时本就按 now 过滤)。
	cleanupService.SetCreditExpirer(plat.vipService.Wallet().ExpireSweep)

	// cleanup → 超时 pending 订单作废(网关已关单,清掉防堆积)。
	cleanupService.SetPendingOrderCanceller(plat.vipService.Order().CancelStalePending)

	// 依赖全部注入完成,启动后台清理 + 对账任务。
	cleanupService.Start()

	// message + ws：站内信实时推送
	plat.message.SetWebSocketHub(plat.wsHub)

	// message → user（注册欢迎信）
	core.userService.SetMessageService(plat.message.GetAdapter())

	// message → feedback（回复反馈时给登录用户发站内信;复用同一个 message adapter,匿名反馈只走邮件）
	core.feedbackService.SetNotifier(plat.message.GetAdapter())

	// ---- 客服与联系中心(联系方式配置 / IMAP 收件箱 / 飞书通知) ----
	supportCenterService := supportcenter.NewService(supportcenter.NewRepository(db))
	supportCenterService.SetConfigService(core.configService) // 回信/写信复用全站激活 SMTP
	// 新反馈提交 → 飞书群推送(supportcenter 读自己的 webhook 配置,事件开关可关)
	core.feedbackService.SetFeishuNotifier(supportCenterService.NotifyFeedback)
	supportCenterHandler := supportcenter.NewHandler(supportCenterService)

	// message + email → vip（充值/订阅/续期/升级/兑换 成功后发站内信 + 邮件;统一品牌邮件模板）
	plat.vipService.SetNotifier(plat.message.GetAdapter(), core.configService)

	// 发送记录:给 utils 邮件 / 短信发送各注册一个 observer —— 全站每封邮件、每条短信(验证码/
	// 反馈/会员/测试)发送后无差别落 email_logs(channel 区分),异步 best-effort,不阻塞发送。
	// 后台「发送记录」页用 tab 切换查看邮件 / 短信。
	emailLogService := emaillog.NewService(emaillog.NewRepository(db))
	emailLogHandler := emaillog.NewHandler(emailLogService)
	utils.SetEmailObserver(func(oc utils.EmailOutcome) {
		safego.Go("email-log-record", func() {
			emailLogService.Record("email", oc.To, oc.Subject, oc.FromEmail, oc.FromName, oc.Success, oc.Error)
		})
	})
	utils.SetSMSObserver(func(oc utils.SMSOutcome) {
		safego.Go("sms-log-record", func() {
			subject := oc.TemplateContent // 模板内容更可读(含"验证码"利于归类);空则回退模板代码
			if subject == "" {
				subject = oc.TemplateCode
			}
			emailLogService.Record("sms", oc.Phone, subject, "", oc.SignName, oc.Success, oc.Error)
		})
	})

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
		agentClient,   // 每项目独立 agent 会话:prism 直接建/管 session,存 prism_projects.agent_session_id
		aiB.aiService, // 轻量模型(ModelLow)给项目按首条指令自动起名
	))
	prismHandler.SetUsageStatRecorder(plat.usageStatService)

	// ---- 聚合 handlers ----
	return &services{
		handlers: &allHandlers{
			admin:          core.admin,
			dashboard:      core.dashboard,
			user:           core.userHandler,
			config:         core.configHandler,
			scholar:        aiB.minicodHandler,
			ai:             aiB.aiHandler,
			alipay:         alipayHandler,
			wechatPay:      wechatPayHandler,
			wechat:         wechatHandler,
			wechatOfficial: wechatOfficialHandler,
			usageLogAdmin:  plat.usageLogAdmin,
			usageStats:     plat.usageStat,
			llmUsageAdmin:  plat.llmUsageAdmin,
			vip:            plat.vipHandler,
			hotContent:     plat.hotContent,
			seo:            plat.seoHandler,
			message:        plat.message,
			feedback:       core.feedback,
			emailLog:       emailLogHandler,
			ws:             plat.wsHandler,
			thirdParty:     aiB.thirdPartyHandler,
			announcement:   announcement.NewHandler(),
			library:        libraryHandler,
			stagingArea:    stagingarea.NewHandler(),
			clientLog:      clientlog.NewHandler(),
			agentConfig:    agentconfig.NewHandler(agentConfigService),
			smartSearch:    smartsearch.NewHandler(smartSearchFeature),
			peerReview:     peerReviewHandler,
			claw:           claw.NewHandler(clawFeature, agentartifact.NewRepository(db)),
			featureTool:    featureToolHandler,
			agentBridge:    agentBridge, // 内网回调端点: agent 上报带外 token 用量 (title-gen 等)
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
			supportCenter: supportCenterHandler,
		},
		userService:          core.userService,
		cleanupService:       cleanupService,
		thirdPartyService:    aiB.thirdPartyService,
		seoService:           plat.seoService,
		seoSubmitService:     plat.seoSubmitService,
		wsHub:                plat.wsHub,
		supportCenterService: supportCenterService,
	}
}
