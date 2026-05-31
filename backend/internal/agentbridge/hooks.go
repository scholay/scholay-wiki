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
)

// ErrQuotaExceeded 是 PreUserMessage 钩子达到日额时返回的语义化错误,
// pipe 据此回前端 code=quota_exceeded + retryable=false。
var ErrQuotaExceeded = errors.New("agentbridge: daily quota exceeded")

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
		// 用 UTC 日期对齐 redis key, 跨时区一致性更好; 业务上日额起算时间 = 0:00 UTC + 8h = 8:00 北京时间。
		// 如果产品要严格按北京时间日切, 把 UTC() 换成 In(time.FixedZone("CST", 8*3600))。
		ymd := time.Now().UTC().Format("20060102")
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
// 这是 P0 阶段的最小记账方案; 后续可以再加一个 NewDBUsageRecorder 落到 agent_usage_logs
// 表做长期审计, 接口签名都一样, smart-search 只换一行 wiring 就行。
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
