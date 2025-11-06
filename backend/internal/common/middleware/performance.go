package middleware

import (
	"log"
	"time"

	"github.com/gin-gonic/gin"
)

// PerformanceMonitor 性能监控中间件
// 记录每个API请求的响应时间
func PerformanceMonitor() gin.HandlerFunc {
	return func(c *gin.Context) {
		startTime := time.Now()

		// 处理请求
		c.Next()

		// 计算响应时间
		duration := time.Since(startTime)

		// 记录慢查询 (超过1秒的请求)
		if duration > time.Second {
			log.Printf("[SLOW REQUEST] %s %s took %v, status: %d",
				c.Request.Method,
				c.Request.URL.Path,
				duration,
				c.Writer.Status(),
			)
		}

		// 添加响应时间到header (方便调试)
		c.Header("X-Response-Time", duration.String())
	}
}

// RateLimitByIP IP级别的简单限流中间件
// 使用Redis实现,防止单个IP过度请求
func RateLimitByIP(maxRequests int, window time.Duration) gin.HandlerFunc {
	return func(c *gin.Context) {
		// TODO: 实现基于Redis的滑动窗口限流
		// 这里先简单放行,后续可以增强
		c.Next()
	}
}
