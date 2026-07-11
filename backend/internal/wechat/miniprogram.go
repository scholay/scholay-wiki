// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

// 微信小程序登录支持(与本包内的网页扫码 OAuth 并列,但凭据独立)。
//
// 网页扫码走 /sns/oauth2/access_token(model.WeChatConfig / wechat_configs 表);
// 小程序走 /sns/jscode2session(MiniProgramConfig / wechat_miniprogram_config 表)。
// 两者共用 wxUpstream() 上游客户端(base=api.weixin.qq.com + 熔断 + 重试)。
//
// 与 PC 扫码归一到同一账号靠 unionid:两端须绑定到同一微信开放平台账号,
// jscode2session 才返回 unionid;上层 user.LoginOrRegisterWithWeChat 按 unionid
// 命中现有 users 行。详见 docs/research/wechat-miniprogram-2026-07/REPORT.md。

package wechat

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/url"
	"time"

	"gorm.io/gorm"
)

// MiniProgramConfig 是小程序配置单行(id 恒为 1),对应 wechat_miniprogram_config 表。
type MiniProgramConfig struct {
	ID        uint      `json:"id" gorm:"primaryKey"`
	AppID     string    `json:"app_id" gorm:"column:app_id;type:varchar(100);not null;default:''"`
	AppSecret string    `json:"app_secret" gorm:"column:app_secret;type:varchar(255);not null;default:''"`
	Enabled   bool      `json:"enabled" gorm:"column:enabled;not null;default:false"`
	CreatedAt time.Time `json:"created_at" gorm:"column:created_at;autoCreateTime"`
	UpdatedAt time.Time `json:"updated_at" gorm:"column:updated_at;autoUpdateTime"`
}

// TableName 固定表名。
func (MiniProgramConfig) TableName() string {
	return "wechat_miniprogram_config"
}

// miniProgramSessionResponse 是 /sns/jscode2session 的响应。
// unionid 仅在小程序已绑定到微信开放平台账号时返回(否则为空,只能按 openid 建号)。
type miniProgramSessionResponse struct {
	OpenID     string `json:"openid"`
	SessionKey string `json:"session_key"`
	UnionID    string `json:"unionid"`
	ErrCode    int    `json:"errcode"`
	ErrMsg     string `json:"errmsg"`
}

// ── Repository(挂在本包 Repository 上,复用同一个 *gorm.DB)──────────────────

// GetMiniProgramConfig 取小程序配置单行(迁移已 seed id=1,取第一行)。
func (r *Repository) GetMiniProgramConfig() (*MiniProgramConfig, error) {
	var cfg MiniProgramConfig
	if err := r.db.First(&cfg).Error; err != nil {
		return nil, err
	}
	return &cfg, nil
}

// UpsertMiniProgramConfig 更新单行;行不存在(迁移未跑)时兜底创建 id=1。
func (r *Repository) UpsertMiniProgramConfig(cfg *MiniProgramConfig) error {
	var existing MiniProgramConfig
	err := r.db.First(&existing).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		cfg.ID = 1
		return r.db.Create(cfg).Error
	} else if err != nil {
		return err
	}
	// 用 Updates(map) 只写这三列,不碰 created_at。
	return r.db.Model(&existing).Updates(map[string]any{
		"app_id":     cfg.AppID,
		"app_secret": cfg.AppSecret,
		"enabled":    cfg.Enabled,
	}).Error
}

// ── Service ──────────────────────────────────────────────────────────────

// GetMiniProgramConfig 取小程序配置(admin 读)。
func (s *Service) GetMiniProgramConfig() (*MiniProgramConfig, error) {
	return s.repo.GetMiniProgramConfig()
}

// UpdateMiniProgramConfig 保存小程序配置(admin 写)。
func (s *Service) UpdateMiniProgramConfig(cfg *MiniProgramConfig) error {
	return s.repo.UpsertMiniProgramConfig(cfg)
}

// Code2Session 用 wx.login 返回的临时 js_code 换 openid/unionid/session_key。
// 凭据从 DB 单行动态读取(admin 后台可改),关闭或未配齐则拒绝、不打上游。
func (s *Service) Code2Session(jsCode string) (openID, unionID, sessionKey string, err error) {
	cfg, err := s.repo.GetMiniProgramConfig()
	if err != nil {
		return "", "", "", fmt.Errorf("小程序配置不可用: %w", err)
	}
	if !cfg.Enabled {
		return "", "", "", errors.New("小程序登录未启用")
	}
	if cfg.AppID == "" || cfg.AppSecret == "" {
		return "", "", "", errors.New("小程序 AppID/AppSecret 未配置")
	}

	var resp miniProgramSessionResponse
	err = wxUpstream().GetJSON(context.Background(), "/sns/jscode2session", url.Values{
		"appid":      {cfg.AppID},
		"secret":     {cfg.AppSecret},
		"js_code":    {jsCode},
		"grant_type": {"authorization_code"},
	}, &resp)
	if err != nil {
		slog.Error("wechat: jscode2session call failed", "err", err)
		return "", "", "", fmt.Errorf("换取小程序会话失败: %w", err)
	}
	if resp.ErrCode != 0 {
		slog.Error("wechat: jscode2session api error", "errcode", resp.ErrCode, "errmsg", resp.ErrMsg)
		return "", "", "", fmt.Errorf("微信接口错误: %s (code: %d)", resp.ErrMsg, resp.ErrCode)
	}
	if resp.OpenID == "" {
		return "", "", "", errors.New("jscode2session 未返回 openid")
	}
	return resp.OpenID, resp.UnionID, resp.SessionKey, nil
}

// ── Adapter(实现 user.WeChatService 的小程序方法)───────────────────────────

// Code2Session implements user.WeChatService interface(小程序一键登录)。
func (a *ServiceAdapter) Code2Session(jsCode string) (openID, unionID, sessionKey string, err error) {
	return a.service.Code2Session(jsCode)
}

// mpPhoneResponse 是 /wxa/business/getuserphonenumber 的响应。
type mpPhoneResponse struct {
	ErrCode   int    `json:"errcode"`
	ErrMsg    string `json:"errmsg"`
	PhoneInfo struct {
		PhoneNumber     string `json:"phoneNumber"`
		PurePhoneNumber string `json:"purePhoneNumber"`
		CountryCode     string `json:"countryCode"`
	} `json:"phone_info"`
}

// GetPhoneByCode 用 wx.getPhoneNumber 返回的 phoneCode 换用户手机号(微信已验证,无需短信)。
func (s *Service) GetPhoneByCode(phoneCode string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	token, err := s.getMiniProgramAccessToken(ctx)
	if err != nil {
		return "", err
	}
	var resp mpPhoneResponse
	if err := wxUpstream().PostJSON(ctx, "/wxa/business/getuserphonenumber?access_token="+url.QueryEscape(token),
		map[string]any{"code": phoneCode}, &resp); err != nil {
		return "", fmt.Errorf("获取手机号失败: %w", err)
	}
	if resp.ErrCode != 0 {
		return "", fmt.Errorf("微信接口错误: %s (code: %d)", resp.ErrMsg, resp.ErrCode)
	}
	phone := resp.PhoneInfo.PurePhoneNumber
	if phone == "" {
		phone = resp.PhoneInfo.PhoneNumber
	}
	if phone == "" {
		return "", errors.New("未获取到手机号")
	}
	return phone, nil
}

// GetPhoneByCode implements user.WeChatService interface(小程序手机号绑定)。
func (a *ServiceAdapter) GetPhoneByCode(phoneCode string) (string, error) {
	return a.service.GetPhoneByCode(phoneCode)
}
