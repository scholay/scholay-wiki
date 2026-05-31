// ============================================================================
// 管理员运营操作:冻结 / 解冻 / 管理员备注
// ============================================================================

package user

import (
	"log/slog"
	"time"

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
//   - 立即吊销该用户全部已签发 token(RevokeUserAllTokens),封号当场生效。
//     否则被封用户手里的 JWT 在过期前仍可正常调用,封号形同虚设。
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

	// 强制下线靠两道防线:① 这里吊销该用户当前全部已签发 token(中间件 IsTokenRevoked 拦);
	// ② 登录侧 LoginWithEmail / LoginWithEmailCode 均校验 status==1,封号后无法重新签发新 token。
	// 吊销失败只记日志、不回滚冻结(状态已落库);真正的残留窗口仅限 Redis 故障期
	// —— IsTokenRevoked 此时 fail-open 放行,这是全局所有吊销共用的可用性取舍,非本接口特例。
	if err := utils.RevokeUserAllTokens(c.Request.Context(), uid); err != nil {
		slog.Error("freeze user: revoke tokens failed", "user_id", uid, "err", err)
	}

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

	utils.SuccessWithMessage(c, "User unfrozen", nil)
}

