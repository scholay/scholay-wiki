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
	// sharedTransport is the shared transport with connection pooling
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

	// defaultHTTPClient is a singleton HTTP client with connection pooling enabled
	// This client is shared across all AI service requests to reuse TCP connections
	// and avoid the overhead of establishing new connections for each request.
	// Note: Timeout is set to 5 minutes for non-streaming requests
	defaultHTTPClient = &http.Client{
		Timeout:   5 * time.Minute,
		Transport: sharedTransport,
	}

	// streamingHTTPClient is for streaming requests that may take longer
	// No overall timeout since streaming responses can take a long time
	// The ResponseHeaderTimeout in transport ensures we don't wait forever for the initial response
	streamingHTTPClient = &http.Client{
		Timeout:   0, // No timeout for streaming - response can take as long as needed
		Transport: sharedTransport,
	}
)

// GetHTTPClient returns the shared HTTP client for AI service requests.
// This client has connection pooling enabled and should be used for all
// external API calls to maximize performance.
func GetHTTPClient() *http.Client {
	return defaultHTTPClient
}

// GetStreamingHTTPClient returns a HTTP client optimized for streaming requests.
// This client has no overall timeout since streaming responses can take a long time.
func GetStreamingHTTPClient() *http.Client {
	return streamingHTTPClient
}
