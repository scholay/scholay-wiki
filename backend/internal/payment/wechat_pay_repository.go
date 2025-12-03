// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package payment

import (
	"gorm.io/gorm"
)

// WeChatPayRepository 微信支付配置仓储
type WeChatPayRepository struct {
	db *gorm.DB
}

// NewWeChatPayRepository 创建微信支付配置仓储
func NewWeChatPayRepository(db *gorm.DB) *WeChatPayRepository {
	return &WeChatPayRepository{db: db}
}

// GetAllConfigs 获取所有微信支付配置
func (r *WeChatPayRepository) GetAllConfigs() ([]*WeChatPayConfig, error) {
	var configs []*WeChatPayConfig
	err := r.db.Order("created_at DESC").Find(&configs).Error
	return configs, err
}

// GetActiveConfig 获取激活的微信支付配置
func (r *WeChatPayRepository) GetActiveConfig() (*WeChatPayConfig, error) {
	var config WeChatPayConfig
	err := r.db.Where("is_active = ?", true).First(&config).Error
	if err != nil {
		return nil, err
	}
	return &config, nil
}

// GetConfigByID 根据ID获取微信支付配置
func (r *WeChatPayRepository) GetConfigByID(id uint64) (*WeChatPayConfig, error) {
	var config WeChatPayConfig
	err := r.db.First(&config, id).Error
	if err != nil {
		return nil, err
	}
	return &config, nil
}

// CreateConfig 创建微信支付配置
func (r *WeChatPayRepository) CreateConfig(config *WeChatPayConfig) error {
	return r.db.Create(config).Error
}

// UpdateConfig 更新微信支付配置
func (r *WeChatPayRepository) UpdateConfig(config *WeChatPayConfig) error {
	return r.db.Save(config).Error
}

// DeleteConfig 删除微信支付配置
func (r *WeChatPayRepository) DeleteConfig(id uint64) error {
	return r.db.Delete(&WeChatPayConfig{}, id).Error
}

// DeactivateAllConfigs 停用所有配置
func (r *WeChatPayRepository) DeactivateAllConfigs() error {
	return r.db.Model(&WeChatPayConfig{}).Where("is_active = ?", true).Update("is_active", false).Error
}

// ActivateConfig 激活指定配置（会停用其他配置）
func (r *WeChatPayRepository) ActivateConfig(id uint64) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		// 停用所有配置
		if err := tx.Model(&WeChatPayConfig{}).Where("is_active = ?", true).Update("is_active", false).Error; err != nil {
			return err
		}
		// 激活指定配置
		if err := tx.Model(&WeChatPayConfig{}).Where("id = ?", id).Update("is_active", true).Error; err != nil {
			return err
		}
		return nil
	})
}
