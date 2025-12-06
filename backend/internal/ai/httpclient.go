// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package ai

import (
	"net/http"
	"time"
)

var (
	// sharedTransport is the shared transport with connection pooling for normal requests
	sharedTransport = &http.Transport{
		// Connection pool settings
		MaxIdleConns:          100,              // Maximum idle connections across all hosts
		MaxIdleConnsPerHost:   10,               // Maximum idle connections per host
		MaxConnsPerHost:       50,               // Maximum connections per host
		IdleConnTimeout:       90 * time.Second, // Idle connection timeout
		TLSHandshakeTimeout:   10 * time.Second, // TLS handshake timeout
		ExpectContinueTimeout: 1 * time.Second,  // Expect: 100-continue timeout
		DisableKeepAlives:     false,            // Enable HTTP Keep-Alive
		DisableCompression:    false,            // Enable compression
		ResponseHeaderTimeout: 60 * time.Second, // Wait for response headers (not body)
	}

	// longRunningTransport is for long-running requests like peer review with PDF processing
	// Uses a longer ResponseHeaderTimeout to accommodate AI processing time
	longRunningTransport = &http.Transport{
		MaxIdleConns:          100,
		MaxIdleConnsPerHost:   10,
		MaxConnsPerHost:       50,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
		DisableKeepAlives:     false,
		DisableCompression:    false,
		ResponseHeaderTimeout: 10 * time.Minute, // 10 minutes for long-running AI tasks
	}

	// defaultHTTPClient is a singleton HTTP client with connection pooling enabled
	// This client is shared across all AI service requests to reuse TCP connections
	// and avoid the overhead of establishing new connections for each request.
	// Note: Timeout is set to 5 minutes for non-streaming requests
	defaultHTTPClient = &http.Client{
		Timeout:   5 * time.Minute,
		Transport: sharedTransport,
	}

	// longRunningHTTPClient is for long-running requests like peer review
	// Uses longer timeouts for AI tasks that process large documents
	longRunningHTTPClient = &http.Client{
		Timeout:   10 * time.Minute, // 10 minutes total timeout
		Transport: longRunningTransport,
	}

	// streamingHTTPClient is for streaming requests that may take longer
	// No overall timeout since streaming responses can take a long time
	// Uses longRunningTransport for longer ResponseHeaderTimeout
	streamingHTTPClient = &http.Client{
		Timeout:   0, // No timeout for streaming - response can take as long as needed
		Transport: longRunningTransport,
	}
)

// GetHTTPClient returns the shared HTTP client for AI service requests.
// This client has connection pooling enabled and should be used for all
// external API calls to maximize performance.
func GetHTTPClient() *http.Client {
	return defaultHTTPClient
}

// GetLongRunningHTTPClient returns a HTTP client optimized for long-running requests.
// This client has longer timeouts suitable for AI tasks that process large documents
// like peer review with PDF files.
func GetLongRunningHTTPClient() *http.Client {
	return longRunningHTTPClient
}

// GetStreamingHTTPClient returns a HTTP client optimized for streaming requests.
// This client has no overall timeout since streaming responses can take a long time.
func GetStreamingHTTPClient() *http.Client {
	return streamingHTTPClient
}
