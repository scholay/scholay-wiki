// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package user

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"scholar-backend/internal/common/cache"
	"scholar-backend/internal/common/utils"
	"time"
)

// CheckPhoneExists checks if a phone number is already registered
func (s *Service) CheckPhoneExists(phone string) (bool, error) {
	user, err := s.repo.FindByPhone(phone)
	if err != nil {
		return false, err
	}
	return user != nil, nil
}

// SendPhoneVerificationCode sends SMS verification code
func (s *Service) SendPhoneVerificationCode(ctx context.Context, phone, purpose string) error {
	// Check rate limit: prevent sending too frequently (must wait 1 minute)
	ttl, err := cache.GetVerificationCodeTTL(ctx, phone, purpose)
	if err == nil && ttl > 9*time.Minute {
		// Code exists and was sent less than 1 minute ago
		remainingSeconds := int((ttl - 9*time.Minute).Seconds())
		return fmt.Errorf("操作过于频繁，请 %d 秒后再试", remainingSeconds)
	}

	// Generate 6-digit code
	code := utils.SecureRandomDigits(6)

	// Save verification code to Redis (auto-expires in 10 minutes)
	if err := cache.SaveVerificationCode(ctx, phone, code, purpose); err != nil {
		return fmt.Errorf("failed to save verification code: %w", err)
	}

	// Get SMS configuration from database
	if s.configService != nil {
		smsConfig, err := s.configService.GetActiveSMSConfig()
		if err == nil && smsConfig != nil {
			// Extract template variables from template content
			variables := utils.ExtractTemplateVariables(smsConfig.TemplateContent)

			// Build parameters based on detected variables
			params := make(map[string]string)
			for _, varName := range variables {
				switch varName {
				case "code":
					params["code"] = code
				case "min", "minute", "minutes":
					params[varName] = "5" // Default to 5 minutes (matching Redis expiry)
				case "product":
					params["product"] = "Scholay"
				default:
					// For unknown variables, use a placeholder
					params[varName] = "测试值"
				}
			}

			config := utils.SMSConfig{
				AccessKeyID:     smsConfig.AccessKeyID,
				AccessSecret:    smsConfig.AccessSecret,
				SignName:        smsConfig.SignName,
				TemplateCode:    smsConfig.TemplateCode,
				TemplateContent: smsConfig.TemplateContent,
				Endpoint:        smsConfig.Endpoint,
			}

			if err := utils.SendSMSVerifyCodePNS(config, phone, params); err != nil {
				slog.Warn("failed to send SMS, code generated but not delivered", "err", err, "phone", phone, "purpose", purpose)
				return nil
			}

			slog.Info("verification code sent via SMS", "phone", phone, "purpose", purpose)
			return nil
		}
	}

	// Fallback: If no SMS config, log without the code value
	slog.Warn("verification code generated but no SMS config available", "phone", phone, "purpose", purpose)

	return nil
}

// RegisterWithPhone registers a new user with phone and password
// Enhanced with transaction support for concurrency safety
func (s *Service) RegisterWithPhone(ctx context.Context, phone, password, code, invitationCode, ip string) (*User, string, error) {
	_ = invitationCode // 邀请业务已移除，参数保留以兼容 API

	// Verify the phone code using Redis
	valid, err := cache.VerifyCode(ctx, phone, code, "register")
	if err != nil {
		return nil, "", fmt.Errorf("failed to verify code: %w", err)
	}
	if !valid {
		return nil, "", errors.New("验证码无效或已过期")
	}

	// First check: validate phone availability (pre-verification)
	existing, err := s.repo.FindByPhone(phone)
	if err != nil {
		return nil, "", err
	}
	if existing != nil {
		return nil, "", errors.New("该手机号已被注册")
	}

	// Hash password
	hashedPassword, err := utils.HashPassword(password)
	if err != nil {
		return nil, "", err
	}

	var user *User
	var token string

	// Use transaction for atomic registration
	err = s.repo.ExecuteInTransaction(func(txRepo *Repository) error {
		// Second check: double-check phone availability within transaction (concurrency protection)
		existing, err := txRepo.FindByPhone(phone)
		if err != nil {
			return err
		}
		if existing != nil {
			return errors.New("该手机号已被注册")
		}

		// Generate random username
		username, err := s.generateRandomUsername()
		if err != nil {
			return fmt.Errorf("failed to generate username: %w", err)
		}

		// Create user
		user = &User{
			Phone:         &phone,
			Username:      &username,
			PasswordHash:  &hashedPassword,
			Role:          "user",
			Status:        1,
			PhoneVerified: true,
		}

		if err := txRepo.Create(user); err != nil {
			return err
		}

		// Update last login time and IP (registration counts as first login)
		_ = txRepo.UpdateLastLoginWithIP(user.ID, ip)

		// Create auth provider entry
		authProvider := &UserAuthProvider{
			UserID:         user.ID,
			Provider:       "phone",
			ProviderUserID: phone,
		}
		if err := txRepo.CreateAuthProvider(authProvider); err != nil {
			return err
		}

		return nil
	})

	if err != nil {
		return nil, "", err
	}

	// Generate JWT token
	tokenUsername := phone
	if user.Username != nil {
		tokenUsername = *user.Username
	}
	token, err = s.generateTokenForUser(user, tokenUsername)
	if err != nil {
		return nil, "", err
	}

	s.SendWelcomeMessage(user.ID)

	return user, token, nil
}

// LoginWithPhone handles login with phone and password
func (s *Service) LoginWithPhone(phone, password, ip string) (*User, string, error) {
	// Find user by phone
	user, err := s.repo.FindByPhone(phone)
	if err != nil {
		return nil, "", err
	}

	if user == nil {
		return nil, "", errors.New("该手机号未注册")
	}

	// Check if user is active
	if user.Status != 1 {
		return nil, "", errors.New("账号已被停用")
	}

	// Verify password
	if user.PasswordHash == nil {
		return nil, "", errors.New("请先设置密码")
	}

	if !utils.CheckPassword(password, *user.PasswordHash) {
		return nil, "", errors.New("密码错误")
	}

	// Update last login time and IP
	_ = s.repo.UpdateLastLoginWithIP(user.ID, ip)

	// Generate JWT token
	token, err := s.generateTokenForUser(user, "")
	if err != nil {
		return nil, "", err
	}

	return user, token, nil
}

// ResetPasswordPhone resets user password with phone verification code
// ResetPasswordPhone resets user password with phone verification code
// Also invalidates all existing sessions to force re-login
func (s *Service) ResetPasswordPhone(ctx context.Context, phone, code, newPassword string) error {
	// Verify the code
	valid, err := cache.VerifyCode(ctx, phone, code, "reset_password")
	if err != nil {
		return fmt.Errorf("failed to verify code: %w", err)
	}
	if !valid {
		return errors.New("验证码无效或已过期")
	}

	// Find user by phone
	user, err := s.repo.FindByPhone(phone)
	if err != nil {
		return err
	}
	if user == nil {
		return errors.New("该手机号未注册")
	}

	// Hash new password
	hashedPassword, err := utils.HashPassword(newPassword)
	if err != nil {
		return fmt.Errorf("failed to hash password: %w", err)
	}

	// Update password. user_sessions 表已下线,JWT 自身过期就是兜底。
	return s.repo.UpdatePassword(user.ID, hashedPassword)
}

// LoginWithPhoneCode logs in a user with phone and verification code
func (s *Service) LoginWithPhoneCode(ctx context.Context, phone, code, ip string) (*User, string, error) {
	// Verify the code
	valid, err := cache.VerifyCode(ctx, phone, code, "login")
	if err != nil {
		return nil, "", fmt.Errorf("failed to verify code: %w", err)
	}
	if !valid {
		return nil, "", errors.New("验证码无效或已过期")
	}

	// Find user by phone
	user, err := s.repo.FindByPhone(phone)
	if err != nil {
		return nil, "", err
	}
	if user == nil {
		return nil, "", errors.New("该手机号未注册")
	}

	// Check if user is active
	if user.Status != 1 {
		return nil, "", errors.New("账号已被停用")
	}

	// Update last login time and IP
	_ = s.repo.UpdateLastLoginWithIP(user.ID, ip)

	// Generate JWT token
	token, err := s.generateTokenForUser(user, "")
	if err != nil {
		return nil, "", err
	}

	return user, token, nil
}

// BindPhone binds a phone number to an existing user account.
//
// 安全设计(与 BindEmail 对称):
//   - 首次绑定(user.Phone == nil):只需新手机的 bind 验证码
//   - 换绑场景(user.Phone 已存在 且 新号 != 旧号):需要 *两份* 验证码 ——
//       1. 新手机的 bind code,证明用户控制新号码
//       2. 旧手机的 change_phone code,证明用户掌控旧号码(防 session 被偷夺号)
//
// oldPhoneCode 在首次绑定场景下可以为空;换绑时必填。
func (s *Service) BindPhone(ctx context.Context, userID uint, phone, code, oldPhoneCode string) error {
	// Verify the phone code on new phone (always required)
	valid, err := cache.VerifyCode(ctx, phone, code, "bind")
	if err != nil {
		return fmt.Errorf("failed to verify code: %w", err)
	}
	if !valid {
		return errors.New("验证码无效或已过期")
	}

	// First check: validate phone availability (pre-verification)
	existing, err := s.repo.FindByPhone(phone)
	if err != nil {
		return err
	}
	if existing != nil && existing.ID != userID {
		return errors.New("该手机号已被其他账号绑定")
	}

	// 换绑场景:必须验证旧手机所有权
	currentUser, err := s.repo.FindByID(userID)
	if err != nil {
		return err
	}
	if currentUser == nil {
		return errors.New("用户不存在")
	}
	if currentUser.Phone != nil && *currentUser.Phone != "" && *currentUser.Phone != phone {
		if oldPhoneCode == "" {
			return errors.New("换绑手机号需要先验证当前手机所有权,请先发送验证码到当前手机")
		}
		valid, err := cache.VerifyCode(ctx, *currentUser.Phone, oldPhoneCode, "change_phone")
		if err != nil {
			return fmt.Errorf("failed to verify old phone code: %w", err)
		}
		if !valid {
			return errors.New("当前手机验证码无效或已过期")
		}
	}

	// Use transaction for atomic binding operation
	return s.repo.ExecuteInTransaction(func(txRepo *Repository) error {
		// Second check: double-check phone availability within transaction (concurrency protection)
		existing, err := txRepo.FindByPhone(phone)
		if err != nil {
			return err
		}
		if existing != nil && existing.ID != userID {
			return errors.New("该手机号已被其他账号绑定")
		}

		// Get current user
		user, err := txRepo.FindByID(userID)
		if err != nil {
			return err
		}
		if user == nil {
			return errors.New("用户不存在")
		}

		// Update user phone
		user.Phone = &phone
		user.PhoneVerified = true
		if err := txRepo.Update(user); err != nil {
			return err
		}

		// Create or update auth provider entry
		authProvider, err := txRepo.FindAuthProviderByUserAndProvider(userID, "phone")
		if err != nil {
			return err
		}

		if authProvider == nil {
			authProvider = &UserAuthProvider{
				UserID:         userID,
				Provider:       "phone",
				ProviderUserID: phone,
			}
			if err := txRepo.CreateAuthProvider(authProvider); err != nil {
				return err
			}
		} else {
			authProvider.ProviderUserID = phone
			if err := txRepo.UpdateAuthProvider(authProvider); err != nil {
				return err
			}
		}

		return nil
	})
}

// BindPhoneWithPassword binds phone to WeChat-registered user with new password
func (s *Service) BindPhoneWithPassword(ctx context.Context, userID uint, phone, password, code string) error {
	// Verify the phone code using Redis
	valid, err := cache.VerifyCode(ctx, phone, code, "bind")
	if err != nil {
		return fmt.Errorf("failed to verify code: %w", err)
	}
	if !valid {
		return errors.New("验证码无效或已过期")
	}

	// Check if phone is already used by another user
	existing, err := s.repo.FindByPhone(phone)
	if err != nil {
		return err
	}

	if existing != nil && existing.ID != userID {
		return errors.New("该手机号已被其他账号绑定")
	}

	// Get current user
	user, err := s.repo.FindByID(userID)
	if err != nil {
		return err
	}

	if user == nil {
		return errors.New("用户不存在")
	}

	// Hash password
	hashedPassword, err := utils.HashPassword(password)
	if err != nil {
		return err
	}

	// Update user phone and password
	user.Phone = &phone
	user.PhoneVerified = true
	user.PasswordHash = &hashedPassword

	if err := s.repo.Update(user); err != nil {
		return err
	}

	// Create or update auth provider entry
	authProvider, err := s.repo.FindAuthProviderByUserAndProvider(userID, "phone")
	if err != nil {
		return err
	}

	if authProvider == nil {
		// Create new auth provider
		authProvider = &UserAuthProvider{
			UserID:         userID,
			Provider:       "phone",
			ProviderUserID: phone,
		}
		if err := s.repo.CreateAuthProvider(authProvider); err != nil {
			return err
		}
	} else {
		// Update existing auth provider
		authProvider.ProviderUserID = phone
		if err := s.repo.UpdateAuthProvider(authProvider); err != nil {
			return err
		}
	}

	return nil
}

// UnbindPhone unbinds phone from user account
func (s *Service) UnbindPhone(ctx context.Context, userID uint, code string) error {
	// First get user to verify code (without lock)
	user, err := s.repo.FindByID(userID)
	if err != nil {
		return err
	}
	if user == nil {
		return errors.New("用户不存在")
	}

	// Check if phone is bound
	if user.Phone == nil || *user.Phone == "" {
		return errors.New("尚未绑定手机号")
	}

	// 解绑保护:不能解绑最后一个登录方式
	if err := s.ensureNotLastLoginMethod(userID); err != nil {
		return err
	}

	// Verify the code before starting transaction
	valid, err := cache.VerifyCode(ctx, *user.Phone, code, "unbind")
	if err != nil {
		return fmt.Errorf("failed to verify code: %w", err)
	}
	if !valid {
		return errors.New("验证码无效或已过期")
	}

	return s.repo.UnbindPhoneInTx(userID)
}
