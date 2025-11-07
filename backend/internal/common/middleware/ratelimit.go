package middleware

import (
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// clientLimiter tracks request counts for a single client
type clientLimiter struct {
	count      int
	lastReset  time.Time
	windowSize time.Duration
	maxRequests int
}

// RateLimiter manages rate limiting for different clients using sliding window
type RateLimiter struct {
	clients     map[string]*clientLimiter
	mu          sync.RWMutex
	windowSize  time.Duration
	maxRequests int
}

// NewRateLimiter creates a new rate limiter
// maxRequests: maximum requests allowed per window
// windowSize: time window duration (e.g., 1 second)
func NewRateLimiter(maxRequests int, windowSize time.Duration) *RateLimiter {
	return &RateLimiter{
		clients:     make(map[string]*clientLimiter),
		windowSize:  windowSize,
		maxRequests: maxRequests,
	}
}

// Allow checks if a request is allowed for the given key
func (rl *RateLimiter) Allow(key string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	client, exists := rl.clients[key]

	if !exists {
		// First request from this client
		rl.clients[key] = &clientLimiter{
			count:       1,
			lastReset:   now,
			windowSize:  rl.windowSize,
			maxRequests: rl.maxRequests,
		}
		return true
	}

	// Check if window has expired
	if now.Sub(client.lastReset) >= client.windowSize {
		// Reset the window
		client.count = 1
		client.lastReset = now
		return true
	}

	// Within the same window
	if client.count < client.maxRequests {
		client.count++
		return true
	}

	// Rate limit exceeded
	return false
}

// Cleanup removes old client entries
func (rl *RateLimiter) Cleanup() {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	for key, client := range rl.clients {
		// Remove clients whose window has expired by more than 5 minutes
		if now.Sub(client.lastReset) > client.windowSize+5*time.Minute {
			delete(rl.clients, key)
		}
	}
}

// StartCleanup periodically cleans up old entries
func (rl *RateLimiter) StartCleanup(interval time.Duration) {
	ticker := time.NewTicker(interval)
	go func() {
		for range ticker.C {
			rl.Cleanup()
		}
	}()
}

// RateLimitMiddleware creates a rate limiting middleware
// Example: RateLimitMiddleware(100, 1*time.Second) allows 100 req/s
func RateLimitMiddleware(maxRequests int, windowSize time.Duration) gin.HandlerFunc {
	rl := NewRateLimiter(maxRequests, windowSize)

	// Start cleanup goroutine
	rl.StartCleanup(5 * time.Minute)

	return func(c *gin.Context) {
		// Use IP address as key
		key := c.ClientIP()

		if !rl.Allow(key) {
			c.JSON(429, gin.H{
				"code":    429,
				"message": "Too many requests",
				"error":   "Rate limit exceeded. Please slow down your requests.",
			})
			c.Abort()
			return
		}

		c.Next()
	}
}

// UserRateLimitMiddleware creates user-specific rate limiting
// This should be used after authentication middleware
func UserRateLimitMiddleware(maxRequests int, windowSize time.Duration) gin.HandlerFunc {
	rl := NewRateLimiter(maxRequests, windowSize)
	rl.StartCleanup(5 * time.Minute)

	return func(c *gin.Context) {
		// Try to get user ID from context (set by auth middleware)
		userIDInterface, exists := c.Get("user_id")
		var key string

		if exists {
			// Use user ID if authenticated
			switch v := userIDInterface.(type) {
			case string:
				key = v
			case uint:
				key = string(rune(v))
			default:
				key = c.ClientIP()
			}
		} else {
			// Fall back to IP if user not authenticated
			key = c.ClientIP()
		}

		if !rl.Allow(key) {
			c.JSON(429, gin.H{
				"code":    429,
				"message": "Too many requests",
				"error":   "Rate limit exceeded. Please slow down your requests.",
			})
			c.Abort()
			return
		}

		c.Next()
	}
}
