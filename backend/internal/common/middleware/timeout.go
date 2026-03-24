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

// APITimeoutMiddleware provides different timeouts for different API types
func APITimeoutMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Determine timeout based on endpoint
		var timeout time.Duration

		path := c.Request.URL.Path
		isStreaming := c.GetHeader("Accept") == "text/event-stream" ||
			strings.Contains(path, "/chat/stream") ||
			strings.Contains(path, "/advanced-search") ||
			strings.Contains(path, "/continue") ||
			strings.Contains(path, "/task/stream") ||
			strings.Contains(path, "/section/stream") ||
			strings.Contains(path, "/translate/stream") ||
			strings.Contains(path, "/watch") ||
			strings.HasPrefix(path, "/api/v1/ws")

		if isStreaming {
			timeout = 5 * time.Minute // 5 minutes for streaming
		} else if c.Request.Method == "POST" || c.Request.Method == "PUT" {
			timeout = 30 * time.Second // 30 seconds for write operations
		} else {
			timeout = 15 * time.Second // 15 seconds for read operations
		}

		// Create context with timeout
		ctx, cancel := context.WithTimeout(c.Request.Context(), timeout)
		defer cancel()

		// Replace request context
		c.Request = c.Request.WithContext(ctx)

		// Continue with request
		c.Next()
	}
}
