// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package config

import (
	"errors"

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

// FindActiveEmailConfig finds the active email configuration
func (r *Repository) FindActiveEmailConfig() (*model.EmailConfig, error) {
	var config model.EmailConfig
	err := r.db.Where("is_active = ?", true).
		Order("created_at DESC").
		First(&config).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
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
	if errors.Is(err, gorm.ErrRecordNotFound) {
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

// FindActiveSMSConfig finds the active SMS configuration
func (r *Repository) FindActiveSMSConfig() (*model.SMSConfig, error) {
	var config model.SMSConfig
	err := r.db.Where("is_active = ?", true).
		Order("created_at DESC").
		First(&config).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &config, err
}

// CreateSMSConfig creates a new SMS configuration
func (r *Repository) CreateSMSConfig(config *model.SMSConfig) error {
	return r.db.Create(config).Error
}

// DeactivateAllSMSConfigs deactivates all existing SMS configs
func (r *Repository) DeactivateAllSMSConfigs() error {
	return r.db.Model(&model.SMSConfig{}).
		Where("is_active = ?", true).
		Update("is_active", false).Error
}

// ============================================
// GitHub OAuth Configuration Methods
// ============================================

// GetGithubOAuthConfig gets the GitHub OAuth configuration (singleton pattern - always ID=1)
func (r *Repository) GetGithubOAuthConfig() (*model.GithubOAuthConfig, error) {
	var config model.GithubOAuthConfig
	err := r.db.First(&config).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &config, err
}

// CreateGithubOAuthConfig creates a new GitHub OAuth configuration
func (r *Repository) CreateGithubOAuthConfig(config *model.GithubOAuthConfig) error {
	return r.db.Create(config).Error
}

// UpdateGithubOAuthConfig updates the GitHub OAuth configuration
func (r *Repository) UpdateGithubOAuthConfig(config *model.GithubOAuthConfig) error {
	return r.db.Save(config).Error
}

// ============================================
// Google OAuth Configuration Methods
// ============================================

// GetGoogleOAuthConfig gets the Google OAuth configuration (singleton pattern - always ID=1)
func (r *Repository) GetGoogleOAuthConfig() (*model.GoogleOAuthConfig, error) {
	var config model.GoogleOAuthConfig
	err := r.db.First(&config).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &config, err
}

// CreateGoogleOAuthConfig creates a new Google OAuth configuration
func (r *Repository) CreateGoogleOAuthConfig(config *model.GoogleOAuthConfig) error {
	return r.db.Create(config).Error
}

// UpdateGoogleOAuthConfig updates the Google OAuth configuration
func (r *Repository) UpdateGoogleOAuthConfig(config *model.GoogleOAuthConfig) error {
	return r.db.Save(config).Error
}

// ============================================
// ORCID OAuth Configuration Methods
// ============================================

func (r *Repository) GetOrcidOAuthConfig() (*model.OrcidOAuthConfig, error) {
	var config model.OrcidOAuthConfig
	err := r.db.First(&config).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &config, err
}

func (r *Repository) CreateOrcidOAuthConfig(config *model.OrcidOAuthConfig) error {
	return r.db.Create(config).Error
}

func (r *Repository) UpdateOrcidOAuthConfig(config *model.OrcidOAuthConfig) error {
	return r.db.Save(config).Error
}

// ============================================
// Microsoft OAuth Configuration Methods
// ============================================

func (r *Repository) GetMicrosoftOAuthConfig() (*model.MicrosoftOAuthConfig, error) {
	var config model.MicrosoftOAuthConfig
	err := r.db.First(&config).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &config, err
}

func (r *Repository) CreateMicrosoftOAuthConfig(config *model.MicrosoftOAuthConfig) error {
	return r.db.Create(config).Error
}

func (r *Repository) UpdateMicrosoftOAuthConfig(config *model.MicrosoftOAuthConfig) error {
	return r.db.Save(config).Error
}

// ============================================
// Apple OAuth Configuration Methods
// ============================================

func (r *Repository) GetAppleOAuthConfig() (*model.AppleOAuthConfig, error) {
	var config model.AppleOAuthConfig
	err := r.db.First(&config).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &config, err
}

func (r *Repository) CreateAppleOAuthConfig(config *model.AppleOAuthConfig) error {
	return r.db.Create(config).Error
}

func (r *Repository) UpdateAppleOAuthConfig(config *model.AppleOAuthConfig) error {
	return r.db.Save(config).Error
}

// ============================================
// Discourse SSO Configuration Methods
// ============================================

// GetDiscourseSSOConfig gets the Discourse SSO configuration (singleton pattern - always ID=1)
func (r *Repository) GetDiscourseSSOConfig() (*model.DiscourseSSOConfig, error) {
	var config model.DiscourseSSOConfig
	err := r.db.First(&config).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &config, err
}

// CreateDiscourseSSOConfig creates a new Discourse SSO configuration
func (r *Repository) CreateDiscourseSSOConfig(config *model.DiscourseSSOConfig) error {
	return r.db.Create(config).Error
}

// UpdateDiscourseSSOConfig updates the Discourse SSO configuration
func (r *Repository) UpdateDiscourseSSOConfig(config *model.DiscourseSSOConfig) error {
	return r.db.Save(config).Error
}

// ============================================
// Code Snippets (SEO/广告) Configuration Methods
// ============================================

// ListCodeSnippets 获取代码片段列表（支持分类筛选）
func (r *Repository) ListCodeSnippets(category string) ([]model.CodeSnippet, error) {
	var snippets []model.CodeSnippet
	query := r.db.Order("priority ASC, created_at DESC")
	if category != "" && category != "all" {
		query = query.Where("category = ?", category)
	}
	err := query.Find(&snippets).Error
	return snippets, err
}

// GetCodeSnippetByID 根据ID获取代码片段
func (r *Repository) GetCodeSnippetByID(id uint) (*model.CodeSnippet, error) {
	var snippet model.CodeSnippet
	err := r.db.First(&snippet, id).Error
	if err != nil {
		return nil, err
	}
	return &snippet, nil
}

// GetCodeSnippetByKey 根据 code_key 获取代码片段
func (r *Repository) GetCodeSnippetByKey(key string) (*model.CodeSnippet, error) {
	var snippet model.CodeSnippet
	err := r.db.Where("code_key = ?", key).First(&snippet).Error
	if err != nil {
		return nil, err
	}
	return &snippet, nil
}

// CreateCodeSnippet 创建代码片段
func (r *Repository) CreateCodeSnippet(snippet *model.CodeSnippet) error {
	return r.db.Create(snippet).Error
}

// UpdateCodeSnippet 更新代码片段
func (r *Repository) UpdateCodeSnippet(snippet *model.CodeSnippet) error {
	return r.db.Save(snippet).Error
}

// DeleteCodeSnippet 删除代码片段
func (r *Repository) DeleteCodeSnippet(id uint) error {
	return r.db.Delete(&model.CodeSnippet{}, id).Error
}

// GetEnabledCodeSnippets 获取启用的代码片段（用于用户端）
func (r *Repository) GetEnabledCodeSnippets() ([]model.CodeSnippet, error) {
	var snippets []model.CodeSnippet
	err := r.db.Where("is_enabled = ?", true).
		Order("priority ASC").
		Find(&snippets).Error
	return snippets, err
}

// GetEnabledCodeSnippetsByPosition 根据位置获取启用的代码片段
func (r *Repository) GetEnabledCodeSnippetsByPosition(position string) ([]model.CodeSnippet, error) {
	var snippets []model.CodeSnippet
	err := r.db.Where("is_enabled = ? AND position = ?", true, position).
		Order("priority ASC").
		Find(&snippets).Error
	return snippets, err
}
