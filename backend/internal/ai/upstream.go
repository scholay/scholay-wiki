// ============================================================================
// Scholay学术 V1.0
// AI LLM 上游统一封装 — 把对 OpenAI 兼容 endpoint 的调用收口到 common/upstream。
//
// 职责边界:
//   - common/upstream 负责单次 HTTP: 连接池 / breaker / typed error / slog 观测
//   - ai.Service.executeWithRetry 负责"换 thirdparty 账户重试"的外层循环 (不下放到
//     upstream, 因为账户轮换是 ai 域的业务语义)
//   - 本文件是这两层之间的胶水: 按 baseURL 复用 upstream.Client, 提供两个原子方法
//     doChatCompletion (同步) / streamChatCompletion (流式)
//
// breaker 命名:
//   ai_llm        同步调用 (原 circuitbreaker.AIServiceBreaker 的位置)
//   ai_llm_stream 流式调用 (原 circuitbreaker.AIServiceStreamBreaker 的位置)
//   按 name 全局单例, 不同账户的不同 baseURL 共享同一个 breaker。
// ============================================================================

package ai

import (
	"context"
	"net/http"
	"strings"
	"sync"
	"time"

	"scholar-backend/internal/common/httpclient"
	"scholar-backend/internal/common/upstream"
)

const (
	upstreamNameSync   = "ai_llm"
	upstreamNameStream = "ai_llm_stream"
)

// upstream.Client 按 (name|baseURL) 缓存。thirdparty 账户可以配不同 baseURL,
// 同 name 的所有 baseURL 共享同一 breaker。
var (
	aiUpstreamMu sync.RWMutex
	aiUpstreams  = make(map[string]*upstream.Client)
)

func aiUpstreamClient(name, baseURL string, hc *http.Client) *upstream.Client {
	baseURL = strings.TrimSuffix(baseURL, "/")
	key := name + "|" + baseURL
	aiUpstreamMu.RLock()
	cli, ok := aiUpstreams[key]
	aiUpstreamMu.RUnlock()
	if ok {
		return cli
	}
	aiUpstreamMu.Lock()
	defer aiUpstreamMu.Unlock()
	if cli, ok := aiUpstreams[key]; ok {
		return cli
	}
	cli = upstream.New(name).
		BaseURL(baseURL).
		HTTPClient(hc).
		// 不在 upstream 层重试 — executeWithRetry 外层做账户轮换 (语义更准确:
		// 同账户重打多半还是同样失败, 换账户才有意义)
		Breaker(upstream.BreakerConfig{
			MaxRequests:  10,
			MinRequests:  10,
			FailureRatio: 0.8,
			Timeout:      30 * time.Second,
		}).
		MustBuild()
	aiUpstreams[key] = cli
	return cli
}

// doChatCompletion 同步 POST /v1/chat/completions, 解析非流式响应。
//
// 返回的 error 在失败时是 *upstream.Error (typed), executeWithRetry 用
// errors.Is 判 ErrAuth/ErrRateLimit/ErrServer/ErrCircuit 决定是否换账户重试。
func doChatCompletion(ctx context.Context, baseURL, apiKey string, reqBody ChatCompletionRequest) (*ChatCompletionResponse, error) {
	cli := aiUpstreamClient(upstreamNameSync, baseURL, httpclient.LongRunning())
	resp, err := cli.Do(ctx, upstream.Request{
		Method:   http.MethodPost,
		Path:     "/v1/chat/completions",
		Headers:  bearer(apiKey),
		BodyJSON: reqBody,
	})
	if err != nil {
		return nil, err
	}
	var out ChatCompletionResponse
	if err := resp.JSON(&out); err != nil {
		return nil, err
	}
	return &out, nil
}

// streamChatCompletion 流式 POST /v1/chat/completions, 把上游 SSE 流交给 consume。
// consume 读 resp.Body (上游原始流), 自己解析转发。
func streamChatCompletion(ctx context.Context, baseURL, apiKey string, reqBody ChatCompletionRequest, consume func(*upstream.StreamResponse) error) error {
	cli := aiUpstreamClient(upstreamNameStream, baseURL, httpclient.Streaming())
	return cli.DoStream(ctx, upstream.Request{
		Method:   http.MethodPost,
		Path:     "/v1/chat/completions",
		Headers:  bearer(apiKey),
		BodyJSON: reqBody,
	}, consume)
}

func bearer(apiKey string) http.Header {
	h := http.Header{}
	if apiKey != "" {
		h.Set("Authorization", "Bearer "+apiKey)
	}
	return h
}
