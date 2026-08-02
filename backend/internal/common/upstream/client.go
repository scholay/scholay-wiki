// ============================================================================
// Scholay 上游调用统一基建 · Client
//
// 一个 Client = "一个稳定上游"的全部调用策略 (HTTP 池 + retry + breaker +
// 观测 + 钩子)。构造一次, 进程内长期持有, 并发安全。
//
// 典型构造:
//
//   cli, err := upstream.New("minicod").
//       BaseURL("https://open.scholay.com").
//       HTTPClient(httpclient.Default()).
//       Retry(upstream.RetryConfig{Max: 3}).
//       Breaker(upstream.BreakerConfig{}).
//       Before(quotaCheck).
//       After(usageRecorder).
//       Build()
//
// 典型调用 (低层 API):
//
//   resp, err := cli.Do(ctx, upstream.Request{
//       Method: "GET", Path: "/v1/papers/search",
//       Query: url.Values{"q": []string{"transformer"}},
//   })
//
// JSON 便利 (绝大多数 REST API 用):
//
//   var papers PapersResp
//   err := cli.GetJSON(ctx, "/v1/papers/search", q, &papers)
//   err := cli.PostJSON(ctx, "/v1/x", body, &result)
//
// 错误判别:
//
//   if errors.Is(err, upstream.ErrRateLimit) { ... }
//   if errors.Is(err, upstream.ErrAuth)      { 换 thirdparty 账户重试 }
//   var ue *upstream.Error
//   if errors.As(err, &ue) { slog.Info("status", "code", ue.Status) }
// ============================================================================

package upstream

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
	"regexp"
	"runtime/debug"
	"strings"
	"time"

	"github.com/sony/gobreaker"

	"scholar-backend/internal/common/httpclient"
)

// ─── Hooks ──────────────────────────────────────────────────────────────

// BeforeHook 在每次 Do 前同步调一次 (重试每轮都会调一次)。
// 返回非 nil error → 本次调用直接中止, 不发请求, 直接返这个 err (会被包装成
// 一个 *Error{Kind: ErrBadRequest} —— 因为是调用方/配额拒绝)。
// 典型用途: 配额检查 / 限流 / dry-run 模式。
type BeforeHook func(ctx context.Context, req *Request) error

// AfterHook 在每次 Do 后异步调一次 (safego 包起来, 不影响业务返回)。
// err 可能为 nil (成功) 或 *Error (失败); duration 是从 BeforeHook 返回到拿到
// 响应/分类好错误的总时长 (含重试)。
// 典型用途: usage 计费 / metrics / 审计日志。
type AfterHook func(ctx context.Context, req *Request, resp *Response, err error, duration time.Duration)

// ─── Request / Response ─────────────────────────────────────────────────

// Request — 给 Do 的统一入参。零值即可用 (Method 默认 GET)。
type Request struct {
	Method  string      // GET/POST/PUT/PATCH/DELETE; 默认 GET
	Path    string      // 相对路径, 自动拼到 Client.baseURL 后面; 也可以传完整 URL
	Query   url.Values  // 拼到 URL 后面
	Headers http.Header // 调用方自定义头 (Authorization 等)
	Body    io.Reader   // 原始 body; 与 BodyJSON 互斥, BodyJSON 优先级更高

	// BodyJSON 任意可 marshal 的对象 — 自动 Content-Type: application/json。
	// nil 表示无 body。
	BodyJSON any

	// 上面字段都设了 → 实际发 HTTP 请求; 本字段 Always 由 Client.do 填充, 调用方不要写。
	url string
}

// Response — 给调用方的统一出参。
//
// 注意 Body 已经被读完, 是 []byte 而不是 io.Reader; 这是为了让 retry 重发
// 时能拿到完整 body (不能从已消费的 reader 再读)。如果 body 很大要流式处理,
// 应该走更低层的 Stream API (本基建当前不提供, 后续按需扩)。
type Response struct {
	StatusCode int
	Headers    http.Header
	Body       []byte
}

// JSON 解析 Body 到 dst。dst 必须是指针。
func (r *Response) JSON(dst any) error {
	if len(r.Body) == 0 {
		return nil
	}
	return json.Unmarshal(r.Body, dst)
}

// ─── Client (Builder + 已构造) ──────────────────────────────────────────

// Client 是 upstream 调用入口。Build() 后并发安全, 进程内长期持有。
type Client struct {
	name       string
	baseURL    string
	httpClient *http.Client
	retry      RetryConfig
	breaker    *gobreaker.CircuitBreaker // nil 表示不走 breaker
	before     BeforeHook
	after      AfterHook
}

// Builder — 链式构造。所有 setter 都返回 *Builder; 末尾 .Build() 拿 Client。
type Builder struct {
	c   *Client
	err error
}

// New 起一个 Builder。name 必填, 用作 breaker key / slog 字段。
func New(name string) *Builder {
	return &Builder{c: &Client{name: name}}
}

// BaseURL 上游 host + 可选 path 前缀。Path 在 Do 时拼到这后面。
// 调用方也可以在 Request.Path 里直接传完整 URL (有 scheme), 此时 baseURL 被忽略。
func (b *Builder) BaseURL(u string) *Builder {
	b.c.baseURL = strings.TrimRight(u, "/")
	return b
}

// HTTPClient 注入自定义 client。不调 → 默认走 httpclient.Default()。
// 流式 / 长任务场景可以传 httpclient.Streaming() 或 LongRunning()。
func (b *Builder) HTTPClient(c *http.Client) *Builder {
	b.c.httpClient = c
	return b
}

// Retry 设重试策略。不调 → 零值即"不重试"。
func (b *Builder) Retry(r RetryConfig) *Builder {
	b.c.retry = r.withDefaults()
	return b
}

// Breaker 启用 circuit breaker。同名 breaker 全局唯一 (registry 自动复用)。
// 不调 → 不走 breaker。
func (b *Builder) Breaker(cfg BreakerConfig) *Builder {
	b.c.breaker = getOrCreateBreaker(b.c.name, cfg)
	return b
}

// Before / After 注册钩子。多次调用会覆盖 (不支持链式多钩子, 复杂场景在
// 业务侧用闭包合并)。
func (b *Builder) Before(h BeforeHook) *Builder { b.c.before = h; return b }
func (b *Builder) After(h AfterHook) *Builder   { b.c.after = h; return b }

// Build 完成构造。会校验关键字段; 失败返 err。
func (b *Builder) Build() (*Client, error) {
	if b.err != nil {
		return nil, b.err
	}
	if b.c.name == "" {
		return nil, errors.New("upstream: name is required")
	}
	if b.c.httpClient == nil {
		b.c.httpClient = httpclient.Default()
	}
	return b.c, nil
}

// MustBuild 同 Build, 但出错 panic。仅用于 bootstrap 阶段不可恢复错误。
func (b *Builder) MustBuild() *Client {
	c, err := b.Build()
	if err != nil {
		panic("upstream: " + err.Error())
	}
	return c
}

// Name 返回上游名 (slog / 调试用)。
func (c *Client) Name() string { return c.name }

// ─── 主入口 Do ──────────────────────────────────────────────────────────

// Do 执行一次上游调用 (含重试 + breaker + observability + hooks)。
//
// 返回的 *Response 仅在 err==nil 时非 nil; err 是 *Error 类型 (用 errors.As 拿)
// 或 ctx 错误 (context.Canceled / context.DeadlineExceeded)。
func (c *Client) Do(ctx context.Context, req Request) (*Response, error) {
	if req.Method == "" {
		req.Method = http.MethodGet
	}
	fullURL, err := c.buildURL(req.Path, req.Query)
	if err != nil {
		return nil, &Error{
			Kind: ErrBadRequest, Upstream: c.name, Endpoint: req.safeEndpoint(), inner: err,
		}
	}
	req.url = fullURL

	startedAt := time.Now()

	// before hook — 可以拒绝放行 (配额 / dry-run)
	if c.before != nil {
		if hookErr := c.before(ctx, &req); hookErr != nil {
			ue := &Error{Kind: ErrBadRequest, Upstream: c.name, Endpoint: req.safeEndpoint(), inner: hookErr}
			c.notifyAfter(ctx, &req, nil, ue, time.Since(startedAt))
			return nil, ue
		}
	}

	// body 要支持重试, 先全读到内存 (跟 Response.Body 一致, 流式场景另开 API)
	var rawBody []byte
	contentType := ""
	if req.BodyJSON != nil {
		b, jerr := json.Marshal(req.BodyJSON)
		if jerr != nil {
			ue := &Error{Kind: ErrBadRequest, Upstream: c.name, Endpoint: req.safeEndpoint(), inner: fmt.Errorf("marshal body: %w", jerr)}
			c.notifyAfter(ctx, &req, nil, ue, time.Since(startedAt))
			return nil, ue
		}
		rawBody = b
		contentType = "application/json"
	} else if req.Body != nil {
		b, rerr := io.ReadAll(req.Body)
		if rerr != nil {
			ue := &Error{Kind: ErrBadRequest, Upstream: c.name, Endpoint: req.safeEndpoint(), inner: rerr}
			c.notifyAfter(ctx, &req, nil, ue, time.Since(startedAt))
			return nil, ue
		}
		rawBody = b
	}

	// 重试循环 — attempt 0 是首次, attempt N (N>0) 是第 N 次重试
	var resp *Response
	var lastErr error
	for attempt := 0; ; attempt++ {
		attemptStart := time.Now()
		resp, lastErr = c.attempt(ctx, &req, rawBody, contentType, attempt)
		attemptDur := time.Since(attemptStart)

		c.logAttempt(ctx, &req, resp, lastErr, attempt, attemptDur)

		if !c.retry.shouldRetry(ctx, lastErr, attempt) {
			break
		}
		backoff := c.retry.nextBackoff(attempt)
		if err := sleepOrCancel(ctx, backoff); err != nil {
			// ctx 在退避期间被 cancel — 直接出, 用 ctx.Err()
			lastErr = &Error{Kind: ErrTimeout, Upstream: c.name, Endpoint: req.safeEndpoint(), inner: err}
			break
		}
	}

	c.notifyAfter(ctx, &req, resp, lastErr, time.Since(startedAt))
	if lastErr != nil {
		return nil, lastErr
	}
	return resp, nil
}

// attempt — 单次尝试 (一次 HTTP round-trip), 走 breaker。
func (c *Client) attempt(ctx context.Context, req *Request, rawBody []byte, contentType string, attempt int) (*Response, error) {
	exec := func() (any, error) {
		var bodyReader io.Reader
		if rawBody != nil {
			bodyReader = bytes.NewReader(rawBody)
		}
		httpReq, err := http.NewRequestWithContext(ctx, req.Method, req.url, bodyReader)
		if err != nil {
			return nil, &Error{Kind: ErrBadRequest, Upstream: c.name, Endpoint: req.safeEndpoint(), inner: err}
		}
		// 合并 headers: 调用方传入的优先, 我们只填没设的
		for k, vs := range req.Headers {
			for _, v := range vs {
				httpReq.Header.Add(k, v)
			}
		}
		if contentType != "" && httpReq.Header.Get("Content-Type") == "" {
			httpReq.Header.Set("Content-Type", contentType)
		}
		if httpReq.Header.Get("Accept") == "" {
			httpReq.Header.Set("Accept", "application/json, */*;q=0.5")
		}
		// 上游可以根据这个识别哪个 client / 哪次重试
		httpReq.Header.Set("X-Scholay-Upstream", c.name)
		if attempt > 0 {
			httpReq.Header.Set("X-Scholay-Attempt", fmt.Sprintf("%d", attempt))
		}

		httpResp, err := c.httpClient.Do(httpReq)
		if err != nil {
			return nil, FromNetworkError(c.name, req.safeEndpoint(), err)
		}
		defer httpResp.Body.Close()

		body, readErr := io.ReadAll(httpResp.Body)
		if readErr != nil {
			return nil, &Error{Kind: ErrNetwork, Status: httpResp.StatusCode, Upstream: c.name, Endpoint: req.safeEndpoint(), inner: readErr}
		}
		if ue := FromHTTPStatus(c.name, req.safeEndpoint(), httpResp.StatusCode, string(body)); ue != nil {
			return nil, ue
		}
		return &Response{
			StatusCode: httpResp.StatusCode,
			Headers:    httpResp.Header,
			Body:       body,
		}, nil
	}

	result, err := executeWithBreaker(ctx, c.breaker, c.name, req.safeEndpoint(), exec)
	if err != nil {
		return nil, err
	}
	if result == nil {
		return nil, nil
	}
	resp, _ := result.(*Response)
	return resp, nil
}

// ─── 流式 DoStream ──────────────────────────────────────────────────────

// StreamResponse 是 DoStream 回调拿到的响应。Body 是**未消费**的上游响应流,
// 回调负责读完它 (DoStream 在回调返回后会 Close)。
type StreamResponse struct {
	StatusCode int
	Headers    http.Header
	Body       io.Reader
}

// DoStream 发起一次流式上游调用 (SSE / chunked / 大响应), 跟 Do 一样走
// breaker + observability + before/after hooks, 但有两点关键差异:
//
//   1. **不缓冲 body** — 把上游响应流交给 consume 回调, 调用方边读边处理
//   2. **不重试** — 流一旦开始消费就无法重放, 失败直接返回
//
// 行为:
//   - 非 2xx → 读出错误 body (限 8KB) 分类成 typed *Error, 不调 consume (这类
//     算 breaker failure, 跟 Do 一致)
//   - 2xx → 调 consume(*StreamResponse); consume 返回的 error 原样返回 (也计入
//     breaker failure, 但**不被分类成可重试** — 让上层自己决定要不要重发)
func (c *Client) DoStream(ctx context.Context, req Request, consume func(*StreamResponse) error) error {
	if req.Method == "" {
		req.Method = http.MethodPost
	}
	fullURL, err := c.buildURL(req.Path, req.Query)
	if err != nil {
		return &Error{Kind: ErrBadRequest, Upstream: c.name, Endpoint: req.safeEndpoint(), inner: err}
	}
	req.url = fullURL

	startedAt := time.Now()

	if c.before != nil {
		if hookErr := c.before(ctx, &req); hookErr != nil {
			ue := &Error{Kind: ErrBadRequest, Upstream: c.name, Endpoint: req.safeEndpoint(), inner: hookErr}
			c.notifyAfter(ctx, &req, nil, ue, time.Since(startedAt))
			return ue
		}
	}

	var rawBody []byte
	contentType := ""
	if req.BodyJSON != nil {
		b, jerr := json.Marshal(req.BodyJSON)
		if jerr != nil {
			ue := &Error{Kind: ErrBadRequest, Upstream: c.name, Endpoint: req.safeEndpoint(), inner: fmt.Errorf("marshal body: %w", jerr)}
			c.notifyAfter(ctx, &req, nil, ue, time.Since(startedAt))
			return ue
		}
		rawBody = b
		contentType = "application/json"
	} else if req.Body != nil {
		b, rerr := io.ReadAll(req.Body)
		if rerr != nil {
			ue := &Error{Kind: ErrBadRequest, Upstream: c.name, Endpoint: req.safeEndpoint(), inner: rerr}
			c.notifyAfter(ctx, &req, nil, ue, time.Since(startedAt))
			return ue
		}
		rawBody = b
	}

	exec := func() (any, error) {
		var bodyReader io.Reader
		if rawBody != nil {
			bodyReader = bytes.NewReader(rawBody)
		}
		httpReq, err := http.NewRequestWithContext(ctx, req.Method, req.url, bodyReader)
		if err != nil {
			return nil, &Error{Kind: ErrBadRequest, Upstream: c.name, Endpoint: req.safeEndpoint(), inner: err}
		}
		for k, vs := range req.Headers {
			for _, v := range vs {
				httpReq.Header.Add(k, v)
			}
		}
		if contentType != "" && httpReq.Header.Get("Content-Type") == "" {
			httpReq.Header.Set("Content-Type", contentType)
		}
		httpReq.Header.Set("X-Scholay-Upstream", c.name)

		httpResp, err := c.httpClient.Do(httpReq)
		if err != nil {
			return nil, FromNetworkError(c.name, req.safeEndpoint(), err)
		}
		// 非 2xx: 读 8KB 错误 body 分类, 然后关流
		if httpResp.StatusCode < 200 || httpResp.StatusCode >= 300 {
			b, _ := io.ReadAll(io.LimitReader(httpResp.Body, 8192))
			httpResp.Body.Close()
			return nil, FromHTTPStatus(c.name, req.safeEndpoint(), httpResp.StatusCode, string(b))
		}
		defer httpResp.Body.Close()
		// 2xx: 交给 consume 流式处理; consume 的 error 原样上抛 (计 breaker failure, 但不分类成可重试)
		if cerr := consume(&StreamResponse{
			StatusCode: httpResp.StatusCode,
			Headers:    httpResp.Header,
			Body:       httpResp.Body,
		}); cerr != nil {
			return nil, cerr
		}
		return nil, nil
	}

	_, execErr := executeWithBreaker(ctx, c.breaker, c.name, req.safeEndpoint(), exec)
	dur := time.Since(startedAt)
	c.logAttempt(ctx, &req, nil, execErr, 0, dur)
	c.notifyAfter(ctx, &req, nil, execErr, dur)
	return execErr
}

// sensitiveQueryRe — query 串里的敏感参数,只抹参数值、保留参数名。
// 2026-07 审查:名单补 code / js_code / ticket / passwd / session_key;同时把过宽的
// "名字含 key" 收紧成「整名 key / 分隔符+key / apikey 类」,避免吞掉 keyword、sortKey
// 这些排障时必须看得见的普通检索参数。
var sensitiveQueryRe = regexp.MustCompile(
	`(?i)(` +
		// ① 名字里含这些子串一律当凭证:access_token / app_secret / signature / jsapi_ticket / password …
		`[?&][a-z0-9_.-]*(?:token|secret|password|passwd|sign|ticket)[a-z0-9_.-]*=` +
		// ② 整名或「分隔符 + 词」结尾:key / pwd / code / js_code / api_key / session_key
		//    刻意**不**匹配 keyword / sortKey(没有分隔符,不是凭证)
		`|[?&](?:[a-z0-9_.-]*[_.-])?(?:key|pwd|code)=` +
		// ③ 无分隔符的常见凭证名:apikey / accesskey / appkey / aeskey / sessionkey
		`|[?&][a-z0-9_.-]*(?:api|access|app|aes|session)key[a-z0-9_.-]*=` +
		`)[^&\s"']*`)

// maskSensitiveQuery 抹掉字符串中内嵌 query 的敏感参数值(替换为 ***)。
// 2026-07 线上审计:wechat 等调用方把 access_token 直接拼在 Request.Path 里,
// endpoint 字段原样进 docker logs(留存 5 天+)—— 完整凭证泄漏,必须打码。
func maskSensitiveQuery(s string) string {
	if s == "" || !strings.ContainsAny(s, "?&") {
		return s
	}
	return sensitiveQueryRe.ReplaceAllString(s, "$1***")
}

// safeEndpoint 返回可安全落进 *Error.Endpoint 的路径。
// 2026-07 审查:此前只有 logAttempt 打码,而 typed *Error 存的是**原始** Request.Path,
// Error() 又逐字打印它 —— 调用方一句 slog.Warn("err", err) 就把完整 access_token
// 写进 docker logs(与修复前等价)。故改在**构造处**打码,顺带让实现对齐 Error.Endpoint
// 「不含 query」的文档约定。
func (r *Request) safeEndpoint() string { return maskSensitiveQuery(r.Path) }

// logAttempt — 统一观测的 slog 五元组 (上面文档 §2 提到的)。
//   level=INFO 成功; WARN 失败 (即便是会被重试的); ERROR 不留路径 (留给调用方).
func (c *Client) logAttempt(ctx context.Context, req *Request, resp *Response, err error, attempt int, dur time.Duration) {
	status := 0
	if resp != nil {
		status = resp.StatusCode
	}
	var ue *Error
	errors.As(err, &ue)

	args := []any{
		"upstream", c.name,
		"method", req.Method,
		// 2026-07 线上审计:endpoint 可能内嵌 access_token 等 query,打码后再落日志。
		"endpoint", req.safeEndpoint(),
		"latency_ms", dur.Milliseconds(),
		"attempt", attempt,
	}
	if status > 0 {
		args = append(args, "status", status)
	}
	if err == nil {
		slog.LogAttrs(ctx, slog.LevelInfo, "upstream call ok", toAttrs(args)...)
		return
	}
	// 调用方主动取消 (用户关页 / 跳走 / 上层放弃) 不是上游故障 —— 降到 DEBUG,
	// 否则正常的翻页/离开会把 "network error" WARN 刷满错误日志。errors.Is 同时覆盖
	// typed ErrCanceled 和裸 context.Canceled (尚未经分类的路径)。
	if errors.Is(err, ErrCanceled) || errors.Is(err, context.Canceled) {
		slog.LogAttrs(ctx, slog.LevelDebug, "upstream call canceled by caller", toAttrs(args)...)
		return
	}
	if ue != nil {
		args = append(args, "kind", strings.TrimPrefix(ue.Kind.Error(), "upstream: "))
		if ue.Status > 0 && status == 0 {
			args = append(args, "status", ue.Status)
		}
		if ue.Body != "" {
			args = append(args, "body_excerpt", truncate(ue.Body, 300))
		}
	} else {
		// 网络类错误(url.Error)会把完整 URL(含内嵌 query)带进 Error() 串,同样打码。
		args = append(args, "err", maskSensitiveQuery(err.Error()))
	}
	slog.LogAttrs(ctx, slog.LevelWarn, "upstream call failed", toAttrs(args)...)
}

// toAttrs — 把 ...any kv 转成 slog.Attr 切片, slog.LogAttrs 比 slog.Log 性能更好。
func toAttrs(kv []any) []slog.Attr {
	out := make([]slog.Attr, 0, len(kv)/2)
	for i := 0; i+1 < len(kv); i += 2 {
		key, ok := kv[i].(string)
		if !ok {
			continue
		}
		out = append(out, slog.Any(key, kv[i+1]))
	}
	return out
}

// notifyAfter — 异步触发 AfterHook, 失败只 panic-recover 一下。
// 不用 safego 是为了让本包不依赖 internal/common/safego (保持 common 自包含)。
func (c *Client) notifyAfter(ctx context.Context, req *Request, resp *Response, err error, dur time.Duration) {
	if c.after == nil {
		return
	}
	// AfterHook (usage 记账 / 审计 / metrics) 跑在请求返回之后。原来直接把请求 ctx 带进
	// goroutine: 请求一结束 ctx 立即被取消, hook 里的 DB 写入会半路 "context canceled" 丢数据。
	// WithoutCancel 脱离取消信号(仍保留 trace_id 等 value) + 5s 独立超时兜底, 防 hook 卡死泄漏。
	hookCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	go func() {
		defer cancel()
		defer func() {
			if r := recover(); r != nil {
				// 镜像 safego 的行为(本包不 import safego): Error 级 + 完整栈, 别让 hook panic 被 Warn 淹掉。
				slog.Error("upstream after-hook panicked",
					"upstream", c.name, "panic", r, "stack", string(debug.Stack()))
			}
		}()
		c.after(hookCtx, req, resp, err, dur)
	}()
}

// buildURL — 把 baseURL + path + query 拼成完整 URL。如果 path 本身是绝对 URL
// (有 scheme), 直接当 base 用 (此时 BaseURL 被覆盖); 这种用法用于"少数 endpoint
// 不在主 baseURL 下"的场景。
func (c *Client) buildURL(path string, query url.Values) (string, error) {
	raw := path
	if !strings.HasPrefix(path, "http://") && !strings.HasPrefix(path, "https://") {
		if c.baseURL == "" {
			return "", errors.New("baseURL not configured and path is not absolute")
		}
		if !strings.HasPrefix(path, "/") {
			raw = c.baseURL + "/" + path
		} else {
			raw = c.baseURL + path
		}
	}
	u, err := url.Parse(raw)
	if err != nil {
		return "", err
	}
	if len(query) > 0 {
		q := u.Query()
		for k, vs := range query {
			for _, v := range vs {
				q.Add(k, v)
			}
		}
		u.RawQuery = q.Encode()
	}
	return u.String(), nil
}

// ─── JSON 便利 ──────────────────────────────────────────────────────────

// GetJSON GET 请求 + 反序列化到 dst。dst 可为 nil 表示忽略响应体。
func (c *Client) GetJSON(ctx context.Context, path string, query url.Values, dst any) error {
	return c.doJSON(ctx, http.MethodGet, path, query, nil, dst)
}

// PostJSON POST 请求 + JSON body + 反序列化响应到 dst。
func (c *Client) PostJSON(ctx context.Context, path string, body any, dst any) error {
	return c.doJSON(ctx, http.MethodPost, path, nil, body, dst)
}

// PutJSON / PatchJSON / DeleteJSON 同理。
func (c *Client) PutJSON(ctx context.Context, path string, body any, dst any) error {
	return c.doJSON(ctx, http.MethodPut, path, nil, body, dst)
}
func (c *Client) PatchJSON(ctx context.Context, path string, body any, dst any) error {
	return c.doJSON(ctx, http.MethodPatch, path, nil, body, dst)
}
func (c *Client) DeleteJSON(ctx context.Context, path string, query url.Values, dst any) error {
	return c.doJSON(ctx, http.MethodDelete, path, query, nil, dst)
}

func (c *Client) doJSON(ctx context.Context, method, path string, query url.Values, body, dst any) error {
	resp, err := c.Do(ctx, Request{
		Method: method, Path: path, Query: query, BodyJSON: body,
	})
	if err != nil {
		return err
	}
	if dst == nil {
		return nil
	}
	return resp.JSON(dst)
}
