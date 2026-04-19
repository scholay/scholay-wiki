// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package middleware

import (
	"context"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// isStreamingPath checks if the request path is a streaming endpoint
// that requires a longer timeout (e.g., SSE, AI chat, analysis).
func isStreamingPath(path string) bool {
	streamingPatterns := []string{
		"/chat/stream",
		"/advanced-search",
		"/continue",
		"/analysis",
		"/translate/stream",
		"/peer-review/stream",
	}
	for _, pattern := range streamingPatterns {
		if strings.Contains(path, pattern) {
			return true
		}
	}
	return false
}

// APITimeoutMiddleware provides different timeouts for different API types.
// Streaming endpoints (SSE, AI chat) get 15 minutes (硬上限，避免慢客户端让 goroutine 无限累积);
// write ops get 30s; reads get 15s.
//
// 说明：流式接口在 handler 层通过 sse.BeginStream 启动 30s 心跳保持连接活跃，
// 客户端断开后 c.Request.Context() 会随 gin 自动取消；此处的硬上限是最后一道保险。
func APITimeoutMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		var timeout time.Duration

		if c.GetHeader("Accept") == "text/event-stream" || isStreamingPath(c.Request.URL.Path) {
			timeout = 15 * time.Minute
		} else if c.Request.Method == "POST" || c.Request.Method == "PUT" {
			timeout = 30 * time.Second
		} else {
			timeout = 15 * time.Second
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), timeout)
		defer cancel()

		c.Request = c.Request.WithContext(ctx)
		c.Next()
	}
}
