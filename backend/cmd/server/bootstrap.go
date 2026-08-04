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
	"scholar-backend/internal/agentattach"
	"scholar-backend/internal/agentbridge"
	"scholar-backend/internal/agentconfig"
	"scholar-backend/internal/agentrun"
	"scholar-backend/internal/announcement"
	"scholar-backend/internal/boltslides"
	"scholar-backend/internal/claw"
	"scholar-backend/internal/clientlog"
	"scholar-backend/internal/common/cleanup"
	appconfig "scholar-backend/internal/common/config"
	"scholar-backend/internal/common/database"
	"scholar-backend/internal/common/middleware"
	"scholar-backend/internal/common/safego"
	"scholar-backend/internal/common/utils"
	"scholar-backend/internal/emaillog"
	"scholar-backend/internal/featuretool"
	"scholar-backend/internal/invite"
	"scholar-backend/internal/library"
	"scholar-backend/internal/modelcatalog"
	"scholar-backend/internal/news"
	"scholar-backend/internal/openaccess"
	"scholar-backend/internal/peerreview"
	"scholar-backend/internal/prism"
	"scholar-backend/internal/promo"
	"scholar-backend/internal/promptregistry"
	"scholar-backend/internal/scidraw"
	"scholar-backend/internal/seo"
	"scholar-backend/internal/seoenrich"
	"scholar-backend/internal/seosubmit"
	"scholar-backend/internal/skillmarket"
	"scholar-backend/internal/smartsearch"
	"scholar-backend/internal/stagingarea"
	"scholar-backend/internal/storage"
	"scholar-backend/internal/supportcenter"
	"scholar-backend/internal/thirdparty"
	"scholar-backend/internal/umami"
	"scholar-backend/internal/user"
	"scholar-backend/internal/usermemory"
	"scholar-backend/internal/vip"
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
	// agentBridge 顶层暴露给 main:跨实例 displacement 订阅 goroutine 需用 bgCtx 启动 (C2)。
	agentBridge *agentbridge.Bridge
	// stopQuotaPersist 停额度窗口 used 刷盘器,退出前同步刷最后一批(0103)。
	// 与 FlushAllTokenWatermarks 同一类:必须真的在 SIGTERM 序列里被调用。
	stopQuotaPersist func()
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
	// 模型目录 + 能力绑定(模型目录化 P1,方案 docs/research/model-catalog-2026-07/REPORT.md):
	// PushConfig 的 4 槽位改由绑定表解析(main/sonnet/opus=system.main,haiku=system.fast);
	// 终极回退读 agent_config.main_model 冻结列(fresh install 行为=现状);绑定变更触发重推。
	// 必须在 startup-sync goroutine 之前接线,否则首推可能拿不到 SlotProvider。
	modelCatalogService := modelcatalog.NewService(modelcatalog.NewRepository(db))
	modelCatalogService.SetTerminalFallback(func() string {
		cfg, err := agentConfigService.GetConfig()
		if err != nil || cfg == nil {
			return ""
		}
		return cfg.MainModel
	})
	modelCatalogService.SetPushTrigger(agentConfigService.RepushAsync)
	agentConfigService.SetSlotProvider(modelCatalogService)
	// F0 双协议:额外 provider 推送器(fork + executor 两目标 best-effort;executor 目标在下方
	// 配置后经 PushAllProviders 周期自愈补推)。
	modelCatalogService.SetProviderPusher(func(ctx context.Context, p *modelcatalog.AgentProvider) error {
		return agentClient.PushExtraProvider(ctx, p.ExecutorKey(), p.BaseURL, p.APIKey, p.APIFormat, p.ReasoningReplay)
	})
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
	// P2 模型目录接缝:hub 建连下发会话模型 + 浏览器换模型帧权威校验(堵 modelId 注入洞)。
	agentBridge.SetModelCatalog(modelCatalogService)
	// durable 会话事件日志 + TurnCoordinator(写 agent_turns/agent_turn_events/agent_billing_ledger,
	// 迁移 0046-0047)。【根治 2026-07-21】改为**结构性默认恒接线**:会话历史的耐久性不再取决于
	// AGENT_TURN_JOURNAL 是否恰好 = shadow —— 此前是 opt-in,漏配/打错该 env = 新 turn 不落库、历史无源
	// (boltslides 事故根因之一,数据完整性不该由 env 开关决定)。现仅 AGENT_TURN_JOURNAL=off 显式关闭
	// (紧急闸,关 = 历史退回 agent 内存易失态,强烈不建议)。jsonl + 内存 hub 仍作 live 权威,journal 为
	// durable 真源(读路径见 readFromJournal:默认从 journal 折叠,自带 archive/daemon 兜底)。
	if os.Getenv("AGENT_TURN_JOURNAL") != "off" {
		eventLog := agentbridge.NewEventLog(db)
		agentBridge.SetTurnCoordinator(agentbridge.NewTurnCoordinator(eventLog))
		// M5:启动清理上次崩溃残留的僵尸 running turn(防续流复活死轮)。
		rctx, rcancel := context.WithTimeout(context.Background(), 15*time.Second)
		agentBridge.ReconcileJournalOnBoot(rctx)
		rcancel()
		// W3-2c:运行期 reaper —— 10min 周期回收僵尸 running turn(不再只在 boot 清一次;
		// FailTurn 落库失败 / hub 异常路径漏 finalize 的轮在 30min 内被兜底收口)。
		agentBridge.StartJournalReaper(context.Background())
		slog.Info("agentbridge: durable turn journal enabled (structural default; set AGENT_TURN_JOURNAL=off to disable)")
		// P1 校验 harness:journal==daemon 持续比对(只读、只 slog,不改 live)。AGENT_JOURNAL_VALIDATE=on 才启。
		if os.Getenv("AGENT_JOURNAL_VALIDATE") == "on" {
			validator := agentbridge.NewJournalValidator(db, eventLog, agentClient)
			safego.Go("agentbridge-journal-validate", func() { validator.Run(context.Background()) })
			slog.Info("agentbridge: journal==daemon validator enabled (AGENT_JOURNAL_VALIDATE=on)")
		}
	}
	// Web-native 重构 P4a:切流到 clean-room executor。**opt-in**:配 AGENT_EXECUTOR_BASE_URL +
	// AGENT_EXECUTOR_FEATURES(csv,如 "smart_search")才生效;默认空 = 全走 fork(零行为变更,清空即秒回退)。
	// 命中的 feature:WS dial executor + 连接喂 journal history(seed_history)+ 历史读走 journal。
	// 要求同时 AGENT_TURN_JOURNAL=shadow(否则历史无源)。
	if execBase := os.Getenv("AGENT_EXECUTOR_BASE_URL"); execBase != "" {
		execClient := agent.NewClient(execBase, os.Getenv("AGENT_AUTH_TOKEN"))
		execFeatures := os.Getenv("AGENT_EXECUTOR_FEATURES")
		// C6 fail-fast:executor 路由的 feature 历史读走 journal;若有人显式 AGENT_TURN_JOURNAL=off 关掉
		// durable 写,这些 feature 历史全空 + 新 turn 不落库 → 永久不可恢复。拒绝带病启动。
		// (journal 现默认恒开,仅 =off 显式关闭 → 唯一危险配置就是 off。)
		if execFeatures != "" && os.Getenv("AGENT_TURN_JOURNAL") == "off" {
			slog.Error("FATAL agentbridge: AGENT_EXECUTOR_FEATURES 已配但 AGENT_TURN_JOURNAL=off — "+
				"executor 路由的 feature 历史无源、新 turn 不落库,会全量永久丢历史。拒绝启动。",
				"features", execFeatures, "AGENT_TURN_JOURNAL", os.Getenv("AGENT_TURN_JOURNAL"))
			os.Exit(1)
		}
		agentBridge.SetExecutorRouting(execClient, execFeatures)
		// executor 也要拿到 provider/model 配置(否则切流后无 active provider)→ 加为次级推送目标。
		agentConfigService.AddExtraAgentClient(execClient)
		// 配置自愈:executor 内存配置在 recreate/crash 后会丢,后端只在自身启动推一次 → 周期重推,
		// 使 executor 单独重建后自动恢复 active provider(无需重启 backend)。立即推一次(覆盖 co-recreate
		// 竞态:backend SyncOnce 可能早于 executor ready)+ 每 60s 重推(60s 内自愈)。
		safego.Go("executor-config-resync", func() {
			push := func() {
				// 推送口径:槽位经绑定表解析(GetEffectiveConfig),否则 executor 拿到的是冻结旧列值。
				cfg, err := agentConfigService.GetEffectiveConfig()
				if err != nil || cfg == nil || !cfg.Enabled {
					return
				}
				rctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
				defer cancel()
				_ = execClient.PushConfig(rctx, cfg)
				// F0:额外 provider 也随同一自愈节奏补推到 executor(upsert 幂等,不 activate)。
				modelCatalogService.PushAllProviders(rctx)
			}
			time.Sleep(8 * time.Second) // 给 executor 留 ready 时间,再补一发(SyncOnce 已在更早推过一次)
			push()
			ticker := time.NewTicker(60 * time.Second)
			defer ticker.Stop()
			for range ticker.C {
				push()
			}
		})
		slog.Info("agentbridge: executor routing enabled", "base_url", execBase, "features", execFeatures)
	}

	// P6 fork 退役一次性归档:AGENT_ARCHIVE_FROM_FORK=1 时,把 fork 仍持有的老 transcript 归档进
	// agent_session_archive(此刻 agentClient 仍指向 fork)。幂等;归档完即可删 fork。仅在带 fork 的
	// 迁移那一次部署设此 env,之后清掉。
	if os.Getenv("AGENT_ARCHIVE_FROM_FORK") == "1" {
		safego.Go("agentbridge-archive-from-fork", func() {
			actx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
			defer cancel()
			agentBridge.ArchiveFromFork(actx, agentClient)
		})
	}

	// P6 fork 退役一次性归档(**无需 fork 在场**):AGENT_ARCHIVE_FROM_JSONL=<dir> 时,开机从磁盘的
	// cc-haha jsonl(<dir>/projects/<slug>/<sid>.jsonl)折叠老会话进 agent_session_archive。幂等(已归档/
	// 已有 journal turn 跳过)。生产删 fork 后,把老 ./data/agent 只读挂进来设此 env,deploy 即自动迁移历史。
	if jsonlRoot := os.Getenv("AGENT_ARCHIVE_FROM_JSONL"); jsonlRoot != "" {
		safego.Go("agentbridge-archive-from-jsonl", func() {
			actx, cancel := context.WithTimeout(context.Background(), 15*time.Minute)
			defer cancel()
			agentBridge.ArchiveFromJsonl(actx, jsonlRoot)
		})
	}

	// 各 feature Spec —— smartsearch / claw 的 prompt 已迁回代码静态管理 (internal/prompts),
	// BuildSpec 内部用 agentbridge.StaticPicker, 不再依赖 promptSvc;
	// peerreview.Spec 是静态 var (Picker=nil, 业务自管 prompt)。
	// promptSvc 目前仍由 peerreview 的 4 个 PersonaRandomPicker (下方) 与 admin 注册表 handler 使用。
	smartSearchSpec := smartsearch.BuildSpec()
	clawSpec := claw.BuildSpec()
	boltSlidesSpec := boltslides.BuildSpec()
	smartSearchFeature := agentBridge.For(smartSearchSpec)
	peerReviewFeature := agentBridge.For(peerreview.Spec)
	clawFeature := agentBridge.For(clawSpec)
	// 制作PPT (boltslides): 智能助手页选项卡切入;独立 session 池,建会话铺 bolt-slides 脚手架、BuildDeck 编译单文件 HTML。
	boltSlidesFeature := agentBridge.For(boltSlidesSpec)
	// 科研绘图 (sci_draw): 智能助手页模板卡切入;独立 session 池,生成原创矢量 SVG(P0,仿 boltslides 集成)。
	sciDrawSpec := scidraw.BuildSpec()
	sciDrawFeature := agentBridge.For(sciDrawSpec)
	// 智能写作 (Prism): AI 定点编辑走 ServerSideChatStreaming;会话禁写盘工具(见 prism.BuildSpec)。
	prismFeature := agentBridge.For(prism.BuildSpec())

	// 跨会话附件物化(2026-07-31 线上审计 §五):用户在 A 对话上传、切到 B 对话再发送时,
	// 附件路径仍指向 A 的会话 cwd,而权限层只认本会话 cwd 前缀 → Read/ReadDocument 全被拒,
	// 模型只能对用户说「我打不开你的文件」而该轮仍 complete。这里让附件在转发前物化进当前
	// 会话,使路径永远同源 —— 权限边界一点没放宽。prism 是主场景(一项目多对话),claw 家族
	// 同样支持附件。必须在 For() 之后注入(实现方需要 *FeatureBridge,见 SetAttachmentRelocator)。
	for _, af := range []*agentbridge.FeatureBridge{
		prismFeature, clawFeature, smartSearchFeature, boltSlidesFeature, sciDrawFeature,
	} {
		af.SetAttachmentRelocator(agentattach.NewRelocator(af))
	}

	// ── Run 引擎(2026-08 科研内核 Phase 1)────────────────────────────────────
	// 一条科研请求 = 一个持久 Run;Run = 一串 Step,每步走既有的 ServerSideChatStreaming
	// (**不新建执行路径**)。交接靠 MySQL + workDir 产物,不靠内存 messages。
	//
	// 🔴 装配即接线:本仓库「引擎造好没接线」已经吃过七次(artifact 契约 / Relocator /
	//    research_state 帧 / SubmitAnswer 放行 / prefetch 字段 / markRead / EvidenceGet 权限)。
	//    模板零值时引擎对该剖面完全不动,所以这里可以无条件装配 —— 装了但没模板 = 行为零变化,
	//    而**不装**则是"代码在仓库里、生产上不存在",正是那七次的形状。
	runTemplates := agentrun.NewSpecTemplateSource()
	runEngine := agentrun.NewEngine(
		agentrun.NewRepo(db), runTemplates,
		&agentrun.HTTPSlotProbe{
			BaseURL: os.Getenv("AGENT_EXECUTOR_BASE_URL"),
			Token:   os.Getenv("AGENT_AUTH_TOKEN"),
		},
		os.Getenv("HOSTNAME"),
	)
	for _, rf := range []*agentbridge.FeatureBridge{
		clawFeature, prismFeature, smartSearchFeature, peerReviewFeature, boltSlidesFeature, sciDrawFeature,
	} {
		spec := rf.Spec()
		tpls := agentrun.FromSpecTemplates(spec.RunTemplates)
		if err := runTemplates.Add(spec.Key, tpls); err != nil {
			// 起服断言:非法模板(如 step_key 重复)会在 uk_saga_step 上撞唯一键,
			// 那时错误发生在用户的一次真实请求里、表现成「Run 卡住」而不是「模板写错了」。宁可起不来。
			slog.Error("FATAL agentrun: 非法 RunTemplate,拒绝启动", "feature", spec.Key, "err", err)
			os.Exit(1)
		}
		runEngine.Register(agentrun.NewBridgeExecutor(rf))
	}
	runEngine.Start(context.Background())

	// Skills 市场:用户上传/分享 skill + claw 动态加载(tier-1 纯指令,内联物化到 executor guides 层)。
	// 持有上限的会员档解析器(需 plat.vipService)在下方 SetVIPChecker 附近注入(那时 plat 已就绪)。
	skillMarketService := skillmarket.NewService(skillmarket.NewRepository(db))
	// claw 建会话时经此物化用户启用的市场 skill(SessionSkillsProvider 钩子)。
	claw.SetSkillsProvider(skillMarketService.MaterializeForUser)
	skillMarketHandler := skillmarket.NewHandler(skillMarketService)

	// 启动时 upsert 全部 feature 的 subagent 定义到 scholar_agent /api/agents。
	// Picker=nil 的 spec (peerreview) 自动跳过推送, 见 agentbridge/skill.go。
	// 审计修复(2026-07-23):原「失败不阻塞起服, 下次重启再推」= 一次性推送 —— backend 比 agent
	// 先就绪(或撞上熔断)时全军覆没且**永不重试**,整机会一直跑在无 skill/subagent 定义的降级
	// 状态直到下次重启(本机实测复现:启动窗口 4 个 feature 全失败后 9 小时无人补推)。
	// 改为线性退避重试,只重推失败的 spec,直到全部成功或耗尽(~11 分钟,覆盖 agent 冷启/熔断恢复)。
	safego.Go("agent-skill-startup-sync", func() {
		pending := []agentbridge.FeatureSpec{smartSearchSpec, peerreview.Spec, clawSpec, boltSlidesSpec, sciDrawSpec}
		for attempt := 0; attempt < 10 && len(pending) > 0; attempt++ {
			if attempt > 0 {
				time.Sleep(time.Duration(attempt) * 15 * time.Second)
			}
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			var failed []agentbridge.FeatureSpec
			for _, spec := range pending {
				if err := agentBridge.UpsertSkill(ctx, spec); err != nil {
					slog.Warn("agent skill startup sync failed (will retry)",
						"feature", spec.Key, "attempt", attempt, "err", err)
					failed = append(failed, spec)
				}
			}
			cancel()
			pending = failed
		}
		if len(pending) > 0 {
			keys := make([]string, 0, len(pending))
			for _, s := range pending {
				keys = append(keys, s.Key)
			}
			slog.Error("agent skill startup sync exhausted retries — 这些 feature 将在无 skill 定义状态下运行直到下次重启",
				"features", keys)
		}
	})

	// 智能审稿 service —— 审稿人选择已移进 agent(reviewer-roster skill), 后端不再持有 picker;
	// promptSvc 仅传给 service 给 handler 渲染老报告 (GetPromptByID legacy 回退)。
	peerReviewService := peerreview.NewService(
		peerreview.NewRepository(db),
		promptSvc,
		peerReviewFeature,
		modelCatalogService, // 各阶段模型按能力绑定取(peerreview.meta/letter/methodology/scoring/chief)
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
	// 「最后活跃时间」记录器: 每次通过鉴权的 user 请求节流更新 users.last_active_at,
	// 让后台看到的是用户最后实际使用时间, 而非仅登录动作(last_login_at)。
	middleware.SetActivityHook(core.userService.RecordActivity)

	// core 域：user → feedback（工单里展示用户信息）
	core.feedbackService.SetUserRepository(&feedbackUserRepoAdapter{userRepo: core.userRepo})

	// wechat → user（微信登录入口）
	core.userHandler.SetWeChatService(wechat.NewServiceAdapter(wechatService))

	// 注:原「platform → config(动态 sitemap 热门论文 id)」接线已随 usagelog 下线移除 ——
	// 该 sitemap handler(config.ServeDynamicSitemap)本就未注册任何路由,且热门论文查的是
	// usage_logs 最近 30 天(2026-06 起零写入)恒为空。线上 sitemap 全走 h.seo.*(seo_papers/authors)。

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

	// 已登录用户的论文搜索结果由 library 标注 isFavorited(省一次 /user/library/check 往返)
	aiB.minicodHandler.SetFavoriteChecker(libraryHandler)

	// 期刊投稿资源下载的 Max 会员门槛(EffectiveTier),接 vip.Service。
	aiB.minicodHandler.SetMembershipChecker(plat.vipService)

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
	boltslides.SetUsageRecorder(plat.usageStatService)
	scidraw.SetUsageRecorder(plat.usageStatService)
	prism.SetUsageStatRecorder(plat.usageStatService) // WS preUserMessageChain 用(包级 var,区别于 Handler 方法)

	// 统一 LLM token 账本 (llm_token_usage):
	//   - 项目侧 ai.Service: executeWithRetry 咽喉点每次成功落一行 (source=project),
	//     覆盖 matrix / translate / wechat_oa (后者 user_id=NULL)。
	//   - agent 侧 (smart_search/claw/prism/peerreview): token 经 WS **带内帧**落库 ——
	//     交互三件套走 ws.go 的 accrueTurnUsage(message_complete + 带外 token_usage 帧),
	//     peerreview 走 ws_serverside.go 的 accrueTurnUsage,二者都喂 b.llmRec。
	//     ⚠️ OnMessageComplete 钩子刻意只 slog 不落库(见 hooks.go NewSlogUsageRecorder)——
	//     **切勿**给它再接 ledger recorder,否则与 accrueTurnUsage 带内帧双计账本 + 双扣额度。
	//     (历史的 agent per-call HTTP 内网回调 /internal_handler.go 旁路早已删除,勿据旧注释找它。)
	aiB.aiService.SetLLMUsageRecorder(plat.llmUsageService)
	// 项目侧 LLM(翻译/分析/公众号/Prism 点评)改走 agent 单次接口 + 能力绑定选型(取代第三方账号 key)。
	// 未接线时 internal/ai 回退旧第三方路径(平滑迁移 + 回滚)。
	aiB.aiService.SetAgentBackend(agentClient, modelCatalogService)
	// Prism 修改意见拆条的廉价单次补全(内联点评已删,此注入点现仅供 revision-parse)。
	prism.SetCheapCompletionFn(aiB.aiService.CompleteSimple)
	// Bridge 级 llmRec 是活代码:被 ws.go(交互三件套)与 ws_serverside.go(peerreview)的
	// accrueTurnUsage 消费,记下全部 agent 侧 token。务必保留。
	agentBridge.SetLLMUsageRecorder(plat.llmUsageService)

	// per-user 长期记忆 (C4): 所有 feature 共享同一份用户记忆。
	//   - 读(注入): Bridge 在 WS 首条消息前缀 (smart_search/claw/prism) + peerreview 方法论 prompt 注入;
	//   - 写(抽取): 每轮对话后由 **agent 容器** 跑廉价模型抽取(backend 不再用 ai.Service)——
	//     agentbridge 经 WS extract_memory 帧把 prompt 推给 agent, 回传 memory_update 帧后 backend 落库, 限流控成本;
	//   - 用户编辑: /api/v1/user/memory (handler 见下)。
	userMemoryService := usermemory.NewService(usermemory.NewRepository(db))
	agentBridge.SetMemoryService(userMemoryService)

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
	boltslides.SetVIPChecker(plat.vipService)
	scidraw.SetVIPChecker(plat.vipService)
	// Skills 市场持有上限按会员档:免费 10 / 付费 50(闭包运行时读 plat.vipService)。
	skillMarketService.SetSkillCapResolver(func(userID uint) int {
		if plat.vipService != nil && plat.vipService.EffectiveTier(userID) != "free" {
			return skillmarket.MaxSkillsPro
		}
		return skillmarket.MaxSkillsFree
	})
	aiB.aiHandler.SetVIPChecker(plat.vipService)
	peerReviewService.SetVIPChecker(plat.vipService) // 注入到 service(在 Submit 内扣额度), 不在 handler
	// P2 模型目录:min_tier 档位门槛按用户生效会员档判定(ValidateUserModel / 选择器 locked)。
	modelCatalogService.SetTierResolver(plat.vipService.EffectiveTier)

	// 接线完整性自检:遍历所有付费 feature,断言配额校验器确已注入。
	// 漏接 = 该功能静默无配额无计费(收入泄漏)且无人察觉 —— 这里 fail-fast 拒绝启动,
	// 把「忘了上面加一行 SetVIPChecker」从生产事故降级为起服即崩的显式错误。
	// 新增付费 feature 时,上面加一行 SetVIPChecker,这里同步加一行 wired 探针。
	for feature, wired := range map[string]bool{
		"smart_search": smartsearch.VIPCheckerWired(),
		"claw":         claw.VIPCheckerWired(),
		"boltslides":   boltslides.VIPCheckerWired(),
		"sci_draw":     scidraw.VIPCheckerWired(),
		"prism":        prism.VIPCheckerWired(),
		"ai":           aiB.aiHandler.VIPCheckerWired(),
		"peerreview":   peerReviewService.VIPCheckerWired(),
	} {
		if !wired {
			panic("bootstrap: 付费功能 \"" + feature + "\" 未注入 VIPChecker — 将静默无配额/无计费,拒绝启动")
		}
	}

	// 统一 token 额度计数:llmusage 每记一行账本 → 同步累加进用户周期 token 预算(billing/vip)。
	// 这是「按真实成本限制」的唯一扣减点;预检(CheckDailyQuota)只读闸门, 真实消耗在此累加。
	// P5 成本制:Pricer 在 Record 内(observer 门之前)按模型目录 4 类单价算真实成本;observer 拿到的
	// costMicro 是**真实成本(微元)**,直接进周期额度计数(额度单位=微元,显示 ÷1000=算力点)。
	plat.llmUsageService.SetPricer(modelCatalogService)
	plat.llmUsageService.SetObserver(func(userID uint, costMicro int) {
		plat.vipService.AddUsage(context.Background(), userID, costMicro)
	})

	// seo → seosubmit (paper/author 写入后入队主动推送)
	plat.seoService.SetPushSubmitter(plat.seoSubmitService)

	// 注:原「usageLog → hotContent(记录热门内容)」接线已随 usagelog 下线移除(该钩子自 v2 起从不触发)。
	// 热度统计现走 hotcontent 自己的服务端 + 前端 sendBeacon 双路径。

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

	// cleanup → 升级满血待兑现补偿(R6:删锚遇 Redis 抖动失败后,Redis 恢复时补删锚)。
	cleanupService.SetPendingRefillReconciler(plat.vipService.ReconcilePendingRefills)

	// cleanup → 会员到期后的额度窗口对齐(2026-08-02 计费审计 P1-2:窗口 used 跨档继承,
	// 到期回落 free 后免费额度恒为 0、开了 autopay 的每次调用还会 100% 从经费实扣)。
	cleanupService.SetExpiredMembershipWindowRealigner(plat.vipService.RealignExpiredMembershipWindows)

	// cleanup → 额度窗口 Redis↔MySQL 副本的漂移对账 + 保留期清扫(0103)。
	// 对账那条**不是为了修数据**(它只读只告警),是为了让恢复路径依赖的那份副本平时就被验证 ——
	// 副本没写进去这件事,不该等到 Redis 真丢数据那天才被发现。
	cleanupService.SetQuotaWindowMaintainers(
		plat.vipService.ReconcileQuotaWindowDrift,
		plat.vipService.ReconcileQuotaWindowOrphans,
		plat.vipService.PurgeOldQuotaWindows,
	)

	// 依赖全部注入完成,启动后台清理 + 对账任务。
	cleanupService.Start()

	// 额度窗口 used 快照刷盘器(0103)。stop 走 main 的关停序列同步刷最后一批。
	stopQuotaPersist := plat.vipService.StartQuotaPersistence()

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

	// ---- 限时领取会员推广(开关 / 微信客服二维码 / 文案)----
	promoHandler := promo.NewHandler(promo.NewService(promo.NewRepository(db)))

	// ---- 邀请注册(一人一码 + 落地页打开计数 + 新用户归因)----
	// 归因接线(方案 A,ctx 贯穿):routes.go 的 InviteCodeMiddleware 把 X-Invite-Code
	// 写进请求 ctx;user 各注册成功路径(事务提交后)经包级钩子回调到 invite.Service
	// 取码落归因。nil 安全 + best-effort:归因失败只 slog,绝不影响注册返回。
	inviteService := invite.NewService(invite.NewRepository(db))
	user.SetInviteAttributor(inviteService.AttributeFromContext)
	// 邀请奖励(0100)两个 seam:配置实时读 billing_config 两旋钮(经 ConfigService 带缓存,
	// admin 改完 ≤30s 生效);发放走 vip 入账唯一落点 GrantInviteReward(GrantPerm + 站内信)。
	// invite 包不 import vip,依赖方向由 bootstrap 单向组装;不接线 = 奖励整体关闭(nil 安全)。
	inviteService.SetRewardConfigProvider(func() (int, int) {
		c := plat.vipService.Config().Get()
		return c.InviteRewardCredits, c.InviteRewardDailyCap
	})
	inviteService.SetRewardGranter(plat.vipService.GrantInviteReward)
	inviteHandler := invite.NewHandler(inviteService)

	// ---- 情报(学术新闻):上游 webhook 接收/落库 + 公开读 + admin 配置 ----
	newsService := news.NewService(news.NewRepository(db))
	newsHandler := news.NewHandler(newsService)
	// 情报详情/列表页 /news SSR 元数据(NewsArticle JSON-LD + 全文 noscript;功能关闭时 provider 返回 nil)
	core.configHandler.SetNewsSEOProvider(newsService)
	// 情报内容首发/更新 → 主动推送该 URL 入收录队列(freshness 闭环;队列未启用时 no-op)
	newsService.SetPushSubmitter(plat.seoSubmitService)
	// sitemap 索引里 /sitemap-news.xml 的 <lastmod> 反映最新情报(否则静态常量,新情报不及时重抓)
	plat.seoHandler.SetNewsLastModProvider(newsService.SitemapMaxLastMod)

	// message + email → vip（充值/订阅/续期/升级/兑换 成功后发站内信 + 邮件;统一品牌邮件模板）
	plat.vipService.SetNotifier(plat.message.GetAdapter(), core.configService)

	// 付费成功 → 飞书群客服消息(仅支付回调真正到账时触发,创建订单不触发;事件开关在后台,默认开)
	plat.vipService.SetPaymentNotifier(func(ord *vip.Order) {
		notice := supportcenter.PaymentNotice{
			OrderType: ord.OrderType,
			SubAction: ord.SubAction,
			OrderNo:   ord.OrderNo,
			PlanCode:  ord.PlanCode,
			Amount:    ord.FinalAmount,
			Credits:   ord.CreditsGranted,
			Method:    ord.PaymentMethod,
		}
		if u, err := core.userService.FindByID(ord.UserID); err == nil && u != nil {
			if u.Username != nil {
				notice.Username = *u.Username
			}
			if u.Email != nil {
				notice.Email = *u.Email
			}
		}
		supportCenterService.NotifyPayment(notice)
	})

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
	// 主 sitemap 索引直接列出各工具分片 /sitemap-tools-N.xml(扁平化,避免索引套索引)
	plat.seoHandler.SetToolSitemapProvider(featureToolSvc.SitemapPages)

	// SEO 完整性回填(H1 论文摘要批量回填 + M2 冷门 URL 现拉落库)。
	// 默认关闭 —— 设 SEO_ENRICH_ENABLED=true 才消耗 minicod 配额;关闭时冷门 URL 仍由 M1 打 noindex 兜底。
	if os.Getenv("SEO_ENRICH_ENABLED") == "true" {
		seoEnricher := seoenrich.New(aiB.minicodManager, plat.seoService, seoenrich.Config{Enabled: true})
		core.configHandler.SetPaperEnricher(seoEnricher)  // M2 论文 on-miss
		core.configHandler.SetAuthorEnricher(seoEnricher) // M2 作者 on-miss
		safego.Go("seo-enrich-backfill", func() { seoEnricher.Start(context.Background()) })
	}

	// 文献集只读 Reader —— claw / smart-search / prism 的「引用文献」共用同一个
	// (2026-07-14 三 feature 输入框统一, 实现见 internal/agentattach)。
	libReader := library.NewReader(db)

	// 智能写作 (Prism) handler —— 提前构造以注入功能使用统计录入器(同 peerReview/claw)。
	// 项目自动起名已移到 agent 容器(agent 用前端带的 titleSeed 生成标题经 session_title_updated 帧回传,
	// backend 经 prismFeature.OnTitleResult→handleAgentTitle 落库),故 NewService 不再要 ai.Service。
	prismService := prism.NewService(
		prism.NewRepository(db),
		prism.NewTexClient(os.Getenv("PRISM_WORK_DIR")),
		storage.PrismBucket(),
		prismFeature,
		// C3 修复:必须传 feature-routed client(prismFeature.AgentClient()→clientForFeature("prism")),
		// 否则 prism 切到 executor 后,会话创建/稿件物化/回读走 fork、聊天走 executor → 文件系统脑裂、零改动落库。
		prismFeature.AgentClient(),
	)
	prism.SetTitleSink(prismService)            // agent 回传标题落库的反查入口(见 handleAgentTitle)
	prism.SetProfileSink(prismService)          // 写作画像 provider(Phase 2):hub seed 按 sessionID 注入 base 人格
	prism.SetModelResolver(modelCatalogService) // planner 选择轮按 prism.planner 绑定取便宜模型(P1)
	prismService.StartBackgroundGC()            // 编译产物 GC(评审 #7):回收旧 prism_compiles 行 + pdf/log MinIO 对象
	prismHandler := prism.NewHandler(prismService)
	prismHandler.SetUsageStatRecorder(plat.usageStatService)
	// 输入框附件(上传 / 引用文献)—— prism 会话 per-project, handler 自己解析会话后走
	// agentattach 的 *ToSession 直通入口, 故 resolveEmpty 传 nil(不会被用到)。
	prismHandler.SetAttach(
		agentattach.NewUploader(prismFeature, nil).WithSubdir("uploads"),
		agentattach.NewReferencer(prismFeature, libReader, nil),
	)

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
			modelCatalog:   modelcatalog.NewHandler(modelCatalogService),
			smartSearch:    smartsearch.NewHandler(smartSearchFeature, libReader),
			peerReview:     peerReviewHandler,
			memory:         usermemory.NewHandler(userMemoryService),
			openAccess:     openaccess.NewHandler(),
			claw:           claw.NewHandler(clawFeature, agentartifact.NewRepository(db), libReader),
			// 🔴 构造即接线:上面 routes_user.go 的 Run 路由有 `if h.agentRun != nil` 守卫,
			//    这里不填就是"路由代码在仓库里、生产上不存在" —— 本仓库咬过七次的形状。
			agentRun:    agentrun.NewHandler(runEngine, agentrun.NewRepo(db), clawFeature),
			boltSlides:  boltslides.NewHandler(boltSlidesFeature, agentartifact.NewRepository(db)),
			sciDraw:     scidraw.NewHandler(sciDrawFeature, agentartifact.NewRepository(db)),
			skillMarket: skillMarketHandler,
			featureTool: featureToolHandler,
			agentBridge: agentBridge, // 内网回调端点: agent 上报带外 token 用量 (title-gen 等)
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
			promo:         promoHandler,
			news:          newsHandler,
			invite:        inviteHandler,
		},
		userService:          core.userService,
		cleanupService:       cleanupService,
		thirdPartyService:    aiB.thirdPartyService,
		seoService:           plat.seoService,
		seoSubmitService:     plat.seoSubmitService,
		wsHub:                plat.wsHub,
		supportCenterService: supportCenterService,
		agentBridge:          agentBridge,
		stopQuotaPersist:     stopQuotaPersist,
	}
}
