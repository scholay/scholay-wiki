// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package wechatofficial

import (
	"errors"

	"gorm.io/gorm"
)

// Repository handles database operations for WeChat Official Account
type Repository struct {
	db *gorm.DB
}

// NewRepository creates a new repository
func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

// GetConfig gets the WeChat Official Account configuration.
//
// 「还没配置过」不是错误 —— 返回 (nil, nil),由调用方渲染成空配置。
// 之前这里把 gorm.ErrRecordNotFound 原样上抛,handler 转成 HTTP 500,于是
// **一个从未配置过公众号的环境里,这个接口永远 500**。改造前前端没有错误态,
// 靠"渲染一份空表单 + PUT 自动 create"歪打正着走通了首次配置;一旦前端补上
// 「加载失败就不渲染表单」的守卫(那是对的,否则空表单会整行覆盖线上配置),
// 首次配置就彻底进不去了。与 config/handler_email_sms.go 的 email/sms 口径对齐。
func (r *Repository) GetConfig() (*WeChatOfficialConfig, error) {
	var config WeChatOfficialConfig
	err := r.db.First(&config).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &config, nil
}

// UpdateConfig updates the WeChat Official Account configuration
func (r *Repository) UpdateConfig(config *WeChatOfficialConfig) error {
	// Check if config exists
	var existingConfig WeChatOfficialConfig
	err := r.db.First(&existingConfig).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		// Create new config
		return r.db.Create(config).Error
	} else if err != nil {
		return err
	}

	// Update existing config - use Updates to avoid overwriting timestamps
	return r.db.Model(&existingConfig).Updates(map[string]any{
		"app_id":             config.AppID,
		"app_secret":         config.AppSecret,
		"token":              config.Token,
		"encoding_aes_key":   config.EncodingAESKey,
		"encryption_mode":    config.EncryptionMode,
		"auto_reply_enabled": config.AutoReplyEnabled,
		"ai_model_level":     config.AIModelLevel,
		"system_prompt":      config.SystemPrompt,
	}).Error
}
