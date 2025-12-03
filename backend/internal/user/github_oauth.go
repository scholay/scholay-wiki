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
	"net/http"
	"net/url"
	"scholar-backend/internal/common/model"
	"scholar-backend/internal/common/utils"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// GithubUser represents GitHub user info from API
type GithubUser struct {
	ID        int64  `json:"id"`
	Login     string `json:"login"`
	Name      string `json:"name"`
	Email     string `json:"email"`
	AvatarURL string `json:"avatar_url"`
	Bio       string `json:"bio"`
	Location  string `json:"location"`
	Blog      string `json:"blog"`
}

// GithubTokenResponse represents GitHub OAuth token response
type GithubTokenResponse struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
	Scope       string `json:"scope"`
}

// GetGithubLoginURL generates GitHub OAuth login URL
func (h *Handler) GetGithubLoginURL(c *gin.Context) {
	// Get GitHub OAuth config from dedicated table
	githubConfig, err := h.configRepo.GetGithubOAuthConfig()
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to get GitHub OAuth config")
		return
	}

	if githubConfig == nil || githubConfig.ClientID == "" {
		utils.ErrorResponse(c, http.StatusServiceUnavailable, "GitHub login is not configured. Please configure Client ID in admin settings.")
		return
	}

	// Use configured redirect URI or fallback to default
	redirectURI := githubConfig.RedirectURI
	if redirectURI == "" {
		// Get origin from request header
		origin := c.GetHeader("Origin")
		if origin == "" {
			origin = c.GetHeader("Referer")
		}
		if origin != "" {
			redirectURI = origin + "/github/callback"
		} else {
			utils.ErrorResponse(c, http.StatusServiceUnavailable, "GitHub redirect URI is not configured")
			return
		}
	}

	// Generate state token for CSRF protection
	state := utils.GenerateRandomString(32)

	// Build GitHub OAuth URL
	authURL := fmt.Sprintf(
		"https://github.com/login/oauth/authorize?client_id=%s&redirect_uri=%s&state=%s&scope=user:email",
		url.QueryEscape(githubConfig.ClientID),
		url.QueryEscape(redirectURI),
		state,
	)

	utils.SuccessResponse(c, http.StatusOK, "success", gin.H{
		"url":   authURL,
		"state": state,
	})
}

// GithubCallback handles GitHub OAuth callback
func (h *Handler) GithubCallback(c *gin.Context) {
	code := c.Query("code")
	// state parameter is validated by frontend
	// state := c.Query("state")
	invitationCode := c.Query("invitation_code") // 获取邀请码参数

	if code == "" {
		utils.ErrorResponse(c, http.StatusBadRequest, "Authorization code is required")
		return
	}

	// Get GitHub OAuth config
	githubConfig, err := h.configRepo.GetGithubOAuthConfig()
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to get GitHub OAuth config")
		return
	}

	if githubConfig == nil || githubConfig.ClientID == "" || githubConfig.ClientSecret == "" {
		utils.ErrorResponse(c, http.StatusServiceUnavailable, "GitHub login is not configured properly")
		return
	}

	// Exchange code for access token
	accessToken, err := h.exchangeGithubCode(code, githubConfig)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, fmt.Sprintf("Failed to exchange code: %v", err))
		return
	}

	// Get user info from GitHub
	githubUser, err := h.getGithubUserInfo(accessToken)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, fmt.Sprintf("Failed to get user info: %v", err))
		return
	}

	// Find or create user (with invitation code support)
	ip := c.ClientIP()
	user, isNewUser, err := h.findOrCreateGithubUser(githubUser, invitationCode, ip)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, fmt.Sprintf("Failed to process user: %v", err))
		return
	}

	// Generate JWT token
	username := ""
	if user.Username != nil {
		username = *user.Username
	}
	token, err := utils.GenerateToken(user.ID, username, "user")
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to generate token")
		return
	}

	// Update last login time and IP
	_ = h.userRepo.UpdateLastLoginWithIP(user.ID, ip)

	utils.SuccessResponse(c, http.StatusOK, "success", gin.H{
		"token":       token,
		"user":        user,
		"is_new_user": isNewUser,
	})
}

// exchangeGithubCode exchanges authorization code for access token
func (h *Handler) exchangeGithubCode(code string, config *model.GithubOAuthConfig) (string, error) {
	data := url.Values{}
	data.Set("client_id", config.ClientID)
	data.Set("client_secret", config.ClientSecret)
	data.Set("code", code)
	data.Set("redirect_uri", config.RedirectURI)

	req, err := http.NewRequestWithContext(
		context.Background(),
		"POST",
		"https://github.com/login/oauth/access_token",
		strings.NewReader(data.Encode()),
	)
	if err != nil {
		return "", err
	}

	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("github token exchange failed: %s", string(body))
	}

	var tokenResp GithubTokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		return "", err
	}

	return tokenResp.AccessToken, nil
}

// getGithubUserInfo gets user info from GitHub API
func (h *Handler) getGithubUserInfo(accessToken string) (*GithubUser, error) {
	req, err := http.NewRequestWithContext(
		context.Background(),
		"GET",
		"https://api.github.com/user",
		nil,
	)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/vnd.github.v3+json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("github user info failed: %s", string(body))
	}

	var githubUser GithubUser
	if err := json.NewDecoder(resp.Body).Decode(&githubUser); err != nil {
		return nil, err
	}

	// If primary email is not public, fetch it from emails endpoint
	if githubUser.Email == "" {
		email, err := h.getGithubUserEmail(accessToken)
		if err == nil && email != "" {
			githubUser.Email = email
		}
	}

	return &githubUser, nil
}

// getGithubUserEmail fetches user's primary email from GitHub
func (h *Handler) getGithubUserEmail(accessToken string) (string, error) {
	req, err := http.NewRequestWithContext(
		context.Background(),
		"GET",
		"https://api.github.com/user/emails",
		nil,
	)
	if err != nil {
		return "", err
	}

	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/vnd.github.v3+json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("failed to get emails")
	}

	var emails []struct {
		Email    string `json:"email"`
		Primary  bool   `json:"primary"`
		Verified bool   `json:"verified"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&emails); err != nil {
		return "", err
	}

	// Find primary verified email
	for _, email := range emails {
		if email.Primary && email.Verified {
			return email.Email, nil
		}
	}

	// Fallback to first verified email
	for _, email := range emails {
		if email.Verified {
			return email.Email, nil
		}
	}

	return "", fmt.Errorf("no verified email found")
}

// findOrCreateGithubUser finds existing user or creates new one
func (h *Handler) findOrCreateGithubUser(githubUser *GithubUser, invitationCode string, ip string) (*User, bool, error) {
	// Check if user already exists with this GitHub ID
	providerUserID := fmt.Sprintf("%d", githubUser.ID)
	authProvider, err := h.userRepo.FindAuthProvider("github", providerUserID)

	if err != nil && err != gorm.ErrRecordNotFound {
		return nil, false, err
	}

	// User exists, return it
	if authProvider != nil {
		user, err := h.userRepo.FindByID(authProvider.UserID)
		if err != nil {
			return nil, false, err
		}
		return user, false, nil
	}

	// New user - check if email already exists
	var user *User
	if githubUser.Email != "" {
		user, _ = h.userRepo.FindByEmail(githubUser.Email)
	}

	isNewUser := false

	// Create new user if doesn't exist
	if user == nil {
		isNewUser = true

		// Generate username from GitHub login
		username := githubUser.Login
		// Ensure username is unique
		existingUser, _ := h.userRepo.FindByUsername(username)
		if existingUser != nil {
			username = fmt.Sprintf("%s_%d", username, time.Now().Unix())
		}

		email := githubUser.Email
		avatarURL := githubUser.AvatarURL
		bio := githubUser.Bio

		user = &User{
			Username:      &username,
			Email:         &email,
			AvatarURL:     &avatarURL,
			Bio:           &bio,
			Status:        1,
			EmailVerified: githubUser.Email != "", // GitHub emails are already verified
		}

		if err := h.userRepo.Create(user); err != nil {
			return nil, false, err
		}

		// 处理邀请码 - 如果是新用户且有邀请码
		if invitationCode != "" {
			if err := h.service.ProcessInvitationForOAuth(user.ID, invitationCode, ip); err != nil {
				// 邀请码处理失败不影响注册，只记录日志
				fmt.Printf("Failed to process invitation code for GitHub user %d: %v\n", user.ID, err)
			}
		}

		// 发放注册自动折扣券给新用户
		if h.service.GetCouponService() != nil {
			go func(uid uint) {
				_ = h.service.GetCouponService().DistributeRegisterCoupons(uint64(uid))
			}(user.ID)
		}
		// Note: last login time and IP will be updated in GithubCallback after this function returns
	}
	// Note: last login time and IP will be updated in GithubCallback after this function returns

	// Create auth provider link
	providerDataJSON := fmt.Sprintf(`{"login":"%s","name":"%s","avatar_url":"%s"}`,
		githubUser.Login, githubUser.Name, githubUser.AvatarURL)

	authProvider = &UserAuthProvider{
		UserID:         user.ID,
		Provider:       "github",
		ProviderUserID: providerUserID,
		ProviderData:   &providerDataJSON,
	}

	if err := h.userRepo.CreateAuthProvider(authProvider); err != nil {
		return nil, isNewUser, err
	}

	return user, isNewUser, nil
}

// BindGitHubRequest represents GitHub account binding request
type BindGitHubRequest struct {
	Code  string `json:"code" binding:"required"`
	State string `json:"state" binding:"required"`
}

// BindGitHubAccount handles GitHub account binding for existing users
func (h *Handler) BindGitHubAccount(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Unauthorized(c, "User not authenticated")
		return
	}

	var req BindGitHubRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	// Get GitHub OAuth config
	githubConfig, err := h.configRepo.GetGithubOAuthConfig()
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to get GitHub OAuth config")
		return
	}

	if githubConfig == nil || githubConfig.ClientID == "" || githubConfig.ClientSecret == "" {
		utils.ErrorResponse(c, http.StatusServiceUnavailable, "GitHub login is not configured properly")
		return
	}

	// Exchange code for access token
	accessToken, err := h.exchangeGithubCode(req.Code, githubConfig)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, fmt.Sprintf("Failed to exchange code: %v", err))
		return
	}

	// Get GitHub user info
	githubUser, err := h.getGithubUserInfo(accessToken)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, fmt.Sprintf("Failed to get user info: %v", err))
		return
	}

	// Bind GitHub to current user
	if err := h.bindGitHubToUser(userID.(uint), githubUser); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, fmt.Sprintf("Failed to bind GitHub: %v", err))
		return
	}

	utils.SuccessWithMessage(c, "GitHub account bound successfully", nil)
}

// bindGitHubToUser binds a GitHub account to an existing user
func (h *Handler) bindGitHubToUser(userID uint, githubUser *GithubUser) error {
	// Check if GitHub is already bound to another user
	providerUserID := fmt.Sprintf("%d", githubUser.ID)
	existing, err := h.userRepo.FindAuthProvider("github", providerUserID)

	if err != nil && err != gorm.ErrRecordNotFound {
		return err
	}

	if existing != nil && existing.UserID != userID {
		return errors.New("该 GitHub 账号已被其他账号绑定")
	}

	// Get current user
	user, err := h.userRepo.FindByID(userID)
	if err != nil {
		return err
	}

	if user == nil {
		return errors.New("user not found")
	}

	// Update username and avatar if not set
	if user.Username == nil || *user.Username == "" {
		username := githubUser.Login
		user.Username = &username
	}
	if user.AvatarURL == nil || *user.AvatarURL == "" {
		user.AvatarURL = &githubUser.AvatarURL
	}

	if err := h.userRepo.Update(user); err != nil {
		return err
	}

	// Create or update auth provider entry
	authProvider, err := h.userRepo.FindAuthProviderByUserAndProvider(userID, "github")
	if err != nil && err != gorm.ErrRecordNotFound {
		return err
	}

	providerDataJSON := fmt.Sprintf(`{"login":"%s","name":"%s","avatar_url":"%s"}`,
		githubUser.Login, githubUser.Name, githubUser.AvatarURL)

	if authProvider == nil {
		// Create new auth provider
		authProvider = &UserAuthProvider{
			UserID:         userID,
			Provider:       "github",
			ProviderUserID: providerUserID,
			ProviderData:   &providerDataJSON,
		}
		if err := h.userRepo.CreateAuthProvider(authProvider); err != nil {
			return err
		}
	} else {
		// Update existing auth provider
		authProvider.ProviderUserID = providerUserID
		authProvider.ProviderData = &providerDataJSON
		if err := h.userRepo.UpdateAuthProvider(authProvider); err != nil {
			return err
		}
	}

	return nil
}
