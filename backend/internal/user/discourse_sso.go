// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package user

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"

	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// GetDiscourseSSOLoginURL generates the DiscourseConnect SSO login URL
func (h *Handler) GetDiscourseSSOLoginURL(c *gin.Context) {
	// Get Discourse SSO config
	config, err := h.service.GetDiscourseSSOConfig()
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "加载社区登录配置失败,请稍后重试")
		return
	}

	if config == nil || !config.Enabled {
		utils.ErrorResponse(c, http.StatusServiceUnavailable, "Discourse login is not configured or not enabled")
		return
	}

	if config.SSOSecret == "" {
		utils.ErrorResponse(c, http.StatusServiceUnavailable, "Discourse SSO secret is not configured")
		return
	}

	// Generate nonce (32 char random string) and store in Redis with 5 min TTL
	nonce := issueOAuthState(c, "discourse_sso_nonce:")

	// Build payload: nonce={nonce}&return_sso_url={config.RedirectURI}
	payload := fmt.Sprintf("nonce=%s&return_sso_url=%s", url.QueryEscape(nonce), url.QueryEscape(config.RedirectURI))

	// Base64 encode payload
	base64Payload := base64.StdEncoding.EncodeToString([]byte(payload))

	// Compute HMAC-SHA256 of base64 string using config.SSOSecret, hex encode
	mac := hmac.New(sha256.New, []byte(config.SSOSecret))
	mac.Write([]byte(base64Payload))
	hexSig := hex.EncodeToString(mac.Sum(nil))

	// Build URL: {config.SiteURL}/session/sso_provider?sso={url.QueryEscape(base64)}&sig={hexSig}
	ssoURL := fmt.Sprintf("%s/session/sso_provider?sso=%s&sig=%s",
		config.SiteURL,
		url.QueryEscape(base64Payload),
		hexSig,
	)

	utils.SuccessResponse(c, http.StatusOK, "success", gin.H{
		"url":   ssoURL,
		"nonce": nonce,
	})
}

// DiscourseSSOCallback handles the callback from Discourse DiscourseConnect SSO
func (h *Handler) DiscourseSSOCallback(c *gin.Context) {
	ssoParam := c.Query("sso")
	sig := c.Query("sig")
	invitationCode := c.Query("invitation_code")

	if ssoParam == "" || sig == "" {
		utils.ErrorResponse(c, http.StatusBadRequest, "Missing sso or sig parameter")
		return
	}

	// Get Discourse SSO config
	config, err := h.service.GetDiscourseSSOConfig()
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "加载社区登录配置失败,请稍后重试")
		return
	}

	if config == nil || !config.Enabled || config.SSOSecret == "" {
		utils.ErrorResponse(c, http.StatusServiceUnavailable, "Discourse SSO is not configured properly")
		return
	}

	// Verify signature: compute HMAC-SHA256 of sso param using config.SSOSecret
	mac := hmac.New(sha256.New, []byte(config.SSOSecret))
	mac.Write([]byte(ssoParam))
	expectedSig := hex.EncodeToString(mac.Sum(nil))

	if !hmac.Equal([]byte(expectedSig), []byte(sig)) {
		slog.Error("discourse sso: signature verification failed")
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid SSO signature")
		return
	}

	// Base64 decode the sso param
	decoded, err := base64.StdEncoding.DecodeString(ssoParam)
	if err != nil {
		slog.Error("discourse sso: failed to decode sso payload", "err", err)
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid SSO payload encoding")
		return
	}

	// Parse as URL query string
	params, err := url.ParseQuery(string(decoded))
	if err != nil {
		slog.Error("discourse sso: failed to parse sso payload", "err", err)
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid SSO payload format")
		return
	}

	nonce := params.Get("nonce")
	externalID := params.Get("external_id")
	email := params.Get("email")
	username := params.Get("username")
	name := params.Get("name")
	avatarURL := params.Get("avatar_url")

	if externalID == "" {
		utils.ErrorResponse(c, http.StatusBadRequest, "Missing external_id in SSO payload")
		return
	}

	if !validateOAuthState(c, "discourse_sso_nonce:", nonce) {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid or expired SSO nonce")
		return
	}

	// Find or create user (三态)
	ip := c.ClientIP()
	outcome, err := h.findOrCreateDiscourseUser(c.Request.Context(), externalID, email, username, name, avatarURL, invitationCode, ip)
	if err != nil {
		slog.Error("discourse sso: failed to process user", "err", err)
		utils.ErrorResponse(c, http.StatusInternalServerError, "社区登录处理失败,请稍后重试")
		return
	}

	if outcome.MergeToken != "" {
		respondOAuthPendingMerge(c, outcome.MergeToken, "discourse", derefStr(outcome.User.Email))
		return
	}

	token, err := issueTokenAndSession(h, c, outcome.User, ip)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "签发登录凭证失败,请重试")
		return
	}
	respondOAuthSuccess(c, token, outcome.User, outcome.IsNewUser)
}

// findOrCreateDiscourseUser Discourse SSO identity → 共用 helper。
// Discourse 的 username 已经在 SSO payload 里给到,直接当 UsernameCandidate。
func (h *Handler) findOrCreateDiscourseUser(ctx context.Context, externalID, email, username, name, avatarURL, invitationCode, ip string) (oauthOutcome, error) {
	_ = invitationCode
	_ = ip

	displayName := name
	if displayName == "" {
		displayName = username
	}
	return h.findOrCreateOAuthUser(ctx, oauthIdentity{
		Provider:          "discourse",
		ProviderUserID:    externalID,
		Email:             email,
		EmailVerified:     email != "", // Discourse SSO 默认 email 已验证
		UsernameCandidate: username,
		UsernameFallback:  "discourse_" + externalID,
		AvatarURL:         avatarURL,
		Bio:               displayName, // Discourse 保留把 display name 写进 bio 的习惯
		DisplayName:       displayName,
		ProviderDataExtras: map[string]string{
			"username":   username,
			"name":       name,
			"avatar_url": avatarURL,
		},
	})
}


// BindDiscourseRequest represents Discourse account binding request
type BindDiscourseRequest struct {
	SSO string `json:"sso" binding:"required"`
	Sig string `json:"sig" binding:"required"`
}

// BindDiscourseAccount handles Discourse account binding for existing users
func (h *Handler) BindDiscourseAccount(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	var req BindDiscourseRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	// Get Discourse SSO config
	config, err := h.service.GetDiscourseSSOConfig()
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "加载社区登录配置失败,请稍后重试")
		return
	}

	if config == nil || !config.Enabled || config.SSOSecret == "" {
		utils.ErrorResponse(c, http.StatusServiceUnavailable, "Discourse SSO is not configured properly")
		return
	}

	// Verify signature
	mac := hmac.New(sha256.New, []byte(config.SSOSecret))
	mac.Write([]byte(req.SSO))
	expectedSig := hex.EncodeToString(mac.Sum(nil))

	if !hmac.Equal([]byte(expectedSig), []byte(req.Sig)) {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid SSO signature")
		return
	}

	// Decode SSO payload
	decoded, err := base64.StdEncoding.DecodeString(req.SSO)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid SSO payload encoding")
		return
	}

	params, err := url.ParseQuery(string(decoded))
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid SSO payload format")
		return
	}

	externalID := params.Get("external_id")
	username := params.Get("username")
	name := params.Get("name")
	avatarURL := params.Get("avatar_url")

	if externalID == "" {
		utils.ErrorResponse(c, http.StatusBadRequest, "Missing external_id in SSO payload")
		return
	}

	// Bind Discourse to current user
	if err := h.bindDiscourseToUser(userID, externalID, username, name, avatarURL); err != nil {
		slog.Error("discourse bind: failed to bind account", "err", err, "user_id", userID)
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to bind Discourse account")
		return
	}

	utils.SuccessWithMessage(c, "Discourse account bound successfully", nil)
}

// bindDiscourseToUser binds a Discourse account to an existing user
func (h *Handler) bindDiscourseToUser(userID uint, externalID, username, name, avatarURL string) error {
	// 跨用户冲突校验收口到 oauthBindConflict(已绑到本人 → 走下面 create-or-update 幂等更新)。
	if _, err := h.oauthBindConflict(userID, "discourse", externalID); err != nil {
		return err
	}

	// Get current user
	user, err := h.service.FindByID(userID)
	if err != nil {
		return err
	}

	if user == nil {
		return errors.New("user not found")
	}

	// Update username and avatar if not set
	if user.Username == nil || *user.Username == "" {
		user.Username = &username
	}
	if user.AvatarURL == nil || *user.AvatarURL == "" {
		user.AvatarURL = &avatarURL
	}

	if err := h.service.UpdateUser(user); err != nil {
		return err
	}

	// Create or update auth provider entry
	authProvider, err := h.service.FindAuthProviderByUserAndProvider(userID, "discourse")
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return fmt.Errorf("find auth provider by user: %w", err)
	}

	providerData := map[string]string{
		"username":   username,
		"name":       name,
		"avatar_url": avatarURL,
	}
	providerDataBytes, _ := json.Marshal(providerData)
	providerDataJSON := string(providerDataBytes)

	if authProvider == nil {
		// Create new auth provider
		authProvider = &UserAuthProvider{
			UserID:         userID,
			Provider:       "discourse",
			ProviderUserID: externalID,
			ProviderData:   &providerDataJSON,
		}
		if err := h.service.CreateAuthProvider(authProvider); err != nil {
			return err
		}
	} else {
		// Update existing auth provider
		authProvider.ProviderUserID = externalID
		authProvider.ProviderData = &providerDataJSON
		if err := h.service.UpdateAuthProvider(authProvider); err != nil {
			return err
		}
	}

	return nil
}
