// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package admin

import (
	"scholar-backend/internal/common/utils"
	"strconv"

	"github.com/gin-gonic/gin"
)

// Handler handles HTTP requests for admin operations.
//
// 注:遗留的 admin 登录(Login / LoginRequest / RegisterRoutes)已整体下线 ——
// 管理员与普通用户共用 /api/v1/user/login 入口,凭 role=admin 的 token 进 /admin;
// 旧的 /api/v1/admin/login 绕过了那条链路的全部防爆破加固,故移除。
type Handler struct {
	service *Service
}

// NewHandler creates a new admin handler
func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// UpdateUserRoleRequest 角色变更请求体
type UpdateUserRoleRequest struct {
	Role string `json:"role" binding:"required"`
}

// UpdateUserRole 仅 super_admin 可调用：把指定用户提升为 admin 或降级为 user。
// 不允许操作 super_admin 自身或其他 super_admin（防止意外失锁）。
func (h *Handler) UpdateUserRole(c *gin.Context) {
	idStr := c.Param("id")
	id64, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		utils.BadRequest(c, "invalid user id")
		return
	}

	var req UpdateUserRoleRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	switch req.Role {
	case RoleAdmin:
		if err := h.service.PromoteToAdmin(uint(id64)); err != nil {
			utils.SafeError(c, 1010, err)
			return
		}
	case RoleUser:
		if err := h.service.DemoteFromAdmin(uint(id64)); err != nil {
			utils.SafeError(c, 1011, err)
			return
		}
	default:
		utils.BadRequest(c, "role must be 'admin' or 'user'")
		return
	}

	utils.SuccessWithMessage(c, "role updated", gin.H{
		"id":   id64,
		"role": req.Role,
	})
}
