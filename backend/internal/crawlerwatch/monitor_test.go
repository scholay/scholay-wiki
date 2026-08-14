package crawlerwatch

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	googlebotUA = "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html) Chrome/126.0.0.0 Safari/537.36"
	chromeUA    = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)

// TestNewDisabledWithoutWebsiteID website id 为空 = 功能整体关闭:New 返 nil,
// 调用方(main.go)据此不挂中间件、不起 goroutine。
func TestNewDisabledWithoutWebsiteID(t *testing.T) {
	if m := New(Config{UmamiBaseURL: "http://umami:3000", Hostname: "www.scholay.com"}); m != nil {
		t.Fatalf("New with empty WebsiteID = %v, want nil (feature disabled)", m)
	}
}

// TestEnqueueOverflowDropsWithoutBlocking 队列满时 enqueue 必须立刻丢弃,
// 绝不能阻塞请求 goroutine(监控不能成为负载)。
func TestEnqueueOverflowDropsWithoutBlocking(t *testing.T) {
	m := New(Config{UmamiBaseURL: "http://umami:3000", WebsiteID: "w", Hostname: "h", queueSize: 8})
	// 刻意不 Start:没有消费者,第 9 条起必然走 drop 分支。

	done := make(chan struct{})
	go func() {
		for i := 0; i < 20; i++ {
			m.enqueue(event{engine: "google", path: "/paper/x", status: 200})
		}
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("enqueue blocked on full queue")
	}

	if got := m.dropped.Load(); got != 12 {
		t.Fatalf("dropped = %d, want 12 (20 enqueued, queue cap 8)", got)
	}
	if got := len(m.ch); got != 8 {
		t.Fatalf("queued = %d, want 8", got)
	}
}

// TestMiddlewareScope 中间件只对「已知爬虫 UA × 可抓取路径 × GET/HEAD」入队。
func TestMiddlewareScope(t *testing.T) {
	gin.SetMode(gin.TestMode)
	m := New(Config{UmamiBaseURL: "http://umami:3000", WebsiteID: "w", Hostname: "h", queueSize: 16})
	// 不 Start —— 只验证入队行为,不投递。

	router := gin.New()
	router.Use(m.Middleware())
	router.GET("/paper/:id", func(c *gin.Context) { c.Status(http.StatusOK) })
	router.POST("/paper/:id", func(c *gin.Context) { c.Status(http.StatusOK) })
	router.GET("/api/v1/ping", func(c *gin.Context) { c.Status(http.StatusOK) })
	router.HEAD("/robots.txt", func(c *gin.Context) { c.Status(http.StatusOK) })

	do := func(method, path, ua string) {
		t.Helper()
		req := httptest.NewRequest(method, path, nil)
		if ua != "" {
			req.Header.Set("User-Agent", ua)
		}
		router.ServeHTTP(httptest.NewRecorder(), req)
	}

	do(http.MethodGet, "/paper/abc", chromeUA)     // 真人 → 不计
	do(http.MethodGet, "/api/v1/ping", googlebotUA) // API 路径 → 不计
	do(http.MethodPost, "/paper/abc", googlebotUA)  // 非 GET/HEAD → 不计
	if got := len(m.ch); got != 0 {
		t.Fatalf("queued = %d after out-of-scope requests, want 0", got)
	}

	do(http.MethodGet, "/paper/abc", googlebotUA) // 爬虫 × SSR 页 → 计
	do(http.MethodHead, "/robots.txt", googlebotUA)
	if got := len(m.ch); got != 2 {
		t.Fatalf("queued = %d after in-scope requests, want 2", got)
	}
}

// TestSenderPayloadShape 端到端:中间件命中 → sender POST 到(httptest 假扮的)
// umami /api/send,校验载荷形状与出站 UA。
func TestSenderPayloadShape(t *testing.T) {
	gin.SetMode(gin.TestMode)

	type received struct {
		body []byte
		ua   string
		ct   string
	}
	got := make(chan received, 1)
	umamiSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/send" {
			t.Errorf("umami got path %q, want /api/send", r.URL.Path)
		}
		body, _ := io.ReadAll(r.Body)
		got <- received{body: body, ua: r.Header.Get("User-Agent"), ct: r.Header.Get("Content-Type")}
		w.WriteHeader(http.StatusOK)
	}))
	defer umamiSrv.Close()

	m := New(Config{UmamiBaseURL: umamiSrv.URL, WebsiteID: "site-crawler-1", Hostname: "www.scholay.com"})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	m.Start(ctx)

	router := gin.New()
	router.Use(m.Middleware())
	router.GET("/paper/:id", func(c *gin.Context) { c.Status(http.StatusOK) })

	req := httptest.NewRequest(http.MethodGet, "/paper/10.1234-abcd", nil)
	req.Header.Set("User-Agent", googlebotUA)
	router.ServeHTTP(httptest.NewRecorder(), req)

	var rec received
	select {
	case rec = <-got:
	case <-time.After(3 * time.Second):
		t.Fatal("umami /api/send not called within 3s")
	}

	// 出站 UA 必须是中性浏览器 UA —— umami 端 isbot 会拒掉含 bot 字样的 UA。
	if !strings.HasPrefix(rec.ua, "Mozilla/5.0") || strings.Contains(strings.ToLower(rec.ua), "bot") {
		t.Fatalf("outbound User-Agent %q must be browser-like without 'bot'", rec.ua)
	}
	if !strings.Contains(rec.ct, "application/json") {
		t.Fatalf("Content-Type = %q, want application/json", rec.ct)
	}

	var env struct {
		Type    string `json:"type"`
		Payload struct {
			Website  string `json:"website"`
			Hostname string `json:"hostname"`
			URL      string `json:"url"`
			Referrer string `json:"referrer"`
			Language string `json:"language"`
			Title    string `json:"title"`
			Name     string `json:"name"`
			Data     struct {
				Engine string `json:"engine"`
				Status int    `json:"status"`
			} `json:"data"`
		} `json:"payload"`
	}
	if err := json.Unmarshal(rec.body, &env); err != nil {
		t.Fatalf("payload not valid JSON: %v (body=%s)", err, rec.body)
	}
	if env.Type != "event" {
		t.Fatalf("type = %q, want event", env.Type)
	}
	p := env.Payload
	if p.Website != "site-crawler-1" || p.Hostname != "www.scholay.com" || p.URL != "/paper/10.1234-abcd" {
		t.Fatalf("payload website/hostname/url = %q/%q/%q, want site-crawler-1/www.scholay.com//paper/10.1234-abcd", p.Website, p.Hostname, p.URL)
	}
	if p.Name != "google" || p.Title != "google" {
		t.Fatalf("payload name/title = %q/%q, want google/google", p.Name, p.Title)
	}
	if p.Data.Engine != "google" || p.Data.Status != http.StatusOK {
		t.Fatalf("payload data = %+v, want engine=google status=200", p.Data)
	}
}
