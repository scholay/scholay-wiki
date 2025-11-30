package circuitbreaker

import (
	"time"

	"github.com/sony/gobreaker"
)

var (
	// SemanticScholarBreaker protects Semantic Scholar API calls
	// Prevents cascading failures when the external service is down
	SemanticScholarBreaker = gobreaker.NewCircuitBreaker(gobreaker.Settings{
		Name:        "SemanticScholar",
		MaxRequests: 3,                // Maximum requests allowed in half-open state
		Interval:    time.Minute,      // Statistical window
		Timeout:     30 * time.Second, // Time to wait before trying again after open
		ReadyToTrip: func(counts gobreaker.Counts) bool {
			// Trip (open circuit) if 60% failure rate with at least 3 requests
			failureRatio := float64(counts.TotalFailures) / float64(counts.Requests)
			return counts.Requests >= 3 && failureRatio >= 0.6
		},
		OnStateChange: func(name string, from gobreaker.State, to gobreaker.State) {
			// Log state changes for monitoring
			// In production, send metrics to monitoring system
			// log.Printf("[Circuit Breaker] %s: %s -> %s\n", name, from, to)
		},
	})

	// AIServiceBreaker protects AI service API calls
	// 注意：由于我们有账号切换重试机制，熔断器配置需要更宽松
	// 避免在切换账号重试时过早触发熔断
	AIServiceBreaker = gobreaker.NewCircuitBreaker(gobreaker.Settings{
		Name:        "AIService",
		MaxRequests: 10,                // 半开状态允许更多请求通过测试
		Interval:    time.Minute,       // 统计窗口
		Timeout:     30 * time.Second,  // 熔断后等待时间缩短，更快恢复
		ReadyToTrip: func(counts gobreaker.Counts) bool {
			// 只有在连续失败次数达到阈值时才触发熔断
			// 提高阈值，因为账号切换重试会产生多次失败
			// 需要至少 10 次请求且 80% 失败率才触发
			failureRatio := float64(counts.TotalFailures) / float64(counts.Requests)
			return counts.Requests >= 10 && failureRatio >= 0.8
		},
		OnStateChange: func(name string, from gobreaker.State, to gobreaker.State) {
			// log.Printf("[Circuit Breaker] %s: %s -> %s\n", name, from, to)
		},
	})

	// ProxyServiceBreaker protects proxy API calls
	ProxyServiceBreaker = gobreaker.NewCircuitBreaker(gobreaker.Settings{
		Name:        "ProxyService",
		MaxRequests: 10,
		Interval:    time.Minute,
		Timeout:     30 * time.Second,
		ReadyToTrip: func(counts gobreaker.Counts) bool {
			failureRatio := float64(counts.TotalFailures) / float64(counts.Requests)
			return counts.Requests >= 10 && failureRatio >= 0.7
		},
		OnStateChange: func(name string, from gobreaker.State, to gobreaker.State) {
			// log.Printf("[Circuit Breaker] %s: %s -> %s\n", name, from, to)
		},
	})
)

// IsCircuitBreakerError checks if an error is from circuit breaker being open
func IsCircuitBreakerError(err error) bool {
	return err == gobreaker.ErrOpenState || err == gobreaker.ErrTooManyRequests
}
