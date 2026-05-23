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
type Client struct {
	baseURL       string
	adminUser     string
	adminPassword string
	websiteID     string

	http *http.Client

	mu    sync.RWMutex
	token string
}

// NewClient 构造。baseURL/admin* 都允许覆盖,缺省时用上面的默认值。
// 一般直接传空 ("") 让默认生效,只有改默认账号或单独跑 umami 时才需要传。
func NewClient(baseURL, adminUser, adminPassword, websiteID string) *Client {
	if baseURL == "" {
		baseURL = defaultBaseURL
	}
	if adminUser == "" {
		adminUser = defaultAdminUser
	}
	if adminPassword == "" {
		adminPassword = defaultAdminPassword
	}
	return &Client{
		baseURL:       baseURL,
		adminUser:     adminUser,
		adminPassword: adminPassword,
		websiteID:     websiteID,
		http: &http.Client{
			Timeout: 8 * time.Second,
		},
	}
}

// WebsiteID 返回配置的 websiteID;未配置时调用方应给前端 503,而不是把空字符串拼进 URL。
func (c *Client) WebsiteID() string { return c.websiteID }

// Configured 是否配置了 websiteID;没配的话整个 analytics 模块就没意义。
func (c *Client) Configured() bool { return c.websiteID != "" }

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

// doGET 发起带 Bearer 的 GET,401 时清缓存重登重试一次
func (c *Client) doGET(ctx context.Context, path string, query url.Values) ([]byte, error) {
	full := c.baseURL + path
	if len(query) > 0 {
		full += "?" + query.Encode()
	}

	send := func() (*http.Response, error) {
		token, err := c.getToken(ctx)
		if err != nil {
			return nil, err
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, full, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Authorization", "Bearer "+token)
		return c.http.Do(req)
	}

	resp, err := send()
	if err != nil {
		return nil, err
	}
	if resp.StatusCode == http.StatusUnauthorized {
		resp.Body.Close()
		// 清缓存重登一次,再失败就上抛
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
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, fmt.Errorf("umami: read response: %w", err)
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("umami: %s -> %d: %s", path, resp.StatusCode, string(body))
	}
	return body, nil
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
	if !c.Configured() {
		return nil, errors.New("umami: WEBSITE_ID not configured")
	}
	body, err := c.doGET(ctx, "/api/websites/"+c.websiteID+"/stats", url.Values{
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
	if !c.Configured() {
		return nil, errors.New("umami: WEBSITE_ID not configured")
	}
	if unit != "hour" && unit != "day" && unit != "month" && unit != "year" {
		unit = "day"
	}
	body, err := c.doGET(ctx, "/api/websites/"+c.websiteID+"/pageviews", url.Values{
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
	if !c.Configured() {
		return nil, errors.New("umami: WEBSITE_ID not configured")
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
	body, err := c.doGET(ctx, "/api/websites/"+c.websiteID+"/metrics", url.Values{
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
	if !c.Configured() {
		return nil, errors.New("umami: WEBSITE_ID not configured")
	}
	body, err := c.doGET(ctx, "/api/websites/"+c.websiteID+"/active", nil)
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
