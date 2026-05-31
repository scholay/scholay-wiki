package upstream

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// ─── 工具 ────────────────────────────────────────────────────────────────

// newClient — 测试用快速构造。每个 test 用 t.Name() 做 breaker key,
// 避免不同 test 之间 breaker 状态串扰 (registry 是 process-global)。
func newClient(t *testing.T, baseURL string, retry RetryConfig, withBreaker bool) *Client {
	t.Helper()
	b := New(t.Name()).BaseURL(baseURL).Retry(retry)
	if withBreaker {
		b = b.Breaker(BreakerConfig{
			MaxRequests:  1,
			MinRequests:  2,
			FailureRatio: 0.5,
			Timeout:      200 * time.Millisecond,
		})
	}
	cli, err := b.Build()
	if err != nil {
		t.Fatalf("build client: %v", err)
	}
	return cli
}

func qv(kv ...string) url.Values {
	v := url.Values{}
	for i := 0; i+1 < len(kv); i += 2 {
		v.Add(kv[i], kv[i+1])
	}
	return v
}

func waitTimeout(t *testing.T, wg *sync.WaitGroup, d time.Duration) {
	t.Helper()
	done := make(chan struct{})
	go func() { wg.Wait(); close(done) }()
	select {
	case <-done:
	case <-time.After(d):
		t.Fatal("waitTimeout: timed out")
	}
}

// ─── 成功路径 ───────────────────────────────────────────────────────────

func TestClient_GetJSON_Success(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/items" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		if r.URL.Query().Get("q") != "foo" {
			t.Errorf("query param missing: %v", r.URL.Query())
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"ok":true,"count":42}`)
	}))
	defer srv.Close()

	cli := newClient(t, srv.URL, RetryConfig{}, false)
	var out struct {
		OK    bool `json:"ok"`
		Count int  `json:"count"`
	}
	if err := cli.GetJSON(context.Background(), "/v1/items", qv("q", "foo"), &out); err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if !out.OK || out.Count != 42 {
		t.Fatalf("bad payload: %+v", out)
	}
}

// ─── 错误分类 ───────────────────────────────────────────────────────────

func TestClient_ErrorClassification(t *testing.T) {
	cases := []struct {
		name   string
		status int
		want   error // sentinel
	}{
		{"401", 401, ErrAuth},
		{"403", 403, ErrAuth},
		{"404", 404, ErrNotFound},
		{"408", 408, ErrTimeout},
		{"429", 429, ErrRateLimit},
		{"500", 500, ErrServer},
		{"502", 502, ErrServer},
		{"400", 400, ErrBadRequest},
		{"422", 422, ErrBadRequest},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(tc.status)
				_, _ = io.WriteString(w, "error body")
			}))
			defer srv.Close()

			cli := newClient(t, srv.URL, RetryConfig{}, false)
			err := cli.GetJSON(context.Background(), "/x", nil, nil)
			if err == nil {
				t.Fatal("expected error, got nil")
			}
			if !errors.Is(err, tc.want) {
				t.Fatalf("status %d: got %v, want sentinel %v", tc.status, err, tc.want)
			}
			var ue *Error
			if !errors.As(err, &ue) {
				t.Fatal("err should be *upstream.Error")
			}
			if ue.Status != tc.status {
				t.Errorf("Status: got %d want %d", ue.Status, tc.status)
			}
			if ue.Body != "error body" {
				t.Errorf("Body: got %q", ue.Body)
			}
		})
	}
}

// ─── 重试 ───────────────────────────────────────────────────────────────

func TestClient_Retry_RecoversFrom5xx(t *testing.T) {
	var attempts int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := atomic.AddInt32(&attempts, 1)
		if n < 3 {
			w.WriteHeader(503)
			return
		}
		_, _ = io.WriteString(w, `{"ok":true}`)
	}))
	defer srv.Close()

	cli := newClient(t, srv.URL, RetryConfig{
		Max:         3,
		BackoffBase: 5 * time.Millisecond,
		BackoffMax:  20 * time.Millisecond,
	}, false)
	if err := cli.GetJSON(context.Background(), "/x", nil, nil); err != nil {
		t.Fatalf("unexpected err after retry: %v", err)
	}
	if got := atomic.LoadInt32(&attempts); got != 3 {
		t.Fatalf("expected 3 attempts (2 failed + 1 success), got %d", got)
	}
}

func TestClient_Retry_DoesNotRetry4xx(t *testing.T) {
	var attempts int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&attempts, 1)
		w.WriteHeader(400)
	}))
	defer srv.Close()

	cli := newClient(t, srv.URL, RetryConfig{Max: 5, BackoffBase: time.Millisecond}, false)
	err := cli.GetJSON(context.Background(), "/x", nil, nil)
	if !errors.Is(err, ErrBadRequest) {
		t.Fatalf("expected ErrBadRequest, got %v", err)
	}
	if got := atomic.LoadInt32(&attempts); got != 1 {
		t.Fatalf("4xx should not be retried; got %d attempts", got)
	}
}

func TestClient_Retry_DoesNotRetryAuth(t *testing.T) {
	var attempts int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&attempts, 1)
		w.WriteHeader(401)
	}))
	defer srv.Close()

	cli := newClient(t, srv.URL, RetryConfig{Max: 5, BackoffBase: time.Millisecond}, false)
	err := cli.GetJSON(context.Background(), "/x", nil, nil)
	if !errors.Is(err, ErrAuth) {
		t.Fatalf("expected ErrAuth, got %v", err)
	}
	if got := atomic.LoadInt32(&attempts); got != 1 {
		t.Fatalf("401 should not be retried; got %d attempts", got)
	}
}

// ─── breaker ───────────────────────────────────────────────────────────

func TestClient_Breaker_OpensOnRepeatedFailures(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(503)
	}))
	defer srv.Close()

	cli := newClient(t, srv.URL, RetryConfig{}, true)

	// 触发足够多的 failure 让 breaker open (MinRequests=2, FailureRatio=0.5)
	for i := 0; i < 4; i++ {
		_ = cli.GetJSON(context.Background(), "/x", nil, nil)
	}
	// 再调一次应该被 breaker 直接拒
	err := cli.GetJSON(context.Background(), "/x", nil, nil)
	if !errors.Is(err, ErrCircuit) {
		t.Fatalf("expected ErrCircuit after breaker open, got %v", err)
	}
}

// 4xx 不应该 trip breaker — 上游正常工作, 是调用方入参不对
func TestClient_Breaker_NotTrippedBy4xx(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(404)
	}))
	defer srv.Close()

	cli := newClient(t, srv.URL, RetryConfig{}, true)
	for i := 0; i < 10; i++ {
		err := cli.GetJSON(context.Background(), "/x", nil, nil)
		if !errors.Is(err, ErrNotFound) {
			t.Fatalf("call #%d: expected ErrNotFound, got %v", i, err)
		}
		if errors.Is(err, ErrCircuit) {
			t.Fatalf("call #%d: breaker should not be tripped by 4xx", i)
		}
	}
}

// ─── hooks ───────────────────────────────────────────────────────────────

func TestClient_BeforeHook_CanAbort(t *testing.T) {
	var serverHits int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&serverHits, 1)
		_, _ = io.WriteString(w, "ok")
	}))
	defer srv.Close()

	quotaErr := errors.New("daily quota exceeded")
	cli, err := New(t.Name()).BaseURL(srv.URL).
		Before(func(ctx context.Context, req *Request) error { return quotaErr }).
		Build()
	if err != nil {
		t.Fatal(err)
	}
	err = cli.GetJSON(context.Background(), "/x", nil, nil)
	if err == nil || !strings.Contains(err.Error(), "daily quota exceeded") {
		t.Fatalf("expected quota error, got %v", err)
	}
	if got := atomic.LoadInt32(&serverHits); got != 0 {
		t.Fatalf("server should not be hit when before-hook aborts; got %d hits", got)
	}
}

func TestClient_AfterHook_FiresOnSuccess(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, `{"ok":true}`)
	}))
	defer srv.Close()

	var (
		wg       sync.WaitGroup
		called   atomic.Bool
		gotErr   atomic.Bool
		gotResp  atomic.Bool
		duration atomic.Int64
	)
	wg.Add(1)
	cli, err := New(t.Name()).BaseURL(srv.URL).
		After(func(ctx context.Context, req *Request, resp *Response, err error, d time.Duration) {
			defer wg.Done()
			called.Store(true)
			gotErr.Store(err != nil)
			gotResp.Store(resp != nil)
			duration.Store(d.Microseconds())
		}).
		Build()
	if err != nil {
		t.Fatal(err)
	}
	if err := cli.GetJSON(context.Background(), "/x", nil, nil); err != nil {
		t.Fatal(err)
	}
	waitTimeout(t, &wg, 2*time.Second)
	if !called.Load() {
		t.Fatal("after-hook was not called")
	}
	if gotErr.Load() {
		t.Fatal("after-hook got err on success path")
	}
	if !gotResp.Load() {
		t.Fatal("after-hook should get *Response on success")
	}
	if duration.Load() <= 0 {
		t.Fatal("after-hook should get positive duration")
	}
}

// ─── POST + JSON body 往返 ──────────────────────────────────────────────

func TestClient_PostJSON_RoundTrip(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if ct := r.Header.Get("Content-Type"); ct != "application/json" {
			t.Errorf("expected Content-Type: application/json, got %q", ct)
		}
		var in struct{ Name string }
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatal(err)
		}
		if err := json.Unmarshal(body, &in); err != nil {
			t.Fatal(err)
		}
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"echo":%q}`, in.Name)
	}))
	defer srv.Close()

	cli := newClient(t, srv.URL, RetryConfig{}, false)
	var out struct{ Echo string }
	if err := cli.PostJSON(context.Background(), "/echo", map[string]string{"Name": "scholay"}, &out); err != nil {
		t.Fatal(err)
	}
	if out.Echo != "scholay" {
		t.Fatalf("echo: got %q", out.Echo)
	}
}

// ─── ctx cancel 在 backoff 中立刻退出 ───────────────────────────────────

func TestClient_Retry_CtxCancelInBackoff(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(503)
	}))
	defer srv.Close()

	cli := newClient(t, srv.URL, RetryConfig{
		Max:         3,
		BackoffBase: 500 * time.Millisecond,
		BackoffMax:  time.Second,
	}, false)
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()

	start := time.Now()
	err := cli.GetJSON(ctx, "/x", nil, nil)
	dur := time.Since(start)

	if err == nil {
		t.Fatal("expected error from ctx cancel")
	}
	// 应该在 ctx 超时附近就退出, 远小于 backoff 500ms
	if dur > 350*time.Millisecond {
		t.Fatalf("expected fast exit on ctx cancel, took %v", dur)
	}
}

// ─── DoStream ───────────────────────────────────────────────────────────

func TestClient_DoStream_Success(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(200)
		for i := 0; i < 3; i++ {
			fmt.Fprintf(w, "data: chunk%d\n\n", i)
			if f, ok := w.(http.Flusher); ok {
				f.Flush()
			}
		}
	}))
	defer srv.Close()

	cli := newClient(t, srv.URL, RetryConfig{}, false)
	var got strings.Builder
	err := cli.DoStream(context.Background(), Request{Method: http.MethodPost, Path: "/x"}, func(resp *StreamResponse) error {
		if resp.StatusCode != 200 {
			t.Errorf("status: %d", resp.StatusCode)
		}
		b, _ := io.ReadAll(resp.Body)
		got.Write(b)
		return nil
	})
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if !strings.Contains(got.String(), "chunk0") || !strings.Contains(got.String(), "chunk2") {
		t.Fatalf("stream body incomplete: %q", got.String())
	}
}

func TestClient_DoStream_Non2xxClassified(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(429)
		_, _ = io.WriteString(w, "slow down")
	}))
	defer srv.Close()

	var consumeCalled bool
	cli := newClient(t, srv.URL, RetryConfig{}, false)
	err := cli.DoStream(context.Background(), Request{Method: http.MethodPost, Path: "/x"}, func(resp *StreamResponse) error {
		consumeCalled = true
		return nil
	})
	if !errors.Is(err, ErrRateLimit) {
		t.Fatalf("expected ErrRateLimit, got %v", err)
	}
	if consumeCalled {
		t.Fatal("consume should NOT be called on non-2xx")
	}
}

func TestClient_DoStream_ConsumeErrorPropagates(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, "data: x\n\n")
	}))
	defer srv.Close()

	sentinel := errors.New("parse boom")
	cli := newClient(t, srv.URL, RetryConfig{}, false)
	err := cli.DoStream(context.Background(), Request{Method: http.MethodPost, Path: "/x"}, func(resp *StreamResponse) error {
		return sentinel
	})
	if !errors.Is(err, sentinel) {
		t.Fatalf("expected consume error to propagate, got %v", err)
	}
}

// ─── header 注入 ────────────────────────────────────────────────────────

func TestClient_Headers_AreSent(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Scholay-Upstream") != t.Name() {
			t.Errorf("X-Scholay-Upstream missing or wrong: %q", r.Header.Get("X-Scholay-Upstream"))
		}
		if r.Header.Get("Authorization") != "Bearer test-token" {
			t.Errorf("Authorization not propagated: %q", r.Header.Get("Authorization"))
		}
		_, _ = io.WriteString(w, `{}`)
	}))
	defer srv.Close()

	cli := newClient(t, srv.URL, RetryConfig{}, false)
	_, err := cli.Do(context.Background(), Request{
		Method:  http.MethodGet,
		Path:    "/x",
		Headers: http.Header{"Authorization": []string{"Bearer test-token"}},
	})
	if err != nil {
		t.Fatal(err)
	}
}
