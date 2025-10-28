package semanticscholar

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const (
	BaseURL            = "https://api.semanticscholar.org/graph/v1"
	RecommendationsURL = "https://api.semanticscholar.org/recommendations/v1"
	DefaultTimeout     = 30 * time.Second
	DefaultLimit       = 100 // API max limit per request
)

// Client represents a Semantic Scholar API client
type Client struct {
	apiKey     string
	httpClient *http.Client
	baseURL    string
	recURL     string
}

// NewClient creates a new Semantic Scholar API client
func NewClient(apiKey string) *Client {
	return NewClientWithBaseURL(apiKey, BaseURL)
}

// NewClientWithBaseURL creates a new Semantic Scholar API client with custom base URL
func NewClientWithBaseURL(apiKey string, baseURL string) *Client {
	if baseURL == "" {
		baseURL = BaseURL
	}
	return &Client{
		apiKey: apiKey,
		httpClient: &http.Client{
			Timeout: DefaultTimeout,
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

// Helper function to join string slices
func joinStrings(items []string, sep string) string {
	return strings.Join(items, sep)
}
