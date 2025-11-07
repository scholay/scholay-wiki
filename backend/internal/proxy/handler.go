package proxy

import (
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httputil"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type Handler struct{}

func NewHandler() *Handler {
	return &Handler{}
}

// ProxyPDF proxies PDF requests to external servers to bypass CORS restrictions
func (h *Handler) ProxyPDF(c *gin.Context) {
	// Get the PDF URL from query parameter
	pdfURL := c.Query("url")
	if pdfURL == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Missing 'url' query parameter",
		})
		return
	}

	// Validate the URL
	parsedURL, err := url.Parse(pdfURL)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid URL format",
		})
		return
	}

	// Only allow HTTP and HTTPS schemes
	if parsedURL.Scheme != "http" && parsedURL.Scheme != "https" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Only HTTP and HTTPS URLs are allowed",
		})
		return
	}

	jar, err := cookiejar.New(nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to initialize request handler",
		})
		return
	}

	// Create HTTP client with shared transport for connection pooling
	// but unique cookie jar for session handling
	client := &http.Client{
		Timeout:   30 * time.Second,
		Transport: GetProxyTransport(),
		Jar:       jar,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 10 {
				return http.ErrUseLastResponse
			}
			if len(via) > 0 {
				prev := via[len(via)-1]
				for key, values := range prev.Header {
					if strings.EqualFold(key, "Host") {
						continue
					}
					req.Header[key] = append([]string(nil), values...)
				}
			}
			return nil
		},
	}

	applyCommonHeaders := func(req *http.Request) {
		req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
		req.Header.Set("Accept", "application/pdf,application/octet-stream;q=0.9,application/*;q=0.8,*/*;q=0.7")
		req.Header.Set("Accept-Language", "en-US,en;q=0.9")
		req.Header.Set("Accept-Encoding", "identity")
		req.Header.Set("Connection", "keep-alive")
	}

	// Prefetch potential landing pages to collect cookies (for download-only links)
	prefetchURLs := inferPrefetchURLs(parsedURL)
	for _, prefetchURL := range prefetchURLs {
		prefetchReq, err := http.NewRequest("GET", prefetchURL, nil)
		if err != nil {
			continue
		}
		applyCommonHeaders(prefetchReq)
		prefetchReq.Header.Set("Referer", prefetchURL)
		prefetchReq.Header.Set("Connection", "keep-alive")
		prefetchResp, err := client.Do(prefetchReq)
		if err != nil {
			continue
		}
		_ = prefetchResp.Body.Close()
	}

	origin := parsedURL.Scheme + "://" + parsedURL.Host
	viewReferer := ""
	if len(prefetchURLs) > 0 {
		viewReferer = prefetchURLs[0]
	}
	headerStrategies := []func(*http.Request){
		func(req *http.Request) {
			if viewReferer != "" {
				req.Header.Set("Referer", viewReferer)
				req.Header.Set("Origin", origin)
			} else {
				req.Header.Set("Referer", origin+"/")
				req.Header.Set("Origin", origin)
			}
		},
		func(req *http.Request) {
			req.Header.Set("Referer", origin+"/")
			req.Header.Set("Origin", origin)
		},
		func(req *http.Request) {
			req.Header.Del("Origin")
			req.Header.Del("Referer")
		},
		func(req *http.Request) {
			req.Header.Del("Origin")
			req.Header.Set("Referer", pdfURL)
		},
		func(req *http.Request) {
			req.Header.Del("Origin")
			req.Header.Set("Referer", origin+"/")
			req.Header.Set("X-Requested-With", "XMLHttpRequest")
		},
		func(req *http.Request) {
			req.Header.Del("Origin")
			req.Header.Set("Referer", origin+"/")
			req.Header.Set("X-Requested-With", "XMLHttpRequest")
			req.AddCookie(&http.Cookie{
				Name:  "download",
				Value: "1",
				Path:  "/",
			})
		},
	}

	var resp *http.Response
	var requestDump []byte
	for idx, applyHeaders := range headerStrategies {
		req, err := http.NewRequest("GET", pdfURL, nil)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to create request",
			})
			return
		}

		applyCommonHeaders(req)
		applyHeaders(req)
		requestDump, _ = httputil.DumpRequestOut(req, false)

		resp, err = client.Do(req)
		if err != nil {
			if idx == len(headerStrategies)-1 {
				c.JSON(http.StatusBadGateway, gin.H{
					"error": "Failed to fetch PDF from remote server",
				})
				return
			}
			continue
		}

		if resp.StatusCode == http.StatusForbidden && idx < len(headerStrategies)-1 {
			resp.Body.Close()
			continue
		}

		break
	}

	if resp == nil {
		c.JSON(http.StatusBadGateway, gin.H{
			"error": "Failed to fetch PDF from remote server",
		})
		return
	}
	defer resp.Body.Close()

	// Check if the response is successful
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		bodyBytes, _ := io.ReadAll(resp.Body)
		errPayload := gin.H{
			"error":          "Remote server returned error",
			"status":         resp.StatusCode,
			"upstreamHeaders": resp.Header,
		}
		if len(bodyBytes) > 0 {
			errPayload["upstreamBody"] = string(bodyBytes)
		}
		if len(requestDump) > 0 {
			errPayload["requestDump"] = string(requestDump)
		}
		c.JSON(resp.StatusCode, errPayload)
		return
	}

	// Set response headers
	c.Header("Content-Type", "application/pdf")
	c.Header("Content-Disposition", "inline")
	c.Header("Access-Control-Allow-Origin", "*")
	c.Header("Access-Control-Allow-Methods", "GET, OPTIONS")
	c.Header("Access-Control-Allow-Headers", "Content-Type")

	// Copy content-length if available
	if resp.ContentLength > 0 {
		c.Header("Content-Length", strconv.FormatInt(resp.ContentLength, 10))
	}

	// Set cache control
	c.Header("Cache-Control", "public, max-age=3600")

	// Stream the PDF content
	c.Status(http.StatusOK)
	_, err = io.Copy(c.Writer, resp.Body)
	if err != nil {
		// Log error but don't send JSON response as headers already sent
		c.Error(err)
	}
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
		proxy.GET("/pdf", h.ProxyPDF)
		proxy.GET("/semantic-scholar/:paperId", h.ProxySemanticScholar)
		proxy.GET("/semantic-scholar/:paperId/*path", h.ProxySemanticScholar)
	}
}

// inferPrefetchURLs tries to derive related HTML pages that may set
// cookies or tokens before downloading the PDF file.
func inferPrefetchURLs(parsedURL *url.URL) []string {
	path := parsedURL.Path
	if path == "" {
		return nil
	}

	var urls []string
	segments := strings.Split(path, "/")
	for i, segment := range segments {
		if segment == "download" && i+1 < len(segments) {
			viewSegments := append([]string(nil), segments...)
			viewSegments[i] = "view"
			// keep the identifier segment (i+1) but trim after it if trailing format tokens exist
			viewSegments = viewSegments[:i+2]
			viewPath := strings.Join(viewSegments, "/")
			if !strings.HasPrefix(viewPath, "/") {
				viewPath = "/" + viewPath
			}
			prefetchURL := &url.URL{
				Scheme: parsedURL.Scheme,
				Host:   parsedURL.Host,
				Path:   viewPath,
			}
			urls = append(urls, prefetchURL.String())
			break
		}
	}

	return urls
}
