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

// prism 会话禁用的工具:起子 agent(Task/Agent 旁路裁决)/ NotebookEdit。
// 放开 Read/Glob/Grep + Write/Edit —— agent 在会话 cwd 里原生读写,写被 decidePermission
// 限定在 cwd 内(越界拒)。仍可用 mcp__minicod__*。Skill 未禁用 → 可加载下方写作 skill。
// (V3 勘误:执行器 builtin 无 MultiEdit,此前注释与实现漂移;Read 已支持 offset/limit 局部读。)
// C1 (2026-06): Bash 三件套(Bash/BashOutput/KillShell)由 prismSessionOptions 经
// agentbridge.SessionDisallowedTools(allowBash=false) 统一补齐,这里只列「非 Bash」的额外禁用项。
var prismDisallowedTools = []string{"NotebookEdit", "Task", "Agent"}

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
		// allowBash=false → 在 prismDisallowedTools 基础上并入 Bash/BashOutput/KillShell。
		DisallowedTools: agentbridge.SessionDisallowedTools(prismDisallowedTools, false),
		// 每项目会话加载写作 skill(--add-dir),agent 写/改时可经 Skill 调对应指南。
		AddDirs: []string{prismSkillAddDir()},
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
	// SS#2:有界透支版起点闸 —— 跨过日上限那轮总能起跑,只有透支带也用完才拦。
	if err := vipChecker.CheckDailyQuotaOverdraft(ctx, userID); err != nil {
		if errors.Is(err, vip.ErrQuotaExceeded) {
			return agentbridge.NewQuotaError(err.Error())
		}
		return err
	}
	return nil
}

// budgetProvider(SS#2)给 hub 每轮盖「有界透支预算」用;懒读包级 vipChecker(可后于 BuildSpec 注入)。
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

		// C14: 审批轴 = auto。经 decidePermission 路径感知裁决:cwd 内文件操作放行,越界/Bash 等拒。
		// ⚠️ prism 的越界文件防护只在 decidePermission 里,绝不能改 passthrough(会让前端能批越界)。
		PermissionMode: agentbridge.PermissionAuto,
		PreUserMessage:         pre,
		OnMessageComplete:      onComplete,
		// SS#2:有界透支预算 —— hub 每轮盖章,执行器让 agent 自我配速 + 到界优雅收尾。
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
