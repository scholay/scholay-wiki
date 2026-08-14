// GetCrawlerStats 的两条核心契约:
//   1. 未配置(crawler client = nil)→ 200 + {configured:false},绝不是 4xx/5xx —— 前端
//      靠这个分支渲染配置引导卡,报错会把「没配置」伪装成「umami 挂了」。
//   2. 已配置 → 响应形状:configured/range/unit/engines/series/top_pages/status_hint,
//      其中 series 聚合自 events/series(按桶求和 + 补零桶),status_hint 聚合自
//      event-data/fields 的 status 分布。
package umami

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

func doCrawlerReq(t *testing.T, h *Handler, target string) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, target, nil)
	h.GetCrawlerStats(c)
	return w
}

func TestGetCrawlerStats_NotConfigured(t *testing.T) {
	w := doCrawlerReq(t, NewHandler(nil), "/admin/analytics/crawler")
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 for unconfigured, got %d (body=%s)", w.Code, w.Body.String())
	}
	var body struct {
		Data map[string]any `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if v, ok := body.Data["configured"].(bool); !ok || v {
		t.Fatalf("expected configured=false, got %v", body.Data["configured"])
	}
	if _, ok := body.Data["engines"]; ok {
		t.Fatalf("unconfigured payload must not carry engines: %v", body.Data)
	}
}

func TestGetCrawlerStats_Shape(t *testing.T) {
	// 桶 key 用与 buildCrawlerSeries 相同的口径生成,避免测试对时刻敏感
	now := time.Now()
	hourKey := time.Date(now.Year(), now.Month(), now.Day(), now.Hour(), 0, 0, 0, time.Local).
		Format("2006-01-02 15:04:05") // umami 返回的完整格式(hour/day 都是这个形状)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.URL.Path == "/api/auth/login":
			fmt.Fprint(w, `{"token":"test-token"}`)
		case strings.HasSuffix(r.URL.Path, "/metrics"):
			if got := r.URL.Query().Get("type"); got != "event" {
				t.Errorf("metrics called with type=%q, want event", got)
			}
			fmt.Fprint(w, `[{"x":"google","y":2},{"x":"ai-openai","y":1}]`)
		case strings.HasSuffix(r.URL.Path, "/events/series"):
			if got := r.URL.Query().Get("unit"); got != "hour" {
				t.Errorf("events/series called with unit=%q, want hour (range=24h)", got)
			}
			fmt.Fprintf(w, `[{"x":"google","t":%q,"y":2},{"x":"ai-openai","t":%q,"y":1}]`, hourKey, hourKey)
		case strings.HasSuffix(r.URL.Path, "/event-data/fields"):
			fmt.Fprint(w, `[
				{"propertyName":"status","dataType":2,"value":"200","total":2},
				{"propertyName":"status","dataType":2,"value":"429","total":1},
				{"propertyName":"status","dataType":2,"value":"503","total":4},
				{"propertyName":"engine","dataType":1,"value":"google","total":2}
			]`)
		default:
			t.Errorf("unexpected upstream path: %s", r.URL.Path)
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer srv.Close()

	h := NewHandler(nil).WithCrawler(NewCrawlerClient(srv.URL, "test-website-id"), nil)
	w := doCrawlerReq(t, h, "/admin/analytics/crawler?range=24h")
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d (body=%s)", w.Code, w.Body.String())
	}

	var body struct {
		Data struct {
			Configured bool   `json:"configured"`
			Range      string `json:"range"`
			Unit       string `json:"unit"`
			Engines    []struct {
				Engine string `json:"engine"`
				Count  uint64 `json:"count"`
			} `json:"engines"`
			Series []struct {
				T     string `json:"t"`
				Count uint64 `json:"count"`
			} `json:"series"`
			TopPages   []any             `json:"top_pages"`
			StatusHint map[string]uint64 `json:"status_hint"`
		} `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("unmarshal: %v (body=%s)", err, w.Body.String())
	}
	d := body.Data

	if !d.Configured || d.Range != "24h" || d.Unit != "hour" {
		t.Fatalf("configured/range/unit mismatch: %+v", d)
	}
	if len(d.Engines) != 2 || d.Engines[0].Engine != "google" || d.Engines[0].Count != 2 ||
		d.Engines[1].Engine != "ai-openai" || d.Engines[1].Count != 1 {
		t.Fatalf("engines mismatch: %+v", d.Engines)
	}

	// 24h 窗口按小时补零 → 25 个桶(起止小时都含);总量 = 两个引擎之和 3
	if len(d.Series) < 24 || len(d.Series) > 26 {
		t.Fatalf("expected ~25 hourly buckets, got %d", len(d.Series))
	}
	var sum uint64
	nonZero := 0
	for _, p := range d.Series {
		sum += p.Count
		if p.Count > 0 {
			nonZero++
		}
		if len(p.T) != 16 { // "2006-01-02 15:04"
			t.Fatalf("hour bucket key %q not in 2006-01-02 15:04 form", p.T)
		}
	}
	if sum != 3 || nonZero != 1 {
		t.Fatalf("series aggregation wrong: sum=%d nonZero=%d (%+v)", sum, nonZero, d.Series)
	}

	// crawlerDB 为 nil → top_pages 降级为空数组(但字段必须在)
	if d.TopPages == nil || len(d.TopPages) != 0 {
		t.Fatalf("expected empty top_pages with nil db, got %+v", d.TopPages)
	}

	if d.StatusHint["429"] != 1 || d.StatusHint["5xx"] != 4 {
		t.Fatalf("status_hint mismatch: %+v", d.StatusHint)
	}
}
