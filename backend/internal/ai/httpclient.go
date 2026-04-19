// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package ai

import (
	"net/http"

	"scholar-backend/internal/common/httpclient"
)

// 说明：历史上 ai 包自建了 default / longRunning / streaming 三类 Client，
// 现统一交由 common/httpclient 共享池管理，这里仅保留 Get* 包装以兼容既有调用方。

// GetHTTPClient 返回共享的常规 HTTP 客户端。
func GetHTTPClient() *http.Client {
	return httpclient.Default()
}

// GetLongRunningHTTPClient 返回共享的长任务 HTTP 客户端。
func GetLongRunningHTTPClient() *http.Client {
	return httpclient.LongRunning()
}

// GetStreamingHTTPClient 返回共享的流式 HTTP 客户端。
func GetStreamingHTTPClient() *http.Client {
	return httpclient.Streaming()
}
