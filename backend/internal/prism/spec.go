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
	"scholar-backend/internal/llmusage"
	"scholar-backend/internal/usagestat"
	"scholar-backend/internal/vip"
)

const FeatureKey = "prism"
const agentName = "scholay-prism"

// PromptSlug / PromptName 仅作 PromptChoice 元信息标签(审计/日志),不对应 DB 行。
const PromptSlug = "scholay-prism-v1"
const PromptName = "Scholay 智能写作 · 默认 prompt"

// prism 会话禁用的工具:跑命令(Bash 无法路径限定)/ 起子 agent(Task/Agent 旁路裁决)/ NotebookEdit。
// 放开 Read/Glob/Grep + Write/Edit/MultiEdit —— agent 在会话 cwd 里原生读写,写被 decidePermission
// 限定在 cwd 内(越界拒)。仍可用 mcp__minicod__*。Skill 未禁用 → 可加载下方写作 skill。
var prismDisallowedTools = []string{"Bash", "NotebookEdit", "Task", "Agent"}

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
		DisallowedTools: prismDisallowedTools,
		// 每项目会话加载写作 skill(--add-dir),agent 写/改时可经 Skill 调对应指南。
		AddDirs: []string{prismSkillAddDir()},
	}
}

// vipChecker 由 SetVIPChecker 注入;PreUserMessage 在每轮前查会员配额。
var vipChecker *vip.Service

// SetVIPChecker 注入会员配额校验器。允许 nil(不限额)。
func SetVIPChecker(v *vip.Service) { vipChecker = v }

// usageRecorder 由 SetUsageStatRecorder 注入(功能使用统计);preUserMessageChain 懒读。
var usageRecorder usagestat.Recorder

// SetUsageStatRecorder 注入功能使用统计录入器。允许 nil。
func SetUsageStatRecorder(r usagestat.Recorder) { usageRecorder = r }

// llmUsageRecorder 由 SetLLMUsageRecorder 注入(token 账本);onMessageComplete 懒读。
var llmUsageRecorder llmusage.Recorder

// SetLLMUsageRecorder 注入统一 LLM token 账本录入器。允许 nil(只 slog 不落库)。
func SetLLMUsageRecorder(r llmusage.Recorder) { llmUsageRecorder = r }

// preUserMessageChain:每轮提问前查 vip 配额(超额转 quota_exceeded 干净文案)+ 记一条功能使用统计。
func preUserMessageChain(ctx context.Context, userID uint, _ string) error {
	if vipChecker != nil {
		if err := vipChecker.CheckDailyQuota(ctx, userID); err != nil {
			if errors.Is(err, vip.ErrQuotaExceeded) {
				return agentbridge.NewQuotaError(err.Error())
			}
			return err
		}
	}
	if usageRecorder != nil {
		var uid *uint
		if userID != 0 {
			u := userID
			uid = &u
		}
		usageRecorder.Record(usagestat.Event{UserID: uid, Feature: usagestat.FeaturePrism, Action: "edit"})
	}
	return nil
}

// onMessageComplete 每轮 agent 回复结束:① slog(docker logs | grep agent_usage)② 落 token 账本。
func onMessageComplete(ctx context.Context, userID uint, usage agentbridge.AgentUsage) {
	agentbridge.NewSlogUsageRecorder(FeatureKey)(ctx, userID, usage)
	if llmUsageRecorder != nil {
		agentbridge.NewDBUsageRecorder(FeatureKey, llmUsageRecorder)(ctx, userID, usage)
	}
}

// BuildSpec 返回 Prism 的 agentbridge FeatureSpec(用户 WS 模式)。
func BuildSpec() agentbridge.FeatureSpec {
	return agentbridge.FeatureSpec{
		Key:                    FeatureKey,
		AgentName:              agentName,
		Description:            "Scholay 智能写作 (Prism) — LaTeX 论文 agent-native 编辑助手",
		Picker:                 agentbridge.NewStaticPicker(FeatureKey, PromptSlug, PromptName, agentNativeProtocol),
		Color:                  "amber",
		InjectPromptOnFirstMsg: true, // agent 默认带全工具,首条注入 agent-native 系统提示强约束
		AutoApprovePermission:  true, // 经 decidePermission 路径感知裁决:cwd 内文件操作放行,越界/Bash 等拒
		PreUserMessage:         preUserMessageChain,
		OnMessageComplete:      onMessageComplete,
		// 与 edit.go createProjectSession 共用同一构造器(单一真源,见 prismSessionOptions)。
		SessionOptions: prismSessionOptions(),
	}
}
