// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package cache

import (
	"context"
	cryptorand "crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"math/rand"
	"strconv"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
	"golang.org/x/sync/singleflight"

	"scholar-backend/internal/common/ctxutil"
	"scholar-backend/internal/common/safego"
)

// ErrNotFound 是上游 fetch 函数在确认数据不存在时应返回的标记错误。
// GetOrSet 收到此错误后会缓存一个 null 哨兵值（短 TTL），防止缓存穿透。
var ErrNotFound = errors.New("cache: resource not found")

// nullSentinel 是缓存中的"已确认不存在"标记。
const nullSentinel = "__NULL__"

// nullCacheTTL null 哨兵的缓存时长，应明显短于正常 TTL，便于数据补齐后及时恢复。
const nullCacheTTL = 60 * time.Second

// jitterTTL 在原 TTL 上叠加 ±10% 的随机抖动，避免大量 key 同时过期触发缓存雪崩。
func jitterTTL(d time.Duration) time.Duration {
	if d <= 0 {
		return d
	}
	delta := int64(d) / 10
	if delta == 0 {
		return d
	}
	offset := rand.Int63n(2*delta+1) - delta
	return time.Duration(int64(d) + offset)
}

var rdb *redis.Client

// rdbPersist 是可选的「correctness 键」专用 Redis(noeviction 策略):吊销标记 / 每日配额 /
// SEO 推送队列等不能被主实例 allkeys-lru 静默逐出的键放这里。未配置时 GetRedisPersist 回落主 Redis。
var rdbPersist *redis.Client

// InitRedisPersist 初始化 correctness 键专用 Redis(可选)。host 为空则跳过(回落主 Redis)。
func InitRedisPersist(host, port, password string, db int) error {
	if host == "" {
		slog.Info("Redis persist instance not configured — correctness keys fall back to main Redis")
		return nil
	}
	addr := fmt.Sprintf("%s:%s", host, port)
	rdbPersist = redis.NewClient(&redis.Options{
		Addr:         addr,
		Password:     password,
		DB:           db,
		DialTimeout:  5 * time.Second,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
		PoolSize:     50,
		MinIdleConns: 10,
	})
	ctx, cancel := ctxutil.With(ctxutil.QuickIO)
	defer cancel()
	if err := rdbPersist.Ping(ctx).Err(); err != nil {
		// 可选实例:连不上不致命,降级回落主 Redis(correctness 键仍在,只是回到逐出风险 + 告警兜底)。
		rdbPersist = nil
		slog.Warn("persist Redis configured but unreachable — falling back to main Redis", "addr", addr, "err", err)
		return nil
	}
	slog.Info("Redis persist instance connected", "addr", addr)
	return nil
}

// GetRedisPersist 返回 correctness 键应使用的 Redis:配了专用 noeviction 实例就用它,
// 否则回落主实例(单实例部署行为不变;此时逐出风险仍由 StartEvictionMonitoring 告警兜底)。
func GetRedisPersist() *redis.Client {
	if rdbPersist != nil {
		return rdbPersist
	}
	return rdb
}

// sfShardCount 分片数：取 2 的幂便于位掩码取模。每个 shard 一个独立 Group，
// 避免单一 Group 内部 mutex 在大量不同 key 高并发时成为瓶颈。
const sfShardCount = 32
const sfShardMask = sfShardCount - 1

var sfShards [sfShardCount]singleflight.Group

// sfGroupFor 通过 FNV-1a 哈希把 key 映射到对应分片的 singleflight.Group。
func sfGroupFor(key string) *singleflight.Group {
	var h uint32 = 2166136261
	for i := 0; i < len(key); i++ {
		h ^= uint32(key[i])
		h *= 16777619
	}
	return &sfShards[h&sfShardMask]
}

// InitRedis initializes the Redis client
func InitRedis(host string, port string, password string, db int) error {
	addr := fmt.Sprintf("%s:%s", host, port)

	rdb = redis.NewClient(&redis.Options{
		Addr:         addr,
		Password:     password,
		DB:           db,
		DialTimeout:  5 * time.Second,
		ReadTimeout:  10 * time.Second,  // Increased from 3s to prevent premature timeouts
		WriteTimeout: 10 * time.Second,  // Increased from 3s to prevent premature timeouts
		PoolSize:     150,               // 高并发下为每个逻辑处理器预留足够连接，避免 Wait 队列累积
		MinIdleConns: 40,                // 维持更多热连接，冷启动或突发流量时减少握手延迟
	})

	// Test connection
	ctx, cancel := ctxutil.With(ctxutil.QuickIO)
	defer cancel()

	if err := rdb.Ping(ctx).Err(); err != nil {
		return fmt.Errorf("failed to connect to Redis: %w", err)
	}

	slog.Info("Redis connected successfully", "addr", addr)
	return nil
}

// GetRedis returns the Redis client instance
func GetRedis() *redis.Client {
	return rdb
}

// StartEvictionMonitoring 周期性读 Redis INFO stats 的 evicted_keys,>0 即告警。
//
// 本实例是 allkeys-lru + 512MB,与吊销标记 / 每日配额 / SEO 队列等 correctness 键共池。
// 内存打满时这些键会被静默逐出(吊销复活 / 配额清零 / 队列丢失)且 fail-open 文档不覆盖
// 「健康实例逐出」这一路径。在 correctness 键彻底分池前,至少让逐出**不再静默**:有逐出就报警,
// 运维据此扩容 / 分池。仅观测,不改任何行为。
func StartEvictionMonitoring(ctx context.Context, interval time.Duration) {
	if rdb == nil {
		return
	}
	safego.Go("redis-eviction-monitor", func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		var lastEvicted int64 = -1
		for {
			select {
			case <-ticker.C:
				evicted := readEvictedKeys(ctx)
				if evicted < 0 {
					continue // 读失败,跳过本次
				}
				if lastEvicted < 0 {
					lastEvicted = evicted // 首次只记基线,不报(可能是历史累计)
					continue
				}
				if evicted > lastEvicted {
					slog.Warn("redis evicted keys detected — correctness 键(吊销/配额/队列)可能被逐出,请扩容或分池",
						"evicted_total", evicted, "delta", evicted-lastEvicted,
						"hint", "INFO stats evicted_keys / 见 maxmemory 512MB allkeys-lru")
				}
				lastEvicted = evicted
			case <-ctx.Done():
				slog.Info("Redis eviction monitoring stopped")
				return
			}
		}
	})
	slog.Info("Redis eviction monitoring started", "interval", interval)
}

// readEvictedKeys 解析 INFO stats 的 evicted_keys;失败返回 -1。
func readEvictedKeys(ctx context.Context) int64 {
	rctx, cancel := context.WithTimeout(ctx, ctxutil.CacheRead)
	defer cancel()
	info, err := rdb.Info(rctx, "stats").Result()
	if err != nil {
		return -1
	}
	for _, line := range strings.Split(info, "\n") {
		line = strings.TrimSpace(line)
		if rest, ok := strings.CutPrefix(line, "evicted_keys:"); ok {
			n, perr := strconv.ParseInt(strings.TrimSpace(rest), 10, 64)
			if perr != nil {
				return -1
			}
			return n
		}
	}
	return -1
}

// Set sets a key-value pair with expiration（自动叠加 TTL 抖动以防雪崩）
func Set(ctx context.Context, key string, value any, expiration time.Duration) error {
	data, err := json.Marshal(value)
	if err != nil {
		return fmt.Errorf("failed to marshal value: %w", err)
	}

	return rdb.Set(ctx, key, data, jitterTTL(expiration)).Err()
}

// Get retrieves a value by key and unmarshals it into result。
// 命中 null 哨兵时返回 ErrNotFound，调用方据此跳过 fetch。
func Get(ctx context.Context, key string, result any) error {
	val, err := rdb.Get(ctx, key).Result()
	if err != nil {
		return err
	}

	if val == nullSentinel {
		return ErrNotFound
	}

	return json.Unmarshal([]byte(val), result)
}

// Delete deletes a key
func Delete(ctx context.Context, key string) error {
	return rdb.Del(ctx, key).Err()
}

// Exists checks if a key exists
func Exists(ctx context.Context, key string) (bool, error) {
	count, err := rdb.Exists(ctx, key).Result()
	return count > 0, err
}

// --- persist 池变体 -----------------------------------------------------------
// 下面四个函数行为与主池版 Set/Get/Delete/TTL 完全一致, 只是底层走 GetRedisPersist()
// (配了 noeviction 专用实例就用它, 否则回落主池)。供「不能被 LRU 静默逐出 = 逐出即
// 硬性鉴权失败」的 correctness 键使用: 验证码 / WS 一次性票据等。

// SetPersist 同 Set, 写 persist 池。
func SetPersist(ctx context.Context, key string, value any, expiration time.Duration) error {
	data, err := json.Marshal(value)
	if err != nil {
		return fmt.Errorf("failed to marshal value: %w", err)
	}
	return GetRedisPersist().Set(ctx, key, data, jitterTTL(expiration)).Err()
}

// GetPersist 同 Get, 读 persist 池。
func GetPersist(ctx context.Context, key string, result any) error {
	val, err := GetRedisPersist().Get(ctx, key).Result()
	if err != nil {
		return err
	}
	if val == nullSentinel {
		return ErrNotFound
	}
	return json.Unmarshal([]byte(val), result)
}

// DeletePersist 同 Delete, 删 persist 池。
func DeletePersist(ctx context.Context, key string) error {
	return GetRedisPersist().Del(ctx, key).Err()
}

// TTLPersist 同 TTL, 查 persist 池。
func TTLPersist(ctx context.Context, key string) (time.Duration, error) {
	return GetRedisPersist().TTL(ctx, key).Result()
}

// SetString sets a string value directly (no JSON marshaling)
func SetString(ctx context.Context, key string, value string, expiration time.Duration) error {
	return rdb.Set(ctx, key, value, expiration).Err()
}

// GetString retrieves a string value directly (no JSON unmarshaling)
func GetString(ctx context.Context, key string) (string, error) {
	return rdb.Get(ctx, key).Result()
}

// GetOrSet retrieves from cache or fetches and caches the value.
// Uses singleflight to coalesce concurrent requests for the same key within a single process.
// fetch 返回 ErrNotFound 时会写入 null 哨兵（短 TTL）防止缓存穿透；调用方收到 ErrNotFound 即可。
func GetOrSet(ctx context.Context, key string, expiration time.Duration, fetch func() (any, error), result any) error {
	// Try to get from cache
	err := Get(ctx, key, result)
	if err == nil {
		return nil
	}
	if errors.Is(err, ErrNotFound) {
		return ErrNotFound
	}
	if err != redis.Nil {
		return fmt.Errorf("redis error: %w", err)
	}

	// Cache miss — use singleflight to deduplicate concurrent fetches for the same key.
	// 分片 group 让不同 key 之间不互相等内部 mutex，提升并发吞吐。
	value, sferr, _ := sfGroupFor(key).Do(key, func() (any, error) {
		// Double-check cache (another goroutine in this flight may have populated it)
		if err := Get(ctx, key, result); err == nil {
			data, _ := json.Marshal(result)
			return data, nil
		} else if errors.Is(err, ErrNotFound) {
			return nil, ErrNotFound
		}

		v, err := fetch()
		if err != nil {
			// 数据确认不存在 → 写入 null 哨兵防穿透
			if errors.Is(err, ErrNotFound) {
				if setErr := rdb.Set(ctx, key, nullSentinel, jitterTTL(nullCacheTTL)).Err(); setErr != nil {
					slog.Warn("Failed to cache null sentinel", "key", key, "err", setErr)
				}
				return nil, ErrNotFound
			}
			return nil, fmt.Errorf("fetch error: %w", err)
		}
		// 只 marshal 一次: 复用同一份 bytes 既写 Redis 又作 singleflight 返回值, 避免对
		// (可能数十~数百 KB 的 minicod)payload 在 miss 路径上重复 marshal。直接 rdb.Set +
		// jitterTTL 与 Set() 等价(Set 内部也是 marshal→rdb.Set→jitter)。
		data, err := json.Marshal(v)
		if err != nil {
			return nil, fmt.Errorf("marshal error: %w", err)
		}
		if err := rdb.Set(ctx, key, data, jitterTTL(expiration)).Err(); err != nil {
			slog.Warn("Failed to cache value", "key", key, "err", err)
		}
		return data, nil
	})
	if sferr != nil {
		return sferr
	}

	return json.Unmarshal(value.([]byte), result)
}

// SetNX sets a key only if it doesn't exist (used for distributed locks)
func SetNX(ctx context.Context, key string, value string, expiration time.Duration) (bool, error) {
	return rdb.SetNX(ctx, key, value, expiration).Result()
}

// Incr increments a counter
func Incr(ctx context.Context, key string) (int64, error) {
	return rdb.Incr(ctx, key).Result()
}

// Expire sets expiration on an existing key
func Expire(ctx context.Context, key string, expiration time.Duration) error {
	return rdb.Expire(ctx, key, expiration).Err()
}

// TTL returns the remaining time to live of a key
func TTL(ctx context.Context, key string) (time.Duration, error) {
	return rdb.TTL(ctx, key).Result()
}

// SAdd adds members to a set
func SAdd(ctx context.Context, key string, members ...any) error {
	return rdb.SAdd(ctx, key, members...).Err()
}

// SRem removes members from a set
func SRem(ctx context.Context, key string, members ...any) error {
	return rdb.SRem(ctx, key, members...).Err()
}

// SMembers returns all members of a set
func SMembers(ctx context.Context, key string) ([]string, error) {
	return rdb.SMembers(ctx, key).Result()
}

// SCard returns the number of members in a set
func SCard(ctx context.Context, key string) (int64, error) {
	return rdb.SCard(ctx, key).Result()
}

// TryLock attempts to acquire a distributed lock.
// Returns true if lock was acquired. Caller should defer Unlock.
// ⚠️ 简单版：不带 owner token，任何持有 key 的进程都会被它"解锁"。适合短 TTL + 单点互斥场景。
// 对长时间任务请用 RunWithLock，它带续期 + owner-scoped 释放。
func TryLock(ctx context.Context, key string, ttl time.Duration) (bool, error) {
	return rdb.SetNX(ctx, "dlock:"+key, "1", ttl).Result()
}

// Unlock releases a distributed lock.
func Unlock(ctx context.Context, key string) {
	rdb.Del(ctx, "dlock:"+key)
}

// unlockIfOwnerScript 只在 value 匹配 owner token 时删除 key，避免误删别的进程刚抢到的锁。
// 原生 SETNX+DEL 组合在锁过期后又被别人抢占的场景下会误删，出现并发执行。
var unlockIfOwnerScript = redis.NewScript(`
if redis.call("get", KEYS[1]) == ARGV[1] then
	return redis.call("del", KEYS[1])
else
	return 0
end
`)

// extendIfOwnerScript 只在 value 匹配时续期 TTL，防止"锁已易主"的误续期。
var extendIfOwnerScript = redis.NewScript(`
if redis.call("get", KEYS[1]) == ARGV[1] then
	return redis.call("pexpire", KEYS[1], ARGV[2])
else
	return 0
end
`)

// RunWithLock 在分布式锁保护下执行 fn。带两项关键保障：
//  1. 随机 owner token：避免 fn 执行超过 TTL 后锁已过期被别人抢到，本进程 Unlock 误删他人锁；
//  2. 后台续期（每 ttl/3 pexpire 一次）：fn 执行超时不会因为 TTL 到期而丢失互斥性。
//
// 任何一种失败（未抢到锁 / fn panic）都会安全释放锁。
func RunWithLock(ctx context.Context, lockKey string, ttl time.Duration, fn func()) {
	if ttl <= 0 {
		return
	}
	fullKey := "dlock:" + lockKey
	token := genLockToken()
	ok, err := rdb.SetNX(ctx, fullKey, token, ttl).Result()
	if err != nil || !ok {
		return
	}

	// 启动续期 goroutine：每 ttl/3 续一次（经典做法，留足重试窗口）。
	renewCtx, cancelRenew := context.WithCancel(ctx)
	renewDone := make(chan struct{})
	safego.Go("cache-dlock-renew", func() {
		defer close(renewDone)
		interval := ttl / 3
		if interval < 500*time.Millisecond {
			interval = 500 * time.Millisecond
		}
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		ttlMs := ttl.Milliseconds()
		for {
			select {
			case <-renewCtx.Done():
				return
			case <-ticker.C:
				if _, err := extendIfOwnerScript.Run(renewCtx, rdb, []string{fullKey}, token, ttlMs).Result(); err != nil {
					// 续期失败（网络/已失主）：停止续期，fn 结束时按 owner-scoped 释放兜底
					return
				}
			}
		}
	})

	defer func() {
		cancelRenew()
		<-renewDone
		// 用独立 ctx 释放锁，即使业务 ctx 已被取消也要确保释放（否则锁要等 TTL 自然过期）
		releaseCtx, releaseCancel := ctxutil.With(ctxutil.CacheWrite)
		defer releaseCancel()
		_, _ = unlockIfOwnerScript.Run(releaseCtx, rdb, []string{fullKey}, token).Result()
	}()

	fn()
}

// genLockToken 生成一次性 owner token。fallback 到时间戳避免 rand 读取失败。
func genLockToken() string {
	var buf [16]byte
	if _, err := cryptorand.Read(buf[:]); err != nil {
		return fmt.Sprintf("t-%d-%d", time.Now().UnixNano(), rand.Int63())
	}
	return fmt.Sprintf("%x", buf[:])
}

// Close closes the Redis connection
func Close() error {
	if rdb != nil {
		return rdb.Close()
	}
	return nil
}
