// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"net/url"
	"strings"
	"time"

	"scholar-backend/internal/agentconfig"
	"scholar-backend/internal/common/circuitbreaker"
)

const (
	// scholay-managed 是 backend 在 agent 端维护的 provider 名字,作为
	// upsert 时的去重 key,避免重复创建 provider。
	managedProviderName = "scholay-managed"
	// 单次往返超时,/api/providers 列表/POST/PUT/activate 都是毫秒级。
	roundTripTimeout = 10 * time.Second
	// PushConfig 整体超时(覆盖 list → upsert → activate 的串行往返)。
	pushOverallTimeout = 30 * time.Second
)

// Client 封装到 scholar_agent /api/providers 的推送逻辑。
type Client struct {
	baseURL    string
	authToken  string
	httpClient *http.Client
}

// NewClient baseURL 形如 http://scholar_agent:3456;authToken 为空时不带 Authorization。
func NewClient(baseURL, authToken string) *Client {
	return &Client{
		baseURL:    strings.TrimRight(baseURL, "/"),
		authToken:  authToken,
		httpClient: GetHTTPClient(roundTripTimeout),
	}
}

// ModelMapping 对应 agent ModelMappingSchema (main/haiku/sonnet/opus)。
type ModelMapping struct {
	Main   string `json:"main"`
	Haiku  string `json:"haiku"`
	Sonnet string `json:"sonnet"`
	Opus   string `json:"opus"`
}

// SavedProvider 对应 agent SavedProviderSchema(仅取本模块用到的字段)。
type SavedProvider struct {
	ID           string       `json:"id"`
	PresetID     string       `json:"presetId"`
	Name         string       `json:"name"`
	APIKey       string       `json:"apiKey"`
	BaseURL      string       `json:"baseUrl"`
	APIFormat    string       `json:"apiFormat"`
	AuthStrategy string       `json:"authStrategy,omitempty"`
	Models       ModelMapping `json:"models"`
	Notes        string       `json:"notes,omitempty"`
}

// CreateProviderRequest 对应 agent CreateProviderSchema。
type CreateProviderRequest struct {
	PresetID     string       `json:"presetId"`
	Name         string       `json:"name"`
	APIKey       string       `json:"apiKey"`
	BaseURL      string       `json:"baseUrl"`
	APIFormat    string       `json:"apiFormat"`
	AuthStrategy string       `json:"authStrategy,omitempty"`
	Models       ModelMapping `json:"models"`
	Notes        string       `json:"notes,omitempty"`
}

// UpdateProviderRequest 对应 agent UpdateProviderSchema(部分更新)。
type UpdateProviderRequest struct {
	Name         string        `json:"name,omitempty"`
	APIKey       *string       `json:"apiKey,omitempty"`
	BaseURL      string        `json:"baseUrl,omitempty"`
	APIFormat    string        `json:"apiFormat,omitempty"`
	AuthStrategy string        `json:"authStrategy,omitempty"`
	Models       *ModelMapping `json:"models,omitempty"`
	Notes        string        `json:"notes,omitempty"`
}

type providersListResponse struct {
	Providers []SavedProvider `json:"providers"`
	ActiveID  *string         `json:"activeId"`
}

type createOrUpdateResponse struct {
	Provider SavedProvider `json:"provider"`
}

type errorResponse struct {
	Error   string `json:"error"`
	Message string `json:"message"`
}

// CreatedSession 是 agent POST /api/sessions 的最小响应形态。
type CreatedSession struct {
	SessionID string `json:"sessionId"`
	WorkDir   string `json:"workDir,omitempty"`
}

// CreateSession 让 scholar_agent 创建一个新会话。body 留空即可,
// agent 自动用默认 workDir (~/.claude/projects/scholay-smart-search/)。
// 上层(internal/smartsearch)拿到 sessionId 后做 WS 桥接。
func (c *Client) CreateSession(ctx context.Context) (*CreatedSession, error) {
	if c.baseURL == "" {
		return nil, errors.New("agent: empty base url")
	}
	ctx, cancel := context.WithTimeout(ctx, roundTripTimeout)
	defer cancel()

	var out CreatedSession
	if err := c.doJSON(ctx, http.MethodPost, "/api/sessions", map[string]any{}, &out); err != nil {
		return nil, err
	}
	if out.SessionID == "" {
		return nil, errors.New("agent: empty sessionId in response")
	}
	return &out, nil
}

// DeleteSession 让 agent 物理删除 jsonl + tool-results 目录。
// 404 (session 已不存在) 返回 ErrSessionNotFound,调用方可以容忍并继续往下走。
func (c *Client) DeleteSession(ctx context.Context, sessionID string) error {
	if c.baseURL == "" {
		return errors.New("agent: empty base url")
	}
	if sessionID == "" {
		return errors.New("agent: empty sessionId")
	}
	ctx, cancel := context.WithTimeout(ctx, roundTripTimeout)
	defer cancel()
	if err := c.doJSON(ctx, http.MethodDelete, "/api/sessions/"+sessionID, nil, nil); err != nil {
		if isNotFoundErr(err) {
			return ErrSessionNotFound
		}
		return err
	}
	return nil
}

// PushedFile 是 POST /api/sessions/:id/files 的响应 —— 文件写到 agent 会话 cwd 后的落点。
type PushedFile struct {
	Path string `json:"path"` // agent 容器内的绝对路径 (用于 user_message.attachments[].path)
	Name string `json:"name"`
	Size int64  `json:"size"`
}

// PushSessionFile 把一个文件以 multipart 推到 agent 的会话隔离 cwd
// (POST /api/sessions/:id/files), 返回落盘路径。方案 B: 让 agent 用 Read 原生分析文件。
// content 是文件全量字节; filename 用于落盘命名 (agent 端会再做一次清洗)。
func (c *Client) PushSessionFile(ctx context.Context, sessionID, filename string, content []byte) (*PushedFile, error) {
	if c.baseURL == "" {
		return nil, errors.New("agent: empty base url")
	}
	if sessionID == "" {
		return nil, errors.New("agent: empty sessionId")
	}
	ctx, cancel := context.WithTimeout(ctx, roundTripTimeout)
	defer cancel()

	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	fw, err := mw.CreateFormFile("file", filename)
	if err != nil {
		return nil, fmt.Errorf("multipart create: %w", err)
	}
	if _, err := fw.Write(content); err != nil {
		return nil, fmt.Errorf("multipart write: %w", err)
	}
	if err := mw.Close(); err != nil {
		return nil, fmt.Errorf("multipart close: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		c.baseURL+"/api/sessions/"+sessionID+"/files", &buf)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", mw.FormDataContentType())
	if c.authToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.authToken)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		if resp.StatusCode == http.StatusNotFound {
			return nil, ErrSessionNotFound
		}
		return nil, &HTTPError{StatusCode: resp.StatusCode, Raw: truncate(string(raw), 200)}
	}
	var out PushedFile
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, fmt.Errorf("decode push-file response: %w", err)
	}
	return &out, nil
}

// WorkspaceFile 是 GET /api/sessions/:id/workspace/file 的响应子集 (agent WorkspaceReadFileResult)。
// 图片时 State="ok" / PreviewType="image" / DataURL 带 base64; 其余字段按需。
type WorkspaceFile struct {
	State       string `json:"state"`       // ok | binary | too_large | missing | error
	Path        string `json:"path"`
	PreviewType string `json:"previewType"` // text | image
	DataURL     string `json:"dataUrl"`
	MimeType    string `json:"mimeType"`
	Size        int64  `json:"size"`
	Error       string `json:"error,omitempty"`
}

// GetWorkspaceFile 读会话隔离 cwd 内的一个文件 (relPath 是相对 cwd 的路径, 上传文件即 basename)。
// 图片会带 dataUrl(base64), backend 据此把原图回传给浏览器做缩略图/放大 (历史回放 <img src>)。
// agent 侧 resolveWorkspacePath 会做越界校验 (workspace 外路径直接拒绝); backend 仍须先校验会话归属。
func (c *Client) GetWorkspaceFile(ctx context.Context, sessionID, relPath string) (*WorkspaceFile, error) {
	if c.baseURL == "" {
		return nil, errors.New("agent: empty base url")
	}
	if sessionID == "" {
		return nil, errors.New("agent: empty sessionId")
	}
	if relPath == "" {
		return nil, errors.New("agent: empty path")
	}
	ctx, cancel := context.WithTimeout(ctx, roundTripTimeout)
	defer cancel()
	var out WorkspaceFile
	path := "/api/sessions/" + sessionID + "/workspace/file?path=" + url.QueryEscape(relPath)
	if err := c.doJSON(ctx, http.MethodGet, path, nil, &out); err != nil {
		if isNotFoundErr(err) {
			return nil, ErrSessionNotFound
		}
		return nil, err
	}
	return &out, nil
}

// SessionSummary 是 agent GET /api/sessions 列表中的单行 (轻量, 不带 messages)。
//
// title 是 agent 自管的会话标题 (首条 user_message 触发自动生成, 或 PATCH 重命名)。
// messageCount / modifiedAt 给侧边栏会话列表展示用。
type SessionSummary struct {
	ID           string `json:"id"`
	Title        string `json:"title"`
	CreatedAt    string `json:"createdAt"`
	ModifiedAt   string `json:"modifiedAt"`
	MessageCount int    `json:"messageCount"`
	ProjectPath  string `json:"projectPath,omitempty"`
	WorkDir      string `json:"workDir,omitempty"`
}

// ListSessionsResponse 对应 GET /api/sessions 的响应。
type ListSessionsResponse struct {
	Sessions []SessionSummary `json:"sessions"`
	Total    int              `json:"total"`
	Limit    int              `json:"limit"`
	Offset   int              `json:"offset"`
}

// ListSessions 列出 agent 端的所有 session (按 modifiedAt DESC)。
// agent 不区分 user / feature, 所有 session 一起返; backend 用 agentbridge.Repository
// 的 ListByUserFeature 来过滤"此 user 此 feature 拥有的 session id 集合", 然后跟
// agent 返回结果做交集 — 见 agentbridge.FeatureBridge.ListSessions。
//
// 这里给的 ids 参数会被拼成 ?ids=a,b,c 让 agent 内部只返指定集合, 减少传输量。
// 空 ids 则返全部 (谨慎用, 当 agent 上 session 数大时会很慢)。
func (c *Client) ListSessions(ctx context.Context, ids []string) (*ListSessionsResponse, error) {
	if c.baseURL == "" {
		return nil, errors.New("agent: empty base url")
	}
	ctx, cancel := context.WithTimeout(ctx, roundTripTimeout)
	defer cancel()

	path := "/api/sessions?limit=200"
	if len(ids) > 0 {
		// agent 当前 GET /api/sessions 不直接支持 ids 过滤, 我们就拉全量后在 caller
		// 端按 ids 集合过滤。当 agent 端 session 数大时这里会变慢, 后续 agent 支持
		// 后再加 ?ids=a,b,c。
		_ = ids
	}
	var out ListSessionsResponse
	if err := c.doJSON(ctx, http.MethodGet, path, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// ModelInfo 对应 agent GET /api/models 的单项。
//
// 当前 agent 的 /api/models 返回 4 个 "tier 别名" (Main / Haiku / Sonnet / Opus),
// 每个 tier 是 admin 在 agent_config 里配的具体模型 id (比如 gpt-4.1 / gpt-5)。
// Description 字段是 tier 含义 ("Main model" / "Haiku model" 等), 给前端 UI 直接展示。
type ModelInfo struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Context     string `json:"context,omitempty"`
}

// ModelProviderInfo 是 ListModelsResponse.provider 的形态;
// 当前 admin 选了"激活 provider"时是 { id, name }, 没选时整体是 null。
// 用 RawMessage 透传保持兼容: docs 例子写的是 null, 实际可能是 object,
// 任何后续字段扩展都不需要改 backend 代码。
type ModelProviderInfo struct {
	ID   string `json:"id,omitempty"`
	Name string `json:"name,omitempty"`
}

// ListModelsResponse 对应 GET /api/models。
type ListModelsResponse struct {
	Models   []ModelInfo        `json:"models"`
	Provider *ModelProviderInfo `json:"provider,omitempty"`
}

// ListModels 列出 agent 当前可用的模型 tier 列表。
//
// 前端 claw sidebar 调这个填模型下拉框, 让用户在当前对话中切到某个具体 model。
// 实际切换通过 WS `{type:"set_runtime_config", providerId:null, modelId:"..."}`,
// 不写盘 — 仅本次 WS 连接生效。
//
// 调用频率: claw 页面进入 / sidebar 展开时各拉一次, 前端可以 cache 几分钟。
func (c *Client) ListModels(ctx context.Context) (*ListModelsResponse, error) {
	if c.baseURL == "" {
		return nil, errors.New("agent: empty base url")
	}
	ctx, cancel := context.WithTimeout(ctx, roundTripTimeout)
	defer cancel()
	var out ListModelsResponse
	if err := c.doJSON(ctx, http.MethodGet, "/api/models", nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// PatchSession 改 session 元数据 (目前仅 title)。
// 404 时返 ErrSessionNotFound — 这个 session 在 agent 端不存在 (可能被运维清掉),
// caller 应当清掉 DB 里的孤儿映射。
func (c *Client) PatchSession(ctx context.Context, sessionID, title string) error {
	if c.baseURL == "" {
		return errors.New("agent: empty base url")
	}
	if sessionID == "" {
		return errors.New("agent: empty sessionId")
	}
	ctx, cancel := context.WithTimeout(ctx, roundTripTimeout)
	defer cancel()
	body := map[string]any{"title": title}
	if err := c.doJSON(ctx, http.MethodPatch, "/api/sessions/"+sessionID, body, nil); err != nil {
		if isNotFoundErr(err) {
			return ErrSessionNotFound
		}
		return err
	}
	return nil
}

// SessionMessage 对应 agent MessageEntry 的最小子集 (id/type/content/timestamp/model)。
// content 用 RawMessage 透传 —— 不在 backend 侧解结构,前端直接消费 Anthropic
// content[] 协议 (text/thinking/tool_use/tool_result blocks)。
type SessionMessage struct {
	ID              string          `json:"id"`
	Type            string          `json:"type"`
	Content         json.RawMessage `json:"content"`
	Timestamp       string          `json:"timestamp"`
	Model           string          `json:"model,omitempty"`
	ParentUUID      string          `json:"parentUuid,omitempty"`
	ParentToolUseID string          `json:"parentToolUseId,omitempty"`
	IsSidechain     bool            `json:"isSidechain,omitempty"`
	// Interrupted: agent 端 sessionService 把被隐藏的「[Request interrupted by user]」标记
	// 折叠成这个 flag, 挂在"被打断那一轮"的最后一条消息上。backend 纯透传给前端 ——
	// 漏了这个字段, json.Unmarshal 会静默丢弃, 导致刷新重入后前端 replayHistoryAsTurns
	// 拿不到 interrupted, 渲染不出「已暂停」(claw / smart-search 共用此结构, 一并修复)。
	Interrupted bool `json:"interrupted,omitempty"`
}

// SessionMessagesResponse 对应 agent GET /api/sessions/:id/messages。
// taskNotifications 字段我们不消费,保留 RawMessage 也方便后续扩展。
type SessionMessagesResponse struct {
	Messages          []SessionMessage `json:"messages"`
	TaskNotifications json.RawMessage  `json:"taskNotifications,omitempty"`
}

// GetSessionMessages 取一个 agent session 的全部历史消息。
// 这是 "用户回到智能搜索页时拉历史回放" 的核心接口。
// 注意: messages 里同时包含 user / assistant / tool_use / tool_result 等条目,
// 调用方需自行折叠成 turn (前端的 foldMessagesIntoTurns / replayHistoryAsTurns)。
func (c *Client) GetSessionMessages(ctx context.Context, sessionID string) (*SessionMessagesResponse, error) {
	if c.baseURL == "" {
		return nil, errors.New("agent: empty base url")
	}
	if sessionID == "" {
		return nil, errors.New("agent: empty sessionId")
	}
	ctx, cancel := context.WithTimeout(ctx, roundTripTimeout)
	defer cancel()
	var out SessionMessagesResponse
	if err := c.doJSON(ctx, http.MethodGet, "/api/sessions/"+sessionID+"/messages", nil, &out); err != nil {
		if isNotFoundErr(err) {
			return nil, ErrSessionNotFound
		}
		return nil, err
	}
	return &out, nil
}

// SessionContextEstimate 是 agent transcriptContextEstimate 中我们关心的字段。
// 前端只需要 totalTokens/maxTokens/percentage/model 来渲染水位 chip,
// 完整的 categories/gridRows 留 RawMessage 备用 (用作未来诊断面板)。
type SessionContextEstimate struct {
	TotalTokens int             `json:"totalTokens"`
	MaxTokens   int             `json:"maxTokens"`
	Percentage  int             `json:"percentage"`
	Model       string          `json:"model"`
	Categories  json.RawMessage `json:"categories,omitempty"`
}

// agentInspectionResponse 对应 agent GET /api/sessions/:id/inspection,
// 我们只关心 contextEstimate 这一段。
type agentInspectionResponse struct {
	ContextEstimate *SessionContextEstimate `json:"contextEstimate,omitempty"`
}

// GetSessionContextEstimate 取当前会话的上下文水位 (基于 transcript 中最新一条
// assistant message 的 usage 字段计算)。会话还没产生过 assistant 回复时,
// agent 端会返回 contextEstimate 为空 —— 此时返回 nil, nil,调用方按 "0/1M" 渲染。
func (c *Client) GetSessionContextEstimate(ctx context.Context, sessionID string) (*SessionContextEstimate, error) {
	if c.baseURL == "" {
		return nil, errors.New("agent: empty base url")
	}
	if sessionID == "" {
		return nil, errors.New("agent: empty sessionId")
	}
	ctx, cancel := context.WithTimeout(ctx, roundTripTimeout)
	defer cancel()
	var out agentInspectionResponse
	if err := c.doJSON(ctx, http.MethodGet,
		"/api/sessions/"+sessionID+"/inspection?contextOnly=1", nil, &out); err != nil {
		if isNotFoundErr(err) {
			return nil, ErrSessionNotFound
		}
		return nil, err
	}
	return out.ContextEstimate, nil
}

// EnqueueChatMessage 通过 REST 给 agent session 入队一条用户消息,
// agent 会自己跑模型 + 把流式响应推给 WebSocket 订阅方。
//
// 对于像审稿这种 backend 服务端自驱动的场景(没有 WS 客户端在线),
// 用这个 + GetChatStatus 轮询 + GetSessionMessages 拉最终回复即可。
//
// 返回 202 + messageId/status;调用方一般只关心成功 / 失败。
func (c *Client) EnqueueChatMessage(ctx context.Context, sessionID, content string) error {
	if c.baseURL == "" {
		return errors.New("agent: empty base url")
	}
	if sessionID == "" {
		return errors.New("agent: empty sessionId")
	}
	if content == "" {
		return errors.New("agent: empty content")
	}
	ctx, cancel := context.WithTimeout(ctx, roundTripTimeout)
	defer cancel()
	if err := c.doJSON(ctx, http.MethodPost,
		"/api/sessions/"+sessionID+"/chat",
		map[string]any{"content": content}, nil); err != nil {
		if isNotFoundErr(err) {
			return ErrSessionNotFound
		}
		return err
	}
	return nil
}

// ChatStatus 对应 agent GET /api/sessions/:id/chat/status:
//
//	state ∈ { "idle", "thinking", "working", "error" }
//
// 服务端自驱动的审稿循环把 "等 agent 跑完" 拆成 "POST chat → 轮询 GetChatStatus
// 直到 state=idle → GetSessionMessages 拉最终回复"。
type ChatStatus struct {
	State string `json:"state"`
}

// GetChatStatus 查询当前会话的对话状态(idle / thinking / working / error)。
func (c *Client) GetChatStatus(ctx context.Context, sessionID string) (*ChatStatus, error) {
	if c.baseURL == "" {
		return nil, errors.New("agent: empty base url")
	}
	if sessionID == "" {
		return nil, errors.New("agent: empty sessionId")
	}
	ctx, cancel := context.WithTimeout(ctx, roundTripTimeout)
	defer cancel()
	var out ChatStatus
	if err := c.doJSON(ctx, http.MethodGet,
		"/api/sessions/"+sessionID+"/chat/status", nil, &out); err != nil {
		if isNotFoundErr(err) {
			return nil, ErrSessionNotFound
		}
		return nil, err
	}
	return &out, nil
}

// ErrSessionNotFound 是 agent 端返回 404 时的语义化错误,
// 调用方 (如 GetOrCreateSession) 可以在拿到这个错误时把 DB 里的脏映射清理掉
// 然后重建一个新 session。
var ErrSessionNotFound = errors.New("agent: session not found")

// HTTPError 是 doJSON 把 agent 4xx/5xx 包成的 typed error。
// 调用方用 errors.As(err, &agent.HTTPError{}) 或对 .StatusCode 做判断,
// 比对错误 message 做 strings.Contains 健壮得多 (后端日志格式一变就误判)。
type HTTPError struct {
	StatusCode int    // HTTP 状态码, e.g. 404
	Code       string // agent 端 error code, e.g. "NOT_FOUND" (来自 {"error":"...","message":"..."})
	Message    string // 可读 message
	Raw        string // 截断的 raw body (≤200 字节), 便于调试非 JSON 错误响应
}

// Error 实现 error 接口。格式向后兼容旧的 "agent http <code>: ..." 字符串,
// 但调用方不应再依赖这个格式来判断 (用 As / StatusCode 字段)。
func (e *HTTPError) Error() string {
	if e.Code != "" || e.Message != "" {
		return fmt.Sprintf("agent http %d: %s %s", e.StatusCode, e.Code, e.Message)
	}
	return fmt.Sprintf("agent http %d: %s", e.StatusCode, e.Raw)
}

// isNotFoundErr 判断 err 是不是 agent 返回 404。优先用 typed *HTTPError,
// 兜底走旧字符串匹配 (兼容历史调用栈里没改过的路径)。
func isNotFoundErr(err error) bool {
	if err == nil {
		return false
	}
	var httpErr *HTTPError
	if errors.As(err, &httpErr) {
		return httpErr.StatusCode == http.StatusNotFound
	}
	return strings.Contains(err.Error(), "agent http 404")
}

// BaseURL 返回内部的 baseURL,smartsearch 拼 WS URL 时要用。
func (c *Client) BaseURL() string { return c.baseURL }

// AuthToken 返回内部的 Bearer token,smartsearch dial agent WS 时要带。
func (c *Client) AuthToken() string { return c.authToken }

// Health GET /health,用作连通性探针(不计入熔断窗口)。
func (c *Client) Health(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/health", nil)
	if err != nil {
		return err
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return fmt.Errorf("agent health http %d", resp.StatusCode)
	}
	return nil
}

// PushConfig 把 DB 中的 agent_config 一行推到 agent /api/providers:
// 1) GET 列表找到 name=scholay-managed
// 2) 命中 → PUT;未命中 → POST
// 3) POST /api/providers/:id/activate 切活
// 全程串行,任一步失败即返回,由调用方决定是否重试(目前不重试)。
func (c *Client) PushConfig(ctx context.Context, cfg *agentconfig.AgentConfig) error {
	if cfg == nil {
		return errors.New("agent: nil config")
	}
	if c.baseURL == "" {
		return errors.New("agent: empty base url")
	}

	ctx, cancel := context.WithTimeout(ctx, pushOverallTimeout)
	defer cancel()

	_, err := circuitbreaker.AgentBreaker.Execute(func() (any, error) {
		return nil, c.pushConfigOnce(ctx, cfg)
	})
	if err != nil {
		slog.Error("agent push config failed", "base_url", c.baseURL, "err", err)
		return err
	}
	slog.Info("agent push config succeeded", "base_url", c.baseURL, "name", managedProviderName)
	return nil
}

func (c *Client) pushConfigOnce(ctx context.Context, cfg *agentconfig.AgentConfig) error {
	list, err := c.listProviders(ctx)
	if err != nil {
		return fmt.Errorf("list providers: %w", err)
	}

	models := ModelMapping{
		Main:   cfg.MainModel,
		Haiku:  cfg.HaikuModel,
		Sonnet: cfg.SonnetModel,
		Opus:   cfg.OpusModel,
	}

	var providerID string
	if existing := findByName(list.Providers, managedProviderName); existing != nil {
		providerID = existing.ID
		slog.Info("agent push: updating existing provider", "provider_id", providerID)
		if err := c.updateProvider(ctx, providerID, &UpdateProviderRequest{
			APIKey:       ptr(cfg.APIKey),
			BaseURL:      cfg.BaseURL,
			APIFormat:    "anthropic",
			AuthStrategy: "auth_token",
			Models:       &models,
		}); err != nil {
			return fmt.Errorf("update provider %s: %w", providerID, err)
		}
	} else {
		slog.Info("agent push: creating provider", "name", managedProviderName)
		created, err := c.createProvider(ctx, &CreateProviderRequest{
			PresetID:     "custom",
			Name:         managedProviderName,
			APIKey:       cfg.APIKey,
			BaseURL:      cfg.BaseURL,
			APIFormat:    "anthropic",
			AuthStrategy: "auth_token",
			Models:       models,
		})
		if err != nil {
			return fmt.Errorf("create provider: %w", err)
		}
		providerID = created.ID
	}

	if err := c.activateProvider(ctx, providerID); err != nil {
		return fmt.Errorf("activate provider %s: %w", providerID, err)
	}
	return nil
}

func (c *Client) listProviders(ctx context.Context) (*providersListResponse, error) {
	var out providersListResponse
	if err := c.doJSON(ctx, http.MethodGet, "/api/providers", nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *Client) createProvider(ctx context.Context, body *CreateProviderRequest) (*SavedProvider, error) {
	var out createOrUpdateResponse
	if err := c.doJSON(ctx, http.MethodPost, "/api/providers", body, &out); err != nil {
		return nil, err
	}
	return &out.Provider, nil
}

func (c *Client) updateProvider(ctx context.Context, id string, body *UpdateProviderRequest) error {
	var out createOrUpdateResponse
	return c.doJSON(ctx, http.MethodPut, "/api/providers/"+id, body, &out)
}

func (c *Client) activateProvider(ctx context.Context, id string) error {
	return c.doJSON(ctx, http.MethodPost, "/api/providers/"+id+"/activate", nil, nil)
}

// doJSON 是统一的 JSON 往返,把 agent 的 {error,message} 4xx/5xx 翻成 Go error。
func (c *Client) doJSON(ctx context.Context, method, path string, in, out any) error {
	var body io.Reader
	if in != nil {
		buf, err := json.Marshal(in)
		if err != nil {
			return fmt.Errorf("marshal request: %w", err)
		}
		body = bytes.NewReader(buf)
	}

	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, body)
	if err != nil {
		return err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if c.authToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.authToken)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode >= 400 {
		var er errorResponse
		hErr := &HTTPError{
			StatusCode: resp.StatusCode,
			Raw:        truncate(string(raw), 200),
		}
		if jsonErr := json.Unmarshal(raw, &er); jsonErr == nil {
			hErr.Code = er.Error
			hErr.Message = er.Message
		}
		return hErr
	}

	if out != nil && len(raw) > 0 {
		if err := json.Unmarshal(raw, out); err != nil {
			return fmt.Errorf("decode response: %w", err)
		}
	}
	return nil
}

func findByName(list []SavedProvider, name string) *SavedProvider {
	for i := range list {
		if list[i].Name == name {
			return &list[i]
		}
	}
	return nil
}

func ptr(s string) *string { return &s }

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
