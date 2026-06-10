// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package utils

import (
	"container/list"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"strings"
	"sync"
	"time"

	"scholar-backend/internal/common/httpclient"
	"scholar-backend/internal/common/safego"
)

// IPLocation represents IP geolocation information
type IPLocation struct {
	Country     string `json:"country"`
	Province    string `json:"province"`
	City        string `json:"city"`
	ISP         string `json:"isp"`
	CountryCode string `json:"country_code"`
}

// IP API 响应结构 (ip-api.com)
type IPAPIResponse struct {
	Status      string  `json:"status"`
	Message     string  `json:"message"` // For error responses
	Country     string  `json:"country"`
	CountryCode string  `json:"countryCode"`
	Region      string  `json:"region"`
	RegionName  string  `json:"regionName"`
	City        string  `json:"city"`
	ISP         string  `json:"isp"`
	Org         string  `json:"org"`
	As          string  `json:"as"`
	Query       string  `json:"query"`
	Lat         float64 `json:"lat"`
	Lon         float64 `json:"lon"`
	Timezone    string  `json:"timezone"`
	Zip         string  `json:"zip"`
}

// ipCacheEntry represents a cached IP location with TTL
type ipCacheEntry struct {
	ip        string
	location  *IPLocation
	expiresAt time.Time
}

// ipLRUCache is an LRU cache with TTL for IP locations
type ipLRUCache struct {
	maxSize   int
	ttl       time.Duration
	cache     map[string]*list.Element
	lruList   *list.List
	mu        sync.RWMutex
}

// newIPLRUCache creates a new LRU cache with TTL
func newIPLRUCache(maxSize int, ttl time.Duration) *ipLRUCache {
	c := &ipLRUCache{
		maxSize: maxSize,
		ttl:     ttl,
		cache:   make(map[string]*list.Element),
		lruList: list.New(),
	}
	// Start background cleanup goroutine
	safego.Go("ip-lru-cache-cleanup", c.cleanupLoop)
	return c
}

// Get retrieves a value from the cache
func (c *ipLRUCache) Get(ip string) (*IPLocation, bool) {
	c.mu.RLock()
	elem, ok := c.cache[ip]
	if !ok {
		c.mu.RUnlock()
		return nil, false
	}
	entry := elem.Value.(*ipCacheEntry)
	// 锁内拷贝出 location 指针与过期判定 —— 锁外再读 entry.location 会与 Set 的锁内写
	// (entry.location = location) 构成数据竞争(-race 必标)。
	loc := entry.location
	expired := time.Now().After(entry.expiresAt)
	c.mu.RUnlock()

	if expired {
		c.mu.Lock()
		// 复核:可能已被并发 Set 刷新成另一个 element,只删仍是同一个 element 的,
		// 否则会误删并发刚写入的新项。
		if cur, ok := c.cache[ip]; ok && cur == elem {
			c.removeElement(elem)
		}
		c.mu.Unlock()
		return nil, false
	}

	// Move to front (most recently used)
	c.mu.Lock()
	c.lruList.MoveToFront(elem)
	c.mu.Unlock()

	return loc, true
}

// Set adds a value to the cache
func (c *ipLRUCache) Set(ip string, location *IPLocation) {
	c.mu.Lock()
	defer c.mu.Unlock()
	
	// Check if already exists
	if elem, ok := c.cache[ip]; ok {
		c.lruList.MoveToFront(elem)
		entry := elem.Value.(*ipCacheEntry)
		entry.location = location
		entry.expiresAt = time.Now().Add(c.ttl)
		return
	}
	
	// Evict oldest if at capacity
	if c.lruList.Len() >= c.maxSize {
		c.evictOldest()
	}
	
	// Add new entry
	entry := &ipCacheEntry{
		ip:        ip,
		location:  location,
		expiresAt: time.Now().Add(c.ttl),
	}
	elem := c.lruList.PushFront(entry)
	c.cache[ip] = elem
}

// removeElement removes an element from the cache (must hold write lock)
func (c *ipLRUCache) removeElement(elem *list.Element) {
	c.lruList.Remove(elem)
	entry := elem.Value.(*ipCacheEntry)
	delete(c.cache, entry.ip)
}

// evictOldest removes the oldest element (must hold write lock)
func (c *ipLRUCache) evictOldest() {
	elem := c.lruList.Back()
	if elem != nil {
		c.removeElement(elem)
	}
}

// cleanupLoop periodically removes expired entries
func (c *ipLRUCache) cleanupLoop() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		c.cleanupExpired()
	}
}

// cleanupExpired removes all expired entries
func (c *ipLRUCache) cleanupExpired() {
	c.mu.Lock()
	defer c.mu.Unlock()
	
	now := time.Now()
	var next *list.Element
	for elem := c.lruList.Back(); elem != nil; elem = next {
		next = elem.Prev()
		entry := elem.Value.(*ipCacheEntry)
		if now.After(entry.expiresAt) {
			c.removeElement(elem)
		}
	}
}

// Size returns the current cache size
func (c *ipLRUCache) Size() int {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.lruList.Len()
}

// Clear clears the cache
func (c *ipLRUCache) Clear() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.cache = make(map[string]*list.Element)
	c.lruList = list.New()
}

var (
	// IP 解析缓存 - 使用 LRU 缓存，最多 10000 条记录，TTL 1 小时
	ipAPICache = newIPLRUCache(10000, time.Hour)
	
	// HTTP 客户端
	httpClient = httpclient.WithTimeout(5 * time.Second)
	
	// API 限流（ip-api.com 免费版限制：45次/分钟）
	apiRateLimiter = make(chan struct{}, 45)
	rateLimitOnce  sync.Once
)

// initRateLimiter 初始化 API 限流器
func initRateLimiter() {
	rateLimitOnce.Do(func() {
		// 填充令牌桶
		for i := 0; i < 45; i++ {
			apiRateLimiter <- struct{}{}
		}
		
		// 每分钟补充令牌
		safego.Go("ip-parser-rate-refill", func() {
			ticker := time.NewTicker(time.Minute)
			defer ticker.Stop()
			for range ticker.C {
				// 补充令牌到45个
				for len(apiRateLimiter) < 45 {
					select {
					case apiRateLimiter <- struct{}{}:
					default:
						return
					}
				}
			}
		})
	})
}

// ParseIPLocation parses IP address to location using ip-api.com
func ParseIPLocation(ip string) *IPLocation {
	// Remove port if present
	if strings.Contains(ip, ":") {
		host, _, err := net.SplitHostPort(ip)
		if err == nil {
			ip = host
		}
	}

	// Parse the IP
	parsedIP := net.ParseIP(ip)
	if parsedIP == nil {
		return &IPLocation{
			Country:     "未知",
			Province:    "",
			City:        "",
			ISP:         "",
			CountryCode: "UNKNOWN",
		}
	}

	// Check for local/private IPs
	if isPrivateIP(parsedIP) {
		return &IPLocation{
			Country:     "本地",
			Province:    "",
			City:        "",
			ISP:         "局域网",
			CountryCode: "LOCAL",
		}
	}

	// Check LRU cache first (with TTL)
	if cached, ok := ipAPICache.Get(ip); ok {
		return cached
	}

	// Query API
	location := queryIPAPI(ip)
	
	// Cache the result in LRU cache (with TTL)
	if location != nil && location.Country != "未知" {
		ipAPICache.Set(ip, location)
	}

	return location
}

// queryIPAPI queries ip-api.com for IP location
func queryIPAPI(ip string) *IPLocation {
	// Initialize rate limiter
	initRateLimiter()
	
	// Try to get a token (with timeout)
	select {
	case <-apiRateLimiter:
		// Got token, proceed
	case <-time.After(2 * time.Second):
		// Timeout, use fallback
		return parseIPFallback(ip)
	}

	// Build API URL (with Chinese language support)
	apiURL := fmt.Sprintf("http://ip-api.com/json/%s?lang=zh-CN&fields=status,message,country,countryCode,region,regionName,city,isp,org,as,query", ip)

	// Make HTTP request
	resp, err := httpClient.Get(apiURL)
	if err != nil {
		return parseIPFallback(ip)
	}
	defer resp.Body.Close()

	// Read response body
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return parseIPFallback(ip)
	}

	// Parse JSON response
	var apiResp IPAPIResponse
	if err := json.Unmarshal(body, &apiResp); err != nil {
		return parseIPFallback(ip)
	}

	// Check if query was successful
	if apiResp.Status != "success" {
		return parseIPFallback(ip)
	}

	// Convert to our location format
	return &IPLocation{
		Country:     apiResp.Country,
		Province:    apiResp.RegionName,
		City:        apiResp.City,
		ISP:         apiResp.ISP,
		CountryCode: apiResp.CountryCode,
	}
}

// parseIPFallback provides a simple fallback when API is not available
func parseIPFallback(ip string) *IPLocation {
	// Simple heuristic based on IP ranges (very limited, for fallback only)
	
	octets := strings.Split(ip, ".")
	if len(octets) != 4 {
		// IPv6 or invalid
		return &IPLocation{
			Country:     "未知地区",
			Province:    "",
			City:        "",
			ISP:         "",
			CountryCode: "UNKNOWN",
		}
	}

	// Parse first octet for basic region detection
	firstOctet := octets[0]
	
	// China common IP ranges (major ISPs)
	chinaRanges := map[string]bool{
		"1": true, "14": true, "27": true, "36": true, "42": true,
		"58": true, "60": true, "61": true, "101": true, "106": true,
		"110": true, "111": true, "112": true, "113": true, "114": true,
		"115": true, "116": true, "117": true, "118": true, "119": true,
		"120": true, "121": true, "122": true, "123": true, "124": true,
		"125": true, "180": true, "183": true, "202": true, "203": true,
		"210": true, "211": true, "218": true, "219": true, "220": true,
		"221": true, "222": true, "223": true,
	}
	
	if chinaRanges[firstOctet] {
		return &IPLocation{
			Country:     "中国",
			Province:    "",
			City:        "",
			ISP:         "",
			CountryCode: "CN",
		}
	}
	
	// Try to identify some common international ranges
	location := detectInternationalIP(ip, firstOctet)
	if location != nil {
		return location
	}
	
	// Default to international for other IPs
	return &IPLocation{
		Country:     "国际",
		Province:    "",
		City:        "",
		ISP:         "",
		CountryCode: "INTL",
	}
}

// detectInternationalIP tries to detect international IP ranges
func detectInternationalIP(ip, firstOctet string) *IPLocation {
	// Common cloud providers and CDNs (easily identifiable)
	// These are very simplified checks
	
	// Cloudflare: 104.x, 172.64-172.71
	if firstOctet == "104" {
		return &IPLocation{
			Country:     "美国",
			Province:    "",
			City:        "",
			ISP:         "Cloudflare",
			CountryCode: "US",
		}
	}
	
	// Google Cloud: 34.x, 35.x
	if firstOctet == "34" || firstOctet == "35" {
		return &IPLocation{
			Country:     "美国",
			Province:    "",
			City:        "",
			ISP:         "Google Cloud",
			CountryCode: "US",
		}
	}
	
	// AWS: 3.x, 13.x, 18.x, 52.x, 54.x
	if firstOctet == "3" || firstOctet == "13" || firstOctet == "18" || 
	   firstOctet == "52" || firstOctet == "54" {
		return &IPLocation{
			Country:     "美国",
			Province:    "",
			City:        "",
			ISP:         "Amazon AWS",
			CountryCode: "US",
		}
	}
	
	// Microsoft Azure: 20.x, 40.x, 51.x
	if firstOctet == "20" || firstOctet == "40" || firstOctet == "51" {
		return &IPLocation{
			Country:     "美国",
			Province:    "",
			City:        "",
			ISP:         "Microsoft Azure",
			CountryCode: "US",
		}
	}
	
	// Common Asian ranges
	// Japan: 126.x, 133.x, 153.x, 160.x, 163.x
	if firstOctet == "126" || firstOctet == "133" || firstOctet == "153" ||
	   firstOctet == "160" || firstOctet == "163" {
		return &IPLocation{
			Country:     "日本",
			Province:    "",
			City:        "",
			ISP:         "",
			CountryCode: "JP",
		}
	}
	
	// South Korea: 59.x, 175.x
	if firstOctet == "59" || firstOctet == "175" {
		return &IPLocation{
			Country:     "韩国",
			Province:    "",
			City:        "",
			ISP:         "",
			CountryCode: "KR",
		}
	}
	
	// Singapore: 103.x
	if firstOctet == "103" {
		return &IPLocation{
			Country:     "新加坡",
			Province:    "",
			City:        "",
			ISP:         "",
			CountryCode: "SG",
		}
	}
	
	// Hong Kong: 43.x
	if firstOctet == "43" {
		return &IPLocation{
			Country:     "中国香港",
			Province:    "香港",
			City:        "",
			ISP:         "",
			CountryCode: "HK",
		}
	}
	
	return nil
}

// isPrivateIP checks if an IP is private/local
func isPrivateIP(ip net.IP) bool {
	if ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() {
		return true
	}

	// Check for private IP ranges
	privateRanges := []string{
		"10.0.0.0/8",
		"172.16.0.0/12",
		"192.168.0.0/16",
		"fc00::/7",
	}

	for _, cidr := range privateRanges {
		_, block, _ := net.ParseCIDR(cidr)
		if block.Contains(ip) {
			return true
		}
	}

	return false
}

// GetLocationString returns a formatted location string
func GetLocationString(location *IPLocation) string {
	if location == nil {
		return "未知"
	}

	if location.CountryCode == "LOCAL" {
		return "本地"
	}

	parts := []string{}
	
	if location.Country != "" && location.Country != "未知" {
		parts = append(parts, location.Country)
	}
	
	if location.Province != "" {
		parts = append(parts, location.Province)
	}
	
	if location.City != "" {
		parts = append(parts, location.City)
	}

	if len(parts) == 0 {
		return "未知"
	}

	result := strings.Join(parts, " ")
	
	// Add ISP if available
	if location.ISP != "" {
		result += " (" + location.ISP + ")"
	}

	return result
}

// GetSimpleLocationString returns a shorter location description without ISP
func GetSimpleLocationString(location *IPLocation) string {
	if location == nil {
		return "未知"
	}

	if location.CountryCode == "LOCAL" {
		return "本地"
	}

	parts := []string{}
	
	if location.Country != "" && location.Country != "未知" {
		parts = append(parts, location.Country)
	}
	
	if location.Province != "" {
		parts = append(parts, location.Province)
	}
	
	if location.City != "" {
		parts = append(parts, location.City)
	}

	if len(parts) == 0 {
		return "未知"
	}

	return strings.Join(parts, " ")
}

// ClearIPLocationCache clears the IP location cache
func ClearIPLocationCache() {
	ipAPICache.Clear()
}

// GetIPLocationCacheSize returns the current cache size
func GetIPLocationCacheSize() int {
	return ipAPICache.Size()
}
