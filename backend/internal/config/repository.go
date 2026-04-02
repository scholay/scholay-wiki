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

// FindActivePrivacyPolicy finds the active privacy policy
func (r *Repository) FindActivePrivacyPolicy() (*model.PrivacyPolicy, error) {
	var policy model.PrivacyPolicy
	err := r.db.Where("is_active = ?", true).
		Order("created_at DESC").
		First(&policy).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
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

// FindActiveTermsOfService finds the active terms of service
func (r *Repository) FindActiveTermsOfService() (*model.TermsOfService, error) {
	var terms model.TermsOfService
	err := r.db.Where("is_active = ?", true).
		Order("created_at DESC").
		First(&terms).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &terms, err
}

// CreateTermsOfService creates a new terms of service
func (r *Repository) CreateTermsOfService(terms *model.TermsOfService) error {
	return r.db.Create(terms).Error
}

// DeactivateAllTermsOfService deactivates all existing terms of service
func (r *Repository) DeactivateAllTermsOfService() error {
	return r.db.Model(&model.TermsOfService{}).
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
