// ============================================================================
// Scholay Prism —— agentbridge FeatureSpec(agent-native + 用户 WS 模式,2026-06)。
//
// AI 编辑走 **用户 WS**(HandleWS,同 claw/smart-search):前端持久连接,断线/重入自动续流。
// 每轮:前端先调 /round/prepare 铺源(DB current → 会话 cwd)→ 经 WS 发指令 → agent 用
// 原生 Read/Edit/Write 改 cwd(工具事件实时流式到前端驱动编辑器 diff)→ message_complete。
// 轮末**不自动落库**;前端看 diff 后 /round/apply(固化 cwd→DB)或 /round/reject(重铺源还原)。
//
// agent-native 指令(让 agent 用工具改 cwd)做成**系统提示**(Picker 注入一次)。
// 工具:放开 Write/Edit/MultiEdit(写被 decidePermission 路径限定在会话 cwd,越界拒——与
// claw 同套已验证围栏);继续禁 Bash/Task/Agent/NotebookEdit。配额走 vip(PreUserMessage),
// token 用量走 OnMessageComplete(slog + llm_token_usage,source=agent)。
// ============================================================================

package prism

import (
	"context"
	"errors"
	"os"
	"strings"

	"scholar-backend/internal/agent"
	"scholar-backend/internal/agentbridge"
	"scholar-backend/internal/usagestat"
	"scholar-backend/internal/vip"
)

const FeatureKey = "prism"
const agentName = "scholay-prism"

// PromptSlug / PromptName 仅作 PromptChoice 元信息标签(审计/日志),不对应 DB 行。
const PromptSlug = "scholay-prism-v1"
const PromptName = "Scholay 智能写作 · 默认 prompt"

// prism 会话禁用的工具:起子 agent(Task/Agent 旁路裁决)/ NotebookEdit / ExportDocument。
// 放开 Read/Glob/Grep + Write/Edit —— agent 在会话 cwd 里原生读写,写被 decidePermission
// 限定在 cwd 内(越界拒)。仍可用 mcp__minicod__*。Skill 未禁用 → 可加载下方写作 skill。
// (V3 勘误:执行器 builtin 无 MultiEdit,此前注释与实现漂移;Read 已支持 offset/limit 局部读。)
// C1 (2026-06): Bash 三件套(Bash/BashOutput/KillShell)由 prismSessionOptions 经
// agentbridge.SessionDisallowedTools(allowBash=false) 统一补齐,这里只列「非 Bash」的额外禁用项。
// P0-4 (2026-07): 禁 ExportDocument —— 它强制写 ./out/ 并对用户宣告「已交付下载区」,但 prism
// 无产物收割/渲染(交付走工具栏「导出 Word/PDF」按钮 + 后端 DB 真源),agent 调它=产物永久拿不到
// 且绕过 struct 真源出劣质 docx(见 docs/research/prism-streaming-2026-07)。ReadDocument 保留
// (agent 要能读用户上传的 PDF/docx)。
// 注:AskUserQuestion(交互提问)P1 起对 prism 放开(写作场景澄清需求很自然,前端已接 usePrismChat +
// QuestionPrompt),故**不**列入禁用。见 docs/research/ask-mode-2026-07。
// 🔴 2026-08-08 加 StatRun/StatReport:builtin 走 deny-list ⇒ 新增 builtin 默认被所有老 feature
// 继承。统计计算属于 stat_lab,prism 是写作 feature,不该顺手拿到整个 statkit 面
// (backend permissionAllowed 对二者是无条件放行,没有第二道闸)。
var prismDisallowedTools = []string{"NotebookEdit", "Task", "Agent", "ExportDocument", "StatRun", "StatReport"}

// prismAllowedMcpTools —— prism(智能写作)对 minicod MCP 的**正向白名单**(去 mcp__minicod__ 前缀原始名)。
// prism 用检索做「引用接地」(真实 BibTeX / DOI 解析 / 片段引用)与「投稿目标期刊 + 模板」,不做泛检索。
// 故只放论文解引用 + 片段接地 + 期刊投稿一套,收敛掉 minicod 0.4.1 的 76 工具其余部分(见对齐审计 #2、#8、#19)。
var prismAllowedMcpTools = []string{
	// 论文解引用(引用接地:标题→DOI→单篇,批量水合参考文献)
	"search_papers", "get_paper", "get_paper_by_doi", "match_paper",
	"get_paper_references", "get_paper_citations", "get_papers_batch",
	// 作者近作
	"search_authors", "get_author_papers",
	// 文献综述景观(wl-lit-synthesis 用:近邻 + 分桶统计 + 种子扩展)
	"get_related_works", "group_works", "recommend_from_pool",
	// 片段接地(反幻觉命门:可引用的原文片段)
	"search_snippets",
	// 投稿目标期刊 + 须知 + LaTeX 模板
	"search_journals", "get_journal", "get_journal_submission_guideline", "get_journal_submission_latex",
}

// prismSkillAddDir —— 传给 agent --add-dir 的目录(agent 加载 <dir>/.claude/skills:写作/学科/LaTeX 格式 skill)。
// 同 peerreview 的 reviewerSkillAddDir:独立目录,只有 prism 会话装,claw/审稿看不到。
func prismSkillAddDir() string {
	if d := strings.TrimSpace(os.Getenv("PRISM_SKILL_ADDDIR")); d != "" {
		return d
	}
	return "/prism-add"
}

// prismSessionOptions —— prism 会话创建的统一 per-session 配置(禁用工具 + 写作 skill 目录)。
// 单一真源: BuildSpec 和 edit.go 的 createProjectSession **都必须**用它。
// 历史 bug: createProjectSession 曾手搓 options 只填 DisallowedTools、漏了 AddDirs,
// 导致每个 prism 会话都不挂写作 skill,agent 调 Skill 一律 "Unknown skill: prism-*"。
// 走同一个构造器后,两处不会再漂移。
func prismSessionOptions() *agent.CreateSessionOptions {
	return &agent.CreateSessionOptions{
		// 2026-08-01 拍板放开 Bash(allowBash=true → 不再并入 Bash/BashOutput/KillShell)。
		//
		// 为什么现在可以:**与 claw 对齐**。claw 早已 AllowBash=true(claw/spec.go:191),
		// 而两者跑在**同一个 bwrap jail、同一套沙箱配置**(net 设置在 agent/src/server/ws.ts:473
		// 硬编码,不分 feature)。也就是说放开 prism 不引入任何**新的**风险类别,
		// 只是把一个已在生产敞着的面多暴露给一个 feature。
		//
		// 放开前做过真实 jail 内取证(用生产同一条 buildBwrapArgv 构造,非裸 docker exec):
		//   ✅ 跨会话:别的会话 cwd 物理上不在 mount 命名空间里,读不到
		//   ✅ 只读根:/usr /bin /lib 只读;/etc 与 / 是 bwrap 每次新建的 tmpfs,写了也不跨调用持久
		//   ✅ 宿主敏感文件:/proc/1/environ、/root/.ssh 读不到
		//   ⚠️ 内网:scholar_backend:8080 可达(mysql/redis/minio 不在同一 docker 网络,DNS 都解析不出)。
		//      **这是全 feature 的既有议题**(claw 今天就是这个状态),不是 prism 的前置条件 ——
		//      要收紧得改 ws.ts 的 net 策略或加出站白名单,那是独立一项,别在这里悄悄用「不放开 prism」代偿。
		//
		// prism 独有的担心已排除:Bash 写 document.md **不是绕过 struct 真源的后门** ——
		// document.md 本就是设计给模型的编辑面(edit.go:201),applyStructRound 会读它回来经
		// parseEditorMarkdown 合并进 DB 真源(struct_service.go:295)。Bash 与 Write/Edit 走同一道门。
		//
		// ⚠️ ExportDocument 仍在 prismDisallowedTools 里(理由见上),放开 Bash 不改变那条。
		DisallowedTools: agentbridge.SessionDisallowedTools(prismDisallowedTools, true),
		// MCP 正向白名单:收敛 minicod 76 工具到 prism 引用接地 + 投稿期刊子集(见 prismAllowedMcpTools)。
		AllowedMcpTools: prismAllowedMcpTools,
		// 每项目会话加载写作 skill(--add-dir),agent 写/改时可经 Skill 调对应指南。
		AddDirs: []string{prismSkillAddDir()},
		// 2026-07 线上审计 #4:prism 开诚实性核验(claw 同款旗标,见 claw/spec.go;
		// 经 CreateSession body + hub seed_history 帧两条链下发)。delivery 维度**关**:
		// prism 交付走项目文件(DB 真源 + 导出按钮),executor 的 ./out/ 判据会误报
		// (agent 侧 verifyClaims 注释有预留);citations / fullread 开。
		// 急停阀同 claw:agent env EXECUTOR_HONESTY_GUARD=off(免 rebuild)。
		HonestyGuard:  true,
		HonestyChecks: map[string]bool{"citations": true, "fullread": true, "delivery": false},
	}
}

// profileSink 由 SetProfileSink 注入(= *Service):BuildSpec 早于 NewService 构造,故写作画像 provider
// 走包级 sink 后绑(同 OnTitleResult/titleSink 模式)。sessionProfileBlock 在**调用时**懒读,顺序无关。
type profileProvider interface {
	SessionProfileBlock(ctx context.Context, sessionID string) string
}

var profileSink profileProvider

// SetProfileSink 注入写作画像 provider(bootstrap 在 NewService 后调)。允许 nil(不注入画像)。
func SetProfileSink(p profileProvider) { profileSink = p }

// sessionProfileBlock —— FeatureSpec.SessionProfile 的包级适配:hub seed 时按 sessionID 现算画像 in-band 块。
func sessionProfileBlock(ctx context.Context, sessionID string) string {
	if profileSink == nil {
		return ""
	}
	return profileSink.SessionProfileBlock(ctx, sessionID)
}

// vipChecker 由 SetVIPChecker 注入;PreUserMessage 在每轮前查会员配额。
var vipChecker *vip.Service

// SetVIPChecker 注入会员配额校验器。允许 nil(不限额)。
func SetVIPChecker(v *vip.Service) { vipChecker = v }

// VIPCheckerWired 报告配额校验器是否已注入。bootstrap 启动末尾据此断言付费功能已接线,
// 防「新增付费 feature 忘记调 SetVIPChecker → 静默免费(收入泄漏)」的回归。
func VIPCheckerWired() bool { return vipChecker != nil }

// modelResolver 由 SetModelResolver 注入(模型目录化 P1,与 vipChecker 同款手法)。
// planner 一次性选择轮按 prism.planner 绑定取便宜模型 —— 此前 modelID 传空串,serverside
// 不发 set_runtime_config → 跑 executor 默认主模型,纯选择任务白烧主档。允许 nil(不切模型)。
var modelResolver interface{ Resolve(purpose string) string }

// SetModelResolver 注入模型目录解析器(bootstrap 接 modelcatalog.Service)。
func SetModelResolver(r interface{ Resolve(purpose string) string }) { modelResolver = r }

// usageRecorder 由 SetUsageStatRecorder 注入(功能使用统计);preUserMessageChain 懒读。
var usageRecorder usagestat.Recorder

// SetUsageStatRecorder 注入功能使用统计录入器。允许 nil。
func SetUsageStatRecorder(r usagestat.Recorder) { usageRecorder = r }

// checkQuota / recordQuestion 是给 agentbridge.StandardHooks 的适配闭包(每轮提问前):
// checkQuota 查 vip 配额(超额转 quota_exceeded 干净文案);recordQuestion 记一条功能使用统计。
// 闭包在**调用时**懒读包级 vipChecker/usageRecorder,故注入可后于 BuildSpec,顺序无关。
func checkQuota(ctx context.Context, userID uint) error {
	if vipChecker == nil {
		return nil
	}
	// 起点闸:窗口额度一到上限即拦(透支带已于 2026-07-30 取消);已在跑的那一轮仍自然跑完。
	if err := vipChecker.CheckDailyQuotaOverdraft(ctx, userID); err != nil {
		if errors.Is(err, vip.ErrQuotaExceeded) {
			return agentbridge.NewQuotaErrorFrom(err) // 保链:error 帧带结构化 quota 字段
		}
		return err
	}
	return nil
}

// budgetProvider(SS#2)给 hub 每轮盖「单轮预算」用;懒读包级 vipChecker(可后于 BuildSpec 注入)。
func budgetProvider(ctx context.Context, userID uint) (soft, hard int64, unlimited bool) {
	if vipChecker == nil {
		return 0, 0, true
	}
	return vipChecker.RemainingBudget(ctx, userID)
}

func recordQuestion(uid *uint) {
	if usageRecorder == nil {
		return
	}
	usageRecorder.Record(usagestat.Event{UserID: uid, Feature: usagestat.FeaturePrism, Action: "edit"})
}

// BuildSpec 返回 Prism 的 agentbridge FeatureSpec(用户 WS 模式)。
func BuildSpec() agentbridge.FeatureSpec {
	pre, onComplete := agentbridge.StandardHooks(agentbridge.StandardHooksConfig{
		FeatureKey:     FeatureKey,
		CheckQuota:     checkQuota,
		RecordQuestion: recordQuestion,
	})
	return agentbridge.FeatureSpec{
		Key:                    FeatureKey,
		AgentName:              agentName,
		Description:            "Scholay 智能写作 (Prism) — LaTeX 论文 agent-native 编辑助手",
		Picker:                 agentbridge.NewStaticPicker(FeatureKey, PromptSlug, PromptName, agentNativeProtocol),
		Color:                  "amber",
		InjectPromptOnFirstMsg: true, // agent 默认带全工具,首条注入 agent-native 系统提示强约束
		// 默认模型走 chat_default.prism 能力绑定(admin 模型目录页可改;迁移初值=主档)。

		// C14: 审批轴 = auto。经 decidePermission 路径感知裁决:cwd 内文件操作放行,越界拒。
		// ⚠️ prism 的越界文件防护只在 decidePermission 里,绝不能改 passthrough(会让前端能批越界)。
		PermissionMode: agentbridge.PermissionAuto,
		// 🔴 2026-08-08 补:能力轴 Bash 此前是**半边接线** —— prismSessionOptions 里
		//    SessionDisallowedTools(prismDisallowedTools, /*allowBash=*/true) 把 Bash 从 agent 侧
		//    denylist 拿掉了(2026-08-01),模型每轮都在 tools[] 里看得见 Bash;但这里的
		//    AllowBash 取零值 false ⇒ specDeny() 又把 bashTools 塞回 backend 权限门的 denyTools
		//    ⇒ decidePermission 顶部命中 denylist 直接拒。线上 48/48 次 prism Bash 调用 100% 失败
		//    (43 次 "permission denied: Bash"、5 次改动前的 "tool not permitted: Bash"),
		//    2026-08-07 16:54 仍在发生,且只打 INFO 日志、没有任何红灯。
		//    AllowBash 是这条能力的**单一真源**(spec.go:258),两个消费者必须同时改。
		AllowBash: true,
		PreUserMessage:         pre,
		OnMessageComplete:      onComplete,
		// SS#2:单轮预算 —— hub 每轮盖章,执行器让 agent 自我配速 + 到界优雅收尾。
		BudgetProvider: budgetProvider,
		// 项目名真源在 prism_projects.title(非 agent jsonl):agent 用前端带的 titleSeed 生成标题后,
		// backend 经此回调落库(见 handleAgentTitle / autoname.go)。
		OnTitleResult: handleAgentTitle,
		// Phase 2:项目级写作画像(base 文体/学科人格)—— hub seed 时按 sessionID 现算 in-band 块。
		SessionProfile: sessionProfileBlock,
		// 与 edit.go createProjectSession 共用同一构造器(单一真源,见 prismSessionOptions)。
		SessionOptions: prismSessionOptions(),
	}
}
