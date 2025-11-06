package wechat

import (
	"scholar-backend/internal/common/model"

	"gorm.io/gorm"
)

// Repository handles database operations for WeChat configurations
type Repository struct {
	db *gorm.DB
}

// NewRepository creates a new WeChat repository
func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

// GetActiveConfig retrieves the active WeChat configuration
func (r *Repository) GetActiveConfig() (*model.WeChatConfig, error) {
	var config model.WeChatConfig
	err := r.db.Where("is_active = ?", true).First(&config).Error
	if err != nil {
		return nil, err
	}
	return &config, nil
}

// GetConfigByID retrieves a WeChat configuration by ID
func (r *Repository) GetConfigByID(id uint) (*model.WeChatConfig, error) {
	var config model.WeChatConfig
	err := r.db.Where("id = ?", id).First(&config).Error
	if err != nil {
		return nil, err
	}
	return &config, nil
}

// ListConfigs retrieves all WeChat configurations
func (r *Repository) ListConfigs() ([]model.WeChatConfig, error) {
	var configs []model.WeChatConfig
	err := r.db.Order("created_at DESC").Find(&configs).Error
	return configs, err
}

// CreateConfig creates a new WeChat configuration
func (r *Repository) CreateConfig(config *model.WeChatConfig) error {
	return r.db.Create(config).Error
}

// UpdateConfig updates a WeChat configuration
func (r *Repository) UpdateConfig(config *model.WeChatConfig) error {
	return r.db.Save(config).Error
}

// DeleteConfig deletes a WeChat configuration
func (r *Repository) DeleteConfig(id uint) error {
	return r.db.Delete(&model.WeChatConfig{}, id).Error
}

// DeactivateAllConfigs deactivates all WeChat configurations
func (r *Repository) DeactivateAllConfigs() error {
	return r.db.Model(&model.WeChatConfig{}).Where("is_active = ?", true).Update("is_active", false).Error
}

// SetActiveConfig sets a specific configuration as active (and deactivates others)
func (r *Repository) SetActiveConfig(id uint) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		// Deactivate all configs
		if err := tx.Model(&model.WeChatConfig{}).Where("is_active = ?", true).Update("is_active", false).Error; err != nil {
			return err
		}
		// Activate the specified config
		return tx.Model(&model.WeChatConfig{}).Where("id = ?", id).Update("is_active", true).Error
	})
}
