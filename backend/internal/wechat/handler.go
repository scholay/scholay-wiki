package wechat

import (
	"scholar-backend/internal/common/model"
	"scholar-backend/internal/common/utils"
	"strconv"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// Handler handles HTTP requests for WeChat operations
type Handler struct {
	service *Service
}

// NewHandler creates a new WeChat handler
func NewHandler(db *gorm.DB) *Handler {
	return &Handler{
		service: NewService(db),
	}
}

// GetLoginURL generates the WeChat QR code login URL
// GET /api/v1/user/wechat/login-url
func (h *Handler) GetLoginURL(c *gin.Context) {
	state := GenerateState()

	loginURL, err := h.service.GenerateLoginURL(state)
	if err != nil {
		utils.Error(c, 5001, "Failed to generate login URL: "+err.Error())
		return
	}

	utils.Success(c, gin.H{
		"login_url": loginURL,
		"state":     state,
	})
}

// GetActiveConfig retrieves the active WeChat configuration (Admin only)
// GET /api/v1/admin/wechat/config
func (h *Handler) GetActiveConfig(c *gin.Context) {
	config, err := h.service.GetActiveConfig()
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			utils.Error(c, 4404, "No active WeChat configuration found")
			return
		}
		utils.Error(c, 5000, "Failed to get configuration: "+err.Error())
		return
	}

	// Mask sensitive information
	config.AppSecret = "***MASKED***"

	utils.Success(c, config)
}

// ListConfigs retrieves all WeChat configurations (Admin only)
// GET /api/v1/admin/wechat/configs
func (h *Handler) ListConfigs(c *gin.Context) {
	configs, err := h.service.ListConfigs()
	if err != nil {
		utils.Error(c, 5000, "Failed to list configurations: "+err.Error())
		return
	}

	// Mask sensitive information
	for i := range configs {
		configs[i].AppSecret = "***MASKED***"
	}

	utils.Success(c, configs)
}

// CreateConfigRequest represents the request to create a WeChat configuration
type CreateConfigRequest struct {
	AppID       string `json:"app_id" binding:"required"`
	AppSecret   string `json:"app_secret" binding:"required"`
	RedirectURI string `json:"redirect_uri" binding:"required"`
	Scope       string `json:"scope"`
	IsActive    bool   `json:"is_active"`
}

// CreateConfig creates a new WeChat configuration (Admin only)
// POST /api/v1/admin/wechat/config
func (h *Handler) CreateConfig(c *gin.Context) {
	var req CreateConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	// Set default scope if not provided
	if req.Scope == "" {
		req.Scope = "snsapi_login"
	}

	config := &model.WeChatConfig{
		AppID:       req.AppID,
		AppSecret:   req.AppSecret,
		RedirectURI: req.RedirectURI,
		Scope:       req.Scope,
		IsActive:    req.IsActive,
	}

	if err := h.service.CreateConfig(config); err != nil {
		utils.Error(c, 5001, "Failed to create configuration: "+err.Error())
		return
	}

	// Mask sensitive information before returning
	config.AppSecret = "***MASKED***"

	utils.Success(c, config)
}

// UpdateConfigRequest represents the request to update a WeChat configuration
type UpdateConfigRequest struct {
	AppID       string `json:"app_id"`
	AppSecret   string `json:"app_secret"`
	RedirectURI string `json:"redirect_uri"`
	Scope       string `json:"scope"`
	IsActive    *bool  `json:"is_active"`
}

// UpdateConfig updates a WeChat configuration (Admin only)
// PUT /api/v1/admin/wechat/config/:id
func (h *Handler) UpdateConfig(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		utils.BadRequest(c, "Invalid configuration ID")
		return
	}

	var req UpdateConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	// Get existing config (assuming we need to fetch first, or construct one)
	// For simplicity, construct a config object with the ID and update fields
	config := &model.WeChatConfig{
		ID: uint(id),
	}

	// Update fields only if provided
	if req.AppID != "" {
		config.AppID = req.AppID
	}
	if req.AppSecret != "" && req.AppSecret != "***MASKED***" {
		config.AppSecret = req.AppSecret
	}
	if req.RedirectURI != "" {
		config.RedirectURI = req.RedirectURI
	}
	if req.Scope != "" {
		config.Scope = req.Scope
	}
	if req.IsActive != nil {
		config.IsActive = *req.IsActive
	}

	if err := h.service.UpdateConfig(config); err != nil {
		utils.Error(c, 5002, "Failed to update configuration: "+err.Error())
		return
	}

	// Mask sensitive information before returning
	config.AppSecret = "***MASKED***"

	utils.Success(c, config)
}

// DeleteConfig deletes a WeChat configuration (Admin only)
// DELETE /api/v1/admin/wechat/config/:id
func (h *Handler) DeleteConfig(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		utils.BadRequest(c, "Invalid configuration ID")
		return
	}

	if err := h.service.DeleteConfig(uint(id)); err != nil {
		utils.Error(c, 5003, "Failed to delete configuration: "+err.Error())
		return
	}

	utils.Success(c, gin.H{"message": "Configuration deleted successfully"})
}

// SetActiveConfig sets a specific configuration as active (Admin only)
// POST /api/v1/admin/wechat/config/:id/activate
func (h *Handler) SetActiveConfig(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		utils.BadRequest(c, "Invalid configuration ID")
		return
	}

	if err := h.service.SetActiveConfig(uint(id)); err != nil {
		utils.Error(c, 5004, "Failed to set active configuration: "+err.Error())
		return
	}

	utils.Success(c, gin.H{"message": "Configuration activated successfully"})
}
