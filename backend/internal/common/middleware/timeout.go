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

// TimeoutMiddleware adds request timeout to all requests
// This prevents hanging requests and ensures better resource control
//
// IMPORTANT: This implementation has a known limitation where handler goroutines
// may continue running after timeout. The context cancellation propagates to handlers
// that properly respect context, but handlers that don't check context.Done() may leak.
// This is a known Go timeout pattern limitation. Ensure all long-running operations
// in handlers properly check and respond to context cancellation.
func TimeoutMiddleware(timeout time.Duration) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Create a context with timeout
		ctx, cancel := context.WithTimeout(c.Request.Context(), timeout)
		defer cancel()

		// Replace request context with timeout context
		// This propagates cancellation to handlers that respect context
		c.Request = c.Request.WithContext(ctx)

		// Channel to signal when request processing is done
		done := make(chan struct{})
		panicChan := make(chan interface{}, 1)

		// Process request in goroutine
		go func() {
			defer func() {
				if p := recover(); p != nil {
					panicChan <- p
				}
			}()
			c.Next()
			close(done)
		}()

		// Wait for either completion or timeout
		select {
		case p := <-panicChan:
			// Handler panicked, re-panic after cleanup
			panic(p)
		case <-done:
			// Request completed successfully
			return
		case <-ctx.Done():
			// Timeout occurred
			// Note: The handler goroutine may still be running. Context cancellation
			// should trigger cleanup in well-behaved handlers that check ctx.Done().
			if ctx.Err() == context.DeadlineExceeded {
				c.JSON(408, gin.H{
					"code":    408,
					"message": "Request timeout",
					"error":   "The request took too long to process and was cancelled",
				})
				c.Abort()
			}
			// Give handler a brief moment to clean up
			// This doesn't fully solve goroutine leaks but allows context-aware handlers to exit
			time.Sleep(100 * time.Millisecond)
		}
	}
}

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
