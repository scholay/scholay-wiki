// ============================================================================
// agentattach — agent 会话「附件」通用实现:文件上传(方案 B: 推原始文件给 agent)
//
// 泛化动机 (2026-07-14 三 feature 输入框统一): 上传 / 引用文献原先是 claw 专属实现
// (internal/claw/upload.go + references.go), 但它只依赖 agentbridge.FeatureBridge
// (get-or-create 会话 + AgentClient 推文件) 与 library.Reader, 本质 feature 无关。
// 抽到本包后 claw / smart_search / prism 共用同一份校验、限额、落盘、物化逻辑,
// 各 feature handler 只剩薄委托 (路由 + 响应包装), 行为与 DTO 形状对 claw 100% 不变。
//
// 不在 backend 做任何文本抽取 / OCR / base64 inline。流程:
//
//   1. multipart 收文件 → 校验类型 + 大小
//   2. 解析目标会话: 请求带 session_id → 校验归属; 为空 → 走 feature 各自的
//      空会话策略 (claw: 新建会话 = "添加文件即开会话"; smart_search: 复用唯一会话;
//      prism: 不走这条路, 由 handler 按 project 解析后调 UploadToSession)
//   3. PushSessionFile 把原始字节 POST 给 agent /api/sessions/:id/files,
//      agent 写进 ~/sessions/<sessionId>/ 并回落盘绝对路径
//   4. 返回 { sessionId, path, type, name, mimeType, size } 给前端;
//      前端把它放进下一条 user_message.attachments[].path, agent 用 Read 原生读
//
// 为什么不抽文本:
//   - PDF / 图片 / 文本类 Claude Code 的 Read 工具都能原生消费 (图片走 vision,
//     PDF 走文档理解), 让大模型自己看比 backend 抽文本信息损失小、能力强。
//   - backend 不碰文件内容 → 无 pdfparse 依赖、无 80K 截断、无 base64 撑爆 context。
//
// 限制 (仍然要前端预校验, 改这里同步各 feature 的 Composer):
//   - 图片 ≤ 5MB  (Anthropic vision 单图硬上限, 超了 agent 调模型时会 400)
//   - 文件 ≤ 30MB (扫描版大 PDF 留余量; 真正瓶颈是模型 context, 由 agent 侧把控)
// ============================================================================

package agentattach

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/google/uuid"

	"scholar-backend/internal/agentbridge"
)

const (
	MaxFileBytes    = 30 * 1024 * 1024
	MaxImageBytes   = 5 * 1024 * 1024
	pushFileTimeout = 30 * time.Second
)

// AttachmentDTO — 返给前端的统一附件结构 (方案 B)。
// 前端只需把 path 放进 user_message.attachments[].path; sessionId 用于"添加文件即开会话"
// 场景下前端 adopt 这个新会话 (历史会话上传时 sessionId 不变)。
// ⚠️ 字段名是前端契约 (sessionId/type/name/mimeType/size/path), 三 feature 共用, 不可改。
type AttachmentDTO struct {
	SessionID string `json:"sessionId"`
	Type      string `json:"type"` // "image" | "file"
	Name      string `json:"name"`
	MimeType  string `json:"mimeType"`
	Size      int64  `json:"size"`
	Path      string `json:"path"` // agent 容器内绝对路径 (会话隔离 cwd 下)
}

// SessionResolver — 请求未带 session_id 时的会话解析策略, feature 语义差异所在:
//   - claw:         FeatureBridge.CreateNewSession ("添加文件 = 开始新会话", 前端 adopt)
//   - smart_search: FeatureBridge.GetOrCreateSession (单会话语义, 复用当前会话)
//
// 签名与 FeatureBridge 的两个方法一致, 装配时直接传方法值即可。
type SessionResolver func(ctx context.Context, userID uint) (string, error)

// Uploader 持有 FeatureBridge, 以便解析会话并通过底层 agent.Client 推送文件。
type Uploader struct {
	feature      *agentbridge.FeatureBridge
	resolveEmpty SessionResolver
	// subdir 落盘子目录(单段,字母数字-_;空 = 会话 cwd 根)。prism 传 "uploads":
	// 其 cwd 是 LaTeX 文档工作区,附件混进根目录会污染编译面(评审遗留,2026-07-14 补)。
	// executor pushSessionFile 白名单解析文件名里的一层子目录,其余照旧 basename 防穿越。
	subdir string
}

// NewUploader — resolveEmpty 为 nil 时默认 CreateNewSession (即 claw 原语义, 保持行为不变)。
func NewUploader(feature *agentbridge.FeatureBridge, resolveEmpty SessionResolver) *Uploader {
	u := &Uploader{feature: feature, resolveEmpty: resolveEmpty}
	if u.resolveEmpty == nil && feature != nil {
		u.resolveEmpty = feature.CreateNewSession
	}
	return u
}

// WithSubdir 设置落盘子目录(链式;非法段被忽略并回落根目录)。
func (u *Uploader) WithSubdir(dir string) *Uploader {
	if subdirRe.MatchString(dir) {
		u.subdir = dir
	}
	return u
}

var subdirRe = regexp.MustCompile(`^[A-Za-z0-9_-]{1,32}$`)

// HandleUpload 是 gin handler 的"业务体", 不负责 HTTP 状态码 (留给各 feature Handler 包装)。
// 返回 error 由调用方转 4xx; 返回 nil + DTO 由调用方包成 200。
//
// 目标会话: 多会话 feature (claw) 里文件必须落到用户当前正在看的那个会话 cwd, 而不是
// "最近活跃"。前端把 activeSessionId 透传过来:
//   - session_id 非空 → 校验归属 (防越权写别人会话), push 到它;
//   - session_id 为空 → 走 resolveEmpty 策略 (新建 / 复用), 返回 sessionId 让前端 adopt。
//
// 校验先行: 类型 / 大小不合格时**不建会话** (与 claw 原实现顺序一致)。
func (u *Uploader) HandleUpload(c *gin.Context, userID uint) (*AttachmentDTO, error) {
	fh, attType, outMime, body, err := parseAndValidateUpload(c)
	if err != nil {
		return nil, err
	}
	sessionID := strings.TrimSpace(c.PostForm("session_id"))
	if sessionID != "" {
		owns, oerr := u.feature.OwnsSession(userID, sessionID)
		if oerr != nil {
			return nil, fmt.Errorf("会话校验失败: %w", oerr)
		}
		if !owns {
			return nil, errors.New("无权访问该会话")
		}
	} else {
		sessionID, err = u.resolveEmpty(c.Request.Context(), userID)
		if err != nil {
			return nil, fmt.Errorf("会话不可用: %w", err)
		}
	}
	return u.pushToSession(c.Request.Context(), sessionID, fh, attType, outMime, body)
}

// UploadToSession — 会话由调用方解析/鉴权好的直通入口 (prism: per-project 会话,
// handler 先按 projectID 校验归属 + ensureProjectSession 拿 sessionID 再调这里)。
// 只做 multipart 校验 + 推送, 不看 session_id 表单字段。
func (u *Uploader) UploadToSession(c *gin.Context, sessionID string) (*AttachmentDTO, error) {
	fh, attType, outMime, body, err := parseAndValidateUpload(c)
	if err != nil {
		return nil, err
	}
	return u.pushToSession(c.Request.Context(), sessionID, fh, attType, outMime, body)
}

// parseAndValidateUpload — multipart 解析 + 类型白名单 + 大小限额 (纯校验, 不碰会话)。
func parseAndValidateUpload(c *gin.Context) (fh *multipart.FileHeader, attType, outMime string, body []byte, err error) {
	if perr := c.Request.ParseMultipartForm(MaxFileBytes); perr != nil {
		return nil, "", "", nil, fmt.Errorf("文件过大或格式错误 (≤ %d MB)", MaxFileBytes/1024/1024)
	}
	fh, err = c.FormFile("file")
	if err != nil {
		return nil, "", "", nil, errors.New("缺少 file 字段")
	}
	if fh.Size > MaxFileBytes {
		return nil, "", "", nil, fmt.Errorf("文件大小 %.1fMB 超出上限 %dMB", float64(fh.Size)/1024/1024, MaxFileBytes/1024/1024)
	}

	mime := strings.ToLower(fh.Header.Get("Content-Type"))
	ext := strings.ToLower(filepath.Ext(fh.Filename))

	// SVG 安全限制: SVG 可含 <script>, 历史回放代理若按 image/svg+xml 内联会变同源 XSS。
	// 入口直接拒 —— 不论它被嗅探成图片还是当成 XML 文本分类 (proxy 侧白名单是最终兜底)。
	if ext == ".svg" || mime == "image/svg+xml" {
		return nil, "", "", nil, errors.New("暂不支持 SVG 文件 (安全限制)")
	}

	switch {
	case isImage(mime, ext):
		if fh.Size > MaxImageBytes {
			return nil, "", "", nil, fmt.Errorf("图片 %.1fMB 超出上限 %dMB", float64(fh.Size)/1024/1024, MaxImageBytes/1024/1024)
		}
		attType = "image"
		outMime = normalizeImageMime(mime, ext)
	case isPDF(mime, ext):
		attType = "file"
		outMime = "application/pdf"
	case isPlainText(mime, ext):
		attType = "file"
		outMime = mimeOrFallback(mime, "text/plain")
	case isOffice(mime, ext):
		// office 二进制 (docx/xlsx/pptx/odt 等): agent 容器装了 pandoc/python+openpyxl,
		// 用 Bash 转成可读文本 (大模型原生分析)。backend 不抽文本, 只放行推送。
		attType = "file"
		outMime = mimeOrFallback(mime, "application/octet-stream")
	default:
		return nil, "", "", nil, fmt.Errorf("暂不支持的文件类型 (%s / %s); 可上传图片、PDF、Office 文档 (docx/xlsx/pptx)、Markdown / 纯文本", ext, mime)
	}

	body, err = readMultipart(fh)
	if err != nil {
		return nil, "", "", nil, fmt.Errorf("读取文件失败: %w", err)
	}
	return fh, attType, outMime, body, nil
}

// pushToSession — 把校验完的字节推给 agent 会话 cwd, 组装 DTO。
func (u *Uploader) pushToSession(parent context.Context, sessionID string, fh *multipart.FileHeader, attType, outMime string, body []byte) (*AttachmentDTO, error) {
	ctx, cancel := context.WithTimeout(parent, pushFileTimeout)
	defer cancel()
	// body 已在内存(gin multipart 读出),包成 reader 流给 agent —— 至少省掉 client 端的 multipart 整份缓冲。
	// 落盘名 = <uuid>-<原名>:①前端历史回放剥离器(agent-history STORED_UUID_PREFIX)只认带
	// UUID 前缀的 @"path" 为附件标记;②防同名文件互相覆盖。展示名(DTO.Name)仍用原名。
	storedName := uuid.NewString() + "-" + filepath.Base(fh.Filename)
	if u.subdir != "" {
		// 子目录经文件名携带(executor 白名单解析一层安全段),免动 multipart 协议。
		storedName = u.subdir + "/" + storedName
	}
	pushed, err := u.feature.AgentClient().PushSessionFile(ctx, sessionID, storedName, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("文件推送失败: %w", err)
	}

	return &AttachmentDTO{
		SessionID: sessionID,
		Type:      attType,
		Name:      fh.Filename,
		MimeType:  outMime,
		Size:      fh.Size,
		Path:      pushed.Path,
	}, nil
}

// ─── 类型嗅探 helpers ────────────────────────────────────────────────────

func isImage(mime, ext string) bool {
	if strings.HasPrefix(mime, "image/") {
		return true
	}
	switch ext {
	case ".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp":
		return true
	}
	return false
}

func normalizeImageMime(mime, ext string) string {
	if strings.HasPrefix(mime, "image/") {
		return mime
	}
	switch ext {
	case ".png":
		return "image/png"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".webp":
		return "image/webp"
	case ".gif":
		return "image/gif"
	case ".bmp":
		return "image/bmp"
	}
	return "image/png"
}

func isPDF(mime, ext string) bool {
	return ext == ".pdf" || strings.Contains(mime, "pdf")
}

// isPlainText — 用户可能上传的"纯文本系": markdown / json / csv / 各种源码 / 配置等。
// 用 mime 前缀 + 扩展名白名单双保险。
func isPlainText(mime, ext string) bool {
	if strings.HasPrefix(mime, "text/") {
		return true
	}
	switch mime {
	case "application/json", "application/xml", "application/yaml", "application/x-yaml":
		return true
	}
	switch ext {
	case ".md", ".markdown", ".txt", ".log", ".json", ".jsonl", ".xml", ".yaml", ".yml",
		".csv", ".tsv", ".sql", ".sh", ".py", ".js", ".ts", ".tsx", ".jsx", ".go", ".rs",
		".c", ".cpp", ".h", ".hpp", ".java", ".rb", ".php", ".tex", ".bib":
		return true
	}
	return false
}

// isOffice — 二进制 office 文档系 (docx/xlsx/pptx 及 legacy doc/xls/ppt、OpenDocument、rtf)。
// 上传时浏览器/客户端常给 application/octet-stream, 所以主要靠扩展名白名单。
// agent 端用 Bash + pandoc/python(openpyxl) 转成文本, 大模型再分析。
func isOffice(mime, ext string) bool {
	switch ext {
	case ".docx", ".doc", ".xlsx", ".xls", ".pptx", ".ppt",
		".odt", ".ods", ".odp", ".rtf":
		return true
	}
	switch mime {
	case "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		"application/vnd.openxmlformats-officedocument.presentationml.presentation",
		"application/msword",
		"application/vnd.ms-excel",
		"application/vnd.ms-powerpoint",
		"application/vnd.oasis.opendocument.text",
		"application/vnd.oasis.opendocument.spreadsheet",
		"application/rtf":
		return true
	}
	return false
}

func mimeOrFallback(mime, fallback string) string {
	if mime != "" {
		return mime
	}
	return fallback
}

func readMultipart(fh *multipart.FileHeader) ([]byte, error) {
	f, err := fh.Open()
	if err != nil {
		return nil, err
	}
	defer f.Close()
	return io.ReadAll(f)
}
