// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package httpclient

import (
	"net"
	"net/http"
	"time"
)

var sharedTransport = &http.Transport{
	DialContext: (&net.Dialer{
		Timeout:   10 * time.Second,
		KeepAlive: 30 * time.Second,
	}).DialContext,
	MaxIdleConns:        100,
	MaxIdleConnsPerHost: 20,
	IdleConnTimeout:     90 * time.Second,
	TLSHandshakeTimeout: 10 * time.Second,
}

var (
	shortClient = &http.Client{
		Timeout:   10 * time.Second,
		Transport: sharedTransport,
	}
	defaultClient = &http.Client{
		Timeout:   30 * time.Second,
		Transport: sharedTransport,
	}
	longClient = &http.Client{
		Timeout:   60 * time.Second,
		Transport: sharedTransport,
	}
	streamingClient = &http.Client{
		Timeout:   5 * time.Minute,
		Transport: sharedTransport,
	}
)

// Short returns an HTTP client with a 10-second timeout.
// Use for quick health checks, token validation, etc.
func Short() *http.Client { return shortClient }

// Default returns an HTTP client with a 30-second timeout.
// Use for standard API calls (payment, OAuth, config fetches).
func Default() *http.Client { return defaultClient }

// Long returns an HTTP client with a 60-second timeout.
// Use for AI completions, large uploads, etc.
func Long() *http.Client { return longClient }

// Streaming returns an HTTP client with a 5-minute timeout.
// Use for SSE streams and long-running AI requests.
func Streaming() *http.Client { return streamingClient }
