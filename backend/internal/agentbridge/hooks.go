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
	"fmt"
	"log/slog"
	"time"

	"scholar-backend/internal/common/cache"
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

// NewRedisDailyCap 返回一个 PreUserMessage 钩子: 每 (user, feature) 每日不超过 perDay 条
// user_message。计数走 Redis INCR 一个 utc day key, TTL 25h 自动到期。
//
// perDay <= 0 → 不限额 (空操作)。
// Redis 不可用 → fail open (打 warn 后放行), 跟项目里 RedisRateLimitMiddleware 一致 ——
// 让基础设施故障降低可用性, 但不让用户被无声卡死。
//
// 这是一个轻量的成本护栏, 不替代真正的 subscription 系统: 后者建好后, 把这个钩子换成
// 走 subscription.CheckQuota 即可, 不需要改 agentbridge 任何东西。
func NewRedisDailyCap(featureKey string, perDay int) PreUserMessageFn {
	return func(ctx context.Context, userID uint, _ string) error {
		if perDay <= 0 {
			return nil
		}
		rdb := cache.GetRedis()
		if rdb == nil {
			slog.Warn("agentbridge daily cap: redis unavailable, falling open",
				"feature", featureKey, "user_id", userID)
			return nil
		}
		// 日额按本地日切 —— 直接用 time.Now() (容器时区统一为北京, 见 docker-compose
		// x-tz-env)。本项目铁律: 代码不用 UTC、不做时区转换, 时区只在容器层面解决。
		ymd := time.Now().Format("20060102")
		key := fmt.Sprintf("agent:daily:%s:%d:%s", featureKey, userID, ymd)

		count, err := rdb.Incr(ctx, key).Result()
		if err != nil {
			slog.Warn("agentbridge daily cap: redis incr failed, falling open",
				"feature", featureKey, "user_id", userID, "err", err)
			return nil
		}
		if count == 1 {
			// 第一次自增时设过期; 用 25h 防止时钟漂移导致 key 提前过期。
			if expErr := rdb.Expire(ctx, key, 25*time.Hour).Err(); expErr != nil {
				slog.Warn("agentbridge daily cap: redis expire failed",
					"feature", featureKey, "user_id", userID, "err", expErr)
			}
		}
		if count > int64(perDay) {
			slog.Info("agentbridge daily cap: quota exceeded",
				"feature", featureKey, "user_id", userID,
				"used", count, "limit", perDay)
			return fmt.Errorf("今日%s次数已达上限 (%d/天), 请明天再试: %w",
				featureKeyHuman(featureKey), perDay, ErrQuotaExceeded)
		}
		return nil
	}
}

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

// NewDBUsageRecorder 返回一个 OnMessageComplete 钩子: 把 agent 侧每轮 usage 落到统一
// llm_token_usage 账本(source=agent)。userID==0 视为无归属(理论上 WS 必登录, 仅兜底),
// 落 user_id=NULL。provider 固定 "scholay-managed"(agent 上游 provider/model 由 agent_config
// 单行托管, backend 黑盒, 这里不细分); 实际 model 由 pipe 注入到 usage.Model。
// request_id 留空 —— WS 钩子签名只有 (ctx,userID,usage), 拿不到 sessionID, session 关联非必需。
func NewDBUsageRecorder(featureKey string, rec llmusage.Recorder) OnMessageCompleteFn {
	return func(_ context.Context, userID uint, usage AgentUsage) {
		if rec == nil {
			return
		}
		var uid *uint
		if userID != 0 {
			u := userID
			uid = &u
		}
		rec.Record(llmusage.Usage{
			UserID:              uid,
			Feature:             featureKey,
			Source:              llmusage.SourceAgent,
			Provider:            "scholay-managed",
			Model:               usage.Model,
			InputTokens:         usage.InputTokens,
			OutputTokens:        usage.OutputTokens,
			CacheReadTokens:     usage.CacheReadTokens,
			CacheCreationTokens: usage.CacheCreationTokens,
		})
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

// featureKeyHuman 把 feature_key 翻译成给用户看的中文名 (用于配额超限的报错消息)。
// 没匹配到时回退到 key 本身, 不会 crash。新 feature 加进来时记得在这里补一行。
func featureKeyHuman(featureKey string) string {
	switch featureKey {
	case "smart_search":
		return "智能搜索"
	default:
		return featureKey
	}
}
