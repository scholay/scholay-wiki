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
)

// ConfigService interface for email and SMS configuration
type ConfigService interface {
	GetActiveEmailConfig() (*model.EmailConfig, error)
	GetActiveSMSConfig() (*model.SMSConfig, error)
}

// Service handles business logic for user operations
type Service struct {
	repo          *Repository
	configService ConfigService
}

// NewService creates a new user service
func NewService(repo *Repository) *Service {
	return &Service{
		repo:          repo,
		configService: nil, // Will be set via SetConfigService
	}
}

// SetConfigService sets the config service (for dependency injection)
func (s *Service) SetConfigService(configService ConfigService) {
	s.configService = configService
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
	totalUsers, err := s.repo.GetTotalUserCount()
	if err != nil {
		return nil, err
	}

	onlineUsers, err := s.repo.GetOnlineUserCount()
	if err != nil {
		return nil, err
	}

	stats := map[string]interface{}{
		"total_users":  totalUsers,
		"online_users": onlineUsers,
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

// GetUserStatisticsChart returns user registration statistics for charts
func (s *Service) GetUserStatisticsChart(days int) ([]map[string]interface{}, error) {
	endDate := time.Now()
	startDate := time.Now().AddDate(0, 0, -days+1)
	// Set to beginning of day (00:00:00)
	startDate = time.Date(startDate.Year(), startDate.Month(), startDate.Day(), 0, 0, 0, 0, startDate.Location())

	// Get existing stats from database
	stats, err := s.repo.GetUserStatisticsByDateRange(startDate.Format("2006-01-02"), endDate.Format("2006-01-02"))
	if err != nil {
		return nil, err
	}

	// Create a map for quick lookup of existing stats
	statsMap := make(map[string]*model.UserStatistics)
	for i := range stats {
		statsMap[stats[i].Date] = &stats[i]
	}

	// Generate result with all dates filled
	result := make([]map[string]interface{}, 0, days)
	currentDate := startDate

	for i := 0; i < days; i++ {
		dateStr := currentDate.Format("2006-01-02")

		// Get stats for this date or use zeros
		var newUsers, peakOnline int
		if stat, exists := statsMap[dateStr]; exists {
			newUsers = stat.NewUsers
			peakOnline = stat.PeakOnlineUsers
		}

		// Calculate total users up to this date using SQL
		var totalUsers int64
		err := s.repo.GetDB().Model(&User{}).
			Where("DATE(created_at) <= ?", dateStr).
			Count(&totalUsers).Error
		if err != nil {
			totalUsers = 0
		}

		result = append(result, map[string]interface{}{
			"date":              dateStr,
			"new_users":         newUsers,
			"total_users":       totalUsers,
			"peak_online_users": peakOnline,
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
func (s *Service) RegisterWithPhone(phone, password, code string) (*User, string, error) {
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
	// Get current user
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

	// Verify the code
	valid, err := cache.VerifyCode(context.Background(), *user.Phone, code, "unbind")
	if err != nil {
		return fmt.Errorf("failed to verify code: %w", err)
	}
	if !valid {
		return errors.New("invalid or expired verification code")
	}

	// Check if user has at least one other login method
	hasEmail := user.Email != nil && *user.Email != ""
	hasWeChat := false
	wechatProvider, _ := s.repo.FindAuthProviderByUserAndProvider(userID, "wechat")
	if wechatProvider != nil {
		hasWeChat = true
	}

	if !hasEmail && !hasWeChat {
		return errors.New("cannot unbind phone: at least one login method must remain")
	}

	// Remove phone
	user.Phone = nil
	user.PhoneVerified = false

	if err := s.repo.Update(user); err != nil {
		return err
	}

	// Remove auth provider
	authProvider, err := s.repo.FindAuthProviderByUserAndProvider(userID, "phone")
	if err != nil {
		return err
	}
	if authProvider != nil {
		if err := s.repo.DeleteAuthProvider(authProvider.ID); err != nil {
			return err
		}
	}

	return nil
}

// UnbindEmail unbinds email from user account
func (s *Service) UnbindEmail(userID uint, code string) error {
	// Get current user
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

	// Verify the code
	valid, err := cache.VerifyCode(context.Background(), *user.Email, code, "unbind")
	if err != nil {
		return fmt.Errorf("failed to verify code: %w", err)
	}
	if !valid {
		return errors.New("invalid or expired verification code")
	}

	// Check if user has at least one other login method
	hasPhone := user.Phone != nil && *user.Phone != ""
	hasWeChat := false
	wechatProvider, _ := s.repo.FindAuthProviderByUserAndProvider(userID, "wechat")
	if wechatProvider != nil {
		hasWeChat = true
	}

	if !hasPhone && !hasWeChat {
		return errors.New("cannot unbind email: at least one login method must remain")
	}

	// Remove email
	user.Email = nil
	user.EmailVerified = false

	if err := s.repo.Update(user); err != nil {
		return err
	}

	// Remove auth provider
	authProvider, err := s.repo.FindAuthProviderByUserAndProvider(userID, "email")
	if err != nil {
		return err
	}
	if authProvider != nil {
		if err := s.repo.DeleteAuthProvider(authProvider.ID); err != nil {
			return err
		}
	}

	return nil
}

// UnbindWeChat unbinds WeChat from user account
func (s *Service) UnbindWeChat(userID uint) error {
	// Get current user
	user, err := s.repo.FindByID(userID)
	if err != nil {
		return err
	}
	if user == nil {
		return errors.New("user not found")
	}

	// Check if WeChat is bound
	wechatProvider, err := s.repo.FindAuthProviderByUserAndProvider(userID, "wechat")
	if err != nil {
		return err
	}
	if wechatProvider == nil {
		return errors.New("WeChat is not bound")
	}

	// Check if user has at least one other login method
	hasEmail := user.Email != nil && *user.Email != ""
	hasPhone := user.Phone != nil && *user.Phone != ""

	if !hasEmail && !hasPhone {
		return errors.New("cannot unbind WeChat: at least one login method must remain")
	}

	// Remove auth provider
	if err := s.repo.DeleteAuthProvider(wechatProvider.ID); err != nil {
		return err
	}

	return nil
}

// LoginOrRegisterWithWeChat handles WeChat login or registration
func (s *Service) LoginOrRegisterWithWeChat(openID, unionID, nickname, avatarURL string) (*User, string, bool, error) {
	// Try to find existing user by openID
	authProvider, err := s.repo.FindAuthProviderByProviderAndProviderUserID("wechat", openID)
	if err != nil {
		return nil, "", false, err
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

	// Create auth provider entry
	authProvider = &UserAuthProvider{
		UserID:         user.ID,
		Provider:       "wechat",
		ProviderUserID: openID,
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
	// Check if WeChat is already bound to another user
	existing, err := s.repo.FindAuthProviderByProviderAndProviderUserID("wechat", openID)
	if err != nil {
		return err
	}

	if existing != nil && existing.UserID != userID {
		return errors.New("该微信账号已被其他账号绑定")
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

	if authProvider == nil {
		// Create new auth provider
		authProvider = &UserAuthProvider{
			UserID:         userID,
			Provider:       "wechat",
			ProviderUserID: openID,
		}
		if err := s.repo.CreateAuthProvider(authProvider); err != nil {
			return err
		}
	} else {
		// Update existing auth provider
		authProvider.ProviderUserID = openID
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
