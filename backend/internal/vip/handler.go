// ============================================================================
// vip HTTP handler —— 用户端(会员状态 / 兑换码)+ 管理端(生成 / 列表)。
// ============================================================================

package vip

import (
	"errors"
	"strconv"

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
	st, err := h.svc.GetOverview(c.Request.Context(), uid)
	if err != nil {
		utils.InternalError(c, 500, "获取会员信息失败", err)
		return
	}
	utils.Success(c, st.StripQuotaAmounts()) // 用户端只看百分比,不下发额度绝对值
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
		h.writeCodeError(c, err)
		return
	}
	utils.SuccessWithMessage(c, "兑换成功", res)
}

// PreviewCode POST /user/redeem-code/preview {code} —— 兑换前只读预览(不兑换)。
// 成功返回将授予的内容(确认弹窗用);失败态(无效/过期/用完/本人已兑换)走 writeCodeError。
func (h *Handler) PreviewCode(c *gin.Context) {
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
	pv, err := h.svc.PreviewCode(c.Request.Context(), uid, req.Code)
	if err != nil {
		h.writeCodeError(c, err)
		return
	}
	utils.Success(c, pv)
}

// writeCodeError 把兑换码业务错误翻成统一的用户文案(预览 / 兑换共用)。
func (h *Handler) writeCodeError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, ErrCodeNotFound):
		utils.BadRequest(c, "兑换码无效")
	case errors.Is(err, ErrCodeExpired):
		utils.BadRequest(c, "该兑换码已过期")
	case errors.Is(err, ErrCodeExhausted):
		utils.BadRequest(c, "该兑换码兑换次数已用完")
	case errors.Is(err, ErrCodeAlreadyRedeemed):
		utils.BadRequest(c, "您已经兑换过该兑换码")
	case errors.Is(err, ErrCodeRevoked):
		utils.BadRequest(c, "该兑换码已停用")
	case errors.Is(err, ErrCodeRedeemed): // 旧单次模型遗留
		utils.BadRequest(c, "该兑换码已被使用")
	default:
		utils.InternalError(c, 500, "兑换失败,请稍后重试", err)
	}
}

// ─── 管理端 ──────────────────────────────────────────────────────────────

// GenerateCodes POST /admin/vip-codes {count, tier, grant_days, max_uses, valid_days, note?} —— 批量生成。
func (h *Handler) GenerateCodes(c *gin.Context) {
	adminID, _ := utils.GetUserID(c)
	var req struct {
		Count              int    `json:"count"`
		GrantKind          string `json:"grant_kind"` // tier(默认) | credit
		Tier               string `json:"tier"`       // tier 码: pro|max
		GrantDays          int    `json:"grant_days"`
		GrantCredits       int    `json:"grant_credits"`        // credit 码: 经费数
		CreditKind         string `json:"credit_kind"`          // temp|perm
		CreditValidityDays int    `json:"credit_validity_days"` // credit temp 时有效天数
		MaxUses            int    `json:"max_uses"`             // 可兑换次数(默认 1, 最多 100)
		ValidDays          int    `json:"valid_days"`           // 码有效期窗口天数(默认 7, 最长 30)
		Note               string `json:"note"`
	}
	if !utils.BindJSON(c, &req) {
		return
	}
	var createdBy *uint
	if adminID != 0 {
		u := adminID
		createdBy = &u
	}
	codes, err := h.svc.GenerateCodes(GenerateCodesInput{
		Count: req.Count, GrantKind: req.GrantKind, Tier: req.Tier, GrantDays: req.GrantDays,
		GrantCredits: req.GrantCredits, CreditKind: req.CreditKind, CreditValidityDays: req.CreditValidityDays,
		MaxUses: req.MaxUses, ValidDays: req.ValidDays, Note: req.Note,
	}, createdBy)
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
	st, err := h.svc.GetOverview(c.Request.Context(), uint(id))
	if err != nil {
		utils.InternalError(c, 500, "获取会员状态失败", err)
		return
	}
	utils.Success(c, st)
}

// AdminGrantVIP POST /admin/users/:id/vip {tier, days, cycle?} —— 直接授予/续期会员。
// cycle 可选(monthly|yearly):设置用户计费周期标识(年费会员徽标);缺省不改动现值。
func (h *Handler) AdminGrantVIP(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		utils.BadRequest(c, "无效的用户 id")
		return
	}
	var req struct {
		Tier  string `json:"tier"`
		Days  int    `json:"days"`
		Cycle string `json:"cycle"` // ""=不改 | monthly | yearly
	}
	if !utils.BindJSON(c, &req) {
		return
	}
	if req.Cycle != "" {
		req.Cycle = normCycle(req.Cycle)
	}
	exp, err := h.svc.GrantToUser(uint(id), req.Tier, req.Days, req.Cycle)
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

// SetCodeStatus PUT /admin/vip-codes/:id/status {revoked} —— 管理员停用 / 恢复兑换码。
func (h *Handler) SetCodeStatus(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		utils.BadRequest(c, "无效的兑换码 id")
		return
	}
	var req struct {
		Revoked bool `json:"revoked"`
	}
	if !utils.BindJSON(c, &req) {
		return
	}
	if err := h.svc.SetCodeStatus(id, req.Revoked); err != nil {
		if errors.Is(err, ErrCodeNotFound) {
			utils.BadRequest(c, "兑换码不存在")
			return
		}
		utils.InternalError(c, 500, "更新兑换码状态失败", err)
		return
	}
	msg := "已停用"
	if !req.Revoked {
		msg = "已恢复"
	}
	utils.SuccessWithMessage(c, msg, nil)
}

// ExtendCode PUT /admin/vip-codes/:id/extend {days} —— 给已生成的兑换码续期(有效期顺延 days 天)。
func (h *Handler) ExtendCode(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		utils.BadRequest(c, "无效的兑换码 id")
		return
	}
	var req struct {
		Days int `json:"days"`
	}
	if !utils.BindJSON(c, &req) {
		return
	}
	code, err := h.svc.ExtendCode(id, req.Days)
	if err != nil {
		if errors.Is(err, ErrCodeNotFound) {
			utils.BadRequest(c, "兑换码不存在")
			return
		}
		utils.InternalError(c, 500, "续期失败", err)
		return
	}
	utils.SuccessWithMessage(c, "已续期", code)
}

// IncreaseCodeUses PUT /admin/vip-codes/:id/max-uses {add} —— 给已生成的兑换码加可兑换次数。
func (h *Handler) IncreaseCodeUses(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		utils.BadRequest(c, "无效的兑换码 id")
		return
	}
	var req struct {
		Add int `json:"add"`
	}
	if !utils.BindJSON(c, &req) {
		return
	}
	code, err := h.svc.IncreaseCodeUses(id, req.Add)
	if err != nil {
		if errors.Is(err, ErrCodeNotFound) {
			utils.BadRequest(c, "兑换码不存在")
			return
		}
		utils.InternalError(c, 500, "加次数失败", err)
		return
	}
	utils.SuccessWithMessage(c, "已加次数", code)
}

// SetCodeGrantDays PUT /admin/vip-codes/:id/grant-days {days} —— 修改会员码授予的会员天数。
// 只影响之后的兑换(兑换时实时读 grant_days),已兑换用户不受影响。仅限 tier(会员)码。
func (h *Handler) SetCodeGrantDays(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		utils.BadRequest(c, "无效的兑换码 id")
		return
	}
	var req struct {
		Days int `json:"days"`
	}
	if !utils.BindJSON(c, &req) {
		return
	}
	code, err := h.svc.SetCodeGrantDays(id, req.Days)
	if err != nil {
		if errors.Is(err, ErrCodeNotFound) {
			utils.BadRequest(c, "兑换码不存在")
			return
		}
		if errors.Is(err, ErrCodeNotTier) {
			utils.BadRequest(c, "该兑换码不是会员码,无会员天数可改")
			return
		}
		utils.InternalError(c, 500, "修改会员天数失败", err)
		return
	}
	utils.SuccessWithMessage(c, "已修改会员天数", code)
}

// ListCodes GET /admin/vip-codes?status=&tier=&page=&page_size= —— 分页列表。
func (h *Handler) ListCodes(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "30"))
	items, total, err := h.svc.ListCodes(CodeFilter{Status: c.Query("status"), Tier: c.Query("tier"), Redeemer: c.Query("redeemer")}, page, pageSize)
	if err != nil {
		utils.ServerError(c, "获取兑换码失败")
		return
	}
	utils.Success(c, gin.H{"codes": items, "total": total})
}
