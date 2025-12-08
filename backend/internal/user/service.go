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
	"math/rand"
	"scholar-backend/internal/common/cache"
	"scholar-backend/internal/common/middleware"
	"scholar-backend/internal/common/model"
	"scholar-backend/internal/common/utils"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ConfigService interface for email and SMS configuration
type ConfigService interface {
	GetActiveEmailConfig() (*model.EmailConfig, error)
	GetActiveSMSConfig() (*model.SMSConfig, error)
	GetSystemConfig() (*model.SystemConfig, error)
}

// CouponService interface for coupon operations
type CouponService interface {
	RegisterWithInvitation(invitationCode string, inviteeID uint64) error
	DistributeRegisterCoupons(userID uint64) error
}

// CurrencyService interface for currency operations
type CurrencyService interface {
	GetCurrencyConfigAmount(configKey string) (int64, error)
	GiftGold(ctx context.Context, userID uint, amount int64, bizType, bizID, desc string) (any, error)
	EnsureWalletExists(userID uint) error
}

// Service handles business logic for user operations
type Service struct {
	repo            *Repository
	configService   ConfigService
	couponService   CouponService
	currencyService CurrencyService
}

// NewService creates a new user service
func NewService(repo *Repository) *Service {
	return &Service{
		repo:          repo,
		configService: nil, // Will be set via SetConfigService
		couponService: nil, // Will be set via SetCouponService
	}
}

// SetConfigService sets the config service (for dependency injection)
func (s *Service) SetConfigService(configService ConfigService) {
	s.configService = configService
}

// SetCouponService sets the coupon service (for dependency injection)
func (s *Service) SetCouponService(couponService CouponService) {
	s.couponService = couponService
}

// GetCouponService returns the coupon service
func (s *Service) GetCouponService() CouponService {
	return s.couponService
}

// SetCurrencyService sets the currency service (for dependency injection)
func (s *Service) SetCurrencyService(currencyService CurrencyService) {
	s.currencyService = currencyService
}

// GiftRegisterGold 赠送注册金币
func (s *Service) GiftRegisterGold(userID uint) {
	if s.currencyService == nil {
		return
	}

	// 获取注册赠送金币配置
	amount, err := s.currencyService.GetCurrencyConfigAmount("register_gift_gold")
	if err != nil || amount <= 0 {
		return
	}

	// 确保钱包存在
	if err := s.currencyService.EnsureWalletExists(userID); err != nil {
		fmt.Printf("Failed to ensure wallet for user %d: %v\n", userID, err)
		return
	}

	// 赠送金币
	ctx := context.Background()
	_, err = s.currencyService.GiftGold(ctx, userID, amount, "register_gift", fmt.Sprintf("user_%d", userID), "新用户注册赠送")
	if err != nil {
		fmt.Printf("Failed to gift register gold to user %d: %v\n", userID, err)
	}
}

// GetSystemConfig gets the system configuration
func (s *Service) GetSystemConfig() (*model.SystemConfig, error) {
	if s.configService == nil {
		return nil, fmt.Errorf("config service not initialized")
	}
	return s.configService.GetSystemConfig()
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
		randomNum := rand.Intn(1000000)
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
	randomSuffix := rand.Intn(10000)
	return fmt.Sprintf("user_%d_%04d", timestamp, randomSuffix), nil
}

// RegisterWithEmail registers a new user with email and password
// Enhanced with transaction support for concurrency safety
func (s *Service) RegisterWithEmail(email, password, code, ip string) (*User, string, error) {
	return s.RegisterWithEmailAndInvitation(email, password, code, "", ip)
}

// RegisterWithEmailAndInvitation registers a new user with email, password and optional invitation code
func (s *Service) RegisterWithEmailAndInvitation(email, password, code, invitationCode, ip string) (*User, string, error) {
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
	err = s.repo.GetDB().Transaction(func(tx *gorm.DB) error {
		txRepo := NewRepository(tx)

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
	token, err = utils.GenerateToken(user.ID, tokenUsername, "user")
	if err != nil {
		return nil, "", err
	}

	// Record new user registration in statistics (async, non-blocking)
	go func() {
		today := time.Now().Format("2006-01-02")
		_ = s.repo.IncrementNewUsers(today)
	}()

	// Handle invitation code if provided
	if invitationCode != "" && s.couponService != nil {
		// Process invitation in background to not block registration
		go func() {
			_ = s.couponService.RegisterWithInvitation(invitationCode, uint64(user.ID))
		}()
	}

	// Distribute register coupons to new user (auto_register type)
	if s.couponService != nil {
		go func() {
			_ = s.couponService.DistributeRegisterCoupons(uint64(user.ID))
		}()
	}

	// 赠送注册金币给新用户
	go s.GiftRegisterGold(user.ID)

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
	token, err := utils.GenerateToken(user.ID, username, "user")
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
	token, err := utils.GenerateToken(user.ID, username, "user")
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
	code := fmt.Sprintf("%06d", rand.Intn(1000000))

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
			refCode := fmt.Sprintf("%c%c%c",
				'A'+rand.Intn(26),
				'A'+rand.Intn(26),
				'A'+rand.Intn(26))
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
				fmt.Printf("⚠ Failed to send email: %v\n", err)
				fmt.Printf("✓ Verification code for %s (%s): %s (expires in 10 min)\n", email, purpose, code)
				return nil
			}

			fmt.Printf("✓ Verification code sent to %s (%s) via email (expires in 10 min)\n", email, purpose)
			return nil
		}
	}

	// Fallback: If no email config, just log it
	fmt.Printf("✓ Verification code for %s (%s): %s (expires in 10 min)\n", email, purpose, code)

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
func (s *Service) GetUserStatistics() (map[string]interface{}, error) {
	onlineUsers, err := s.repo.GetOnlineUserCount()
	if err != nil {
		return nil, err
	}

	// 获取今日注册用户数
	now := time.Now()
	today := now.Format("2006-01-02")
	var todayRegistrations int64
	s.repo.db.Table("users").
		Where("DATE(created_at) = ?", today).
		Count(&todayRegistrations)

	// 获取本周注册用户数 (从周一开始)
	weekStart := now.AddDate(0, 0, -int(now.Weekday())+1) // 本周一
	if now.Weekday() == time.Sunday {
		weekStart = now.AddDate(0, 0, -6) // 如果今天是周日，往前推6天到周一
	}
	weekStartStr := weekStart.Format("2006-01-02")
	var weekRegistrations int64
	s.repo.db.Table("users").
		Where("DATE(created_at) >= ?", weekStartStr).
		Count(&weekRegistrations)

	// 获取本月注册用户数
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	monthStartStr := monthStart.Format("2006-01-02")
	var monthRegistrations int64
	s.repo.db.Table("users").
		Where("DATE(created_at) >= ?", monthStartStr).
		Count(&monthRegistrations)

	// 获取今年注册用户数
	yearStart := time.Date(now.Year(), 1, 1, 0, 0, 0, 0, now.Location())
	yearStartStr := yearStart.Format("2006-01-02")
	var yearRegistrations int64
	s.repo.db.Table("users").
		Where("DATE(created_at) >= ?", yearStartStr).
		Count(&yearRegistrations)

	stats := map[string]interface{}{
		"online_users":        onlineUsers,
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
func (s *Service) GetOnlineUsers() ([]map[string]interface{}, error) {
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

	// Auth Providers
	AuthProviders []string `json:"auth_providers"`

	// Subscription Info
	CurrentSubscription *SubscriptionInfo `json:"current_subscription,omitempty"`

	// Order Statistics
	OrderStats OrderStats `json:"order_stats"`

	// Invitation Statistics
	InvitationStats InvitationStats `json:"invitation_stats"`

	// Coupon Statistics
	CouponStats CouponStats `json:"coupon_stats"`

	// NEW: Invitation Relationships
	InvitedBy    *InviterInfo   `json:"invited_by,omitempty"`     // 谁邀请了我
	InvitedUsers []InvitedUser  `json:"invited_users,omitempty"`  // 我邀请的人

	// NEW: Conversation Statistics
	AIConversationStats     ConversationStats `json:"ai_conversation_stats"`      // AI对话统计
	AnalysisConversationStats ConversationStats `json:"analysis_conversation_stats"` // 智能分析统计
}

type SubscriptionInfo struct {
	PlanName      string    `json:"plan_name"`
	PlanCode      string    `json:"plan_code"`
	BillingCycle  string    `json:"billing_cycle"`
	Status        string    `json:"status"`
	StartDate     time.Time `json:"start_date"`
	EndDate       time.Time `json:"end_date"`
	AutoRenew     bool      `json:"auto_renew"`
	TotalQuota    int       `json:"total_quota"`
	UsedQuota     int       `json:"used_quota"`
	RemainingDays int       `json:"remaining_days"`
}

type OrderStats struct {
	TotalOrders  int     `json:"total_orders"`
	TotalAmount  float64 `json:"total_amount"`
	TotalSaved   float64 `json:"total_saved"`
	LastOrderAt  *time.Time `json:"last_order_at,omitempty"`
}

type InvitationStats struct {
	InvitationCode   string `json:"invitation_code"`
	TotalInvited     int    `json:"total_invited"`
	SuccessInvited   int    `json:"success_invited"`
	RewardsEarned    int    `json:"rewards_earned"`
}

type CouponStats struct {
	TotalCoupons     int `json:"total_coupons"`
	UsedCoupons      int `json:"used_coupons"`
	AvailableCoupons int `json:"available_coupons"`
	ExpiredCoupons   int `json:"expired_coupons"`
}

// InviterInfo represents the person who invited this user
type InviterInfo struct {
	UserID    uint    `json:"user_id"`
	Username  *string `json:"username"`
	Email     *string `json:"email"`
	InvitedAt time.Time `json:"invited_at"`
}

// InvitedUser represents a user that was invited by this user
type InvitedUser struct {
	UserID       uint      `json:"user_id"`
	Username     *string   `json:"username"`
	Email        *string   `json:"email"`
	InvitedAt    time.Time `json:"invited_at"`
	IsRegistered bool      `json:"is_registered"` // 是否已注册
	HasOrdered   bool      `json:"has_ordered"`   // 是否已下单
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
		AuthProviders: []string{},
	}

	// Get auth providers
	authProviders, err := s.repo.GetUserAuthProviders([]uint{userID})
	if err == nil && len(authProviders[userID]) > 0 {
		for _, provider := range authProviders[userID] {
			detail.AuthProviders = append(detail.AuthProviders, provider.Provider)
		}
	}

	// Get subscription info using the same logic as GetUserSubscription
	var subscription struct {
		PlanCode  string     `gorm:"column:plan_code"`
		Status    string     `gorm:"column:status"`
		StartDate time.Time  `gorm:"column:start_date"`
		EndDate   *time.Time `gorm:"column:end_date"`
		AutoRenew bool       `gorm:"column:auto_renew"`
	}
	
	err = s.repo.GetDB().Table("user_subscriptions").
		Where("user_id = ? AND status = ?", userID, "active").
		Order("created_at DESC").
		First(&subscription).Error

	if err == nil {
		// Get plan details
		var plan struct {
			PlanName string `gorm:"column:plan_name"`
			Features string `gorm:"column:features"`
		}
		s.repo.GetDB().Table("subscription_plans").
			Select("plan_name, features").
			Where("plan_code = ? AND is_active = ?", subscription.PlanCode, true).
			First(&plan)

		remainingDays := 0
		endDate := time.Time{}
		
		if subscription.EndDate != nil {
			endDate = *subscription.EndDate
			remainingDays = int(time.Until(endDate).Hours() / 24)
			if remainingDays < 0 {
				remainingDays = 0
			}
		}

		// 计算 billing_cycle (根据订阅时长推断)
		billingCycle := "monthly" // 默认月付
		if subscription.EndDate != nil {
			duration := subscription.EndDate.Sub(subscription.StartDate)
			// 如果订阅期大于40天，认为是年付
			if duration.Hours() > 40*24 {
				billingCycle = "yearly"
			}
		}

		detail.CurrentSubscription = &SubscriptionInfo{
			PlanName:      plan.PlanName,
			PlanCode:      subscription.PlanCode,
			BillingCycle:  billingCycle,
			Status:        subscription.Status,
			StartDate:     subscription.StartDate,
			EndDate:       endDate,
			AutoRenew:     subscription.AutoRenew,
			RemainingDays: remainingDays,
		}

		// Get today's quota usage
		today := time.Now().Format("2006-01-02")
		var todayQuota struct {
			TotalUsed int `gorm:"column:total_used"`
		}
		s.repo.GetDB().Table("usage_quotas").
			Select("COALESCE(normal_search_count + advanced_search_low_count + advanced_search_mid_count + advanced_search_high_count + ai_chat_normal_count + ai_chat_mid_count + ai_chat_high_count, 0) as total_used").
			Where("user_id = ? AND quota_date = ?", userID, today).
			Scan(&todayQuota)

		// Parse features to get quota limits
		var features struct {
			NormalSearch struct {
				Limit int `json:"limit"`
			} `json:"normal_search"`
			AdvancedSearchLow struct {
				Limit int `json:"limit"`
			} `json:"advanced_search_low"`
			AdvancedSearchMid struct {
				Limit int `json:"limit"`
			} `json:"advanced_search_mid"`
			AdvancedSearchHigh struct {
				Limit int `json:"limit"`
			} `json:"advanced_search_high"`
			AIChatNormal struct {
				Limit int `json:"limit"`
			} `json:"ai_chat_normal"`
			AIChatMid struct {
				Limit int `json:"limit"`
			} `json:"ai_chat_mid"`
			AIChatHigh struct {
				Limit int `json:"limit"`
			} `json:"ai_chat_high"`
		}
		
		totalQuota := 0
		if plan.Features != "" {
			json.Unmarshal([]byte(plan.Features), &features)
			// 计算总配额（取最大的作为代表，或者求和）
			limits := []int{
				features.NormalSearch.Limit,
				features.AdvancedSearchLow.Limit,
				features.AdvancedSearchMid.Limit,
				features.AdvancedSearchHigh.Limit,
				features.AIChatNormal.Limit,
				features.AIChatMid.Limit,
				features.AIChatHigh.Limit,
			}
			for _, limit := range limits {
				if limit > totalQuota && limit != -1 {
					totalQuota = limit
				}
			}
		}

		detail.CurrentSubscription.TotalQuota = totalQuota
		detail.CurrentSubscription.UsedQuota = todayQuota.TotalUsed
	}

	// Get order statistics
	var orderStats struct {
		TotalOrders int        `gorm:"column:total_orders"`
		TotalAmount float64    `gorm:"column:total_amount"`
		TotalSaved  float64    `gorm:"column:total_saved"`
		LastOrderAt *time.Time `gorm:"column:last_order_at"`
	}
	s.repo.GetDB().Table("orders").
		Select("COUNT(*) as total_orders, COALESCE(SUM(final_amount), 0) as total_amount, COALESCE(SUM(discount_amount), 0) as total_saved, MAX(payment_time) as last_order_at").
		Where("user_id = ? AND status = ?", userID, "paid").
		Scan(&orderStats)

	detail.OrderStats = OrderStats{
		TotalOrders: orderStats.TotalOrders,
		TotalAmount: orderStats.TotalAmount,
		TotalSaved:  orderStats.TotalSaved,
		LastOrderAt: orderStats.LastOrderAt,
	}

	// Get invitation statistics
	var invitationData struct {
		Code           string `gorm:"column:code"`
		TotalInvited   int    `gorm:"column:total_invited"`
		SuccessInvited int    `gorm:"column:success_invited"`
	}
	err = s.repo.GetDB().Table("user_invitations").
		Where("inviter_id = ?", userID).
		First(&invitationData).Error

	if err == nil {
		detail.InvitationStats = InvitationStats{
			InvitationCode: invitationData.Code,
			TotalInvited:   invitationData.TotalInvited,
			SuccessInvited: invitationData.SuccessInvited,
			RewardsEarned:  invitationData.SuccessInvited, // Assuming 1 reward per successful invite
		}
	}

	// Get coupon statistics
	var couponStats struct {
		Total     int `gorm:"column:total"`
		Used      int `gorm:"column:used"`
		Available int `gorm:"column:available"`
		Expired   int `gorm:"column:expired"`
	}
	now := time.Now()
	s.repo.GetDB().Table("user_coupons").
		Select("COUNT(*) as total, SUM(CASE WHEN status = 'used' THEN 1 ELSE 0 END) as used, SUM(CASE WHEN status = 'unused' AND valid_until >= ? THEN 1 ELSE 0 END) as available, SUM(CASE WHEN status = 'expired' OR (status = 'unused' AND valid_until < ?) THEN 1 ELSE 0 END) as expired", now, now).
		Where("user_id = ?", userID).
		Scan(&couponStats)

	detail.CouponStats = CouponStats{
		TotalCoupons:     couponStats.Total,
		UsedCoupons:      couponStats.Used,
		AvailableCoupons: couponStats.Available,
		ExpiredCoupons:   couponStats.Expired,
	}

	// NEW: Get inviter information (who invited this user)
	// 使用 invitation_relationships 表
	var inviterData struct {
		InviterID    uint       `gorm:"column:inviter_id"`
		Username     *string    `gorm:"column:username"`
		Email        *string    `gorm:"column:email"`
		RegisteredAt *time.Time `gorm:"column:registered_at"`
	}
	err = s.repo.GetDB().Table("invitation_relationships").
		Select("invitation_relationships.inviter_id, users.username, users.email, invitation_relationships.registered_at").
		Joins("LEFT JOIN users ON users.id = invitation_relationships.inviter_id").
		Where("invitation_relationships.invitee_id = ?", userID).
		First(&inviterData).Error
	
	if err == nil && inviterData.InviterID > 0 {
		invitedAt := user.CreatedAt
		if inviterData.RegisteredAt != nil {
			invitedAt = *inviterData.RegisteredAt
		}
		detail.InvitedBy = &InviterInfo{
			UserID:    inviterData.InviterID,
			Username:  inviterData.Username,
			Email:     inviterData.Email,
			InvitedAt: invitedAt,
		}
	}

	// NEW: Get list of users invited by this user
	// 使用 invitation_relationships 表
	type invitedUserRaw struct {
		UserID       uint       `gorm:"column:user_id"`
		Username     *string    `gorm:"column:username"`
		Email        *string    `gorm:"column:email"`
		RegisteredAt *time.Time `gorm:"column:registered_at"`
		Status       string     `gorm:"column:status"`
		HasOrdered   bool       `gorm:"column:has_ordered"`
	}
	var invitedUsersData []invitedUserRaw
	err = s.repo.GetDB().Table("invitation_relationships").
		Select("users.id as user_id, users.username, users.email, invitation_relationships.registered_at, "+
			"invitation_relationships.status, "+
			"EXISTS(SELECT 1 FROM orders WHERE orders.user_id = users.id AND orders.status = 'paid') as has_ordered").
		Joins("LEFT JOIN users ON users.id = invitation_relationships.invitee_id").
		Where("invitation_relationships.inviter_id = ?", userID).
		Order("invitation_relationships.created_at DESC").
		Find(&invitedUsersData).Error

	if err == nil && len(invitedUsersData) > 0 {
		detail.InvitedUsers = make([]InvitedUser, len(invitedUsersData))
		for i, invitee := range invitedUsersData {
			invitedAt := user.CreatedAt
			if invitee.RegisteredAt != nil {
				invitedAt = *invitee.RegisteredAt
			}
			detail.InvitedUsers[i] = InvitedUser{
				UserID:       invitee.UserID,
				Username:     invitee.Username,
				Email:        invitee.Email,
				InvitedAt:    invitedAt,
				IsRegistered: invitee.Status != "pending", // pending 表示还未注册
				HasOrdered:   invitee.HasOrdered,
			}
		}
	}

	// NEW: Get AI conversation statistics
	var aiConvStats struct {
		TotalConv   int        `gorm:"column:total_conv"`
		TotalRounds int        `gorm:"column:total_rounds"`
		LastConvAt  *time.Time `gorm:"column:last_conv_at"`
	}
	s.repo.GetDB().Table("conversations").
		Select("COUNT(DISTINCT id) as total_conv, "+
			"COALESCE(SUM((SELECT COUNT(*) FROM conversation_messages WHERE conversation_id = conversations.id)), 0) as total_rounds, "+
			"MAX(updated_at) as last_conv_at").
		Where("user_id = ? AND conversation_type = ?", userID, "chat").
		Scan(&aiConvStats)

	// Get time-based statistics for AI conversations
	todayStart := time.Now().Truncate(24 * time.Hour)
	weekStart := todayStart.AddDate(0, 0, -int(todayStart.Weekday()))
	monthStart := time.Date(todayStart.Year(), todayStart.Month(), 1, 0, 0, 0, 0, todayStart.Location())

	var todayRounds, weekRounds, monthRounds int64
	s.repo.GetDB().Table("conversation_messages").
		Joins("JOIN conversations ON conversations.id = conversation_messages.conversation_id").
		Where("conversations.user_id = ? AND conversations.conversation_type = ? AND conversation_messages.created_at >= ?", userID, "chat", todayStart).
		Count(&todayRounds)

	s.repo.GetDB().Table("conversation_messages").
		Joins("JOIN conversations ON conversations.id = conversation_messages.conversation_id").
		Where("conversations.user_id = ? AND conversations.conversation_type = ? AND conversation_messages.created_at >= ?", userID, "chat", weekStart).
		Count(&weekRounds)

	s.repo.GetDB().Table("conversation_messages").
		Joins("JOIN conversations ON conversations.id = conversation_messages.conversation_id").
		Where("conversations.user_id = ? AND conversations.conversation_type = ? AND conversation_messages.created_at >= ?", userID, "chat", monthStart).
		Count(&monthRounds)

	avgRounds := 0.0
	if aiConvStats.TotalConv > 0 {
		avgRounds = float64(aiConvStats.TotalRounds) / float64(aiConvStats.TotalConv)
	}

	detail.AIConversationStats = ConversationStats{
		TotalConversations: aiConvStats.TotalConv,
		TotalRounds:        aiConvStats.TotalRounds,
		TodayRounds:        int(todayRounds),
		WeekRounds:         int(weekRounds),
		MonthRounds:        int(monthRounds),
		AvgRoundsPerConv:   avgRounds,
		LastConvAt:         aiConvStats.LastConvAt,
	}

	// NEW: Get Analysis conversation statistics (使用 'search' 作为智能分析类型)
	var analysisConvStats struct {
		TotalConv   int        `gorm:"column:total_conv"`
		TotalRounds int        `gorm:"column:total_rounds"`
		LastConvAt  *time.Time `gorm:"column:last_conv_at"`
	}
	s.repo.GetDB().Table("conversations").
		Select("COUNT(DISTINCT id) as total_conv, "+
			"COALESCE(SUM((SELECT COUNT(*) FROM conversation_messages WHERE conversation_id = conversations.id)), 0) as total_rounds, "+
			"MAX(updated_at) as last_conv_at").
		Where("user_id = ? AND conversation_type = ?", userID, "search").
		Scan(&analysisConvStats)

	// Get time-based statistics for Analysis conversations
	var todayRoundsAnalysis, weekRoundsAnalysis, monthRoundsAnalysis int64
	s.repo.GetDB().Table("conversation_messages").
		Joins("JOIN conversations ON conversations.id = conversation_messages.conversation_id").
		Where("conversations.user_id = ? AND conversations.conversation_type = ? AND conversation_messages.created_at >= ?", userID, "search", todayStart).
		Count(&todayRoundsAnalysis)

	s.repo.GetDB().Table("conversation_messages").
		Joins("JOIN conversations ON conversations.id = conversation_messages.conversation_id").
		Where("conversations.user_id = ? AND conversations.conversation_type = ? AND conversation_messages.created_at >= ?", userID, "search", weekStart).
		Count(&weekRoundsAnalysis)

	s.repo.GetDB().Table("conversation_messages").
		Joins("JOIN conversations ON conversations.id = conversation_messages.conversation_id").
		Where("conversations.user_id = ? AND conversations.conversation_type = ? AND conversation_messages.created_at >= ?", userID, "search", monthStart).
		Count(&monthRoundsAnalysis)

	avgAnalysisRounds := 0.0
	if analysisConvStats.TotalConv > 0 {
		avgAnalysisRounds = float64(analysisConvStats.TotalRounds) / float64(analysisConvStats.TotalConv)
	}

	detail.AnalysisConversationStats = ConversationStats{
		TotalConversations: analysisConvStats.TotalConv,
		TotalRounds:        analysisConvStats.TotalRounds,
		TodayRounds:        int(todayRoundsAnalysis),
		WeekRounds:         int(weekRoundsAnalysis),
		MonthRounds:        int(monthRoundsAnalysis),
		AvgRoundsPerConv:   avgAnalysisRounds,
		LastConvAt:         analysisConvStats.LastConvAt,
	}

	return detail, nil
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
		fmt.Printf("Warning: failed to delete old sessions for user %d device %s: %v\n", userID, deviceType, err)
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
		return errors.New("current password is incorrect")
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
		return "", errors.New("session not found")
	}

	// Check if session can be refreshed (within 30 days of creation)
	if !session.CanRefresh() {
		return "", errors.New("session expired, please login again")
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
	newToken, err := utils.GenerateTokenWithSession(user.ID, username, claims.Type, fmt.Sprintf("%d", session.ID))
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
func (s *Service) GetTokenInfo(token string) (map[string]interface{}, error) {
	claims, err := utils.ParseToken(token)
	if err != nil {
		return nil, err
	}

	session, err := s.repo.GetUserSession(token)
	if err != nil || session == nil {
		return nil, errors.New("session not found")
	}

	return map[string]interface{}{
		"expires_at":         claims.ExpiresAt.Time,
		"remaining_seconds":  int(utils.GetTokenRemainingTime(claims).Seconds()),
		"should_refresh":     utils.ShouldRefreshToken(claims),
		"session_max_expiry": session.GetMaxExpiryTime(),
		"can_refresh":        session.CanRefresh(),
	}, nil
}

// GetUserStatisticsChart returns user registration statistics for charts (legacy, kept for compatibility)
func (s *Service) GetUserStatisticsChart(days int) ([]map[string]interface{}, error) {
	startDate := time.Now().AddDate(0, 0, -days+1)
	startDate = time.Date(startDate.Year(), startDate.Month(), startDate.Day(), 0, 0, 0, 0, startDate.Location())
	endDate := time.Now()
	return s.GetUserStatisticsChartWithGranularity(startDate, endDate, "day")
}

// GetUserStatisticsChartWithGranularity returns user registration statistics with custom time range and granularity
// granularity: hour, day, week, month
func (s *Service) GetUserStatisticsChartWithGranularity(startTime, endTime time.Time, granularity string) ([]map[string]interface{}, error) {
	result := make([]map[string]interface{}, 0)
	loc := startTime.Location()

	switch granularity {
	case "hour":
		// 按小时统计
		currentTime := time.Date(startTime.Year(), startTime.Month(), startTime.Day(), startTime.Hour(), 0, 0, 0, loc)
		for currentTime.Before(endTime) || currentTime.Equal(endTime) {
			nextTime := currentTime.Add(time.Hour)
			
			var count int64
			err := s.repo.GetDB().Model(&User{}).
				Where("created_at >= ? AND created_at < ?", currentTime, nextTime).
				Count(&count).Error
			if err != nil {
				count = 0
			}

			result = append(result, map[string]interface{}{
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
			
			var count int64
			err := s.repo.GetDB().Model(&User{}).
				Where("created_at >= ? AND created_at < ?", currentDate, nextDate).
				Count(&count).Error
			if err != nil {
				count = 0
			}

			result = append(result, map[string]interface{}{
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

			var count int64
			err := s.repo.GetDB().Model(&User{}).
				Where("created_at >= ? AND created_at < ?", currentDate, weekEnd).
				Count(&count).Error
			if err != nil {
				count = 0
			}

			result = append(result, map[string]interface{}{
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

			var count int64
			err := s.repo.GetDB().Model(&User{}).
				Where("created_at >= ? AND created_at < ?", currentDate, monthEnd).
				Count(&count).Error
			if err != nil {
				count = 0
			}

			result = append(result, map[string]interface{}{
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
func (s *Service) GetOnlineUserChartData(hours int) ([]map[string]interface{}, error) {
	endTime := time.Now()
	startTime := endTime.Add(-time.Duration(hours) * time.Hour)
	return s.GetOnlineUserChartDataWithGranularity(startTime, endTime, "5min")
}

// GetOnlineUserChartDataWithGranularity returns online user count snapshots with custom time range and granularity
// granularity: 5min, hour
func (s *Service) GetOnlineUserChartDataWithGranularity(startTime, endTime time.Time, granularity string) ([]map[string]interface{}, error) {
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

	// Create a map for aggregating snapshots by interval
	snapshotsMap := make(map[string][]int)
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
		snapshotsMap[key] = append(snapshotsMap[key], snapshot.OnlineCount)
	}

	// Generate result with all time points filled
	result := make([]map[string]interface{}, 0)
	currentTime := startTime

	for currentTime.Before(endTime) || currentTime.Equal(endTime) {
		timeStr := currentTime.Format(timeFormat)
		labelStr := currentTime.Format(labelFormat)

		// Get average online count for this interval
		onlineCount := 0
		if counts, exists := snapshotsMap[timeStr]; exists && len(counts) > 0 {
			sum := 0
			for _, c := range counts {
				sum += c
			}
			onlineCount = sum / len(counts)
		}

		result = append(result, map[string]interface{}{
			"time":         timeStr,
			"label":        labelStr,
			"online_count": onlineCount,
		})

		currentTime = currentTime.Add(interval)
	}

	return result, nil
}

// RecordOnlineUserSnapshot records current online user count (called periodically)
func (s *Service) RecordOnlineUserSnapshot() error {
	onlineCount, err := s.repo.GetOnlineUserCount()
	if err != nil {
		return err
	}

	// Record snapshot
	now := time.Now()
	if err := s.repo.CreateOnlineUserSnapshot(now, int(onlineCount)); err != nil {
		return err
	}

	// Also update peak for today
	today := now.Format("2006-01-02")
	_ = s.repo.UpdatePeakOnlineUsers(today, int(onlineCount))

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
	code := fmt.Sprintf("%06d", rand.Intn(1000000))

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
				fmt.Printf("⚠ Failed to send SMS: %v\n", err)
				fmt.Printf("✓ Verification code for %s (%s): %s (expires in 10 min)\n", phone, purpose, code)
				return nil
			}

			fmt.Printf("✓ Verification code sent to %s (%s) via SMS (expires in 10 min)\n", phone, purpose)
			return nil
		}
	}

	// Fallback: If no SMS config, just log it
	fmt.Printf("✓ Verification code for %s (%s): %s (expires in 10 min)\n", phone, purpose, code)

	return nil
}

// RegisterWithPhone registers a new user with phone and password
// Enhanced with transaction support for concurrency safety
func (s *Service) RegisterWithPhone(phone, password, code, invitationCode, ip string) (*User, string, error) {
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
	err = s.repo.GetDB().Transaction(func(tx *gorm.DB) error {
		txRepo := NewRepository(tx)

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
	token, err = utils.GenerateToken(user.ID, tokenUsername, "user")
	if err != nil {
		return nil, "", err
	}

	// Handle invitation code if provided (same logic as email registration)
	if invitationCode != "" && s.couponService != nil {
		// Process invitation in background to not block registration
		go func() {
			_ = s.couponService.RegisterWithInvitation(invitationCode, uint64(user.ID))
		}()
	}

	// Distribute register coupons to new user (auto_register type)
	if s.couponService != nil {
		go func() {
			_ = s.couponService.DistributeRegisterCoupons(uint64(user.ID))
		}()
	}

	// 赠送注册金币给新用户
	go s.GiftRegisterGold(user.ID)

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
	token, err := utils.GenerateToken(user.ID, "", "user")
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
	token, err := utils.GenerateToken(user.ID, "", "user")
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
	return s.repo.GetDB().Transaction(func(tx *gorm.DB) error {
		// Create a temporary repository with transaction DB
		txRepo := NewRepository(tx)

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
			// Create new auth provider
			authProvider = &UserAuthProvider{
				UserID:         userID,
				Provider:       "phone",
				ProviderUserID: phone,
			}
			if err := txRepo.CreateAuthProvider(authProvider); err != nil {
				return err
			}
		} else {
			// Update existing auth provider
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
	return s.repo.GetDB().Transaction(func(tx *gorm.DB) error {
		// Create a temporary repository with transaction DB
		txRepo := NewRepository(tx)

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
			// Create new auth provider
			authProvider = &UserAuthProvider{
				UserID:         userID,
				Provider:       "email",
				ProviderUserID: email,
			}
			if err := txRepo.CreateAuthProvider(authProvider); err != nil {
				return err
			}
		} else {
			// Update existing auth provider
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

	// Start transaction with pessimistic locking
	tx := s.repo.GetDB().Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	// Lock the user row using FOR UPDATE
	var lockedUser User
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("id = ?", userID).First(&lockedUser).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("failed to lock user record: %w", err)
	}

	// Re-check if phone is still bound (might have been changed by another transaction)
	if lockedUser.Phone == nil || *lockedUser.Phone == "" {
		tx.Rollback()
		return errors.New("phone is not bound")
	}

	// Check if user has at least one other login method (within transaction)
	hasEmail := lockedUser.Email != nil && *lockedUser.Email != ""

	var wechatCount int64
	if err := tx.Model(&UserAuthProvider{}).
		Where("user_id = ? AND provider = ?", userID, "wechat").
		Count(&wechatCount).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("failed to check WeChat binding: %w", err)
	}
	hasWeChat := wechatCount > 0

	if !hasEmail && !hasWeChat {
		tx.Rollback()
		return errors.New("cannot unbind phone: at least one login method must remain")
	}

	// Remove phone
	lockedUser.Phone = nil
	lockedUser.PhoneVerified = false

	if err := tx.Save(&lockedUser).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("failed to unbind phone: %w", err)
	}

	// Remove auth provider
	if err := tx.Where("user_id = ? AND provider = ?", userID, "phone").
		Delete(&UserAuthProvider{}).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("failed to delete phone auth provider: %w", err)
	}

	// Commit transaction
	if err := tx.Commit().Error; err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	return nil
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

	// Start transaction with pessimistic locking
	tx := s.repo.GetDB().Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	// Lock the user row using FOR UPDATE
	var lockedUser User
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("id = ?", userID).First(&lockedUser).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("failed to lock user record: %w", err)
	}

	// Re-check if email is still bound (might have been changed by another transaction)
	if lockedUser.Email == nil || *lockedUser.Email == "" {
		tx.Rollback()
		return errors.New("email is not bound")
	}

	// Check if user has at least one other login method (within transaction)
	hasPhone := lockedUser.Phone != nil && *lockedUser.Phone != ""

	var wechatCount int64
	if err := tx.Model(&UserAuthProvider{}).
		Where("user_id = ? AND provider = ?", userID, "wechat").
		Count(&wechatCount).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("failed to check WeChat binding: %w", err)
	}
	hasWeChat := wechatCount > 0

	if !hasPhone && !hasWeChat {
		tx.Rollback()
		return errors.New("cannot unbind email: at least one login method must remain")
	}

	// Remove email
	lockedUser.Email = nil
	lockedUser.EmailVerified = false

	if err := tx.Save(&lockedUser).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("failed to unbind email: %w", err)
	}

	// Remove auth provider
	if err := tx.Where("user_id = ? AND provider = ?", userID, "email").
		Delete(&UserAuthProvider{}).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("failed to delete email auth provider: %w", err)
	}

	// Commit transaction
	if err := tx.Commit().Error; err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	return nil
}

// UnbindWeChat unbinds WeChat from user account
func (s *Service) UnbindWeChat(userID uint) error {
	// Start transaction with pessimistic locking
	tx := s.repo.GetDB().Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	// Lock the user row using FOR UPDATE
	var lockedUser User
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("id = ?", userID).First(&lockedUser).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("failed to lock user record: %w", err)
	}

	// Check if WeChat is bound (within transaction)
	var wechatCount int64
	if err := tx.Model(&UserAuthProvider{}).
		Where("user_id = ? AND provider = ?", userID, "wechat").
		Count(&wechatCount).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("failed to check WeChat binding: %w", err)
	}

	if wechatCount == 0 {
		tx.Rollback()
		return errors.New("WeChat is not bound")
	}

	// Check if user has at least one other login method (within transaction)
	hasEmail := lockedUser.Email != nil && *lockedUser.Email != ""
	hasPhone := lockedUser.Phone != nil && *lockedUser.Phone != ""

	if !hasEmail && !hasPhone {
		tx.Rollback()
		return errors.New("cannot unbind WeChat: at least one login method must remain")
	}

	// Remove auth provider
	if err := tx.Where("user_id = ? AND provider = ?", userID, "wechat").
		Delete(&UserAuthProvider{}).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("failed to delete WeChat auth provider: %w", err)
	}

	// Commit transaction
	if err := tx.Commit().Error; err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	return nil
}

// UnbindGitHub unbinds GitHub from user account
func (s *Service) UnbindGitHub(userID uint) error {
	// Start transaction with pessimistic locking
	tx := s.repo.GetDB().Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	// Lock the user row using FOR UPDATE
	var lockedUser User
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("id = ?", userID).First(&lockedUser).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("failed to lock user record: %w", err)
	}

	// Check if GitHub is bound (within transaction)
	var githubCount int64
	if err := tx.Model(&UserAuthProvider{}).
		Where("user_id = ? AND provider = ?", userID, "github").
		Count(&githubCount).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("failed to check GitHub binding: %w", err)
	}

	if githubCount == 0 {
		tx.Rollback()
		return errors.New("GitHub is not bound")
	}

	// Check if user has at least one other login method (within transaction)
	hasEmail := lockedUser.Email != nil && *lockedUser.Email != ""
	hasPhone := lockedUser.Phone != nil && *lockedUser.Phone != ""

	// Check for WeChat binding
	var wechatCount int64
	if err := tx.Model(&UserAuthProvider{}).
		Where("user_id = ? AND provider = ?", userID, "wechat").
		Count(&wechatCount).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("failed to check WeChat binding: %w", err)
	}
	hasWeChat := wechatCount > 0

	if !hasEmail && !hasPhone && !hasWeChat {
		tx.Rollback()
		return errors.New("cannot unbind GitHub: at least one login method must remain")
	}

	// Remove auth provider
	if err := tx.Where("user_id = ? AND provider = ?", userID, "github").
		Delete(&UserAuthProvider{}).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("failed to delete GitHub auth provider: %w", err)
	}

	// Commit transaction
	if err := tx.Commit().Error; err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	return nil
}

// LoginOrRegisterWithWeChat handles WeChat login or registration
func (s *Service) LoginOrRegisterWithWeChat(openID, unionID, nickname, avatarURL, ip, invitationCode string) (*User, string, bool, error) {
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
		token, err := utils.GenerateToken(user.ID, "", "user")
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
		Status:    1,
	}

	if err := s.repo.Create(user); err != nil {
		return nil, "", false, err
	}

	// Update last login time and IP (registration counts as first login)
	_ = s.repo.UpdateLastLoginWithIP(user.ID, ip)

	// 处理邀请码 - 如果是新用户且有邀请码
	if invitationCode != "" {
		if err := s.ProcessInvitationForOAuth(user.ID, invitationCode, ip); err != nil {
			// 邀请码处理失败不影响注册，只记录日志
			fmt.Printf("Failed to process invitation code for WeChat user %d: %v\n", user.ID, err)
		}
	}

	// 发放注册自动折扣券给新用户
	if s.couponService != nil {
		go func() {
			_ = s.couponService.DistributeRegisterCoupons(uint64(user.ID))
		}()
	}

	// 赠送注册金币给新用户
	go s.GiftRegisterGold(user.ID)

	// Create auth provider entry
	// Save nickname and avatar in provider_data
	providerDataJSON := fmt.Sprintf(`{"nickname":"%s","avatar_url":"%s"}`, nickname, avatarURL)
	
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
	token, err := utils.GenerateToken(user.ID, "", "user")
	if err != nil {
		return nil, "", false, err
	}

	return user, token, isNewUser, nil
}

// ProcessInvitationForOAuth processes invitation code for OAuth (WeChat/GitHub) registration
// This is called after a new user is created via OAuth login
func (s *Service) ProcessInvitationForOAuth(userID uint, invitationCode, ip string) error {
	if invitationCode == "" || s.couponService == nil {
		return nil
	}

	// Process invitation (same logic as email/phone registration)
	return s.couponService.RegisterWithInvitation(invitationCode, uint64(userID))
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
	providerDataJSON := fmt.Sprintf(`{"nickname":"%s","avatar_url":"%s"}`, nickname, avatarURL)
	
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
	// Verify the user exists
	user, err := s.repo.FindByID(userID)
	if err != nil {
		return fmt.Errorf("failed to find user: %w", err)
	}

	if user == nil {
		return errors.New("user not found")
	}

	// Delete the user and all associated data
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
