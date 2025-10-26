package user

import (
	"errors"
	"fmt"
	"math/rand"
	"scholar-backend/internal/common/model"
	"scholar-backend/internal/common/utils"
	"time"
)

// Service handles business logic for user operations
type Service struct {
	repo *Repository
}

// NewService creates a new user service
func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

// CheckEmailExists checks if an email is already registered
func (s *Service) CheckEmailExists(email string) (bool, error) {
	user, err := s.repo.FindByEmail(email)
	if err != nil {
		return false, err
	}
	return user != nil, nil
}

// RegisterWithEmail registers a new user with email and password
func (s *Service) RegisterWithEmail(email, password, code string) (*User, string, error) {
	// Verify the email code (only if code is provided)
	var vc *EmailVerificationCode
	if code != "" {
		var err error
		vc, err = s.repo.FindVerificationCode(email, code, "register")
		if err != nil {
			return nil, "", err
		}

		if vc == nil {
			return nil, "", errors.New("invalid or expired verification code")
		}
	}

	// Check if user already exists
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

	// Create user
	user := &User{
		Email:         &email,
		PasswordHash:  &hashedPassword,
		Status:        1,
		EmailVerified: true,
	}

	err = s.repo.Create(user)
	if err != nil {
		return nil, "", err
	}

	// Update last login time (registration counts as first login)
	_ = s.repo.UpdateLastLogin(user.ID)

	// Mark verification code as used (only if code was provided)
	if vc != nil {
		_ = s.repo.MarkVerificationCodeAsUsed(vc.ID)
	}

	// Create auth provider record
	authProvider := &UserAuthProvider{
		UserID:         user.ID,
		Provider:       "email",
		ProviderUserID: email,
	}
	_ = s.repo.CreateAuthProvider(authProvider)

	// Generate JWT token
	username := email
	if user.Username != nil {
		username = *user.Username
	}
	token, err := utils.GenerateToken(user.ID, username, "user")
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

// SendVerificationCode sends a verification code to an email
func (s *Service) SendVerificationCode(email, purpose string) error {
	// Generate 6-digit code
	code := fmt.Sprintf("%06d", rand.Intn(1000000))

	// Create verification code record
	vc := &EmailVerificationCode{
		Email:     email,
		Code:      code,
		Purpose:   purpose,
		ExpiresAt: time.Now().Add(10 * time.Minute),
		Used:      false,
	}

	err := s.repo.CreateVerificationCode(vc)
	if err != nil {
		return err
	}

	// TODO: Send email with verification code
	// For now, just log it (in production, use an email service)
	fmt.Printf("Verification code for %s (%s): %s\n", email, purpose, code)

	return nil
}

// GetProfile gets a user's profile
func (s *Service) GetProfile(id uint) (*User, error) {
	return s.repo.FindByID(id)
}

// UpdateProfile updates a user's profile
func (s *Service) UpdateProfile(id uint, username *string, avatarURL *string) error {
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
