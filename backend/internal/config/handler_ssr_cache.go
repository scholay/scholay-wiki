// ============================================================================
// Scholay学术 V1.0
// 配置 Handler - SSR HTML 缓存（有界 LRU + TTL 过期清理）
// ============================================================================

package config

import (
	"container/list"
	"sync"
	"time"
)

// ssrCacheMaxEntries 条目数硬上限。SPA 壳对几乎所有路由是同一份,实际只需个位数条目;
// 设 512 是纯防御上限 —— 防止「全量爬取把 sitemap 宇宙(10^5~10^6 条 /paper/<slug>)的
// 每条路径都以一份壳常驻」→ backend OOM。这是恢复 SSR 路由前必须先堵的隐患。
const ssrCacheMaxEntries = 512

// ssrCache 按请求路径缓存前端渲染出的 HTML(SPA 壳),带 TTL 过期 + LRU 上限。
// 旧实现是无界 map + get 时不删过期项 → 唯一路径无限增长。现改为:
//   - 容器 list 维护 LRU 顺序;超上限逐出最久未用;
//   - get 命中过期项即删除(不再永久滞留);
//   - 锁用 Mutex(LRU 需在读路径上改 list 顺序,无法用 RWMutex 的读锁)。
type ssrCache struct {
	mu      sync.Mutex
	ll      *list.List               // front = 最近使用
	data    map[string]*list.Element // path → list element
	ttl     time.Duration
	maxSize int
}

type ssrCacheItem struct {
	path      string
	html      string
	fetchedAt time.Time
}

func newSSRCache(ttl time.Duration) *ssrCache {
	return &ssrCache{
		ll:      list.New(),
		data:    make(map[string]*list.Element),
		ttl:     ttl,
		maxSize: ssrCacheMaxEntries,
	}
}

// get 命中且未过期返回 (html, true);过期则顺手删除该项并返回 ("", false)。
func (c *ssrCache) get(path string) (string, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	el, ok := c.data[path]
	if !ok {
		return "", false
	}
	item := el.Value.(*ssrCacheItem)
	if time.Since(item.fetchedAt) >= c.ttl {
		c.ll.Remove(el)
		delete(c.data, path)
		return "", false
	}
	c.ll.MoveToFront(el)
	return item.html, true
}

// set 写入/更新缓存;超过 maxSize 逐出最久未用项。
func (c *ssrCache) set(path, html string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if el, ok := c.data[path]; ok {
		item := el.Value.(*ssrCacheItem)
		item.html = html
		item.fetchedAt = time.Now()
		c.ll.MoveToFront(el)
		return
	}
	el := c.ll.PushFront(&ssrCacheItem{path: path, html: html, fetchedAt: time.Now()})
	c.data[path] = el
	for c.ll.Len() > c.maxSize {
		oldest := c.ll.Back()
		if oldest == nil {
			break
		}
		c.ll.Remove(oldest)
		delete(c.data, oldest.Value.(*ssrCacheItem).path)
	}
}

// invalidateAll 清空全部缓存;snippets / meta 更新后调用以确保下一次请求拿到新内容。
func (c *ssrCache) invalidateAll() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.ll = list.New()
	c.data = make(map[string]*list.Element)
}
