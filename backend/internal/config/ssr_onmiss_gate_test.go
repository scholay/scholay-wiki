package config

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"scholar-backend/internal/seo"

	"github.com/gin-gonic/gin"
)

// countingPaperEnricher 记录 on-miss 现拉被调用的次数 —— 这些测试全部只关心
// 「上游到底被调了没有」,断言的是花钱与否,不是渲染结果。
type countingPaperEnricher struct {
	mu    sync.Mutex
	calls int
}

func (e *countingPaperEnricher) EnrichPaperOnMiss(_ context.Context, source, id string) (*seo.PaperSSRMeta, error) {
	e.mu.Lock()
	e.calls++
	e.mu.Unlock()
	return &seo.PaperSSRMeta{PaperID: id, Source: source, Title: "现拉回来的论文", SEOIndexable: true}, nil
}

func (e *countingPaperEnricher) count() int {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.calls
}

type countingAuthorEnricher struct {
	mu    sync.Mutex
	calls int
}

func (e *countingAuthorEnricher) EnrichAuthorOnMiss(_ context.Context, source, id string) (*seo.AuthorSSRMeta, error) {
	e.mu.Lock()
	e.calls++
	e.mu.Unlock()
	return &seo.AuthorSSRMeta{AuthorID: id, Source: source, Name: "现拉回来的作者", SEOIndexable: true}, nil
}

func (e *countingAuthorEnricher) count() int {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.calls
}

const humanUA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"

// requestSSRFrom 与 requestSSR 同构,额外指定来源 IP(单 IP 上限的测试要用)。
func requestSSRFrom(t *testing.T, h *Handler, target, userAgent, ip string) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.NoRoute(h.ServeIndexHTML)
	req := httptest.NewRequest(http.MethodGet, target, nil)
	if userAgent != "" {
		req.Header.Set("User-Agent", userAgent)
	}
	if ip != "" {
		req.RemoteAddr = ip + ":51234"
	}
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)
	return recorder
}

// newOnMissTestHandler 造一个「seo 库里查不到 + 现拉器已接线」的 handler ——
// 也就是生产上爬虫每天命中 11.5 万次的那个形状。
func newOnMissTestHandler(t *testing.T) (*Handler, *countingPaperEnricher, *countingAuthorEnricher) {
	t.Helper()
	h := newSSRRoutingTestHandler(t)
	h.paperSEOProvider = stubPaperSEO{byID: func(string, string) (*seo.PaperSSRMeta, error) { return nil, nil }}
	h.authorSEOProvider = stubAuthorSEO{byID: func(string, string) (*seo.AuthorSSRMeta, error) { return nil, nil }}
	pe := &countingPaperEnricher{}
	ae := &countingAuthorEnricher{}
	h.paperEnricher = pe
	h.authorEnricher = ae
	return h, pe, ae
}

// TestSSROnMissSkipsUpstreamForCrawlers —— 本次改造的钱都省在这条断言上。
func TestSSROnMissSkipsUpstreamForCrawlers(t *testing.T) {
	tests := []struct {
		name      string
		userAgent string
		wantCalls int
	}{
		{
			name:      "meta external agent",
			userAgent: "meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)",
			wantCalls: 0,
		},
		{
			name:      "googlebot",
			userAgent: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
			wantCalls: 0,
		},
		{
			name:      "bytespider",
			userAgent: "Mozilla/5.0 (Linux; Android 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36 (compatible; Bytespider; spider-feedback@bytedance.com)",
			wantCalls: 0,
		},
		{
			name:      "unknown self declared bot",
			userAgent: "SomeRandomCrawler/1.0",
			wantCalls: 0,
		},
		{
			name:      "real browser",
			userAgent: humanUA,
			wantCalls: 1,
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			for _, entity := range []struct{ kind, target string }{
				{"paper", "/paper/olx/p-cold"},
				{"author", "/author/stc/a-cold"},
			} {
				h, pe, ae := newOnMissTestHandler(t)
				requestSSRFrom(t, h, entity.target, tc.userAgent, "203.0.113.7")
				got := pe.count()
				if entity.kind == "author" {
					got = ae.count()
				}
				if got != tc.wantCalls {
					t.Errorf("%s: upstream enrich calls = %d, want %d", entity.kind, got, tc.wantCalls)
				}
			}
		})
	}
}

// TestSSROnMissDeniedRendersNotFound 被闸门挡掉时的对外表现必须与「实体确实不存在」
// 完全一致:404 + noindex。给爬虫 200 软 404 会让它继续回来试。
func TestSSROnMissDeniedRendersNotFound(t *testing.T) {
	h, pe, _ := newOnMissTestHandler(t)
	rec := requestSSRFrom(t, h, "/paper/olx/p-cold", "Mozilla/5.0 (compatible; Googlebot/2.1)", "203.0.113.7")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusNotFound)
	}
	if robots := rec.Header().Get("X-Robots-Tag"); !strings.Contains(robots, "noindex") {
		t.Errorf("X-Robots-Tag = %q, want noindex", robots)
	}
	if pe.count() != 0 {
		t.Errorf("crawler triggered %d upstream calls, want 0", pe.count())
	}
}

// TestSSROnMissBudgetExhausted 谎报 UA 的爬虫走的是这条:UA 闸门放行,预算不放行。
func TestSSROnMissBudgetExhausted(t *testing.T) {
	h, pe, _ := newOnMissTestHandler(t)
	h.onMissGate = newOnMissGate(2, onMissPerIPHourly) // 全局每小时 2 次

	for i := 0; i < 5; i++ {
		// 每次换 IP,确保被拦住的是全局预算而不是单 IP 上限。
		requestSSRFrom(t, h, "/paper/olx/p-cold", humanUA, "198.51.100."+strconv.Itoa(i+1))
	}
	if pe.count() != 2 {
		t.Fatalf("upstream calls = %d, want 2 (hourly budget)", pe.count())
	}

	rec := requestSSRFrom(t, h, "/paper/olx/p-cold", humanUA, "198.51.100.9")
	if rec.Code != http.StatusNotFound {
		t.Errorf("over-budget status = %d, want %d", rec.Code, http.StatusNotFound)
	}
}

func TestSSROnMissPerIPLimit(t *testing.T) {
	h, pe, _ := newOnMissTestHandler(t)
	h.onMissGate = newOnMissGate(1000, 3) // 全局宽松,单 IP 每小时 3 次

	for i := 0; i < 6; i++ {
		requestSSRFrom(t, h, "/paper/olx/p-cold", humanUA, "198.51.100.5")
	}
	if pe.count() != 3 {
		t.Fatalf("same-IP upstream calls = %d, want 3 (per-IP cap)", pe.count())
	}
	// 另一个 IP 不受牵连:单 IP 上限不能退化成全局熔断。
	requestSSRFrom(t, h, "/paper/olx/p-cold", humanUA, "198.51.100.6")
	if pe.count() != 4 {
		t.Fatalf("other-IP upstream calls = %d, want 4", pe.count())
	}
}

// TestOnMissGateDecide 闸门自身的行为(与 HTTP 层解耦):爬虫恒拒、预算/单 IP 计数、
// 窗口翻滚、0 = 不限但爬虫仍拒、WARN 限频。
func TestOnMissGateDecide(t *testing.T) {
	base := time.Date(2026, 8, 12, 10, 0, 0, 0, time.UTC)

	t.Run("bot never consumes budget", func(t *testing.T) {
		g := newOnMissGate(1, 10)
		for i := 0; i < 5; i++ {
			if v, _, _ := g.decide("Googlebot/2.1", "203.0.113.1", base); v != onMissDenyBot {
				t.Fatalf("verdict = %v, want onMissDenyBot", v)
			}
		}
		// 爬虫没吃掉额度,真人仍拿得到那唯一一次。
		if v, _, _ := g.decide(humanUA, "203.0.113.1", base); v != onMissAllow {
			t.Fatalf("human verdict = %v, want onMissAllow", v)
		}
	})

	t.Run("window rolls over", func(t *testing.T) {
		g := newOnMissGate(1, 10)
		if v, _, _ := g.decide(humanUA, "203.0.113.2", base); v != onMissAllow {
			t.Fatalf("first verdict = %v, want allow", v)
		}
		if v, _, _ := g.decide(humanUA, "203.0.113.2", base.Add(time.Minute)); v != onMissDenyBudget {
			t.Fatalf("second verdict = %v, want deny budget", v)
		}
		if v, _, _ := g.decide(humanUA, "203.0.113.2", base.Add(time.Hour)); v != onMissAllow {
			t.Fatalf("next-window verdict = %v, want allow", v)
		}
	})

	t.Run("zero means unlimited but bots still blocked", func(t *testing.T) {
		g := newOnMissGate(0, 10)
		for i := 0; i < 50; i++ {
			if v, remaining, _ := g.decide(humanUA, "203.0.113.3", base); v != onMissAllow || remaining != -1 {
				t.Fatalf("verdict = %v remaining = %d, want allow/-1", v, remaining)
			}
		}
		if v, _, _ := g.decide("CCBot/2.0", "203.0.113.3", base); v != onMissDenyBot {
			t.Fatalf("bot verdict under unlimited budget = %v, want onMissDenyBot", v)
		}
	})

	t.Run("warn is rate limited to one per minute", func(t *testing.T) {
		g := newOnMissGate(1, 10)
		g.decide(humanUA, "203.0.113.4", base) // 用掉唯一额度
		if _, _, drops := g.decide(humanUA, "203.0.113.4", base); drops != 1 {
			t.Fatalf("first drop warn = %d, want 1", drops)
		}
		for i := 0; i < 10; i++ {
			if _, _, drops := g.decide(humanUA, "203.0.113.4", base.Add(time.Second)); drops != 0 {
				t.Fatalf("within-minute warn = %d, want 0 (rate limited)", drops)
			}
		}
		// 限频期内攒下的 10 次 + 触发本条 WARN 的这一次 = 11,一条都不许丢。
		if _, _, drops := g.decide(humanUA, "203.0.113.4", base.Add(90*time.Second)); drops != 11 {
			t.Fatalf("next-minute warn = %d, want accumulated 11", drops)
		}
	})
}
