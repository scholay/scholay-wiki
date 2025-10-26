package config

import (
	"scholar-backend/internal/common/model"

	"gorm.io/gorm"
)

// Repository handles database operations for config
type Repository struct {
	db *gorm.DB
}

// NewRepository creates a new config repository
func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

// FindActivePrivacyPolicy finds the active privacy policy
func (r *Repository) FindActivePrivacyPolicy() (*model.PrivacyPolicy, error) {
	var policy model.PrivacyPolicy
	err := r.db.Where("is_active = ?", true).
		Order("created_at DESC").
		First(&policy).Error

	if err == gorm.ErrRecordNotFound {
		return nil, nil
	}
	return &policy, err
}

// CreatePrivacyPolicy creates a new privacy policy
func (r *Repository) CreatePrivacyPolicy(policy *model.PrivacyPolicy) error {
	return r.db.Create(policy).Error
}

// DeactivateAllPolicies deactivates all existing policies
func (r *Repository) DeactivateAllPolicies() error {
	return r.db.Model(&model.PrivacyPolicy{}).
		Where("is_active = ?", true).
		Update("is_active", false).Error
}

// FindActiveEmailConfig finds the active email configuration
func (r *Repository) FindActiveEmailConfig() (*model.EmailConfig, error) {
	var config model.EmailConfig
	err := r.db.Where("is_active = ?", true).
		Order("created_at DESC").
		First(&config).Error

	if err == gorm.ErrRecordNotFound {
		return nil, nil
	}
	return &config, err
}

// CreateEmailConfig creates a new email configuration
func (r *Repository) CreateEmailConfig(config *model.EmailConfig) error {
	return r.db.Create(config).Error
}

// DeactivateAllEmailConfigs deactivates all existing email configs
func (r *Repository) DeactivateAllEmailConfigs() error {
	return r.db.Model(&model.EmailConfig{}).
		Where("is_active = ?", true).
		Update("is_active", false).Error
}

// GetSystemConfig gets the system configuration
func (r *Repository) GetSystemConfig() (*model.SystemConfig, error) {
	var config model.SystemConfig
	err := r.db.First(&config).Error
	if err == gorm.ErrRecordNotFound {
		return nil, nil
	}
	return &config, err
}

// CreateSystemConfig creates system configuration
func (r *Repository) CreateSystemConfig(config *model.SystemConfig) error {
	return r.db.Create(config).Error
}

// UpdateSystemConfig updates system configuration
func (r *Repository) UpdateSystemConfig(config *model.SystemConfig) error {
	return r.db.Save(config).Error
}
