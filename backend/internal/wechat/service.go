// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package wechat

import (
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"scholar-backend/internal/common/model"
	"sort"
	"strings"
	"time"

	"gorm.io/gorm"
)

// Service handles WeChat OAuth operations
type Service struct {
	repo *Repository
}

// NewService creates a new WeChat service
func NewService(db *gorm.DB) *Service {
	return &Service{
		repo: NewRepository(db),
	}
}

// WeChatAccessTokenResponse represents the access token response from WeChat
type WeChatAccessTokenResponse struct {
	AccessToken  string `json:"access_token"`
	ExpiresIn    int    `json:"expires_in"`
	RefreshToken string `json:"refresh_token"`
	OpenID       string `json:"openid"`
	Scope        string `json:"scope"`
	UnionID      string `json:"unionid"`
	ErrCode      int    `json:"errcode"`
	ErrMsg       string `json:"errmsg"`
}

// WeChatUserInfo represents user information from WeChat
type WeChatUserInfo struct {
	OpenID     string   `json:"openid"`
	Nickname   string   `json:"nickname"`
	Sex        int      `json:"sex"` // 1=male, 2=female, 0=unknown
	Province   string   `json:"province"`
	City       string   `json:"city"`
	Country    string   `json:"country"`
	HeadImgURL string   `json:"headimgurl"`
	Privilege  []string `json:"privilege"`
	UnionID    string   `json:"unionid"`
	ErrCode    int      `json:"errcode"`
	ErrMsg     string   `json:"errmsg"`
}

// GenerateLoginURL generates the WeChat QR code login URL
func (s *Service) GenerateLoginURL(state string) (string, error) {
	config, err := s.repo.GetActiveConfig()
	if err != nil {
		return "", fmt.Errorf("no active WeChat configuration: %w", err)
	}

	// For web-based QR code login
	params := url.Values{}
	params.Set("appid", config.AppID)
	params.Set("redirect_uri", config.RedirectURI)
	params.Set("response_type", "code")
	params.Set("scope", config.Scope)
	params.Set("state", state)

	loginURL := "https://open.weixin.qq.com/connect/qrconnect?" + params.Encode() + "#wechat_redirect"
	return loginURL, nil
}

// GetAccessToken exchanges authorization code for access token
func (s *Service) GetAccessToken(code string) (*WeChatAccessTokenResponse, error) {
	config, err := s.repo.GetActiveConfig()
	if err != nil {
		return nil, fmt.Errorf("no active WeChat configuration: %w", err)
	}

	// Build request URL
	params := url.Values{}
	params.Set("appid", config.AppID)
	params.Set("secret", config.AppSecret)
	params.Set("code", code)
	params.Set("grant_type", "authorization_code")

	tokenURL := "https://api.weixin.qq.com/sns/oauth2/access_token?" + params.Encode()

	// Make HTTP request
	resp, err := http.Get(tokenURL)
	if err != nil {
		slog.Error("wechat: get access_token http error", "err", err)
		return nil, fmt.Errorf("failed to get access token: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		slog.Error("wechat: read access_token body", "err", err)
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	var tokenResp WeChatAccessTokenResponse
	if err := json.Unmarshal(body, &tokenResp); err != nil {
		slog.Error("wechat: parse access_token response", "err", err, "body", string(body))
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	if tokenResp.ErrCode != 0 {
		slog.Error("wechat: access_token api error", "errcode", tokenResp.ErrCode, "errmsg", tokenResp.ErrMsg)
		return nil, fmt.Errorf("WeChat API error: %s (code: %d)", tokenResp.ErrMsg, tokenResp.ErrCode)
	}

	return &tokenResp, nil
}

// GetUserInfo retrieves user information using access token
func (s *Service) GetUserInfo(accessToken, openID string) (*WeChatUserInfo, error) {
	params := url.Values{}
	params.Set("access_token", accessToken)
	params.Set("openid", openID)
	params.Set("lang", "zh_CN")

	userInfoURL := "https://api.weixin.qq.com/sns/userinfo?" + params.Encode()

	resp, err := http.Get(userInfoURL)
	if err != nil {
		slog.Error("wechat: get userinfo http error", "err", err)
		return nil, fmt.Errorf("failed to get user info: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		slog.Error("wechat: read userinfo body", "err", err)
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	var userInfo WeChatUserInfo
	if err := json.Unmarshal(body, &userInfo); err != nil {
		slog.Error("wechat: parse userinfo response", "err", err, "body", string(body))
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	if userInfo.ErrCode != 0 {
		slog.Error("wechat: userinfo api error", "errcode", userInfo.ErrCode, "errmsg", userInfo.ErrMsg)
		return nil, fmt.Errorf("WeChat API error: %s (code: %d)", userInfo.ErrMsg, userInfo.ErrCode)
	}

	return &userInfo, nil
}

// RefreshAccessToken refreshes the access token
func (s *Service) RefreshAccessToken(refreshToken string) (*WeChatAccessTokenResponse, error) {
	config, err := s.repo.GetActiveConfig()
	if err != nil {
		return nil, fmt.Errorf("no active WeChat configuration: %w", err)
	}

	params := url.Values{}
	params.Set("appid", config.AppID)
	params.Set("grant_type", "refresh_token")
	params.Set("refresh_token", refreshToken)

	tokenURL := "https://api.weixin.qq.com/sns/oauth2/refresh_token?" + params.Encode()

	resp, err := http.Get(tokenURL)
	if err != nil {
		return nil, fmt.Errorf("failed to refresh token: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	var tokenResp WeChatAccessTokenResponse
	if err := json.Unmarshal(body, &tokenResp); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	if tokenResp.ErrCode != 0 {
		return nil, fmt.Errorf("WeChat API error: %s (code: %d)", tokenResp.ErrMsg, tokenResp.ErrCode)
	}

	return &tokenResp, nil
}

// VerifySignature verifies WeChat callback signature
func (s *Service) VerifySignature(signature, timestamp, nonce string) (bool, error) {
	config, err := s.repo.GetActiveConfig()
	if err != nil {
		return false, fmt.Errorf("no active WeChat configuration: %w", err)
	}

	// WeChat uses token for signature verification (different from OAuth flow)
	// This is typically used for message callbacks, not OAuth
	token := config.AppSecret // Using AppSecret as token for simplicity

	// Sort parameters
	params := []string{token, timestamp, nonce}
	sort.Strings(params)

	// Concatenate and hash
	str := strings.Join(params, "")
	hash := sha1.New()
	hash.Write([]byte(str))
	calculatedSignature := hex.EncodeToString(hash.Sum(nil))

	return calculatedSignature == signature, nil
}

// GetActiveConfig retrieves the active WeChat configuration
func (s *Service) GetActiveConfig() (*model.WeChatConfig, error) {
	return s.repo.GetActiveConfig()
}

// ListConfigs retrieves all WeChat configurations
func (s *Service) ListConfigs() ([]model.WeChatConfig, error) {
	return s.repo.ListConfigs()
}

// CreateConfig creates a new WeChat configuration
func (s *Service) CreateConfig(config *model.WeChatConfig) error {
	// Validate required fields
	if config.AppID == "" || config.AppSecret == "" || config.RedirectURI == "" {
		return errors.New("app_id, app_secret, and redirect_uri are required")
	}

	// If this is set as active, deactivate others
	if config.IsActive {
		if err := s.repo.DeactivateAllConfigs(); err != nil {
			return fmt.Errorf("failed to deactivate existing configs: %w", err)
		}
	}

	return s.repo.CreateConfig(config)
}

// UpdateConfig updates a WeChat configuration
func (s *Service) UpdateConfig(config *model.WeChatConfig) error {
	// If this is set as active, deactivate others
	if config.IsActive {
		if err := s.repo.SetActiveConfig(config.ID); err != nil {
			return fmt.Errorf("failed to set active config: %w", err)
		}
	}

	return s.repo.UpdateConfig(config)
}

// DeleteConfig deletes a WeChat configuration
func (s *Service) DeleteConfig(id uint) error {
	return s.repo.DeleteConfig(id)
}

// SetActiveConfig sets a specific configuration as active
func (s *Service) SetActiveConfig(id uint) error {
	return s.repo.SetActiveConfig(id)
}

// GenerateState generates a random state parameter for OAuth
func GenerateState() string {
	return fmt.Sprintf("%d", time.Now().UnixNano())
}

// ServiceAdapter adapts wechat.Service to user.WeChatService interface
type ServiceAdapter struct {
	service *Service
}

// NewServiceAdapter creates a new adapter
func NewServiceAdapter(service *Service) *ServiceAdapter {
	return &ServiceAdapter{service: service}
}

// GetAccessToken implements user.WeChatService interface
func (a *ServiceAdapter) GetAccessToken(code string) (accessToken, openID, unionID string, err error) {
	resp, err := a.service.GetAccessToken(code)
	if err != nil {
		return "", "", "", err
	}
	return resp.AccessToken, resp.OpenID, resp.UnionID, nil
}

// GetUserInfo implements user.WeChatService interface
func (a *ServiceAdapter) GetUserInfo(accessToken, openID string) (nickname, headImgURL, unionID string, err error) {
	resp, err := a.service.GetUserInfo(accessToken, openID)
	if err != nil {
		return "", "", "", err
	}
	return resp.Nickname, resp.HeadImgURL, resp.UnionID, nil
}
