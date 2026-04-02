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

// InitializeDefaultPrivacyPolicy creates default privacy policy if none exists
func (s *Service) InitializeDefaultPrivacyPolicy() error {
	// Check if any privacy policy exists
	policy, err := s.repo.FindActivePrivacyPolicy()
	if err != nil {
		return err
	}

	// If policy exists, don't create default
	if policy != nil {
		return nil
	}

	// Create default privacy policy
	defaultPolicy := &model.PrivacyPolicy{
		Content: `我们重视并保护您的隐私。本隐私政策说明了我们如何收集、使用和保护您的个人信息。

1. 信息收集
我们收集您在注册和使用服务时提供的信息，包括但不限于电子邮箱地址。

2. 信息使用
我们使用收集的信息来提供、维护和改进我们的服务。

3. 信息保护
我们采取适当的安全措施来保护您的个人信息。

4. 信息共享
未经您的同意，我们不会与第三方共享您的个人信息。

最后更新日期：2025年1月`,
		Version:  "1.0",
		IsActive: true,
	}

	return s.repo.CreatePrivacyPolicy(defaultPolicy)
}

// GetActivePrivacyPolicy gets the active privacy policy
func (s *Service) GetActivePrivacyPolicy() (*model.PrivacyPolicy, error) {
	return s.repo.FindActivePrivacyPolicy()
}

// CreatePrivacyPolicy creates a new privacy policy and deactivates old ones
func (s *Service) CreatePrivacyPolicy(policy *model.PrivacyPolicy) error {
	// Deactivate all existing policies
	err := s.repo.DeactivateAllPolicies()
	if err != nil {
		return err
	}

	// Create new policy
	return s.repo.CreatePrivacyPolicy(policy)
}

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

// InitializeDefaultTermsOfService creates default terms of service if none exists
func (s *Service) InitializeDefaultTermsOfService() error {
	// Check if any terms of service exists
	terms, err := s.repo.FindActiveTermsOfService()
	if err != nil {
		return err
	}

	// If terms exists, don't create default
	if terms != nil {
		return nil
	}

	// Create default terms of service
	defaultTerms := &model.TermsOfService{
		Content: `欢迎使用 Scholar 学术搜索平台服务。请仔细阅读以下条款：

1. 服务说明
Scholar 提供学术论文搜索、AI分析等服务。我们保留随时修改或终止服务的权利。

2. 用户责任
用户应遵守相关法律法规，不得利用本平台从事违法活动。用户对其账户的所有活动负责。

3. 知识产权
本平台的所有内容和功能均受知识产权法保护。未经授权，不得复制或使用。

4. 免责声明
本平台按"现状"提供服务，不对服务的准确性、可靠性或适用性作任何保证。

5. 服务变更
我们保留随时修改这些条款的权利。继续使用服务即表示您接受修改后的条款。

最后更新日期：2025年1月`,
		Version:  "1.0",
		IsActive: true,
	}

	return s.repo.CreateTermsOfService(defaultTerms)
}

// GetActiveTermsOfService gets the active terms of service
func (s *Service) GetActiveTermsOfService() (*model.TermsOfService, error) {
	return s.repo.FindActiveTermsOfService()
}

// CreateTermsOfService creates a new terms of service and deactivates old ones
func (s *Service) CreateTermsOfService(terms *model.TermsOfService) error {
	// Deactivate all existing terms
	err := s.repo.DeactivateAllTermsOfService()
	if err != nil {
		return err
	}

	// Create new terms
	return s.repo.CreateTermsOfService(terms)
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
