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
	_ = invitationCode // 旧 body 字段仅兼容；归因真源是 middleware/OAuth state 恢复的 X-Invite-Code ctx。

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
		return nil, "", errors.New("该手机号已注册,请直接登录")
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
			return errors.New("该手机号已注册,请直接登录")
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

	// 邀请归因(best-effort):事务已提交、新用户已存在;失败只记日志,绝不影响注册返回。
	notifyInviteRegistered(ctx, user.ID, "phone")

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

	// 统一口径 + 恒定耗时(同 LoginWithEmail):不靠文案/快慢泄露手机号是否注册。
	// 「不存在 / 未设密码 / 密码错」一律「手机号或密码错误」;停用留到密码正确后再说。
	// 管理员/超管不再特殊处理:与普通用户共用本登录入口。
	hash := dummyBcryptHash
	if user != nil && user.PasswordHash != nil {
		hash = *user.PasswordHash
	}
	passwordOK := utils.CheckPassword(password, hash)
	if user == nil || user.PasswordHash == nil || !passwordOK {
		return nil, "", errors.New("手机号或密码错误")
	}

	// 密码正确后才区分停用 —— 对方已证明掌控账号,可如实告知。
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

// ResetPasswordPhone resets user password with phone verification code.
// 返回 userID 供 handler 调 utils.RevokeUserAllTokens 踢掉该用户所有 token。
func (s *Service) ResetPasswordPhone(ctx context.Context, phone, code, newPassword string) (uint, error) {
	// Verify the code
	valid, err := cache.VerifyCode(ctx, phone, code, "reset_password")
	if err != nil {
		return 0, fmt.Errorf("failed to verify code: %w", err)
	}
	if !valid {
		return 0, errors.New("验证码无效或已过期")
	}

	// Find user by phone
	user, err := s.repo.FindByPhone(phone)
	if err != nil {
		return 0, err
	}
	// 验证码已校验通过 = 已证明掌控该手机号(攻击者拿不到别人的码,错 5 次即烧码),
	// 故如实告知「未注册」不构成枚举,让走「忘记密码」却没注册的用户不再一头雾水。
	if user == nil {
		return 0, errors.New("该手机号未注册,请先注册")
	}

	// Hash new password
	hashedPassword, err := utils.HashPassword(newPassword)
	if err != nil {
		return 0, fmt.Errorf("failed to hash password: %w", err)
	}

	if err := s.repo.UpdatePassword(user.ID, hashedPassword); err != nil {
		return 0, err
	}
	return user.ID, nil
}

// LoginWithPhoneCode logs in a user with phone and verification code
func (s *Service) LoginWithPhoneCode(ctx context.Context, phone, code, ip string) (*User, string, bool, error) {
	// Verify the code
	valid, err := cache.VerifyCode(ctx, phone, code, "login")
	if err != nil {
		return nil, "", false, fmt.Errorf("failed to verify code: %w", err)
	}
	if !valid {
		return nil, "", false, errors.New("验证码无效或已过期")
	}

	// Find user by phone
	user, err := s.repo.FindByPhone(phone)
	if err != nil {
		return nil, "", false, err
	}
	// 未注册 → 自动注册并直接登录:验证码已证明掌控该手机号,门槛与独立注册流等同
	// (Turnstile + 验证码 + 限流均已在上游通过),免去「先注册再登录」两步。
	if user == nil {
		return s.autoRegisterPhone(ctx, phone, ip)
	}

	// Check if user is active
	if user.Status != 1 {
		return nil, "", false, errors.New("账号已被停用")
	}

	// Update last login time and IP
	_ = s.repo.UpdateLastLoginWithIP(user.ID, ip)

	// Generate JWT token
	token, err := s.generateTokenForUser(user, "")
	if err != nil {
		return nil, "", false, err
	}

	return user, token, false, nil
}

// autoRegisterPhone 在「验证码登录时手机号尚未注册」时自动建号并登录。
// 调用方已校验验证码(证明掌控该号)+ Turnstile,故此处不再二次校验码;创建的是**无密码**账号
// (与 OAuth 账号一致,后续可经改密设置),手机号置为已验证、账号 active。
// 并发下若被同号请求抢先建号,事务内回退为复用既有账号(不报错、不重复发欢迎)。
func (s *Service) autoRegisterPhone(ctx context.Context, phone, ip string) (*User, string, bool, error) {
	var user *User
	var created bool
	err := s.repo.ExecuteInTransaction(func(txRepo *Repository) error {
		existing, err := txRepo.FindByPhone(phone)
		if err != nil {
			return err
		}
		if existing != nil {
			user = existing // 并发抢先建号 → 复用登录
			return nil
		}
		username, err := s.generateRandomUsername()
		if err != nil {
			return fmt.Errorf("failed to generate username: %w", err)
		}
		user = &User{
			Phone:         &phone,
			Username:      &username,
			Role:          "user",
			Status:        1,
			PhoneVerified: true,
		}
		if err := txRepo.Create(user); err != nil {
			return err
		}
		_ = txRepo.UpdateLastLoginWithIP(user.ID, ip)
		if err := txRepo.CreateAuthProvider(&UserAuthProvider{
			UserID:         user.ID,
			Provider:       "phone",
			ProviderUserID: phone,
		}); err != nil {
			return err
		}
		created = true
		return nil
	})
	if err != nil && isDuplicateUserIdentity(err) {
		if winner, lookupErr := s.repo.FindByPhone(phone); lookupErr == nil && winner != nil {
			user, created, err = winner, false, nil
		}
	}
	if err != nil {
		return nil, "", false, err
	}
	if user.Status != 1 {
		return nil, "", false, errors.New("账号已被停用")
	}
	_ = s.repo.UpdateLastLoginWithIP(user.ID, ip)
	tokenUsername := phone
	if user.Username != nil {
		tokenUsername = *user.Username
	}
	token, err := s.generateTokenForUser(user, tokenUsername)
	if err != nil {
		return nil, "", false, err
	}
	if created {
		s.SendWelcomeMessage(user.ID)
		// 邀请归因(best-effort):仅本次真的新建号才归因;并发复用既有账号(created=false)不算。
		notifyInviteRegistered(ctx, user.ID, "phone")
	}
	return user, token, created, nil
}

// BindPhone binds a phone number to an existing user account.
//
// 安全设计(与 BindEmail 对称):
//   - 首次绑定(user.Phone == nil):只需新手机的 bind 验证码
//   - 换绑场景(user.Phone 已存在 且 新号 != 旧号):需要 *两份* 验证码 ——
//     1. 新手机的 bind code,证明用户控制新号码
//     2. 旧手机的 change_phone code,证明用户掌控旧号码(防 session 被偷夺号)
//
// oldPhoneCode 在首次绑定场景下可以为空;换绑时必填。
// BindVerifiedPhone 绑定一个「已被外部验证过」的手机号(小程序 getPhoneNumber:微信已验证,
// 无需短信码)。做唯一性校验 + 事务内 set phone/phone_verified + upsert phone provider。
// 幂等:已绑同号直接成功。
func (s *Service) BindVerifiedPhone(userID uint, phone string) error {
	if phone == "" {
		return errors.New("手机号为空")
	}
	existing, err := s.repo.FindByPhone(phone)
	if err != nil {
		return err
	}
	if existing != nil && existing.ID != userID {
		return errors.New("该手机号已被其他账号绑定")
	}
	cur, err := s.repo.FindByID(userID)
	if err != nil {
		return err
	}
	if cur == nil {
		return errors.New("用户不存在")
	}
	if cur.Phone != nil && *cur.Phone == phone {
		return nil
	}
	return s.repo.ExecuteInTransaction(func(txRepo *Repository) error {
		user, err := txRepo.FindByID(userID)
		if err != nil {
			return err
		}
		if user == nil {
			return errors.New("用户不存在")
		}
		user.Phone = &phone
		user.PhoneVerified = true
		if err := txRepo.Update(user); err != nil {
			return err
		}
		ap, err := txRepo.FindAuthProviderByUserAndProvider(userID, "phone")
		if err != nil {
			return err
		}
		if ap == nil {
			return txRepo.CreateAuthProvider(&UserAuthProvider{UserID: userID, Provider: "phone", ProviderUserID: phone})
		}
		ap.ProviderUserID = phone
		return txRepo.UpdateAuthProvider(ap)
	})
}

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
