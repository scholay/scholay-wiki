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
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"scholar-backend/internal/common/cache"
	"scholar-backend/internal/common/model"
	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

var microsoftHTTPClient = &http.Client{
	Timeout: 10 * time.Second,
	Transport: &http.Transport{
		MaxIdleConns:        20,
		MaxIdleConnsPerHost: 10,
		IdleConnTimeout:     90 * time.Second,
	},
}

// MicrosoftUser represents Microsoft user info from Graph API
type MicrosoftUser struct {
	ID                string `json:"id"`
	DisplayName       string `json:"displayName"`
	Mail              string `json:"mail"`
	UserPrincipalName string `json:"userPrincipalName"`
	JobTitle          string `json:"jobTitle"`
}

// GetMicrosoftLoginURL generates Microsoft OAuth login URL
func (h *Handler) GetMicrosoftLoginURL(c *gin.Context) {
	msConfig, err := h.service.GetMicrosoftOAuthConfig()
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to get Microsoft OAuth config")
		return
	}
	if msConfig == nil || msConfig.ClientID == "" || !msConfig.Enabled {
		utils.ErrorResponse(c, http.StatusServiceUnavailable, "Microsoft login is not configured")
		return
	}

	state := generateRandomState()
	rdb := cache.GetRedis()
	if rdb != nil {
		rdb.Set(c.Request.Context(), "microsoft_oauth_state:"+state, "1", 5*time.Minute)
	}

	tenant := msConfig.Tenant
	if tenant == "" {
		tenant = "common"
	}

	oauthURL := fmt.Sprintf("https://login.microsoftonline.com/%s/oauth2/v2.0/authorize?client_id=%s&response_type=code&redirect_uri=%s&scope=%s&state=%s&response_mode=query",
		url.PathEscape(tenant),
		url.QueryEscape(msConfig.ClientID),
		url.QueryEscape(msConfig.RedirectURI),
		url.QueryEscape("openid email profile User.Read"),
		url.QueryEscape(state),
	)

	utils.Success(c, gin.H{
		"url":   oauthURL,
		"state": state,
	})
}

// MicrosoftCallback handles Microsoft OAuth callback
func (h *Handler) MicrosoftCallback(c *gin.Context) {
	code := c.Query("code")
	state := c.Query("state")
	if code == "" || state == "" {
		utils.BadRequest(c, "Missing code or state parameter")
		return
	}

	// Verify state
	rdb := cache.GetRedis()
	if rdb != nil {
		val, err := rdb.Get(c.Request.Context(), "microsoft_oauth_state:"+state).Result()
		if err != nil || val == "" {
			utils.ErrorResponse(c, http.StatusBadRequest, "Invalid or expired state")
			return
		}
		rdb.Del(c.Request.Context(), "microsoft_oauth_state:"+state)
	}

	msConfig, err := h.service.GetMicrosoftOAuthConfig()
	if err != nil || msConfig == nil || !msConfig.Enabled {
		utils.ErrorResponse(c, http.StatusServiceUnavailable, "Microsoft login is not configured")
		return
	}

	// Exchange code for token
	accessToken, err := h.exchangeMicrosoftCode(c.Request.Context(), code, msConfig)
	if err != nil {
		slog.Error("microsoft oauth: failed to exchange code", "err", err)
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to exchange authorization code")
		return
	}

	// Get user info from Microsoft Graph
	msUser, err := h.getMicrosoftUserInfo(c.Request.Context(), accessToken)
	if err != nil {
		slog.Error("microsoft oauth: failed to get user info", "err", err)
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to get Microsoft user info")
		return
	}

	ip := c.ClientIP()
	user, isNewUser, err := h.findOrCreateMicrosoftUser(msUser, ip)
	if err != nil {
		slog.Error("microsoft oauth: failed to process user", "err", err)
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to process Microsoft login")
		return
	}

	username := ""
	if user.Username != nil {
		username = *user.Username
	}
	role := "user"
	if user.Role != "" {
		role = user.Role
	}
	token, err := utils.GenerateTokenWithRole(user.ID, username, "user", role)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to generate token")
		return
	}

	_ = h.service.UpdateLastLoginWithIP(user.ID, ip)
	userAgent := c.GetHeader("User-Agent")
	_ = h.service.CreateSession(user.ID, token, ip, userAgent, 30*24*time.Hour)

	utils.SuccessResponse(c, http.StatusOK, "success", gin.H{
		"token":       token,
		"user":        user,
		"is_new_user": isNewUser,
	})
}

func (h *Handler) exchangeMicrosoftCode(ctx context.Context, code string, config *model.MicrosoftOAuthConfig) (string, error) {
	tenant := config.Tenant
	if tenant == "" {
		tenant = "common"
	}
	tokenURL := fmt.Sprintf("https://login.microsoftonline.com/%s/oauth2/v2.0/token", url.PathEscape(tenant))

	data := url.Values{}
	data.Set("client_id", config.ClientID)
	data.Set("client_secret", config.ClientSecret)
	data.Set("code", code)
	data.Set("redirect_uri", config.RedirectURI)
	data.Set("grant_type", "authorization_code")
	data.Set("scope", "openid email profile User.Read")

	req, err := http.NewRequestWithContext(ctx, "POST", tokenURL, strings.NewReader(data.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := microsoftHTTPClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("microsoft token exchange failed (%d): %s", resp.StatusCode, string(body))
	}

	var tokenResp struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.Unmarshal(body, &tokenResp); err != nil {
		return "", err
	}

	return tokenResp.AccessToken, nil
}

func (h *Handler) getMicrosoftUserInfo(ctx context.Context, accessToken string) (*MicrosoftUser, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", "https://graph.microsoft.com/v1.0/me", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)

	resp, err := microsoftHTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("microsoft graph API failed (%d): %s", resp.StatusCode, string(body))
	}

	var msUser MicrosoftUser
	if err := json.Unmarshal(body, &msUser); err != nil {
		return nil, err
	}

	return &msUser, nil
}

func (h *Handler) findOrCreateMicrosoftUser(msUser *MicrosoftUser, ip string) (*User, bool, error) {
	providerUserID := msUser.ID

	authProvider, err := h.service.FindAuthProvider("microsoft", providerUserID)
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, false, fmt.Errorf("find auth provider: %w", err)
	}

	if authProvider != nil {
		user, err := h.service.FindByID(authProvider.UserID)
		if err != nil {
			return nil, false, fmt.Errorf("find user by id: %w", err)
		}
		return user, false, nil
	}

	// Get email (Microsoft may return mail or userPrincipalName)
	email := msUser.Mail
	if email == "" {
		email = msUser.UserPrincipalName
	}

	var user *User
	if email != "" {
		found, err := h.service.FindByEmail(email)
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, false, fmt.Errorf("find user by email: %w", err)
		}
		user = found
	}

	isNewUser := false

	if user == nil {
		isNewUser = true

		username := msUser.DisplayName
		if username == "" && email != "" {
			username = splitEmail(email)
		}
		if username == "" {
			username = "ms_user"
		}

		existingUser, err := h.service.FindByUsername(username)
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, false, err
		}
		if existingUser != nil {
			username = fmt.Sprintf("%s_%d", username, time.Now().Unix())
		}

		user = &User{
			Username:      &username,
			Email:         &email,
			Role:          "user",
			Status:        1,
			EmailVerified: email != "",
		}

		if err := h.service.CreateUser(user); err != nil {
			return nil, false, err
		}

		go h.service.SendWelcomeMessage(user.ID)
	}

	providerData := map[string]string{
		"display_name": msUser.DisplayName,
		"email":        email,
		"job_title":    msUser.JobTitle,
	}
	providerDataBytes, _ := json.Marshal(providerData)
	providerDataJSON := string(providerDataBytes)

	authProvider = &UserAuthProvider{
		UserID:         user.ID,
		Provider:       "microsoft",
		ProviderUserID: providerUserID,
		ProviderData:   &providerDataJSON,
	}

	if err := h.service.CreateAuthProvider(authProvider); err != nil {
		return nil, isNewUser, err
	}

	return user, isNewUser, nil
}

// BindMicrosoftAccount handles Microsoft account binding
func (h *Handler) BindMicrosoftAccount(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Unauthorized(c, "User not authenticated")
		return
	}

	var req struct {
		Code  string `json:"code" binding:"required"`
		State string `json:"state" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request")
		return
	}

	msConfig, err := h.service.GetMicrosoftOAuthConfig()
	if err != nil || msConfig == nil || !msConfig.Enabled {
		utils.ErrorResponse(c, http.StatusServiceUnavailable, "Microsoft login is not configured")
		return
	}

	accessToken, err := h.exchangeMicrosoftCode(c.Request.Context(), req.Code, msConfig)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to exchange code")
		return
	}

	msUser, err := h.getMicrosoftUserInfo(c.Request.Context(), accessToken)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to get user info")
		return
	}

	// Check conflicts
	existing, err := h.service.FindAuthProvider("microsoft", msUser.ID)
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to check binding")
		return
	}
	if existing != nil {
		if existing.UserID == userID.(uint) {
			utils.ErrorResponse(c, http.StatusBadRequest, "This Microsoft account is already bound to your account")
		} else {
			utils.ErrorResponse(c, http.StatusBadRequest, "This Microsoft account is already bound to another user")
		}
		return
	}

	email := msUser.Mail
	if email == "" {
		email = msUser.UserPrincipalName
	}

	providerData := map[string]string{"display_name": msUser.DisplayName, "email": email}
	providerDataBytes, _ := json.Marshal(providerData)
	providerDataJSON := string(providerDataBytes)

	authProvider := &UserAuthProvider{
		UserID:         userID.(uint),
		Provider:       "microsoft",
		ProviderUserID: msUser.ID,
		ProviderData:   &providerDataJSON,
	}

	if err := h.service.CreateAuthProvider(authProvider); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to bind Microsoft account")
		return
	}

	utils.SuccessWithMessage(c, "Microsoft account bound successfully", nil)
}

// UnbindMicrosoft handles Microsoft account unbinding
func (h *Handler) UnbindMicrosoft(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Unauthorized(c, "User not authenticated")
		return
	}
	err := h.service.UnbindMicrosoft(userID.(uint))
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error())
		return
	}
	utils.SuccessWithMessage(c, "Microsoft account unbound successfully", nil)
}

// GetMicrosoftOAuthConfig helper
func (s *Service) GetMicrosoftOAuthConfig() (*model.MicrosoftOAuthConfig, error) {
	return s.configService.GetMicrosoftOAuthConfig()
}

// UnbindMicrosoft unbinds Microsoft from user account
func (s *Service) UnbindMicrosoft(userID uint) error {
	return s.repo.UnbindProviderInTx(userID, "microsoft")
}
