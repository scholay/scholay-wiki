// ============================================================================
// vip HTTP handler —— 用户端(会员状态 / 兑换码)+ 管理端(生成 / 列表)。
// ============================================================================

package vip

import (
	"errors"
	"strconv"
	"time"

	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

// ─── 用户端 ──────────────────────────────────────────────────────────────

// GetMembership GET /user/membership —— 当前等级 + 到期 + 各受限功能今日用量。
func (h *Handler) GetMembership(c *gin.Context) {
	uid, ok := utils.GetUserID(c)
	if !ok {
		return
	}
	st, err := h.svc.GetStatus(c.Request.Context(), uid)
	if err != nil {
		utils.InternalError(c, 500, "获取会员信息失败", err)
		return
	}
	utils.Success(c, st)
}

// RedeemCode POST /user/redeem-code {code} —— 兑换。
func (h *Handler) RedeemCode(c *gin.Context) {
	uid, ok := utils.GetUserID(c)
	if !ok {
		return
	}
	var req struct {
		Code string `json:"code"`
	}
	if !utils.BindJSON(c, &req) {
		return
	}
	res, err := h.svc.Redeem(c.Request.Context(), uid, req.Code)
	if err != nil {
		switch {
		case errors.Is(err, ErrCodeNotFound):
			utils.BadRequest(c, "兑换码无效")
		case errors.Is(err, ErrCodeRedeemed):
			utils.BadRequest(c, "该兑换码已被使用")
		case errors.Is(err, ErrCodeExpired):
			utils.BadRequest(c, "该兑换码已过期")
		default:
			utils.InternalError(c, 500, "兑换失败,请稍后重试", err)
		}
		return
	}
	utils.SuccessWithMessage(c, "兑换成功", res)
}

// ─── 管理端 ──────────────────────────────────────────────────────────────

// GenerateCodes POST /admin/vip-codes {count, tier, grant_days, valid_until?, note?} —— 批量生成。
func (h *Handler) GenerateCodes(c *gin.Context) {
	adminID, _ := utils.GetUserID(c)
	var req struct {
		Count      int     `json:"count"`
		Tier       string  `json:"tier"`
		GrantDays  int     `json:"grant_days"`
		ValidUntil *string `json:"valid_until"` // YYYY-MM-DD;空=永久
		Note       string  `json:"note"`
	}
	if !utils.BindJSON(c, &req) {
		return
	}
	var validUntil *time.Time
	if req.ValidUntil != nil && *req.ValidUntil != "" {
		// ParseInLocation + Local(容器=北京), 取当天 23:59:59 为截止。不做 UTC 转换。
		t, err := time.ParseInLocation("2006-01-02", *req.ValidUntil, time.Local)
		if err != nil {
			// 格式错时**不能**静默忽略 —— 否则会生成一批"永久有效"的码(本想限期)。
			utils.BadRequest(c, "码有效期格式应为 YYYY-MM-DD")
			return
		}
		tt := t.Add(24*time.Hour - time.Second)
		validUntil = &tt
	}
	var createdBy *uint
	if adminID != 0 {
		u := adminID
		createdBy = &u
	}
	codes, err := h.svc.GenerateCodes(req.Count, req.Tier, req.GrantDays, validUntil, req.Note, createdBy)
	if err != nil {
		utils.InternalError(c, 500, "生成兑换码失败", err)
		return
	}
	utils.SuccessWithMessage(c, "已生成", gin.H{"codes": codes, "count": len(codes)})
}

// AdminUserVIPStatus GET /admin/users/:id/vip —— 某用户的等级/到期 + 今日各功能额度(给用户详情抽屉)。
func (h *Handler) AdminUserVIPStatus(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		utils.BadRequest(c, "无效的用户 id")
		return
	}
	st, err := h.svc.GetStatus(c.Request.Context(), uint(id))
	if err != nil {
		utils.InternalError(c, 500, "获取会员状态失败", err)
		return
	}
	utils.Success(c, st)
}

// AdminGrantVIP POST /admin/users/:id/vip {tier, days} —— 直接授予/续期会员。
func (h *Handler) AdminGrantVIP(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		utils.BadRequest(c, "无效的用户 id")
		return
	}
	var req struct {
		Tier string `json:"tier"`
		Days int    `json:"days"`
	}
	if !utils.BindJSON(c, &req) {
		return
	}
	exp, err := h.svc.GrantToUser(uint(id), req.Tier, req.Days)
	if err != nil {
		if errors.Is(err, ErrUserNotFound) {
			utils.BadRequest(c, "用户不存在")
			return
		}
		utils.InternalError(c, 500, "授予会员失败", err)
		return
	}
	utils.SuccessWithMessage(c, "已授予会员", gin.H{"expires_at": exp})
}

// AdminRevokeVIP DELETE /admin/users/:id/vip —— 取消会员(回 free)。
func (h *Handler) AdminRevokeVIP(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		utils.BadRequest(c, "无效的用户 id")
		return
	}
	if err := h.svc.RevokeUser(uint(id)); err != nil {
		if errors.Is(err, ErrUserNotFound) {
			utils.BadRequest(c, "用户不存在")
			return
		}
		utils.InternalError(c, 500, "取消会员失败", err)
		return
	}
	utils.SuccessWithMessage(c, "已取消会员", nil)
}

// ListCodes GET /admin/vip-codes?status=&tier=&page=&page_size= —— 分页列表。
func (h *Handler) ListCodes(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "30"))
	items, total, err := h.svc.ListCodes(CodeFilter{Status: c.Query("status"), Tier: c.Query("tier")}, page, pageSize)
	if err != nil {
		utils.ServerError(c, "获取兑换码失败")
		return
	}
	utils.Success(c, gin.H{"codes": items, "total": total})
}
