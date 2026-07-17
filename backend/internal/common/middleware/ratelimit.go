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
	"scholar-backend/internal/common/safego"
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
	safego.Go("ratelimit-cleanup", func() {
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				rl.cleanup()
			case <-rl.stopCleanup:
				return
			}
		}
	})
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

// TieredRateLimitOptions 分级限流配置。
type TieredRateLimitOptions struct {
	IPRPS     int // 匿名/未认证按 IP 限的每秒请求数
	IPBurst   int // IP 令牌桶突发
	UserRPS   int // 普通认证用户每秒请求数
	UserBurst int // 用户令牌桶突发
}

// TieredRateLimitMiddleware 分级限流：
//   - 已认证用户按 user_id 限流；未认证请求 fallback 为 IP 限流。
//
// 需要在 UserAuthMiddleware / OptionalUserAuthMiddleware 之后挂载，否则 user_id 尚未写入 context，会全部走 IP 路径。
//
// 注:曾有 is_vip=true→VIPMultiplier 放大的第三档,但 is_vip 全代码库从无人写入(死代码/配置假象),
// 已随本项(性能审计 #4)删除;若日后要做 VIP 放大,应在 auth 之后挂 hook 从 vip.EffectiveTier 写 is_vip 再恢复该档。
func TieredRateLimitMiddleware(opts TieredRateLimitOptions) gin.HandlerFunc {
	ipLimiter := NewRateLimiter(opts.IPRPS, time.Second)
	ipLimiter.burst = opts.IPBurst
	ipLimiter.StartCleanup(5 * time.Minute)

	userLimiter := NewRateLimiter(opts.UserRPS, time.Second)
	userLimiter.burst = opts.UserBurst
	userLimiter.StartCleanup(5 * time.Minute)

	return func(c *gin.Context) {
		var allowed bool
		if uidRaw, ok := c.Get("user_id"); ok {
			allowed = userLimiter.Allow(fmt.Sprintf("uid:%v", uidRaw))
		} else {
			allowed = ipLimiter.Allow("ip:" + c.ClientIP())
		}

		if !allowed {
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

// rateLimitScript 原子地 INCR + 设置/自愈 TTL，返回当前计数。
// 用单条 Lua 取代「INCR 后再单独 EXPIRE」：避免 EXPIRE 那次独立往返偶发失败时
// key 永不过期、被 LRU 保活，导致用户在窗口边界被永久卡死。
// 自愈条款:count>1 但 PTTL<0(无 TTL —— 旧代码遗留的不死键 / EXPIRE 曾失败的键)时也补 TTL,
// 否则那些存量无 TTL 键会让对应 IP/用户一旦越限即永久 429 且 LRU 逐不出(AOF 还跨重启存活)。
var rateLimitScript = redis.NewScript(`
local count = redis.call('INCR', KEYS[1])
if count == 1 or redis.call('PTTL', KEYS[1]) < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return count
`)

// redisRateCheck implements a fixed-window counter using an atomic INCR+PEXPIRE Lua script.
func redisRateCheck(rdb *redis.Client, c *gin.Context, key string, maxRequests, windowSeconds int) (bool, error) {
	ctx := c.Request.Context()
	count, err := rateLimitScript.Run(ctx, rdb, []string{key}, windowSeconds*1000).Int64()
	if err != nil {
		return false, err
	}
	return count <= int64(maxRequests), nil
}

// TieredRedisRateLimitMiddleware 分级限流的分布式版本，多实例部署下计数共享。
// 行为与 TieredRateLimitMiddleware 一致（user/ip 两档），但计数走 Redis。
// Redis 不可用时降级到 in-memory 版本（保留限流语义而非 fail-open）。
// 注:曾有 vip 档,但 is_vip 从无人写入(死代码),已随性能审计 #4 删除。
func TieredRedisRateLimitMiddleware(opts TieredRateLimitOptions) gin.HandlerFunc {
	memFallback := TieredRateLimitMiddleware(opts)

	return func(c *gin.Context) {
		rdb := cache.GetRedis()
		if rdb == nil {
			memFallback(c)
			return
		}

		var key string
		var limit int
		if uidRaw, ok := c.Get("user_id"); ok {
			key = fmt.Sprintf("rl:uid:%v", uidRaw)
			limit = opts.UserRPS
		} else {
			key = "rl:ip:" + c.ClientIP()
			limit = opts.IPRPS
		}

		allowed, err := redisRateCheck(rdb, c, key, limit, 1)
		if err != nil {
			slog.Warn("Redis tiered rate limit failed, falling back to in-memory", "err", err)
			memFallback(c)
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
