// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package middleware

import (
	"context"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// clientLimiter tracks request counts for a single client
type clientLimiter struct {
	count       int
	lastReset   time.Time
	windowSize  time.Duration
	maxRequests int
}

// RateLimiter manages rate limiting for different clients using sliding window
type RateLimiter struct {
	clients       map[string]*clientLimiter
	mu            sync.RWMutex
	windowSize    time.Duration
	maxRequests   int
	maxClients    int           // Maximum number of clients to track (LRU-like eviction)
	cleanupAge    time.Duration // Age after which inactive clients are removed
	stopCleanup   chan struct{} // Channel to signal cleanup goroutine to stop
	cleanupOnce   sync.Once     // Ensure cleanup goroutine is stopped only once
}

// NewRateLimiter creates a new rate limiter
// maxRequests: maximum requests allowed per window
// windowSize: time window duration (e.g., 1 second)
func NewRateLimiter(maxRequests int, windowSize time.Duration) *RateLimiter {
	return &RateLimiter{
		clients:     make(map[string]*clientLimiter),
		windowSize:  windowSize,
		maxRequests: maxRequests,
		maxClients:  50000,              // Limit to 50k clients to prevent memory issues
		cleanupAge:  2 * time.Minute,    // Clean up clients inactive for 2 minutes (reduced from 5)
		stopCleanup: make(chan struct{}),
	}
}

// Allow checks if a request is allowed for the given key
func (rl *RateLimiter) Allow(key string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	client, exists := rl.clients[key]

	if !exists {
		// Check if we're at capacity, evict oldest if necessary
		if len(rl.clients) >= rl.maxClients {
			rl.evictOldestLocked()
		}
		
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

// evictOldestLocked removes the oldest client entry (must hold write lock)
func (rl *RateLimiter) evictOldestLocked() {
	var oldestKey string
	var oldestTime time.Time
	first := true

	for key, client := range rl.clients {
		if first || client.lastReset.Before(oldestTime) {
			oldestKey = key
			oldestTime = client.lastReset
			first = false
		}
	}

	if oldestKey != "" {
		delete(rl.clients, oldestKey)
	}
}

// Cleanup removes old client entries
func (rl *RateLimiter) Cleanup() {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	for key, client := range rl.clients {
		// Remove clients whose window has expired by more than cleanupAge
		if now.Sub(client.lastReset) > client.windowSize+rl.cleanupAge {
			delete(rl.clients, key)
		}
	}
}

// GetClientCount returns the current number of tracked clients (for monitoring)
func (rl *RateLimiter) GetClientCount() int {
	rl.mu.RLock()
	defer rl.mu.RUnlock()
	return len(rl.clients)
}

// StartCleanup periodically cleans up old entries
// Uses 1 minute interval instead of 5 minutes for more aggressive cleanup
func (rl *RateLimiter) StartCleanup(interval time.Duration) {
	// Use shorter interval for more aggressive cleanup (minimum 1 minute)
	if interval > time.Minute {
		interval = time.Minute
	}
	
	ticker := time.NewTicker(interval)
	go func() {
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				rl.Cleanup()
			case <-rl.stopCleanup:
				return
			}
		}
	}()
}

// StartCleanupWithContext periodically cleans up old entries, respecting context cancellation
func (rl *RateLimiter) StartCleanupWithContext(ctx context.Context, interval time.Duration) {
	// Use shorter interval for more aggressive cleanup (minimum 1 minute)
	if interval > time.Minute {
		interval = time.Minute
	}
	
	ticker := time.NewTicker(interval)
	go func() {
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				rl.Cleanup()
			case <-ctx.Done():
				return
			case <-rl.stopCleanup:
				return
			}
		}
	}()
}

// StopCleanup signals the cleanup goroutine to stop (safe to call multiple times)
func (rl *RateLimiter) StopCleanup() {
	rl.cleanupOnce.Do(func() {
		close(rl.stopCleanup)
	})
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
