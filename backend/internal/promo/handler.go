// ============================================================================
// 限时领取会员推广(Promo)—— HTTP handler。
//   public(免登录):GET /config/promo  用户端弹窗/导航按钮所需配置(关闭时只 enabled=false)
//   admin(AdminAuthMiddleware 之后):GET/PUT /admin/promo/config  后台读写全量配置
// ============================================================================

package promo

import (
	"log/slog"

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
	utils.Success(c, pv)
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

// qrMaxBytes 二维码 data URL 上限(小图直存;过大说明传错了)。与 supportcenter 对齐。
const qrMaxBytes = 300 * 1024

// UpdateConfig PUT /admin/promo/config。
func (h *Handler) UpdateConfig(c *gin.Context) {
	var in PromoConfig
	if err := c.ShouldBindJSON(&in); err != nil {
		utils.BadRequest(c, "参数格式错误")
		return
	}
	if len(in.WechatQR) > qrMaxBytes {
		utils.BadRequest(c, "二维码图片过大(请压缩到 300KB 以内)")
		return
	}
	if err := h.svc.UpdateConfig(&in); err != nil {
		slog.Error("promo: update config failed", "err", err)
		utils.ServerError(c, "保存配置失败")
		return
	}
	utils.SuccessWithMessage(c, "已保存", nil)
}
