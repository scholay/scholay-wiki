// ============================================================================
// Scholay学术 V1.0
// 共享 OAuth/外部短连接 HTTP 客户端
// ============================================================================
//
// 各 OAuth 提供方（github/google/microsoft/apple/orcid）原本各自声明了
// 完全相同参数的 *http.Client，这里统一为一个实例：
//
//   - Timeout: 10s（OAuth 接口正常应在 1s 内返回，10s 容忍极端抖动）
//   - 复用连接：MaxIdleConns=20, PerHost=10, IdleConnTimeout=90s
//
// 调用方应直接使用 OAuthClient 而不是新建 http.Client。
// 自定义需要时使用 NewOAuth(opts) 构造（保留扩展能力）。

package httpclient

import (
	"net/http"
	"time"
)

// OAuthClient 是供所有 OAuth Provider 共享的 HTTP 客户端实例。
var OAuthClient = newDefaultOAuth()

func newDefaultOAuth() *http.Client {
	return &http.Client{
		Timeout: 10 * time.Second,
		Transport: &http.Transport{
			MaxIdleConns:        20,
			MaxIdleConnsPerHost: 10,
			IdleConnTimeout:     90 * time.Second,
		},
	}
}

// NewOAuth 构造一个独立的 OAuth 客户端（连接池不与 OAuthClient 共享）。
// 仅在确实需要不同 timeout/transport 时使用，否则直接用 OAuthClient。
func NewOAuth(timeout time.Duration) *http.Client {
	return &http.Client{
		Timeout: timeout,
		Transport: &http.Transport{
			MaxIdleConns:        20,
			MaxIdleConnsPerHost: 10,
			IdleConnTimeout:     90 * time.Second,
		},
	}
}
