package middleware

import (
	"testing"
	"time"
)

func TestRateLimiter_Allow(t *testing.T) {
	rl := NewRateLimiter(3, time.Second)

	for i := 0; i < 3; i++ {
		if !rl.Allow("client1") {
			t.Errorf("request %d should be allowed", i+1)
		}
	}

	if rl.Allow("client1") {
		t.Error("4th request should be denied")
	}

	// Different client should still be allowed
	if !rl.Allow("client2") {
		t.Error("different client should be allowed")
	}
}

func TestRateLimiter_WindowReset(t *testing.T) {
	rl := NewRateLimiter(1, 50*time.Millisecond)

	if !rl.Allow("client1") {
		t.Error("first request should be allowed")
	}
	if rl.Allow("client1") {
		t.Error("second request within window should be denied")
	}

	time.Sleep(60 * time.Millisecond)

	if !rl.Allow("client1") {
		t.Error("request after window reset should be allowed")
	}
}

func TestRateLimiter_Cleanup(t *testing.T) {
	rl := NewRateLimiter(10, 10*time.Millisecond)
	rl.cleanupAge = 10 * time.Millisecond

	rl.Allow("client1")
	rl.Allow("client2")

	if rl.GetClientCount() != 2 {
		t.Errorf("expected 2 clients, got %d", rl.GetClientCount())
	}

	time.Sleep(30 * time.Millisecond)
	rl.Cleanup()

	if rl.GetClientCount() != 0 {
		t.Errorf("expected 0 clients after cleanup, got %d", rl.GetClientCount())
	}
}

func TestRateLimiter_Eviction(t *testing.T) {
	rl := NewRateLimiter(10, time.Second)
	rl.maxClients = 2

	rl.Allow("client1")
	time.Sleep(time.Millisecond)
	rl.Allow("client2")
	time.Sleep(time.Millisecond)
	rl.Allow("client3") // should evict client1

	if rl.GetClientCount() != 2 {
		t.Errorf("expected 2 clients after eviction, got %d", rl.GetClientCount())
	}
}
