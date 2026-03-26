// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package agent

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
)

// Handler proxies requests to the external Agent API (agent.scholay.com).
// All upstream communication is authenticated with a server-side API token
// so the token never reaches the browser.
type Handler struct {
	baseURL  string
	apiToken string
}

// NewHandler reads AGENT_API_URL and AGENT_API_TOKEN from environment.
func NewHandler() *Handler {
	baseURL := os.Getenv("AGENT_API_URL")
	if baseURL == "" {
		baseURL = "https://agent.scholay.com"
	}
	baseURL = strings.TrimRight(baseURL, "/")

	return &Handler{
		baseURL:  baseURL,
		apiToken: os.Getenv("AGENT_API_TOKEN"),
	}
}

// ---------- helpers ----------

func (h *Handler) agentURL(path string) string {
	return h.baseURL + path
}

func (h *Handler) setAuthHeader(req *http.Request) {
	if h.apiToken != "" {
		req.Header.Set("Authorization", "Bearer "+h.apiToken)
	}
}

func jsonError(c *gin.Context, status int, msg string) {
	c.JSON(status, gin.H{"error": msg})
}

// ---------- CreateSession ----------

type createSessionRequest struct {
	Provider string `json:"provider"`
}

func (h *Handler) CreateSession(c *gin.Context) {
	var body createSessionRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		jsonError(c, http.StatusBadRequest, "invalid request body")
		return
	}

	payload, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(
		c.Request.Context(),
		http.MethodPost,
		h.agentURL("/api/sessions"),
		bytes.NewReader(payload),
	)
	if err != nil {
		jsonError(c, http.StatusInternalServerError, "failed to build upstream request")
		return
	}
	req.Header.Set("Content-Type", "application/json")
	h.setAuthHeader(req)

	resp, err := newHTTPClient(defaultRequestTimeout).Do(req)
	if err != nil {
		log.Printf("[agent] CreateSession upstream error: %v", err)
		jsonError(c, http.StatusBadGateway, "agent service unreachable")
		return
	}
	defer resp.Body.Close()

	c.Status(resp.StatusCode)
	c.Header("Content-Type", "application/json")
	io.Copy(c.Writer, resp.Body)
}

// ---------- DeleteSession ----------

func (h *Handler) DeleteSession(c *gin.Context) {
	sessionID := c.Param("sessionId")
	if sessionID == "" {
		jsonError(c, http.StatusBadRequest, "missing sessionId")
		return
	}

	req, err := http.NewRequestWithContext(
		c.Request.Context(),
		http.MethodDelete,
		h.agentURL("/api/sessions/"+sessionID),
		nil,
	)
	if err != nil {
		jsonError(c, http.StatusInternalServerError, "failed to build upstream request")
		return
	}
	h.setAuthHeader(req)

	resp, err := newHTTPClient(defaultRequestTimeout).Do(req)
	if err != nil {
		log.Printf("[agent] DeleteSession upstream error: %v", err)
		jsonError(c, http.StatusBadGateway, "agent service unreachable")
		return
	}
	defer resp.Body.Close()

	c.Status(resp.StatusCode)
	c.Header("Content-Type", "application/json")
	io.Copy(c.Writer, resp.Body)
}

// ---------- UploadFile ----------

func (h *Handler) UploadFile(c *gin.Context) {
	sessionID := c.Param("sessionId")
	if sessionID == "" {
		jsonError(c, http.StatusBadRequest, "missing sessionId")
		return
	}

	// Limit upload body to 200 MB to prevent abuse
	const maxUploadBody = 200 << 20
	bodyReader := http.MaxBytesReader(c.Writer, c.Request.Body, maxUploadBody)

	req, err := http.NewRequestWithContext(
		c.Request.Context(),
		http.MethodPost,
		h.agentURL("/api/sessions/"+sessionID+"/upload"),
		bodyReader,
	)
	if err != nil {
		jsonError(c, http.StatusInternalServerError, "failed to build upstream request")
		return
	}
	req.Header.Set("Content-Type", c.GetHeader("Content-Type"))
	h.setAuthHeader(req)

	resp, err := newHTTPClient(uploadTimeout).Do(req)
	if err != nil {
		log.Printf("[agent] UploadFile upstream error: %v", err)
		jsonError(c, http.StatusBadGateway, "agent service unreachable")
		return
	}
	defer resp.Body.Close()

	c.Status(resp.StatusCode)
	c.Header("Content-Type", "application/json")
	io.Copy(c.Writer, resp.Body)
}

// ---------- ChatSSE (streaming proxy) ----------

func (h *Handler) ChatSSE(c *gin.Context) {
	sessionID := c.Param("sessionId")
	if sessionID == "" {
		jsonError(c, http.StatusBadRequest, "missing sessionId")
		return
	}

	bodyBytes, err := io.ReadAll(io.LimitReader(c.Request.Body, 1<<20))
	if err != nil {
		jsonError(c, http.StatusBadRequest, "failed to read request body")
		return
	}

	req, err := http.NewRequestWithContext(
		c.Request.Context(),
		http.MethodPost,
		h.agentURL("/api/sessions/"+sessionID+"/chat"),
		bytes.NewReader(bodyBytes),
	)
	if err != nil {
		jsonError(c, http.StatusInternalServerError, "failed to build upstream request")
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "text/event-stream")
	h.setAuthHeader(req)

	resp, err := newSSEHTTPClient().Do(req)
	if err != nil {
		log.Printf("[agent] ChatSSE upstream error: %v", err)
		jsonError(c, http.StatusBadGateway, "agent service unreachable")
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		c.Status(resp.StatusCode)
		c.Header("Content-Type", resp.Header.Get("Content-Type"))
		io.Copy(c.Writer, resp.Body)
		return
	}

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")
	c.Status(http.StatusOK)

	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		log.Println("[agent] ResponseWriter does not implement http.Flusher")
		return
	}

	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	clientGone := c.Request.Context().Done()
	for scanner.Scan() {
		select {
		case <-clientGone:
			log.Printf("[agent] ChatSSE client disconnected (session=%s)", sessionID)
			return
		default:
		}
		line := scanner.Text()
		fmt.Fprintf(c.Writer, "%s\n", line)
		flusher.Flush()
	}

	if err := scanner.Err(); err != nil {
		log.Printf("[agent] ChatSSE scanner error (session=%s): %v", sessionID, err)
	}
}

// ---------- Route registration ----------

func (h *Handler) RegisterRoutes(userGroup *gin.RouterGroup) {
	g := userGroup.Group("/agent/sessions")
	{
		g.POST("", h.CreateSession)
		g.DELETE("/:sessionId", h.DeleteSession)
		g.POST("/:sessionId/upload", h.UploadFile)
		g.POST("/:sessionId/chat", h.ChatSSE)
	}
}
