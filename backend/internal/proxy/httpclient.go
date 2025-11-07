package proxy

import (
	"net/http"
	"time"
)

var (
	// sharedTransport is a shared HTTP transport with connection pooling
	// Reused across all proxy requests to maximize performance
	sharedTransport = &http.Transport{
		MaxIdleConns:          100,              // Maximum idle connections
		MaxIdleConnsPerHost:   20,               // Proxy may need more connections per host
		MaxConnsPerHost:       100,              // Maximum connections per host
		IdleConnTimeout:       90 * time.Second, // Idle connection timeout
		TLSHandshakeTimeout:   10 * time.Second, // TLS handshake timeout
		ExpectContinueTimeout: 1 * time.Second,
		DisableKeepAlives:     false, // Enable HTTP Keep-Alive
		DisableCompression:    false, // Enable compression
	}
)

// GetProxyHTTPClient returns an HTTP client with the specified timeout
// but sharing the same underlying transport for connection pooling.
func GetProxyHTTPClient(timeout int) *http.Client {
	return &http.Client{
		Timeout:   time.Duration(timeout) * time.Second,
		Transport: sharedTransport,
	}
}

// GetDefaultProxyHTTPClient returns an HTTP client with 30 second timeout
func GetDefaultProxyHTTPClient() *http.Client {
	return &http.Client{
		Timeout:   30 * time.Second,
		Transport: sharedTransport,
	}
}

// GetProxyTransport returns the shared HTTP transport
// Useful when you need to create a client with custom settings (like cookie jar)
// but still want to benefit from connection pooling
func GetProxyTransport() *http.Transport {
	return sharedTransport
}
