// ============================================================================
// Scholay 智能助手 (Claw) — 会话文件回取 (历史回放图片缩略图/放大)
//
// 背景: 方案 B 下上传文件只落到 agent 会话隔离 cwd, transcript 里图片只剩 @"path" 文本
// (没有 base64)。刷新后历史回放要显示图片缩略图 + 点击放大, 就得按 path 把原图取回来。
//
// 链路: 浏览器 <img src="/claw/session/file?session_id=..&path=.."> (走 scholay_token
//   cookie 鉴权, img 标签不能带 Bearer header) → 本 handler 校验会话归属 → agent
//   GET /workspace/file 拿 dataUrl(base64) → 解码成原始字节回写, 带 Content-Type。
//
// 安全三连:
//   ① UserAuthMiddleware 已鉴权 (cookie / header 均可, 见 middleware.extractToken)
//   ② OwnsSession 校验该会话属于当前用户 (防越权读别人会话的图)
//   ③ 只取 basename + agent 侧 resolveWorkspacePath 再校验, 双重防 ../ 穿越
// ============================================================================

package claw

import (
	"context"
	"encoding/base64"
	"errors"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"scholar-backend/internal/agent"
	"scholar-backend/internal/common/utils"
)

const fileFetchTimeout = 15 * time.Second

// maxProxyImageBytes — 回取图片字节上限 (上传图片上限 5MB, 这里留余量防异常大文件 OOM)。
const maxProxyImageBytes = 12 * 1024 * 1024

// allowedRasterMIME 是允许内联回写给 <img> 的【光栅图】白名单。
// 故意排除 image/svg+xml —— SVG 可含 <script>, 同源内联(本接口在用户门户 origin 下)会变成
// 存储型 XSS, 可读 localStorage.auth_token / scholay_token cookie。非白名单类型一律 404。
var allowedRasterMIME = map[string]bool{
	"image/png":  true,
	"image/jpeg": true,
	"image/webp": true,
	"image/gif":  true,
	"image/bmp":  true,
}

// GetSessionFile — GET /claw/session/file?session_id=<id>&path=<rel>
//
// 仅服务【图片】: agent 返回 previewType=image + dataUrl(base64), 这里解码成原始字节回写,
// 让 <img src> 直接加载。非图片 / 不存在 → 404。
func (h *Handler) GetSessionFile(c *gin.Context) {
	userID := c.GetUint("user_id")
	sessionID := strings.TrimSpace(c.Query("session_id"))
	rawPath := strings.TrimSpace(c.Query("path"))
	if sessionID == "" || rawPath == "" {
		utils.BadRequest(c, "missing session_id or path")
		return
	}
	// 只接受 basename —— 上传文件落在会话 cwd 根目录, 防止传绝对路径 / ../ 穿越。
	relPath := filepath.Base(rawPath)
	if relPath == "." || relPath == "/" || relPath == "" {
		utils.BadRequest(c, "invalid path")
		return
	}

	owns, err := h.feature.OwnsSession(userID, sessionID)
	if err != nil {
		utils.InternalError(c, codeAgentUnreachable, "会话校验失败,请稍后重试", err)
		return
	}
	if !owns {
		utils.Error(c, 4404, "会话不存在或不属于你")
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), fileFetchTimeout)
	defer cancel()
	wf, err := h.feature.AgentClient().GetWorkspaceFile(ctx, sessionID, relPath)
	if err != nil {
		// agent 4xx (会话/文件不存在、路径越界被拒、隔离未开) 是客户端原因 → 回 4xx,
		// 不当成 502 + slog.Error 噪音 (这些恰恰说明上游校验生效了)。
		var hErr *agent.HTTPError
		if errors.Is(err, agent.ErrSessionNotFound) ||
			(errors.As(err, &hErr) && hErr.StatusCode >= 400 && hErr.StatusCode < 500) {
			utils.Error(c, 4404, "文件不存在或不属于你")
			return
		}
		utils.InternalError(c, codeAgentUnreachable, "文件读取失败,请稍后重试", err)
		return
	}
	if wf.State != "ok" || wf.PreviewType != "image" || wf.DataURL == "" {
		utils.Error(c, 4404, "文件不存在或不是图片")
		return
	}
	if wf.Size > maxProxyImageBytes {
		utils.Error(c, 4404, "图片过大")
		return
	}

	mimeType, payload, derr := decodeDataURL(wf.DataURL)
	if derr != nil {
		utils.InternalError(c, codeAgentUnreachable, "图片解析失败", derr)
		return
	}
	if mimeType == "" {
		mimeType = wf.MimeType
	}
	// 只回写光栅图 —— 拒绝 image/svg+xml 等可被浏览器当文档执行脚本的类型 (同源 XSS 防护)。
	if !allowedRasterMIME[strings.ToLower(strings.TrimSpace(mimeType))] {
		utils.Error(c, 4404, "不支持的图片类型")
		return
	}
	// nosniff: 即便 nginx /api/ 处没继承全局 nosniff, 这里也强制, 防 MIME 嗅探。
	c.Header("X-Content-Type-Options", "nosniff")
	// 原图按 path 不可变 (UUID 命名), 私有缓存 1h; nginx /api 不缓存, 仅浏览器各自缓存。
	c.Header("Cache-Control", "private, max-age=3600")
	c.Data(http.StatusOK, mimeType, payload)
}

// decodeDataURL 解析 "data:<mime>;base64,<...>" → (mime, bytes)。
// 只处理 base64 data URL (agent 图片预览即此形态)。
func decodeDataURL(dataURL string) (string, []byte, error) {
	const marker = ";base64,"
	idx := strings.Index(dataURL, marker)
	if !strings.HasPrefix(dataURL, "data:") || idx < 0 {
		return "", nil, errors.New("not a base64 data url")
	}
	mimeType := strings.TrimPrefix(dataURL[:idx], "data:")
	payload, err := base64.StdEncoding.DecodeString(dataURL[idx+len(marker):])
	if err != nil {
		return "", nil, err
	}
	return mimeType, payload, nil
}
