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

// NewQuotaErrorFrom 同 NewQuotaError(文案取 cause.Error()),但把原始错误保留在链上:
// errors.As 能沿链找到 vip 侧携带结构化 quota 字段的错误(duck-typed 提取见 ws.go
// quotaFramePayload,agentbridge 不反向 import vip),error 帧才能按冻结契约带出
// {reset_at, window_days, credit_balance_positive, credit_autopay}。
// 各 feature spec 的 checkQuota 一律用本函数包 vip.ErrQuotaExceeded,别再用
// NewQuotaError(err.Error()) —— 那会把结构化字段剥掉。cause==nil 时等价 NewQuotaError("")。
func NewQuotaErrorFrom(cause error) error {
	if cause == nil {
		return &quotaError{}
	}
	return &quotaError{msg: cause.Error(), cause: cause}
}

type quotaError struct {
	msg   string
	cause error // 可选:原始(vip)错误,保留结构化 quota 字段的来源
}

func (e *quotaError) Error() string { return e.msg }

// Unwrap 多路展开(Go 1.20+):sentinel 保证 errors.Is 分类不破,cause 保留给 errors.As 提取。
func (e *quotaError) Unwrap() []error {
	if e.cause != nil {
		return []error{ErrQuotaExceeded, e.cause}
	}
	return []error{ErrQuotaExceeded}
}

// NewSlogUsageRecorder 返回一个 OnMessageComplete 钩子: 把每轮 usage 打到 slog,
// 标签 "agent_usage=1" 方便 grep / 切到日志聚合工具时按 label 过滤。
//
// 这是三 WS feature (smart_search/claw/prism) 的 OnMessageComplete 唯一在用的钩子;刻意**只 slog
// 不落库** —— token 账本由 ws.go 的 accrueTurnUsage **带内帧**统一记 (见 recordAgentTokens 调用处),
// 此处再落会与带内帧路径双计账本 + 双扣额度。
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

// recordAgentTokens 是 **agent 侧 token 记账的唯一构造点** —— ws.go(交互三件套)与
// ws_serverside.go(peerreview)的 accrueTurnUsage 算出每轮要落库的行后,经它落统一账本
// llm_token_usage,避免各自手搓 llmusage.Usage{} 漂移。
//
// requestID 用作 session/turn 关联键:WS pipe 与 server-side 都传 agent sessionID。
// WS OnMessageComplete 现只 slog 不落库(见 NewSlogUsageRecorder),故不在此列。
// (历史的 agent per-call HTTP 内网回调 /internal_handler.go 旁路已删除。)
// Source 固定 agent;Provider(F0 多 provider)按行内 model 经目录解析真实归属:
// 额外 provider = "scholay-p<id>"(与 executor upsert 键一致),默认/目录 miss = "scholay-managed"。
// rec==nil 跳过;userID==nil = 无归属(落 user_id=NULL)。
//
// 未来 per-user token 总额预算的「实际扣减」就接在这里(唯一 decrement 点),见设计 seam。
func providerLabelFor(cat ModelCatalog, model string) string {
	if cat != nil && model != "" {
		if k := cat.ProviderKey(model); k != "" {
			return k
		}
	}
	return "scholay-managed"
}

func recordAgentTokens(rec llmusage.Recorder, cat ModelCatalog, userID *uint, feature, requestID string, u AgentUsage) {
	recordAgentTokensWithQuota(rec, cat, userID, feature, requestID, u, false)
}

// recordAgentTokensPlatformFault —— 「平台自担」记账入口(2026-07-31 线上审计 §五)。
//
// 失败轮的上游消耗**照记账本**(cost_micro_yuan 快照保留,成本观测与对账不失明),但
// **不扣用户额度**(llmusage.Usage.SkipQuota=true → 不触发 UsageObserver → vip 不 AddUsage)。
// 只用于**平台责任**的失败:上游断流 / 过载 / 模型协议异常 / 轮内步数撞我们自己设的上限 ——
// 用户没拿到任何东西,凭什么付钱(线上一位用户 9 连败被扣了 9 轮 deepseek-v4-pro 的额度)。
//
// ⚠️ 与之相对,budget(任务过大)/ content_blocked(内容合规)/ quota_exceeded 是**用户任务
// 本身**导致的失败,照常计费 —— 判定口径的唯一真源是 ws.go turnFailureChargedToUser()。
func recordAgentTokensPlatformFault(rec llmusage.Recorder, cat ModelCatalog, userID *uint, feature, requestID string, u AgentUsage) {
	recordAgentTokensWithQuota(rec, cat, userID, feature, requestID, u, true)
}

func recordAgentTokensWithQuota(rec llmusage.Recorder, cat ModelCatalog, userID *uint, feature, requestID string, u AgentUsage, skipQuota bool) {
	if rec == nil {
		return
	}
	rec.Record(llmusage.Usage{
		UserID:              userID,
		Feature:             feature,
		Source:              llmusage.SourceAgent,
		Provider:            providerLabelFor(cat, u.Model),
		Model:               u.Model,
		InputTokens:         u.InputTokens,
		OutputTokens:        u.OutputTokens,
		CacheReadTokens:     u.CacheReadTokens,
		CacheCreationTokens: u.CacheCreationTokens,
		RequestID:           requestID,
		SkipQuota:           skipQuota,
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
