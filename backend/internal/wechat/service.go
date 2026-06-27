// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package wechat

import (
	"context"
	"crypto/sha1"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"scholar-backend/internal/common/model"
	"scholar-backend/internal/common/upstream"
	"sort"
	"strings"
	"sync"
	"time"

	"gorm.io/gorm"
)

// 全局 upstream.Client — base 是 api.weixin.qq.com, 所有 /sns/* 走它。
// 微信开放平台接口正常 < 500ms 回, 用默认 httpclient (5min timeout 太长 — 不过
// 我们靠 ctx.WithTimeout 自己控制单次时长, 或者继承调用方 ctx).
var (
	wxOnce   sync.Once
	wxClient *upstream.Client
)

func wxUpstream() *upstream.Client {
	wxOnce.Do(func() {
		hc := &http.Client{Timeout: 10 * time.Second}
		wxClient = upstream.New("wechat_open").
			BaseURL("https://api.weixin.qq.com").
			HTTPClient(hc).
			Retry(upstream.RetryConfig{
				Max:         2,
				BackoffBase: 300 * time.Millisecond,
				BackoffMax:  2 * time.Second,
			}).
			Breaker(upstream.BreakerConfig{
				MaxRequests:  3,
				MinRequests:  5,
				FailureRatio: 0.6,
				Timeout:      30 * time.Second,
			}).
			MustBuild()
	})
	return wxClient
}

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
	var tokenResp WeChatAccessTokenResponse
	err = wxUpstream().GetJSON(context.Background(), "/sns/oauth2/access_token", url.Values{
		"appid":      {config.AppID},
		"secret":     {config.AppSecret},
		"code":       {code},
		"grant_type": {"authorization_code"},
	}, &tokenResp)
	if err != nil {
		slog.Error("wechat: access_token call failed", "err", err)
		return nil, fmt.Errorf("failed to get access token: %w", err)
	}
	if tokenResp.ErrCode != 0 {
		slog.Error("wechat: access_token api error", "errcode", tokenResp.ErrCode, "errmsg", tokenResp.ErrMsg)
		return nil, fmt.Errorf("WeChat API error: %s (code: %d)", tokenResp.ErrMsg, tokenResp.ErrCode)
	}
	return &tokenResp, nil
}

// GetUserInfo retrieves user information using access token
func (s *Service) GetUserInfo(accessToken, openID string) (*WeChatUserInfo, error) {
	var userInfo WeChatUserInfo
	err := wxUpstream().GetJSON(context.Background(), "/sns/userinfo", url.Values{
		"access_token": {accessToken},
		"openid":       {openID},
		"lang":         {"zh_CN"},
	}, &userInfo)
	if err != nil {
		slog.Error("wechat: userinfo call failed", "err", err)
		return nil, fmt.Errorf("failed to get user info: %w", err)
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
	var tokenResp WeChatAccessTokenResponse
	err = wxUpstream().GetJSON(context.Background(), "/sns/oauth2/refresh_token", url.Values{
		"appid":         {config.AppID},
		"grant_type":    {"refresh_token"},
		"refresh_token": {refreshToken},
	}, &tokenResp)
	if err != nil {
		return nil, fmt.Errorf("failed to refresh token: %w", err)
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

	// 常量时间比较,消除时序侧信道(与 internal/news.VerifySignature 口径一致)。
	return subtle.ConstantTimeCompare([]byte(calculatedSignature), []byte(signature)) == 1, nil
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

// GetConfigByID 取单条 WeChat 配置 —— admin 编辑前 / Update 前合并旧值用。
func (s *Service) GetConfigByID(id uint) (*model.WeChatConfig, error) {
	return s.repo.GetConfigByID(id)
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
