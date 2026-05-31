// ============================================================================
// Scholay 上游调用统一基建 · 错误分类
//
// 目的:让上层调用方能用 errors.Is(err, upstream.ErrRateLimit) 判断错误类型,
// 而不是各包自己 strings.Contains(err.Error(), "429") 的脆弱写法。
//
// 错误层级:
//   Error             — 单条上游调用的错误信封 (status + body + upstream + 内部 err)
//     ↓ wraps
//   sentinel errors   — ErrAuth / ErrRateLimit / ErrServer / ErrNetwork / ...
//
// Error.Is(target) 会沿两条链路匹配:
//   1) target == 我们的 sentinel → 看 Kind 是否一致
//   2) target == 标准库 context.* 之类 → 沿 inner 一路 Unwrap
//
// 调用方典型用法:
//   if errors.Is(err, upstream.ErrRateLimit) { 等一会再试 }
//   if errors.Is(err, upstream.ErrAuth)      { 换 credential }
//   if errors.Is(err, context.DeadlineExceeded) { 上层超时, 不要重试 }
// ============================================================================

package upstream

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"strings"
)

// ─── Sentinel kinds ─────────────────────────────────────────────────────
//
// 所有 typed error 都以这些 sentinel 作为 Kind。值不重要, 只用做 errors.Is 比对。
// 调用方应该用 errors.Is 而不是类型断言, 保持解耦。

var (
	// ErrAuth — 401 / 403, 或上游显式回的 "API key invalid"。调用方常用于
	// "换 thirdparty 账户重试"。
	ErrAuth = errors.New("upstream: auth failed")

	// ErrRateLimit — 429, 或上游显式回的 "quota exceeded"。Retry 策略默认会
	// 按指数退避自动重试 (在 retry.go 控制)。
	ErrRateLimit = errors.New("upstream: rate limited")

	// ErrServer — 5xx, 或上游显式回的 internal error。可重试。
	ErrServer = errors.New("upstream: server error")

	// ErrBadRequest — 4xx (除去 401/403/404/408/429)。**不可**自动重试 —
	// 多半是调用方的 payload / 入参问题。
	ErrBadRequest = errors.New("upstream: bad request")

	// ErrNotFound — 404, 上层很可能要当作业务 nil 处理而不是错误。
	ErrNotFound = errors.New("upstream: not found")

	// ErrNetwork — TCP/TLS/DNS 类失败。可重试 (短暂网络抖动)。
	ErrNetwork = errors.New("upstream: network error")

	// ErrTimeout — 408, 或 net 层 Timeout, 或本地 ctx 超时但**还没**到 ctx
	// 真正 cancel 的程度。可重试。
	ErrTimeout = errors.New("upstream: timeout")

	// ErrCircuit — 本地 circuit breaker open, 上游根本没被调到。可重试 (等
	// breaker half-open)。
	ErrCircuit = errors.New("upstream: circuit open")
)

// Error 是 upstream 统一返回的错误信封。它包含足够的元数据让上层做诊断:
//
//   - Kind     上面 8 个 sentinel 之一, errors.Is 用
//   - Status   HTTP 状态码 (0 表示没拿到响应; 例如 DNS 失败 / circuit open)
//   - Body     响应体前 4KB, 调试用 (5xx/4xx 时上游一般会带原因; 已 trim)
//   - Upstream 这次调用的 upstream name (跟 slog 的 upstream 字段一致)
//   - Endpoint 路径 (不含 query, 不含 host), 方便聚合统计
//   - inner    底层 net/http/parse 错误, 沿 Unwrap 链能取到
type Error struct {
	Kind     error  // sentinel
	Status   int    // 0 if no response received
	Body     string // truncated to 4KB
	Upstream string
	Endpoint string
	inner    error
}

func (e *Error) Error() string {
	kind := "?"
	if e.Kind != nil {
		kind = strings.TrimPrefix(e.Kind.Error(), "upstream: ")
	}
	switch {
	case e.Status > 0 && e.inner != nil:
		return fmt.Sprintf("%s %s [%s status=%d]: %s — %v",
			e.Upstream, e.Endpoint, kind, e.Status, truncate(e.Body, 200), e.inner)
	case e.Status > 0:
		return fmt.Sprintf("%s %s [%s status=%d]: %s",
			e.Upstream, e.Endpoint, kind, e.Status, truncate(e.Body, 200))
	case e.inner != nil:
		return fmt.Sprintf("%s %s [%s]: %v", e.Upstream, e.Endpoint, kind, e.inner)
	default:
		return fmt.Sprintf("%s %s [%s]", e.Upstream, e.Endpoint, kind)
	}
}

// Unwrap 让 errors.Is(err, context.DeadlineExceeded) 之类的标准库判断也能穿透 inner。
func (e *Error) Unwrap() error { return e.inner }

// Is 优先匹配我们的 sentinel; 其次沿 inner 链。
func (e *Error) Is(target error) bool {
	if target == nil {
		return false
	}
	if e.Kind != nil && errors.Is(target, e.Kind) {
		return true
	}
	if e.inner != nil {
		return errors.Is(e.inner, target)
	}
	return false
}

// Retryable 是 retry.go 用的快捷判断: 这条 error 是否值得自动重试。
// 默认策略 — 5xx / 429 / network / timeout / circuit 可重试; 4xx / auth / notfound 不可。
func (e *Error) Retryable() bool {
	switch e.Kind {
	case ErrServer, ErrRateLimit, ErrNetwork, ErrTimeout, ErrCircuit:
		return true
	}
	return false
}

// ─── 工厂 / 分类 ────────────────────────────────────────────────────────

// FromHTTPStatus 把 HTTP 状态码 + body 分类为对应 sentinel + 装信封。
// resp body 已经被读出来传进来 (避免重复读 stream)。
func FromHTTPStatus(upstream, endpoint string, status int, body string) *Error {
	if status >= 200 && status < 300 {
		return nil
	}
	body = truncate(body, 4096)
	kind := classifyStatus(status)
	return &Error{
		Kind: kind, Status: status, Body: body,
		Upstream: upstream, Endpoint: endpoint,
	}
}

// FromNetworkError 把底层 net/http 调用失败包装成 typed error。
// 自动识别 context.DeadlineExceeded / net.Error.Timeout() / DNS 失败 等常见形态。
func FromNetworkError(upstream, endpoint string, err error) *Error {
	if err == nil {
		return nil
	}
	kind := classifyNetError(err)
	return &Error{
		Kind: kind, Upstream: upstream, Endpoint: endpoint, inner: err,
	}
}

// FromCircuitOpen — circuit breaker 拒绝放行时调。
func FromCircuitOpen(upstream, endpoint string, inner error) *Error {
	return &Error{
		Kind: ErrCircuit, Upstream: upstream, Endpoint: endpoint, inner: inner,
	}
}

// classifyStatus — 标准 HTTP 分类。
func classifyStatus(status int) error {
	switch status {
	case http.StatusUnauthorized, http.StatusForbidden:
		return ErrAuth
	case http.StatusNotFound:
		return ErrNotFound
	case http.StatusRequestTimeout:
		return ErrTimeout
	case http.StatusTooManyRequests:
		return ErrRateLimit
	}
	switch {
	case status >= 500:
		return ErrServer
	case status >= 400:
		return ErrBadRequest
	}
	return ErrServer // ??? 兜底
}

// classifyNetError — 区分 timeout / 网络抖动 / 其他。
// 不消费 ctx.Err(), 调用方有需要自己 errors.Is(err, context.Canceled) 判断。
func classifyNetError(err error) error {
	var netErr net.Error
	if errors.As(err, &netErr) {
		if netErr.Timeout() {
			return ErrTimeout
		}
	}
	// 标准库 ctx 超时
	if errors.Is(err, context.DeadlineExceeded) {
		return ErrTimeout
	}
	// 字符串嗅探 DNS / connection refused 等 — 仅作 fallback,errors.As 已覆盖主流路径
	msg := err.Error()
	if strings.Contains(msg, "no such host") ||
		strings.Contains(msg, "connection refused") ||
		strings.Contains(msg, "connection reset") ||
		strings.Contains(msg, "EOF") {
		return ErrNetwork
	}
	return ErrNetwork
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
