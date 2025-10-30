package cache

import (
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
func CacheSearchResult(params map[string]interface{}, result interface{}) error {
	key := GenerateCacheKey(scholarSearchPrefix, params)
	return Set(key, result, searchCacheTTL)
}

// GetCachedSearchResult retrieves a cached search result
func GetCachedSearchResult(params map[string]interface{}, result interface{}) (bool, error) {
	key := GenerateCacheKey(scholarSearchPrefix, params)

	err := Get(key, result)
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
func CachePaperDetails(paperId string, paper interface{}) error {
	key := fmt.Sprintf("%s:%s", scholarPaperPrefix, paperId)
	return Set(key, paper, paperCacheTTL)
}

// GetCachedPaperDetails retrieves cached paper details
func GetCachedPaperDetails(paperId string, result interface{}) (bool, error) {
	key := fmt.Sprintf("%s:%s", scholarPaperPrefix, paperId)

	err := Get(key, result)
	if err != nil {
		if err.Error() == "redis: nil" {
			return false, nil
		}
		return false, err
	}

	return true, nil
}

// CacheAuthorDetails caches author details by authorId
func CacheAuthorDetails(authorId string, author interface{}) error {
	key := fmt.Sprintf("%s:%s", scholarAuthorPrefix, authorId)
	return Set(key, author, authorCacheTTL)
}

// GetCachedAuthorDetails retrieves cached author details
func GetCachedAuthorDetails(authorId string, result interface{}) (bool, error) {
	key := fmt.Sprintf("%s:%s", scholarAuthorPrefix, authorId)

	err := Get(key, result)
	if err != nil {
		if err.Error() == "redis: nil" {
			return false, nil
		}
		return false, err
	}

	return true, nil
}

// InvalidateSearchCache invalidates all search caches
func InvalidateSearchCache() error {
	pattern := fmt.Sprintf("%s:*", scholarSearchPrefix)
	return InvalidatePattern(pattern)
}

// InvalidatePaperCache invalidates a specific paper cache
func InvalidatePaperCache(paperId string) error {
	key := fmt.Sprintf("%s:%s", scholarPaperPrefix, paperId)
	return Delete(key)
}

// InvalidateAuthorCache invalidates a specific author cache
func InvalidateAuthorCache(authorId string) error {
	key := fmt.Sprintf("%s:%s", scholarAuthorPrefix, authorId)
	return Delete(key)
}

// GetCacheStats returns cache statistics (for debugging/monitoring)
func GetCacheStats() (map[string]int64, error) {
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
