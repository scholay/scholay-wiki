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

	"scholar-backend/internal/common/httpclient"
	"scholar-backend/internal/common/model"
	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

var orcidHTTPClient = httpclient.OAuthClient

const (
	orcidAuthURL        = "https://orcid.org/oauth/authorize"
	orcidTokenURL       = "https://orcid.org/oauth/token"
	orcidAPIURL         = "https://pub.orcid.org/v3.0"
	orcidSandboxAuthURL = "https://sandbox.orcid.org/oauth/authorize"
	orcidSandboxTokenURL = "https://sandbox.orcid.org/oauth/token"
	orcidSandboxAPIURL  = "https://pub.sandbox.orcid.org/v3.0"
)

// OrcidTokenResponse represents ORCID token exchange response
type OrcidTokenResponse struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
	ExpiresIn   int    `json:"expires_in"`
	ORCID       string `json:"orcid"`
	Name        string `json:"name"`
}

// GetOrcidLoginURL generates ORCID OAuth login URL
func (h *Handler) GetOrcidLoginURL(c *gin.Context) {
	orcidConfig, err := h.service.GetOrcidOAuthConfig()
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to get ORCID OAuth config")
		return
	}
	if orcidConfig == nil || orcidConfig.ClientID == "" || !orcidConfig.Enabled {
		utils.ErrorResponse(c, http.StatusServiceUnavailable, "ORCID login is not configured")
		return
	}

	state := issueOAuthState(c, "orcid_oauth_state:")

	authURL := orcidAuthURL
	if orcidConfig.UseSandbox {
		authURL = orcidSandboxAuthURL
	}

	oauthURL := fmt.Sprintf("%s?client_id=%s&response_type=code&scope=/authenticate&redirect_uri=%s&state=%s",
		authURL,
		url.QueryEscape(orcidConfig.ClientID),
		url.QueryEscape(orcidConfig.RedirectURI),
		url.QueryEscape(state),
	)

	utils.Success(c, gin.H{
		"url":   oauthURL,
		"state": state,
	})
}

// OrcidCallback handles ORCID OAuth callback
func (h *Handler) OrcidCallback(c *gin.Context) {
	code := c.Query("code")
	state := c.Query("state")
	if code == "" || state == "" {
		utils.BadRequest(c, "Missing code or state parameter")
		return
	}

	if !validateOAuthState(c, "orcid_oauth_state:", state) {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid or expired state")
		return
	}

	orcidConfig, err := h.service.GetOrcidOAuthConfig()
	if err != nil || orcidConfig == nil || !orcidConfig.Enabled {
		utils.ErrorResponse(c, http.StatusServiceUnavailable, "ORCID login is not configured")
		return
	}

	// Exchange code for token (ORCID returns orcid + name in the token response)
	tokenResp, err := h.exchangeOrcidCode(c.Request.Context(), code, orcidConfig)
	if err != nil {
		slog.Error("orcid oauth: failed to exchange code", "err", err)
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to exchange authorization code")
		return
	}

	if tokenResp.ORCID == "" {
		utils.ErrorResponse(c, http.StatusInternalServerError, "ORCID not returned in token response")
		return
	}

	// Find or create user
	ip := c.ClientIP()
	user, isNewUser, err := h.findOrCreateOrcidUser(tokenResp, ip)
	if err != nil {
		slog.Error("orcid oauth: failed to process user", "err", err)
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to process ORCID login")
		return
	}

	token, err := issueTokenAndSession(h, c, user, ip)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to generate token")
		return
	}
	respondOAuthSuccess(c, token, user, isNewUser)
}

func (h *Handler) exchangeOrcidCode(ctx context.Context, code string, config *model.OrcidOAuthConfig) (*OrcidTokenResponse, error) {
	tokenURL := orcidTokenURL
	if config.UseSandbox {
		tokenURL = orcidSandboxTokenURL
	}

	data := url.Values{}
	data.Set("client_id", config.ClientID)
	data.Set("client_secret", config.ClientSecret)
	data.Set("grant_type", "authorization_code")
	data.Set("code", code)
	data.Set("redirect_uri", config.RedirectURI)

	req, err := http.NewRequestWithContext(ctx, "POST", tokenURL, strings.NewReader(data.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")

	resp, err := orcidHTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("orcid token exchange failed (%d): %s", resp.StatusCode, string(body))
	}

	var tokenResp OrcidTokenResponse
	if err := json.Unmarshal(body, &tokenResp); err != nil {
		return nil, fmt.Errorf("failed to parse token response: %w", err)
	}

	return &tokenResp, nil
}

func (h *Handler) findOrCreateOrcidUser(tokenResp *OrcidTokenResponse, ip string) (*User, bool, error) {
	providerUserID := tokenResp.ORCID

	authProvider, err := h.service.FindAuthProvider("orcid", providerUserID)
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

	isNewUser := true
	username := tokenResp.Name
	if username == "" {
		username = "orcid_" + strings.ReplaceAll(providerUserID, "-", "")[:8]
	}

	existingUser, err := h.service.FindByUsername(username)
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, false, err
	}
	if existingUser != nil {
		username = fmt.Sprintf("%s_%d", username, time.Now().Unix())
	}

	orcidURL := fmt.Sprintf("https://orcid.org/%s", providerUserID)
	user := &User{
		Username: &username,
		Role:     "user",
		Status:   1,
		Bio:      &orcidURL,
	}

	if err := h.service.CreateUser(user); err != nil {
		return nil, false, err
	}

	h.service.SendWelcomeMessage(user.ID)

	providerData := map[string]string{
		"orcid": providerUserID,
		"name":  tokenResp.Name,
	}
	providerDataBytes, _ := json.Marshal(providerData)
	providerDataJSON := string(providerDataBytes)

	authProvider = &UserAuthProvider{
		UserID:         user.ID,
		Provider:       "orcid",
		ProviderUserID: providerUserID,
		ProviderData:   &providerDataJSON,
	}

	if err := h.service.CreateAuthProvider(authProvider); err != nil {
		return nil, isNewUser, err
	}

	return user, isNewUser, nil
}

// BindOrcidAccount handles ORCID account binding for existing users
func (h *Handler) BindOrcidAccount(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok {
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

	orcidConfig, err := h.service.GetOrcidOAuthConfig()
	if err != nil || orcidConfig == nil || !orcidConfig.Enabled {
		utils.ErrorResponse(c, http.StatusServiceUnavailable, "ORCID login is not configured")
		return
	}

	tokenResp, err := h.exchangeOrcidCode(c.Request.Context(), req.Code, orcidConfig)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to exchange code")
		return
	}

	providerUserID := tokenResp.ORCID

	// Check conflicts
	existing, err := h.service.FindAuthProvider("orcid", providerUserID)
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to check binding")
		return
	}
	if existing != nil {
		if existing.UserID == userID {
			utils.ErrorResponse(c, http.StatusBadRequest, "This ORCID is already bound to your account")
		} else {
			utils.ErrorResponse(c, http.StatusBadRequest, "This ORCID is already bound to another user")
		}
		return
	}

	providerData := map[string]string{"orcid": providerUserID, "name": tokenResp.Name}
	providerDataBytes, _ := json.Marshal(providerData)
	providerDataJSON := string(providerDataBytes)

	authProvider := &UserAuthProvider{
		UserID:         userID,
		Provider:       "orcid",
		ProviderUserID: providerUserID,
		ProviderData:   &providerDataJSON,
	}

	if err := h.service.CreateAuthProvider(authProvider); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to bind ORCID")
		return
	}

	utils.SuccessWithMessage(c, "ORCID account bound successfully", nil)
}

// UnbindOrcid handles ORCID account unbinding
func (h *Handler) UnbindOrcid(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}
	err := h.service.UnbindOrcid(userID)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error())
		return
	}
	utils.SuccessWithMessage(c, "ORCID account unbound successfully", nil)
}

// GetOrcidOAuthConfig helper
func (s *Service) GetOrcidOAuthConfig() (*model.OrcidOAuthConfig, error) {
	return s.configService.GetOrcidOAuthConfig()
}

// UnbindOrcid unbinds ORCID from user account
func (s *Service) UnbindOrcid(userID uint) error {
	return s.repo.UnbindProviderInTx(userID, "orcid")
}
