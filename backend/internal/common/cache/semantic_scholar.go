// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

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
// Returns (found, error) - found=true if cache hit, found=false if cache miss
func GetCachedSearchResult(ctx context.Context, params map[string]interface{}, result interface{}) (bool, error) {
	key := GenerateCacheKey(scholarSearchPrefix, params)

	err := Get(ctx, key, result)
	if err != nil {
		if err.Error() == "redis: nil" {
			// Cache miss - caller should use GetOrSetSearchResult for stampede protection
			return false, nil
		}
		// Redis error
		return false, err
	}

	// Cache hit
	return true, nil
}

// GetOrSetSearchResult retrieves from cache or fetches with stampede protection
// This prevents multiple concurrent requests from hitting the API on cache miss
func GetOrSetSearchResult(ctx context.Context, params map[string]interface{}, fetchFn func() (interface{}, error), result interface{}) error {
	key := GenerateCacheKey(scholarSearchPrefix, params)
	return GetOrSet(ctx, key, searchCacheTTL, fetchFn, result)
}

// CachePaperDetails caches paper details by paperId and fields
// fields parameter ensures different field requests are cached separately
func CachePaperDetails(ctx context.Context, paperId string, fields []string, paper interface{}) error {
	params := map[string]interface{}{
		"paperId": paperId,
		"fields":  fields,
	}
	key := GenerateCacheKey(scholarPaperPrefix, params)
	return Set(ctx, key, paper, paperCacheTTL)
}

// GetCachedPaperDetails retrieves cached paper details by paperId and fields
// Only returns cached data if the exact same fields were requested
func GetCachedPaperDetails(ctx context.Context, paperId string, fields []string, result interface{}) (bool, error) {
	params := map[string]interface{}{
		"paperId": paperId,
		"fields":  fields,
	}
	key := GenerateCacheKey(scholarPaperPrefix, params)

	err := Get(ctx, key, result)
	if err != nil {
		if err.Error() == "redis: nil" {
			return false, nil
		}
		return false, err
	}

	return true, nil
}

// GetOrSetPaperDetails retrieves from cache or fetches with stampede protection
// fields parameter ensures cache key uniqueness for different field requests
func GetOrSetPaperDetails(ctx context.Context, paperId string, fields []string, fetchFn func() (interface{}, error), result interface{}) error {
	params := map[string]interface{}{
		"paperId": paperId,
		"fields":  fields,
	}
	key := GenerateCacheKey(scholarPaperPrefix, params)
	return GetOrSet(ctx, key, paperCacheTTL, fetchFn, result)
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

// GetOrSetAuthorDetails retrieves from cache or fetches with stampede protection
func GetOrSetAuthorDetails(ctx context.Context, authorId string, fetchFn func() (interface{}, error), result interface{}) error {
	key := fmt.Sprintf("%s:%s", scholarAuthorPrefix, authorId)
	return GetOrSet(ctx, key, authorCacheTTL, fetchFn, result)
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
