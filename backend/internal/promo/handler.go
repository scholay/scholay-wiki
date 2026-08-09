// ============================================================================
// 限时领取会员推广(Promo)—— HTTP handler。
//   public(免登录):GET /config/promo  用户端弹窗/导航按钮所需配置(关闭时只 enabled=false)
//   admin(AdminAuthMiddleware 之后):GET/PUT /admin/promo/config  后台读写全量配置
// ============================================================================

package promo

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"

	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

// ─── 公开端点 ─────────────────────────────────────────────────────────────

// GetPublic GET /config/promo —— 用户端推广配置(关闭时只 enabled=false,不泄漏二维码/文案)。
func (h *Handler) GetPublic(c *gin.Context) {
	pv, err := h.svc.GetPublic()
	if err != nil {
		utils.ServerError(c, "获取推广配置失败")
		return
	}
	if setPublicCache(c, pv, 60) {
		return
	}
	utils.Success(c, pv)
}

// GetPublicSummary GET /config/promo/summary —— 不含二维码 data URL 的轻量常驻配置。
func (h *Handler) GetPublicSummary(c *gin.Context) {
	pv, err := h.svc.GetPublicSummary()
	if err != nil {
		utils.ServerError(c, "获取推广配置失败")
		return
	}
	if setPublicCache(c, pv, 60) {
		return
	}
	utils.Success(c, pv)
}

// GetPublicQR GET /config/promo/qr —— 只在推广开启且已配置时输出原始图片。
// 这使大型 base64 不再跟随全局配置冷加载，浏览器打开弹窗才发起图片请求。
func (h *Handler) GetPublicQR(c *gin.Context) {
	cfg, err := h.svc.GetConfig()
	if err != nil {
		utils.ServerError(c, "获取推广二维码失败")
		return
	}
	if !cfg.Enabled || cfg.WechatQR == "" {
		c.Header("Cache-Control", "no-store")
		c.Status(http.StatusNotFound)
		return
	}
	mimeType, payload, err := decodeImageDataURL(cfg.WechatQR)
	if err != nil {
		slog.Error("promo: invalid qr data url", "err", err)
		utils.ServerError(c, "推广二维码配置无效")
		return
	}

	// v 是 cache-buster，不是可永久取回的对象存储 key。当前数据库只保留
	// 	一张图，所以不能对版本 URL 打一年 immutable：长驻页持有旧 summary
	// 	后第一次打开会请求旧 v。旧 v 仍返回当前图且 no-store，避免裂图；
	// 	命中当前 v 才允许短缓存 + ETag 重验。
	currentVersion := promoQRVersion(cfg.WechatQR)
	versionMatches := c.Query("v") == currentVersion
	etag := bytesETag(payload)
	if versionMatches {
		c.Header("Cache-Control", "public, max-age=300, must-revalidate")
	} else {
		c.Header("Cache-Control", "no-store")
		c.Header("X-Promo-QR-Version", currentVersion)
	}
	c.Header("ETag", etag)
	c.Header("X-Content-Type-Options", "nosniff")
	if versionMatches && requestHasETag(c.GetHeader("If-None-Match"), etag) {
		c.Status(http.StatusNotModified)
		return
	}
	c.Data(http.StatusOK, mimeType, payload)
}

// ─── admin:配置 ──────────────────────────────────────────────────────────

// GetConfig GET /admin/promo/config —— 后台读全量配置(无敏感字段,无需脱敏)。
func (h *Handler) GetConfig(c *gin.Context) {
	cfg, err := h.svc.GetConfig()
	if err != nil {
		utils.ServerError(c, "获取配置失败")
		return
	}
	utils.Success(c, cfg)
}

// qrMaxBytes 是解码后的图片二进制上限。base64 会膨胀约 4/3，故绑定后
// 只能用较宽的编码输入护栏，最终 300KB 契约由 decodeImageDataURL 严格执行。
const (
	qrMaxBytes        = 300 * 1024
	qrMaxDataURLBytes = 4*((qrMaxBytes+2)/3) + 128
)

// UpdateConfig PUT /admin/promo/config。
func (h *Handler) UpdateConfig(c *gin.Context) {
	var in PromoConfig
	if err := c.ShouldBindJSON(&in); err != nil {
		utils.BadRequest(c, "参数格式错误")
		return
	}
	if len(in.WechatQR) > qrMaxDataURLBytes {
		utils.BadRequest(c, "二维码图片过大(请压缩到 300KB 以内)")
		return
	}
	if in.WechatQR != "" {
		if _, _, err := decodeImageDataURL(in.WechatQR); err != nil {
			utils.BadRequest(c, "二维码仅支持有效的 PNG、JPEG 或 WebP 图片")
			return
		}
	}
	if err := h.svc.UpdateConfig(&in); err != nil {
		slog.Error("promo: update config failed", "err", err)
		utils.ServerError(c, "保存配置失败")
		return
	}
	utils.SuccessWithMessage(c, "已保存", nil)
}

var allowedQRMime = map[string]bool{
	"image/png":  true,
	"image/jpeg": true,
	"image/webp": true,
}

func decodeImageDataURL(raw string) (string, []byte, error) {
	meta, encoded, ok := strings.Cut(raw, ",")
	if !ok || !strings.HasPrefix(meta, "data:") {
		return "", nil, fmt.Errorf("不是 data URL")
	}
	parts := strings.Split(strings.TrimPrefix(meta, "data:"), ";")
	mimeType := strings.ToLower(strings.TrimSpace(parts[0]))
	if !allowedQRMime[mimeType] {
		return "", nil, fmt.Errorf("不支持的图片类型 %q", mimeType)
	}

	isBase64 := false
	for _, part := range parts[1:] {
		if strings.EqualFold(strings.TrimSpace(part), "base64") {
			isBase64 = true
			break
		}
	}
	if !isBase64 {
		return "", nil, fmt.Errorf("图片 data URL 必须使用 base64")
	}
	payload, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return "", nil, fmt.Errorf("无法解码图片: %w", err)
	}
	if len(payload) == 0 || len(payload) > qrMaxBytes {
		return "", nil, fmt.Errorf("解码后的图片为空或过大")
	}
	if !hasImageSignature(mimeType, payload) {
		return "", nil, fmt.Errorf("图片声明类型与文件签名不匹配")
	}
	return mimeType, payload, nil
}

func hasImageSignature(mimeType string, payload []byte) bool {
	switch mimeType {
	case "image/png":
		return bytes.HasPrefix(payload, []byte{0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a})
	case "image/jpeg":
		return len(payload) >= 3 && payload[0] == 0xff && payload[1] == 0xd8 && payload[2] == 0xff
	case "image/webp":
		return len(payload) >= 12 && string(payload[:4]) == "RIFF" && string(payload[8:12]) == "WEBP"
	default:
		return false
	}
}

func bytesETag(payload []byte) string {
	sum := sha256.Sum256(payload)
	return fmt.Sprintf("\"%x\"", sum)
}

func requestHasETag(header, etag string) bool {
	for _, candidate := range strings.Split(header, ",") {
		candidate = strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(candidate), "W/"))
		if candidate == etag || candidate == "*" {
			return true
		}
	}
	return false
}

// setPublicCache 给小型公开配置加短缓存 + 内容 ETag。返回 true 表示已写 304。
func setPublicCache(c *gin.Context, value any, maxAge int) bool {
	raw, err := json.Marshal(value)
	if err != nil {
		return false
	}
	etag := bytesETag(raw)
	c.Header("Cache-Control", fmt.Sprintf("public, max-age=%d, must-revalidate", maxAge))
	c.Header("ETag", etag)
	if requestHasETag(c.GetHeader("If-None-Match"), etag) {
		c.Status(http.StatusNotModified)
		return true
	}
	return false
}
