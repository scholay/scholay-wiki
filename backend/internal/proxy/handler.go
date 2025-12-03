// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package proxy

import (
	"io"
	"net/http"
	"net/http/cookiejar"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type Handler struct{}

func NewHandler() *Handler {
	return &Handler{}
}

// ProxySemanticScholar proxies Semantic Scholar web pages to bypass X-Frame-Options
func (h *Handler) ProxySemanticScholar(c *gin.Context) {
	// Get the paper ID or full path from the URL parameter
	paperId := c.Param("paperId")
	if paperId == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Missing paper ID",
		})
		return
	}

	// Construct the Semantic Scholar URL
	targetURL := "https://www.semanticscholar.org/paper/" + paperId

	// Get any additional path segments
	additionalPath := c.Param("path")
	if additionalPath != "" {
		targetURL += additionalPath
	}

	// Create cookie jar to maintain session
	jar, _ := cookiejar.New(nil)

	// Create HTTP client with shared transport for connection pooling
	// but unique cookie jar for session handling
	client := &http.Client{
		Timeout:   30 * time.Second,
		Transport: GetProxyTransport(),
		Jar:       jar,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			// Allow up to 10 redirects
			if len(via) >= 10 {
				return http.ErrUseLastResponse
			}
			// Copy headers from previous request
			if len(via) > 0 {
				prev := via[len(via)-1]
				for key, values := range prev.Header {
					// Don't copy Host header
					if strings.EqualFold(key, "Host") {
						continue
					}
					req.Header[key] = append([]string(nil), values...)
				}
			}
			return nil
		},
	}

	// Create request to Semantic Scholar
	req, err := http.NewRequest("GET", targetURL, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to create request",
		})
		return
	}

	// Set headers to mimic a real browser more accurately
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7")
	req.Header.Set("Accept-Encoding", "gzip, deflate, br")
	req.Header.Set("Connection", "keep-alive")
	req.Header.Set("Upgrade-Insecure-Requests", "1")
	req.Header.Set("Sec-Fetch-Dest", "document")
	req.Header.Set("Sec-Fetch-Mode", "navigate")
	req.Header.Set("Sec-Fetch-Site", "none")
	req.Header.Set("Sec-Fetch-User", "?1")
	req.Header.Set("Cache-Control", "max-age=0")
	req.Header.Set("DNT", "1")

	// Set referer to make it look like we're coming from Semantic Scholar
	req.Header.Set("Referer", "https://www.semanticscholar.org/")

	// Execute request
	resp, err := client.Do(req)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{
			"error": "Failed to fetch from Semantic Scholar",
			"details": err.Error(),
		})
		return
	}
	defer resp.Body.Close()

	// Check if the response is successful
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		bodyBytes, _ := io.ReadAll(resp.Body)
		c.JSON(resp.StatusCode, gin.H{
			"error":  "Semantic Scholar returned error",
			"status": resp.StatusCode,
			"url": targetURL,
			"finalUrl": resp.Request.URL.String(),
			"body":   string(bodyBytes),
		})
		return
	}

	// Copy relevant headers from upstream response
	for key, values := range resp.Header {
		// Skip security headers that prevent embedding
		if strings.EqualFold(key, "X-Frame-Options") ||
			strings.EqualFold(key, "Content-Security-Policy") ||
			strings.EqualFold(key, "X-Content-Type-Options") ||
			strings.EqualFold(key, "Content-Security-Policy-Report-Only") {
			continue
		}
		for _, value := range values {
			c.Header(key, value)
		}
	}

	// Set CORS headers to allow embedding
	c.Header("Access-Control-Allow-Origin", "*")
	c.Header("Access-Control-Allow-Methods", "GET, OPTIONS")
	c.Header("Access-Control-Allow-Headers", "Content-Type")

	// Remove any frame-busting headers
	c.Header("X-Frame-Options", "")
	c.Header("Content-Security-Policy", "")

	// Stream the response content
	c.Status(resp.StatusCode)
	_, err = io.Copy(c.Writer, resp.Body)
	if err != nil {
		c.Error(err)
	}
}

// RegisterRoutes registers proxy routes with authentication middleware
func (h *Handler) RegisterRoutes(rg *gin.RouterGroup, authMiddleware gin.HandlerFunc) {
	proxy := rg.Group("/proxy")
	proxy.Use(authMiddleware)
	{
		proxy.GET("/semantic-scholar/:paperId", h.ProxySemanticScholar)
		proxy.GET("/semantic-scholar/:paperId/*path", h.ProxySemanticScholar)
	}
}
