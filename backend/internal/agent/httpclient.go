// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package agent

import (
	"net/http"
	"sync"
	"time"

	"scholar-backend/internal/common/httpclient"
)

// agent 的 /api/providers 是低频管理接口,但还是给它一个独立 Transport,
// 防止与高并发的 ai/proxy 池抢空闲连接;每次请求 < 5KB,连接池开得很小。
var (
	transportOnce sync.Once
	transport     *http.Transport
)

func sharedTransport() *http.Transport {
	transportOnce.Do(func() {
		transport = httpclient.NewTransport(httpclient.TransportOptions{
			MaxIdleConns:          10,
			MaxIdleConnsPerHost:   5,
			MaxConnsPerHost:       10,
			IdleConnTimeout:       90 * time.Second,
			ResponseHeaderTimeout: 10 * time.Second,
		})
	})
	return transport
}

// GetHTTPClient 返回带指定超时、共享 Transport 的 agent 专用客户端。
func GetHTTPClient(timeout time.Duration) *http.Client {
	return &http.Client{Timeout: timeout, Transport: sharedTransport()}
}
