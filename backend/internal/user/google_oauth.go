// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package user

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"

	"scholar-backend/internal/common/model"
	"scholar-backend/internal/common/upstream"
	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

var googleUpstream = newOAuthUpstream("google_oauth")

// GoogleTokenInfo represents the response from Google's tokeninfo endpoint
type GoogleTokenInfo struct {
	Sub           string `json:"sub"`            // Google user ID
	Email         string `json:"email"`
	EmailVerified string `json:"email_verified"` // "true" or "false"
	Name          string `json:"name"`
	Picture       string `json:"picture"`
	GivenName     string `json:"given_name"`
	FamilyName    string `json:"family_name"`
	Aud           string `json:"aud"`            // Client ID
	Iss           string `json:"iss"`            // Issuer
	Exp           string `json:"exp"`            // Expiration
}

// GetGoogleClientID returns the Google Client ID for frontend to initialize GIS
// GET /api/v1/user/google/client-id
func (h *Handler) GetGoogleClientID(c *gin.Context) {
	googleConfig, err := h.service.GetGoogleOAuthConfig()
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "加载 Google 登录配置失败,请稍后重试")
		return
	}

	if googleConfig == nil || googleConfig.ClientID == "" || !googleConfig.Enabled {
		utils.Success(c, gin.H{
			"client_id": "",
			"enabled":   false,
		})
		return
	}

	utils.Success(c, gin.H{
		"client_id": googleConfig.ClientID,
		"enabled":   true,
	})
}

// GoogleIDTokenLoginRequest represents the login request with Google ID token
type GoogleIDTokenLoginRequest struct {
	IDToken string `json:"id_token" binding:"required"`
}

// GoogleIDTokenLogin handles Google Sign-In via ID token verification
// POST /api/v1/user/google/id-token-login
func (h *Handler) GoogleIDTokenLogin(c *gin.Context) {
	var req GoogleIDTokenLoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request: id_token is required")
		return
	}

	// Get Google OAuth config
	googleConfig, err := h.service.GetGoogleOAuthConfig()
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "加载 Google 登录配置失败,请稍后重试")
		return
	}

	if googleConfig == nil || googleConfig.ClientID == "" || !googleConfig.Enabled {
		utils.ErrorResponse(c, http.StatusServiceUnavailable, "Google 登录未配置或不可用")
		return
	}

	// Verify the ID token with Google
	tokenInfo, err := verifyGoogleIDToken(c.Request.Context(), req.IDToken)
	if err != nil {
		slog.Error("google oauth: failed to verify ID token", "err", err)
		utils.ErrorResponse(c, http.StatusUnauthorized, "Invalid Google ID token")
		return
	}

	// Verify the audience matches our Client ID
	if tokenInfo.Aud != googleConfig.ClientID {
		slog.Error("google oauth: audience mismatch", "expected", googleConfig.ClientID, "got", tokenInfo.Aud)
		utils.ErrorResponse(c, http.StatusUnauthorized, "登录凭证不匹配,请重试")
		return
	}

	// Find or create user (三态:登录 / 新建 / 需合并确认 —— 见 oauthOutcome)
	ip := c.ClientIP()
	outcome, err := h.findOrCreateGoogleUser(c.Request.Context(), tokenInfo, ip)
	if err != nil {
		slog.Error("google oauth: failed to process user", "err", err)
		utils.ErrorResponse(c, http.StatusInternalServerError, "Google 登录处理失败,请稍后重试")
		return
	}

	if outcome.MergeToken != "" {
		respondOAuthPendingMerge(c, outcome.MergeToken, "google", derefStr(outcome.User.Email))
		return
	}

	token, err := issueTokenAndSession(h, c, outcome.User, ip)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "签发登录凭证失败,请重试")
		return
	}
	respondOAuthSuccess(c, token, outcome.User, outcome.IsNewUser)
}

// verifyGoogleIDToken verifies a Google ID token using Google's tokeninfo endpoint.
// ctx 由调用方透传请求 ctx —— 之前用 context.Background() 绕过了 APITimeoutMiddleware 的 15s 上限,
// Google tokeninfo 端点卡住时登录请求会无限挂起并堆积僵尸 goroutine。
func verifyGoogleIDToken(ctx context.Context, idToken string) (*GoogleTokenInfo, error) {
	resp, err := googleUpstream.Do(ctx, upstream.Request{
		Method: http.MethodGet,
		Path:   "https://oauth2.googleapis.com/tokeninfo",
		Query:  url.Values{"id_token": {idToken}},
	})
	if err != nil {
		return nil, fmt.Errorf("failed to call tokeninfo: %w", err)
	}

	var info GoogleTokenInfo
	if err := resp.JSON(&info); err != nil {
		return nil, fmt.Errorf("failed to parse tokeninfo: %w", err)
	}

	// Verify issuer
	if info.Iss != "accounts.google.com" && info.Iss != "https://accounts.google.com" {
		return nil, fmt.Errorf("invalid issuer: %s", info.Iss)
	}

	return &info, nil
}

// findOrCreateGoogleUser 把 *GoogleTokenInfo 映射为 oauthIdentity 后走通用流程。
// 唯一额外行为:已绑 user 登录时刷新头像(Google profile 头像更新比 GitHub 频繁)。
func (h *Handler) findOrCreateGoogleUser(ctx context.Context, tokenInfo *GoogleTokenInfo, ip string) (oauthOutcome, error) {
	_ = ip

	username := tokenInfo.Name
	if username == "" {
		username = tokenInfo.GivenName
	}
	if username == "" && tokenInfo.Email != "" {
		username = splitEmail(tokenInfo.Email)
	}
	displayName := tokenInfo.Name
	if displayName == "" {
		displayName = tokenInfo.GivenName
	}

	outcome, err := h.findOrCreateOAuthUser(ctx, oauthIdentity{
		Provider:          "google",
		ProviderUserID:    tokenInfo.Sub,
		Email:             tokenInfo.Email,
		EmailVerified:     tokenInfo.EmailVerified == "true",
		UsernameCandidate: username,
		UsernameFallback:  "google_user",
		AvatarURL:         tokenInfo.Picture,
		DisplayName:       displayName,
		ProviderDataExtras: map[string]string{
			"name":    tokenInfo.Name,
			"email":   tokenInfo.Email,
			"picture": tokenInfo.Picture,
		},
	})
	if err != nil || outcome.MergeToken != "" || outcome.IsNewUser {
		return outcome, err
	}
	// 既有用户登入 —— 头像有变化就同步过来(Google profile 头像可能更新)
	if outcome.User != nil && tokenInfo.Picture != "" &&
		(outcome.User.AvatarURL == nil || *outcome.User.AvatarURL == "") {
		outcome.User.AvatarURL = &tokenInfo.Picture
		_ = h.service.UpdateUser(outcome.User)
	}
	return outcome, nil
}

// splitEmail extracts the local part from an email address
func splitEmail(email string) string {
	for i, c := range email {
		if c == '@' {
			return email[:i]
		}
	}
	return email
}

// BindGoogleAccountRequest represents the bind Google account request
type BindGoogleAccountRequest struct {
	IDToken string `json:"id_token" binding:"required"`
}

// BindGoogleAccount handles Google account binding for existing users
// POST /api/v1/user/bind-google
func (h *Handler) BindGoogleAccount(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	var req BindGoogleAccountRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request: id_token is required")
		return
	}

	// Get Google OAuth config
	googleConfig, err := h.service.GetGoogleOAuthConfig()
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "加载 Google 登录配置失败,请稍后重试")
		return
	}

	if googleConfig == nil || googleConfig.ClientID == "" || !googleConfig.Enabled {
		utils.ErrorResponse(c, http.StatusServiceUnavailable, "Google 登录未配置或不可用")
		return
	}

	// Verify ID token
	tokenInfo, err := verifyGoogleIDToken(c.Request.Context(), req.IDToken)
	if err != nil {
		slog.Error("google bind: failed to verify ID token", "err", err)
		utils.ErrorResponse(c, http.StatusUnauthorized, "Invalid Google ID token")
		return
	}

	if tokenInfo.Aud != googleConfig.ClientID {
		utils.ErrorResponse(c, http.StatusUnauthorized, "登录凭证不匹配,请重试")
		return
	}

	// Bind Google to user
	err = h.bindGoogleToUser(userID, tokenInfo)
	if err != nil {
		slog.Error("google bind: failed to bind", "err", err)
		utils.SafeError(c, http.StatusBadRequest, err)
		return
	}

	utils.SuccessWithMessage(c, "Google account bound successfully", nil)
}

// bindGoogleToUser binds a Google account to an existing user
func (h *Handler) bindGoogleToUser(userID uint, tokenInfo *GoogleTokenInfo) error {
	providerUserID := tokenInfo.Sub

	// 跨用户冲突校验收口到 oauthBindConflict;Google 策略:不允许重绑(连本人也提示已绑定)。
	boundToSelf, err := h.oauthBindConflict(userID, "google", providerUserID)
	if err != nil {
		return err
	}
	if boundToSelf {
		return fmt.Errorf("该 Google 账号已绑定到你的账号")
	}

	// Check if user already has a Google account bound
	existingGoogle, err := h.service.FindAuthProviderByUserAndProvider(userID, "google")
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return fmt.Errorf("failed to check user binding: %w", err)
	}
	if existingGoogle != nil {
		return fmt.Errorf("you already have a Google account bound, please unbind first")
	}

	// Update user profile (avatar if not set)
	user, err := h.service.FindByID(userID)
	if err != nil {
		return fmt.Errorf("failed to find user: %w", err)
	}
	if tokenInfo.Picture != "" && (user.AvatarURL == nil || *user.AvatarURL == "") {
		user.AvatarURL = &tokenInfo.Picture
		_ = h.service.UpdateUser(user)
	}

	// Create auth provider link
	providerData := map[string]string{
		"name":    tokenInfo.Name,
		"email":   tokenInfo.Email,
		"picture": tokenInfo.Picture,
	}
	providerDataBytes, _ := json.Marshal(providerData)
	providerDataJSON := string(providerDataBytes)

	authProvider := &UserAuthProvider{
		UserID:         userID,
		Provider:       "google",
		ProviderUserID: providerUserID,
		ProviderData:   &providerDataJSON,
	}

	return h.service.CreateAuthProvider(authProvider)
}

// UnbindGoogle handles Google account unbinding
// POST /api/v1/user/unbind-google
func (h *Handler) UnbindGoogle(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	err := h.service.UnbindGoogle(userID)
	if err != nil {
		utils.SafeError(c, http.StatusBadRequest, err)
		return
	}

	utils.SuccessWithMessage(c, "Google account unbound successfully", nil)
}

// GetGoogleOAuthConfig is a helper to get config from service (for use in handler)
func (s *Service) GetGoogleOAuthConfig() (*model.GoogleOAuthConfig, error) {
	return s.configService.GetGoogleOAuthConfig()
}
