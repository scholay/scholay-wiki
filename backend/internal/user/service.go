// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package user

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"scholar-backend/internal/common/cache"
	ifaces "scholar-backend/internal/common/interfaces"
	"scholar-backend/internal/common/middleware"
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
}

// MessageService interface for sending in-app messages
type MessageService interface {
	SendToUser(userID uint, title, content string, category string, linkURL, linkText string) error
}

// 哨兵错误，用于 handler 层的错误类型判断，避免字符串比较
var (
	ErrSessionExpired          = errors.New("session expired, please login again")
	ErrSessionNotFound         = errors.New("session not found")
	ErrCurrentPasswordInvalid  = errors.New("current password is incorrect")
)

// Service handles business logic for user operations
type Service struct {
	repo                *Repository
	configService       ConfigService
	messageService      MessageService
	onlineStatsProvider ifaces.OnlineStatsProvider
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

// SetOnlineStatsProvider 设置在线统计提供者（WebSocket Hub）
func (s *Service) SetOnlineStatsProvider(provider ifaces.OnlineStatsProvider) {
	s.onlineStatsProvider = provider
}

// SendWelcomeMessage 发送新用户欢迎站内信
func (s *Service) SendWelcomeMessage(userID uint) {
	if s.messageService == nil {
		return
	}

	title := "欢迎加入 Scholay"
	content := "感谢注册！开始探索学术世界吧~"

	go func() {
		if err := s.messageService.SendToUser(userID, title, content, "system", "/", "开始探索"); err != nil {
			slog.Error("failed to send welcome message", "user_id", userID, "err", err)
		}
	}()
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

func (s *Service) generateSessionTokenForUser(user *User, username, sessionID string) (string, error) {
	return utils.GenerateTokenWithSessionAndRole(user.ID, username, "user", s.getUserRole(user), sessionID)
}

// RegisterWithEmail registers a new user with email and password
// Enhanced with transaction support for concurrency safety
func (s *Service) RegisterWithEmail(email, password, code, ip string) (*User, string, error) {
	return s.RegisterWithEmailAndInvitation(email, password, code, "", ip)
}

// RegisterWithEmailAndInvitation registers a new user with email, password and optional invitation code
func (s *Service) RegisterWithEmailAndInvitation(email, password, code, invitationCode, ip string) (*User, string, error) {
	_ = invitationCode // 邀请业务已移除，参数保留以兼容 API

	// Verify the email code using Redis (only if code is provided)
	if code != "" {
		valid, err := cache.VerifyCode(context.Background(), email, code, "register")
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
	go func() {
		today := time.Now().Format("2006-01-02")
		_ = s.repo.IncrementNewUsers(today)
	}()

	// 发送欢迎站内信
	go s.SendWelcomeMessage(user.ID)

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
func (s *Service) ResetPassword(email, code, newPassword string) error {
	// Verify the code
	valid, err := cache.VerifyCode(context.Background(), email, code, "reset_password")
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
func (s *Service) LoginWithEmailCode(email, code, ip string) (*User, string, error) {
	// Verify the code
	valid, err := cache.VerifyCode(context.Background(), email, code, "login")
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
func (s *Service) SendVerificationCode(email, purpose string) error {
	// Check rate limit: prevent sending too frequently (must wait 1 minute)
	ttl, err := cache.GetVerificationCodeTTL(context.Background(), email, purpose)
	if err == nil && ttl > 9*time.Minute {
		// Code exists and was sent less than 1 minute ago
		remainingSeconds := int((ttl - 9*time.Minute).Seconds())
		return fmt.Errorf("操作过于频繁，请 %d 秒后再试", remainingSeconds)
	}

	// Generate 6-digit code
	code := utils.SecureRandomDigits(6)

	// Save verification code to Redis (auto-expires in 10 minutes)
	if err := cache.SaveVerificationCode(context.Background(), email, code, purpose); err != nil {
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
				// Log error but don't fail - still show code in console as fallback
				slog.Warn("failed to send email", "err", err)
				slog.Info("verification code generated (email fallback)", "email", email, "purpose", purpose, "code", code)
				return nil
			}

			slog.Info("verification code sent via email", "email", email, "purpose", purpose)
			return nil
		}
	}

	// Fallback: If no email config, just log it
	slog.Info("verification code generated (no email config)", "email", email, "purpose", purpose, "code", code)

	return nil
}

// GetProfile gets a user's profile
func (s *Service) GetProfile(id uint) (*User, error) {
	return s.repo.FindByID(id)
}

// UpdateProfile updates a user's profile
func (s *Service) UpdateProfile(id uint, username *string, avatarURL *string, bio *string) error {
	user, err := s.repo.FindByID(id)
	if err != nil {
		return err
	}

	if user == nil {
		return errors.New("user not found")
	}

	if username != nil {
		user.Username = username
	}
	if avatarURL != nil {
		user.AvatarURL = avatarURL
	}
	if bio != nil {
		user.Bio = bio
	}

	return s.repo.Update(user)
}

// GetUserStatistics returns user statistics
func (s *Service) GetUserStatistics() (map[string]any, error) {
	// 在线用户数：优先使用 WebSocket 连接状态
	var onlineUsers int64
	var onlineGuests int64
	if s.onlineStatsProvider != nil {
		onlineUsers = int64(s.onlineStatsProvider.GetOnlineUserCount())
		onlineGuests = int64(s.onlineStatsProvider.GetOnlineGuestCount())
	} else {
		// 回退到数据库查询
		count, err := s.repo.GetOnlineUserCount()
		if err != nil {
			return nil, err
		}
		onlineUsers = count
	}

	// 获取今日注册用户数
	now := time.Now()
	today := now.Format("2006-01-02")
	todayRegistrations, _ := s.repo.CountUsersOnDate(today)

	// 获取本周注册用户数 (从周一开始)
	weekStart := now.AddDate(0, 0, -int(now.Weekday())+1) // 本周一
	if now.Weekday() == time.Sunday {
		weekStart = now.AddDate(0, 0, -6) // 如果今天是周日，往前推6天到周一
	}
	weekStartStr := weekStart.Format("2006-01-02")
	weekRegistrations, _ := s.repo.CountUsersSince(weekStartStr)

	// 获取本月注册用户数
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	monthStartStr := monthStart.Format("2006-01-02")
	monthRegistrations, _ := s.repo.CountUsersSince(monthStartStr)

	// 获取今年注册用户数
	yearStart := time.Date(now.Year(), 1, 1, 0, 0, 0, 0, now.Location())
	yearStartStr := yearStart.Format("2006-01-02")
	yearRegistrations, _ := s.repo.CountUsersSince(yearStartStr)

	stats := map[string]any{
		"online_users":        onlineUsers,
		"online_guests":       onlineGuests,
		"today_registrations": todayRegistrations,
		"week_registrations":  weekRegistrations,
		"month_registrations": monthRegistrations,
		"year_registrations":  yearRegistrations,
	}

	return stats, nil
}

// GetUserList returns a paginated list of users
func (s *Service) GetUserList(page, pageSize int) ([]User, int64, error) {
	offset := (page - 1) * pageSize
	return s.repo.GetUserList(offset, pageSize)
}

// GetUserListWithSort returns a paginated list of users with sorting
func (s *Service) GetUserListWithSort(page, pageSize int, sortBy, sortOrder string) ([]User, int64, error) {
	offset := (page - 1) * pageSize
	return s.repo.GetUserListWithSort(offset, pageSize, sortBy, sortOrder)
}

// GetOnlineUsers returns list of currently online users
func (s *Service) GetOnlineUsers() ([]map[string]any, error) {
	return s.repo.GetOnlineUsers()
}

// UserDetail represents detailed user information for admin
type UserDetail struct {
	// Basic Info
	ID            uint       `json:"id"`
	Username      *string    `json:"username"`
	Email         *string    `json:"email"`
	Phone         *string    `json:"phone"`
	EmailVerified bool       `json:"email_verified"`
	PhoneVerified bool       `json:"phone_verified"`
	Status        int8       `json:"status"`
	CreatedAt     time.Time  `json:"created_at"`
	LastLoginAt   *time.Time `json:"last_login_at"`
	LastLoginIP   *string    `json:"last_login_ip,omitempty"`      // 最后登录IP
	LastLoginIPInfo string   `json:"last_login_ip_info,omitempty"` // IP归属地

	// Auth Providers
	AuthProviders []string `json:"auth_providers"`

	// Conversation Statistics
	AIConversationStats     ConversationStats `json:"ai_conversation_stats"`      // AI对话统计
	AnalysisConversationStats ConversationStats `json:"analysis_conversation_stats"` // 智能分析统计
}

// ConversationStats represents conversation statistics
type ConversationStats struct {
	TotalConversations int       `json:"total_conversations"` // 总对话数
	TotalRounds        int       `json:"total_rounds"`        // 总轮次
	TodayRounds        int       `json:"today_rounds"`        // 今日轮次
	WeekRounds         int       `json:"week_rounds"`         // 本周轮次
	MonthRounds        int       `json:"month_rounds"`        // 本月轮次
	AvgRoundsPerConv   float64   `json:"avg_rounds_per_conv"` // 平均每个对话的轮次
	LastConvAt         *time.Time `json:"last_conv_at,omitempty"` // 最后对话时间
}

// GetUserDetail returns detailed user information for admin
func (s *Service) GetUserDetail(userID uint) (*UserDetail, error) {
	// Get user basic info
	user, err := s.repo.FindByID(userID)
	if err != nil {
		return nil, fmt.Errorf("failed to find user: %w", err)
	}
	if user == nil {
		return nil, fmt.Errorf("user not found")
	}

	detail := &UserDetail{
		ID:            user.ID,
		Username:      user.Username,
		Email:         user.Email,
		Phone:         user.Phone,
		EmailVerified: user.EmailVerified,
		PhoneVerified: user.PhoneVerified,
		Status:        user.Status,
		CreatedAt:     user.CreatedAt,
		LastLoginAt:   user.LastLoginAt,
		LastLoginIP:   user.LastLoginIP,
		AuthProviders: []string{},
	}

	// Parse IP location
	if user.LastLoginIP != nil && *user.LastLoginIP != "" {
		location := utils.ParseIPLocation(*user.LastLoginIP)
		detail.LastLoginIPInfo = utils.GetLocationString(location)
	}

	// Get auth providers
	authProviders, err := s.repo.GetUserAuthProviders([]uint{userID})
	if err == nil && len(authProviders[userID]) > 0 {
		for _, provider := range authProviders[userID] {
			detail.AuthProviders = append(detail.AuthProviders, provider.Provider)
		}
	}

	// Get AI conversation statistics
	todayStart := time.Now().Truncate(24 * time.Hour)
	weekStart := todayStart.AddDate(0, 0, -int(todayStart.Weekday()))
	monthStart := time.Date(todayStart.Year(), todayStart.Month(), 1, 0, 0, 0, 0, todayStart.Location())

	detail.AIConversationStats = s.buildConversationStats(userID, "chat", user.CreatedAt, todayStart, weekStart, monthStart)

	// Get Analysis conversation statistics
	detail.AnalysisConversationStats = s.buildConversationStats(userID, "search", user.CreatedAt, todayStart, weekStart, monthStart)

	return detail, nil
}

// buildConversationStats builds ConversationStats for a given conversation type using repository methods.
func (s *Service) buildConversationStats(userID uint, convType string, userCreatedAt time.Time, todayStart, weekStart, monthStart time.Time) ConversationStats {
	summary, _ := s.repo.GetConversationSummary(userID, convType)

	todayRounds, _ := s.repo.CountConversationMessagesSince(userID, convType, todayStart)
	weekRounds, _ := s.repo.CountConversationMessagesSince(userID, convType, weekStart)
	monthRounds, _ := s.repo.CountConversationMessagesSince(userID, convType, monthStart)

	totalConv := 0
	totalRounds := 0
	var lastConvAt *time.Time
	avgRounds := 0.0

	if summary != nil {
		totalConv = summary.TotalConv
		totalRounds = summary.TotalRounds
		lastConvAt = summary.LastConvAt
		if totalConv > 0 {
			avgRounds = float64(totalRounds) / float64(totalConv)
		}
	}

	return ConversationStats{
		TotalConversations: totalConv,
		TotalRounds:        totalRounds,
		TodayRounds:        int(todayRounds),
		WeekRounds:         int(weekRounds),
		MonthRounds:        int(monthRounds),
		AvgRoundsPerConv:   avgRounds,
		LastConvAt:         lastConvAt,
	}
}

// CreateSession creates a new user session
// CreateSession creates a new session for a user
// Implements single sign-on per device type: PC and mobile are separate
// When a user logs in on a new device, other sessions of the same device type are invalidated
func (s *Service) CreateSession(userID uint, token, ip, userAgent string, expiresIn time.Duration) error {
	// 解析设备类型
	deviceType := utils.ParseDeviceType(userAgent)

	// 使旧会话的 Redis 缓存失效（在删除数据库记录之前）
	if validator := middleware.GetSessionValidator(); validator != nil {
		validator.InvalidateUserSessions(userID)
	}

	// 单点登录：删除同一用户同一设备类型的其他会话
	// PC端只能有一个会话，移动端只能有一个会话，但PC和移动端可以同时存在
	if err := s.repo.DeleteUserSessionsByDeviceType(userID, deviceType); err != nil {
		// 删除失败不影响创建新会话，只记录日志
		slog.Warn("failed to delete old sessions", "user_id", userID, "device_type", deviceType, "err", err)
	}

	session := &model.UserSession{
		UserID:       userID,
		Token:        token,
		DeviceType:   deviceType,
		IP:           ip,
		UserAgent:    userAgent,
		LastActivity: time.Now(),
		ExpiresAt:    time.Now().Add(expiresIn),
	}
	return s.repo.CreateSession(session)
}

// UpdateSessionActivity updates the last activity time of a session and user's last login IP
func (s *Service) UpdateSessionActivity(token, ip string) error {
	return s.repo.UpdateSessionActivity(token, ip)
}

// UpdateSessionActivityByUserID updates session activity by user ID (used by WebSocket)
func (s *Service) UpdateSessionActivityByUserID(userID uint, ip string) error {
	return s.repo.UpdateSessionActivityByUserID(userID, ip)
}

// CleanupExpiredSessions deletes expired sessions
func (s *Service) CleanupExpiredSessions() error {
	return s.repo.DeleteExpiredSessions()
}

// Logout deletes all sessions for a user
func (s *Service) Logout(userID uint) error {
	return s.repo.DeleteUserSessions(userID)
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

// GetUserStatisticsChart returns user registration statistics for charts (legacy, kept for compatibility)
func (s *Service) GetUserStatisticsChart(days int) ([]map[string]any, error) {
	startDate := time.Now().AddDate(0, 0, -days+1)
	startDate = time.Date(startDate.Year(), startDate.Month(), startDate.Day(), 0, 0, 0, 0, startDate.Location())
	endDate := time.Now()
	return s.GetUserStatisticsChartWithGranularity(startDate, endDate, "day")
}

// GetUserStatisticsChartWithGranularity returns user registration statistics with custom time range and granularity
// granularity: hour, day, week, month
func (s *Service) GetUserStatisticsChartWithGranularity(startTime, endTime time.Time, granularity string) ([]map[string]any, error) {
	result := make([]map[string]any, 0)
	loc := startTime.Location()

	switch granularity {
	case "hour":
		// 按小时统计
		currentTime := time.Date(startTime.Year(), startTime.Month(), startTime.Day(), startTime.Hour(), 0, 0, 0, loc)
		for currentTime.Before(endTime) || currentTime.Equal(endTime) {
			nextTime := currentTime.Add(time.Hour)

			count, err := s.repo.CountUsersInTimeRange(currentTime, nextTime)
			if err != nil {
				count = 0
			}

			result = append(result, map[string]any{
				"time":      currentTime.Format("2006-01-02 15:04"),
				"label":     currentTime.Format("01-02 15:00"),
				"new_users": count,
			})
			currentTime = nextTime
		}

	case "day":
		// 按天统计
		currentDate := time.Date(startTime.Year(), startTime.Month(), startTime.Day(), 0, 0, 0, 0, loc)
		endDate := time.Date(endTime.Year(), endTime.Month(), endTime.Day(), 0, 0, 0, 0, loc)
		for currentDate.Before(endDate) || currentDate.Equal(endDate) {
			nextDate := currentDate.AddDate(0, 0, 1)

			count, err := s.repo.CountUsersInTimeRange(currentDate, nextDate)
			if err != nil {
				count = 0
			}

			result = append(result, map[string]any{
				"time":      currentDate.Format("2006-01-02"),
				"label":     currentDate.Format("01-02"),
				"new_users": count,
			})
			currentDate = nextDate
		}

	case "week":
		// 按周统计（从周一开始）
		currentDate := startTime
		// 调整到周一
		weekday := int(currentDate.Weekday())
		if weekday == 0 {
			weekday = 7
		}
		currentDate = currentDate.AddDate(0, 0, -(weekday - 1))
		currentDate = time.Date(currentDate.Year(), currentDate.Month(), currentDate.Day(), 0, 0, 0, 0, loc)

		for currentDate.Before(endTime) {
			nextWeek := currentDate.AddDate(0, 0, 7)
			weekEnd := nextWeek
			if weekEnd.After(endTime) {
				weekEnd = endTime.AddDate(0, 0, 1)
			}

			count, err := s.repo.CountUsersInTimeRange(currentDate, weekEnd)
			if err != nil {
				count = 0
			}

			result = append(result, map[string]any{
				"time":      currentDate.Format("2006-01-02"),
				"label":     currentDate.Format("01-02") + "周",
				"new_users": count,
			})
			currentDate = nextWeek
		}

	case "month":
		// 按月统计
		currentDate := time.Date(startTime.Year(), startTime.Month(), 1, 0, 0, 0, 0, loc)
		endMonth := time.Date(endTime.Year(), endTime.Month(), 1, 0, 0, 0, 0, loc)

		for currentDate.Before(endMonth) || currentDate.Equal(endMonth) {
			nextMonth := currentDate.AddDate(0, 1, 0)
			monthEnd := nextMonth
			if monthEnd.After(endTime) {
				monthEnd = endTime.AddDate(0, 0, 1)
			}

			count, err := s.repo.CountUsersInTimeRange(currentDate, monthEnd)
			if err != nil {
				count = 0
			}

			result = append(result, map[string]any{
				"time":      currentDate.Format("2006-01"),
				"label":     currentDate.Format("2006年01月"),
				"new_users": count,
			})
			currentDate = nextMonth
		}

	default:
		return nil, fmt.Errorf("invalid granularity: %s", granularity)
	}

	return result, nil
}

// GetOnlineUserChartData returns online user count snapshots for charts (legacy, kept for compatibility)
func (s *Service) GetOnlineUserChartData(hours int) ([]map[string]any, error) {
	endTime := time.Now()
	startTime := endTime.Add(-time.Duration(hours) * time.Hour)
	return s.GetOnlineUserChartDataWithGranularity(startTime, endTime, "5min")
}

// GetOnlineUserChartDataWithGranularity returns online user count snapshots with custom time range and granularity
// granularity: 5min, hour
func (s *Service) GetOnlineUserChartDataWithGranularity(startTime, endTime time.Time, granularity string) ([]map[string]any, error) {
	// Round start time based on granularity
	loc := startTime.Location()
	
	var interval time.Duration
	var timeFormat, labelFormat string
	
	switch granularity {
	case "5min":
		startTime = startTime.Truncate(5 * time.Minute)
		interval = 5 * time.Minute
		timeFormat = "2006-01-02 15:04"
		labelFormat = "15:04"
	case "hour":
		startTime = time.Date(startTime.Year(), startTime.Month(), startTime.Day(), startTime.Hour(), 0, 0, 0, loc)
		interval = time.Hour
		timeFormat = "2006-01-02 15:00"
		labelFormat = "01-02 15:00"
	default:
		return nil, fmt.Errorf("invalid granularity: %s", granularity)
	}

	// Get snapshots from database
	snapshots, err := s.repo.GetOnlineUserSnapshots(startTime, endTime)
	if err != nil {
		return nil, err
	}

	// Aggregated counts struct
	type aggregatedCounts struct {
		onlineCounts []int
		guestCounts  []int
	}

	// Create a map for aggregating snapshots by interval
	snapshotsMap := make(map[string]*aggregatedCounts)
	for _, snapshot := range snapshots {
		var key string
		switch granularity {
		case "5min":
			roundedTime := snapshot.Timestamp.Truncate(5 * time.Minute)
			key = roundedTime.Format(timeFormat)
		case "hour":
			roundedTime := time.Date(snapshot.Timestamp.Year(), snapshot.Timestamp.Month(), snapshot.Timestamp.Day(), 
				snapshot.Timestamp.Hour(), 0, 0, 0, loc)
			key = roundedTime.Format(timeFormat)
		}
		if snapshotsMap[key] == nil {
			snapshotsMap[key] = &aggregatedCounts{}
		}
		snapshotsMap[key].onlineCounts = append(snapshotsMap[key].onlineCounts, snapshot.OnlineCount)
		snapshotsMap[key].guestCounts = append(snapshotsMap[key].guestCounts, snapshot.GuestCount)
	}

	// Generate result with all time points filled
	result := make([]map[string]any, 0)
	currentTime := startTime

	for currentTime.Before(endTime) || currentTime.Equal(endTime) {
		timeStr := currentTime.Format(timeFormat)
		labelStr := currentTime.Format(labelFormat)

		// Get average counts for this interval
		onlineCount := 0
		guestCount := 0
		if agg, exists := snapshotsMap[timeStr]; exists && agg != nil {
			if len(agg.onlineCounts) > 0 {
				sum := 0
				for _, c := range agg.onlineCounts {
					sum += c
				}
				onlineCount = sum / len(agg.onlineCounts)
			}
			if len(agg.guestCounts) > 0 {
				sum := 0
				for _, c := range agg.guestCounts {
					sum += c
				}
				guestCount = sum / len(agg.guestCounts)
			}
		}

		result = append(result, map[string]any{
			"time":         timeStr,
			"label":        labelStr,
			"online_count": onlineCount,
			"guest_count":  guestCount,
		})

		currentTime = currentTime.Add(interval)
	}

	return result, nil
}

// RecordOnlineUserSnapshot records current online user count (called periodically)
func (s *Service) RecordOnlineUserSnapshot() error {
	var onlineCount, guestCount int

	// 优先使用 WebSocket 连接状态
	if s.onlineStatsProvider != nil {
		onlineCount = s.onlineStatsProvider.GetOnlineUserCount()
		guestCount = s.onlineStatsProvider.GetOnlineGuestCount()
	} else {
		// 回退到数据库查询（不支持访客数）
		count, err := s.repo.GetOnlineUserCount()
		if err != nil {
			return err
		}
		onlineCount = int(count)
		guestCount = 0
	}

	// Record snapshot
	now := time.Now()
	if err := s.repo.CreateOnlineUserSnapshot(now, onlineCount, guestCount); err != nil {
		return err
	}

	// Also update peak for today (仅统计登录用户)
	today := now.Format("2006-01-02")
	_ = s.repo.UpdatePeakOnlineUsers(today, onlineCount)

	return nil
}

// RecordOnlineSnapshot 实时记录在线快照（WebSocket 连接/断开时调用）
// 使用 UPSERT 逻辑：同一分钟内只保留峰值
func (s *Service) RecordOnlineSnapshot(userCount, guestCount int) error {
	now := time.Now()
	// 按分钟取整
	minuteTimestamp := time.Date(now.Year(), now.Month(), now.Day(), now.Hour(), now.Minute(), 0, 0, now.Location())

	// 使用 UPSERT 记录峰值
	if err := s.repo.UpsertOnlineSnapshot(minuteTimestamp, userCount, guestCount); err != nil {
		return err
	}

	// 更新今日峰值
	today := now.Format("2006-01-02")
	_ = s.repo.UpdatePeakOnlineUsers(today, userCount)

	return nil
}

// CheckPhoneExists checks if a phone number is already registered
func (s *Service) CheckPhoneExists(phone string) (bool, error) {
	user, err := s.repo.FindByPhone(phone)
	if err != nil {
		return false, err
	}
	return user != nil, nil
}

// SendPhoneVerificationCode sends SMS verification code
func (s *Service) SendPhoneVerificationCode(phone, purpose string) error {
	// Check rate limit: prevent sending too frequently (must wait 1 minute)
	ttl, err := cache.GetVerificationCodeTTL(context.Background(), phone, purpose)
	if err == nil && ttl > 9*time.Minute {
		// Code exists and was sent less than 1 minute ago
		remainingSeconds := int((ttl - 9*time.Minute).Seconds())
		return fmt.Errorf("操作过于频繁，请 %d 秒后再试", remainingSeconds)
	}

	// Generate 6-digit code
	code := utils.SecureRandomDigits(6)

	// Save verification code to Redis (auto-expires in 10 minutes)
	if err := cache.SaveVerificationCode(context.Background(), phone, code, purpose); err != nil {
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
				// Log error but don't fail - still show code in console as fallback
				slog.Warn("failed to send SMS", "err", err)
				slog.Info("verification code generated (SMS fallback)", "phone", phone, "purpose", purpose, "code", code)
				return nil
			}

			slog.Info("verification code sent via SMS", "phone", phone, "purpose", purpose)
			return nil
		}
	}

	// Fallback: If no SMS config, just log it
	slog.Info("verification code generated (no SMS config)", "phone", phone, "purpose", purpose, "code", code)

	return nil
}

// RegisterWithPhone registers a new user with phone and password
// Enhanced with transaction support for concurrency safety
func (s *Service) RegisterWithPhone(phone, password, code, invitationCode, ip string) (*User, string, error) {
	_ = invitationCode // 邀请业务已移除，参数保留以兼容 API

	// Verify the phone code using Redis
	valid, err := cache.VerifyCode(context.Background(), phone, code, "register")
	if err != nil {
		return nil, "", fmt.Errorf("failed to verify code: %w", err)
	}
	if !valid {
		return nil, "", errors.New("invalid or expired verification code")
	}

	// First check: validate phone availability (pre-verification)
	existing, err := s.repo.FindByPhone(phone)
	if err != nil {
		return nil, "", err
	}
	if existing != nil {
		return nil, "", errors.New("phone number already registered")
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
			return errors.New("phone number already registered")
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

	go s.SendWelcomeMessage(user.ID)

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
		return nil, "", errors.New("phone number not registered")
	}

	// Check if user is active
	if user.Status != 1 {
		return nil, "", errors.New("account is suspended")
	}

	// Verify password
	if user.PasswordHash == nil {
		return nil, "", errors.New("please set a password first")
	}

	if !utils.CheckPassword(password, *user.PasswordHash) {
		return nil, "", errors.New("invalid password")
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
func (s *Service) ResetPasswordPhone(phone, code, newPassword string) error {
	// Verify the code
	valid, err := cache.VerifyCode(context.Background(), phone, code, "reset_password")
	if err != nil {
		return fmt.Errorf("failed to verify code: %w", err)
	}
	if !valid {
		return errors.New("invalid or expired verification code")
	}

	// Find user by phone
	user, err := s.repo.FindByPhone(phone)
	if err != nil {
		return err
	}
	if user == nil {
		return errors.New("phone number not registered")
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

// LoginWithPhoneCode logs in a user with phone and verification code
func (s *Service) LoginWithPhoneCode(phone, code, ip string) (*User, string, error) {
	// Verify the code
	valid, err := cache.VerifyCode(context.Background(), phone, code, "login")
	if err != nil {
		return nil, "", fmt.Errorf("failed to verify code: %w", err)
	}
	if !valid {
		return nil, "", errors.New("invalid or expired verification code")
	}

	// Find user by phone
	user, err := s.repo.FindByPhone(phone)
	if err != nil {
		return nil, "", err
	}
	if user == nil {
		return nil, "", errors.New("phone number not registered")
	}

	// Check if user is active
	if user.Status != 1 {
		return nil, "", errors.New("account is suspended")
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

// BindPhone binds a phone number to an existing user account
// Enhanced with transaction support and double-check for concurrency safety
func (s *Service) BindPhone(userID uint, phone, code string) error {
	// Verify the phone code using Redis
	valid, err := cache.VerifyCode(context.Background(), phone, code, "bind")
	if err != nil {
		return fmt.Errorf("failed to verify code: %w", err)
	}
	if !valid {
		return errors.New("invalid or expired verification code")
	}

	// First check: validate phone availability (pre-verification)
	existing, err := s.repo.FindByPhone(phone)
	if err != nil {
		return err
	}
	if existing != nil && existing.ID != userID {
		return errors.New("phone number already bound to another account")
	}

	// Use transaction for atomic binding operation
	return s.repo.ExecuteInTransaction(func(txRepo *Repository) error {
		// Second check: double-check phone availability within transaction (concurrency protection)
		existing, err := txRepo.FindByPhone(phone)
		if err != nil {
			return err
		}
		if existing != nil && existing.ID != userID {
			return errors.New("phone number already bound to another account")
		}

		// Get current user
		user, err := txRepo.FindByID(userID)
		if err != nil {
			return err
		}
		if user == nil {
			return errors.New("user not found")
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

// BindEmail binds an email to an existing user account
// Enhanced with transaction support and double-check for concurrency safety
func (s *Service) BindEmail(userID uint, email, code string) error {
	// Verify the email code using Redis
	valid, err := cache.VerifyCode(context.Background(), email, code, "bind")
	if err != nil {
		return fmt.Errorf("failed to verify code: %w", err)
	}
	if !valid {
		return errors.New("invalid or expired verification code")
	}

	// First check: validate email availability (pre-verification)
	existing, err := s.repo.FindByEmail(email)
	if err != nil {
		return err
	}
	if existing != nil && existing.ID != userID {
		return errors.New("email already bound to another account")
	}

	// Use transaction for atomic binding operation
	return s.repo.ExecuteInTransaction(func(txRepo *Repository) error {
		// Second check: double-check email availability within transaction (concurrency protection)
		existing, err := txRepo.FindByEmail(email)
		if err != nil {
			return err
		}
		if existing != nil && existing.ID != userID {
			return errors.New("email already bound to another account")
		}

		// Get current user
		user, err := txRepo.FindByID(userID)
		if err != nil {
			return err
		}
		if user == nil {
			return errors.New("user not found")
		}

		// Update user email
		user.Email = &email
		user.EmailVerified = true
		if err := txRepo.Update(user); err != nil {
			return err
		}

		// Create or update auth provider entry
		authProvider, err := txRepo.FindAuthProviderByUserAndProvider(userID, "email")
		if err != nil {
			return err
		}

		if authProvider == nil {
			authProvider = &UserAuthProvider{
				UserID:         userID,
				Provider:       "email",
				ProviderUserID: email,
			}
			if err := txRepo.CreateAuthProvider(authProvider); err != nil {
				return err
			}
		} else {
			authProvider.ProviderUserID = email
			if err := txRepo.UpdateAuthProvider(authProvider); err != nil {
				return err
			}
		}

		return nil
	})
}

// UnbindPhone unbinds phone from user account
func (s *Service) UnbindPhone(userID uint, code string) error {
	// First get user to verify code (without lock)
	user, err := s.repo.FindByID(userID)
	if err != nil {
		return err
	}
	if user == nil {
		return errors.New("user not found")
	}

	// Check if phone is bound
	if user.Phone == nil || *user.Phone == "" {
		return errors.New("phone is not bound")
	}

	// Verify the code before starting transaction
	valid, err := cache.VerifyCode(context.Background(), *user.Phone, code, "unbind")
	if err != nil {
		return fmt.Errorf("failed to verify code: %w", err)
	}
	if !valid {
		return errors.New("invalid or expired verification code")
	}

	return s.repo.UnbindPhoneInTx(userID)
}

// UnbindEmail unbinds email from user account
func (s *Service) UnbindEmail(userID uint, code string) error {
	// First get user to verify code (without lock)
	user, err := s.repo.FindByID(userID)
	if err != nil {
		return err
	}
	if user == nil {
		return errors.New("user not found")
	}

	// Check if email is bound
	if user.Email == nil || *user.Email == "" {
		return errors.New("email is not bound")
	}

	// Verify the code before starting transaction
	valid, err := cache.VerifyCode(context.Background(), *user.Email, code, "unbind")
	if err != nil {
		return fmt.Errorf("failed to verify code: %w", err)
	}
	if !valid {
		return errors.New("invalid or expired verification code")
	}

	return s.repo.UnbindEmailInTx(userID)
}

// UnbindWeChat unbinds WeChat from user account
func (s *Service) UnbindWeChat(userID uint) error {
	return s.repo.UnbindWeChatInTx(userID)
}

// UnbindGitHub unbinds GitHub from user account
func (s *Service) UnbindGitHub(userID uint) error {
	return s.repo.UnbindGitHubInTx(userID)
}

// LoginOrRegisterWithWeChat handles WeChat login or registration
func (s *Service) LoginOrRegisterWithWeChat(openID, unionID, nickname, avatarURL, ip, invitationCode string) (*User, string, bool, error) {
	_ = invitationCode // 邀请业务已移除，参数保留以兼容前端传参
	var authProvider *UserAuthProvider
	var err error
	
	// Priority 1: Try to find by unionID if available (for users who have it)
	if unionID != "" {
		authProvider, err = s.repo.FindAuthProviderByUnionID("wechat", unionID)
		if err != nil {
			return nil, "", false, err
		}
	}
	
	// Priority 2: If not found by unionID, try by openID (for backward compatibility)
	if authProvider == nil {
		authProvider, err = s.repo.FindAuthProviderByProviderAndProviderUserID("wechat", openID)
		if err != nil {
			return nil, "", false, err
		}
	}

	isNewUser := false

	if authProvider != nil {
		// Existing user - login
		user, err := s.repo.FindByID(authProvider.UserID)
		if err != nil {
			return nil, "", false, err
		}

		if user == nil {
			return nil, "", false, errors.New("user not found")
		}

		// Check if user is active
		if user.Status != 1 {
			return nil, "", false, errors.New("account is suspended")
		}

		// Update last login time and IP
		_ = s.repo.UpdateLastLoginWithIP(user.ID, ip)
		
		// Update unionID if it's not set (migration for old records)
		if authProvider.ProviderUnionID == nil && unionID != "" {
			authProvider.ProviderUnionID = &unionID
			_ = s.repo.UpdateAuthProvider(authProvider)
		}

		// Generate JWT token
		token, err := s.generateTokenForUser(user, "")
		if err != nil {
			return nil, "", false, err
		}

		return user, token, isNewUser, nil
	}

	// New user - register
	isNewUser = true

	// Create user with WeChat info
	user := &User{
		Username:  &nickname,
		AvatarURL: &avatarURL,
		Role:      "user",
		Status:    1,
	}

	if err := s.repo.Create(user); err != nil {
		return nil, "", false, err
	}

	// Update last login time and IP (registration counts as first login)
	_ = s.repo.UpdateLastLoginWithIP(user.ID, ip)

	go s.SendWelcomeMessage(user.ID)

	// Create auth provider entry
	providerData := map[string]string{
		"nickname":   nickname,
		"avatar_url": avatarURL,
	}
	providerDataBytes, _ := json.Marshal(providerData)
	providerDataJSON := string(providerDataBytes)

	var unionIDPtr *string
	if unionID != "" {
		unionIDPtr = &unionID
	}

	authProvider = &UserAuthProvider{
		UserID:          user.ID,
		Provider:        "wechat",
		ProviderUserID:  openID, // openID 作为主要标识
		ProviderUnionID: unionIDPtr, // UnionID 作为跨应用标识
		ProviderData:    &providerDataJSON,
	}

	if err := s.repo.CreateAuthProvider(authProvider); err != nil {
		return nil, "", false, err
	}

	// Generate JWT token
	token, err := s.generateTokenForUser(user, "")
	if err != nil {
		return nil, "", false, err
	}

	return user, token, isNewUser, nil
}


// BindWeChat binds a WeChat account to an existing user
func (s *Service) BindWeChat(userID uint, openID, unionID, nickname, avatarURL string) error {
	// Check if WeChat is already bound to another user (check both openID and unionID)
	existing, err := s.repo.FindAuthProviderByProviderAndProviderUserID("wechat", openID)
	if err != nil {
		return err
	}

	if existing != nil && existing.UserID != userID {
		return errors.New("该微信账号已被其他账号绑定")
	}
	
	// Also check by unionID if available
	if unionID != "" {
		existingByUnionID, err := s.repo.FindAuthProviderByUnionID("wechat", unionID)
		if err != nil {
			return err
		}
		if existingByUnionID != nil && existingByUnionID.UserID != userID {
			return errors.New("该微信账号已被其他账号绑定")
		}
	}

	// Get current user
	user, err := s.repo.FindByID(userID)
	if err != nil {
		return err
	}

	if user == nil {
		return errors.New("user not found")
	}

	// Update username and avatar if not set
	if user.Username == nil || *user.Username == "" {
		user.Username = &nickname
	}
	if user.AvatarURL == nil || *user.AvatarURL == "" {
		user.AvatarURL = &avatarURL
	}

	if err := s.repo.Update(user); err != nil {
		return err
	}

	// Create or update auth provider entry
	authProvider, err := s.repo.FindAuthProviderByUserAndProvider(userID, "wechat")
	if err != nil {
		return err
	}

	// Prepare provider data
	providerData := map[string]string{
		"nickname":   nickname,
		"avatar_url": avatarURL,
	}
	providerDataBytes, _ := json.Marshal(providerData)
	providerDataJSON := string(providerDataBytes)

	var unionIDPtr *string
	if unionID != "" {
		unionIDPtr = &unionID
	}

	if authProvider == nil {
		// Create new auth provider
		authProvider = &UserAuthProvider{
			UserID:          userID,
			Provider:        "wechat",
			ProviderUserID:  openID,
			ProviderUnionID: unionIDPtr,
			ProviderData:    &providerDataJSON,
		}
		if err := s.repo.CreateAuthProvider(authProvider); err != nil {
			return err
		}
	} else {
		// Update existing auth provider
		authProvider.ProviderUserID = openID
		authProvider.ProviderUnionID = unionIDPtr
		authProvider.ProviderData = &providerDataJSON
		if err := s.repo.UpdateAuthProvider(authProvider); err != nil {
			return err
		}
	}

	return nil
}

// BindEmailWithPassword binds email to WeChat-registered user with new password
func (s *Service) BindEmailWithPassword(userID uint, email, password, code string) error {
	// Verify the email code using Redis
	valid, err := cache.VerifyCode(context.Background(), email, code, "bind")
	if err != nil {
		return fmt.Errorf("failed to verify code: %w", err)
	}
	if !valid {
		return errors.New("invalid or expired verification code")
	}

	// Check if email is already used by another user
	existing, err := s.repo.FindByEmail(email)
	if err != nil {
		return err
	}

	if existing != nil && existing.ID != userID {
		return errors.New("email already bound to another account")
	}

	// Get current user
	user, err := s.repo.FindByID(userID)
	if err != nil {
		return err
	}

	if user == nil {
		return errors.New("user not found")
	}

	// Hash password
	hashedPassword, err := utils.HashPassword(password)
	if err != nil {
		return err
	}

	// Update user email and password
	user.Email = &email
	user.EmailVerified = true
	user.PasswordHash = &hashedPassword

	if err := s.repo.Update(user); err != nil {
		return err
	}

	// Create or update auth provider entry
	authProvider, err := s.repo.FindAuthProviderByUserAndProvider(userID, "email")
	if err != nil {
		return err
	}

	if authProvider == nil {
		// Create new auth provider
		authProvider = &UserAuthProvider{
			UserID:         userID,
			Provider:       "email",
			ProviderUserID: email,
		}
		if err := s.repo.CreateAuthProvider(authProvider); err != nil {
			return err
		}
	} else {
		// Update existing auth provider
		authProvider.ProviderUserID = email
		if err := s.repo.UpdateAuthProvider(authProvider); err != nil {
			return err
		}
	}

	return nil
}

// BindPhoneWithPassword binds phone to WeChat-registered user with new password
func (s *Service) BindPhoneWithPassword(userID uint, phone, password, code string) error {
	// Verify the phone code using Redis
	valid, err := cache.VerifyCode(context.Background(), phone, code, "bind")
	if err != nil {
		return fmt.Errorf("failed to verify code: %w", err)
	}
	if !valid {
		return errors.New("invalid or expired verification code")
	}

	// Check if phone is already used by another user
	existing, err := s.repo.FindByPhone(phone)
	if err != nil {
		return err
	}

	if existing != nil && existing.ID != userID {
		return errors.New("phone number already bound to another account")
	}

	// Get current user
	user, err := s.repo.FindByID(userID)
	if err != nil {
		return err
	}

	if user == nil {
		return errors.New("user not found")
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

// DeleteUser deletes a user account and all associated data (admin only)
// This will remove all user data except statistics (for historical analysis)
func (s *Service) DeleteUser(userID uint) error {
	user, err := s.repo.FindByID(userID)
	if err != nil {
		return fmt.Errorf("failed to find user: %w", err)
	}

	if user == nil {
		return errors.New("user not found")
	}

	if user.Role == "admin" {
		return errors.New("cannot delete admin accounts through user management")
	}

	if err := s.repo.DeleteUser(userID); err != nil {
		return fmt.Errorf("failed to delete user: %w", err)
	}

	return nil
}

// CheckEmailAvailability checks if an email is available for binding
// Returns true if email can be used (either doesn't exist or belongs to current user)
func (s *Service) CheckEmailAvailability(email string, currentUserID uint) (bool, error) {
	existing, err := s.repo.FindByEmail(email)
	if err != nil {
		return false, fmt.Errorf("failed to check email: %w", err)
	}

	// Email is available if it doesn't exist
	if existing == nil {
		return true, nil
	}

	// Email exists but belongs to current user (rebind case)
	if existing.ID == currentUserID {
		return true, nil
	}

	// Email already in use by another user
	return false, nil
}

// CheckPhoneAvailability checks if a phone is available for binding
// Returns true if phone can be used (either doesn't exist or belongs to current user)
func (s *Service) CheckPhoneAvailability(phone string, currentUserID uint) (bool, error) {
	existing, err := s.repo.FindByPhone(phone)
	if err != nil {
		return false, fmt.Errorf("failed to check phone: %w", err)
	}

	// Phone is available if it doesn't exist
	if existing == nil {
		return true, nil
	}

	// Phone exists but belongs to current user (rebind case)
	if existing.ID == currentUserID {
		return true, nil
	}

	// Phone already in use by another user
	return false, nil
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
