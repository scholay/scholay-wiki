// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package proxy

import (
	"net/http"
	"time"

	"scholar-backend/internal/common/httpclient"
)

// proxyTransport 是 proxy 专用连接池：单 host 并发比默认池更高，
// 避免前端大量并发请求被默认池的 MaxConnsPerHost=50 限流。
var proxyTransport = httpclient.NewTransport(httpclient.TransportOptions{
	MaxIdleConnsPerHost:   20,
	MaxConnsPerHost:       100,
	ResponseHeaderTimeout: 60 * time.Second,
})

// GetProxyHTTPClient 返回指定超时的 proxy 客户端（共享底层 Transport）。
func GetProxyHTTPClient(timeout int) *http.Client {
	return &http.Client{
		Timeout:   time.Duration(timeout) * time.Second,
		Transport: proxyTransport,
	}
}

// GetDefaultProxyHTTPClient 返回 30s 超时的 proxy 客户端。
func GetDefaultProxyHTTPClient() *http.Client {
	return &http.Client{
		Timeout:   30 * time.Second,
		Transport: proxyTransport,
	}
}

// GetProxyTransport 返回 proxy 共享 Transport（用于 cookie jar 等场景）。
func GetProxyTransport() *http.Transport {
	return proxyTransport
}
