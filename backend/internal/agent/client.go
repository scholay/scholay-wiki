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
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"net/url"
	"strconv"
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
	// PushSessionFile 专用超时:体量最大的合法推送是 50MB 审稿稿件(MinIO 流 → multipart →
	// agent 落盘),共用 10s roundTripTimeout 在慢盘/高负载下会掐断大文件(2026-07 文件上传调研)。
	pushFileTimeout = 120 * time.Second
)

// Client 封装到 scholar_agent /api/providers 的推送逻辑。
type Client struct {
	baseURL        string
	authToken      string
	httpClient     *http.Client
	httpClientLong *http.Client // 慢端点(export-pptx 等)专用,长超时 + 无响应头超时
	pushClient     *http.Client // PushSessionFile 专用(大文件流式推送,120s)
}

// NewClient baseURL 形如 http://scholar_agent:3456;authToken 为空时不带 Authorization。
func NewClient(baseURL, authToken string) *Client {
	return &Client{
		baseURL:        strings.TrimRight(baseURL, "/"),
		authToken:      authToken,
		httpClient:     GetHTTPClient(roundTripTimeout),
		httpClientLong: GetLongHTTPClient(6 * time.Minute),
		pushClient:     GetHTTPClient(pushFileTimeout),
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
	// ReasoningReplay 方言(0067):openai 工具轮回传 reasoning(Kimi 系)。
	ReasoningReplay bool `json:"reasoningReplay"`
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
	// ReasoningReplay 方言(0067):openai 工具轮回传 reasoning(Kimi 系)。
	ReasoningReplay bool `json:"reasoningReplay"`
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
	ReasoningReplay *bool `json:"reasoningReplay,omitempty"`
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

// CreateSessionOptions 是 CreateSession 的可选 per-session 配置(nil = 旧行为, 发空 body)。
type CreateSessionOptions struct {
	WorkDir string `json:"workDir,omitempty"`
	// per-feature 工具策略: 该会话独有的 --disallowed-tools(如审稿评分会话关 Skill/Agent)。
	// agent 侧落进 session-meta、resume 重读;缺省(nil)走 agent 全局 DEFAULT_DISALLOWED_TOOLS。
	DisallowedTools []string `json:"disallowedTools,omitempty"`
	// AllowedMcpTools: 该会话对 mcp__minicod__* 的**正向白名单**(去前缀的原始工具名,如 search_papers)。
	// minicod MCP 0.4.1 暴露 76 个工具,不收敛会灌满每轮 tools[] 并全自动批准(见 minicod 对齐审计 #2)。
	// executor featurePolicy 据此在「工具可见性」+「执行二道墙」两处过滤:非空 → 仅白名单内 MCP 可用;
	// 缺省(nil)→ 不限制(向后兼容)。built-in 工具走 DisallowedTools,不受此字段影响。
	AllowedMcpTools []string `json:"allowedMcpTools,omitempty"`
	// per-feature skill 作用域: 该会话额外的 --add-dir 源(agent 加载 <dir>/.claude/skills)。
	// 让不同入口装不同 skill —— peerreview 方法论会话传审稿人 skill 目录, claw 不传 → 看不到审稿人 skill。
	AddDirs []string `json:"addDirs,omitempty"`
	// AppendSystemPrompt: 该会话的**系统级**附加提示词(规则 + per-user 长期记忆)。
	// agent 侧落进 session-meta、每次冷启 (首条消息 / prewarm / resume) 都以 --append-system-prompt
	// 注入到模型 system prompt —— 不写进用户消息、不进 transcript, 用户永远看不到。
	// 取代旧的「注入到首条 user_message 前缀」(in-band) 方案;旧会话仍走 in-band 兜底。
	AppendSystemPrompt string `json:"appendSystemPrompt,omitempty"`
	// Skills: 要物化进本会话的**按需**用户 skill(skill 市场)。executor 收到后把每份写到
	// <sid>.skills/guides/<Name>/SKILL.md(cwd 之外、只读)并 push 进 addDirs → loader 的 guides
	// 菜单识别、模型按名 Skill() 加载。内容是**不可信用户内容**,只走 guides 按需层,绝不进常驻 system。
	Skills []SessionSkill `json:"skills,omitempty"`
	// TemplateKind: 会话建好后往可写 cwd 铺一份镜像预装脚手架(目前仅 "bolt-slides":制作PPT feature)。
	// executor 把 /opt/<template> 的源码 cp 进 cwd、node_modules 软链到只读预装依赖,供 BuildDeck 构建。
	// 缺省(空)= 不铺脚手架(其它 feature 行为不变)。
	TemplateKind string `json:"templateKind,omitempty"`
	// HonestyGuard: 诚实性核验 per-feature 旗标(W2 P0-C, 冻结契约 #5)。true → executor 在该会话
	// 终轮跑宣称核验(DOI/交付/通读),不过则注入纠偏轮。默认 false(peerreview 的有界 JSON 报告 /
	// prism 的项目文件交付路径会被误伤,须显式 opt-in);当前仅 claw spec 置 true。
	// 全链路: spec.SessionOptions → CreateSession body / hub seed_history 帧 → executor session meta。
	HonestyGuard bool `json:"honestyGuard,omitempty"`
	// HonestyChecks: 核验维度按位开关(prism 预备件)。HonestyGuard=true 时生效, 缺省全开;
	// 键: citations / delivery / fullread。prism 评估期可只开 citations(delivery 判据按 ./out/
	// 会误伤其项目文件交付路径)。形态与 executor TurnInput.honestyChecks 对齐。
	HonestyChecks map[string]bool `json:"honestyChecks,omitempty"`
}

// SessionSkill 一份要物化进会话的用户市场 skill。Name 已命名空间化(u<authorId>-<slug>,匹配
// executor SKILL_NAME_RE);SkillMD 是后端规范化后的正文(剥离危险 frontmatter、截断)。
type SessionSkill struct {
	Name    string `json:"name"`
	SkillMD string `json:"skillMd"`
}

// CreateSession 让 scholar_agent 创建一个新会话。opts==nil 时发空 body(旧行为),
// agent 自动用默认 workDir (~/.claude/projects/scholay-smart-search/)。
// 上层(internal/smartsearch)拿到 sessionId 后做 WS 桥接。
func (c *Client) CreateSession(ctx context.Context, opts *CreateSessionOptions) (*CreatedSession, error) {
	if c.baseURL == "" {
		return nil, errors.New("agent: empty base url")
	}
	ctx, cancel := context.WithTimeout(ctx, roundTripTimeout)
	defer cancel()

	body := map[string]any{}
	if opts != nil {
		if opts.WorkDir != "" {
			body["workDir"] = opts.WorkDir
		}
		if len(opts.DisallowedTools) > 0 {
			body["disallowedTools"] = opts.DisallowedTools
		}
		if len(opts.AllowedMcpTools) > 0 {
			body["allowedMcpTools"] = opts.AllowedMcpTools
		}
		if len(opts.AddDirs) > 0 {
			body["addDirs"] = opts.AddDirs
		}
		if opts.AppendSystemPrompt != "" {
			body["appendSystemPrompt"] = opts.AppendSystemPrompt
		}
		if len(opts.Skills) > 0 {
			body["skills"] = opts.Skills
		}
		if opts.TemplateKind != "" {
			body["templateKind"] = opts.TemplateKind
		}
		if opts.HonestyGuard {
			body["honestyGuard"] = true
		}
		if len(opts.HonestyChecks) > 0 {
			body["honestyChecks"] = opts.HonestyChecks
		}
	}
	var out CreatedSession
	if err := c.doJSON(ctx, http.MethodPost, "/api/sessions", body, &out); err != nil {
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

// PushSessionFile 把一个文件以 multipart **流式**推到 agent 的会话隔离 cwd
// (POST /api/sessions/:id/files), 返回落盘路径。方案 B: 让 agent 用 Read 原生分析文件。
// content 是文件内容的 reader(调用方传 MinIO 对象 reader 或 bytes.NewReader);filename 用于落盘命名。
// 用 io.Pipe 把 multipart 边封装边发,不再先在 bytes.Buffer 里整份缓冲一遍(50MB 稿件可省一份完整拷贝)。
func (c *Client) PushSessionFile(ctx context.Context, sessionID, filename string, content io.Reader) (*PushedFile, error) {
	if c.baseURL == "" {
		return nil, errors.New("agent: empty base url")
	}
	if sessionID == "" {
		return nil, errors.New("agent: empty sessionId")
	}
	// 大文件推送专用超时(50MB 稿件 10s 会被掐断);client 级 Timeout 也须同口径(pushClient)。
	ctx, cancel := context.WithTimeout(ctx, pushFileTimeout)
	defer cancel()

	pr, pw := io.Pipe()
	mw := multipart.NewWriter(pw)
	// 边写边发:goroutine 把 content 拷进 multipart part,经 pipe 流给 HTTP body。
	go func() {
		var werr error
		defer func() { _ = pw.CloseWithError(werr) }() // 把写端错误传给读端(HTTP 发送方)
		fw, err := mw.CreateFormFile("file", filename)
		if err != nil {
			werr = fmt.Errorf("multipart create: %w", err)
			return
		}
		if _, err := io.Copy(fw, content); err != nil {
			werr = fmt.Errorf("multipart write: %w", err)
			return
		}
		if err := mw.Close(); err != nil {
			werr = fmt.Errorf("multipart close: %w", err)
		}
	}()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		c.baseURL+"/api/sessions/"+sessionID+"/files", pr)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", mw.FormDataContentType())
	if c.authToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.authToken)
	}

	resp, err := c.pushClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		if resp.StatusCode == http.StatusNotFound {
			return nil, ErrSessionNotFound
		}
		if resp.StatusCode == http.StatusRequestEntityTooLarge {
			// agent 端会话配额帽(quota_exceeded):稳定错误,调用方译成用户文案,不当基础设施故障。
			return nil, ErrSessionQuotaExceeded
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
	State       string `json:"state"` // ok | binary | too_large | missing | error
	Path        string `json:"path"`
	PreviewType string `json:"previewType"` // text | image
	Content     string `json:"content"`     // text 正文(state=ok + previewType=text 时);Prism 固化回读用
	Truncated   bool   `json:"truncated"`   // 是否被 1MB 截断(?full=1 可绕过)
	DataURL     string `json:"dataUrl"`
	BytesBase64 string `json:"bytesBase64"` // raw 模式(?raw=1):原始字节 base64(任意类型,含二进制)
	MimeType    string `json:"mimeType"`
	Size        int64  `json:"size"`
	Error       string `json:"error,omitempty"`
}

// WorkspaceRawFile —— ReadWorkspaceFileRaw 的解码结果。State="ok" 时 Bytes 为完整原始字节。
type WorkspaceRawFile struct {
	Path     string
	MimeType string
	Size     int64
	State    string // ok | too_large | missing | error
	Bytes    []byte
}

// ReadWorkspaceFileRaw 以**二进制安全**方式读取 cwd 内一个文件的原始字节(?raw=1)。
// 与 GetWorkspaceFile/ReadWorkspaceFileFull 不同:任意类型(含 xlsx/pdf/docx 等二进制)都回
// base64,这里解码成 []byte。用于「成果交付」收割(后端把 ./out 字节落 MinIO)。
// State != "ok"(too_large / missing / error)时 Bytes 为空。
func (c *Client) ReadWorkspaceFileRaw(ctx context.Context, sessionID, relPath string) (*WorkspaceRawFile, error) {
	if c.baseURL == "" {
		return nil, errors.New("agent: empty base url")
	}
	if sessionID == "" || relPath == "" {
		return nil, errors.New("agent: empty sessionId or path")
	}
	ctx, cancel := context.WithTimeout(ctx, roundTripTimeout)
	defer cancel()
	var out WorkspaceFile
	path := "/api/sessions/" + sessionID + "/workspace/file?path=" + url.QueryEscape(relPath) + "&raw=1"
	if err := c.doJSON(ctx, http.MethodGet, path, nil, &out); err != nil {
		if isNotFoundErr(err) {
			return nil, ErrSessionNotFound
		}
		return nil, err
	}
	res := &WorkspaceRawFile{Path: out.Path, MimeType: out.MimeType, Size: out.Size, State: out.State}
	if out.State == "ok" && out.BytesBase64 != "" {
		b, err := base64.StdEncoding.DecodeString(out.BytesBase64)
		if err != nil {
			return nil, fmt.Errorf("agent: decode raw bytes (path=%s): %w", relPath, err)
		}
		res.Bytes = b
	}
	return res, nil
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

// ReadWorkspaceFileFull 同 GetWorkspaceFile,但带 ?full=1 绕过 agent 端 1MB 预览截断 —— Prism
// 轮末固化必须读全量正文,被截断写进 DB = 静默损坏。返回 out.Content 为完整 UTF-8 文本。
func (c *Client) ReadWorkspaceFileFull(ctx context.Context, sessionID, relPath string) (*WorkspaceFile, error) {
	if c.baseURL == "" {
		return nil, errors.New("agent: empty base url")
	}
	if sessionID == "" || relPath == "" {
		return nil, errors.New("agent: empty sessionId or path")
	}
	ctx, cancel := context.WithTimeout(ctx, roundTripTimeout)
	defer cancel()
	var out WorkspaceFile
	path := "/api/sessions/" + sessionID + "/workspace/file?path=" + url.QueryEscape(relPath) + "&full=1"
	if err := c.doJSON(ctx, http.MethodGet, path, nil, &out); err != nil {
		if isNotFoundErr(err) {
			return nil, ErrSessionNotFound
		}
		return nil, err
	}
	return &out, nil
}

// WorkspaceTreeEntry 是 agent workspace/tree 返回的一个目录项。
// Size/MTimeMs 来自 agent 轻量 stat(不读字节),供「成果收割」做变更检测(没变就跳过重读)。
type WorkspaceTreeEntry struct {
	Name        string `json:"name"`
	Path        string `json:"path"`
	IsDirectory bool   `json:"isDirectory"`
	Size        int64  `json:"size"`
	MTimeMs     int64  `json:"mtimeMs"`
}

// WorkspaceTree 是 GET /api/sessions/:id/workspace/tree 的响应 (agent WorkspaceTreeResult)。
// State: ok | missing | error。missing = 目录不存在 (例: 还没产出任何交付物时的 out/),
// 调用方应把它当作"空目录"处理而非错误。
type WorkspaceTree struct {
	State   string               `json:"state"`
	Path    string               `json:"path"`
	Entries []WorkspaceTreeEntry `json:"entries"`
	Error   string               `json:"error,omitempty"`
}

// ListWorkspaceFiles 列出会话隔离 cwd 内某个相对目录的内容 (relDir 为空 = cwd 根)。
// 用于"成果交付": 后端列约定的 ./out 子目录, 把 agent 产出的成品作为可下载产物呈现给用户。
// agent 侧 resolveWorkspacePath 做越界校验; 目录不存在时返回 State="missing" + 空 entries。
func (c *Client) ListWorkspaceFiles(ctx context.Context, sessionID, relDir string) (*WorkspaceTree, error) {
	if c.baseURL == "" {
		return nil, errors.New("agent: empty base url")
	}
	if sessionID == "" {
		return nil, errors.New("agent: empty sessionId")
	}
	ctx, cancel := context.WithTimeout(ctx, roundTripTimeout)
	defer cancel()
	var out WorkspaceTree
	path := "/api/sessions/" + sessionID + "/workspace/tree"
	if relDir != "" {
		path += "?path=" + url.QueryEscape(relDir)
	}
	if err := c.doJSON(ctx, http.MethodGet, path, nil, &out); err != nil {
		if isNotFoundErr(err) {
			return nil, ErrSessionNotFound
		}
		return nil, err
	}
	return &out, nil
}

// PutWorkspaceFile 把内容按相对路径**原样覆盖写**进会话隔离 cwd(保子目录、不加 UUID、原子)。
// 供 Prism 铺源(DB current → cwd)/ 用户手改写回 / 撤销同步。agent 侧 resolveWorkspacePath 越界校验。
func (c *Client) PutWorkspaceFile(ctx context.Context, sessionID, relPath string, content []byte) error {
	if c.baseURL == "" {
		return errors.New("agent: empty base url")
	}
	if sessionID == "" || relPath == "" {
		return errors.New("agent: empty sessionId or path")
	}
	ctx, cancel := context.WithTimeout(ctx, roundTripTimeout)
	defer cancel()
	u := c.baseURL + "/api/sessions/" + sessionID + "/workspace/file?path=" + url.QueryEscape(relPath)
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, u, bytes.NewReader(content))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "text/plain; charset=utf-8")
	if c.authToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.authToken)
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
	if resp.StatusCode >= 400 {
		if resp.StatusCode == 404 {
			return ErrSessionNotFound
		}
		if resp.StatusCode == http.StatusRequestEntityTooLarge {
			return ErrSessionQuotaExceeded
		}
		return &HTTPError{StatusCode: resp.StatusCode, Raw: truncate(string(raw), 200)}
	}
	return nil
}

// DeleteWorkspaceFile 删会话 cwd 内一个文件(幂等,不存在不报错)。Prism 铺源时清理 DB 已删的文件。
func (c *Client) DeleteWorkspaceFile(ctx context.Context, sessionID, relPath string) error {
	if c.baseURL == "" {
		return errors.New("agent: empty base url")
	}
	if sessionID == "" || relPath == "" {
		return errors.New("agent: empty sessionId or path")
	}
	ctx, cancel := context.WithTimeout(ctx, roundTripTimeout)
	defer cancel()
	path := "/api/sessions/" + sessionID + "/workspace/file?path=" + url.QueryEscape(relPath)
	if err := c.doJSON(ctx, http.MethodDelete, path, nil, nil); err != nil {
		if isNotFoundErr(err) {
			return ErrSessionNotFound
		}
		return err
	}
	return nil
}

// ExportDeckPptxResult 是 POST /api/sessions/:id/export-pptx 的响应。
type ExportDeckPptxResult struct {
	OK     bool   `json:"ok"`
	Slides int    `json:"slides"`
	Path   string `json:"path"` // 相对会话 cwd,如 out/deck.pptx
}

// ExportDeckPptx 让 executor 把已构建的单文件 HTML deck(htmlPath,相对会话 cwd)导出成
// format="pptx"(逐张截图图片版)或 "pdf"(逐张 print-to-pdf 矢量版)落 ./out/<name>.<fmt>。
// 多张 chromium 渲染较慢,用较长超时(与 roundTripTimeout 无关)。
func (c *Client) ExportDeckPptx(ctx context.Context, sessionID, htmlPath, name, format string) (*ExportDeckPptxResult, error) {
	if c.baseURL == "" {
		return nil, errors.New("agent: empty base url")
	}
	if sessionID == "" || htmlPath == "" {
		return nil, errors.New("agent: empty sessionId or htmlPath")
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()
	body := map[string]any{"htmlPath": htmlPath}
	if name != "" {
		body["name"] = name
	}
	if format != "" {
		body["format"] = format
	}
	var out ExportDeckPptxResult
	// 慢端点:走 httpClientLong(无响应头超时,client.Timeout=6min);executor 同步逐张截图秒到分钟级。
	if err := c.doJSONWith(c.httpClientLong, ctx, http.MethodPost, "/api/sessions/"+sessionID+"/export-pptx", body, &out); err != nil {
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

// ListSessions 列出 agent 端的 session (按 modifiedAt DESC)。
// agent 不区分 user / feature; backend 用 agentbridge.Repository 的 ListByUserFeature
// 拿到"此 user 此 feature 拥有的 session id 集合", 通过 ids 参数让 agent 服务端过滤
// (?ids=a,b,c) —— agent 在 stat/读 jsonl 之前先收窄, 成本从 O(全平台会话) 降到
// O(用户会话), 也不再受全局 limit=200 窗口影响 (用户旧会话不会静默丢元数据)。
//
// 兼容性: 旧版 agent 忽略未知的 ids 参数退化为全量列表, caller 端的按 ids 交集过滤
// (agentbridge.FeatureBridge.ListSessions 的 map 匹配) 仍然兜底, 行为不回退。
// 空 ids 则返全部 (谨慎用, 当 agent 上 session 数大时会很慢)。
func (c *Client) ListSessions(ctx context.Context, ids []string) (*ListSessionsResponse, error) {
	if c.baseURL == "" {
		return nil, errors.New("agent: empty base url")
	}
	// 无 ids:单次全量请求(旧行为)。
	if len(ids) == 0 {
		return c.listSessionsOnce(ctx, nil)
	}
	// 有 ids:按 maxIDsPerListReq 分批 —— 一次塞太多 id 进 ?ids= 会撑爆 Bun 16KB 请求头上限
	// (~417 id 即返 431,自设 500 上限根本到不了)。分批请求后在 caller 端合并。
	const maxIDsPerListReq = 300
	if len(ids) <= maxIDsPerListReq {
		return c.listSessionsOnce(ctx, ids)
	}
	merged := &ListSessionsResponse{}
	for start := 0; start < len(ids); start += maxIDsPerListReq {
		end := start + maxIDsPerListReq
		if end > len(ids) {
			end = len(ids)
		}
		resp, err := c.listSessionsOnce(ctx, ids[start:end])
		if err != nil {
			return nil, err
		}
		merged.Sessions = append(merged.Sessions, resp.Sessions...)
	}
	merged.Total = len(merged.Sessions)
	return merged, nil
}

// listSessionsOnce 发一次 GET /api/sessions(可带 ids 过滤)。ids 由 caller 保证不超分批上限。
func (c *Client) listSessionsOnce(ctx context.Context, ids []string) (*ListSessionsResponse, error) {
	ctx, cancel := context.WithTimeout(ctx, roundTripTimeout)
	defer cancel()

	path := "/api/sessions?limit=200"
	if len(ids) > 0 {
		// limit 取 max(200, len(ids)): 新 agent 按 ids 过滤后 limit≥集合大小返回全部;
		// 旧 agent 忽略 ids 时仍保持与历史一致的 200 窗口, 不因 len(ids) 小而变差。
		limit := 200
		if len(ids) > limit {
			limit = len(ids)
		}
		path = "/api/sessions?limit=" + strconv.Itoa(limit) + "&ids=" + url.QueryEscape(strings.Join(ids, ","))
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

// MathRenderResult 对应 agent POST /render/math 的响应(MathJax → SVG → PNG)。
type MathRenderResult struct {
	PNG    string `json:"png"`    // base64(无 data: 前缀)
	Width  int    `json:"width"`  // 显示 px(1x)
	Height int    `json:"height"` // 显示 px(1x)
	Depth  int    `json:"depth"`  // 基线下沉 px(行内公式 vertical-align:-depth 贴基线;块级忽略)
}

// RenderMath 让 agent 把一段 TeX 渲染成 PNG —— 小程序 rich-text 跑不了 KaTeX,后端代理到这。
// display=true 走块级公式,false 走行内。TeX 解析失败时 agent 返 422 → 这里回 *HTTPError,
// 调用方可据此回退到"原样展示 LaTeX 文本"。
func (c *Client) RenderMath(ctx context.Context, tex string, display bool) (*MathRenderResult, error) {
	if c.baseURL == "" {
		return nil, errors.New("agent: empty base url")
	}
	if strings.TrimSpace(tex) == "" {
		return nil, errors.New("agent: empty tex")
	}
	ctx, cancel := context.WithTimeout(ctx, roundTripTimeout)
	defer cancel()
	var out MathRenderResult
	if err := c.doJSON(ctx, http.MethodPost, "/render/math",
		map[string]any{"tex": tex, "display": display}, &out); err != nil {
		return nil, err
	}
	if out.PNG == "" {
		return nil, errors.New("agent: empty png in render response")
	}
	return &out, nil
}

// MermaidRenderResult 对应 agent POST /render/mermaid 的响应(headless Chromium → PNG)。
type MermaidRenderResult struct {
	PNG    string `json:"png"`    // base64(无 data: 前缀),2x 高清位图
	Width  int    `json:"width"`  // 逻辑 px(1x)
	Height int    `json:"height"` // 逻辑 px(1x)
}

// RenderMermaid 让 agent 把一段 mermaid 源码渲染成 PNG —— 小程序无 DOM 跑不了 mermaid。
// 源码解析失败时 agent 返 422 → 回 *HTTPError,调用方据此回退成「源码卡」。
// 渲染较重(两次 headless Chromium),caller 必须配缓存;超时给足 45s。
func (c *Client) RenderMermaid(ctx context.Context, code string) (*MermaidRenderResult, error) {
	if c.baseURL == "" {
		return nil, errors.New("agent: empty base url")
	}
	if strings.TrimSpace(code) == "" {
		return nil, errors.New("agent: empty mermaid code")
	}
	ctx, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()
	var out MermaidRenderResult
	if err := c.doJSON(ctx, http.MethodPost, "/render/mermaid",
		map[string]any{"code": code}, &out); err != nil {
		return nil, err
	}
	if out.PNG == "" {
		return nil, errors.New("agent: empty png in mermaid render response")
	}
	return &out, nil
}

// DocHeadResult 对应 agent POST /api/sessions/:id/extract-head 的响应(有界文档头文本)。
type DocHeadResult struct {
	Text      string `json:"text"`
	Truncated bool   `json:"truncated"` // 是否因超 maxChars 被截断(仅供调用方判断,不影响正确性)
}

// ExtractDocHead 让 agent 从会话 cwd 里的稿件抽取「开头一小段」纯文本,输出对所有格式硬性有界
// (PDF 只抽前 pdfPages 页;其它 pandoc 抽后硬截 maxChars)。用于审稿「预识别」—— 把有界头文本
// 内联进 prompt,agent 那轮不再自己 ReadDocument 读全文,token 由构造钳死。
// pdfPages:>0 = 前 N 页(预识别);0 = 全部页(审稿全文,仍受 maxChars 上界)。maxChars<=0 → agent 用默认 8000。
// relPath 是稿件在会话 cwd 的路径
// (PushSessionFile 返回的绝对路径即可,agent 侧再 confinePath 限制)。
// 抽取失败(扫描件无文本层 / 转换失败 / 不支持的扩展名)时 agent 返 422 → 回 *HTTPError,调用方据此降级。
// pandoc 抽大 docx 可能较慢,超时给 60s(与转换器内部 kill 对齐)。
func (c *Client) ExtractDocHead(ctx context.Context, sessionID, relPath string, pdfPages, maxChars int) (*DocHeadResult, error) {
	if c.baseURL == "" {
		return nil, errors.New("agent: empty base url")
	}
	if sessionID == "" {
		return nil, errors.New("agent: empty sessionId")
	}
	if strings.TrimSpace(relPath) == "" {
		return nil, errors.New("agent: empty doc path")
	}
	ctx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	// pdfPages 恒发送:>0 = 前 N 页(预识别);0 = 全部页(审稿全文,仍受 maxChars 上界)。
	// 必须显式发 0 —— agent 侧「字段缺省」会退回默认 3 页,而审稿需要全文。maxChars<=0 才让 agent 用默认。
	body := map[string]any{"path": relPath, "pdfPages": pdfPages}
	if maxChars > 0 {
		body["maxChars"] = maxChars
	}
	var out DocHeadResult
	if err := c.doJSON(ctx, http.MethodPost, "/api/sessions/"+sessionID+"/extract-head", body, &out); err != nil {
		return nil, err
	}
	if strings.TrimSpace(out.Text) == "" {
		return nil, errors.New("agent: empty text in extract-head response")
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
	// TotalTurns: 仅当请求带 limitTurns 且 agent 支持服务端切片时返回 —— 全量用户轮数,
	// 让 backend 的分页元数据 (TotalTurns/HasMore) 不因服务端切片而失真。
	// nil = 旧版 agent (忽略 limitTurns 返回全量), caller 用本地 sliceRecentTurns 兜底。
	TotalTurns *int `json:"totalTurns,omitempty"`
}

// GetSessionMessages 取一个 agent session 的全部历史消息。
// 这是 "用户回到智能搜索页时拉历史回放" 的核心接口。
// 注意: messages 里同时包含 user / assistant / tool_use / tool_result 等条目,
// 调用方需自行折叠成 turn (前端的 foldMessagesIntoTurns / replayHistoryAsTurns)。
// limitTurns>0 时请求带 ?limitTurns=N: 新版 agent 服务端只返最近 N 个用户轮 + totalTurns
// 元数据, 长会话不再全量传输+解析; 旧版 agent 忽略该参数返回全量, caller 的本地
// sliceRecentTurns 兜底, 行为不回退。limitTurns<=0 = 全量 (与历史行为一致)。
func (c *Client) GetSessionMessages(ctx context.Context, sessionID string, limitTurns int) (*SessionMessagesResponse, error) {
	if c.baseURL == "" {
		return nil, errors.New("agent: empty base url")
	}
	if sessionID == "" {
		return nil, errors.New("agent: empty sessionId")
	}
	ctx, cancel := context.WithTimeout(ctx, roundTripTimeout)
	defer cancel()
	path := "/api/sessions/" + sessionID + "/messages"
	if limitTurns > 0 {
		path += "?limitTurns=" + strconv.Itoa(limitTurns)
	}
	var out SessionMessagesResponse
	if err := c.doJSON(ctx, http.MethodGet, path, nil, &out); err != nil {
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

// 注:执行器 GET /api/sessions/:id/inspection 现返回**扁平** {totalTokens,maxTokens,percentage,model}
// (旧版曾包在 {contextEstimate:{...}} 里)。此处直接反序列化进 SessionContextEstimate;历史上因
// 契约漂移(执行器改扁平、后端仍解嵌套)导致水位一直解析成 nil、chip 从不显示(2026-07-15 修)。

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
	var out SessionContextEstimate
	if err := c.doJSON(ctx, http.MethodGet,
		"/api/sessions/"+sessionID+"/inspection", nil, &out); err != nil {
		if isNotFoundErr(err) {
			return nil, ErrSessionNotFound
		}
		return nil, err
	}
	// 执行器无 lastUsage(全新 / 重启后)时 totalTokens=0 → 视为"还没有用量",返回 nil
	// 让前端按"无水位"处理(chip 不显示);有用量时才回估算。
	if out.TotalTokens == 0 {
		return nil, nil
	}
	return &out, nil
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

// ErrSessionQuotaExceeded — agent 端会话 cwd 配额帽命中(413/quota_exceeded):
// 单文件超 64MB、会话累计磁盘超 1GB 或文件数超 2000(EXECUTOR_* env 可调)。
// 调用方应译成用户可读文案(如「会话文件配额已满」),不当基础设施故障脱敏。
var ErrSessionQuotaExceeded = errors.New("agent: session file quota exceeded")

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

	_, err := circuitbreaker.AgentConfigPushBreaker.Execute(func() (any, error) {
		return nil, c.pushConfigOnce(ctx, cfg)
	})
	if err != nil {
		slog.Error("agent push config failed", "base_url", c.baseURL, "err", err)
		return err
	}
	slog.Info("agent push config succeeded", "base_url", c.baseURL, "name", managedProviderName)
	return nil
}

// PushExtraProvider(双协议 F0)把一条**额外** provider upsert 到 agent(键=name,如 "scholay-p2"),
// **绝不 activate** —— activate 语义保留给默认 provider(scholay-managed);额外 provider 的模型
// 走 per-turn set_runtime_config{providerId} 指定。Models 槽位传空(resolveTier 只查活跃 provider,
// 额外 provider 恒经 modelOverride 路径,不吃槽位)。
func (c *Client) PushExtraProvider(ctx context.Context, name, baseURL, apiKey, apiFormat string, reasoningReplay bool) error {
	if c.baseURL == "" {
		return errors.New("agent: empty base url")
	}
	if apiFormat == "" {
		apiFormat = "anthropic"
	}
	ctx, cancel := context.WithTimeout(ctx, pushOverallTimeout)
	defer cancel()
	_, err := circuitbreaker.AgentConfigPushBreaker.Execute(func() (any, error) {
		list, lerr := c.listProviders(ctx)
		if lerr != nil {
			return nil, fmt.Errorf("list providers: %w", lerr)
		}
		if existing := findByName(list.Providers, name); existing != nil {
			return nil, c.updateProvider(ctx, existing.ID, &UpdateProviderRequest{
				APIKey:          ptr(apiKey),
				BaseURL:         baseURL,
				APIFormat:       apiFormat,
				AuthStrategy:    "auth_token",
				Models:          &ModelMapping{},
				ReasoningReplay: &reasoningReplay,
			})
		}
		_, cerr := c.createProvider(ctx, &CreateProviderRequest{
			PresetID:        "custom",
			Name:            name,
			APIKey:          apiKey,
			BaseURL:         baseURL,
			APIFormat:       apiFormat,
			AuthStrategy:    "auth_token",
			Models:          ModelMapping{},
			ReasoningReplay: reasoningReplay,
		})
		return nil, cerr
	})
	return err
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

// maxAgentResponseBytes 是 agent 响应体的安全上限。防御:超大会话(几十~上百 MB transcript)
// 即便 agent 侧已做 tail 截断, 这里再兜一道——避免任何上游返回的巨型响应被 io.ReadAll 全量读进
// 内存 + json.Unmarshal 建对象树, 把 backend 容器(1G limit)OOM。超过即返回错误(优雅失败, 不崩)。
// 48MB 远大于正常/已截断响应, 只在异常巨型响应时触发。
const maxAgentResponseBytes = 48 * 1024 * 1024

// doJSON 是统一的 JSON 往返,把 agent 的 {error,message} 4xx/5xx 翻成 Go error。
func (c *Client) doJSON(ctx context.Context, method, path string, in, out any) error {
	return c.doJSONWith(c.httpClient, ctx, method, path, in, out)
}

// doJSONWith 与 doJSON 同,但用指定的 http.Client(慢端点走 httpClientLong)。
func (c *Client) doJSONWith(client *http.Client, ctx context.Context, method, path string, in, out any) error {
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

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	// 限读 maxAgentResponseBytes+1: 读到上限+1 说明响应超限 → 优雅报错而不是把 backend 撑爆。
	raw, err := io.ReadAll(io.LimitReader(resp.Body, maxAgentResponseBytes+1))
	if err != nil {
		return fmt.Errorf("read response: %w", err)
	}
	if int64(len(raw)) > maxAgentResponseBytes {
		return fmt.Errorf("agent response too large (> %d bytes) for %s; session may be too large to load", maxAgentResponseBytes, path)
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
