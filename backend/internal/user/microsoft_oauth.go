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

var microsoftUpstream = newOAuthUpstream("microsoft_oauth")

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
		utils.ErrorResponse(c, http.StatusInternalServerError, "加载 Microsoft 登录配置失败,请稍后重试")
		return
	}
	if msConfig == nil || msConfig.ClientID == "" || !msConfig.Enabled {
		utils.ErrorResponse(c, http.StatusServiceUnavailable, "Microsoft 登录未配置或不可用")
		return
	}

	state := issueOAuthState(c, "microsoft_oauth_state:")

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
		utils.BadRequest(c, "授权参数不完整,请重新发起登录")
		return
	}

	if !validateOAuthState(c, "microsoft_oauth_state:", state) {
		utils.ErrorResponse(c, http.StatusBadRequest, "会话已过期,请重新发起登录")
		return
	}

	msConfig, err := h.service.GetMicrosoftOAuthConfig()
	if err != nil || msConfig == nil || !msConfig.Enabled {
		utils.ErrorResponse(c, http.StatusServiceUnavailable, "Microsoft 登录未配置或不可用")
		return
	}

	// Exchange code for token
	accessToken, err := h.exchangeMicrosoftCode(c.Request.Context(), code, msConfig)
	if err != nil {
		slog.Error("microsoft oauth: failed to exchange code", "err", err)
		utils.ErrorResponse(c, http.StatusInternalServerError, "获取访问令牌失败,请重试")
		return
	}

	// Get user info from Microsoft Graph
	msUser, err := h.getMicrosoftUserInfo(c.Request.Context(), accessToken)
	if err != nil {
		slog.Error("microsoft oauth: failed to get user info", "err", err)
		utils.ErrorResponse(c, http.StatusInternalServerError, "获取 Microsoft 用户信息失败,请重试")
		return
	}

	ip := c.ClientIP()
	outcome, err := h.findOrCreateMicrosoftUser(c.Request.Context(), msUser, ip)
	if err != nil {
		slog.Error("microsoft oauth: failed to process user", "err", err)
		utils.ErrorResponse(c, http.StatusInternalServerError, "Microsoft 登录处理失败,请稍后重试")
		return
	}

	if outcome.MergeToken != "" {
		respondOAuthPendingMerge(c, outcome.MergeToken, "microsoft", derefStr(outcome.User.Email))
		return
	}

	token, err := issueTokenAndSession(h, c, outcome.User, ip)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "签发登录凭证失败,请重试")
		return
	}
	respondOAuthSuccess(c, token, outcome.User, outcome.IsNewUser)
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

	resp, err := microsoftUpstream.Do(ctx, upstream.Request{
		Method:  http.MethodPost,
		Path:    tokenURL,
		Headers: http.Header{"Content-Type": {"application/x-www-form-urlencoded"}},
		Body:    strings.NewReader(data.Encode()),
	})
	if err != nil {
		return "", err
	}

	var tokenResp struct {
		AccessToken string `json:"access_token"`
	}
	if err := resp.JSON(&tokenResp); err != nil {
		return "", err
	}

	return tokenResp.AccessToken, nil
}

func (h *Handler) getMicrosoftUserInfo(ctx context.Context, accessToken string) (*MicrosoftUser, error) {
	resp, err := microsoftUpstream.Do(ctx, upstream.Request{
		Method:  http.MethodGet,
		Path:    "https://graph.microsoft.com/v1.0/me",
		Headers: http.Header{"Authorization": {"Bearer " + accessToken}},
	})
	if err != nil {
		return nil, err
	}

	var msUser MicrosoftUser
	if err := resp.JSON(&msUser); err != nil {
		return nil, err
	}

	return &msUser, nil
}

// findOrCreateMicrosoftUser Microsoft identity → 共用 helper。
// Microsoft 的 email 可能在 Mail 或 UserPrincipalName 字段(企业租户走 UPN),取 Mail 优先。
func (h *Handler) findOrCreateMicrosoftUser(ctx context.Context, msUser *MicrosoftUser, ip string) (oauthOutcome, error) {
	_ = ip
	email := msUser.Mail
	if email == "" {
		email = msUser.UserPrincipalName
	}
	username := msUser.DisplayName
	if username == "" && email != "" {
		username = splitEmail(email)
	}
	return h.findOrCreateOAuthUser(ctx, oauthIdentity{
		Provider:          "microsoft",
		ProviderUserID:    msUser.ID,
		Email:             email,
		EmailVerified:     email != "", // Microsoft 企业账户 email 默认已验证
		UsernameCandidate: username,
		UsernameFallback:  "ms_user",
		DisplayName:       msUser.DisplayName,
		ProviderDataExtras: map[string]string{
			"display_name": msUser.DisplayName,
			"email":        email,
			"job_title":    msUser.JobTitle,
		},
	})
}

// BindMicrosoftAccount handles Microsoft account binding
func (h *Handler) BindMicrosoftAccount(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	var req struct {
		Code  string `json:"code" binding:"required"`
		State string `json:"state" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "请求参数有误")
		return
	}

	msConfig, err := h.service.GetMicrosoftOAuthConfig()
	if err != nil || msConfig == nil || !msConfig.Enabled {
		utils.ErrorResponse(c, http.StatusServiceUnavailable, "Microsoft 登录未配置或不可用")
		return
	}

	accessToken, err := h.exchangeMicrosoftCode(c.Request.Context(), req.Code, msConfig)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "获取访问令牌失败,请重试")
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
		if existing.UserID == userID {
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
		UserID:         userID,
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
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}
	err := h.service.UnbindMicrosoft(userID)
	if err != nil {
		utils.SafeError(c, http.StatusBadRequest, err)
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
	if err := s.ensureNotLastLoginMethod(userID); err != nil {
		return err
	}
	return s.repo.UnbindProviderInTx(userID, "microsoft")
}
