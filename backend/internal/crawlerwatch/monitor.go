// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================
//
// internal/crawlerwatch —— 服务端爬虫抓取监控(转发到独立 umami website)。
//
// 为什么要服务端旁路:umami 的常规采集是「页面里跑 JS tracker + 服务端 isbot
// 过滤」,两道机制都天生看不见爬虫(爬虫不执行 JS;就算执行,isbot 也会把含
// bot 字样的 UA 拒之门外)。本包在 gin 中间件层识别已知搜索引擎 / AI 爬虫的
// UA,把命中异步 POST 到 umami 的 /api/send,写进一个**专用**的爬虫监控
// website —— 于是各引擎的抓取量 / 时段分布 / 被抓页面直接用 umami 仪表盘看。
//
// 设计约束(生产教训:meta-externalagent 曾 48h 打了 2.8 万次):
//   - 监控本身绝不能成为负载。请求路径上只做 UA 子串匹配 + 入队,投递由
//     **唯一一个** sender goroutine 串行完成(umami /api/send 一次一条)。
//   - 队列满 = 直接丢事件 + 原子计数,WARN 限频到每分钟一条 —— 宁可丢监控
//     数据也不反压请求路径。
//   - UMAMI_CRAWLER_WEBSITE_ID 为空时 New 返回 nil,中间件根本不挂载,零开销。
//   - 关停:sender 跟随 ctx 取消退出(队列里未投递的事件随之丢弃 —— 这是
//     监控数据,不值得为它拖住优雅退出)。

package crawlerwatch

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"sync/atomic"
	"time"

	"scholar-backend/internal/common/safego"

	"github.com/gin-gonic/gin"
)

const (
	defaultQueueSize = 2000
	sendTimeout      = 3 * time.Second

	// relayUserAgent 出站 POST 用的 UA。umami 端 isbot 会拒掉含 bot 字样的
	// UA(事件直接不入库),这里是自家实例的服务端旁路 —— 不是伪装第三方,
	// 目标是我们自己的 umami 容器 —— 用中性浏览器 UA 保证入库。
	relayUserAgent = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)

// Config 监控配置。
type Config struct {
	// UmamiBaseURL umami 实例地址(如 http://umami:3000)。必填。
	UmamiBaseURL string
	// WebsiteID 专用「爬虫监控」website 的 UUID。空 = 功能整体关闭(New 返 nil)。
	// ⚠️ 必须是独立于用户统计站点的新 website,否则爬虫事件会污染真人 PV/UV。
	WebsiteID string
	// Hostname 事件的 hostname 字段,取 canonical host(www.scholay.com),
	// 与 SEO canonical 同口径。
	Hostname string

	// queueSize 事件队列容量,零值用 defaultQueueSize。仅测试覆盖用。
	queueSize int
}

// event 一次爬虫命中。
type event struct {
	engine string
	path   string
	status int
}

// Monitor 爬虫监控器:中间件入队,单 sender goroutine 出队投递。
type Monitor struct {
	sendURL   string
	websiteID string
	hostname  string

	ch         chan event
	httpClient *http.Client

	dropped      atomic.Uint64 // 队列满被丢弃的事件累计
	lastWarnUnix atomic.Int64  // WARN 限频水位(unix 秒)
}

// New 构造。cfg.WebsiteID 为空返回 nil —— 调用方以 nil 判定「功能关闭」,
// 不挂中间件、不起 goroutine,零开销。
func New(cfg Config) *Monitor {
	if cfg.WebsiteID == "" {
		return nil
	}
	qs := cfg.queueSize
	if qs <= 0 {
		qs = defaultQueueSize
	}
	return &Monitor{
		sendURL:    strings.TrimRight(cfg.UmamiBaseURL, "/") + "/api/send",
		websiteID:  cfg.WebsiteID,
		hostname:   cfg.Hostname,
		ch:         make(chan event, qs),
		httpClient: &http.Client{Timeout: sendTimeout},
	}
}

// Start 起唯一的 sender goroutine,ctx 取消即退出(safego 兜 panic)。
func (m *Monitor) Start(ctx context.Context) {
	safego.GoCtx(ctx, "crawlerwatch-sender", m.senderLoop)
}

// Middleware 请求路径上的识别 + 入队。挂在 CORS 之后、限流之前:
// 即使命中后续被限流 / 超时 / 404 的请求也计数(status 记 c.Next() 后的终值,
// 429/404 本身就是要观察的信号 —— Google 会把持续 429 记成站点限流压低抓取配额)。
func (m *Monitor) Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Method != http.MethodGet && c.Request.Method != http.MethodHead {
			c.Next()
			return
		}
		p := c.Request.URL.Path
		if !TrackablePath(p) {
			c.Next()
			return
		}
		engine, ok := ClassifyUA(c.Request.UserAgent())
		if !ok {
			c.Next()
			return
		}
		c.Next() // 先让请求走完,拿最终 status
		m.enqueue(event{engine: engine, path: p, status: c.Writer.Status()})
	}
}

// enqueue 非阻塞入队;队列满直接丢 + 计数(监控绝不反压请求路径)。
func (m *Monitor) enqueue(ev event) {
	select {
	case m.ch <- ev:
	default:
		n := m.dropped.Add(1)
		m.warnThrottled("crawlerwatch: event queue full, dropping", "dropped_total", n)
	}
}

// senderLoop 串行投递 —— umami /api/send 一次收一条事件,循环出队逐条 POST。
func (m *Monitor) senderLoop(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case ev := <-m.ch:
			m.send(ctx, ev)
		}
	}
}

// ── umami /api/send 载荷 ────────────────────────────────────────────────

type sendEnvelope struct {
	Type    string      `json:"type"`
	Payload sendPayload `json:"payload"`
}

type sendPayload struct {
	Website  string   `json:"website"`
	Hostname string   `json:"hostname"`
	URL      string   `json:"url"`
	Referrer string   `json:"referrer"`
	Language string   `json:"language"`
	Title    string   `json:"title"`
	Name     string   `json:"name"`
	Data     sendData `json:"data"`
}

type sendData struct {
	Engine string `json:"engine"`
	Status int    `json:"status"`
}

// send 单条事件 POST 到 umami。失败只限频 WARN,不重试不缓存 ——
// 丢一条监控事件的代价远小于让队列积压。
func (m *Monitor) send(ctx context.Context, ev event) {
	body, err := json.Marshal(sendEnvelope{
		Type: "event",
		Payload: sendPayload{
			Website:  m.websiteID,
			Hostname: m.hostname,
			URL:      ev.path,
			Title:    ev.engine, // name/title 都用引擎 key:umami 事件列表按它聚合
			Name:     ev.engine,
			Data:     sendData{Engine: ev.engine, Status: ev.status},
		},
	})
	if err != nil {
		return
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, m.sendURL, bytes.NewReader(body))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	// umami 端 isbot 会拒掉含 bot 字样的 UA —— 见 relayUserAgent 注释。
	req.Header.Set("User-Agent", relayUserAgent)

	resp, err := m.httpClient.Do(req)
	if err != nil {
		m.warnThrottled("crawlerwatch: umami send failed", "err", err)
		return
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096)) // 排干 body 复用连接
	if resp.StatusCode >= 400 {
		m.warnThrottled("crawlerwatch: umami send rejected", "status", resp.StatusCode)
	}
}

// warnThrottled 限频 WARN:全局最多每分钟一条(丢弃/失败在爬虫洪峰下是
// 每秒级的,不限频的话监控自己先把日志刷爆)。
func (m *Monitor) warnThrottled(msg string, args ...any) {
	now := time.Now().Unix()
	last := m.lastWarnUnix.Load()
	if now-last < 60 {
		return
	}
	if !m.lastWarnUnix.CompareAndSwap(last, now) {
		return // 并发下别人刚 WARN 过
	}
	slog.Warn(msg, args...)
}
