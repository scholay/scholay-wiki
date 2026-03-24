// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package semanticscholar

import (
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"sync"
	"time"
)

const (
	BaseURL            = "https://api.semanticscholar.org/graph/v1"
	RecommendationsURL = "https://api.semanticscholar.org/recommendations/v1"
	DefaultTimeout     = 60 * time.Second  // Increased from 30s to 60s
	DialTimeout        = 15 * time.Second  // Time to establish TCP connection
	TLSHandshakeTimeout = 15 * time.Second // Time for TLS handshake
	KeepAlive          = 30 * time.Second  // Keep-alive probe interval
	DefaultLimit       = 100               // API max limit per request
)

var (
	// Shared transport for all Semantic Scholar clients
	// This ensures connection pooling is reused across all client instances
	sharedTransport     *http.Transport
	sharedTransportOnce sync.Once
)

// getSharedTransport returns the shared HTTP transport for connection pooling
func getSharedTransport() *http.Transport {
	sharedTransportOnce.Do(func() {
		sharedTransport = &http.Transport{
			DialContext: (&net.Dialer{
				Timeout:   DialTimeout,
				KeepAlive: KeepAlive,
			}).DialContext,
			TLSHandshakeTimeout:   TLSHandshakeTimeout,
			ResponseHeaderTimeout: 30 * time.Second,
			ExpectContinueTimeout: 1 * time.Second,
			MaxIdleConns:          100,
			MaxIdleConnsPerHost:   20,  // Increased for better connection reuse
			IdleConnTimeout:       90 * time.Second,
			TLSClientConfig: &tls.Config{
				MinVersion: tls.VersionTLS12,
			},
		}
	})
	return sharedTransport
}

// Client represents a Semantic Scholar API client
type Client struct {
	apiKey     string
	httpClient *http.Client
	baseURL    string
	recURL     string
}

// GetAPIKeyLength returns the length of the API key (for debugging)
func (c *Client) GetAPIKeyLength() int {
	return len(c.apiKey)
}

// HasAPIKey returns true if the client has an API key configured
func (c *Client) HasAPIKey() bool {
	return c.apiKey != ""
}

// NewClient creates a new Semantic Scholar API client
func NewClient(apiKey string) *Client {
	return NewClientWithBaseURL(apiKey, BaseURL)
}

// NewClientWithBaseURL creates a new Semantic Scholar API client with custom base URL
// All clients share the same underlying HTTP transport for connection pooling
func NewClientWithBaseURL(apiKey string, baseURL string) *Client {
	if baseURL == "" {
		baseURL = BaseURL
	}

	return &Client{
		apiKey: apiKey,
		httpClient: &http.Client{
			Timeout:   DefaultTimeout,
			Transport: getSharedTransport(), // Use shared transport for connection pooling
		},
		baseURL: baseURL,
		recURL:  RecommendationsURL,
	}
}

// doRequest performs an HTTP request with common headers
func (c *Client) doRequest(method, urlStr string, body io.Reader) (*http.Response, error) {
	req, err := http.NewRequest(method, urlStr, body)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// Add headers
	if c.apiKey != "" {
		req.Header.Set("x-api-key", c.apiKey)
		fmt.Printf("[Client] Using API key (length: %d) for request to: %s\n", len(c.apiKey), urlStr)
	} else {
		fmt.Printf("[Client] NO API KEY - Using free tier for request to: %s\n", urlStr)
	}
	req.Header.Set("Content-Type", "application/json")

	// Perform request
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to perform request: %w", err)
	}

	// Check for errors
	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		return nil, fmt.Errorf("API error (status %d): %s", resp.StatusCode, string(body))
	}

	return resp, nil
}

// buildQueryString builds a query string from parameters
func buildQueryString(params map[string]string) string {
	values := url.Values{}
	for k, v := range params {
		if v != "" {
			values.Set(k, v)
		}
	}
	if len(values) == 0 {
		return ""
	}
	return "?" + values.Encode()
}

// unmarshalResponse unmarshals JSON response into target struct
func unmarshalResponse(resp *http.Response, target interface{}) error {
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read response body: %w", err)
	}

	if err := json.Unmarshal(body, target); err != nil {
		return fmt.Errorf("failed to unmarshal response: %w (body: %s)", err, string(body))
	}

	return nil
}
