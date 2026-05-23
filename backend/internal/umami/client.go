// ============================================================================
// internal/umami — backend → umami HTTP API 客户端
//
// 用途:admin /analytics 不再 iframe 嵌 umami 自己的 UI,改由前端调本项目的
// /api/v1/admin/analytics/* 接口,backend 在这一层去 umami 拿数据再返。
//
// 鉴权:
//   - umami v2/v3 的 API token 走 `Authorization: Bearer <jwt>`
//   - JWT 用 POST /api/auth/login (默认 admin/umami) 拿,缓存到内存,401 自动重登
//   - APP_SECRET 是 umami 容器自身签 token 用的,backend 不直接消费
//
// umami 端可读路径(本客户端用到的):
//   POST /api/auth/login                              拿 token
//   GET  /api/websites/:id/stats?startAt&endAt        概览(pageviews/visits/visitors/bounces)
//   GET  /api/websites/:id/pageviews?startAt&endAt&unit  时间序列(unit=hour|day|month)
//   GET  /api/websites/:id/metrics?startAt&endAt&type&limit  TOP 维度(url/referrer/country/browser/os/device)
//   GET  /api/websites/:id/active                     当前活跃访客
// ============================================================================

package umami

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strconv"
	"sync"
	"time"
)

// 默认走内网 service name,本项目 docker network 上 umami 容器 hostname 就是 umami。
// 改这个意味着 docker-compose service 名字也要改。
const (
	defaultBaseURL       = "http://umami:3000"
	defaultAdminUser     = "admin"
	defaultAdminPassword = "umami"
)

// Client 是 backend → umami 的轻量 HTTP 客户端,内置 token 缓存 + 401 自动重登。
//
// websiteID 来源优先级:
//  1. configuredWebsiteID 非空 (来自 UMAMI_WEBSITE_ID env) → 直接采用
//  2. 否则 → 首次需要时 list /api/websites, 空就 create, 拿第一个的 id,缓存
//     这样新装实例零手工:backend 起来后第一次 admin 进 /analytics 自动准备好 website。
type Client struct {
	baseURL             string
	adminUser           string
	adminPassword       string
	configuredWebsiteID string // 来自 env,允许空
	siteName            string // 自动建 website 时用的 name (默认从 SITE_NAME env 来)
	siteDomain          string // 自动建 website 时用的 domain (从 SITE_URL 去掉 scheme)

	http *http.Client

	mu              sync.RWMutex // 保护 token + cachedWebsiteID 的快读快写
	token           string
	cachedWebsiteID string       // bootstrap 后写入,后续直接读
	bootstrapMu     sync.Mutex   // 专门串行化 EnsureWebsiteID,避免并发首启时多个请求都去 POST 创建 website
}

// NewClient 构造。baseURL/admin* 都允许覆盖,缺省时用上面的默认值。
// 一般直接传空 ("") 让默认生效,只有改默认账号或单独跑 umami 时才需要传。
//
// websiteID 也可为空 —— 留空表示让 backend 自动 bootstrap (见 Client.EnsureWebsiteID)。
// siteName/siteDomain 给 bootstrap 时新建 website 用,domain 通常是 SITE_URL 去 scheme 后的 host。
func NewClient(baseURL, adminUser, adminPassword, websiteID, siteName, siteDomain string) *Client {
	if baseURL == "" {
		baseURL = defaultBaseURL
	}
	if adminUser == "" {
		adminUser = defaultAdminUser
	}
	if adminPassword == "" {
		adminPassword = defaultAdminPassword
	}
	if siteName == "" {
		siteName = "Scholay"
	}
	if siteDomain == "" {
		siteDomain = "localhost"
	}
	return &Client{
		baseURL:             baseURL,
		adminUser:           adminUser,
		adminPassword:       adminPassword,
		configuredWebsiteID: websiteID,
		siteName:            siteName,
		siteDomain:          siteDomain,
		http: &http.Client{
			Timeout: 8 * time.Second,
		},
	}
}

// EnsureWebsiteID 返回可用的 website id,带 bootstrap 逻辑:
//
//   1. 先返 configuredWebsiteID(env 显式配的);
//   2. 再返 cachedWebsiteID(上次 bootstrap 拿到的);
//   3. 都没有 → list /api/websites,拿第一个;
//   4. list 是空 → POST /api/websites 创建一个 (name=siteName, domain=siteDomain),
//      拿新建的 id;
//
// 并发安全:
//   - 快路径(已有 configured / cached)无锁
//   - 慢路径(首次 bootstrap)用独立的 bootstrapMu 串行化, 避免并发 create 多个 website
//   - 重要:不能持 c.mu 调 discoverOrCreate, 否则 getToken / doRequest 内部
//     再去 RLock 同一把锁直接死锁。c.mu 只在快读快写时用。
func (c *Client) EnsureWebsiteID(ctx context.Context) (string, error) {
	if c.configuredWebsiteID != "" {
		return c.configuredWebsiteID, nil
	}
	c.mu.RLock()
	cached := c.cachedWebsiteID
	c.mu.RUnlock()
	if cached != "" {
		return cached, nil
	}

	// 串行化首次 bootstrap, 第二个请求等第一个跑完直接走双检拿缓存
	c.bootstrapMu.Lock()
	defer c.bootstrapMu.Unlock()

	c.mu.RLock()
	cached = c.cachedWebsiteID
	c.mu.RUnlock()
	if cached != "" {
		return cached, nil
	}

	id, err := c.discoverOrCreateWebsite(ctx)
	if err != nil {
		return "", err
	}
	c.mu.Lock()
	c.cachedWebsiteID = id
	c.mu.Unlock()
	slog.Info("umami website id bootstrapped", "id", id, "name", c.siteName, "domain", c.siteDomain)
	return id, nil
}

// discoverOrCreateWebsite 实际执行 list-then-create。调用方须持有 c.mu。
func (c *Client) discoverOrCreateWebsite(ctx context.Context) (string, error) {
	// 1) list
	listBody, err := c.doGETNoCache(ctx, "/api/websites", nil)
	if err != nil {
		return "", fmt.Errorf("umami: list websites: %w", err)
	}
	// umami v2 返回 `{ data: [{id,name,domain,...}], count: N }`
	// v3+ 直接返数组。两种都吃。
	type wsRow struct {
		ID     string `json:"id"`
		Name   string `json:"name"`
		Domain string `json:"domain"`
	}
	var asObj struct {
		Data []wsRow `json:"data"`
	}
	var rows []wsRow
	trimmed := bytes.TrimSpace(listBody)
	if len(trimmed) > 0 && trimmed[0] == '{' {
		if err := json.Unmarshal(trimmed, &asObj); err == nil {
			rows = asObj.Data
		}
	} else {
		_ = json.Unmarshal(trimmed, &rows)
	}
	// 偏好按 domain 匹配,匹配不上就第一个
	for _, w := range rows {
		if w.Domain == c.siteDomain {
			return w.ID, nil
		}
	}
	if len(rows) > 0 {
		return rows[0].ID, nil
	}

	// 2) create
	payload, _ := json.Marshal(map[string]string{
		"name":   c.siteName,
		"domain": c.siteDomain,
	})
	createBody, err := c.doPOSTNoCache(ctx, "/api/websites", payload)
	if err != nil {
		return "", fmt.Errorf("umami: create website: %w", err)
	}
	var created wsRow
	if err := json.Unmarshal(createBody, &created); err != nil || created.ID == "" {
		return "", fmt.Errorf("umami: parse create website response: %w (body=%s)", err, string(createBody))
	}
	return created.ID, nil
}

// SiteDomain 返回客户端配置的 domain,前端拿来给 tracker hostname 调一致也方便定位。
func (c *Client) SiteDomain() string { return c.siteDomain }

// ---------------- 鉴权 ----------------

// login 拿一个 fresh token,写入缓存
func (c *Client) login(ctx context.Context) (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	payload, _ := json.Marshal(map[string]string{
		"username": c.adminUser,
		"password": c.adminPassword,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/api/auth/login", bytes.NewReader(payload))
	if err != nil {
		return "", fmt.Errorf("umami: build login request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return "", fmt.Errorf("umami: login http error: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return "", fmt.Errorf("umami: login status %d: %s", resp.StatusCode, string(body))
	}
	var data struct {
		Token string `json:"token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return "", fmt.Errorf("umami: parse login response: %w", err)
	}
	if data.Token == "" {
		return "", errors.New("umami: login response has no token field")
	}
	c.token = data.Token
	slog.Info("umami token cached (TTL until 401)")
	return c.token, nil
}

// getToken 取缓存 token,空时主动登一次
func (c *Client) getToken(ctx context.Context) (string, error) {
	c.mu.RLock()
	t := c.token
	c.mu.RUnlock()
	if t != "" {
		return t, nil
	}
	return c.login(ctx)
}

// doRequest 发起带 Bearer 的请求,401 时清 token 重登一次。method = GET / POST。
// body 仅 POST 用,GET 传 nil。query 仅 GET 用。
func (c *Client) doRequest(ctx context.Context, method, path string, query url.Values, body []byte) ([]byte, error) {
	full := c.baseURL + path
	if len(query) > 0 {
		full += "?" + query.Encode()
	}

	send := func() (*http.Response, error) {
		token, err := c.getToken(ctx)
		if err != nil {
			return nil, err
		}
		var reader io.Reader
		if body != nil {
			reader = bytes.NewReader(body)
		}
		req, err := http.NewRequestWithContext(ctx, method, full, reader)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Authorization", "Bearer "+token)
		if body != nil {
			req.Header.Set("Content-Type", "application/json")
		}
		return c.http.Do(req)
	}

	resp, err := send()
	if err != nil {
		return nil, err
	}
	if resp.StatusCode == http.StatusUnauthorized {
		resp.Body.Close()
		c.mu.Lock()
		c.token = ""
		c.mu.Unlock()
		slog.Warn("umami 401, refreshing token and retrying once")
		resp, err = send()
		if err != nil {
			return nil, err
		}
	}
	defer resp.Body.Close()
	respBody, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, fmt.Errorf("umami: read response: %w", err)
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("umami: %s %s -> %d: %s", method, path, resp.StatusCode, string(respBody))
	}
	return respBody, nil
}

// doGET 兼容旧调用点
func (c *Client) doGET(ctx context.Context, path string, query url.Values) ([]byte, error) {
	return c.doRequest(ctx, http.MethodGet, path, query, nil)
}

// doGETNoCache / doPOSTNoCache 给 discoverOrCreateWebsite 用,跟普通调用一样的 token + 401 处理。
func (c *Client) doGETNoCache(ctx context.Context, path string, query url.Values) ([]byte, error) {
	return c.doRequest(ctx, http.MethodGet, path, query, nil)
}
func (c *Client) doPOSTNoCache(ctx context.Context, path string, body []byte) ([]byte, error) {
	return c.doRequest(ctx, http.MethodPost, path, nil, body)
}

// ---------------- API 方法 ----------------

// Stats —— GET /api/websites/:id/stats
// 返回总 pageviews/visits/visitors/bounces/totaltime,各字段含 value 和 prev(上一周期),前端展示同比。
type StatsValue struct {
	Value uint64 `json:"value"`
	Prev  uint64 `json:"prev"`
}
type Stats struct {
	Pageviews StatsValue `json:"pageviews"`
	Visits    StatsValue `json:"visits"`
	Visitors  StatsValue `json:"visitors"`
	Bounces   StatsValue `json:"bounces"`
	TotalTime StatsValue `json:"totaltime"`
}

func (c *Client) Stats(ctx context.Context, startAt, endAt time.Time) (*Stats, error) {
	id, err := c.EnsureWebsiteID(ctx)
	if err != nil {
		return nil, err
	}
	body, err := c.doGET(ctx, "/api/websites/"+id+"/stats", url.Values{
		"startAt": {msStr(startAt)},
		"endAt":   {msStr(endAt)},
	})
	if err != nil {
		return nil, err
	}
	var out Stats
	if err := json.Unmarshal(body, &out); err != nil {
		return nil, fmt.Errorf("umami: parse stats: %w", err)
	}
	return &out, nil
}

// Pageviews —— GET /api/websites/:id/pageviews
// 返回 pageviews + sessions 两条按 unit 桶聚合的时间序列。
type SeriesPoint struct {
	X string `json:"x"` // 时间桶字符串,umami 自带,前端按需 parse
	Y uint64 `json:"y"`
}
type PageviewsSeries struct {
	Pageviews []SeriesPoint `json:"pageviews"`
	Sessions  []SeriesPoint `json:"sessions"`
}

func (c *Client) Pageviews(ctx context.Context, startAt, endAt time.Time, unit string) (*PageviewsSeries, error) {
	id, err := c.EnsureWebsiteID(ctx)
	if err != nil {
		return nil, err
	}
	if unit != "hour" && unit != "day" && unit != "month" && unit != "year" {
		unit = "day"
	}
	body, err := c.doGET(ctx, "/api/websites/"+id+"/pageviews", url.Values{
		"startAt": {msStr(startAt)},
		"endAt":   {msStr(endAt)},
		"unit":    {unit},
		// timezone 影响桶切分;固定上海,避免 UTC 桶在前端显示成"早 8 点"
		"timezone": {"Asia/Shanghai"},
	})
	if err != nil {
		return nil, err
	}
	var out PageviewsSeries
	if err := json.Unmarshal(body, &out); err != nil {
		return nil, fmt.Errorf("umami: parse pageviews: %w", err)
	}
	return &out, nil
}

// MetricRow 是 TOP 维度返回的一行 (x = 维度值,y = 计数)
type MetricRow struct {
	X string `json:"x"`
	Y uint64 `json:"y"`
}

// Metrics —— GET /api/websites/:id/metrics?type=url|referrer|country|browser|os|device|...
// 注意:umami 也支持 event/title/region/city/language/screen 等,这里收紧为 admin 页面会用到的 6 个。
func (c *Client) Metrics(ctx context.Context, startAt, endAt time.Time, mtype string, limit int) ([]MetricRow, error) {
	id, err := c.EnsureWebsiteID(ctx)
	if err != nil {
		return nil, err
	}
	allowed := map[string]bool{
		"url": true, "referrer": true, "country": true,
		"browser": true, "os": true, "device": true,
	}
	if !allowed[mtype] {
		return nil, fmt.Errorf("umami: unsupported metric type %q", mtype)
	}
	if limit <= 0 || limit > 50 {
		limit = 10
	}
	body, err := c.doGET(ctx, "/api/websites/"+id+"/metrics", url.Values{
		"startAt": {msStr(startAt)},
		"endAt":   {msStr(endAt)},
		"type":    {mtype},
		"limit":   {strconv.Itoa(limit)},
	})
	if err != nil {
		return nil, err
	}
	var out []MetricRow
	if err := json.Unmarshal(body, &out); err != nil {
		return nil, fmt.Errorf("umami: parse metrics(%s): %w", mtype, err)
	}
	return out, nil
}

// Active —— GET /api/websites/:id/active
// 返回当前(最近 5 分钟内)活跃访客数。
type ActiveVisitors struct {
	Visitors uint64 `json:"visitors"`
}

func (c *Client) Active(ctx context.Context) (*ActiveVisitors, error) {
	id, err := c.EnsureWebsiteID(ctx)
	if err != nil {
		return nil, err
	}
	body, err := c.doGET(ctx, "/api/websites/"+id+"/active", nil)
	if err != nil {
		return nil, err
	}
	// umami 有时返回 `[{visitors: N}]` 数组,有时返回 `{visitors: N}` —— 两种都吃下
	body = bytes.TrimSpace(body)
	if len(body) > 0 && body[0] == '[' {
		var arr []ActiveVisitors
		if err := json.Unmarshal(body, &arr); err != nil {
			return nil, fmt.Errorf("umami: parse active (array): %w", err)
		}
		if len(arr) == 0 {
			return &ActiveVisitors{}, nil
		}
		return &arr[0], nil
	}
	var out ActiveVisitors
	if err := json.Unmarshal(body, &out); err != nil {
		return nil, fmt.Errorf("umami: parse active: %w", err)
	}
	return &out, nil
}

// msStr 把时间转成 umami 接受的毫秒时间戳字符串
func msStr(t time.Time) string {
	return strconv.FormatInt(t.UnixMilli(), 10)
}
