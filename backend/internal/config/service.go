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
func (s *Service) UpdateSystemConfig(requireEmailVerification bool) error {
	config, err := s.repo.GetSystemConfig()
	if err != nil {
		return err
	}

	if config == nil {
		// Create if not exists
		config = &model.SystemConfig{
			RequireEmailVerification: requireEmailVerification,
		}
		return s.repo.CreateSystemConfig(config)
	}

	config.RequireEmailVerification = requireEmailVerification
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
