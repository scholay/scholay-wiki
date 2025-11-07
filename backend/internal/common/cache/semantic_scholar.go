package cache

import (
	"context"
	"crypto/md5"
	"encoding/hex"
	"fmt"
	"time"
)

const (
	scholarSearchPrefix = "scholar:search"
	scholarPaperPrefix  = "scholar:paper"
	scholarAuthorPrefix = "scholar:author"

	// Cache TTL settings
	searchCacheTTL = 24 * time.Hour // 搜索结果缓存1天
	paperCacheTTL  = 7 * 24 * time.Hour  // 论文详情缓存7天（论文信息变化慢）
	authorCacheTTL = 3 * 24 * time.Hour  // 作者信息缓存3天
)

// GenerateCacheKey generates a cache key from query parameters
// Uses MD5 hash of parameters for consistent key generation
func GenerateCacheKey(prefix string, params map[string]interface{}) string {
	// Create a stable string representation
	paramStr := fmt.Sprintf("%v", params)

	// Generate MD5 hash
	hash := md5.Sum([]byte(paramStr))
	hashStr := hex.EncodeToString(hash[:])

	return fmt.Sprintf("%s:%s", prefix, hashStr)
}

// CacheSearchResult caches a search result
// params should include: query, year, limit, offset, fields, etc.
func CacheSearchResult(ctx context.Context, params map[string]interface{}, result interface{}) error {
	key := GenerateCacheKey(scholarSearchPrefix, params)
	return Set(ctx, key, result, searchCacheTTL)
}

// GetCachedSearchResult retrieves a cached search result
func GetCachedSearchResult(ctx context.Context, params map[string]interface{}, result interface{}) (bool, error) {
	key := GenerateCacheKey(scholarSearchPrefix, params)

	err := Get(ctx, key, result)
	if err != nil {
		if err.Error() == "redis: nil" {
			// Cache miss
			return false, nil
		}
		// Redis error
		return false, err
	}

	// Cache hit
	return true, nil
}

// CachePaperDetails caches paper details by paperId
func CachePaperDetails(ctx context.Context, paperId string, paper interface{}) error {
	key := fmt.Sprintf("%s:%s", scholarPaperPrefix, paperId)
	return Set(ctx, key, paper, paperCacheTTL)
}

// GetCachedPaperDetails retrieves cached paper details
func GetCachedPaperDetails(ctx context.Context, paperId string, result interface{}) (bool, error) {
	key := fmt.Sprintf("%s:%s", scholarPaperPrefix, paperId)

	err := Get(ctx, key, result)
	if err != nil {
		if err.Error() == "redis: nil" {
			return false, nil
		}
		return false, err
	}

	return true, nil
}

// CacheAuthorDetails caches author details by authorId
func CacheAuthorDetails(ctx context.Context, authorId string, author interface{}) error {
	key := fmt.Sprintf("%s:%s", scholarAuthorPrefix, authorId)
	return Set(ctx, key, author, authorCacheTTL)
}

// GetCachedAuthorDetails retrieves cached author details
func GetCachedAuthorDetails(ctx context.Context, authorId string, result interface{}) (bool, error) {
	key := fmt.Sprintf("%s:%s", scholarAuthorPrefix, authorId)

	err := Get(ctx, key, result)
	if err != nil {
		if err.Error() == "redis: nil" {
			return false, nil
		}
		return false, err
	}

	return true, nil
}

// InvalidateSearchCache invalidates all search caches
func InvalidateSearchCache(ctx context.Context) error {
	pattern := fmt.Sprintf("%s:*", scholarSearchPrefix)
	return InvalidatePattern(ctx, pattern)
}

// InvalidatePaperCache invalidates a specific paper cache
func InvalidatePaperCache(ctx context.Context, paperId string) error {
	key := fmt.Sprintf("%s:%s", scholarPaperPrefix, paperId)
	return Delete(ctx, key)
}

// InvalidateAuthorCache invalidates a specific author cache
func InvalidateAuthorCache(ctx context.Context, authorId string) error {
	key := fmt.Sprintf("%s:%s", scholarAuthorPrefix, authorId)
	return Delete(ctx, key)
}

// GetCacheStats returns cache statistics (for debugging/monitoring)
func GetCacheStats(ctx context.Context) (map[string]int64, error) {
	stats := make(map[string]int64)

	// Count keys for each prefix
	prefixes := []string{scholarSearchPrefix, scholarPaperPrefix, scholarAuthorPrefix}

	for _, prefix := range prefixes {
		pattern := fmt.Sprintf("%s:*", prefix)

		count := int64(0)
		iter := GetRedis().Scan(ctx, 0, pattern, 0).Iterator()
		for iter.Next(ctx) {
			count++
		}

		if err := iter.Err(); err != nil {
			return nil, err
		}

		stats[prefix] = count
	}

	return stats, nil
}
