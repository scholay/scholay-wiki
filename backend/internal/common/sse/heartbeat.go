// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package sse

import (
	"io"
	"net/http"
	"sync"
	"time"
)

// HeartbeatWriter wraps an http.ResponseWriter and sends SSE comment heartbeats
// when no data has been written for the configured interval. This prevents
// proxies and CDNs from closing idle SSE connections.
type HeartbeatWriter struct {
	mu        sync.Mutex
	w         http.ResponseWriter
	flusher   http.Flusher
	lastWrite time.Time
	done      chan struct{}
	interval  time.Duration
}

// NewHeartbeatWriter creates a HeartbeatWriter that sends `: heartbeat\n\n`
// SSE comments every `interval` of idle time. Call Stop() when streaming is done.
func NewHeartbeatWriter(w http.ResponseWriter, interval time.Duration) *HeartbeatWriter {
	flusher, _ := w.(http.Flusher)
	hw := &HeartbeatWriter{
		w:         w,
		flusher:   flusher,
		lastWrite: time.Now(),
		done:      make(chan struct{}),
		interval:  interval,
	}
	go hw.heartbeatLoop()
	return hw
}

// Write implements io.Writer. Thread-safe.
func (hw *HeartbeatWriter) Write(p []byte) (int, error) {
	hw.mu.Lock()
	defer hw.mu.Unlock()
	hw.lastWrite = time.Now()
	return hw.w.Write(p)
}

// Flush delegates to the underlying http.Flusher. Thread-safe.
func (hw *HeartbeatWriter) Flush() {
	hw.mu.Lock()
	defer hw.mu.Unlock()
	if hw.flusher != nil {
		hw.flusher.Flush()
	}
}

// WriteString is a convenience helper. Thread-safe.
func (hw *HeartbeatWriter) WriteString(s string) (int, error) {
	return hw.Write([]byte(s))
}

// Stop terminates the heartbeat goroutine. Must be called when streaming ends.
func (hw *HeartbeatWriter) Stop() {
	select {
	case <-hw.done:
	default:
		close(hw.done)
	}
}

// ResponseWriter returns the underlying http.ResponseWriter for header access.
func (hw *HeartbeatWriter) ResponseWriter() http.ResponseWriter {
	return hw.w
}

func (hw *HeartbeatWriter) heartbeatLoop() {
	ticker := time.NewTicker(hw.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			hw.mu.Lock()
			if time.Since(hw.lastWrite) >= hw.interval && hw.flusher != nil {
				hw.w.Write([]byte(": heartbeat\n\n"))
				hw.flusher.Flush()
				hw.lastWrite = time.Now()
			}
			hw.mu.Unlock()
		case <-hw.done:
			return
		}
	}
}

// Ensure HeartbeatWriter implements io.Writer.
var _ io.Writer = (*HeartbeatWriter)(nil)
