package config

import (
	"scholar-backend/internal/common/model"
	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

// Handler handles HTTP requests for configuration operations
type Handler struct {
	service *Service
}

// NewHandler creates a new config handler
func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// GetPrivacyPolicy handles getting active privacy policy
func (h *Handler) GetPrivacyPolicy(c *gin.Context) {
	policy, err := h.service.GetActivePrivacyPolicy()
	if err != nil {
		utils.Error(c, 3000, "Failed to get privacy policy")
		return
	}

	utils.Success(c, policy)
}

// UpdatePrivacyPolicyRequest represents an update privacy policy request
type UpdatePrivacyPolicyRequest struct {
	Content string `json:"content" binding:"required"`
	Version string `json:"version" binding:"required"`
}

// UpdatePrivacyPolicy handles updating privacy policy (admin only)
func (h *Handler) UpdatePrivacyPolicy(c *gin.Context) {
	var req UpdatePrivacyPolicyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	policy := &model.PrivacyPolicy{
		Content:  req.Content,
		Version:  req.Version,
		IsActive: true,
	}

	err := h.service.CreatePrivacyPolicy(policy)
	if err != nil {
		utils.Error(c, 3001, "Failed to update privacy policy")
		return
	}

	utils.SuccessWithMessage(c, "Privacy policy updated successfully", policy)
}

// UpdateEmailConfigRequest represents an update email config request
type UpdateEmailConfigRequest struct {
	SMTPHost     string `json:"smtpHost" binding:"required"`
	SMTPPort     int    `json:"smtpPort" binding:"required"`
	SMTPUser     string `json:"smtpUser" binding:"required"`
	SMTPPassword string `json:"smtpPassword" binding:"required"`
	FromEmail    string `json:"fromEmail" binding:"required,email"`
	FromName     string `json:"fromName" binding:"required"`
}

// UpdateEmailConfig handles updating email configuration (admin only)
func (h *Handler) UpdateEmailConfig(c *gin.Context) {
	var req UpdateEmailConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	config := &model.EmailConfig{
		SMTPHost:     req.SMTPHost,
		SMTPPort:     req.SMTPPort,
		SMTPUser:     req.SMTPUser,
		SMTPPassword: req.SMTPPassword,
		FromEmail:    req.FromEmail,
		FromName:     req.FromName,
		IsActive:     true,
	}

	err := h.service.CreateEmailConfig(config)
	if err != nil {
		utils.Error(c, 3002, "Failed to update email configuration")
		return
	}

	utils.SuccessWithMessage(c, "Email configuration updated successfully", config)
}

// GetSystemConfig handles getting system configuration
func (h *Handler) GetSystemConfig(c *gin.Context) {
	config, err := h.service.GetSystemConfig()
	if err != nil {
		utils.Error(c, 3003, "Failed to get system configuration")
		return
	}

	if config == nil {
		// Return default if not found
		config = &model.SystemConfig{
			RequireEmailVerification: true,
		}
	}

	utils.Success(c, config)
}

// UpdateSystemConfigRequest represents an update system config request
type UpdateSystemConfigRequest struct {
	RequireEmailVerification bool `json:"require_email_verification"`
}

// UpdateSystemConfig handles updating system configuration (admin only)
func (h *Handler) UpdateSystemConfig(c *gin.Context) {
	var req UpdateSystemConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	err := h.service.UpdateSystemConfig(req.RequireEmailVerification)
	if err != nil {
		utils.Error(c, 3004, "Failed to update system configuration")
		return
	}

	utils.SuccessWithMessage(c, "System configuration updated successfully", nil)
}

// RegisterRoutes registers config routes
func (h *Handler) RegisterRoutes(router *gin.RouterGroup) {
	config := router.Group("/config")
	{
		config.GET("/privacy-policy", h.GetPrivacyPolicy)
		config.GET("/system", h.GetSystemConfig)
	}
}
