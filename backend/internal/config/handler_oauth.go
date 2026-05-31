// ============================================================================
// Scholay学术 V1.0
// 配置 Handler - OAuth 提供商 (GitHub / Google / ORCID / Microsoft / Apple / Discourse SSO)
// ============================================================================

package config

import (
	"scholar-backend/internal/common/model"
	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

// OAuthConfigBase 多数 OAuth 提供商共享的 Update 请求字段
type OAuthConfigBase struct {
	ClientID     string `json:"client_id"`
	ClientSecret string `json:"client_secret"`
	RedirectURI  string `json:"redirect_uri"`
	Enabled      bool   `json:"enabled"`
}

// ============================================
// GitHub OAuth
// ============================================

// GetGithubOAuthConfig handles getting GitHub OAuth configuration
func (h *Handler) GetGithubOAuthConfig(c *gin.Context) {
	config, err := h.service.GetGithubOAuthConfig()
	if err != nil {
		utils.Error(c, 3020, "Failed to get GitHub OAuth configuration")
		return
	}
	if config == nil {
		config = &model.GithubOAuthConfig{}
	}
	maskSecret(&config.ClientSecret, isShowSensitive(c, "show_sensitive"))
	utils.Success(c, config)
}

// UpdateGithubOAuthConfigRequest represents an update GitHub OAuth config request
type UpdateGithubOAuthConfigRequest struct {
	OAuthConfigBase
}

// UpdateGithubOAuthConfig handles updating GitHub OAuth configuration (admin only)
func (h *Handler) UpdateGithubOAuthConfig(c *gin.Context) {
	var req UpdateGithubOAuthConfigRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	callbackURL := normalizeCallbackURL(req.RedirectURI, "/github/callback")

	existing, err := h.service.GetGithubOAuthConfig()
	if err != nil {
		utils.Error(c, 3021, "Failed to get existing GitHub OAuth configuration")
		return
	}
	existingSecret := ""
	if existing != nil {
		existingSecret = existing.ClientSecret
	}
	clientSecret, ok := preserveSecretOnEmpty(c, req.ClientSecret, existingSecret, existing != nil, "Client Secret")
	if !ok {
		return
	}

	// enabled=true 必须有完整凭据 —— 否则保存了也用不了, 还会让登录页错误地显示"GitHub 登录"按钮。
	if req.Enabled && (req.ClientID == "" || clientSecret == "") {
		utils.BadRequest(c, "启用 GitHub OAuth 需先填好 Client ID 与 Client Secret")
		return
	}

	if err := h.service.UpdateGithubOAuthConfig(req.ClientID, clientSecret, callbackURL, req.Enabled); err != nil {
		utils.Error(c, 3021, "Failed to update GitHub OAuth configuration")
		return
	}
	utils.SuccessWithMessage(c, "GitHub OAuth configuration updated successfully", nil)
}

// ============================================
// Google OAuth (no redirect URI; secret optional for ID-Token mode)
// ============================================

// GetGoogleOAuthConfig handles getting Google OAuth configuration (admin only)
func (h *Handler) GetGoogleOAuthConfig(c *gin.Context) {
	config, err := h.service.GetGoogleOAuthConfig()
	if err != nil {
		utils.Error(c, 3040, "Failed to get Google OAuth configuration")
		return
	}
	if config == nil {
		config = &model.GoogleOAuthConfig{}
	}
	maskSecret(&config.ClientSecret, isShowSensitive(c, "show_sensitive"))
	utils.Success(c, config)
}

// UpdateGoogleOAuthConfigRequest represents an update Google OAuth config request
type UpdateGoogleOAuthConfigRequest struct {
	ClientID     string `json:"client_id"`
	ClientSecret string `json:"client_secret"`
	Enabled      bool   `json:"enabled"`
}

// UpdateGoogleOAuthConfig handles updating Google OAuth configuration (admin only)
func (h *Handler) UpdateGoogleOAuthConfig(c *gin.Context) {
	var req UpdateGoogleOAuthConfigRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	// Google 用 ID-Token 模式,secret 是可选的 —— 走"留空 / 仍是遮罩 → 保留旧值"的统一逻辑。
	// 老逻辑只判 ""(漏判遮罩字符串), 前端再次保存表单时 ClientSecret 会被覆盖成 "********"。
	existing, _ := h.service.GetGoogleOAuthConfig()
	existingSecret := ""
	if existing != nil {
		existingSecret = existing.ClientSecret
	}
	clientSecret := req.ClientSecret
	if clientSecret == "" || clientSecret == maskedSecretValue {
		clientSecret = existingSecret // Google 允许彻底没有 secret, 不强制
	}

	// enabled=true 至少要有 Client ID(Google ID-Token 模式 secret 可选, 但 client_id 必填)
	if req.Enabled && req.ClientID == "" {
		utils.BadRequest(c, "启用 Google OAuth 需先填好 Client ID")
		return
	}

	if err := h.service.UpdateGoogleOAuthConfig(req.ClientID, clientSecret, req.Enabled); err != nil {
		utils.Error(c, 3041, "Failed to update Google OAuth configuration")
		return
	}
	utils.SuccessWithMessage(c, "Google OAuth configuration updated successfully", nil)
}

// ============================================
// ORCID OAuth
// ============================================

func (h *Handler) GetOrcidOAuthConfig(c *gin.Context) {
	config, err := h.service.GetOrcidOAuthConfig()
	if err != nil {
		utils.Error(c, 3050, "Failed to get ORCID OAuth configuration")
		return
	}
	if config == nil {
		config = &model.OrcidOAuthConfig{}
	}
	maskSecret(&config.ClientSecret, isShowSensitive(c, "show_sensitive"))
	utils.Success(c, config)
}

type UpdateOrcidOAuthConfigRequest struct {
	OAuthConfigBase
	UseSandbox bool `json:"use_sandbox"`
}

func (h *Handler) UpdateOrcidOAuthConfig(c *gin.Context) {
	var req UpdateOrcidOAuthConfigRequest
	if !utils.BindJSON(c, &req) {
		return
	}
	callbackURL := normalizeCallbackURL(req.RedirectURI, "/orcid/callback")

	existing, err := h.service.GetOrcidOAuthConfig()
	if err != nil {
		utils.Error(c, 3051, "Failed to get existing ORCID OAuth configuration")
		return
	}
	existingSecret := ""
	if existing != nil {
		existingSecret = existing.ClientSecret
	}
	clientSecret, ok := preserveSecretOnEmpty(c, req.ClientSecret, existingSecret, existing != nil, "Client Secret")
	if !ok {
		return
	}

	if req.Enabled && (req.ClientID == "" || clientSecret == "") {
		utils.BadRequest(c, "启用 ORCID OAuth 需先填好 Client ID 与 Client Secret")
		return
	}

	if err := h.service.UpdateOrcidOAuthConfig(req.ClientID, clientSecret, callbackURL, req.UseSandbox, req.Enabled); err != nil {
		utils.Error(c, 3051, "Failed to update ORCID OAuth configuration")
		return
	}
	utils.SuccessWithMessage(c, "ORCID OAuth configuration updated successfully", nil)
}

// ============================================
// Microsoft OAuth
// ============================================

func (h *Handler) GetMicrosoftOAuthConfig(c *gin.Context) {
	config, err := h.service.GetMicrosoftOAuthConfig()
	if err != nil {
		utils.Error(c, 3060, "Failed to get Microsoft OAuth configuration")
		return
	}
	if config == nil {
		config = &model.MicrosoftOAuthConfig{Tenant: "common"}
	}
	maskSecret(&config.ClientSecret, isShowSensitive(c, "show_sensitive"))
	utils.Success(c, config)
}

type UpdateMicrosoftOAuthConfigRequest struct {
	OAuthConfigBase
	Tenant string `json:"tenant"`
}

func (h *Handler) UpdateMicrosoftOAuthConfig(c *gin.Context) {
	var req UpdateMicrosoftOAuthConfigRequest
	if !utils.BindJSON(c, &req) {
		return
	}
	callbackURL := normalizeCallbackURL(req.RedirectURI, "/microsoft/callback")

	existing, err := h.service.GetMicrosoftOAuthConfig()
	if err != nil {
		utils.Error(c, 3061, "Failed to get existing Microsoft OAuth configuration")
		return
	}
	existingSecret := ""
	if existing != nil {
		existingSecret = existing.ClientSecret
	}
	clientSecret, ok := preserveSecretOnEmpty(c, req.ClientSecret, existingSecret, existing != nil, "Client Secret")
	if !ok {
		return
	}

	if req.Enabled && (req.ClientID == "" || clientSecret == "") {
		utils.BadRequest(c, "启用 Microsoft OAuth 需先填好 Client ID 与 Client Secret")
		return
	}

	if err := h.service.UpdateMicrosoftOAuthConfig(req.ClientID, clientSecret, callbackURL, req.Tenant, req.Enabled); err != nil {
		utils.Error(c, 3061, "Failed to update Microsoft OAuth configuration")
		return
	}
	utils.SuccessWithMessage(c, "Microsoft OAuth configuration updated successfully", nil)
}

// ============================================
// Apple OAuth (uses private key rather than client secret)
// ============================================

func (h *Handler) GetAppleOAuthConfig(c *gin.Context) {
	config, err := h.service.GetAppleOAuthConfig()
	if err != nil {
		utils.Error(c, 3070, "Failed to get Apple OAuth configuration")
		return
	}
	if config == nil {
		config = &model.AppleOAuthConfig{}
	}
	// 私钥按统一遮罩规则: 默认 "********",前端"查询"按钮加 ?show_sensitive=true 解蔽。
	// 同步保留 has_key 给老前端 / 简单 UI 用作"是否已配置"判定。
	maskSecret(&config.PrivateKey, isShowSensitive(c, "show_sensitive"))
	utils.Success(c, gin.H{
		"id":           config.ID,
		"service_id":   config.ServiceID,
		"team_id":      config.TeamID,
		"key_id":       config.KeyID,
		"private_key":  config.PrivateKey,
		"has_key":      config.PrivateKey != "" && config.PrivateKey != maskedSecretValue,
		"redirect_uri": config.RedirectURI,
		"enabled":      config.Enabled,
	})
}

type UpdateAppleOAuthConfigRequest struct {
	ServiceID   string `json:"service_id"`
	TeamID      string `json:"team_id"`
	KeyID       string `json:"key_id"`
	PrivateKey  string `json:"private_key"`
	RedirectURI string `json:"redirect_uri"`
	Enabled     bool   `json:"enabled"`
}

func (h *Handler) UpdateAppleOAuthConfig(c *gin.Context) {
	var req UpdateAppleOAuthConfigRequest
	if !utils.BindJSON(c, &req) {
		return
	}
	// 私钥按"留空 / 仍是遮罩 → 保留旧值"处理 —— 防止用户只切 enabled 或改 redirect
	// 时不慎把已配置的 PrivateKey 清空。
	existing, _ := h.service.GetAppleOAuthConfig()
	existingKey := ""
	if existing != nil {
		existingKey = existing.PrivateKey
	}
	privateKey, ok := preserveSecretOnEmpty(c, req.PrivateKey, existingKey, existing != nil, "Private Key")
	if !ok {
		return
	}
	// Apple 启用需要 ServiceID + TeamID + KeyID + PrivateKey 四项齐全
	if req.Enabled && (req.ServiceID == "" || req.TeamID == "" || req.KeyID == "" || privateKey == "") {
		utils.BadRequest(c, "启用 Apple OAuth 需先填好 Service ID / Team ID / Key ID 和 Private Key")
		return
	}
	callbackURL := normalizeCallbackURL(req.RedirectURI, "/apple/callback")
	if err := h.service.UpdateAppleOAuthConfig(req.ServiceID, req.TeamID, req.KeyID, privateKey, callbackURL, req.Enabled); err != nil {
		utils.Error(c, 3071, "Failed to update Apple OAuth configuration")
		return
	}
	utils.SuccessWithMessage(c, "Apple OAuth configuration updated successfully", nil)
}

// ============================================
// Discourse SSO
// ============================================

// GetDiscourseSSOConfig handles getting Discourse SSO configuration (admin only)
func (h *Handler) GetDiscourseSSOConfig(c *gin.Context) {
	config, err := h.service.GetDiscourseSSOConfig()
	if err != nil {
		utils.Error(c, 3030, "Failed to get Discourse SSO configuration")
		return
	}
	if config == nil {
		config = &model.DiscourseSSOConfig{}
	}
	maskSecret(&config.SSOSecret, isShowSensitive(c, "show_sensitive"))
	utils.Success(c, config)
}

// UpdateDiscourseSSOConfigRequest represents an update Discourse SSO config request
// Discourse 用 SSO Secret 而非 Client Secret，字段名不同，不复用 base。
type UpdateDiscourseSSOConfigRequest struct {
	SiteURL     string `json:"site_url"`
	SSOSecret   string `json:"sso_secret"`
	RedirectURI string `json:"redirect_uri"`
	Enabled     bool   `json:"enabled"`
}

// UpdateDiscourseSSOConfig handles updating Discourse SSO configuration (admin only)
func (h *Handler) UpdateDiscourseSSOConfig(c *gin.Context) {
	var req UpdateDiscourseSSOConfigRequest
	if !utils.BindJSON(c, &req) {
		return
	}
	callbackURL := normalizeCallbackURL(req.RedirectURI, "/discourse/callback")

	existing, err := h.service.GetDiscourseSSOConfig()
	if err != nil {
		utils.Error(c, 3031, "Failed to get existing Discourse SSO configuration")
		return
	}
	existingSecret := ""
	if existing != nil {
		existingSecret = existing.SSOSecret
	}
	ssoSecret, ok := preserveSecretOnEmpty(c, req.SSOSecret, existingSecret, existing != nil, "SSO Secret")
	if !ok {
		return
	}

	if req.Enabled && (req.SiteURL == "" || ssoSecret == "") {
		utils.BadRequest(c, "启用 Discourse SSO 需先填好 Site URL 与 SSO Secret")
		return
	}

	if err := h.service.UpdateDiscourseSSOConfig(req.SiteURL, ssoSecret, callbackURL, req.Enabled); err != nil {
		utils.Error(c, 3031, "Failed to update Discourse SSO configuration")
		return
	}
	utils.SuccessWithMessage(c, "Discourse SSO configuration updated successfully", nil)
}
