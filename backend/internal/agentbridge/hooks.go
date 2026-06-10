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
// 这是最早的 P0 记账方案; 现在已配合 NewDBUsageRecorder 落库长期审计。两者签名一致,
// 用 ChainOnMessageComplete 串起来即可让一轮 usage 既进 slog (live grep) 又进账本表。
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

// recordAgentTokens 是 **agent 侧 token 记账的唯一构造点** —— WS 轮次(OnMessageComplete)、
// peerreview server-side(recordServerSideUsage)、agent 内网回调(title-gen 等「带外」用量)
// 三条路都经它落统一账本 llm_token_usage,避免各自手搓 llmusage.Usage{} 漂移。
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

// NewDBUsageRecorder 返回一个 OnMessageComplete 钩子: 把 agent 侧每轮 usage 落统一账本。
// userID==0 视为无归属(理论上 WS 必登录, 仅兜底)→ user_id=NULL。request_id 留空(WS 钩子签名
// 拿不到 sessionID)。落库统一走 recordAgentTokens(三喂养点共用,不再各自手搓 Usage{})。
func NewDBUsageRecorder(featureKey string, rec llmusage.Recorder) OnMessageCompleteFn {
	return func(_ context.Context, userID uint, usage AgentUsage) {
		var uid *uint
		if userID != 0 {
			u := userID
			uid = &u
		}
		recordAgentTokens(rec, uid, featureKey, "", usage)
	}
}

// ChainOnMessageComplete 把多个 OnMessageComplete 钩子串成一个, 按顺序依次调用
// (各自已被 safego 包裹, 互不影响)。nil 元素自动跳过。
func ChainOnMessageComplete(fns ...OnMessageCompleteFn) OnMessageCompleteFn {
	return func(ctx context.Context, userID uint, usage AgentUsage) {
		for _, fn := range fns {
			if fn != nil {
				fn(ctx, userID, usage)
			}
		}
	}
}
