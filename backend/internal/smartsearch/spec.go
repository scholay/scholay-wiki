// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

// Package smartsearch 是 scholay 智能搜索 feature 的 thin wrapper:
// 把 agentbridge.FeatureSpec 声明出来 + 把 gin 路由绑到 agentbridge.FeatureBridge 上。
// 业务逻辑 (session 生命周期 / WS 桥接 / 心跳 / system prompt 注入) 都在 agentbridge,
// 本包只做 "这个 feature 长这样" 的声明 + 极薄的 HTTP 翻译层。
//
// prompt 演进:
//   原本 systemPrompt 是 Go const 写死在本文件; v3 一度迁到 feature_prompts 表 (走
//   BySlugPicker) 以支持 admin 热改。后又决定这类"单条简单提示词"不必用 DB 表, 回到代码
//   静态管理 (internal/prompts), 复杂逻辑交给 skills。现 systemPrompt = prompts.
//   SmartSearchSystemPrompt const, 通过 agentbridge.StaticPicker 注入, 不再走 promptregistry。
//   代价: 改 prompt = 改代码 + 重新部署。
package smartsearch

import (
	"context"
	"errors"

	"scholar-backend/internal/agent"
	"scholar-backend/internal/agentbridge"
	"scholar-backend/internal/prompts"
	"scholar-backend/internal/usagestat"
	"scholar-backend/internal/vip"
)

// FeatureKey 是 agent_sessions.feature_key 的取值, 也用作路由前缀的语义标签,
// 同时是 feature_prompts.feature_key 的取值。
// 改动会让 (1) 历史 mapping 失效 (用户拿不回上轮对话), (2) feature_prompts 表里
// 的种子 row 找不到对应 prompt, 慎改。
const FeatureKey = "smart_search"

// agentName 是 agent 容器内 ~/.claude/agents/scholay-smart-search.yaml 对应的
// subagent。bootstrap 时会 UpsertSkill 推一份当前 prompt 过去, 即便目前主流路
// 还是创建主 agent + WS 注入 prefix。
const agentName = "scholay-smart-search"

// PromptSlug / PromptName — 仅作 PromptChoice 的元信息标签 (审计 / 日志展示);
// 已不再对应任何 DB 行 (prompt 内容是 prompts.SmartSearchSystemPrompt const)。
const PromptSlug = "scholay-smart-search-v1"
const PromptName = "Scholay 文献智能搜索 · 默认 prompt"

// usageRecorder 由 SetUsageRecorder 注入; preUserMessageChain 每次提问时懒读取。
var usageRecorder usagestat.Recorder

// SetUsageRecorder 注入使用统计录入器 —— 用户每次"提问"(发 user_message)且通过
// 配额时记一条 smart_search / question。允许 nil 禁用。
func SetUsageRecorder(r usagestat.Recorder) {
	usageRecorder = r
}

// vipChecker 由 SetVIPChecker 注入(bootstrap)—— 按用户等级(free/pro)做 tier-aware 日额度。
// vip.Service 自带「未配额→不限额 + Redis 挂→fail-open」,故无需再保留旧的 env 日额度回落。
var vipChecker *vip.Service

// SetVIPChecker 注入会员限额服务。允许 nil(不限额)。
func SetVIPChecker(v *vip.Service) { vipChecker = v }

// VIPCheckerWired 报告配额校验器是否已注入。bootstrap 启动末尾据此断言付费功能已接线,
// 防「新增付费 feature 忘记调 SetVIPChecker → 静默免费(收入泄漏)」的回归。
func VIPCheckerWired() bool { return vipChecker != nil }

// checkQuota / recordQuestion 是给 agentbridge.StandardHooks 的适配闭包:
// 闭包结构保证 vipChecker/usageRecorder 在**调用时**懒读包级 var(而非 BuildSpec 注册时),
// 故 SetVIPChecker/SetUsageRecorder 可后于 BuildSpec 调用,顺序无关。
func checkQuota(ctx context.Context, userID uint) error {
	if vipChecker == nil {
		return nil
	}
	// tier-aware 会员限额。vip.ErrQuotaExceeded → 转成 agentbridge 的 quota_exceeded(干净文案),
	// 让 WS pipe 回前端 code=quota_exceeded + retryable=false。
	if err := vipChecker.CheckDailyQuota(ctx, userID); err != nil {
		if errors.Is(err, vip.ErrQuotaExceeded) {
			return agentbridge.NewQuotaError(err.Error())
		}
		return err
	}
	return nil
}

func recordQuestion(uid *uint) {
	if usageRecorder == nil {
		return
	}
	usageRecorder.Record(usagestat.Event{
		UserID:  uid,
		Feature: usagestat.FeatureSmartSearch,
		Action:  "question",
	})
}

// BuildSpec 构造 smart_search 的 FeatureSpec。
func BuildSpec() agentbridge.FeatureSpec {
	pre, onComplete := agentbridge.StandardHooks(agentbridge.StandardHooksConfig{
		FeatureKey:     FeatureKey,
		CheckQuota:     checkQuota,
		RecordQuestion: recordQuestion,
	})
	return agentbridge.FeatureSpec{
		Key:                    FeatureKey,
		AgentName:              agentName,
		Description:            "Scholay 智能搜索:基于 Minicod MCP 的学术文献检索助手",
		Picker:                 agentbridge.NewStaticPicker(FeatureKey, PromptSlug, PromptName, prompts.SmartSearchSystemPrompt),
		Color:                  "green",
		InjectPromptOnFirstMsg: true, // 主 agent 默认带 Bash/Read, 必须强约束
		// C14: 审批轴 = auto (backend 自动裁决, 不透传前端)。只暴露 mcp__minicod__* 只读检索, 无破坏性操作。
		PermissionMode: agentbridge.PermissionAuto,
		// PingInterval: 0 → 走 agentbridge 默认 25s (< agent idleTimeout 60s)
		// C1 (2026-06): smart_search 是只读检索, 不需要 Bash。AllowBash 保持零值 false。
		// 显式把 Bash 三件套塞进 agent --disallowed-tools(纵深防御:agent 端工具池硬移除);
		// backend 门由 specDeny 据 AllowBash=false 另行补禁。
		SessionOptions: &agent.CreateSessionOptions{
			DisallowedTools: agentbridge.SessionDisallowedTools(nil, false),
		},
		// 配额检查 + 提问统计 + slog 用量 收口到 agentbridge.StandardHooks(三 feature 共用)。
		PreUserMessage:    pre,
		OnMessageComplete: onComplete,
	}
}
