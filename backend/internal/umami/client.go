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
// 上游调用走 common/upstream — 统一观测 / 错误分类 / breaker; 鉴权的 401
// 重登逻辑保留在本包内 (跟 token 缓存绑定, 不放进 upstream 通用层)。
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
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"scholar-backend/internal/common/upstream"
)

// getEnvOr 读 env,空白值等同未设置(避免 compose 里 `VAR:` 传空串把默认值顶掉)。
func getEnvOr(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

// 默认走内网 service name,本项目 docker network 上 umami 容器 hostname 就是 umami。
// 改这个意味着 docker-compose service 名字也要改。
// DefaultBaseURL 导出:internal/crawlerwatch 的爬虫监控旁路复用同一默认地址
// (UMAMI_CRAWLER_BASE_URL 未 override 时)。
const (
	DefaultBaseURL       = "http://umami:3000"
	defaultAdminUser     = "admin"
	defaultAdminPassword = "umami"
)

// Client 是 backend → umami 的轻量 HTTP 客户端,内置 token 缓存 + 401 自动重登。
type Client struct {
	baseURL             string
	adminUser           string
	adminPassword       string
	configuredWebsiteID string // 来自 env,允许空
	siteName            string // 自动建 website 时用的 name
	siteDomain          string // 自动建 website 时用的 domain

	up *upstream.Client // 走 common/upstream — 自动观测 + breaker

	mu              sync.RWMutex
	token           string
	cachedWebsiteID string
	bootstrapMu     sync.Mutex // 串行化首次 EnsureWebsiteID
}

// NewClient 构造。baseURL/admin* 都允许覆盖,缺省时用上面的默认值。
//
// websiteID 留空 → backend 自动 bootstrap (见 Client.EnsureWebsiteID)。
// siteName/siteDomain 给 bootstrap 时新建 website 用。
func NewClient(baseURL, adminUser, adminPassword, websiteID, siteName, siteDomain string) *Client {
	return newClient("umami", baseURL, adminUser, adminPassword, websiteID, siteName, siteDomain)
}

// NewCrawlerClient 爬虫监控专用 website 的查询客户端(internal/crawlerwatch 写入,
// 这里只读)。与主统计客户端的差别:
//   - websiteID 必填 —— 空 = 功能未配置,调用方应传 nil Client 而不是让这里 bootstrap
//     出一个新 website(爬虫监控站点必须是管理员显式建的独立站点,自动建会静默把
//     事件写进一个没人知道 ID 的站点);
//   - upstream 名独立("umami-crawler"),CrawlerBaseURL 指向别处时 breaker 状态
//     不跟主统计串。
func NewCrawlerClient(baseURL, websiteID string) *Client {
	return newClient("umami-crawler", baseURL, "", "", websiteID, "", "")
}

func newClient(upstreamName, baseURL, adminUser, adminPassword, websiteID, siteName, siteDomain string) *Client {
	if baseURL == "" {
		baseURL = DefaultBaseURL
	}
	// umami 管理员凭据:优先 env,再回落 umami 的出厂默认。
	// 需要 env 的理由很实在 —— 新装一个 umami 实例时按安全实践把默认口令 admin/umami
	// 改掉是常规操作,而 backend 拿统计数据靠登录 umami,凭据写死就意味着「一改口令,
	// /admin/analytics 四个面板同时哑掉」,且报错只是 401 看不出根因。
	if adminUser == "" {
		adminUser = getEnvOr("UMAMI_ADMIN_USER", defaultAdminUser)
	}
	if adminPassword == "" {
		adminPassword = getEnvOr("UMAMI_ADMIN_PASSWORD", defaultAdminPassword)
	}
	if siteDomain == "" {
		siteDomain = "localhost"
	}
	// 自动建 website 时的显示名:没配 SITE_NAME 就用域名本身,**不回落品牌名** ——
	// 回落成固定品牌名会让每个新环境的统计面板都自称同一个站点,两套环境的数据
	// 在人眼里分不开(数据本身是分库存的,混淆的是判读)。
	if siteName == "" {
		siteName = siteDomain
	}
	// 8s 超时跟原实现一致 — umami 多在 1s 内回, 8s 是个稳健 timeout
	hc := &http.Client{Timeout: 8 * time.Second}
	up := upstream.New(upstreamName).
		BaseURL(baseURL).
		HTTPClient(hc).
		Breaker(upstream.BreakerConfig{
			MaxRequests:  3,
			MinRequests:  5,
			FailureRatio: 0.6,
			Timeout:      30 * time.Second,
		}).
		MustBuild()
	return &Client{
		baseURL:             baseURL,
		adminUser:           adminUser,
		adminPassword:       adminPassword,
		configuredWebsiteID: websiteID,
		siteName:            siteName,
		siteDomain:          siteDomain,
		up:                  up,
	}
}

// EnsureWebsiteID 返回可用的 website id,带 bootstrap 逻辑。
// 详见原注释 — 实现没改, 只是调用底层 send/sendAuthed 切到 upstream。
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

func (c *Client) discoverOrCreateWebsite(ctx context.Context) (string, error) {
	// 1) list
	listBody, err := c.sendAuthed(ctx, http.MethodGet, "/api/websites", nil, nil)
	if err != nil {
		return "", fmt.Errorf("umami: list websites: %w", err)
	}
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
	for _, w := range rows {
		if w.Domain == c.siteDomain {
			return w.ID, nil
		}
	}
	if len(rows) > 0 {
		return rows[0].ID, nil
	}

	// 2) create
	createBody, err := c.sendAuthed(ctx, http.MethodPost, "/api/websites", nil, map[string]string{
		"name":   c.siteName,
		"domain": c.siteDomain,
	})
	if err != nil {
		return "", fmt.Errorf("umami: create website: %w", err)
	}
	var created wsRow
	if err := json.Unmarshal(createBody, &created); err != nil || created.ID == "" {
		return "", fmt.Errorf("umami: parse create website response: %w (body=%s)", err, string(createBody))
	}
	return created.ID, nil
}

func (c *Client) SiteDomain() string { return c.siteDomain }

// ─── 鉴权 ────────────────────────────────────────────────────────────────

// login 拿 fresh token, 写入缓存。走 upstream.Client 但不带 Bearer。
func (c *Client) login(ctx context.Context) (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	resp, err := c.up.Do(ctx, upstream.Request{
		Method: http.MethodPost,
		Path:   "/api/auth/login",
		BodyJSON: map[string]string{
			"username": c.adminUser,
			"password": c.adminPassword,
		},
	})
	if err != nil {
		return "", fmt.Errorf("umami: login: %w", err)
	}
	var data struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(resp.Body, &data); err != nil {
		return "", fmt.Errorf("umami: parse login response: %w", err)
	}
	if data.Token == "" {
		return "", errors.New("umami: login response has no token field")
	}
	c.token = data.Token
	slog.Info("umami token cached (TTL until 401)")
	return c.token, nil
}

// getToken 取缓存 token, 空时主动登一次
func (c *Client) getToken(ctx context.Context) (string, error) {
	c.mu.RLock()
	t := c.token
	c.mu.RUnlock()
	if t != "" {
		return t, nil
	}
	return c.login(ctx)
}

// sendAuthed 发起带 Bearer 的请求, 401 时清 token 重登一次。
// method/path/query/body 跟 upstream.Request 一致; body=nil 时不带 body, body=any 时 JSON marshal。
func (c *Client) sendAuthed(ctx context.Context, method, path string, query url.Values, body any) ([]byte, error) {
	send := func() ([]byte, int, error) {
		token, err := c.getToken(ctx)
		if err != nil {
			return nil, 0, err
		}
		req := upstream.Request{
			Method: method, Path: path, Query: query,
			Headers: http.Header{"Authorization": []string{"Bearer " + token}},
		}
		if body != nil {
			req.BodyJSON = body
		}
		resp, err := c.up.Do(ctx, req)
		if err != nil {
			var ue *upstream.Error
			if errors.As(err, &ue) {
				return nil, ue.Status, err
			}
			return nil, 0, err
		}
		return resp.Body, resp.StatusCode, nil
	}

	respBody, status, err := send()
	if err != nil && errors.Is(err, upstream.ErrAuth) {
		// 401 → 清 token + 重登 + 重试一次
		c.mu.Lock()
		c.token = ""
		c.mu.Unlock()
		slog.Warn("umami 401, refreshing token and retrying once")
		respBody, status, err = send()
	}
	_ = status
	if err != nil {
		return nil, fmt.Errorf("umami: %s %s: %w", method, path, err)
	}
	return respBody, nil
}

// ─── API 方法 (原样, 只是把 doGET 换成 sendAuthed) ──────────────────────

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
	body, err := c.sendAuthed(ctx, http.MethodGet, "/api/websites/"+id+"/stats", url.Values{
		"startAt": {msStr(startAt)},
		"endAt":   {msStr(endAt)},
	}, nil)
	if err != nil {
		return nil, err
	}
	var out Stats
	if err := json.Unmarshal(body, &out); err != nil {
		return nil, fmt.Errorf("umami: parse stats: %w", err)
	}
	return &out, nil
}

type SeriesPoint struct {
	X string `json:"x"`
	Y uint64 `json:"y"`
}
type PageviewsSeries struct {
	Pageviews []SeriesPoint `json:"pageviews"`
	Sessions  []SeriesPoint `json:"sessions"`
}

// platformTZName 返回平台当前的 IANA 时区名,跟随容器 TZ —— 不硬编码、不做 UTC 转换。
// umami 服务端按此参数切日桶,契约要求 IANA 名。容器用 TZ=Asia/Shanghai 名字形式时
// time.Local.String() 直接给出该名并自动跟随;若容器用 TZ=:/etc/localtime 文件形式,
// Go 无法反解 IANA 名(只报 "Local"),此时回落平台默认(单区部署 = 北京)。
func platformTZName() string {
	if n := time.Local.String(); n != "" && n != "Local" && n != "UTC" {
		return n
	}
	return "Asia/Shanghai"
}

func (c *Client) Pageviews(ctx context.Context, startAt, endAt time.Time, unit string) (*PageviewsSeries, error) {
	id, err := c.EnsureWebsiteID(ctx)
	if err != nil {
		return nil, err
	}
	if unit != "hour" && unit != "day" && unit != "month" && unit != "year" {
		unit = "day"
	}
	body, err := c.sendAuthed(ctx, http.MethodGet, "/api/websites/"+id+"/pageviews", url.Values{
		"startAt":  {msStr(startAt)},
		"endAt":    {msStr(endAt)},
		"unit":     {unit},
		"timezone": {platformTZName()},
	}, nil)
	if err != nil {
		return nil, err
	}
	var out PageviewsSeries
	if err := json.Unmarshal(body, &out); err != nil {
		return nil, fmt.Errorf("umami: parse pageviews: %w", err)
	}
	return &out, nil
}

type MetricRow struct {
	X string `json:"x"`
	Y uint64 `json:"y"`
}

func (c *Client) Metrics(ctx context.Context, startAt, endAt time.Time, mtype string, limit int) ([]MetricRow, error) {
	id, err := c.EnsureWebsiteID(ctx)
	if err != nil {
		return nil, err
	}
	allowed := map[string]bool{
		"url": true, "referrer": true, "country": true,
		"browser": true, "os": true, "device": true,
		// event = 自定义事件名计数(爬虫监控里事件名就是引擎 key)
		"event": true,
	}
	if !allowed[mtype] {
		return nil, fmt.Errorf("umami: unsupported metric type %q", mtype)
	}
	if limit <= 0 || limit > 50 {
		limit = 10
	}
	body, err := c.sendAuthed(ctx, http.MethodGet, "/api/websites/"+id+"/metrics", url.Values{
		"startAt": {msStr(startAt)},
		"endAt":   {msStr(endAt)},
		"type":    {mtype},
		"limit":   {strconv.Itoa(limit)},
	}, nil)
	if err != nil {
		return nil, err
	}
	var out []MetricRow
	if err := json.Unmarshal(body, &out); err != nil {
		return nil, fmt.Errorf("umami: parse metrics(%s): %w", mtype, err)
	}
	return out, nil
}

// EventSeriesRow —— GET /api/websites/:id/events/series 一行:
// x = 事件名(爬虫监控里即引擎 key),t = 时间桶(请求 timezone 下的
// "YYYY-MM-DD HH:00:00",unit=hour/day 都是这个格式),y = 次数。
//
// 🔴 为什么需要这个端点(2026-08-11 对 umami 2.20.2 逐端点实测):
// 带 name 的自定义事件(/api/send type=event)在 umami 里是 event_type=2,
// 而 /pageviews、/stats、/metrics?type=url、reports/insights 全部只统计
// event_type=1 的 pageview —— 对爬虫监控站点它们**恒返回空**。
// 自定义事件的时间序列只有 /events/series 给得出。
type EventSeriesRow struct {
	X string `json:"x"`
	T string `json:"t"`
	Y uint64 `json:"y"`
}

// EventsSeries 自定义事件时间序列(按事件名 × 时间桶)。unit 只认 hour/day。
func (c *Client) EventsSeries(ctx context.Context, startAt, endAt time.Time, unit string) ([]EventSeriesRow, error) {
	id, err := c.EnsureWebsiteID(ctx)
	if err != nil {
		return nil, err
	}
	if unit != "hour" && unit != "day" {
		unit = "day"
	}
	body, err := c.sendAuthed(ctx, http.MethodGet, "/api/websites/"+id+"/events/series", url.Values{
		"startAt":  {msStr(startAt)},
		"endAt":    {msStr(endAt)},
		"unit":     {unit},
		"timezone": {platformTZName()},
	}, nil)
	if err != nil {
		return nil, err
	}
	var out []EventSeriesRow
	if err := json.Unmarshal(body, &out); err != nil {
		return nil, fmt.Errorf("umami: parse events series: %w", err)
	}
	return out, nil
}

// EventDataField —— GET /api/websites/:id/event-data/fields 一行:
// 事件 data 属性的取值分布(propertyName/value/total)。爬虫监控事件的 data
// 是 {engine, status},所以 propertyName=="status" 的行即 HTTP 状态码分布。
type EventDataField struct {
	PropertyName string `json:"propertyName"`
	DataType     int    `json:"dataType"`
	Value        string `json:"value"`
	Total        uint64 `json:"total"`
}

// EventDataFields 事件 data 属性取值分布。
func (c *Client) EventDataFields(ctx context.Context, startAt, endAt time.Time) ([]EventDataField, error) {
	id, err := c.EnsureWebsiteID(ctx)
	if err != nil {
		return nil, err
	}
	body, err := c.sendAuthed(ctx, http.MethodGet, "/api/websites/"+id+"/event-data/fields", url.Values{
		"startAt": {msStr(startAt)},
		"endAt":   {msStr(endAt)},
	}, nil)
	if err != nil {
		return nil, err
	}
	var out []EventDataField
	if err := json.Unmarshal(body, &out); err != nil {
		return nil, fmt.Errorf("umami: parse event-data fields: %w", err)
	}
	return out, nil
}

type ActiveVisitors struct {
	Visitors uint64 `json:"visitors"`
}

func (c *Client) Active(ctx context.Context) (*ActiveVisitors, error) {
	id, err := c.EnsureWebsiteID(ctx)
	if err != nil {
		return nil, err
	}
	body, err := c.sendAuthed(ctx, http.MethodGet, "/api/websites/"+id+"/active", nil, nil)
	if err != nil {
		return nil, err
	}
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

func msStr(t time.Time) string {
	return strconv.FormatInt(t.UnixMilli(), 10)
}
