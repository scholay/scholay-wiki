// ============================================================================
// 功能广场 —— 工具 logo (MinIO)
//
// 导入 zip 里的图片(真 logo + 生成的 SVG)上传到 MinIO,数据里的 logo 改成经
// backend 流式服务的稳定地址 /api/v1/public/tools/logo/<slug> —— 不再外链对方站点
// (杜绝防盗链/CORS/404 图裂)。
// ============================================================================

package featuretool

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"strings"

	"github.com/gin-gonic/gin"

	"scholar-backend/internal/common/utils"
	"scholar-backend/internal/storage"
)

const logoKeyPrefix = "logos/"

func contentTypeForExt(ext string) string {
	switch strings.ToLower(ext) {
	case ".svg":
		return "image/svg+xml"
	case ".png":
		return "image/png"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".webp":
		return "image/webp"
	case ".gif":
		return "image/gif"
	case ".ico":
		return "image/x-icon"
	default:
		return "application/octet-stream"
	}
}

func isImageExt(ext string) bool {
	switch strings.ToLower(ext) {
	case ".svg", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico":
		return true
	}
	return false
}

// logoURLForSlug 返回 logo 对外稳定地址(经 backend 流式服务)。
func logoURLForSlug(slug string) string {
	return "/api/v1/public/tools/logo/" + slug
}

type imageEntry struct {
	data        []byte
	contentType string
}

// uploadLogos 把 slug→图片 上传到 MinIO, 返回 slug→对外 URL。
// storage 不可用 / 上传失败 → 该条降级跳过(logo 留空, 前端用首字母 SVG 兜底)。
func uploadLogos(ctx context.Context, images map[string]imageEntry) map[string]string {
	out := map[string]string{}
	if !storage.IsEnabled() || len(images) == 0 {
		return out
	}
	bucket := storage.FeatureToolsBucket()
	for slug, img := range images {
		if slug == "" {
			continue
		}
		_, err := storage.PutObject(ctx, bucket, logoKeyPrefix+slug,
			bytes.NewReader(img.data), int64(len(img.data)),
			storage.PutOptions{ContentType: img.contentType})
		if err != nil {
			slog.Warn("featuretool: upload logo failed", "slug", slug, "err", err)
			continue
		}
		out[slug] = logoURLForSlug(slug)
	}
	return out
}

// rewriteLogos 把 items 里 slug 命中的 logo 改成上传后的稳定 URL。
func rewriteLogos(items []json.RawMessage, bySlug map[string]string) []json.RawMessage {
	if len(bySlug) == 0 {
		return items
	}
	out := make([]json.RawMessage, 0, len(items))
	for _, raw := range items {
		var m map[string]any
		if err := json.Unmarshal(raw, &m); err != nil {
			out = append(out, raw)
			continue
		}
		slug, _ := m["slug"].(string)
		if url, ok := bySlug[slug]; ok && slug != "" {
			m["logo"] = url
			if b, err := json.Marshal(m); err == nil {
				out = append(out, b)
				continue
			}
		}
		out = append(out, raw)
	}
	return out
}

// PublicLogo GET /api/v1/public/tools/logo/:slug —— 从 MinIO 流式服务工具 logo。
func (h *Handler) PublicLogo(c *gin.Context) {
	slug := c.Param("slug")
	if slug == "" || strings.Contains(slug, "/") || !storage.IsEnabled() {
		utils.NotFound(c, "logo 不存在")
		return
	}
	rc, info, err := storage.GetObject(c.Request.Context(), storage.FeatureToolsBucket(), logoKeyPrefix+slug)
	if err != nil {
		utils.NotFound(c, "logo 不存在")
		return
	}
	defer rc.Close()
	ct := "application/octet-stream"
	if info != nil && info.ContentType != "" {
		ct = info.ContentType
	}
	c.Header("Content-Type", ct)
	c.Header("Cache-Control", "public, max-age=2592000, immutable")
	_, _ = io.Copy(c.Writer, rc)
}
