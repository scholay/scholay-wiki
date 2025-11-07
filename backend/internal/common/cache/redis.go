package cache

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

var rdb *redis.Client

// InitRedis initializes the Redis client
func InitRedis(host string, port string, password string, db int) error {
	addr := fmt.Sprintf("%s:%s", host, port)

	rdb = redis.NewClient(&redis.Options{
		Addr:         addr,
		Password:     password,
		DB:           db,
		DialTimeout:  5 * time.Second,
		ReadTimeout:  3 * time.Second,
		WriteTimeout: 3 * time.Second,
		PoolSize:     10,
		MinIdleConns: 5,
	})

	// Test connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := rdb.Ping(ctx).Err(); err != nil {
		return fmt.Errorf("failed to connect to Redis: %w", err)
	}

	fmt.Printf("✓ Redis connected successfully at %s\n", addr)
	return nil
}

// GetRedis returns the Redis client instance
func GetRedis() *redis.Client {
	return rdb
}

// Set sets a key-value pair with expiration
func Set(ctx context.Context, key string, value interface{}, expiration time.Duration) error {
	data, err := json.Marshal(value)
	if err != nil {
		return fmt.Errorf("failed to marshal value: %w", err)
	}

	return rdb.Set(ctx, key, data, expiration).Err()
}

// Get retrieves a value by key and unmarshals it into result
func Get(ctx context.Context, key string, result interface{}) error {
	val, err := rdb.Get(ctx, key).Result()
	if err != nil {
		return err
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

// GetOrSet retrieves from cache or fetches and caches the value with distributed locking
func GetOrSet(ctx context.Context, key string, expiration time.Duration, fetch func() (interface{}, error), result interface{}) error {
	// Try to get from cache
	err := Get(ctx, key, result)
	if err == nil {
		return nil // Cache hit
	}

	if err != redis.Nil {
		// Redis error, not a cache miss
		return fmt.Errorf("redis error: %w", err)
	}

	// Cache miss - use distributed lock to prevent stampede
	lockKey := "lock:" + key
	lockValue := fmt.Sprintf("%d", time.Now().UnixNano())
	lockExpiration := 10 * time.Second

	// Try to acquire lock
	acquired, err := SetNX(ctx, lockKey, lockValue, lockExpiration)
	if err != nil {
		return fmt.Errorf("lock error: %w", err)
	}

	if !acquired {
		// Another process is fetching, wait and retry cache read
		time.Sleep(100 * time.Millisecond)
		err := Get(ctx, key, result)
		if err == nil {
			return nil
		}
		// If still not cached, proceed to fetch
	}

	// Ensure lock is released
	defer Delete(ctx, lockKey)

	// Fetch the value
	value, err := fetch()
	if err != nil {
		return fmt.Errorf("fetch error: %w", err)
	}

	// Store in cache
	if err := Set(ctx, key, value, expiration); err != nil {
		// Log error but don't fail the request
		fmt.Printf("Warning: failed to cache value for key %s: %v\n", key, err)
	}

	// Marshal and unmarshal to populate result
	data, err := json.Marshal(value)
	if err != nil {
		return fmt.Errorf("marshal error: %w", err)
	}

	return json.Unmarshal(data, result)
}

// InvalidatePattern deletes all keys matching a pattern
func InvalidatePattern(ctx context.Context, pattern string) error {
	iter := rdb.Scan(ctx, 0, pattern, 0).Iterator()
	for iter.Next(ctx) {
		if err := rdb.Del(ctx, iter.Val()).Err(); err != nil {
			return err
		}
	}
	return iter.Err()
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
func SAdd(ctx context.Context, key string, members ...interface{}) error {
	return rdb.SAdd(ctx, key, members...).Err()
}

// SRem removes members from a set
func SRem(ctx context.Context, key string, members ...interface{}) error {
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

// Close closes the Redis connection
func Close() error {
	if rdb != nil {
		return rdb.Close()
	}
	return nil
}
