package middleware

import (
	"context"
	"time"

	"github.com/gin-gonic/gin"
)

// TimeoutMiddleware adds request timeout to all requests
// This prevents hanging requests and ensures better resource control
func TimeoutMiddleware(timeout time.Duration) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Create a context with timeout
		ctx, cancel := context.WithTimeout(c.Request.Context(), timeout)
		defer cancel()

		// Replace request context with timeout context
		c.Request = c.Request.WithContext(ctx)

		// Channel to signal when request processing is done
		done := make(chan struct{})

		// Process request in goroutine
		go func() {
			c.Next()
			close(done)
		}()

		// Wait for either completion or timeout
		select {
		case <-done:
			// Request completed successfully
			return
		case <-ctx.Done():
			// Timeout occurred
			if ctx.Err() == context.DeadlineExceeded {
				c.JSON(408, gin.H{
					"code":    408,
					"message": "Request timeout",
					"error":   "The request took too long to process and was cancelled",
				})
				c.Abort()
			}
		}
	}
}

// APITimeoutMiddleware provides different timeouts for different API types
func APITimeoutMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Determine timeout based on endpoint
		var timeout time.Duration

		// Streaming endpoints need longer timeout
		if c.GetHeader("Accept") == "text/event-stream" ||
			c.Request.URL.Path == "/api/v1/conversation/messages/stream" ||
			c.Request.URL.Path == "/api/v1/conversation/messages/advanced-search/stream" {
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
