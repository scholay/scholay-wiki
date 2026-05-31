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
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"scholar-backend/internal/common/cache"
	"scholar-backend/internal/common/model"
	"scholar-backend/internal/common/upstream"
	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"gorm.io/gorm"
)

var appleUpstream = newOAuthUpstream("apple_oauth")

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
		utils.ErrorResponse(c, http.StatusInternalServerError, "加载 Apple 登录配置失败,请稍后重试")
		return
	}
	if appleConfig == nil || appleConfig.ServiceID == "" || !appleConfig.Enabled {
		utils.ErrorResponse(c, http.StatusServiceUnavailable, "Apple 登录未配置或不可用")
		return
	}

	state := issueOAuthState(c, "apple_oauth_state:")

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

// GetAppleBindURL —— 已登录用户从「设置 → 已连接账号」点「绑定 Apple」时调用。
//
// 与 GetAppleLoginURL 的区别:
//   - 受 user auth 中间件保护(JWT 必填)
//   - 在 Redis 颁发 bind_nonce 把 user_id 暂存,把 "bind:<nonce>" 嵌进 OAuth state
//   - AppleCallback 解析 state,匹配 "bind:" 前缀就走绑定分支,不走 login
//
// 为啥不复用 GetAppleLoginURL 加 ?mode=bind:那个端点是 public 路由(无 auth),
// 要在那里识别 mode 还得手动 verify JWT、处理 401 等,逻辑分支重而易错。独立
// endpoint 走 protected 路由,职责单一,安全边界清晰。
func (h *Handler) GetAppleBindURL(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	appleConfig, err := h.service.GetAppleOAuthConfig()
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "加载 Apple 登录配置失败,请稍后重试")
		return
	}
	if appleConfig == nil || appleConfig.ServiceID == "" || !appleConfig.Enabled {
		utils.ErrorResponse(c, http.StatusServiceUnavailable, "Apple 登录未配置或不可用")
		return
	}

	nonce, err := cache.SaveOAuthBindNonce(c.Request.Context(), userID)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to issue bind nonce")
		return
	}

	// state 同时承担两个角色:
	//   - CSRF 防护:nonce 本身随机
	//   - 上下文携带:"bind:" 前缀让 callback 知道这是绑定不是登录
	// 这里没走 issueOAuthState(那是 login 用的简单 CSRF token),因为 state
	// 必须能在 callback 解出 user_id。validateOAuthState 在 callback 里
	// 处理 bind 分支时会被跳过,改用 ConsumeOAuthBindNonce。
	state := "bind:" + nonce
	oauthURL := fmt.Sprintf("%s?client_id=%s&response_type=code%%20id_token&redirect_uri=%s&scope=name%%20email&state=%s&response_mode=form_post",
		appleAuthURL,
		url.QueryEscape(appleConfig.ServiceID),
		url.QueryEscape(appleConfig.RedirectURI),
		url.QueryEscape(state),
	)
	utils.Success(c, gin.H{"url": oauthURL, "state": state})
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
		utils.BadRequest(c, "授权参数不完整,请重新发起登录")
		return
	}

	// 「绑定模式」分支:state 形如 "bind:<nonce>",由 GetAppleBindURL 颁发。
	// 解析出 user_id 后,callback 不走 login,而是把 Apple 绑到该 user_id 上,
	// 然后 302 重定向回前端 /apple/callback?bind=success|error。
	if strings.HasPrefix(state, "bind:") {
		nonce := strings.TrimPrefix(state, "bind:")
		h.handleAppleBindCallback(c, nonce, code, idTokenStr, userJSON)
		return
	}

	if !validateOAuthState(c, "apple_oauth_state:", state) {
		utils.ErrorResponse(c, http.StatusBadRequest, "会话已过期,请重新发起登录")
		return
	}

	appleConfig, err := h.service.GetAppleOAuthConfig()
	if err != nil || appleConfig == nil || !appleConfig.Enabled {
		utils.ErrorResponse(c, http.StatusServiceUnavailable, "Apple 登录未配置或不可用")
		return
	}

	// Generate client_secret JWT
	clientSecret, err := generateAppleClientSecret(appleConfig)
	if err != nil {
		slog.Error("apple oauth: failed to generate client secret", "err", err)
		utils.ErrorResponse(c, http.StatusInternalServerError, "生成客户端密钥失败,请联系管理员")
		return
	}

	// Exchange code for tokens
	tokenResp, err := exchangeAppleCode(c.Request.Context(), code, appleConfig, clientSecret)
	if err != nil {
		slog.Error("apple oauth: failed to exchange code", "err", err)
		utils.ErrorResponse(c, http.StatusInternalServerError, "获取访问令牌失败,请重试")
		return
	}

	// Parse ID token to get user info
	// Use the id_token from token response (or from the callback if available)
	idToken := tokenResp.IDToken
	if idToken == "" {
		idToken = idTokenStr
	}

	if idToken == "" {
		utils.ErrorResponse(c, http.StatusInternalServerError, "未收到 Apple 身份令牌,请重试")
		return
	}

	// Parse claims without verification (Apple's id_token is already verified via the token exchange)
	claims, err := parseAppleIDToken(idToken)
	if err != nil {
		slog.Error("apple oauth: failed to parse ID token", "err", err)
		utils.ErrorResponse(c, http.StatusInternalServerError, "解析 Apple 身份令牌失败,请重试")
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

	// Find or create user(三态 —— 见 oauthOutcome 注释)
	ip := c.ClientIP()
	outcome, err := h.findOrCreateAppleUser(c.Request.Context(), claims, appleUser, ip)
	if err != nil {
		slog.Error("apple oauth: failed to process user", "err", err)
		utils.ErrorResponse(c, http.StatusInternalServerError, "Apple 登录处理失败,请稍后重试")
		return
	}

	baseURL := strings.TrimSuffix(appleConfig.RedirectURI, "/apple/callback")

	// 分支 A:email 冲突 → 重定向到合并确认页(查询串带 merge_token)
	if outcome.MergeToken != "" {
		mergeURL := fmt.Sprintf("%s/apple/callback?merge_token=%s&provider=apple&target_email=%s&state=%s",
			baseURL,
			url.QueryEscape(outcome.MergeToken),
			url.QueryEscape(derefStr(outcome.User.Email)),
			url.QueryEscape(state))
		c.Redirect(http.StatusFound, mergeURL)
		return
	}

	// 分支 B:常规登录 / 新建,签发 token
	token, err := issueTokenAndSession(h, c, outcome.User, ip)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "签发登录凭证失败,请重试")
		return
	}

	resultURL := fmt.Sprintf("%s/apple/callback?token=%s&is_new_user=%v&state=%s",
		baseURL, url.QueryEscape(token), outcome.IsNewUser, url.QueryEscape(state))
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

	resp, err := appleUpstream.Do(ctx, upstream.Request{
		Method:  http.MethodPost,
		Path:    appleTokenURL,
		Headers: http.Header{"Content-Type": {"application/x-www-form-urlencoded"}},
		Body:    strings.NewReader(data.Encode()),
	})
	if err != nil {
		return nil, err
	}

	var tokenResp AppleTokenResponse
	if err := resp.JSON(&tokenResp); err != nil {
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

// findOrCreateAppleUser Apple identity → 共用 helper。
// Apple 怪点:
//   - email 可能在 claims.Email 或首次授权时返的 appleUser.Email
//   - email_verified claim 可能是 bool 也可能是 string("true")—— 见 EmailVerified 字段类型
//   - 名字(first/last)只在首次授权时返
func (h *Handler) findOrCreateAppleUser(ctx context.Context, claims *AppleIDTokenClaims, appleUser *AppleUserInfo, ip string) (oauthOutcome, error) {
	_ = ip

	email := claims.Email
	if email == "" && appleUser != nil {
		email = appleUser.Email
	}

	// Apple email_verified 字段类型不确定,bool 或 "true"/"false" 字符串都见过
	emailVerified := false
	switch v := claims.EmailVerified.(type) {
	case bool:
		emailVerified = v
	case string:
		emailVerified = v == "true"
	}

	providerExtras := map[string]string{"email": email}
	displayName := ""
	if appleUser != nil && appleUser.Name != nil {
		providerExtras["first_name"] = appleUser.Name.FirstName
		providerExtras["last_name"] = appleUser.Name.LastName
		parts := []string{}
		if appleUser.Name.FirstName != "" {
			parts = append(parts, appleUser.Name.FirstName)
		}
		if appleUser.Name.LastName != "" {
			parts = append(parts, appleUser.Name.LastName)
		}
		displayName = strings.Join(parts, " ")
	}
	username := displayName
	if username == "" && email != "" {
		username = splitEmail(email)
	}

	return h.findOrCreateOAuthUser(ctx, oauthIdentity{
		Provider:           "apple",
		ProviderUserID:     claims.Subject,
		Email:              email,
		EmailVerified:      emailVerified,
		UsernameCandidate:  username,
		UsernameFallback:   "apple_user",
		DisplayName:        displayName,
		ProviderDataExtras: providerExtras,
	})
}

// handleAppleBindCallback —— AppleCallback 在「绑定模式」(state="bind:<nonce>")
// 下的分支:消费 nonce 拿到 user_id → 跑标准 Apple code 交换 → 在 user_id 头上
// 加 apple provider,然后 302 重定向回前端 /apple/callback?bind=success(或 error)。
//
// 跟 BindAppleAccount(POST /user/bind-apple)不同:那个是前端拿到 code 后主动
// 调用的 protected 端点。Apple 用 form_post,Apple 把 POST 发给我们后端,我们
// 没机会回到前端再让前端调 bind 端点,只能在这里就地完成绑定。
func (h *Handler) handleAppleBindCallback(c *gin.Context, nonce, code, idTokenStr, userJSON string) {
	ctx := c.Request.Context()

	// 1. 只 Lookup 不删 —— 中间任何一步失败(OAuth / id_token / 已绑冲突)用户
	//    都能返回重试。只有真正 CreateAuthProvider 成功后才 DeleteOAuthBindNonce,
	//    防止 nonce 被吃了但绑没成的尴尬状态。
	userID, _ := cache.LookupOAuthBindNonce(ctx, nonce)
	if userID == 0 {
		h.redirectAppleBindResult(c, false, "bind link expired, please retry")
		return
	}

	appleConfig, err := h.service.GetAppleOAuthConfig()
	if err != nil || appleConfig == nil || !appleConfig.Enabled {
		h.redirectAppleBindResult(c, false, "apple oauth not configured")
		return
	}

	clientSecret, err := generateAppleClientSecret(appleConfig)
	if err != nil {
		h.redirectAppleBindResult(c, false, "failed to generate client secret")
		return
	}

	tokenResp, err := exchangeAppleCode(ctx, code, appleConfig, clientSecret)
	if err != nil {
		slog.Error("apple bind: failed to exchange code", "err", err)
		h.redirectAppleBindResult(c, false, "failed to exchange apple code")
		return
	}

	idToken := tokenResp.IDToken
	if idToken == "" {
		idToken = idTokenStr
	}
	if idToken == "" {
		h.redirectAppleBindResult(c, false, "no apple id_token received")
		return
	}
	claims, err := parseAppleIDToken(idToken)
	if err != nil {
		h.redirectAppleBindResult(c, false, "invalid apple id token")
		return
	}

	providerUserID := claims.Subject

	// 检查这个 Apple ID 是不是已经被绑到别人(或自己)身上
	existing, err := h.service.FindAuthProvider("apple", providerUserID)
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		h.redirectAppleBindResult(c, false, "failed to check binding")
		return
	}
	if existing != nil {
		if existing.UserID == userID {
			h.redirectAppleBindResult(c, false, "already bound to your account")
		} else {
			h.redirectAppleBindResult(c, false, "this apple account is bound to another user")
		}
		return
	}

	providerData := map[string]string{"email": claims.Email}
	if userJSON != "" {
		var u AppleUserInfo
		if err := json.Unmarshal([]byte(userJSON), &u); err == nil && u.Name != nil {
			providerData["first_name"] = u.Name.FirstName
			providerData["last_name"] = u.Name.LastName
		}
	}
	providerDataBytes, _ := json.Marshal(providerData)
	providerDataJSON := string(providerDataBytes)

	if err := h.service.CreateAuthProvider(&UserAuthProvider{
		UserID:         userID,
		Provider:       "apple",
		ProviderUserID: providerUserID,
		ProviderData:   &providerDataJSON,
	}); err != nil {
		// 含 UNIQUE 冲突——视作并发再次绑,认为成功
		if !strings.Contains(err.Error(), "Duplicate") && !strings.Contains(err.Error(), "duplicate") {
			h.redirectAppleBindResult(c, false, "failed to save binding")
			return
		}
	}

	// 绑定真正落库后才销毁 nonce —— 防止前面任何步骤失败导致 nonce 提前消耗。
	_ = cache.DeleteOAuthBindNonce(ctx, nonce)
	h.redirectAppleBindResult(c, true, "")
}

// redirectAppleBindResult 把绑定结果 302 回前端 /apple/callback?bind=success|error&msg=...
// 前端 OAuthCallbackPage 检到 ?bind= 时显示 toast + 跳回 /settings/connections。
func (h *Handler) redirectAppleBindResult(c *gin.Context, ok bool, msg string) {
	appleConfig, _ := h.service.GetAppleOAuthConfig()
	baseURL := ""
	if appleConfig != nil {
		baseURL = strings.TrimSuffix(appleConfig.RedirectURI, "/apple/callback")
	}
	result := "success"
	if !ok {
		result = "error"
	}
	target := fmt.Sprintf("%s/apple/callback?bind=%s&msg=%s",
		baseURL, result, url.QueryEscape(msg))
	c.Redirect(http.StatusFound, target)
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
		utils.ErrorResponse(c, http.StatusServiceUnavailable, "Apple 登录未配置或不可用")
		return
	}

	clientSecret, err := generateAppleClientSecret(appleConfig)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "生成客户端密钥失败,请联系管理员")
		return
	}

	tokenResp, err := exchangeAppleCode(c.Request.Context(), req.Code, appleConfig, clientSecret)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "获取访问令牌失败,请重试")
		return
	}

	idToken := tokenResp.IDToken
	if idToken == "" {
		idToken = req.IDToken
	}

	claims, err := parseAppleIDToken(idToken)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "解析 Apple 身份令牌失败,请重试")
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
	if err := s.ensureNotLastLoginMethod(userID); err != nil {
		return err
	}
	return s.repo.UnbindProviderInTx(userID, "apple")
}

