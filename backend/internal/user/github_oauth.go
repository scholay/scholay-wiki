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
	"strings"

	"scholar-backend/internal/common/model"
	"scholar-backend/internal/common/upstream"
	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

var githubUpstream = newOAuthUpstream("github_oauth")

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
	githubConfig, err := h.service.GetGithubOAuthConfig()
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "加载 GitHub 登录配置失败,请稍后重试")
		return
	}

	if githubConfig == nil || githubConfig.ClientID == "" {
		utils.ErrorResponse(c, http.StatusServiceUnavailable, "GitHub 登录尚未配置,请联系管理员")
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
			utils.ErrorResponse(c, http.StatusServiceUnavailable, "GitHub 回调地址未配置,请联系管理员")
			return
		}
	}

	// Generate state token for CSRF protection and store in Redis
	state := issueOAuthState(c, "oauth_state:")

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
	state := c.Query("state")
	invitationCode := c.Query("invitation_code")

	// 必须同时要求 code 与 state —— GetGithubLoginURL 永远下发 state,不存在合法的无 state 流程。
	// validateOAuthState 对空 state 返回 true(为兼容某些 mobile 流),故空 state 必须在此显式预拒,
	// 否则攻击者直接不带 state 即绕过 CSRF 校验(登录 CSRF / 账号绑定攻击)。与 microsoft/orcid/apple 对齐。
	if code == "" || state == "" {
		utils.ErrorResponse(c, http.StatusBadRequest, "授权码或 state 缺失,请重新发起登录")
		return
	}

	// Server-side state validation to prevent CSRF/OAuth account binding attacks
	if !validateOAuthState(c, "oauth_state:", state) {
		utils.ErrorResponse(c, http.StatusBadRequest, "会话已过期,请重新发起登录")
		return
	}

	// Get GitHub OAuth config
	githubConfig, err := h.service.GetGithubOAuthConfig()
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "加载 GitHub 登录配置失败,请稍后重试")
		return
	}

	if githubConfig == nil || githubConfig.ClientID == "" || githubConfig.ClientSecret == "" {
		utils.ErrorResponse(c, http.StatusServiceUnavailable, "GitHub 登录未配置或不可用")
		return
	}

	// Exchange code for access token
	accessToken, err := h.exchangeGithubCode(c.Request.Context(), code, githubConfig)
	if err != nil {
		slog.Error("github oauth: failed to exchange code", "err", err)
		utils.ErrorResponse(c, http.StatusInternalServerError, "获取访问令牌失败,请重试")
		return
	}

	// Get user info from GitHub
	githubUser, err := h.getGithubUserInfo(c.Request.Context(), accessToken)
	if err != nil {
		slog.Error("github oauth: failed to get user info", "err", err)
		utils.ErrorResponse(c, http.StatusInternalServerError, "获取 GitHub 用户信息失败,请重试")
		return
	}

	// Find or create user (with invitation code support).
	// 注意:可能返回三种结果之一 —— 直接登录 / 新建 / 需要合并确认。
	ip := c.ClientIP()
	outcome, err := h.findOrCreateGithubUser(c.Request.Context(), githubUser, invitationCode, ip)
	if err != nil {
		slog.Error("github oauth: failed to process user", "err", err)
		utils.ErrorResponse(c, http.StatusInternalServerError, "GitHub 登录处理失败,请稍后重试")
		return
	}

	// 分支 A:email 冲突 → 让前端走合并确认页
	if outcome.MergeToken != "" {
		targetEmail := ""
		if outcome.User != nil && outcome.User.Email != nil {
			targetEmail = *outcome.User.Email
		} else {
			targetEmail = githubUser.Email // fallback
		}
		respondOAuthPendingMerge(c, outcome.MergeToken, "github", targetEmail)
		return
	}

	// 分支 B:常规登录 / 新建,签发 token
	token, err := issueTokenAndSession(h, c, outcome.User, ip)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "签发登录凭证失败,请重试")
		return
	}

	respondOAuthSuccess(c, token, outcome.User, outcome.IsNewUser)
}

// exchangeGithubCode exchanges authorization code for access token
func (h *Handler) exchangeGithubCode(ctx context.Context, code string, config *model.GithubOAuthConfig) (string, error) {
	data := url.Values{}
	data.Set("client_id", config.ClientID)
	data.Set("client_secret", config.ClientSecret)
	data.Set("code", code)
	data.Set("redirect_uri", config.RedirectURI)

	resp, err := githubUpstream.Do(ctx, upstream.Request{
		Method: http.MethodPost,
		Path:   "https://github.com/login/oauth/access_token",
		Headers: http.Header{
			"Content-Type": {"application/x-www-form-urlencoded"},
			"Accept":       {"application/json"},
		},
		Body: strings.NewReader(data.Encode()),
	})
	if err != nil {
		return "", err
	}

	var tokenResp GithubTokenResponse
	if err := resp.JSON(&tokenResp); err != nil {
		return "", err
	}

	return tokenResp.AccessToken, nil
}

// getGithubUserInfo gets user info from GitHub API
func (h *Handler) getGithubUserInfo(ctx context.Context, accessToken string) (*GithubUser, error) {
	resp, err := githubUpstream.Do(ctx, upstream.Request{
		Method: http.MethodGet,
		Path:   "https://api.github.com/user",
		Headers: http.Header{
			"Authorization": {"Bearer " + accessToken},
			"Accept":        {"application/vnd.github.v3+json"},
		},
	})
	if err != nil {
		return nil, err
	}

	var githubUser GithubUser
	if err := resp.JSON(&githubUser); err != nil {
		return nil, err
	}

	// If primary email is not public, fetch it from emails endpoint
	if githubUser.Email == "" {
		email, err := h.getGithubUserEmail(ctx, accessToken)
		if err == nil && email != "" {
			githubUser.Email = email
		}
	}

	return &githubUser, nil
}

// getGithubUserEmail fetches user's primary email from GitHub
func (h *Handler) getGithubUserEmail(ctx context.Context, accessToken string) (string, error) {
	resp, err := githubUpstream.Do(ctx, upstream.Request{
		Method: http.MethodGet,
		Path:   "https://api.github.com/user/emails",
		Headers: http.Header{
			"Authorization": {"Bearer " + accessToken},
			"Accept":        {"application/vnd.github.v3+json"},
		},
	})
	if err != nil {
		return "", err
	}

	var emails []struct {
		Email    string `json:"email"`
		Primary  bool   `json:"primary"`
		Verified bool   `json:"verified"`
	}

	if err := resp.JSON(&emails); err != nil {
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

// findOrCreateGithubUser GitHub OAuth identity → 走通用 findOrCreateOAuthUser 三态流程。
// 仅负责把 *GithubUser 转成 oauthIdentity,其余分发逻辑见 oauth_helpers.go。
func (h *Handler) findOrCreateGithubUser(ctx context.Context, githubUser *GithubUser, invitationCode string, ip string) (oauthOutcome, error) {
	_ = invitationCode // 邀请业务已移除,参数保留以兼容回调 URL
	_ = ip

	displayName := githubUser.Name
	if displayName == "" {
		displayName = githubUser.Login
	}
	return h.findOrCreateOAuthUser(ctx, oauthIdentity{
		Provider:          "github",
		ProviderUserID:    fmt.Sprintf("%d", githubUser.ID),
		Email:             githubUser.Email,
		EmailVerified:     true, // GitHub 返的 email 已经过验证(走 /user/emails 取的)
		UsernameCandidate: githubUser.Login,
		UsernameFallback:  "github_user",
		AvatarURL:         githubUser.AvatarURL,
		Bio:               githubUser.Bio,
		DisplayName:       displayName,
		ProviderDataExtras: map[string]string{
			"login":      githubUser.Login,
			"name":       githubUser.Name,
			"avatar_url": githubUser.AvatarURL,
		},
	})
}

// derefStr 解引用 *string,nil 时返回 ""(避免 callback 处一堆 if 判空)。
func derefStr(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

// BindGitHubRequest represents GitHub account binding request
type BindGitHubRequest struct {
	Code  string `json:"code" binding:"required"`
	State string `json:"state" binding:"required"`
}

// BindGitHubAccount handles GitHub account binding for existing users
func (h *Handler) BindGitHubAccount(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	var req BindGitHubRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	// Get GitHub OAuth config
	githubConfig, err := h.service.GetGithubOAuthConfig()
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "加载 GitHub 登录配置失败,请稍后重试")
		return
	}

	if githubConfig == nil || githubConfig.ClientID == "" || githubConfig.ClientSecret == "" {
		utils.ErrorResponse(c, http.StatusServiceUnavailable, "GitHub 登录未配置或不可用")
		return
	}

	// Exchange code for access token
	accessToken, err := h.exchangeGithubCode(c.Request.Context(), req.Code, githubConfig)
	if err != nil {
		slog.Error("github bind: failed to exchange code", "err", err)
		utils.ErrorResponse(c, http.StatusInternalServerError, "获取访问令牌失败,请重试")
		return
	}

	// Get GitHub user info
	githubUser, err := h.getGithubUserInfo(c.Request.Context(), accessToken)
	if err != nil {
		slog.Error("github bind: failed to get user info", "err", err)
		utils.ErrorResponse(c, http.StatusInternalServerError, "获取 GitHub 用户信息失败,请重试")
		return
	}

	// Bind GitHub to current user
	if err := h.bindGitHubToUser(userID, githubUser); err != nil {
		slog.Error("github bind: failed to bind account", "err", err, "user_id", userID)
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to bind GitHub account")
		return
	}

	utils.SuccessWithMessage(c, "GitHub account bound successfully", nil)
}

// bindGitHubToUser binds a GitHub account to an existing user
func (h *Handler) bindGitHubToUser(userID uint, githubUser *GithubUser) error {
	// 跨用户冲突校验收口到 oauthBindConflict(已绑到本人 → 走下面 create-or-update 幂等更新)。
	providerUserID := fmt.Sprintf("%d", githubUser.ID)
	if _, err := h.oauthBindConflict(userID, "github", providerUserID); err != nil {
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
		username := githubUser.Login
		user.Username = &username
	}
	if user.AvatarURL == nil || *user.AvatarURL == "" {
		user.AvatarURL = &githubUser.AvatarURL
	}

	if err := h.service.UpdateUser(user); err != nil {
		return err
	}

	// Create or update auth provider entry
	authProvider, err := h.service.FindAuthProviderByUserAndProvider(userID, "github")
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return fmt.Errorf("find auth provider by user: %w", err)
	}

	providerData := map[string]string{
		"login":      githubUser.Login,
		"name":       githubUser.Name,
		"avatar_url": githubUser.AvatarURL,
	}
	providerDataBytes, _ := json.Marshal(providerData)
	providerDataJSON := string(providerDataBytes)

	if authProvider == nil {
		// Create new auth provider
		authProvider = &UserAuthProvider{
			UserID:         userID,
			Provider:       "github",
			ProviderUserID: providerUserID,
			ProviderData:   &providerDataJSON,
		}
		if err := h.service.CreateAuthProvider(authProvider); err != nil {
			return err
		}
	} else {
		// Update existing auth provider
		authProvider.ProviderUserID = providerUserID
		authProvider.ProviderData = &providerDataJSON
		if err := h.service.UpdateAuthProvider(authProvider); err != nil {
			return err
		}
	}

	return nil
}
