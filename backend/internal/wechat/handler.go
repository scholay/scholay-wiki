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
		utils.InternalError(c, 5001, "Failed to generate login URL", err)
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
		utils.InternalError(c, 5000, "获取微信配置失败", err)
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
		utils.InternalError(c, 5000, "Failed to get configuration", err)
		return
	}

	// 私密字段按统一遮罩规则:默认 "********",前端 ?show_sensitive=true 解蔽(与其他配置页的小眼睛一致)。
	if !utils.IsShowSensitive(c, "show_sensitive") {
		config.AppSecret = "********"
	}

	utils.Success(c, config)
}

// ListConfigs retrieves all WeChat configurations (Admin only)
// GET /api/v1/admin/wechat/configs
func (h *Handler) ListConfigs(c *gin.Context) {
	configs, err := h.service.ListConfigs()
	if err != nil {
		utils.InternalError(c, 5000, "Failed to list configurations", err)
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
		utils.InternalError(c, 5001, "Failed to create configuration", err)
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

	// 必须先加载已有配置, 否则 repo.UpdateConfig 的 Updates(map) 会把没传的字段
	// (AppID / RedirectURI / Scope) 写空 —— 之前的实现里 partial update 是把 app_id
	// 等覆盖成 "" 的 bug。这里改成"加载 + 合并 + 校验 + 保存"。
	existing, err := h.service.GetConfigByID(uint(id))
	if err != nil || existing == nil {
		utils.Error(c, 4404, "Configuration not found")
		return
	}
	config := *existing // copy so we mutate without aliasing
	config.ID = uint(id)

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

	// 启用必须有 AppID + AppSecret 齐全 —— 否则保存了 IsActive=true 也用不了, 还会让
	// 登录页错误地显示"微信登录"按钮。
	if config.IsActive && (config.AppID == "" || config.AppSecret == "") {
		utils.BadRequest(c, "启用微信 OAuth 需先填好 AppID 与 AppSecret")
		return
	}

	if err := h.service.UpdateConfig(&config); err != nil {
		utils.InternalError(c, 5002, "Failed to update configuration", err)
		return
	}

	// Mask sensitive information before returning
	config.AppSecret = "********"

	utils.Success(c, config)
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

	// 激活前必须确认凭据齐全 —— 否则同 UpdateConfig 那条 enabled-required-creds 规则
	// 的"侧门"被绕过, 激活了没 AppSecret 的配置, 登录页会错误地显示"微信登录"按钮。
	existing, err := h.service.GetConfigByID(uint(id))
	if err != nil || existing == nil {
		utils.Error(c, 4404, "Configuration not found")
		return
	}
	if existing.AppID == "" || existing.AppSecret == "" {
		utils.BadRequest(c, "激活该微信配置前请先填好 AppID 与 AppSecret")
		return
	}

	if err := h.service.SetActiveConfig(uint(id)); err != nil {
		utils.InternalError(c, 5004, "Failed to set active configuration", err)
		return
	}

	utils.Success(c, gin.H{"message": "Configuration activated successfully"})
}
