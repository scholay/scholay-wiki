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
	"scholar-backend/internal/common/database"
	"scholar-backend/internal/common/utils"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

// SessionCreator creates user sessions (implemented by user.Service).
type SessionCreator interface {
	CreateSession(userID uint, token, ip, userAgent string, expiresIn time.Duration) error
}

// Handler handles HTTP requests for admin operations
type Handler struct {
	service        *Service
	sessionCreator SessionCreator
}

// NewHandler creates a new admin handler
func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// SetSessionCreator injects a session creator used during admin login.
func (h *Handler) SetSessionCreator(sc SessionCreator) {
	h.sessionCreator = sc
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

	if h.sessionCreator != nil {
		if err := h.sessionCreator.CreateSession(adminUser.ID, token, ip, ua, utils.MaxSessionAge); err != nil {
			slog.Error("failed to create admin session", "admin_id", adminUser.ID, "err", err)
		}
	}

	// 异常登录检测:首次登录、IP 变化都告警(写 audit + log)
	// 把 adminUser.ID/Username 临时塞进 ctx 让 audit log 能识别操作人
	c.Set("user_id", adminUser.ID)
	c.Set("username", adminUser.Username)
	c.Set("user_role", adminUser.Role)
	if ipChanged(adminUser.LastLoginAt, c, adminUser.ID, ip) {
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

// ipChanged 判断是否是新 IP 登录(首次登录或 IP 与上次不同)
//
// 这里用 user_sessions 表的最近一条记录跟当前 ip 比较,而不是依赖 user.last_login_ip
// (后者在 admin 流程未必有维护)。
func ipChanged(lastLoginAt *time.Time, c *gin.Context, userID uint, currentIP string) bool {
	// 没有上次登录,首次登录视为新 IP
	if lastLoginAt == nil {
		return true
	}
	var lastIP string
	database.GetDB().Table("user_sessions").
		Select("ip").
		Where("user_id = ?", userID).
		Order("id DESC").
		Limit(1).
		Offset(1). // 跳过本次刚创建的 session
		Scan(&lastIP)
	return lastIP != "" && lastIP != currentIP
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
