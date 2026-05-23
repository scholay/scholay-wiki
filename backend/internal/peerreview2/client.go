// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================
//
// peerreview2/client.go —— 与 peer.scholay.com 通信的 HTTP 客户端。
// 所有请求自动带 X-API-Key,流式接口返回 *http.Response 由调用方负责 Close。

package peerreview2

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const (
	defaultBaseURL = "https://peer.scholay.com"

	// StreamRequestTimeout 流式接口建议总超时(供调用方在 ctx 上叠加)。
	// 远端 4-process 流水线典型 60-180s,留足余量到 10min。
	StreamRequestTimeout = 10 * time.Minute
	// 非流式接口超时
	jsonRequestTimeout = 30 * time.Second
)

// Client 远端 peer-review API 客户端
type Client struct {
	baseURL    string
	apiKey     string
	httpClient *http.Client // 普通请求用(JSON)
	streamHTTP *http.Client // 流式请求用(无总超时,靠 ctx 控制)
}

// NewClient 构造客户端;baseURL 为空时取默认值
func NewClient(baseURL, apiKey string) *Client {
	if baseURL == "" {
		baseURL = defaultBaseURL
	}
	baseURL = strings.TrimRight(baseURL, "/")

	tr := &http.Transport{
		DialContext: (&net.Dialer{
			Timeout:   10 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		MaxIdleConns:          50,
		MaxIdleConnsPerHost:   20,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
	}

	return &Client{
		baseURL: baseURL,
		apiKey:  apiKey,
		httpClient: &http.Client{
			Transport: tr,
			Timeout:   jsonRequestTimeout,
		},
		streamHTTP: &http.Client{
			Transport: tr,
			// Timeout 留 0,由 context.WithTimeout 控制 stream 总长度
		},
	}
}

// IsConfigured 是否已配置 API key
func (c *Client) IsConfigured() bool {
	return c.apiKey != ""
}

// ========== JSON 请求公共逻辑 ==========

func (c *Client) doJSON(ctx context.Context, method, path string, body io.Reader, contentType string, out any) (int, error) {
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, body)
	if err != nil {
		return 0, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("X-API-Key", c.apiKey)
	req.Header.Set("Accept", "application/json")
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return 0, fmt.Errorf("call %s %s: %w", method, path, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		raw, _ := io.ReadAll(io.LimitReader(resp.Body, 4*1024))
		return resp.StatusCode, &APIError{
			StatusCode: resp.StatusCode,
			Body:       string(raw),
		}
	}
	if out != nil {
		if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
			return resp.StatusCode, fmt.Errorf("decode response: %w", err)
		}
	}
	return resp.StatusCode, nil
}

// APIError 远端非 2xx 响应
type APIError struct {
	StatusCode int
	Body       string
}

func (e *APIError) Error() string {
	return fmt.Sprintf("peer-review API error: status=%d body=%s", e.StatusCode, e.Body)
}

// ========== 远端响应 schema(子集) ==========

type remoteConversationOut struct {
	ID              string    `json:"id"`
	CursorThreadID  *string   `json:"cursor_thread_id,omitempty"`
	ClientRequestID *string   `json:"client_request_id,omitempty"`
	PaperFilename   *string   `json:"paper_filename,omitempty"`
	Title           *string   `json:"title,omitempty"`
	Status          string    `json:"status"`
	CreatedAt       time.Time `json:"created_at"`
	LastActiveAt    time.Time `json:"last_active_at"`
}

type remoteTurnOut struct {
	ID             string     `json:"id"`
	ConversationID string     `json:"conversation_id"`
	Status         string     `json:"status"`
	StartedAt      *time.Time `json:"started_at,omitempty"`
	CompletedAt    *time.Time `json:"completed_at,omitempty"`
	Error          *string    `json:"error,omitempty"`
}

type remoteMessageOut struct {
	ID        string    `json:"id"`
	Role      string    `json:"role"`
	Content   string    `json:"content"`
	Seq       int       `json:"seq"`
	CreatedAt time.Time `json:"created_at"`
}

// ========== 接口方法 ==========

// CreateConversationResult 创建会话的结果(含 HTTP 状态码,201=新建,200=幂等命中)
type CreateConversationResult struct {
	StatusCode      int
	ID              string
	Status          string
	Title           string
	PaperFilename   string
	CursorThreadID  string
	ClientRequestID string
	CreatedAt       time.Time
	IsIdempotent    bool // StatusCode == 200
}

// CreateConversationByPDF 上传 PDF 创建会话
func (c *Client) CreateConversationByPDF(ctx context.Context, filename string, pdfReader io.Reader, title, clientRequestID string) (*CreateConversationResult, error) {
	body := &bytes.Buffer{}
	w := multipart.NewWriter(body)

	fw, err := w.CreateFormFile("file", filename)
	if err != nil {
		return nil, fmt.Errorf("create form file: %w", err)
	}
	if _, err := io.Copy(fw, pdfReader); err != nil {
		return nil, fmt.Errorf("copy pdf: %w", err)
	}
	if title != "" {
		_ = w.WriteField("title", title)
	}
	if clientRequestID != "" {
		_ = w.WriteField("client_request_id", clientRequestID)
	}
	if err := w.Close(); err != nil {
		return nil, fmt.Errorf("close multipart: %w", err)
	}

	// 上传可能较慢(20MiB+),用更长超时
	uploadCtx, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(uploadCtx, http.MethodPost, c.baseURL+"/conversations", body)
	if err != nil {
		return nil, fmt.Errorf("build upload request: %w", err)
	}
	req.Header.Set("X-API-Key", c.apiKey)
	req.Header.Set("Content-Type", w.FormDataContentType())
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("upload to peer.scholay.com: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		raw, _ := io.ReadAll(io.LimitReader(resp.Body, 4*1024))
		return nil, &APIError{StatusCode: resp.StatusCode, Body: string(raw)}
	}

	var out remoteConversationOut
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, fmt.Errorf("decode upload response: %w", err)
	}
	res := &CreateConversationResult{
		StatusCode:   resp.StatusCode,
		ID:           out.ID,
		Status:       out.Status,
		CreatedAt:    out.CreatedAt,
		IsIdempotent: resp.StatusCode == http.StatusOK,
	}
	if out.CursorThreadID != nil {
		res.CursorThreadID = *out.CursorThreadID
	}
	if out.ClientRequestID != nil {
		res.ClientRequestID = *out.ClientRequestID
	}
	if out.PaperFilename != nil {
		res.PaperFilename = *out.PaperFilename
	}
	if out.Title != nil {
		res.Title = *out.Title
	}
	return res, nil
}

// GetConversation 获取远端会话快照
func (c *Client) GetConversation(ctx context.Context, remoteConvID string) (*remoteConversationOut, error) {
	var out remoteConversationOut
	_, err := c.doJSON(ctx, http.MethodGet, "/conversations/"+url.PathEscape(remoteConvID), nil, "", &out)
	if err != nil {
		return nil, err
	}
	return &out, nil
}

// DeleteConversation 删除远端会话
func (c *Client) DeleteConversation(ctx context.Context, remoteConvID string) error {
	_, err := c.doJSON(ctx, http.MethodDelete, "/conversations/"+url.PathEscape(remoteConvID), nil, "", nil)
	return err
}

// ListTurns 列出会话所有 turn
func (c *Client) ListTurns(ctx context.Context, remoteConvID string) ([]TurnInfo, error) {
	var raws []remoteTurnOut
	_, err := c.doJSON(ctx, http.MethodGet, "/conversations/"+url.PathEscape(remoteConvID)+"/turns", nil, "", &raws)
	if err != nil {
		return nil, err
	}
	out := make([]TurnInfo, 0, len(raws))
	for _, r := range raws {
		t := TurnInfo{
			ID:             r.ID,
			ConversationID: r.ConversationID,
			Status:         r.Status,
			StartedAt:      r.StartedAt,
			CompletedAt:    r.CompletedAt,
		}
		if r.Error != nil {
			t.Error = *r.Error
		}
		out = append(out, t)
	}
	return out, nil
}

// ListMessages 列出会话所有 messages
func (c *Client) ListMessages(ctx context.Context, remoteConvID string) ([]MessageInfo, error) {
	var raws []remoteMessageOut
	_, err := c.doJSON(ctx, http.MethodGet, "/conversations/"+url.PathEscape(remoteConvID)+"/messages", nil, "", &raws)
	if err != nil {
		return nil, err
	}
	out := make([]MessageInfo, 0, len(raws))
	for _, r := range raws {
		out = append(out, MessageInfo(r))
	}
	return out, nil
}

// SendMessage 追问,返回新 turn 信息
func (c *Client) SendMessage(ctx context.Context, remoteConvID, content, clientMsgID string) (*TurnInfo, error) {
	body, _ := json.Marshal(map[string]string{
		"content":       content,
		"client_msg_id": clientMsgID,
	})
	var out remoteTurnOut
	_, err := c.doJSON(ctx, http.MethodPost,
		"/conversations/"+url.PathEscape(remoteConvID)+"/messages",
		bytes.NewReader(body), "application/json", &out)
	if err != nil {
		return nil, err
	}
	t := &TurnInfo{
		ID:             out.ID,
		ConversationID: out.ConversationID,
		Status:         out.Status,
		StartedAt:      out.StartedAt,
		CompletedAt:    out.CompletedAt,
	}
	if out.Error != nil {
		t.Error = *out.Error
	}
	return t, nil
}

// PauseConversation 暂停
func (c *Client) PauseConversation(ctx context.Context, remoteConvID string) error {
	_, err := c.doJSON(ctx, http.MethodPost, "/conversations/"+url.PathEscape(remoteConvID)+"/pause", nil, "", nil)
	return err
}

// ResumeConversation 恢复
func (c *Client) ResumeConversation(ctx context.Context, remoteConvID string) error {
	_, err := c.doJSON(ctx, http.MethodPost, "/conversations/"+url.PathEscape(remoteConvID)+"/resume", nil, "", nil)
	return err
}

// OpenTurnStream 打开 SSE 流。返回 *http.Response 由调用方负责 Close。
//
// 流式生命周期由传入 ctx 决定:调用方 cancel() 或 ctx 超时即触发底层 TCP 关闭。
// 推荐传 c.Request.Context() —— 客户端断开时 Gin 自动 cancel,流随之收尾。
// 上限保护:streamRequestTimeout(10min)由调用方在 ctx 上叠加 WithTimeout 实现。
func (c *Client) OpenTurnStream(ctx context.Context, remoteConvID, turnID string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		c.baseURL+"/conversations/"+url.PathEscape(remoteConvID)+"/turns/"+url.PathEscape(turnID)+"/stream",
		nil)
	if err != nil {
		return nil, fmt.Errorf("build stream request: %w", err)
	}
	req.Header.Set("X-API-Key", c.apiKey)
	req.Header.Set("Accept", "text/event-stream")
	req.Header.Set("Cache-Control", "no-cache")

	resp, err := c.streamHTTP.Do(req)
	if err != nil {
		return nil, fmt.Errorf("open stream: %w", err)
	}
	if resp.StatusCode >= 400 {
		raw, _ := io.ReadAll(io.LimitReader(resp.Body, 4*1024))
		_ = resp.Body.Close()
		return nil, &APIError{StatusCode: resp.StatusCode, Body: string(raw)}
	}
	return resp, nil
}
