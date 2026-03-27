// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package pdf

import (
	"log/slog"
	"sync"
	"time"
)

// Cache PDF 缓存（内存缓存）
// 注意：生产环境建议使用 Redis 缓存以支持分布式部署
type Cache struct {
	mu         sync.RWMutex
	data       map[string]*PDFCacheEntry
	ttl        time.Duration
	maxSize    int   // 最大缓存条目数
	maxMemory  int64 // 最大内存使用（字节）
	usedMemory int64 // 当前内存使用
}

// NewCache 创建新的缓存
func NewCache(ttl time.Duration) *Cache {
	c := &Cache{
		data:      make(map[string]*PDFCacheEntry),
		ttl:       ttl,
		maxSize:   1000,              // 最多缓存 1000 个 PDF
		maxMemory: 2 * 1024 * 1024 * 1024, // 最大 2GB 内存
	}

	// 启动清理协程
	go c.cleanupLoop()

	return c
}

// Get 获取缓存
func (c *Cache) Get(doi string) (*PDFCacheEntry, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	entry, ok := c.data[doi]
	if !ok {
		return nil, false
	}

	// 检查是否过期
	if time.Now().After(entry.ExpiresAt) {
		// 过期了，但不在这里删除（由清理协程处理）
		return nil, false
	}

	return entry, true
}

// Set 设置缓存
func (c *Cache) Set(doi string, entry *PDFCacheEntry) {
	c.mu.Lock()
	defer c.mu.Unlock()

	// 检查是否需要淘汰旧条目
	c.evictIfNeeded(entry.Size)

	// 如果已存在，先减去旧条目的大小
	if old, ok := c.data[doi]; ok {
		c.usedMemory -= old.Size
	}

	// 设置新条目
	entry.ExpiresAt = time.Now().Add(c.ttl)
	c.data[doi] = entry
	c.usedMemory += entry.Size

	slog.Info("PDF cache set", "doi", doi, "size", entry.Size, "total_entries", len(c.data), "memory_mb", c.usedMemory/(1024*1024))
}

// Delete 删除缓存
func (c *Cache) Delete(doi string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if entry, ok := c.data[doi]; ok {
		c.usedMemory -= entry.Size
		delete(c.data, doi)
	}
}

// evictIfNeeded 如果需要，淘汰旧条目（LRU 策略简化版：淘汰最早的条目）
// 调用前需要持有写锁
func (c *Cache) evictIfNeeded(newSize int64) {
	// 检查条目数量限制
	for len(c.data) >= c.maxSize {
		c.evictOldest()
	}

	// 检查内存限制
	for c.usedMemory+newSize > c.maxMemory && len(c.data) > 0 {
		c.evictOldest()
	}
}

// evictOldest 淘汰最早的条目
// 调用前需要持有写锁
func (c *Cache) evictOldest() {
	var oldestDOI string
	var oldestTime time.Time

	for doi, entry := range c.data {
		if oldestDOI == "" || entry.CreatedAt.Before(oldestTime) {
			oldestDOI = doi
			oldestTime = entry.CreatedAt
		}
	}

	if oldestDOI != "" {
		entry := c.data[oldestDOI]
		c.usedMemory -= entry.Size
		delete(c.data, oldestDOI)
		slog.Info("PDF cache evicted", "doi", oldestDOI, "created", oldestTime)
	}
}

// cleanupLoop 定期清理过期条目
func (c *Cache) cleanupLoop() {
	ticker := time.NewTicker(10 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		c.cleanup()
	}
}

// cleanup 清理过期条目
func (c *Cache) cleanup() {
	c.mu.Lock()
	defer c.mu.Unlock()

	now := time.Now()
	expiredDOIs := make([]string, 0)

	for doi, entry := range c.data {
		if now.After(entry.ExpiresAt) {
			expiredDOIs = append(expiredDOIs, doi)
		}
	}

	for _, doi := range expiredDOIs {
		entry := c.data[doi]
		c.usedMemory -= entry.Size
		delete(c.data, doi)
	}

	if len(expiredDOIs) > 0 {
		slog.Info("PDF cache cleanup", "expired", len(expiredDOIs), "remaining", len(c.data), "memory_mb", c.usedMemory/(1024*1024))
	}
}

// Stats 获取缓存统计信息
func (c *Cache) Stats() map[string]any {
	c.mu.RLock()
	defer c.mu.RUnlock()

	return map[string]any{
		"entries":     len(c.data),
		"max_entries": c.maxSize,
		"used_memory": c.usedMemory,
		"max_memory":  c.maxMemory,
		"ttl_seconds": c.ttl.Seconds(),
	}
}
