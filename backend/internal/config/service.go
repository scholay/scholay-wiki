// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package config

import (
	"scholar-backend/internal/common/model"
)

// Service handles business logic for config operations
type Service struct {
	repo *Repository
}

// NewService creates a new config service
func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

// 隐私政策 / 服务条款 已下线 —— 见 frontend-v2/src/features/help/legal-content.ts + 0046 迁移。

// GetActiveEmailConfig gets the active email configuration
func (s *Service) GetActiveEmailConfig() (*model.EmailConfig, error) {
	return s.repo.FindActiveEmailConfig()
}

// CreateEmailConfig creates a new email configuration and deactivates old ones
func (s *Service) CreateEmailConfig(config *model.EmailConfig) error {
	// Deactivate all existing configs
	err := s.repo.DeactivateAllEmailConfigs()
	if err != nil {
		return err
	}

	// Create new config
	return s.repo.CreateEmailConfig(config)
}

// InitializeDefaultSystemConfig creates default system config if none exists
func (s *Service) InitializeDefaultSystemConfig() error {
	config, err := s.repo.GetSystemConfig()
	if err != nil {
		return err
	}

	// If config exists, don't create default
	if config != nil {
		return nil
	}

	// Create default system config
	defaultConfig := &model.SystemConfig{
		RequireEmailVerification: true,
	}

	return s.repo.CreateSystemConfig(defaultConfig)
}

// GetSystemConfig gets the system configuration
func (s *Service) GetSystemConfig() (*model.SystemConfig, error) {
	return s.repo.GetSystemConfig()
}

// UpdateSystemConfig updates system configuration
// SystemConfigPartialUpdate represents a partial update request for system config
type SystemConfigPartialUpdate struct {
	RequireEmailVerification *bool
	EnableTurnstile          *bool
	TurnstileSiteKey         *string
	TurnstileSecretKey       *string
}

// UpdateSystemConfigPartial updates system configuration with partial update support
// Only non-nil fields in the request will be updated
func (s *Service) UpdateSystemConfigPartial(req *SystemConfigPartialUpdate) error {
	config, err := s.repo.GetSystemConfig()
	if err != nil {
		return err
	}

	if config == nil {
		// Create new config with provided values (use defaults for nil fields)
		config = &model.SystemConfig{
			RequireEmailVerification: true, // default
		}
	}

	// Update only non-nil fields (partial update)
	if req.RequireEmailVerification != nil {
		config.RequireEmailVerification = *req.RequireEmailVerification
	}
	if req.EnableTurnstile != nil {
		config.EnableTurnstile = *req.EnableTurnstile
	}
	if req.TurnstileSiteKey != nil {
		config.TurnstileSiteKey = *req.TurnstileSiteKey
	}
	if req.TurnstileSecretKey != nil {
		config.TurnstileSecretKey = *req.TurnstileSecretKey
	}

	if config.ID == 0 {
		return s.repo.CreateSystemConfig(config)
	}
	return s.repo.UpdateSystemConfig(config)
}

// GetActiveSMSConfig gets the active SMS configuration
func (s *Service) GetActiveSMSConfig() (*model.SMSConfig, error) {
	return s.repo.FindActiveSMSConfig()
}

// CreateSMSConfig creates a new SMS configuration and deactivates old ones
func (s *Service) CreateSMSConfig(config *model.SMSConfig) error {
	// Deactivate all existing configs
	err := s.repo.DeactivateAllSMSConfigs()
	if err != nil {
		return err
	}

	// Create new config
	return s.repo.CreateSMSConfig(config)
}

// ============================================
// GitHub OAuth Configuration Methods
// ============================================

// GetGithubOAuthConfig gets the GitHub OAuth configuration
func (s *Service) GetGithubOAuthConfig() (*model.GithubOAuthConfig, error) {
	return s.repo.GetGithubOAuthConfig()
}

// UpdateGithubOAuthConfig updates or creates GitHub OAuth configuration
func (s *Service) UpdateGithubOAuthConfig(clientID, clientSecret, redirectURI string, enabled bool) error {
	config, err := s.repo.GetGithubOAuthConfig()
	if err != nil {
		return err
	}

	if config == nil {
		// Create new config
		config = &model.GithubOAuthConfig{
			ClientID:     clientID,
			ClientSecret: clientSecret,
			RedirectURI:  redirectURI,
			Enabled:      enabled,
		}
		return s.repo.CreateGithubOAuthConfig(config)
	}

	// Update existing config
	config.ClientID = clientID
	config.ClientSecret = clientSecret
	config.RedirectURI = redirectURI
	config.Enabled = enabled
	return s.repo.UpdateGithubOAuthConfig(config)
}

// ============================================
// Google OAuth Configuration Methods
// ============================================

// GetGoogleOAuthConfig gets the Google OAuth configuration
func (s *Service) GetGoogleOAuthConfig() (*model.GoogleOAuthConfig, error) {
	return s.repo.GetGoogleOAuthConfig()
}

// UpdateGoogleOAuthConfig updates or creates Google OAuth configuration
func (s *Service) UpdateGoogleOAuthConfig(clientID, clientSecret string, enabled bool) error {
	config, err := s.repo.GetGoogleOAuthConfig()
	if err != nil {
		return err
	}

	if config == nil {
		config = &model.GoogleOAuthConfig{
			ClientID:     clientID,
			ClientSecret: clientSecret,
			Enabled:      enabled,
		}
		return s.repo.CreateGoogleOAuthConfig(config)
	}

	config.ClientID = clientID
	config.ClientSecret = clientSecret
	config.Enabled = enabled
	return s.repo.UpdateGoogleOAuthConfig(config)
}

// ============================================
// ORCID OAuth Configuration Methods
// ============================================

func (s *Service) GetOrcidOAuthConfig() (*model.OrcidOAuthConfig, error) {
	return s.repo.GetOrcidOAuthConfig()
}

func (s *Service) UpdateOrcidOAuthConfig(clientID, clientSecret, redirectURI string, useSandbox, enabled bool) error {
	config, err := s.repo.GetOrcidOAuthConfig()
	if err != nil {
		return err
	}
	if config == nil {
		config = &model.OrcidOAuthConfig{
			ClientID:     clientID,
			ClientSecret: clientSecret,
			RedirectURI:  redirectURI,
			UseSandbox:   useSandbox,
			Enabled:      enabled,
		}
		return s.repo.CreateOrcidOAuthConfig(config)
	}
	config.ClientID = clientID
	config.ClientSecret = clientSecret
	config.RedirectURI = redirectURI
	config.UseSandbox = useSandbox
	config.Enabled = enabled
	return s.repo.UpdateOrcidOAuthConfig(config)
}

// ============================================
// Microsoft OAuth Configuration Methods
// ============================================

func (s *Service) GetMicrosoftOAuthConfig() (*model.MicrosoftOAuthConfig, error) {
	return s.repo.GetMicrosoftOAuthConfig()
}

func (s *Service) UpdateMicrosoftOAuthConfig(clientID, clientSecret, redirectURI, tenant string, enabled bool) error {
	config, err := s.repo.GetMicrosoftOAuthConfig()
	if err != nil {
		return err
	}
	if tenant == "" {
		tenant = "common"
	}
	if config == nil {
		config = &model.MicrosoftOAuthConfig{
			ClientID:     clientID,
			ClientSecret: clientSecret,
			RedirectURI:  redirectURI,
			Tenant:       tenant,
			Enabled:      enabled,
		}
		return s.repo.CreateMicrosoftOAuthConfig(config)
	}
	config.ClientID = clientID
	config.ClientSecret = clientSecret
	config.RedirectURI = redirectURI
	config.Tenant = tenant
	config.Enabled = enabled
	return s.repo.UpdateMicrosoftOAuthConfig(config)
}

// ============================================
// Apple OAuth Configuration Methods
// ============================================

func (s *Service) GetAppleOAuthConfig() (*model.AppleOAuthConfig, error) {
	return s.repo.GetAppleOAuthConfig()
}

func (s *Service) UpdateAppleOAuthConfig(serviceID, teamID, keyID, privateKey, redirectURI string, enabled bool) error {
	config, err := s.repo.GetAppleOAuthConfig()
	if err != nil {
		return err
	}
	if config == nil {
		config = &model.AppleOAuthConfig{
			ServiceID:   serviceID,
			TeamID:      teamID,
			KeyID:       keyID,
			PrivateKey:  privateKey,
			RedirectURI: redirectURI,
			Enabled:     enabled,
		}
		return s.repo.CreateAppleOAuthConfig(config)
	}
	config.ServiceID = serviceID
	config.TeamID = teamID
	config.KeyID = keyID
	if privateKey != "" {
		config.PrivateKey = privateKey
	}
	config.RedirectURI = redirectURI
	config.Enabled = enabled
	return s.repo.UpdateAppleOAuthConfig(config)
}

// ============================================
// Discourse SSO Configuration Methods
// ============================================

// GetDiscourseSSOConfig gets the Discourse SSO configuration
func (s *Service) GetDiscourseSSOConfig() (*model.DiscourseSSOConfig, error) {
	return s.repo.GetDiscourseSSOConfig()
}

// UpdateDiscourseSSOConfig updates or creates Discourse SSO configuration
func (s *Service) UpdateDiscourseSSOConfig(siteURL, ssoSecret, redirectURI string, enabled bool) error {
	config, err := s.repo.GetDiscourseSSOConfig()
	if err != nil {
		return err
	}

	if config == nil {
		// Create new config
		config = &model.DiscourseSSOConfig{
			SiteURL:     siteURL,
			SSOSecret:   ssoSecret,
			RedirectURI: redirectURI,
			Enabled:     enabled,
		}
		return s.repo.CreateDiscourseSSOConfig(config)
	}

	// Update existing config
	config.SiteURL = siteURL
	config.SSOSecret = ssoSecret
	config.RedirectURI = redirectURI
	config.Enabled = enabled
	return s.repo.UpdateDiscourseSSOConfig(config)
}

// ============================================
// Code Snippets (SEO/广告) Configuration Methods
// ============================================

// ListCodeSnippets 获取代码片段列表
func (s *Service) ListCodeSnippets(category string) ([]model.CodeSnippet, error) {
	return s.repo.ListCodeSnippets(category)
}

// GetCodeSnippetByID 根据ID获取代码片段
func (s *Service) GetCodeSnippetByID(id uint) (*model.CodeSnippet, error) {
	return s.repo.GetCodeSnippetByID(id)
}

// CreateCodeSnippet 创建代码片段
func (s *Service) CreateCodeSnippet(snippet *model.CodeSnippet) error {
	return s.repo.CreateCodeSnippet(snippet)
}

// UpdateCodeSnippet 更新代码片段
func (s *Service) UpdateCodeSnippet(snippet *model.CodeSnippet) error {
	return s.repo.UpdateCodeSnippet(snippet)
}

// DeleteCodeSnippet 删除代码片段
func (s *Service) DeleteCodeSnippet(id uint) error {
	return s.repo.DeleteCodeSnippet(id)
}

// GetEnabledCodeSnippets 获取启用的代码片段（用于用户端前端）
func (s *Service) GetEnabledCodeSnippets() ([]model.CodeSnippet, error) {
	return s.repo.GetEnabledCodeSnippets()
}

// GetCodeSnippetsGrouped 获取按位置分组的代码片段（用于用户端前端）
func (s *Service) GetCodeSnippetsGrouped() (*model.CodeSnippetsGroupedResponse, error) {
	snippets, err := s.repo.GetEnabledCodeSnippets()
	if err != nil {
		return nil, err
	}

	result := &model.CodeSnippetsGroupedResponse{
		Head:      []model.CodeSnippetResponse{},
		BodyStart: []model.CodeSnippetResponse{},
		BodyEnd:   []model.CodeSnippetResponse{},
	}

	for _, snippet := range snippets {
		item := model.CodeSnippetResponse{
			Position:    snippet.Position,
			CodeContent: snippet.CodeContent,
			Priority:    snippet.Priority,
		}
		switch snippet.Position {
		case model.PositionHead:
			result.Head = append(result.Head, item)
		case model.PositionBodyStart:
			result.BodyStart = append(result.BodyStart, item)
		case model.PositionBodyEnd:
			result.BodyEnd = append(result.BodyEnd, item)
		}
	}

	return result, nil
}
