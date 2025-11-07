package ai

import (
	"net/http"
	"time"
)

var (
	// defaultHTTPClient is a singleton HTTP client with connection pooling enabled
	// This client is shared across all AI service requests to reuse TCP connections
	// and avoid the overhead of establishing new connections for each request.
	defaultHTTPClient = &http.Client{
		Timeout: 5 * time.Minute,
		Transport: &http.Transport{
			// Connection pool settings
			MaxIdleConns:          100,              // Maximum idle connections across all hosts
			MaxIdleConnsPerHost:   10,               // Maximum idle connections per host
			MaxConnsPerHost:       50,               // Maximum connections per host
			IdleConnTimeout:       90 * time.Second, // Idle connection timeout
			TLSHandshakeTimeout:   10 * time.Second, // TLS handshake timeout
			ExpectContinueTimeout: 1 * time.Second,  // Expect: 100-continue timeout
			DisableKeepAlives:     false,            // Enable HTTP Keep-Alive
			DisableCompression:    false,            // Enable compression
		},
	}
)

// GetHTTPClient returns the shared HTTP client for AI service requests.
// This client has connection pooling enabled and should be used for all
// external API calls to maximize performance.
func GetHTTPClient() *http.Client {
	return defaultHTTPClient
}
