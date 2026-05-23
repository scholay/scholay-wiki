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
	"scholar-backend/internal/common/database"
	"scholar-backend/internal/common/utils"
	"time"
)

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

// GetUserStatistics returns user registration counters for the admin overview.
// 在线 / 访客 / DAU 类指标全部下线 —— 已经移交 umami 处理(见 0044 迁移)。
func (s *Service) GetUserStatistics() (map[string]any, error) {
	now := time.Now()
	today := now.Format("2006-01-02")
	todayRegistrations, _ := s.repo.CountUsersOnDate(today)

	// 本周注册 (从周一开始)
	weekStart := now.AddDate(0, 0, -int(now.Weekday())+1)
	if now.Weekday() == time.Sunday {
		weekStart = now.AddDate(0, 0, -6)
	}
	weekRegistrations, _ := s.repo.CountUsersSince(weekStart.Format("2006-01-02"))

	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	monthRegistrations, _ := s.repo.CountUsersSince(monthStart.Format("2006-01-02"))

	yearStart := time.Date(now.Year(), 1, 1, 0, 0, 0, 0, now.Location())
	yearRegistrations, _ := s.repo.CountUsersSince(yearStart.Format("2006-01-02"))

	return map[string]any{
		"today_registrations": todayRegistrations,
		"week_registrations":  weekRegistrations,
		"month_registrations": monthRegistrations,
		"year_registrations":  yearRegistrations,
	}, nil
}

// GetUserList returns a paginated list of users
func (s *Service) GetUserList(page, pageSize int) ([]User, int64, error) {
	return s.repo.GetUserList(database.CalcOffset(page, pageSize), pageSize)
}

// GetUserListWithSort returns a paginated list of users with sorting
func (s *Service) GetUserListWithSort(page, pageSize int, sortBy, sortOrder string) ([]User, int64, error) {
	return s.repo.GetUserListWithSort(database.CalcOffset(page, pageSize), pageSize, sortBy, sortOrder)
}

// GetUserListWithFilter is the recommended entrypoint for the admin user list:
// supports server-side keyword search + status/role filter + sort.
func (s *Service) GetUserListWithFilter(page, pageSize int, f UserListFilter) ([]User, int64, error) {
	return s.repo.GetUserListWithFilter(database.CalcOffset(page, pageSize), pageSize, f)
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

	if user.Role == "admin" || user.Role == "super_admin" {
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
