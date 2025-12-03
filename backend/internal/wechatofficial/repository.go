// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package wechatofficial

import (
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

// GetConfig gets the WeChat Official Account configuration
func (r *Repository) GetConfig() (*WeChatOfficialConfig, error) {
	var config WeChatOfficialConfig
	err := r.db.First(&config).Error
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

	if err == gorm.ErrRecordNotFound {
		// Create new config
		return r.db.Create(config).Error
	} else if err != nil {
		return err
	}

	// Update existing config - use Updates to avoid overwriting timestamps
	return r.db.Model(&existingConfig).Updates(map[string]interface{}{
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
