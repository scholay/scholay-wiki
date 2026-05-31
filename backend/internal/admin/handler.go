// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package admin

import (
	"log/slog"
	"scholar-backend/internal/common/utils"
	"strconv"

	"github.com/gin-gonic/gin"
)

// Handler handles HTTP requests for admin operations
type Handler struct {
	service *Service
}

// NewHandler creates a new admin handler
func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// LoginRequest represents a login request
type LoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

// LoginResponse represents a login response
type LoginResponse struct {
	Token string     `json:"token"`
	Admin *AdminUser `json:"admin"`
}


// Login handles admin login
func (h *Handler) Login(c *gin.Context) {
	var req LoginRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	adminUser, token, err := h.service.Login(req.Username, req.Password)
	if err != nil {
		utils.Error(c, 1001, err.Error())
		return
	}

	ip := c.ClientIP()

	// 异常登录检测:首次登录 / IP 变化打 warn 日志, 留作运维排查信号。
	if ipChanged(adminUser.LastLoginIP, ip) {
		slog.Warn("admin abnormal login",
			"admin_id", adminUser.ID, "username", adminUser.Username, "ip", ip,
			"reason", "first_login_or_new_ip")
	}

	utils.Success(c, LoginResponse{
		Token: token,
		Admin: adminUser,
	})
}

// ipChanged 判断是否是新 IP 登录(首次登录或 IP 与上次不同).
// 数据源切到 users.last_login_ip,user_sessions 表已下线。
func ipChanged(lastIP *string, currentIP string) bool {
	if lastIP == nil || *lastIP == "" {
		return true
	}
	return *lastIP != currentIP
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
			utils.Error(c, 1010, err.Error())
			return
		}
	case RoleUser:
		if err := h.service.DemoteFromAdmin(uint(id64)); err != nil {
			utils.Error(c, 1011, err.Error())
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

// RegisterRoutes registers admin routes
func (h *Handler) RegisterRoutes(router *gin.RouterGroup) {
	admin := router.Group("/admin")
	{
		admin.POST("/login", h.Login)
		// Protected routes (require authentication)
		// These will be added in the main server setup with middleware
	}
}
