// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package wechat

import (
	"errors"
	"net/url"
	"scholar-backend/internal/common/model"
	"scholar-backend/internal/common/utils"
	"strconv"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// 微信扫码回调的固定前端路径,与 frontend-user 的 /wechat/callback 路由对齐。
const wechatCallbackPath = "/wechat/callback"

// computeRedirectURI 按请求实际访问的源动态拼回调地址。
//
// 为什么不能用 DB 里写死的 RedirectURI:wxLogin SDK 的 self_redirect:true 会把
// iframe 内部页面导航到回调地址。如果 DB 里写的是裸域 scholay.com,而用户从
// www.scholay.com 打开,iframe 跳到不同子域 → nginx 的 X-Frame-Options:SAMEORIGIN
// 把页面挡掉,出现"拒绝了我们的连接"。
//
// 微信开放平台的"授权回调域"只校验 host(不带路径/协议),所以只要 host 在白名单
// 内,任何完整 URL 都接受 —— 把 host 动态绑到请求来源最稳。
func computeRedirectURI(c *gin.Context, fallback string) string {
	if origin := c.GetHeader("Origin"); origin != "" {
		return origin + wechatCallbackPath
	}
	if ref := c.GetHeader("Referer"); ref != "" {
		if u, err := url.Parse(ref); err == nil && u.Scheme != "" && u.Host != "" {
			return u.Scheme + "://" + u.Host + wechatCallbackPath
		}
	}
	scheme := c.GetHeader("X-Forwarded-Proto")
	if scheme == "" {
		if c.Request.TLS != nil {
			scheme = "https"
		} else {
			scheme = "http"
		}
	}
	if host := c.Request.Host; host != "" {
		return scheme + "://" + host + wechatCallbackPath
	}
	return fallback
}

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

// GetQRCodeConfig returns the WeChat configuration needed for embedded QR code login
// GET /api/v1/user/wechat/qrcode-config
func (h *Handler) GetQRCodeConfig(c *gin.Context) {
	config, err := h.service.GetActiveConfig()
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			utils.Error(c, 4404, "微信登录未配置")
			return
		}
		utils.Error(c, 5000, "获取微信配置失败: "+err.Error())
		return
	}

	state := GenerateState()

	// Only return public information needed for embedded QR code
	utils.Success(c, gin.H{
		"app_id":       config.AppID,
		"redirect_uri": computeRedirectURI(c, config.RedirectURI),
		"state":        state,
		"scope":        config.Scope,
	})
}

// GetActiveConfig retrieves the active WeChat configuration (Admin only)
// GET /api/v1/admin/wechat/config
func (h *Handler) GetActiveConfig(c *gin.Context) {
	config, err := h.service.GetActiveConfig()
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			utils.Error(c, 4404, "No active WeChat configuration found")
			return
		}
		utils.Error(c, 5000, "Failed to get configuration: "+err.Error())
		return
	}

	// Mask sensitive information
	config.AppSecret = "********"

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

	// Check if client requests unmasked secret (via query parameter)
	showSecret := c.Query("show_secret") == "true"

	if !showSecret {
		// Mask sensitive information
		for i := range configs {
			configs[i].AppSecret = "********"
		}
	}
	// If show_secret=true, return the real secret (client should verify admin first)

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
	config.AppSecret = "********"

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
	if req.AppSecret != "" && req.AppSecret != "********" {
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
	config.AppSecret = "********"

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
