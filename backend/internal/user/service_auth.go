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
	"scholar-backend/internal/common/safego"
	"scholar-backend/internal/common/utils"
	"time"
)

// SendWelcomeMessage 发送新用户欢迎站内信
func (s *Service) SendWelcomeMessage(userID uint) {
	if s.messageService == nil {
		return
	}

	title := "欢迎加入 Scholay"
	content := "感谢注册！开始探索学术世界吧~"

	safego.Go("user-welcome-message", func() {
		if err := s.messageService.SendToUser(userID, title, content, "system", "/", "开始探索"); err != nil {
			slog.Error("failed to send welcome message", "user_id", userID, "err", err)
		}
	})
}

// RegisterWithEmail registers a new user with email and password
// Enhanced with transaction support for concurrency safety
func (s *Service) RegisterWithEmail(ctx context.Context, email, password, code, ip string) (*User, string, error) {
	return s.RegisterWithEmailAndInvitation(ctx, email, password, code, "", ip)
}

// RegisterWithEmailAndInvitation registers a new user with email, password and optional invitation code
func (s *Service) RegisterWithEmailAndInvitation(ctx context.Context, email, password, code, invitationCode, ip string) (*User, string, error) {
	_ = invitationCode // 邀请业务已移除，参数保留以兼容 API

	// Verify the email code using Redis (only if code is provided)
	if code != "" {
		valid, err := cache.VerifyCode(ctx, email, code, "register")
		if err != nil {
			return nil, "", fmt.Errorf("failed to verify code: %w", err)
		}
		if !valid {
			return nil, "", errors.New("invalid or expired verification code")
		}
	}

	// First check: validate email availability (pre-verification)
	existing, err := s.repo.FindByEmail(email)
	if err != nil {
		return nil, "", err
	}
	if existing != nil {
		return nil, "", errors.New("email already registered")
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
		// Second check: double-check email availability within transaction (concurrency protection)
		existing, err := txRepo.FindByEmail(email)
		if err != nil {
			return err
		}
		if existing != nil {
			return errors.New("email already registered")
		}

		// Generate random username
		username, err := s.generateRandomUsername()
		if err != nil {
			return fmt.Errorf("failed to generate username: %w", err)
		}

		// Create user
		user = &User{
			Email:         &email,
			Username:      &username,
			PasswordHash:  &hashedPassword,
			Role:          "user",
			Status:        1,
			EmailVerified: true,
		}

		if err := txRepo.Create(user); err != nil {
			return err
		}

		// Update last login time and IP (registration counts as first login)
		_ = txRepo.UpdateLastLoginWithIP(user.ID, ip)

		// Create auth provider record
		authProvider := &UserAuthProvider{
			UserID:         user.ID,
			Provider:       "email",
			ProviderUserID: email,
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
	tokenUsername := email
	if user.Username != nil {
		tokenUsername = *user.Username
	}
	token, err = s.generateTokenForUser(user, tokenUsername)
	if err != nil {
		return nil, "", err
	}

	// Record new user registration in statistics (async, non-blocking)
	safego.Go("user-increment-new-users", func() {
		today := time.Now().Format("2006-01-02")
		_ = s.repo.IncrementNewUsers(today)
	})

	// 发送欢迎站内信
	s.SendWelcomeMessage(user.ID)

	return user, token, nil
}

// LoginWithEmail logs in a user with email and password
func (s *Service) LoginWithEmail(email, password, ip string) (*User, string, error) {
	user, err := s.repo.FindByEmail(email)
	if err != nil {
		return nil, "", err
	}

	if user == nil {
		return nil, "", errors.New("invalid email or password")
	}

	if user.Status != 1 {
		return nil, "", errors.New("account is inactive or suspended")
	}

	if user.PasswordHash == nil {
		return nil, "", errors.New("email login not available for this account")
	}

	if !utils.CheckPassword(password, *user.PasswordHash) {
		return nil, "", errors.New("invalid email or password")
	}

	// Update last login time and IP
	_ = s.repo.UpdateLastLoginWithIP(user.ID, ip)

	// Generate JWT token
	username := email
	if user.Username != nil {
		username = *user.Username
	}
	token, err := s.generateTokenForUser(user, username)
	if err != nil {
		return nil, "", err
	}

	return user, token, nil
}

// ResetPassword resets user password with email verification code
// Also invalidates all existing sessions to force re-login
func (s *Service) ResetPassword(ctx context.Context, email, code, newPassword string) error {
	// Verify the code
	valid, err := cache.VerifyCode(ctx, email, code, "reset_password")
	if err != nil {
		return fmt.Errorf("failed to verify code: %w", err)
	}
	if !valid {
		return errors.New("invalid or expired verification code")
	}

	// Find user by email
	user, err := s.repo.FindByEmail(email)
	if err != nil {
		return err
	}
	if user == nil {
		return errors.New("email not found")
	}

	// Hash new password
	hashedPassword, err := utils.HashPassword(newPassword)
	if err != nil {
		return fmt.Errorf("failed to hash password: %w", err)
	}

	// Update password
	if err := s.repo.UpdatePassword(user.ID, hashedPassword); err != nil {
		return err
	}

	// Invalidate all existing sessions for this user (force re-login on all devices)
	return s.repo.DeleteUserSessions(user.ID)
}

// LoginWithEmailCode logs in a user with email and verification code
func (s *Service) LoginWithEmailCode(ctx context.Context, email, code, ip string) (*User, string, error) {
	// Verify the code
	valid, err := cache.VerifyCode(ctx, email, code, "login")
	if err != nil {
		return nil, "", fmt.Errorf("failed to verify code: %w", err)
	}
	if !valid {
		return nil, "", errors.New("invalid or expired verification code")
	}

	// Find user by email
	user, err := s.repo.FindByEmail(email)
	if err != nil {
		return nil, "", err
	}
	if user == nil {
		return nil, "", errors.New("email not found")
	}

	if user.Status != 1 {
		return nil, "", errors.New("account is inactive or suspended")
	}

	// Update last login time and IP
	_ = s.repo.UpdateLastLoginWithIP(user.ID, ip)

	// Generate JWT token
	username := email
	if user.Username != nil {
		username = *user.Username
	}
	token, err := s.generateTokenForUser(user, username)
	if err != nil {
		return nil, "", err
	}

	return user, token, nil
}

// SendVerificationCode sends a verification code to an email
func (s *Service) SendVerificationCode(ctx context.Context, email, purpose string) error {
	// Check rate limit: prevent sending too frequently (must wait 1 minute)
	ttl, err := cache.GetVerificationCodeTTL(ctx, email, purpose)
	if err == nil && ttl > 9*time.Minute {
		// Code exists and was sent less than 1 minute ago
		remainingSeconds := int((ttl - 9*time.Minute).Seconds())
		return fmt.Errorf("操作过于频繁，请 %d 秒后再试", remainingSeconds)
	}

	// Generate 6-digit code
	code := utils.SecureRandomDigits(6)

	// Save verification code to Redis (auto-expires in 10 minutes)
	if err := cache.SaveVerificationCode(ctx, email, code, purpose); err != nil {
		return fmt.Errorf("failed to save verification code: %w", err)
	}

	// Get email configuration from database
	if s.configService != nil {
		emailConfig, err := s.configService.GetActiveEmailConfig()
		if err == nil && emailConfig != nil {
			// Determine purpose text
			purposeText := "验证码"
			if purpose == "register" {
				purposeText = "注册验证码"
			} else if purpose == "reset_password" {
				purposeText = "重置密码验证码"
			} else if purpose == "login" {
				purposeText = "登录验证码"
			}

			// Generate 3-letter reference code to avoid email deduplication
			// Format: "Scholay 注册验证码 [Ref: ABC]" - professional and unambiguous
			refCode := utils.SecureRandomString(3, "ABCDEFGHIJKLMNOPQRSTUVWXYZ")
			subject := fmt.Sprintf("Scholay %s [Ref: %s]", purposeText, refCode)

			// Add timestamp to body to avoid content deduplication
			currentTime := time.Now().Format("2006-01-02 15:04:05")
			body := fmt.Sprintf(`
			<html>
			<body style="font-family: Arial, sans-serif; padding: 20px;">
				<h2 style="color: #2563eb;">Scholay %s</h2>
				<p>您的验证码是：</p>
				<div style="background: #f1f5f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
					<h1 style="color: #1e293b; letter-spacing: 8px; text-align: center; margin: 0;">%s</h1>
				</div>
				<p style="color: #64748b; font-size: 0.875rem;">
					验证码将在 <strong>10 分钟</strong> 后失效，请尽快使用。
				</p>
				<p style="color: #94a3b8; font-size: 0.75rem;">
					发送时间: %s
				</p>
				<hr style="border: 1px solid #e2e8f0; margin: 20px 0;">
				<p style="color: #94a3b8; font-size: 0.75rem;">
					这是一封自动发送的邮件，请勿直接回复。如果您没有请求此验证码，请忽略此邮件。
				</p>
			</body>
			</html>
			`, purposeText, code, currentTime)

			config := utils.EmailConfig{
				SMTPHost:     emailConfig.SMTPHost,
				SMTPPort:     emailConfig.SMTPPort,
				SMTPUser:     emailConfig.SMTPUser,
				SMTPPassword: emailConfig.SMTPPassword,
				FromEmail:    emailConfig.FromEmail,
				FromName:     emailConfig.FromName,
			}

			if err := utils.SendEmailWithTLS(config, []string{email}, subject, body); err != nil {
				slog.Warn("failed to send email, code generated but not delivered", "err", err, "email", email, "purpose", purpose)
				return nil
			}

			slog.Info("verification code sent via email", "email", email, "purpose", purpose)
			return nil
		}
	}

	// Fallback: If no email config, log without the code value
	slog.Warn("verification code generated but no email config available", "email", email, "purpose", purpose)

	return nil
}

// ChangePassword changes user password with current password verification
// Also invalidates all existing sessions to force re-login
func (s *Service) ChangePassword(userID uint, currentPassword, newPassword string) error {
	// Get user by ID
	user, err := s.repo.FindByID(userID)
	if err != nil {
		return fmt.Errorf("failed to find user: %w", err)
	}
	if user == nil {
		return errors.New("user not found")
	}

	// Check if user has a password set
	if user.PasswordHash == nil || *user.PasswordHash == "" {
		return errors.New("no password set for this account")
	}

	// Verify current password
	if !utils.CheckPassword(currentPassword, *user.PasswordHash) {
		return ErrCurrentPasswordInvalid
	}

	// Hash new password
	hashedPassword, err := utils.HashPassword(newPassword)
	if err != nil {
		return fmt.Errorf("failed to hash password: %w", err)
	}

	// Update password
	if err := s.repo.UpdatePassword(userID, hashedPassword); err != nil {
		return err
	}

	// Invalidate all existing sessions for this user (force re-login on all devices)
	return s.repo.DeleteUserSessions(userID)
}

// RefreshToken refreshes a token if the session is still valid and within 30-day limit
func (s *Service) RefreshToken(oldToken string) (string, error) {
	// Parse the old token (even if expired)
	claims, err := utils.ParseTokenIgnoreExpiry(oldToken)
	if err != nil {
		return "", errors.New("invalid token")
	}

	// Get the session from database
	session, err := s.repo.GetUserSession(oldToken)
	if err != nil {
		return "", fmt.Errorf("failed to get session: %w", err)
	}
	if session == nil {
		return "", ErrSessionNotFound
	}

	// Check if session can be refreshed (within 30 days of creation)
	if !session.CanRefresh() {
		return "", ErrSessionExpired
	}

	// Get user info
	user, err := s.repo.FindByID(claims.UserID)
	if err != nil || user == nil {
		return "", errors.New("user not found")
	}

	// Generate new token
	username := ""
	if user.Username != nil {
		username = *user.Username
	}
	newToken, err := s.generateSessionTokenForUser(user, username, fmt.Sprintf("%d", session.ID))
	if err != nil {
		return "", fmt.Errorf("failed to generate token: %w", err)
	}

	// Calculate new expiry time (min of token expiry or session max expiry)
	newExpiry := time.Now().Add(utils.TokenExpiration)
	maxExpiry := session.GetMaxExpiryTime()
	if newExpiry.After(maxExpiry) {
		newExpiry = maxExpiry
	}

	// Update session with new token
	if err := s.repo.UpdateSessionToken(session.ID, newToken, newExpiry); err != nil {
		return "", fmt.Errorf("failed to update session: %w", err)
	}

	return newToken, nil
}

// GetTokenInfo returns token expiry info for the client
func (s *Service) GetTokenInfo(token string) (map[string]any, error) {
	claims, err := utils.ParseToken(token)
	if err != nil {
		return nil, err
	}

	session, err := s.repo.GetUserSession(token)
	if err != nil || session == nil {
		return nil, ErrSessionNotFound
	}

	return map[string]any{
		"expires_at":         claims.ExpiresAt.Time,
		"remaining_seconds":  int(utils.GetTokenRemainingTime(claims).Seconds()),
		"should_refresh":     utils.ShouldRefreshToken(claims),
		"session_max_expiry": session.GetMaxExpiryTime(),
		"can_refresh":        session.CanRefresh(),
	}, nil
}
