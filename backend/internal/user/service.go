// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package user

import (
	"errors"
	"fmt"
	"scholar-backend/internal/common/model"
	"scholar-backend/internal/common/utils"
	"time"
)

// ConfigService interface for email, SMS, and OAuth configuration
type ConfigService interface {
	GetActiveEmailConfig() (*model.EmailConfig, error)
	GetActiveSMSConfig() (*model.SMSConfig, error)
	GetSystemConfig() (*model.SystemConfig, error)
	GetGithubOAuthConfig() (*model.GithubOAuthConfig, error)
	GetGoogleOAuthConfig() (*model.GoogleOAuthConfig, error)
	GetOrcidOAuthConfig() (*model.OrcidOAuthConfig, error)
	GetMicrosoftOAuthConfig() (*model.MicrosoftOAuthConfig, error)
	GetAppleOAuthConfig() (*model.AppleOAuthConfig, error)
	GetDiscourseSSOConfig() (*model.DiscourseSSOConfig, error)
}

// MessageService interface for sending in-app messages
type MessageService interface {
	SendToUser(userID uint, title, content string, category string, linkURL, linkText string) error
}

// 哨兵错误，用于 handler 层的错误类型判断，避免字符串比较
var (
	ErrSessionExpired         = errors.New("登录已过期,请重新登录")
	ErrSessionNotFound        = errors.New("会话不存在,请重新登录")
	ErrCurrentPasswordInvalid = errors.New("当前密码不正确")
)

// Service handles business logic for user operations
type Service struct {
	repo           *Repository
	configService  ConfigService
	messageService MessageService
}

// NewService creates a new user service
func NewService(repo *Repository) *Service {
	return &Service{
		repo:          repo,
		configService: nil, // 通过 SetConfigService 注入
	}
}

// SetConfigService sets the config service (for dependency injection)
func (s *Service) SetConfigService(configService ConfigService) {
	s.configService = configService
}

// SetMessageService sets the message service (for dependency injection)
func (s *Service) SetMessageService(messageService MessageService) {
	s.messageService = messageService
}

// GetSystemConfig gets the system configuration
func (s *Service) GetSystemConfig() (*model.SystemConfig, error) {
	if s.configService == nil {
		return nil, fmt.Errorf("config service not initialized")
	}
	return s.configService.GetSystemConfig()
}

// FindAuthProviderByUserAndProvider finds an auth provider record for a user
func (s *Service) FindAuthProviderByUserAndProvider(userID uint, provider string) (*UserAuthProvider, error) {
	return s.repo.FindAuthProviderByUserAndProvider(userID, provider)
}

// CheckEmailExists checks if an email is already registered
func (s *Service) CheckEmailExists(email string) (bool, error) {
	user, err := s.repo.FindByEmail(email)
	if err != nil {
		return false, err
	}
	return user != nil, nil
}

// generateRandomUsername generates a random username in format "user_XXXXXX"
func (s *Service) generateRandomUsername() (string, error) {
	maxAttempts := 10
	for i := 0; i < maxAttempts; i++ {
		// Generate random 6-digit number
		randomNum := utils.SecureRandomIntn(1000000)
		username := fmt.Sprintf("user_%06d", randomNum)

		// Check if username already exists
		existing, err := s.repo.FindByUsername(username)
		if err != nil {
			return "", err
		}

		if existing == nil {
			return username, nil
		}
	}

	// If all attempts failed, use timestamp + random
	timestamp := time.Now().Unix()
	randomSuffix := utils.SecureRandomIntn(10000)
	return fmt.Sprintf("user_%d_%04d", timestamp, randomSuffix), nil
}

func (s *Service) getUserRole(user *User) string {
	if user != nil && user.Role != "" {
		return user.Role
	}
	return "user"
}

func (s *Service) generateTokenForUser(user *User, username string) (string, error) {
	return utils.GenerateTokenWithRole(user.ID, username, "user", s.getUserRole(user))
}

// ==================== Repository delegation methods (for Handler use) ====================

func (s *Service) FindByID(id uint) (*User, error) {
	return s.repo.FindByID(id)
}

func (s *Service) FindByEmail(email string) (*User, error) {
	return s.repo.FindByEmail(email)
}

func (s *Service) FindByUsername(username string) (*User, error) {
	return s.repo.FindByUsername(username)
}

func (s *Service) FindAuthProvider(provider, providerUserID string) (*UserAuthProvider, error) {
	return s.repo.FindAuthProvider(provider, providerUserID)
}

func (s *Service) CreateUser(user *User) error {
	return s.repo.Create(user)
}

func (s *Service) UpdateUser(user *User) error {
	return s.repo.Update(user)
}

func (s *Service) CreateAuthProvider(provider *UserAuthProvider) error {
	return s.repo.CreateAuthProvider(provider)
}

func (s *Service) UpdateAuthProvider(provider *UserAuthProvider) error {
	return s.repo.UpdateAuthProvider(provider)
}

func (s *Service) UpdateLastLoginWithIP(id uint, ip string) error {
	return s.repo.UpdateLastLoginWithIP(id, ip)
}

func (s *Service) GetGithubOAuthConfig() (*model.GithubOAuthConfig, error) {
	if s.configService == nil {
		return nil, fmt.Errorf("config service not initialized")
	}
	return s.configService.GetGithubOAuthConfig()
}

func (s *Service) GetDiscourseSSOConfig() (*model.DiscourseSSOConfig, error) {
	if s.configService == nil {
		return nil, fmt.Errorf("config service not initialized")
	}
	return s.configService.GetDiscourseSSOConfig()
}
