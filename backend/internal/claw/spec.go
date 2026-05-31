// ============================================================================
// Scholay 智能助手 (Claw) — FeatureSpec
//
// 与 smart_search 的差异:
//   smart_search 是受限的"找论文"机器人, 只允许 mcp__minicod__*, 强约束输出格式;
//   Claw 是通用研究助手 — 用户可以问任何科研问题、上传 PDF/图片、让它做总结/
//   解释/翻译/写作建议, 同时也能调 mcp__minicod__* 查文献期刊。
//
// v3 演进:
//   systemPrompt 从 Go const 改为走 feature_prompts 表 (feature_key='claw',
//   slug=PromptSlug, persona='default'), 通过 agentbridge.BySlugPicker 解析;
//   admin 可在后台调 prompt 不重启。
// ============================================================================

package claw

import (
	"context"
	"os"
	"strconv"

	"scholar-backend/internal/agentbridge"
	"scholar-backend/internal/promptregistry"
	"scholar-backend/internal/usagelog"
)

const FeatureKey = "claw"
const agentName = "scholay-claw"

// PromptSlug — feature_prompts 表里这条 prompt 的 slug。
const PromptSlug = "scholay-claw-v1"

// defaultDailyMessageCap — 智能助手每用户每日 user_message 上限。
// 比 smart_search 的 30 略松, 因为它的对话深度更大 (用户会上传文件, 问长问题)。
const defaultDailyMessageCap = 50

func dailyMessageCapFromEnv() int {
	raw := os.Getenv("CLAW_DAILY_MESSAGES")
	if raw == "" {
		return defaultDailyMessageCap
	}
	n, err := strconv.Atoi(raw)
	if err != nil {
		return defaultDailyMessageCap
	}
	return n
}

// usageRecorder 由 SetUsageRecorder 注入; PreUserMessage 闭包在每次消息触发时
// **懒读取**这个 package var, 因此 SetUsageRecorder 不必赶在 BuildSpec 之前
// 调用 —— BuildSpec 拿到的是闭包, 闭包指向当前的 package var。
var usageRecorder usagelog.FeatureRecorder

// SetUsageRecorder 注入功能使用统计录入器 —— 用户每次"发消息"且通过配额时
// 记一条 claw / send_message 使用日志。允许 nil 表示禁用。
func SetUsageRecorder(r usagelog.FeatureRecorder) {
	usageRecorder = r
}

// quotaCap 在 init 时 eagerly 构造一次 (NewRedisDailyCap 是闭包工厂, 内部读 Redis,
// 状态不在内存里, 多次构造也只是多一个 caller 共享同一组 Redis key, 不影响正确性)。
var quotaCap = agentbridge.NewRedisDailyCap(FeatureKey, dailyMessageCapFromEnv())

// preUserMessageChain 把配额检查 + 功能使用统计组合成一个 PreUserMessageFn:
//   1. 先跑 quotaCap, 超额直接 error 出去, 后续不记 (不是真正的"使用")
//   2. 配额过了 → 记一条 usage_logs (claw/send_message), userID 必填
//
// 闭包结构保证 usageRecorder 是**调用时**读取 (而不是注册时), 所以
// BuildSpec 可以在 SetUsageRecorder 之前调用, 顺序无关。
func preUserMessageChain(ctx context.Context, userID uint, content string) error {
	if quotaCap != nil {
		if err := quotaCap(ctx, userID, content); err != nil {
			return err
		}
	}
	if usageRecorder != nil {
		uid := userID
		usageRecorder.Record(usagelog.FeatureUseEvent{
			UserID:      &uid,
			FeatureCode: usagelog.FeatureClaw,
			FeatureName: usagelog.FeatureNames[usagelog.FeatureClaw],
			Action:      "send_message",
		})
	}
	return nil
}

// BuildSpec 构造 claw 的 FeatureSpec。
// 必须在 bootstrap 阶段、promptregistry.Service 已初始化后调用。
//
// 关键选择:
//   - InjectPromptOnFirstMsg=true: agent 默认 prompt 强, 我们的助手身份要在每个
//     首条消息前覆盖一次 (与 smart_search 一致); 否则 agent 可能不知道自己在
//     Scholay 平台、不知道有 Minicod MCP 可用。
//   - AutoApprovePermission=true: Minicod MCP 全是只读检索, 自动批准让用户体验
//     流畅; 后续如果允许 agent 写代码 / 改文件再调整。
func BuildSpec(promptSvc *promptregistry.Service) agentbridge.FeatureSpec {
	return agentbridge.FeatureSpec{
		Key:                    FeatureKey,
		AgentName:              agentName,
		Description:            "Scholay 智能助手:基于 Minicod MCP 的科研对话助手, 支持上传文件 / 图片",
		Picker:                 agentbridge.NewBySlugPicker(promptSvc, FeatureKey, PromptSlug),
		Color:                  "purple",
		InjectPromptOnFirstMsg: true,
		AutoApprovePermission:  true,
		PreUserMessage:         preUserMessageChain,
		OnMessageComplete:      agentbridge.NewSlogUsageRecorder(FeatureKey),
	}
}
