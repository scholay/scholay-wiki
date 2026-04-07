// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package user

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"time"

	"scholar-backend/internal/common/model"
	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

var googleHTTPClient = &http.Client{
	Timeout: 10 * time.Second,
	Transport: &http.Transport{
		MaxIdleConns:        20,
		MaxIdleConnsPerHost: 10,
		IdleConnTimeout:     90 * time.Second,
	},
}

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
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to get Google OAuth config")
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
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to get Google OAuth config")
		return
	}

	if googleConfig == nil || googleConfig.ClientID == "" || !googleConfig.Enabled {
		utils.ErrorResponse(c, http.StatusServiceUnavailable, "Google login is not configured")
		return
	}

	// Verify the ID token with Google
	tokenInfo, err := verifyGoogleIDToken(req.IDToken)
	if err != nil {
		slog.Error("google oauth: failed to verify ID token", "err", err)
		utils.ErrorResponse(c, http.StatusUnauthorized, "Invalid Google ID token")
		return
	}

	// Verify the audience matches our Client ID
	if tokenInfo.Aud != googleConfig.ClientID {
		slog.Error("google oauth: audience mismatch", "expected", googleConfig.ClientID, "got", tokenInfo.Aud)
		utils.ErrorResponse(c, http.StatusUnauthorized, "Token audience mismatch")
		return
	}

	// Find or create user
	ip := c.ClientIP()
	user, isNewUser, err := h.findOrCreateGoogleUser(tokenInfo, ip)
	if err != nil {
		slog.Error("google oauth: failed to process user", "err", err)
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to process Google login")
		return
	}

	// Generate JWT token
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

	// Update last login time and IP
	_ = h.service.UpdateLastLoginWithIP(user.ID, ip)

	// Create session
	userAgent := c.GetHeader("User-Agent")
	_ = h.service.CreateSession(user.ID, token, ip, userAgent, 30*24*time.Hour)

	utils.SuccessResponse(c, http.StatusOK, "success", gin.H{
		"token":       token,
		"user":        user,
		"is_new_user": isNewUser,
	})
}

// verifyGoogleIDToken verifies a Google ID token using Google's tokeninfo endpoint
func verifyGoogleIDToken(idToken string) (*GoogleTokenInfo, error) {
	resp, err := googleHTTPClient.Get("https://oauth2.googleapis.com/tokeninfo?id_token=" + idToken)
	if err != nil {
		return nil, fmt.Errorf("failed to call tokeninfo: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read tokeninfo response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("tokeninfo returned %d: %s", resp.StatusCode, string(body))
	}

	var info GoogleTokenInfo
	if err := json.Unmarshal(body, &info); err != nil {
		return nil, fmt.Errorf("failed to parse tokeninfo: %w", err)
	}

	// Verify issuer
	if info.Iss != "accounts.google.com" && info.Iss != "https://accounts.google.com" {
		return nil, fmt.Errorf("invalid issuer: %s", info.Iss)
	}

	return &info, nil
}

// findOrCreateGoogleUser finds an existing user or creates a new one from Google token info
func (h *Handler) findOrCreateGoogleUser(tokenInfo *GoogleTokenInfo, ip string) (*User, bool, error) {
	providerUserID := tokenInfo.Sub

	// Check if user already exists with this Google ID
	authProvider, err := h.service.FindAuthProvider("google", providerUserID)
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, false, fmt.Errorf("find auth provider: %w", err)
	}

	if authProvider != nil {
		user, err := h.service.FindByID(authProvider.UserID)
		if err != nil {
			return nil, false, fmt.Errorf("find user by id: %w", err)
		}
		// Update avatar if changed
		if tokenInfo.Picture != "" && (user.AvatarURL == nil || *user.AvatarURL == "") {
			user.AvatarURL = &tokenInfo.Picture
			_ = h.service.UpdateUser(user)
		}
		return user, false, nil
	}

	// Check if email already exists
	var user *User
	if tokenInfo.Email != "" {
		found, err := h.service.FindByEmail(tokenInfo.Email)
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, false, fmt.Errorf("find user by email: %w", err)
		}
		user = found
	}

	isNewUser := false

	if user == nil {
		isNewUser = true

		// Generate username from Google name or email
		username := tokenInfo.Name
		if username == "" {
			username = tokenInfo.GivenName
		}
		if username == "" && tokenInfo.Email != "" {
			parts := splitEmail(tokenInfo.Email)
			username = parts
		}
		if username == "" {
			username = "google_user"
		}

		// Ensure username is unique
		existingUser, err := h.service.FindByUsername(username)
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, false, fmt.Errorf("check username uniqueness: %w", err)
		}
		if existingUser != nil {
			username = fmt.Sprintf("%s_%d", username, time.Now().Unix())
		}

		email := tokenInfo.Email
		avatarURL := tokenInfo.Picture
		emailVerified := tokenInfo.EmailVerified == "true"

		user = &User{
			Username:      &username,
			Email:         &email,
			AvatarURL:     &avatarURL,
			Role:          "user",
			Status:        1,
			EmailVerified: emailVerified,
		}

		if err := h.service.CreateUser(user); err != nil {
			return nil, false, err
		}

		go h.service.SendWelcomeMessage(user.ID)
	}

	// Create auth provider link
	providerData := map[string]string{
		"name":    tokenInfo.Name,
		"email":   tokenInfo.Email,
		"picture": tokenInfo.Picture,
	}
	providerDataBytes, _ := json.Marshal(providerData)
	providerDataJSON := string(providerDataBytes)

	authProvider = &UserAuthProvider{
		UserID:         user.ID,
		Provider:       "google",
		ProviderUserID: providerUserID,
		ProviderData:   &providerDataJSON,
	}

	if err := h.service.CreateAuthProvider(authProvider); err != nil {
		return nil, isNewUser, err
	}

	return user, isNewUser, nil
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
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Unauthorized(c, "User not authenticated")
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
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to get Google OAuth config")
		return
	}

	if googleConfig == nil || googleConfig.ClientID == "" || !googleConfig.Enabled {
		utils.ErrorResponse(c, http.StatusServiceUnavailable, "Google login is not configured")
		return
	}

	// Verify ID token
	tokenInfo, err := verifyGoogleIDToken(req.IDToken)
	if err != nil {
		slog.Error("google bind: failed to verify ID token", "err", err)
		utils.ErrorResponse(c, http.StatusUnauthorized, "Invalid Google ID token")
		return
	}

	if tokenInfo.Aud != googleConfig.ClientID {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Token audience mismatch")
		return
	}

	// Bind Google to user
	err = h.bindGoogleToUser(userID.(uint), tokenInfo)
	if err != nil {
		slog.Error("google bind: failed to bind", "err", err)
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error())
		return
	}

	utils.SuccessWithMessage(c, "Google account bound successfully", nil)
}

// bindGoogleToUser binds a Google account to an existing user
func (h *Handler) bindGoogleToUser(userID uint, tokenInfo *GoogleTokenInfo) error {
	providerUserID := tokenInfo.Sub

	// Check if this Google account is already bound to another user
	existing, err := h.service.FindAuthProvider("google", providerUserID)
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return fmt.Errorf("failed to check existing binding: %w", err)
	}
	if existing != nil {
		if existing.UserID == userID {
			return fmt.Errorf("this Google account is already bound to your account")
		}
		return fmt.Errorf("this Google account is already bound to another user")
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
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Unauthorized(c, "User not authenticated")
		return
	}

	err := h.service.UnbindGoogle(userID.(uint))
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error())
		return
	}

	utils.SuccessWithMessage(c, "Google account unbound successfully", nil)
}

// GetGoogleOAuthConfig is a helper to get config from service (for use in handler)
func (s *Service) GetGoogleOAuthConfig() (*model.GoogleOAuthConfig, error) {
	return s.configService.GetGoogleOAuthConfig()
}
