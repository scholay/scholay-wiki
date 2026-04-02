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

	admin, token, err := h.service.Login(req.Username, req.Password)
	if err != nil {
		utils.Error(c, 1001, err.Error())
		return
	}

	if h.sessionCreator != nil {
		ip := c.ClientIP()
		ua := c.GetHeader("User-Agent")
		if err := h.sessionCreator.CreateSession(admin.ID, token, ip, ua, utils.MaxSessionAge); err != nil {
			slog.Error("failed to create admin session", "admin_id", admin.ID, "err", err)
		}
	}

	utils.Success(c, LoginResponse{
		Token: token,
		Admin: admin,
	})
}

// GetProfile handles getting admin profile
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

	utils.Success(c, admin)
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

// RegisterRoutes registers admin routes
func (h *Handler) RegisterRoutes(router *gin.RouterGroup) {
	admin := router.Group("/admin")
	{
		admin.POST("/login", h.Login)
		// Protected routes (require authentication)
		// These will be added in the main server setup with middleware
	}
}
