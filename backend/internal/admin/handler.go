// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package admin

import (
	"fmt"
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

// UpdatePasswordRequest represents an update password request
type UpdatePasswordRequest struct {
	OldPassword string `json:"old_password" binding:"required"`
	NewPassword string `json:"new_password" binding:"required,min=8"`
}

// VerifyPasswordRequest represents a verify password request
type VerifyPasswordRequest struct {
	Password string `json:"password" binding:"required"`
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
	ua := c.GetHeader("User-Agent")

	// 异常登录检测:首次登录、IP 变化都告警(写 audit + log)
	// 把 adminUser.ID/Username 临时塞进 ctx 让 audit log 能识别操作人
	c.Set("user_id", adminUser.ID)
	c.Set("username", adminUser.Username)
	c.Set("user_role", adminUser.Role)
	if ipChanged(adminUser.LastLoginIP, ip) {
		LogAdminAction(c, "abnormal_login", ResUser,
			fmt.Sprintf("%d", adminUser.ID), gin.H{
				"current_ip": ip,
				"user_agent": ua,
				"reason":     "first_login_or_new_ip",
			})
		slog.Warn("admin abnormal login",
			"admin_id", adminUser.ID, "username", adminUser.Username, "ip", ip)
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

// GetProfile handles getting admin profile + permission metadata.
// 前端用 permissions 数组判断 UI 元素是否显示，避免硬编码 role 字符串。
func (h *Handler) GetProfile(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	admin, err := h.service.GetProfile(userID)
	if err != nil {
		utils.Error(c, 1002, "Failed to get profile")
		return
	}

	if admin == nil {
		utils.Error(c, 1003, "Admin not found")
		return
	}

	utils.Success(c, gin.H{
		"id":              admin.ID,
		"username":        admin.Username,
		"email":           admin.Email,
		"role":            admin.Role,
		"status":          admin.Status,
		"email_verified":  admin.EmailVerified,
		"last_login_at":   admin.LastLoginAt,
		"created_at":      admin.CreatedAt,
		"updated_at":      admin.UpdatedAt,
		"permissions":     PermissionsForRole(admin.Role),
		"is_super_admin":  admin.Role == RoleSuperAdmin,
	})
}

// UpdatePassword handles updating admin password
func (h *Handler) UpdatePassword(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	var req UpdatePasswordRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	err := h.service.UpdatePassword(userID, req.OldPassword, req.NewPassword)
	if err != nil {
		utils.Error(c, 1004, err.Error())
		return
	}

	utils.SuccessWithMessage(c, "Password updated successfully", nil)
}

// VerifyPassword handles verifying admin password (for sensitive operations)
func (h *Handler) VerifyPassword(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	var req VerifyPasswordRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	valid, err := h.service.VerifyPassword(userID, req.Password)
	if err != nil {
		utils.Error(c, 1005, err.Error())
		return
	}

	if !valid {
		utils.Error(c, 1006, "Invalid password")
		return
	}

	utils.SuccessWithMessage(c, "Password verified successfully", nil)
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

	LogAdminAction(c, ActionRoleAssign, ResUser, strconv.FormatUint(id64, 10), gin.H{
		"new_role": req.Role,
	})

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
