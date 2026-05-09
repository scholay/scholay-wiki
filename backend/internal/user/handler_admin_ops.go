// ============================================================================
// 管理员运营操作:冻结 / 解冻 / 管理员备注
// ============================================================================

package user

import (
	"strconv"
	"time"

	"scholar-backend/internal/admin"
	"scholar-backend/internal/common/database"
	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

// FreezeUserRequest 冻结请求
type FreezeUserRequest struct {
	Reason string `json:"reason" binding:"required,min=1,max=255"`
}

// FreezeUser 冻结用户(status=2)
// PUT /api/v1/admin/users/:id/freeze
//
// 行为:
//   - status 设为 2 (suspended)
//   - frozen_at = now()
//   - frozen_reason = 入参
//   - 失效该用户所有 user_sessions(强制下线)
//   - 写 audit log
func (h *Handler) FreezeUser(c *gin.Context) {
	uid, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}

	var req FreezeUserRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	// 不允许冻结管理员/超管(防止误操作锁死)
	target, err := h.service.FindByID(uid)
	if err != nil || target == nil {
		utils.NotFound(c, "User not found")
		return
	}
	if target.Role == "admin" || target.Role == "super_admin" {
		utils.BadRequest(c, "Cannot freeze admin / super_admin via this endpoint")
		return
	}

	now := time.Now()
	updates := map[string]any{
		"status":        2,
		"frozen_at":     now,
		"frozen_reason": req.Reason,
	}
	if err := database.GetDB().Model(&User{}).Where("id = ?", uid).Updates(updates).Error; err != nil {
		utils.InternalError(c, 3010, "Failed to freeze user", err)
		return
	}

	// 强制下线 — 删除该用户所有 user_sessions 行
	// 缓存层 (CachedSessionValidator) 5 分钟 TTL 后自动失效;
	// 期望立刻生效的话,后续可在 main 注入 InvalidateUserSessions 调用
	database.GetDB().Exec("DELETE FROM user_sessions WHERE user_id = ?", uid)

	admin.LogAdminAction(c, "freeze", admin.ResUser, strconv.FormatUint(uint64(uid), 10), gin.H{
		"reason": req.Reason,
	})

	utils.SuccessWithMessage(c, "User frozen", nil)
}

// UnfreezeUser 解冻用户(status=1)
// PUT /api/v1/admin/users/:id/unfreeze
func (h *Handler) UnfreezeUser(c *gin.Context) {
	uid, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}

	updates := map[string]any{
		"status":        1,
		"frozen_at":     nil,
		"frozen_reason": "",
	}
	if err := database.GetDB().Model(&User{}).Where("id = ?", uid).Updates(updates).Error; err != nil {
		utils.InternalError(c, 3011, "Failed to unfreeze user", err)
		return
	}

	admin.LogAdminAction(c, "unfreeze", admin.ResUser, strconv.FormatUint(uint64(uid), 10), nil)
	utils.SuccessWithMessage(c, "User unfrozen", nil)
}

// UpdateAdminNotesRequest 更新管理员备注
type UpdateAdminNotesRequest struct {
	Notes string `json:"notes" binding:"max=10000"`
}

// UpdateAdminNotes PUT /api/v1/admin/users/:id/notes
// 管理员对该用户的私人备注(用户不可见)
func (h *Handler) UpdateAdminNotes(c *gin.Context) {
	uid, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}

	var req UpdateAdminNotesRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	if err := database.GetDB().Model(&User{}).Where("id = ?", uid).
		Update("admin_notes", req.Notes).Error; err != nil {
		utils.InternalError(c, 3012, "Failed to update notes", err)
		return
	}

	admin.LogAdminAction(c, "update", admin.ResUser, strconv.FormatUint(uint64(uid), 10), gin.H{
		"field":          "admin_notes",
		"notes_length":   len(req.Notes),
	})
	utils.SuccessWithMessage(c, "Notes updated", nil)
}
