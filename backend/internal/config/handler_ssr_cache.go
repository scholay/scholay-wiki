// ============================================================================
// Scholay学术 V1.0
// 配置 Handler - SSR HTML 缓存（按路径独立 TTL 缓存）
// ============================================================================

package config

import (
	"sync"
	"time"
)

// ssrCache 按请求路径缓存前端渲染出的 HTML，带 TTL 过期与读写分离
type ssrCache struct {
	mu   sync.RWMutex
	data map[string]*htmlCacheEntry
	ttl  time.Duration
}

func newSSRCache(ttl time.Duration) *ssrCache {
	return &ssrCache{
		data: make(map[string]*htmlCacheEntry),
		ttl:  ttl,
	}
}

// get 若命中且未过期返回 (html, true)，否则返回 ("", false)
func (c *ssrCache) get(path string) (string, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if entry, ok := c.data[path]; ok && time.Since(entry.fetchedAt) < c.ttl {
		return entry.html, true
	}
	return "", false
}

// set 写入缓存（锁持有时间极短）
func (c *ssrCache) set(path, html string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.data[path] = &htmlCacheEntry{html: html, fetchedAt: time.Now()}
}

// invalidateAll 清空全部缓存；snippets 更新后调用以确保下一次请求拿到新内容
func (c *ssrCache) invalidateAll() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.data = make(map[string]*htmlCacheEntry)
}
