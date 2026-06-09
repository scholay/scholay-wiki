// ============================================================================
// Scholay 智能助手 (Claw) — FeatureSpec
//
// 与 smart_search 的差异:
//   smart_search 是受限的"找论文"机器人, 只允许 mcp__minicod__*, 强约束输出格式;
//   Claw 是通用研究助手 — 用户可以问任何科研问题、上传 PDF/图片、让它做总结/
//   解释/翻译/写作建议, 同时也能调 mcp__minicod__* 查文献期刊。
//
// prompt 演进:
//   v3 曾把 systemPrompt 从 Go const 迁到 feature_prompts 表 (走 BySlugPicker), 让 admin
//   后台不重启改 prompt。后又决定: 这类"单条简单提示词"不必用 DB 表, 统一回到代码静态管理
//   (internal/prompts), 复杂逻辑交给 skills。故现在 systemPrompt = prompts.ClawSystemPrompt
//   const, 通过 agentbridge.StaticPicker 注入, 不再依赖 promptregistry / feature_prompts。
//   代价: 改 prompt = 改代码 + 重新部署 (无 admin 热改 / 版本回滚)。
// ============================================================================

package claw

import (
	"context"
	"errors"

	"scholar-backend/internal/agentbridge"
	"scholar-backend/internal/llmusage"
	"scholar-backend/internal/prompts"
	"scholar-backend/internal/usagestat"
	"scholar-backend/internal/vip"
)

const FeatureKey = "claw"
const agentName = "scholay-claw"

// PromptSlug / PromptName — 仅作 PromptChoice 的元信息标签 (审计 / 日志展示);
// 已不再对应任何 DB 行。
const PromptSlug = "scholay-claw-v1"
const PromptName = "Scholay 智能助手 · 默认 prompt"

// usageRecorder 由 SetUsageRecorder 注入; PreUserMessage 闭包在每次消息触发时
// **懒读取**这个 package var, 因此 SetUsageRecorder 不必赶在 BuildSpec 之前
// 调用 —— BuildSpec 拿到的是闭包, 闭包指向当前的 package var。
var usageRecorder usagestat.Recorder

// SetUsageRecorder 注入使用统计录入器 —— 用户每次"对话"(发 user_message)且通过
// 配额时记一条 claw / message。允许 nil 表示禁用。
func SetUsageRecorder(r usagestat.Recorder) {
	usageRecorder = r
}

// llmUsageRecorder 由 SetLLMUsageRecorder 注入; onMessageComplete 每轮 message_complete
// 时懒读取, 落 token 账本 (llm_token_usage, source=agent)。
var llmUsageRecorder llmusage.Recorder

// SetLLMUsageRecorder 注入统一 LLM token 账本录入器。允许 nil 禁用 (只 slog 不落库)。
func SetLLMUsageRecorder(r llmusage.Recorder) {
	llmUsageRecorder = r
}

// onMessageComplete 每轮 agent 回复结束触发: ① slog (live grep) ② 落 token 账本。
// 懒读 llmUsageRecorder, 因此 SetLLMUsageRecorder 与 BuildSpec 调用顺序无关。
func onMessageComplete(ctx context.Context, userID uint, usage agentbridge.AgentUsage) {
	agentbridge.NewSlogUsageRecorder(FeatureKey)(ctx, userID, usage)
	if llmUsageRecorder != nil {
		agentbridge.NewDBUsageRecorder(FeatureKey, llmUsageRecorder)(ctx, userID, usage)
	}
}

// vipChecker 由 SetVIPChecker 注入(bootstrap)—— 按用户等级(free/pro)做 tier-aware 日额度。
// vip.Service 自带「未配额→不限额 + Redis 挂→fail-open」,故无需再保留旧的 env 日额度回落。
var vipChecker *vip.Service

// SetVIPChecker 注入会员限额服务。允许 nil(不限额)。
func SetVIPChecker(v *vip.Service) { vipChecker = v }

// preUserMessageChain 把配额检查 + 功能使用统计组合成一个 PreUserMessageFn:
//   1. 先查 vip 配额, 超额直接 error 出去, 后续不记 (不是真正的"使用")
//   2. 配额过了 → 记一条 usage_events (claw/message), userID 必填
//
// 闭包结构保证 usageRecorder/vipChecker 是**调用时**读取 (而不是注册时), 所以
// BuildSpec 可以在 SetUsageRecorder/SetVIPChecker 之前调用, 顺序无关。
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
		usageRecorder.Record(usagestat.Event{
			UserID:  uid,
			Feature: usagestat.FeatureClaw,
			Action:  "message",
		})
	}
	return nil
}

// BuildSpec 构造 claw 的 FeatureSpec。
//
// 关键选择:
//   - InjectPromptOnFirstMsg=true: agent 默认 prompt 强, 我们的助手身份要在每个
//     首条消息前覆盖一次 (与 smart_search 一致); 否则 agent 可能不知道自己在
//     Scholay 平台、不知道有 Minicod MCP 可用。
//   - AutoApprovePermission=true: Minicod MCP 全是只读检索, 自动批准让用户体验
//     流畅; 后续如果允许 agent 写代码 / 改文件再调整。
func BuildSpec() agentbridge.FeatureSpec {
	return agentbridge.FeatureSpec{
		Key:                    FeatureKey,
		AgentName:              agentName,
		Description:            "Scholay 智能助手:基于 Minicod MCP 的科研对话助手, 支持上传文件 / 图片",
		Picker:                 agentbridge.NewStaticPicker(FeatureKey, PromptSlug, PromptName, prompts.ClawSystemPrompt),
		Color:                  "purple",
		InjectPromptOnFirstMsg: true,
		AutoApprovePermission:  true,
		PreUserMessage:         preUserMessageChain,
		OnMessageComplete:      onMessageComplete,
	}
}
