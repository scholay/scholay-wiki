// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package cache

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"math/rand"
	"time"

	"github.com/redis/go-redis/v9"
	"golang.org/x/sync/singleflight"
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
		PoolSize:     100,               // Increased from 10 to match database connection pool scale
		MinIdleConns: 25,                // Increased from 5 to keep more warm connections
	})

	// Test connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
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
		if err := Set(ctx, key, v, expiration); err != nil {
			slog.Warn("Failed to cache value", "key", key, "err", err)
		}
		data, err := json.Marshal(v)
		if err != nil {
			return nil, fmt.Errorf("marshal error: %w", err)
		}
		return data, nil
	})
	if sferr != nil {
		return sferr
	}

	return json.Unmarshal(value.([]byte), result)
}

// InvalidatePattern deletes all keys matching a pattern
func InvalidatePattern(ctx context.Context, pattern string) error {
	const batchSize = 100
	var cursor uint64

	for {
		keys, nextCursor, err := rdb.Scan(ctx, cursor, pattern, int64(batchSize)).Result()
		if err != nil {
			return err
		}
		if len(keys) > 0 {
			pipe := rdb.Pipeline()
			for _, k := range keys {
				pipe.Del(ctx, k)
			}
			if _, err := pipe.Exec(ctx); err != nil {
				return err
			}
		}
		cursor = nextCursor
		if cursor == 0 {
			break
		}
	}
	return nil
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
func TryLock(ctx context.Context, key string, ttl time.Duration) (bool, error) {
	return rdb.SetNX(ctx, "dlock:"+key, "1", ttl).Result()
}

// Unlock releases a distributed lock.
func Unlock(ctx context.Context, key string) {
	rdb.Del(ctx, "dlock:"+key)
}

// RunWithLock runs fn only if the distributed lock is acquired.
// Useful for ensuring only one instance runs a scheduled task.
func RunWithLock(ctx context.Context, lockKey string, ttl time.Duration, fn func()) {
	acquired, err := TryLock(ctx, lockKey, ttl)
	if err != nil || !acquired {
		return
	}
	defer Unlock(ctx, lockKey)
	fn()
}

// Close closes the Redis connection
func Close() error {
	if rdb != nil {
		return rdb.Close()
	}
	return nil
}
