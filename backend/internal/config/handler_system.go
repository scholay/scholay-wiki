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

	turnstileSecretKey := config.TurnstileSecretKey
	if turnstileSecretKey != "" {
		turnstileSecretKey = "********"
	}

	response := map[string]any{
		"id":                         config.ID,
		"require_email_verification": config.RequireEmailVerification,
		"enable_turnstile":           config.EnableTurnstile,
		"turnstile_site_key":         config.TurnstileSiteKey,
		"turnstile_secret_key":       turnstileSecretKey,
		"created_at":                 config.CreatedAt,
		"updated_at":                 config.UpdatedAt,
	}

	if githubConfig != nil && githubConfig.Enabled && githubConfig.ClientID != "" {
		response["github_client_id"] = githubConfig.ClientID
	}

	googleConfig, err := h.service.GetGoogleOAuthConfig()
	if err == nil && googleConfig != nil && googleConfig.Enabled && googleConfig.ClientID != "" {
		response["google_client_id"] = googleConfig.ClientID
	}

	discourseConfig, err := h.service.GetDiscourseSSOConfig()
	if err == nil && discourseConfig != nil && discourseConfig.Enabled && discourseConfig.SiteURL != "" {
		response["discourse_site_url"] = discourseConfig.SiteURL
	}

	appleConfig, err := h.service.GetAppleOAuthConfig()
	response["apple_enabled"] = err == nil && appleConfig != nil && appleConfig.Enabled && appleConfig.ServiceID != ""

	microsoftConfig, err := h.service.GetMicrosoftOAuthConfig()
	response["microsoft_enabled"] = err == nil && microsoftConfig != nil && microsoftConfig.Enabled && microsoftConfig.ClientID != ""

	orcidConfig, err := h.service.GetOrcidOAuthConfig()
	response["orcid_enabled"] = err == nil && orcidConfig != nil && orcidConfig.Enabled && orcidConfig.ClientID != ""

	utils.Success(c, response)
}

// UpdateSystemConfigRequest represents an update system config request
type UpdateSystemConfigRequest struct {
	RequireEmailVerification *bool   `json:"require_email_verification"`
	EnableTurnstile          *bool   `json:"enable_turnstile"`
	TurnstileSiteKey         *string `json:"turnstile_site_key"`
	TurnstileSecretKey       *string `json:"turnstile_secret_key"`
}

// UpdateSystemConfig handles updating system configuration (admin only)
func (h *Handler) UpdateSystemConfig(c *gin.Context) {
	var req UpdateSystemConfigRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	serviceReq := &SystemConfigPartialUpdate{
		RequireEmailVerification: req.RequireEmailVerification,
		EnableTurnstile:          req.EnableTurnstile,
		TurnstileSiteKey:         req.TurnstileSiteKey,
		TurnstileSecretKey:       req.TurnstileSecretKey,
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

	showSensitive := c.Query("show_sensitive") == "true"
	turnstileSecretKey := config.TurnstileSecretKey
	if !showSensitive && turnstileSecretKey != "" {
		turnstileSecretKey = "********"
	}

	response := map[string]any{
		"id":                         config.ID,
		"require_email_verification": config.RequireEmailVerification,
		"enable_turnstile":           config.EnableTurnstile,
		"turnstile_site_key":         config.TurnstileSiteKey,
		"turnstile_secret_key":       turnstileSecretKey,
		"created_at":                 config.CreatedAt,
		"updated_at":                 config.UpdatedAt,
	}

	utils.Success(c, response)
}
