// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package agentbridge

import (
	"context"
	"errors"
	"log/slog"

	"scholar-backend/internal/llmusage"
)

// ErrQuotaExceeded 是 PreUserMessage 钩子达到日额时返回的语义化错误,
// pipe 据此回前端 code=quota_exceeded + retryable=false。
var ErrQuotaExceeded = errors.New("agentbridge: daily quota exceeded")

// NewQuotaError 构造一个「配额超限」错误:err.Error() 是给用户看的干净文案,
// 同时 errors.Is(err, ErrQuotaExceeded) 成立(classifyPreUserMessageError 据此回 quota_exceeded)。
// 给 vip 等外部配额来源用 —— 它们有自己的友好文案, 但想复用 WS 的 quota_exceeded 分类。
func NewQuotaError(msg string) error { return &quotaError{msg: msg} }

type quotaError struct{ msg string }

func (e *quotaError) Error() string { return e.msg }
func (e *quotaError) Unwrap() error { return ErrQuotaExceeded }

// NewSlogUsageRecorder 返回一个 OnMessageComplete 钩子: 把每轮 usage 打到 slog,
// 标签 "agent_usage=1" 方便 grep / 切到日志聚合工具时按 label 过滤。
//
// 这是三 WS feature (smart_search/claw/prism) 的 OnMessageComplete 唯一在用的钩子;刻意**只 slog
// 不落库** —— token 账本由 agent per-call 内网回调统一记 (见 recordAgentTokens / internal_handler.go),
// 此处再落会与 per-call 双计。
func NewSlogUsageRecorder(featureKey string) OnMessageCompleteFn {
	return func(_ context.Context, userID uint, usage AgentUsage) {
		slog.Info("agent_usage",
			"agent_usage", 1, // 固定标签字段, 便于 docker logs | grep
			"feature", featureKey,
			"user_id", userID,
			"input_tokens", usage.InputTokens,
			"output_tokens", usage.OutputTokens,
			"cache_read_tokens", usage.CacheReadTokens,
			"cache_creation_tokens", usage.CacheCreationTokens,
		)
	}
}

// recordAgentTokens 是 **agent 侧 token 记账的唯一构造点** —— agent 内网回调
// (per-call agent_call / title_gen,见 internal_handler.go)经它落统一账本 llm_token_usage,
// 避免各自手搓 llmusage.Usage{} 漂移。
//
// requestID 用作 session/turn 关联键:per-call 回调传 agent sessionID(C7),server-side 传 ctx 关联键;
// WS OnMessageComplete 现已不落库(只 slog,见各 spec.go),故不在此列。
// Source 固定 agent、Provider 固定 "scholay-managed"(agent 上游 provider/model 由 agent_config
// 托管,backend 黑盒,不细分);rec==nil 跳过;userID==nil = 无归属(落 user_id=NULL)。
//
// 未来 per-user token 总额预算的「实际扣减」就接在这里(唯一 decrement 点),见设计 seam。
func recordAgentTokens(rec llmusage.Recorder, userID *uint, feature, requestID string, u AgentUsage) {
	if rec == nil {
		return
	}
	rec.Record(llmusage.Usage{
		UserID:              userID,
		Feature:             feature,
		Source:              llmusage.SourceAgent,
		Provider:            "scholay-managed",
		Model:               u.Model,
		InputTokens:         u.InputTokens,
		OutputTokens:        u.OutputTokens,
		CacheReadTokens:     u.CacheReadTokens,
		CacheCreationTokens: u.CacheCreationTokens,
		RequestID:           requestID,
	})
}


// ─── StandardHooks: 三个 WS 对话 feature (smart_search/claw/prism) 的统一 PreUserMessage / OnMessageComplete ───
//
// 背景: smartsearch/claw/prism 的 PreUserMessage 与 OnMessageComplete 此前逐字重复
// (配额检查 → 记一条 usagestat 提问事件 → slog 用量)。本构造器把这套样板收口一处,
// 三个 feature 只声明各自的差异 (feature_key + 配额/统计闭包)。
//
// 关键: 为保持 "注入时机无关" 语义 (bootstrap 的 SetVIPChecker/SetUsageRecorder 可后于
// BuildSpec 调用), 依赖以 **函数** 形式传入, 在每次 user_message 触发时才求值当前 var,
// 而不是 BuildSpec 那一刻的快照。agentbridge 不反向 import vip / usagestat。
type StandardHooksConfig struct {
	// FeatureKey 用于 NewSlogUsageRecorder 的标签 (= spec.Key)。
	FeatureKey string

	// CheckQuota 在每条 user_message 前同步调用做配额闸门。返回非 nil 即拦截。
	// **约定**: 若想让 WS pipe 回前端 code=quota_exceeded, 返回的 error 必须自身已
	// wrap ErrQuotaExceeded (用 NewQuotaError 包装 vip 的友好文案); 其他 error 走通用错误分类。
	// nil → 不做配额检查 (直接放行)。典型实现是一个读包级 vipChecker var 的闭包。
	CheckQuota func(ctx context.Context, userID uint) error

	// RecordQuestion 在配额通过后调用一次, 记一条 "用户发起提问/对话" 的 usagestat 事件。
	// userID==0 时传 nil。nil → 不记使用统计。典型实现是一个读包级 usageRecorder var 的闭包。
	RecordQuestion func(userID *uint)
}

// StandardHooks 返回一对标准 (PreUserMessageFn, OnMessageCompleteFn):
//   - Pre:  先 CheckQuota (超额拦截, 不记使用), 通过后 RecordQuestion。
//   - Complete: NewSlogUsageRecorder(FeatureKey) —— 只 slog (docker logs | grep agent_usage),
//     不落 token 账本 (token 已由 agent per-call 内网回调记账, 见 internal_handler.go, 这里再记会双计)。
func StandardHooks(cfg StandardHooksConfig) (PreUserMessageFn, OnMessageCompleteFn) {
	pre := func(ctx context.Context, userID uint, _ string) error {
		if cfg.CheckQuota != nil {
			if err := cfg.CheckQuota(ctx, userID); err != nil {
				return err
			}
		}
		if cfg.RecordQuestion != nil {
			var uid *uint
			if userID != 0 {
				u := userID
				uid = &u
			}
			cfg.RecordQuestion(uid)
		}
		return nil
	}
	return pre, NewSlogUsageRecorder(cfg.FeatureKey)
}
