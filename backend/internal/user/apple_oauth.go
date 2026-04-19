// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package user

import (
	"context"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"scholar-backend/internal/common/cache"
	"scholar-backend/internal/common/httpclient"
	"scholar-backend/internal/common/model"
	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"gorm.io/gorm"
)

var appleHTTPClient = httpclient.OAuthClient

const (
	appleAuthURL  = "https://appleid.apple.com/auth/authorize"
	appleTokenURL = "https://appleid.apple.com/auth/token"
	appleKeysURL  = "https://appleid.apple.com/auth/keys"
)

// AppleIDTokenClaims represents claims in Apple's ID token
type AppleIDTokenClaims struct {
	jwt.RegisteredClaims
	Email         string `json:"email"`
	EmailVerified any    `json:"email_verified"` // can be bool or string
	IsPrivateEmail any   `json:"is_private_email"` // can be bool or string
}

// AppleUserInfo represents the user info Apple sends on first authorization
type AppleUserInfo struct {
	Name *struct {
		FirstName string `json:"firstName"`
		LastName  string `json:"lastName"`
	} `json:"name"`
	Email string `json:"email"`
}

// GetAppleLoginURL generates Apple Sign In URL
func (h *Handler) GetAppleLoginURL(c *gin.Context) {
	appleConfig, err := h.service.GetAppleOAuthConfig()
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to get Apple OAuth config")
		return
	}
	if appleConfig == nil || appleConfig.ServiceID == "" || !appleConfig.Enabled {
		utils.ErrorResponse(c, http.StatusServiceUnavailable, "Apple login is not configured")
		return
	}

	state := generateRandomState()
	rdb := cache.GetRedis()
	if rdb != nil {
		rdb.Set(c.Request.Context(), "apple_oauth_state:"+state, "1", 5*time.Minute)
	}

	oauthURL := fmt.Sprintf("%s?client_id=%s&response_type=code%%20id_token&redirect_uri=%s&scope=name%%20email&state=%s&response_mode=form_post",
		appleAuthURL,
		url.QueryEscape(appleConfig.ServiceID),
		url.QueryEscape(appleConfig.RedirectURI),
		url.QueryEscape(state),
	)

	utils.Success(c, gin.H{
		"url":   oauthURL,
		"state": state,
	})
}

// AppleCallback handles Apple Sign In callback
// Apple sends POST with form_post response mode
func (h *Handler) AppleCallback(c *gin.Context) {
	// Apple sends data as POST form
	code := c.PostForm("code")
	state := c.PostForm("state")
	idTokenStr := c.PostForm("id_token")
	userJSON := c.PostForm("user") // Only present on first authorization

	if code == "" || state == "" {
		// Try query params as fallback
		code = c.Query("code")
		state = c.Query("state")
	}

	if code == "" || state == "" {
		utils.BadRequest(c, "Missing code or state parameter")
		return
	}

	// Verify state
	rdb := cache.GetRedis()
	if rdb != nil {
		val, err := rdb.Get(c.Request.Context(), "apple_oauth_state:"+state).Result()
		if err != nil || val == "" {
			utils.ErrorResponse(c, http.StatusBadRequest, "Invalid or expired state")
			return
		}
		rdb.Del(c.Request.Context(), "apple_oauth_state:"+state)
	}

	appleConfig, err := h.service.GetAppleOAuthConfig()
	if err != nil || appleConfig == nil || !appleConfig.Enabled {
		utils.ErrorResponse(c, http.StatusServiceUnavailable, "Apple login is not configured")
		return
	}

	// Generate client_secret JWT
	clientSecret, err := generateAppleClientSecret(appleConfig)
	if err != nil {
		slog.Error("apple oauth: failed to generate client secret", "err", err)
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to generate client secret")
		return
	}

	// Exchange code for tokens
	tokenResp, err := exchangeAppleCode(c.Request.Context(), code, appleConfig, clientSecret)
	if err != nil {
		slog.Error("apple oauth: failed to exchange code", "err", err)
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to exchange authorization code")
		return
	}

	// Parse ID token to get user info
	// Use the id_token from token response (or from the callback if available)
	idToken := tokenResp.IDToken
	if idToken == "" {
		idToken = idTokenStr
	}

	if idToken == "" {
		utils.ErrorResponse(c, http.StatusInternalServerError, "No ID token received from Apple")
		return
	}

	// Parse claims without verification (Apple's id_token is already verified via the token exchange)
	claims, err := parseAppleIDToken(idToken)
	if err != nil {
		slog.Error("apple oauth: failed to parse ID token", "err", err)
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to parse Apple ID token")
		return
	}

	// Parse user info (only available on first authorization)
	var appleUser *AppleUserInfo
	if userJSON != "" {
		appleUser = &AppleUserInfo{}
		if err := json.Unmarshal([]byte(userJSON), appleUser); err != nil {
			slog.Warn("apple oauth: failed to parse user info", "err", err)
			appleUser = nil
		}
	}

	// Find or create user
	ip := c.ClientIP()
	user, isNewUser, err := h.findOrCreateAppleUser(claims, appleUser, ip)
	if err != nil {
		slog.Error("apple oauth: failed to process user", "err", err)
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to process Apple login")
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

	// Apple uses form_post, so we redirect with token in URL fragment
	// Frontend will pick it up from URL params
	redirectURL := appleConfig.RedirectURI
	// Strip /apple/callback to get base URL, then redirect to a page that handles the token
	baseURL := strings.TrimSuffix(redirectURL, "/apple/callback")
	resultURL := fmt.Sprintf("%s/apple/callback?token=%s&is_new_user=%v&state=%s",
		baseURL, url.QueryEscape(token), isNewUser, url.QueryEscape(state))

	c.Redirect(http.StatusFound, resultURL)
}

// AppleTokenResponse represents Apple's token endpoint response
type AppleTokenResponse struct {
	AccessToken  string `json:"access_token"`
	TokenType    string `json:"token_type"`
	ExpiresIn    int    `json:"expires_in"`
	RefreshToken string `json:"refresh_token"`
	IDToken      string `json:"id_token"`
}

func generateAppleClientSecret(config *model.AppleOAuthConfig) (string, error) {
	block, _ := pem.Decode([]byte(config.PrivateKey))
	if block == nil {
		return "", fmt.Errorf("failed to decode PEM block")
	}

	key, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		// Try EC private key format
		key, err = x509.ParseECPrivateKey(block.Bytes)
		if err != nil {
			return "", fmt.Errorf("failed to parse private key: %w", err)
		}
	}

	now := time.Now()
	claims := jwt.MapClaims{
		"iss": config.TeamID,
		"iat": now.Unix(),
		"exp": now.Add(5 * time.Minute).Unix(),
		"aud": "https://appleid.apple.com",
		"sub": config.ServiceID,
	}

	token := jwt.NewWithClaims(jwt.SigningMethodES256, claims)
	token.Header["kid"] = config.KeyID

	return token.SignedString(key)
}

func exchangeAppleCode(ctx context.Context, code string, config *model.AppleOAuthConfig, clientSecret string) (*AppleTokenResponse, error) {
	data := url.Values{}
	data.Set("client_id", config.ServiceID)
	data.Set("client_secret", clientSecret)
	data.Set("code", code)
	data.Set("grant_type", "authorization_code")
	data.Set("redirect_uri", config.RedirectURI)

	req, err := http.NewRequestWithContext(ctx, "POST", appleTokenURL, strings.NewReader(data.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := appleHTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("apple token exchange failed (%d): %s", resp.StatusCode, string(body))
	}

	var tokenResp AppleTokenResponse
	if err := json.Unmarshal(body, &tokenResp); err != nil {
		return nil, err
	}

	return &tokenResp, nil
}

func parseAppleIDToken(idToken string) (*AppleIDTokenClaims, error) {
	// Parse without verification - the token was obtained directly from Apple's token endpoint
	parser := jwt.NewParser(jwt.WithoutClaimsValidation())
	token, _, err := parser.ParseUnverified(idToken, &AppleIDTokenClaims{})
	if err != nil {
		return nil, fmt.Errorf("failed to parse ID token: %w", err)
	}

	claims, ok := token.Claims.(*AppleIDTokenClaims)
	if !ok {
		return nil, fmt.Errorf("invalid claims type")
	}

	return claims, nil
}

func (h *Handler) findOrCreateAppleUser(claims *AppleIDTokenClaims, appleUser *AppleUserInfo, ip string) (*User, bool, error) {
	providerUserID := claims.Subject // Apple's unique user ID

	authProvider, err := h.service.FindAuthProvider("apple", providerUserID)
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

	// Get email
	email := claims.Email
	if email == "" && appleUser != nil {
		email = appleUser.Email
	}

	// Check if email already exists
	var user *User
	if email != "" {
		found, err := h.service.FindByEmail(email)
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, false, err
		}
		user = found
	}

	isNewUser := false

	if user == nil {
		isNewUser = true

		// Build username from Apple user info (only available on first auth)
		username := ""
		if appleUser != nil && appleUser.Name != nil {
			parts := []string{}
			if appleUser.Name.FirstName != "" {
				parts = append(parts, appleUser.Name.FirstName)
			}
			if appleUser.Name.LastName != "" {
				parts = append(parts, appleUser.Name.LastName)
			}
			username = strings.Join(parts, " ")
		}
		if username == "" && email != "" {
			username = splitEmail(email)
		}
		if username == "" {
			username = "apple_user"
		}

		existingUser, err := h.service.FindByUsername(username)
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, false, err
		}
		if existingUser != nil {
			username = fmt.Sprintf("%s_%d", username, time.Now().Unix())
		}

		emailVerified := false
		switch v := claims.EmailVerified.(type) {
		case bool:
			emailVerified = v
		case string:
			emailVerified = v == "true"
		}

		user = &User{
			Username:      &username,
			Email:         &email,
			Role:          "user",
			Status:        1,
			EmailVerified: emailVerified,
		}

		if err := h.service.CreateUser(user); err != nil {
			return nil, false, err
		}

		go h.service.SendWelcomeMessage(user.ID)
	}

	providerData := map[string]string{
		"email": email,
	}
	if appleUser != nil && appleUser.Name != nil {
		providerData["first_name"] = appleUser.Name.FirstName
		providerData["last_name"] = appleUser.Name.LastName
	}
	providerDataBytes, _ := json.Marshal(providerData)
	providerDataJSON := string(providerDataBytes)

	authProvider = &UserAuthProvider{
		UserID:         user.ID,
		Provider:       "apple",
		ProviderUserID: providerUserID,
		ProviderData:   &providerDataJSON,
	}

	if err := h.service.CreateAuthProvider(authProvider); err != nil {
		return nil, isNewUser, err
	}

	return user, isNewUser, nil
}

// BindAppleAccount handles Apple account binding
func (h *Handler) BindAppleAccount(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	var req struct {
		Code  string `json:"code" binding:"required"`
		IDToken string `json:"id_token"`
		User  string `json:"user"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request")
		return
	}

	appleConfig, err := h.service.GetAppleOAuthConfig()
	if err != nil || appleConfig == nil || !appleConfig.Enabled {
		utils.ErrorResponse(c, http.StatusServiceUnavailable, "Apple login is not configured")
		return
	}

	clientSecret, err := generateAppleClientSecret(appleConfig)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to generate client secret")
		return
	}

	tokenResp, err := exchangeAppleCode(c.Request.Context(), req.Code, appleConfig, clientSecret)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to exchange code")
		return
	}

	idToken := tokenResp.IDToken
	if idToken == "" {
		idToken = req.IDToken
	}

	claims, err := parseAppleIDToken(idToken)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to parse Apple ID token")
		return
	}

	providerUserID := claims.Subject

	existing, err := h.service.FindAuthProvider("apple", providerUserID)
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to check binding")
		return
	}
	if existing != nil {
		if existing.UserID == userID {
			utils.ErrorResponse(c, http.StatusBadRequest, "This Apple account is already bound to your account")
		} else {
			utils.ErrorResponse(c, http.StatusBadRequest, "This Apple account is already bound to another user")
		}
		return
	}

	providerData := map[string]string{"email": claims.Email}
	providerDataBytes, _ := json.Marshal(providerData)
	providerDataJSON := string(providerDataBytes)

	authProvider := &UserAuthProvider{
		UserID:         userID,
		Provider:       "apple",
		ProviderUserID: providerUserID,
		ProviderData:   &providerDataJSON,
	}

	if err := h.service.CreateAuthProvider(authProvider); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to bind Apple account")
		return
	}

	utils.SuccessWithMessage(c, "Apple account bound successfully", nil)
}

// UnbindApple handles Apple account unbinding
func (h *Handler) UnbindApple(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}
	err := h.service.UnbindApple(userID)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error())
		return
	}
	utils.SuccessWithMessage(c, "Apple account unbound successfully", nil)
}

// Service helpers
func (s *Service) GetAppleOAuthConfig() (*model.AppleOAuthConfig, error) {
	return s.configService.GetAppleOAuthConfig()
}

func (s *Service) UnbindApple(userID uint) error {
	return s.repo.UnbindProviderInTx(userID, "apple")
}

