// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package payment

import (
	"scholar-backend/internal/common/model"

	"gorm.io/gorm"
)

// AlipayRepository handles database operations for Alipay configurations
type AlipayRepository struct {
	db *gorm.DB
}

// NewAlipayRepository creates a new Alipay repository
func NewAlipayRepository(db *gorm.DB) *AlipayRepository {
	return &AlipayRepository{db: db}
}

// GetActiveConfig retrieves the active Alipay configuration
func (r *AlipayRepository) GetActiveConfig() (*model.AlipayConfig, error) {
	var config model.AlipayConfig
	err := r.db.Where("is_active = ?", true).First(&config).Error
	if err != nil {
		return nil, err
	}
	return &config, nil
}

// GetConfigByID retrieves an Alipay configuration by ID
func (r *AlipayRepository) GetConfigByID(id uint) (*model.AlipayConfig, error) {
	var config model.AlipayConfig
	err := r.db.Where("id = ?", id).First(&config).Error
	if err != nil {
		return nil, err
	}
	return &config, nil
}

// ListConfigs retrieves all Alipay configurations
func (r *AlipayRepository) ListConfigs() ([]model.AlipayConfig, error) {
	var configs []model.AlipayConfig
	err := r.db.Order("created_at DESC").Find(&configs).Error
	return configs, err
}

// CreateConfig creates a new Alipay configuration
func (r *AlipayRepository) CreateConfig(config *model.AlipayConfig) error {
	return r.db.Create(config).Error
}

// UpdateConfig updates an Alipay configuration
func (r *AlipayRepository) UpdateConfig(config *model.AlipayConfig) error {
	// Use Updates instead of Save to avoid updating created_at
	// and to allow selective field updates
	updates := map[string]any{
		"app_id":     config.AppID,
		"notify_url": config.NotifyURL,
		"return_url": config.ReturnURL,
		"is_sandbox": config.IsSandbox,
		"is_active":  config.IsActive,
	}

	// Only update private_key if it's not empty
	if config.PrivateKey != "" {
		updates["private_key"] = config.PrivateKey
	}

	// Only update alipay_public_key if it's not empty
	if config.AlipayPublicKey != "" {
		updates["alipay_public_key"] = config.AlipayPublicKey
	}

	return r.db.Model(&model.AlipayConfig{}).Where("id = ?", config.ID).Updates(updates).Error
}

// DeleteConfig deletes an Alipay configuration
func (r *AlipayRepository) DeleteConfig(id uint) error {
	return r.db.Delete(&model.AlipayConfig{}, id).Error
}

// DeactivateAllConfigs deactivates all Alipay configurations
func (r *AlipayRepository) DeactivateAllConfigs() error {
	return r.db.Model(&model.AlipayConfig{}).Where("is_active = ?", true).Update("is_active", false).Error
}

// SetActiveConfig sets a specific configuration as active (and deactivates others)
func (r *AlipayRepository) SetActiveConfig(id uint) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		// Deactivate all configs
		if err := tx.Model(&model.AlipayConfig{}).Where("is_active = ?", true).Update("is_active", false).Error; err != nil {
			return err
		}
		// Activate the specified config
		return tx.Model(&model.AlipayConfig{}).Where("id = ?", id).Update("is_active", true).Error
	})
}
