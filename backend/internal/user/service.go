package user

import (
	"context"
	"errors"
	"fmt"
	"math/rand"
	"scholar-backend/internal/common/cache"
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
}

// Service handles business logic for user operations
type Service struct {
	repo          *Repository
	configService ConfigService
	couponService CouponService
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
func (s *Service) RegisterWithEmail(email, password, code string) (*User, string, error) {
	return s.RegisterWithEmailAndInvitation(email, password, code, "")
}

// RegisterWithEmailAndInvitation registers a new user with email, password and optional invitation code
func (s *Service) RegisterWithEmailAndInvitation(email, password, code, invitationCode string) (*User, string, error) {
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

		// Update last login time (registration counts as first login)
		_ = txRepo.UpdateLastLogin(user.ID)

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

	return user, token, nil
}

// LoginWithEmail logs in a user with email and password
func (s *Service) LoginWithEmail(email, password string) (*User, string, error) {
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

	// Update last login time
	_ = s.repo.UpdateLastLogin(user.ID)

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
	return s.repo.UpdatePassword(user.ID, hashedPassword)
}

// LoginWithEmailCode logs in a user with email and verification code
func (s *Service) LoginWithEmailCode(email, code string) (*User, string, error) {
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

	// Update last login time
	_ = s.repo.UpdateLastLogin(user.ID)

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
			// Format: "Scholar 注册验证码 [Ref: ABC]" - professional and unambiguous
			refCode := fmt.Sprintf("%c%c%c",
				'A'+rand.Intn(26),
				'A'+rand.Intn(26),
				'A'+rand.Intn(26))
			subject := fmt.Sprintf("Scholar %s [Ref: %s]", purposeText, refCode)

			// Add timestamp to body to avoid content deduplication
			currentTime := time.Now().Format("2006-01-02 15:04:05")
			body := fmt.Sprintf(`
			<html>
			<body style="font-family: Arial, sans-serif; padding: 20px;">
				<h2 style="color: #2563eb;">Scholar %s</h2>
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

	// Get subscription info
	var subData struct {
		PlanName     string    `gorm:"column:plan_name"`
		PlanCode     string    `gorm:"column:plan_code"`
		BillingCycle string    `gorm:"column:billing_cycle"`
		Status       string    `gorm:"column:status"`
		StartDate    time.Time `gorm:"column:start_date"`
		EndDate      time.Time `gorm:"column:end_date"`
		AutoRenew    bool      `gorm:"column:auto_renew"`
	}
	err = s.repo.GetDB().Table("user_subscriptions").
		Select("subscription_plans.name as plan_name, subscription_plans.code as plan_code, user_subscriptions.billing_cycle, user_subscriptions.status, user_subscriptions.start_date, user_subscriptions.end_date, user_subscriptions.auto_renew").
		Joins("LEFT JOIN subscription_plans ON user_subscriptions.plan_id = subscription_plans.id").
		Where("user_subscriptions.user_id = ? AND user_subscriptions.status = ?", userID, "active").
		First(&subData).Error

	if err == nil {
		remainingDays := int(time.Until(subData.EndDate).Hours() / 24)
		if remainingDays < 0 {
			remainingDays = 0
		}

		detail.CurrentSubscription = &SubscriptionInfo{
			PlanName:      subData.PlanName,
			PlanCode:      subData.PlanCode,
			BillingCycle:  subData.BillingCycle,
			Status:        subData.Status,
			StartDate:     subData.StartDate,
			EndDate:       subData.EndDate,
			AutoRenew:     subData.AutoRenew,
			RemainingDays: remainingDays,
		}

		// Get quota usage
		var quotaData struct {
			TotalQuota int `gorm:"column:total_quota"`
			UsedQuota  int `gorm:"column:used_quota"`
		}
		s.repo.GetDB().Table("subscription_quota").
			Select("SUM(conversations_quota + searches_quota + advanced_searches_quota + pdf_previews_quota) as total_quota, SUM(conversations_used + searches_used + advanced_searches_used + pdf_previews_used) as used_quota").
			Where("user_id = ?", userID).
			Scan(&quotaData)

		detail.CurrentSubscription.TotalQuota = quotaData.TotalQuota
		detail.CurrentSubscription.UsedQuota = quotaData.UsedQuota
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

	return detail, nil
}

// CreateSession creates a new user session
func (s *Service) CreateSession(userID uint, token, ip, userAgent string, expiresIn time.Duration) error {
	session := &model.UserSession{
		UserID:       userID,
		Token:        token,
		IP:           ip,
		UserAgent:    userAgent,
		LastActivity: time.Now(),
		ExpiresAt:    time.Now().Add(expiresIn),
	}
	return s.repo.CreateSession(session)
}

// UpdateSessionActivity updates the last activity time of a session
func (s *Service) UpdateSessionActivity(token string) error {
	return s.repo.UpdateSessionActivity(token)
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
	return s.repo.UpdatePassword(userID, hashedPassword)
}

// GetUserStatisticsChart returns user registration statistics for charts
func (s *Service) GetUserStatisticsChart(days int) ([]map[string]interface{}, error) {
	startDate := time.Now().AddDate(0, 0, -days+1)
	// Set to beginning of day (00:00:00)
	startDate = time.Date(startDate.Year(), startDate.Month(), startDate.Day(), 0, 0, 0, 0, startDate.Location())

	// Generate result with all dates filled
	result := make([]map[string]interface{}, 0, days)
	currentDate := startDate

	for i := 0; i < days; i++ {
		dateStr := currentDate.Format("2006-01-02")

		// Calculate new users for this date directly from users table
		var newUsers int64
		err := s.repo.GetDB().Model(&User{}).
			Where("DATE(created_at) = ?", dateStr).
			Count(&newUsers).Error
		if err != nil {
			newUsers = 0
		}

		result = append(result, map[string]interface{}{
			"date":      dateStr,
			"new_users": newUsers,
		})

		// Move to next day
		currentDate = currentDate.AddDate(0, 0, 1)
	}

	return result, nil
}

// GetOnlineUserChartData returns online user count snapshots for charts
func (s *Service) GetOnlineUserChartData(hours int) ([]map[string]interface{}, error) {
	endTime := time.Now()
	startTime := endTime.Add(-time.Duration(hours) * time.Hour)
	// Round to nearest 5 minutes
	startTime = startTime.Truncate(5 * time.Minute)

	snapshots, err := s.repo.GetOnlineUserSnapshots(startTime, endTime)
	if err != nil {
		return nil, err
	}

	// Create a map for quick lookup of existing snapshots (rounded to 5-minute intervals)
	snapshotsMap := make(map[string]int)
	for _, snapshot := range snapshots {
		// Round timestamp to nearest 5 minutes
		roundedTime := snapshot.Timestamp.Truncate(5 * time.Minute)
		key := roundedTime.Format("2006-01-02 15:04:05")
		snapshotsMap[key] = snapshot.OnlineCount
	}

	// Generate result with all time points filled (every 5 minutes)
	intervals := hours * 12 // 12 intervals of 5 minutes per hour
	result := make([]map[string]interface{}, 0, intervals)
	currentTime := startTime

	for i := 0; i < intervals; i++ {
		timeStr := currentTime.Format("2006-01-02 15:04:05")

		// Get online count for this time or use 0
		onlineCount := 0
		if count, exists := snapshotsMap[timeStr]; exists {
			onlineCount = count
		}

		result = append(result, map[string]interface{}{
			"timestamp":    timeStr,
			"online_count": onlineCount,
		})

		// Move to next 5-minute interval
		currentTime = currentTime.Add(5 * time.Minute)
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
					params["product"] = "Scholar"
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
func (s *Service) RegisterWithPhone(phone, password, code, invitationCode string) (*User, string, error) {
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

		// Update last login time (registration counts as first login)
		_ = txRepo.UpdateLastLogin(user.ID)

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

	return user, token, nil
}

// LoginWithPhone handles login with phone and password
func (s *Service) LoginWithPhone(phone, password string) (*User, string, error) {
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

	// Update last login time
	now := time.Now()
	user.LastLoginAt = &now
	if err := s.repo.Update(user); err != nil {
		return nil, "", err
	}

	// Generate JWT token
	token, err := utils.GenerateToken(user.ID, "", "user")
	if err != nil {
		return nil, "", err
	}

	return user, token, nil
}

// ResetPasswordPhone resets user password with phone verification code
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
	return s.repo.UpdatePassword(user.ID, hashedPassword)
}

// LoginWithPhoneCode logs in a user with phone and verification code
func (s *Service) LoginWithPhoneCode(phone, code string) (*User, string, error) {
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

	// Update last login time
	now := time.Now()
	user.LastLoginAt = &now
	if err := s.repo.Update(user); err != nil {
		return nil, "", err
	}

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
func (s *Service) LoginOrRegisterWithWeChat(openID, unionID, nickname, avatarURL string) (*User, string, bool, error) {
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

		// Update last login time
		now := time.Now()
		user.LastLoginAt = &now
		if err := s.repo.Update(user); err != nil {
			return nil, "", false, err
		}
		
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

	// Update last login time (registration counts as first login)
	_ = s.repo.UpdateLastLogin(user.ID)

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
