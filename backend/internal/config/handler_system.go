// ============================================================================
// Scholay学术 V1.0
// 配置 Handler - 系统配置（邮箱验证、Turnstile 等）
// ============================================================================

package config

import (
	"scholar-backend/internal/common/model"
	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

const publicSystemConfigCacheControl = "public, max-age=60, must-revalidate"

func setPublicSystemConfigCache(c *gin.Context) {
	c.Header("Cache-Control", publicSystemConfigCacheControl)
}

// GetSystemConfig handles getting system configuration (public endpoint)
func (h *Handler) GetSystemConfig(c *gin.Context) {
	config, err := h.service.GetSystemConfig()
	if err != nil {
		utils.Error(c, 3003, "Failed to get system configuration")
		return
	}

	if config == nil {
		config = &model.SystemConfig{
			RequireEmailVerification: true,
		}
	}

	githubConfig, err := h.service.GetGithubOAuthConfig()
	if err != nil {
		githubConfig = nil
	}

	// 公开接口固定遮罩, 不接受 ?show_sensitive — 这是首页拿来给前端 turnstile site key
	// 的渠道, 任何匿名访问都不能见 secret。
	turnstileSecretKey := config.TurnstileSecretKey
	maskSecret(&turnstileSecretKey, false)

	response := map[string]any{
		"id":                         config.ID,
		"require_email_verification": config.RequireEmailVerification,
		"enable_turnstile":           config.EnableTurnstile,
		"turnstile_site_key":         config.TurnstileSiteKey,
		"turnstile_secret_key":       turnstileSecretKey,
		"google_analytics_id":        config.GoogleAnalyticsID,
		"created_at":                 config.CreatedAt,
		"updated_at":                 config.UpdatedAt,
	}

	// 每个 provider 的"可用"判定: enabled=true AND 全部必备凭据非空。
	// 与 UpdateConfig 的写入校验对齐, 同时对 DB 里历史脏数据(enabled=true 但缺
	// 凭据)做读侧兜底, 防止登录页错误地显示按钮。
	if githubConfig != nil && githubConfig.Enabled && githubConfig.ClientID != "" && githubConfig.ClientSecret != "" {
		response["github_client_id"] = githubConfig.ClientID
	}

	googleConfig, err := h.service.GetGoogleOAuthConfig()
	// Google 用 ID-Token 模式 secret 可选, 只需 client_id
	if err == nil && googleConfig != nil && googleConfig.Enabled && googleConfig.ClientID != "" {
		response["google_client_id"] = googleConfig.ClientID
	}

	discourseConfig, err := h.service.GetDiscourseSSOConfig()
	if err == nil && discourseConfig != nil && discourseConfig.Enabled && discourseConfig.SiteURL != "" && discourseConfig.SSOSecret != "" {
		response["discourse_site_url"] = discourseConfig.SiteURL
	}

	appleConfig, err := h.service.GetAppleOAuthConfig()
	response["apple_enabled"] = err == nil && appleConfig != nil && appleConfig.Enabled &&
		appleConfig.ServiceID != "" && appleConfig.TeamID != "" && appleConfig.KeyID != "" && appleConfig.PrivateKey != ""

	microsoftConfig, err := h.service.GetMicrosoftOAuthConfig()
	response["microsoft_enabled"] = err == nil && microsoftConfig != nil && microsoftConfig.Enabled &&
		microsoftConfig.ClientID != "" && microsoftConfig.ClientSecret != ""

	orcidConfig, err := h.service.GetOrcidOAuthConfig()
	response["orcid_enabled"] = err == nil && orcidConfig != nil && orcidConfig.Enabled &&
		orcidConfig.ClientID != "" && orcidConfig.ClientSecret != ""

	// WeChat:用 ConfigService 注入的 IsWeChatOAuthEnabled (config 包不直接依赖 wechat 包,
	// 避免循环 import)。bootstrap 时 SetWeChatOAuthEnabledProbe 注入。
	if h.wechatProbe != nil {
		response["wechat_enabled"] = h.wechatProbe()
	} else {
		response["wechat_enabled"] = false
	}

	// Turnstile / OAuth 开关必须在 60s 后重验，避免前端继续按旧配置发起认证。
	setPublicSystemConfigCache(c)
	utils.Success(c, response)
}

// UpdateSystemConfigRequest represents an update system config request
type UpdateSystemConfigRequest struct {
	RequireEmailVerification *bool   `json:"require_email_verification"`
	EnableTurnstile          *bool   `json:"enable_turnstile"`
	TurnstileSiteKey         *string `json:"turnstile_site_key"`
	TurnstileSecretKey       *string `json:"turnstile_secret_key"`
	GoogleAnalyticsID        *string `json:"google_analytics_id"`
}

// UpdateSystemConfig handles updating system configuration (admin only)
func (h *Handler) UpdateSystemConfig(c *gin.Context) {
	var req UpdateSystemConfigRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	// mask 哨兵处理 —— 前端 GET 拿到的 TurnstileSecretKey 是 "********", 如果用户
	// 只切了 EnableTurnstile 又把整个表单 PUT 回来, 这里要识别遮罩值并视为"不改",
	// 否则真正的 secret 会被覆盖成 "********"(=> turnstile siteverify 永久失效)。
	if req.TurnstileSecretKey != nil && *req.TurnstileSecretKey == maskedSecretValue {
		req.TurnstileSecretKey = nil
	}

	serviceReq := &SystemConfigPartialUpdate{
		RequireEmailVerification: req.RequireEmailVerification,
		EnableTurnstile:          req.EnableTurnstile,
		TurnstileSiteKey:         req.TurnstileSiteKey,
		TurnstileSecretKey:       req.TurnstileSecretKey,
		GoogleAnalyticsID:        req.GoogleAnalyticsID,
	}

	err := h.service.UpdateSystemConfigPartial(serviceReq)
	if err != nil {
		utils.Error(c, 3004, "Failed to update system configuration")
		return
	}

	utils.SuccessWithMessage(c, "System configuration updated successfully", nil)
}

// GetSystemConfigAdmin handles getting system configuration (admin only, supports show_sensitive)
func (h *Handler) GetSystemConfigAdmin(c *gin.Context) {
	config, err := h.service.GetSystemConfig()
	if err != nil {
		utils.Error(c, 3003, "Failed to get system configuration")
		return
	}

	if config == nil {
		config = &model.SystemConfig{
			RequireEmailVerification: true,
		}
	}

	// admin 端按 ?show_sensitive=true 解蔽,统一走 maskSecret 助手。
	turnstileSecretKey := config.TurnstileSecretKey
	maskSecret(&turnstileSecretKey, isShowSensitive(c, "show_sensitive"))

	response := map[string]any{
		"id":                         config.ID,
		"require_email_verification": config.RequireEmailVerification,
		"enable_turnstile":           config.EnableTurnstile,
		"turnstile_site_key":         config.TurnstileSiteKey,
		"turnstile_secret_key":       turnstileSecretKey,
		"google_analytics_id":        config.GoogleAnalyticsID,
		"created_at":                 config.CreatedAt,
		"updated_at":                 config.UpdatedAt,
	}

	utils.Success(c, response)
}
