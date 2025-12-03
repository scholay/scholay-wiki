// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package admin

import (
	"scholar-backend/internal/common/utils"

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
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	admin, token, err := h.service.Login(req.Username, req.Password)
	if err != nil {
		utils.Error(c, 1001, err.Error())
		return
	}

	utils.Success(c, LoginResponse{
		Token: token,
		Admin: admin,
	})
}

// GetProfile handles getting admin profile
func (h *Handler) GetProfile(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Unauthorized(c, "User not authenticated")
		return
	}

	admin, err := h.service.GetProfile(userID.(uint))
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
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Unauthorized(c, "User not authenticated")
		return
	}

	var req UpdatePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	err := h.service.UpdatePassword(userID.(uint), req.OldPassword, req.NewPassword)
	if err != nil {
		utils.Error(c, 1004, err.Error())
		return
	}

	utils.SuccessWithMessage(c, "Password updated successfully", nil)
}

// VerifyPassword handles verifying admin password (for sensitive operations)
func (h *Handler) VerifyPassword(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Unauthorized(c, "User not authenticated")
		return
	}

	var req VerifyPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	valid, err := h.service.VerifyPassword(userID.(uint), req.Password)
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
