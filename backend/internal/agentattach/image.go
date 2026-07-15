// 会话图片回取(历史回放缩略图/放大)—— 三 feature(claw/smart_search/prism)共用。
//
// 背景:方案 B 下上传文件只落 agent 会话隔离 cwd,transcript 里图片只剩 @"path" 文本。
// 刷新后历史回放要显示缩略图 + 点击放大,就得按 path 把原图取回来。
// 链路:浏览器 <img src="/<feature>/.../file?...&path=.."> (走 scholay_token cookie 鉴权,
//   img 标签发不了 Bearer)→ feature handler 校验会话归属 → 本函数 → agent GET /workspace/file
//   拿 dataUrl(base64) → 解码成原始字节回写 + Content-Type。
//
// claw 有自己的等价实现(internal/claw/file.go,且其 helper 被 artifact.go 复用故不动它);
// 本文件是从中泛化出来给 smart_search/prism 用的自包含版本。
package agentattach

import (
	"context"
	"encoding/base64"
	"errors"
	"net/http"
	"path"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"scholar-backend/internal/agent"
	"scholar-backend/internal/agentbridge"
	"scholar-backend/internal/common/errcode"
	"scholar-backend/internal/common/utils"
)

const imageFetchTimeout = 15 * time.Second

// maxProxyImageBytes — 回取图片字节上限(上传图片上限 5MB,留余量防异常大文件 OOM)。
const maxProxyImageBytes = 12 * 1024 * 1024

// allowedRasterMIME — 允许内联回写给 <img> 的【光栅图】白名单。故意排除 image/svg+xml
// (SVG 可含 <script>,同源内联 = 存储型 XSS,可读 auth_token / cookie)。非白名单一律 404。
var allowedRasterMIME = map[string]bool{
	"image/png":  true,
	"image/jpeg": true,
	"image/webp": true,
	"image/gif":  true,
	"image/bmp":  true,
}

// ServeSessionImage 把会话 cwd 里的一张图片按 rawPath 取回并内联回写给 <img>。
// **调用方负责会话归属校验**(claw/smart_search 对 query session_id 做 OwnsSession;
// prism 由已校验归属的项目解析出 sessionID)。本函数只做:basename 防穿越 → agent
// GetWorkspaceFile → 图片 + 光栅 MIME 校验 → nosniff + 私有缓存 → 回字节。非图片/不存在 → 404。
func ServeSessionImage(c *gin.Context, feature *agentbridge.FeatureBridge, sessionID, rawPath string) {
	// 相对会话 cwd 的路径:容一层及以上子目录(prism 附件落 uploads/,claw/smart_search 落根)。
	// path.Clean 归一后拒绝绝对路径与 .. 逃逸;agent 侧 resolveWorkspacePath 再 confine 一层(双防)。
	relPath := path.Clean(strings.TrimSpace(rawPath))
	if relPath == "" || relPath == "." || strings.HasPrefix(relPath, "/") || strings.HasPrefix(relPath, "..") {
		utils.BadRequest(c, "invalid path")
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), imageFetchTimeout)
	defer cancel()
	wf, err := feature.AgentClient().GetWorkspaceFile(ctx, sessionID, relPath)
	if err != nil {
		// agent 4xx(会话/文件不存在、路径越界被拒)是客户端原因 → 4xx,不当 502 噪音。
		var hErr *agent.HTTPError
		if errors.Is(err, agent.ErrSessionNotFound) ||
			(errors.As(err, &hErr) && hErr.StatusCode >= 400 && hErr.StatusCode < 500) {
			utils.Error(c, 4404, "文件不存在或不属于你")
			return
		}
		utils.InternalError(c, errcode.AgentUnreachable, "文件读取失败,请稍后重试", err)
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
	mimeType, payload, derr := decodeImageDataURL(wf.DataURL)
	if derr != nil {
		utils.InternalError(c, errcode.AgentUnreachable, "图片解析失败", derr)
		return
	}
	if mimeType == "" {
		mimeType = wf.MimeType
	}
	if !allowedRasterMIME[strings.ToLower(strings.TrimSpace(mimeType))] {
		utils.Error(c, 4404, "不支持的图片类型")
		return
	}
	c.Header("X-Content-Type-Options", "nosniff") // 防 MIME 嗅探
	c.Header("Cache-Control", "private, max-age=3600") // 原图按 path 不可变(UUID 命名)
	c.Data(http.StatusOK, mimeType, payload)
}

// decodeImageDataURL 解析 "data:<mime>;base64,<...>" → (mime, bytes)。
func decodeImageDataURL(dataURL string) (string, []byte, error) {
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
