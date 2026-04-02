// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package middleware

import (
	"fmt"
	"log/slog"
	"scholar-backend/internal/common/cache"
	"scholar-backend/internal/common/utils"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"golang.org/x/time/rate"
)

// ---------------------------------------------------------------------------
// In-memory rate limiter (single-instance deployments)
// ---------------------------------------------------------------------------

// RateLimiter 基于令牌桶算法的 IP 限流器
// 使用 golang.org/x/time/rate 实现，相比固定窗口算法更平滑
type RateLimiter struct {
	mu          sync.Mutex
	limiters    map[string]*rateLimiterEntry
	rateLimit   rate.Limit
	burst       int
	stopCleanup chan struct{}
}

type rateLimiterEntry struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

// NewRateLimiter 创建限流器
// maxRequests: 每个窗口期内允许的最大请求数
// windowSize: 窗口时间长度（令牌桶速率 = maxRequests / windowSize）
func NewRateLimiter(maxRequests int, windowSize time.Duration) *RateLimiter {
	r := rate.Every(windowSize / time.Duration(maxRequests))
	return &RateLimiter{
		limiters:    make(map[string]*rateLimiterEntry),
		rateLimit:   r,
		burst:       maxRequests,
		stopCleanup: make(chan struct{}),
	}
}

// Allow 检查指定 key 的请求是否允许通过
func (rl *RateLimiter) Allow(key string) bool {
	rl.mu.Lock()
	entry, exists := rl.limiters[key]
	if !exists {
		entry = &rateLimiterEntry{
			limiter:  rate.NewLimiter(rl.rateLimit, rl.burst),
			lastSeen: time.Now(),
		}
		rl.limiters[key] = entry
	}
	entry.lastSeen = time.Now()
	rl.mu.Unlock()

	return entry.limiter.Allow()
}

// StartCleanup 定时清理过期的限流器条目
func (rl *RateLimiter) StartCleanup(interval time.Duration) {
	ticker := time.NewTicker(interval)
	go func() {
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				rl.cleanup()
			case <-rl.stopCleanup:
				return
			}
		}
	}()
}

// Stop 停止清理协程
func (rl *RateLimiter) Stop() {
	close(rl.stopCleanup)
}

func (rl *RateLimiter) cleanup() {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	threshold := time.Now().Add(-3 * time.Minute)
	for key, entry := range rl.limiters {
		if entry.lastSeen.Before(threshold) {
			delete(rl.limiters, key)
		}
	}
}

// RateLimitMiddleware 创建 Gin 限流中间件（内存版）
// 示例: RateLimitMiddleware(100, 1*time.Second) 允许每秒100个请求
func RateLimitMiddleware(maxRequests int, windowSize time.Duration) gin.HandlerFunc {
	rl := NewRateLimiter(maxRequests, windowSize)
	rl.StartCleanup(5 * time.Minute)

	return func(c *gin.Context) {
		key := c.ClientIP()

		if !rl.Allow(key) {
			utils.TooManyRequests(c, "请求过于频繁，请稍后再试")
			c.Abort()
			return
		}

		c.Next()
	}
}

// ---------------------------------------------------------------------------
// Redis-backed rate limiter (multi-instance / distributed deployments)
// Uses sliding window counter via Redis INCR + EXPIRE.
// ---------------------------------------------------------------------------

// RedisRateLimitMiddleware creates a distributed rate limiter backed by Redis.
// maxRequests: maximum allowed requests per windowSize per IP.
// windowSize: sliding window duration.
// Falls back to allowing the request if Redis is unavailable.
func RedisRateLimitMiddleware(maxRequests int, windowSize time.Duration) gin.HandlerFunc {
	return func(c *gin.Context) {
		rdb := cache.GetRedis()
		if rdb == nil {
			// Redis not available — allow request (fail open)
			c.Next()
			return
		}

		key := fmt.Sprintf("ratelimit:%s", c.ClientIP())
		windowSeconds := int(windowSize.Seconds())
		if windowSeconds < 1 {
			windowSeconds = 1
		}

		allowed, err := redisRateCheck(rdb, c, key, maxRequests, windowSeconds)
		if err != nil {
			slog.Warn("Redis rate limit check failed, allowing request", "err", err)
			c.Next()
			return
		}

		if !allowed {
			utils.TooManyRequests(c, "请求过于频繁，请稍后再试")
			c.Abort()
			return
		}

		c.Next()
	}
}

// redisRateCheck implements a fixed-window counter using Redis INCR + EXPIRE.
func redisRateCheck(rdb *redis.Client, c *gin.Context, key string, maxRequests, windowSeconds int) (bool, error) {
	ctx := c.Request.Context()
	count, err := rdb.Incr(ctx, key).Result()
	if err != nil {
		return false, err
	}
	// Set expiry on first request in the window
	if count == 1 {
		rdb.Expire(ctx, key, time.Duration(windowSeconds)*time.Second)
	}
	return count <= int64(maxRequests), nil
}
