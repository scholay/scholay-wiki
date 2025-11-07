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
	AIServiceBreaker = gobreaker.NewCircuitBreaker(gobreaker.Settings{
		Name:        "AIService",
		MaxRequests: 5,
		Interval:    time.Minute,
		Timeout:     time.Minute, // AI services may be slower, wait longer
		ReadyToTrip: func(counts gobreaker.Counts) bool {
			// Trip if 50% failure rate with at least 5 requests
			failureRatio := float64(counts.TotalFailures) / float64(counts.Requests)
			return counts.Requests >= 5 && failureRatio >= 0.5
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
