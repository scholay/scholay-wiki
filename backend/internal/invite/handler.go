// ============================================================================
// invite HTTP handler —— 用户端(我的邀请 / 落地页打开)+ 管理端(汇总 / 列表 / 明细)。
// 路由挂载见 cmd/server/routes_user.go / routes_admin.go。
// ============================================================================

package invite

import (
	"strconv"

	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

// ─── 用户端 ──────────────────────────────────────────────────────────────

// GetMyInvite GET /user/invite(登录态)—— get-or-create 我的邀请码 + 统计。
func (h *Handler) GetMyInvite(c *gin.Context) {
	uid, ok := utils.GetUserID(c)
	if !ok {
		return
	}
	view, err := h.svc.Stats(uid)
	if err != nil {
		utils.InternalError(c, 500, "获取邀请信息失败,请稍后重试", err)
		return
	}
	utils.Success(c, view)
}

// GetMyRegistrations GET /user/invite/registrations?page=&page_size=(登录态)
// —— 我邀请的用户列表。行内 name 已在服务层脱敏(原始邮箱/用户名/ID 不下发)。
func (h *Handler) GetMyRegistrations(c *gin.Context) {
	uid, ok := utils.GetUserID(c)
	if !ok {
		return
	}
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	items, total, err := h.svc.UserRegistrations(uid, page, pageSize)
	if err != nil {
		utils.InternalError(c, 500, "获取邀请记录失败,请稍后重试", err)
		return
	}
	utils.Success(c, gin.H{"items": items, "total": total})
}

// RecordOpen POST /invite/open {code}(公开,限流)—— 落地页打开计数。
// 契约:码不存在返回 {valid:false} 而非 4xx(防探测噪音);连请求体畸形也按
// valid:false 收口 —— 这个端点对外只有「有效/无效」两种回答,不提供任何探测面。
func (h *Handler) RecordOpen(c *gin.Context) {
	var req struct {
		Code string `json:"code"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Success(c, gin.H{"valid": false})
		return
	}
	valid, err := h.svc.RecordOpen(req.Code)
	if err != nil {
		// DB 故障是我们的问题,不是探测 —— 照常 5xx(友好文案,不回显 err)。
		utils.InternalError(c, 500, "服务暂不可用,请稍后重试", err)
		return
	}
	utils.Success(c, gin.H{"valid": valid})
}

// ─── 管理端 ──────────────────────────────────────────────────────────────

// AdminSummary GET /admin/invites/summary —— 邀请人数 / 总打开 / 总注册 / 近 7 天注册 / 累计奖励经费。
func (h *Handler) AdminSummary(c *gin.Context) {
	sum, err := h.svc.Summary()
	if err != nil {
		utils.InternalError(c, 500, "获取邀请汇总失败", err)
		return
	}
	utils.Success(c, sum)
}

// AdminList GET /admin/invites?page=&page_size=&keyword= —— 邀请人分页列表。
func (h *Handler) AdminList(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	items, total, err := h.svc.List(c.Query("keyword"), page, pageSize)
	if err != nil {
		utils.InternalError(c, 500, "获取邀请列表失败", err)
		return
	}
	utils.Success(c, gin.H{"items": items, "total": total})
}

// AdminRegistrations GET /admin/invites/:id/registrations?page=&page_size=
// —— 某邀请人(:id = user_id)带来的注册明细。
func (h *Handler) AdminRegistrations(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		utils.BadRequest(c, "无效的邀请人 id")
		return
	}
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	items, total, err := h.svc.RegistrationsOf(uint(id), page, pageSize)
	if err != nil {
		utils.InternalError(c, 500, "获取邀请注册明细失败", err)
		return
	}
	utils.Success(c, gin.H{"items": items, "total": total})
}
