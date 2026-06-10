// ============================================================================
// Scholay 智能助手 — 文件上传 (方案 B: 推送原始文件给 agent, 由大模型原生分析)
//
// 不在 backend 做任何文本抽取 / OCR / base64 inline。流程:
//
//   1. multipart 收文件 → 校验类型 + 大小
//   2. GetOrCreateSession 拿到当前用户在 claw 的 agent 会话 (没有则创建 →
//      "添加文件 = 开始会话", 这是方案 B 的必然: 文件要落到会话隔离 cwd)
//   3. PushSessionFile 把原始字节 POST 给 agent /api/sessions/:id/files,
//      agent 写进 ~/sessions/<sessionId>/ 并回落盘绝对路径
//   4. 返回 { sessionId, path, type, name, mimeType, size } 给前端;
//      前端把它放进下一条 user_message.attachments[].path, agent 用 Read 原生读
//
// 为什么不再抽文本:
//   - PDF / 图片 / 文本类 Claude Code 的 Read 工具都能原生消费 (图片走 vision,
//     PDF 走文档理解), 让大模型自己看比 backend 抽文本信息损失小、能力强。
//   - backend 不碰文件内容 → 无 pdfparse 依赖、无 80K 截断、无 base64 撑爆 context。
//
// 限制 (仍然要前端预校验, 改这里同步 ChatComposer):
//   - 图片 ≤ 5MB  (Anthropic vision 单图硬上限, 超了 agent 调模型时会 400)
//   - 文件 ≤ 30MB (扫描版大 PDF 留余量; 真正瓶颈是模型 context, 由 agent 侧把控)
// ============================================================================

package claw

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

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
type AttachmentDTO struct {
	SessionID string `json:"sessionId"`
	Type      string `json:"type"` // "image" | "file"
	Name      string `json:"name"`
	MimeType  string `json:"mimeType"`
	Size      int64  `json:"size"`
	Path      string `json:"path"` // agent 容器内绝对路径 (会话隔离 cwd 下)
}

// Uploader 持有 FeatureBridge, 以便 get-or-create 会话并通过底层 agent.Client 推送文件。
type Uploader struct {
	feature *agentbridge.FeatureBridge
}

func NewUploader(feature *agentbridge.FeatureBridge) *Uploader {
	return &Uploader{feature: feature}
}

// HandleUpload 是 gin handler 的"业务体", 不负责 HTTP 状态码 (留给 Handler 包装)。
// 返回 error 由调用方转 4xx; 返回 nil + DTO 由调用方包成 200。
func (u *Uploader) HandleUpload(c *gin.Context, userID uint) (*AttachmentDTO, error) {
	if err := c.Request.ParseMultipartForm(MaxFileBytes); err != nil {
		return nil, fmt.Errorf("文件过大或格式错误 (≤ %d MB)", MaxFileBytes/1024/1024)
	}
	fh, err := c.FormFile("file")
	if err != nil {
		return nil, errors.New("缺少 file 字段")
	}
	if fh.Size > MaxFileBytes {
		return nil, fmt.Errorf("文件大小 %.1fMB 超出上限 %dMB", float64(fh.Size)/1024/1024, MaxFileBytes/1024/1024)
	}

	mime := strings.ToLower(fh.Header.Get("Content-Type"))
	ext := strings.ToLower(filepath.Ext(fh.Filename))

	// SVG 安全限制: SVG 可含 <script>, 历史回放代理若按 image/svg+xml 内联会变同源 XSS。
	// 入口直接拒 —— 不论它被嗅探成图片还是当成 XML 文本分类 (proxy 侧白名单是最终兜底)。
	if ext == ".svg" || mime == "image/svg+xml" {
		return nil, errors.New("暂不支持 SVG 文件 (安全限制)")
	}

	var attType, outMime string
	switch {
	case isImage(mime, ext):
		if fh.Size > MaxImageBytes {
			return nil, fmt.Errorf("图片 %.1fMB 超出上限 %dMB", float64(fh.Size)/1024/1024, MaxImageBytes/1024/1024)
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
		return nil, fmt.Errorf("暂不支持的文件类型 (%s / %s); 可上传图片、PDF、Office 文档 (docx/xlsx/pptx)、Markdown / 纯文本", ext, mime)
	}

	body, err := readMultipart(fh)
	if err != nil {
		return nil, fmt.Errorf("读取文件失败: %w", err)
	}

	// 目标会话: claw 是多会话, 文件必须落到用户当前正在看的那个会话 cwd, 而不是
	// "最近活跃"。前端把 activeSessionId 透传过来:
	//   - session_id 非空 → 校验归属 (防越权写别人会话), push 到它;
	//   - session_id 为空 (新对话首次添加文件) → 新建会话 ("添加文件 = 开始会话"),
	//     返回新 sessionId 让前端 adopt。
	sessionID := strings.TrimSpace(c.PostForm("session_id"))
	if sessionID != "" {
		owns, err := u.feature.OwnsSession(userID, sessionID)
		if err != nil {
			return nil, fmt.Errorf("会话校验失败: %w", err)
		}
		if !owns {
			return nil, errors.New("无权访问该会话")
		}
	} else {
		sessionID, err = u.feature.CreateNewSession(c.Request.Context(), userID)
		if err != nil {
			return nil, fmt.Errorf("会话不可用: %w", err)
		}
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), pushFileTimeout)
	defer cancel()
	// body 已在内存(gin multipart 读出),包成 reader 流给 agent —— 至少省掉 client 端的 multipart 整份缓冲。
	pushed, err := u.feature.AgentClient().PushSessionFile(ctx, sessionID, fh.Filename, bytes.NewReader(body))
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
