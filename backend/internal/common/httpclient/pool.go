// ============================================================================
// Scholay学术 V1.0
// 共享 HTTP 客户端池
// ============================================================================
//
// 历史上 ai / proxy / minicod / semanticscholar 等包各自维护 Transport 常量，
// 复制粘贴的结果是连接池参数散落、全局连接数不可控、bug 修复难以同步。
//
// 本文件提供一组分层的共享客户端：
//
//   - Default()      — 常规外部 API 调用（5m 超时，含响应头 60s）
//   - LongRunning()  — AI 长任务（同传输层，10m 超时+10m 响应头）
//   - Streaming()    — SSE/流式响应（无整体超时，头 10m）
//
// 所有客户端共享同一 Transport（连接池），客户端对象只是不同超时的封装。
// 需要独立池（如 proxy 高并发场景）时用 NewTransport 构造专用 Transport。
//
// 迁移建议：业务包若有"shared transport"的老代码，直接替换为本文件的调用。
// 例外：使用 mTLS、cookie jar、或自定义 Dialer 的场景应保留各自的 Client。

package httpclient

import (
	"net/http"
	"time"
)

// TransportOptions 可调的连接池参数。零值代表使用合理默认值。
type TransportOptions struct {
	MaxIdleConns          int           // 总空闲连接上限 (默认 100)
	MaxIdleConnsPerHost   int           // 单 host 空闲连接上限 (默认 10)
	MaxConnsPerHost       int           // 单 host 最大连接数 (默认 50)
	IdleConnTimeout       time.Duration // 空闲连接回收时间 (默认 90s)
	TLSHandshakeTimeout   time.Duration // TLS 握手超时 (默认 10s)
	ExpectContinueTimeout time.Duration // 100-continue 超时 (默认 1s)
	ResponseHeaderTimeout time.Duration // 等待响应头 (默认 60s，长任务用更长)
}

// NewTransport 按给定选项构造一个 *http.Transport。
// 业务方如需独立连接池（避免与默认池竞争）可使用此工厂。
func NewTransport(opts TransportOptions) *http.Transport {
	if opts.MaxIdleConns == 0 {
		opts.MaxIdleConns = 100
	}
	if opts.MaxIdleConnsPerHost == 0 {
		opts.MaxIdleConnsPerHost = 10
	}
	if opts.MaxConnsPerHost == 0 {
		opts.MaxConnsPerHost = 50
	}
	if opts.IdleConnTimeout == 0 {
		opts.IdleConnTimeout = 90 * time.Second
	}
	if opts.TLSHandshakeTimeout == 0 {
		opts.TLSHandshakeTimeout = 10 * time.Second
	}
	if opts.ExpectContinueTimeout == 0 {
		opts.ExpectContinueTimeout = 1 * time.Second
	}
	if opts.ResponseHeaderTimeout == 0 {
		opts.ResponseHeaderTimeout = 60 * time.Second
	}
	return &http.Transport{
		MaxIdleConns:          opts.MaxIdleConns,
		MaxIdleConnsPerHost:   opts.MaxIdleConnsPerHost,
		MaxConnsPerHost:       opts.MaxConnsPerHost,
		IdleConnTimeout:       opts.IdleConnTimeout,
		TLSHandshakeTimeout:   opts.TLSHandshakeTimeout,
		ExpectContinueTimeout: opts.ExpectContinueTimeout,
		ResponseHeaderTimeout: opts.ResponseHeaderTimeout,
	}
}

// 全局共享 Transport：默认池（60s 响应头）和长任务池（10m 响应头）。
// 流式 / 长运行复用同一底层池，仅在 Client.Timeout 上区分。
var (
	defaultTransport = NewTransport(TransportOptions{
		ResponseHeaderTimeout: 60 * time.Second,
	})

	longRunningTransport = NewTransport(TransportOptions{
		ResponseHeaderTimeout: 10 * time.Minute,
	})

	defaultClient = &http.Client{
		Timeout:   5 * time.Minute,
		Transport: defaultTransport,
	}

	longRunningClient = &http.Client{
		Timeout:   10 * time.Minute,
		Transport: longRunningTransport,
	}

	streamingClient = &http.Client{
		// 流式响应硬上限 15 分钟，避免上游不发完整响应导致 goroutine 永久挂起。
		// 响应头 timeout 由 Transport（10m）控制；业务层通过 ctx 取消实现提前终止。
		Timeout:   15 * time.Minute,
		Transport: longRunningTransport,
	}
)

// Default 返回共享的常规 HTTP 客户端（5 分钟超时，连接池化）。
// 绝大多数外部 API 调用应使用此客户端。
func Default() *http.Client { return defaultClient }

// LongRunning 返回共享的长任务 HTTP 客户端（10 分钟超时）。
// 适合 AI 大文档处理、批量分析等场景。
func LongRunning() *http.Client { return longRunningClient }

// Streaming 返回共享的流式 HTTP 客户端（整体无超时，响应头 10m）。
// 适合 SSE / chunked 流式接口。
func Streaming() *http.Client { return streamingClient }

// DefaultTransport 返回常规池的底层 Transport，供需要自定义 Client
// （如带 cookie jar）但希望复用连接池的调用方使用。
func DefaultTransport() *http.Transport { return defaultTransport }

// LongRunningTransport 返回长任务池的底层 Transport。
func LongRunningTransport() *http.Transport { return longRunningTransport }

// WithTimeout 基于默认共享 Transport 构造一个指定超时的客户端。
// 用于无法使用 Default() 预设超时、但仍希望连接池化的场景。
func WithTimeout(timeout time.Duration) *http.Client {
	return &http.Client{Timeout: timeout, Transport: defaultTransport}
}
