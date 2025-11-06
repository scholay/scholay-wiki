package user

import (
	"errors"
	"fmt"
	"time"

	"scholar-backend/internal/common/model"
	conversationModel "scholar-backend/internal/conversation"
	subscriptionModel "scholar-backend/internal/subscription"
	"gorm.io/gorm"
)

// Repository handles database operations for users
type Repository struct {
	db *gorm.DB
}

// NewRepository creates a new user repository
func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

// GetDB returns the database instance
func (r *Repository) GetDB() *gorm.DB {
	return r.db
}

// FindByEmail finds a user by email
func (r *Repository) FindByEmail(email string) (*User, error) {
	var user User
	err := r.db.Where("email = ?", email).First(&user).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &user, nil
}

// FindByID finds a user by ID
func (r *Repository) FindByID(id uint) (*User, error) {
	var user User
	err := r.db.First(&user, id).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &user, nil
}

// FindByUsername finds a user by username
func (r *Repository) FindByUsername(username string) (*User, error) {
	var user User
	err := r.db.Where("username = ?", username).First(&user).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &user, nil
}

// Create creates a new user
func (r *Repository) Create(user *User) error {
	return r.db.Create(user).Error
}

// Update updates a user
func (r *Repository) Update(user *User) error {
	return r.db.Save(user).Error
}

// UpdateLastLogin updates the last login timestamp
func (r *Repository) UpdateLastLogin(id uint) error {
	now := time.Now()
	return r.db.Model(&User{}).Where("id = ?", id).Update("last_login_at", now).Error
}

// UpdatePassword updates the user's password
func (r *Repository) UpdatePassword(id uint, passwordHash string) error {
	return r.db.Model(&User{}).Where("id = ?", id).Update("password_hash", passwordHash).Error
}

// CreateVerificationCode creates a new verification code
func (r *Repository) CreateVerificationCode(code *EmailVerificationCode) error {
	return r.db.Create(code).Error
}

// FindVerificationCode finds a verification code
func (r *Repository) FindVerificationCode(email, code, purpose string) (*EmailVerificationCode, error) {
	var vc EmailVerificationCode
	err := r.db.Where("email = ? AND code = ? AND purpose = ? AND used = false AND expires_at > ?",
		email, code, purpose, time.Now()).First(&vc).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &vc, nil
}

// MarkVerificationCodeAsUsed marks a verification code as used
func (r *Repository) MarkVerificationCodeAsUsed(id uint) error {
	return r.db.Model(&EmailVerificationCode{}).Where("id = ?", id).Update("used", true).Error
}

// CreateAuthProvider creates a new auth provider record
func (r *Repository) CreateAuthProvider(provider *UserAuthProvider) error {
	return r.db.Create(provider).Error
}

// FindAuthProvider finds an auth provider
func (r *Repository) FindAuthProvider(provider, providerUserID string) (*UserAuthProvider, error) {
	var ap UserAuthProvider
	err := r.db.Where("provider = ? AND provider_user_id = ?", provider, providerUserID).First(&ap).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &ap, nil
}

// GetTotalUserCount returns the total number of users
func (r *Repository) GetTotalUserCount() (int64, error) {
	var count int64
	err := r.db.Model(&User{}).Count(&count).Error
	return count, err
}

// GetOnlineUserCount returns the count of currently online users (active sessions)
// A user is considered online if they have an active session with activity in the last 2 minutes
func (r *Repository) GetOnlineUserCount() (int64, error) {
	var count int64
	onlineThreshold := time.Now().Add(-2 * time.Minute)
	err := r.db.Model(&model.UserSession{}).
		Where("expires_at > ? AND last_activity > ?", time.Now(), onlineThreshold).
		Distinct("user_id").
		Count(&count).Error
	return count, err
}

// GetUserList returns a paginated list of users
func (r *Repository) GetUserList(offset, limit int) ([]User, int64, error) {
	var users []User
	var total int64

	// Get total count
	if err := r.db.Model(&User{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}

	// Get paginated users
	err := r.db.Order("created_at DESC").
		Offset(offset).
		Limit(limit).
		Find(&users).Error

	return users, total, err
}

// CreateSession creates a new user session
func (r *Repository) CreateSession(session *model.UserSession) error {
	return r.db.Create(session).Error
}

// UpdateSessionActivity updates the last activity time of a session
func (r *Repository) UpdateSessionActivity(token string) error {
	return r.db.Model(&model.UserSession{}).
		Where("token = ?", token).
		Update("last_activity", time.Now()).Error
}

// DeleteExpiredSessions deletes all expired sessions
func (r *Repository) DeleteExpiredSessions() error {
	return r.db.Where("expires_at < ?", time.Now()).
		Delete(&model.UserSession{}).Error
}

// DeleteUserSessions deletes all sessions for a user
func (r *Repository) DeleteUserSessions(userID uint) error {
	return r.db.Where("user_id = ?", userID).
		Delete(&model.UserSession{}).Error
}

// GetUserSession finds a session by token
func (r *Repository) GetUserSession(token string) (*model.UserSession, error) {
	var session model.UserSession
	err := r.db.Where("token = ?", token).First(&session).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &session, nil
}

// GetOnlineUsers returns list of currently online users with their session info
// A user is considered online if they have an active session with activity in the last 2 minutes
func (r *Repository) GetOnlineUsers() ([]map[string]interface{}, error) {
	var results []map[string]interface{}

	// Consider a user online if they had activity in the last 2 minutes
	onlineThreshold := time.Now().Add(-2 * time.Minute)

	err := r.db.Raw(`
		SELECT
			u.id,
			u.email,
			u.username,
			s2.last_activity,
			s2.ip,
			s2.user_agent
		FROM users u
		INNER JOIN (
			SELECT
				user_id,
				last_activity,
				ip,
				user_agent
			FROM user_sessions
			WHERE expires_at > ? AND last_activity > ?
			ORDER BY last_activity DESC
		) s2 ON u.id = s2.user_id
		GROUP BY u.id, s2.last_activity, s2.ip, s2.user_agent
		ORDER BY s2.last_activity DESC
	`, time.Now(), onlineThreshold).Scan(&results).Error

	return results, err
}

// GetUserStatisticsByDateRange returns user statistics for a date range
func (r *Repository) GetUserStatisticsByDateRange(startDate, endDate string) ([]model.UserStatistics, error) {
	var stats []model.UserStatistics
	err := r.db.Where("date >= ? AND date <= ?", startDate, endDate).
		Order("date ASC").
		Find(&stats).Error
	return stats, err
}

// GetOrCreateDailyStatistics gets or creates statistics record for a specific date
func (r *Repository) GetOrCreateDailyStatistics(date string) (*model.UserStatistics, error) {
	var stats model.UserStatistics
	err := r.db.Where("date = ?", date).First(&stats).Error

	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			// Create new record
			stats.Date = date
			stats.NewUsers = 0
			stats.TotalUsers = 0
			stats.PeakOnlineUsers = 0
			if err := r.db.Create(&stats).Error; err != nil {
				return nil, err
			}
			return &stats, nil
		}
		return nil, err
	}

	return &stats, nil
}

// UpdateDailyStatistics updates daily statistics
func (r *Repository) UpdateDailyStatistics(date string, newUsers, totalUsers, peakOnline int) error {
	return r.db.Model(&model.UserStatistics{}).
		Where("date = ?", date).
		Updates(map[string]interface{}{
			"new_users":         newUsers,
			"total_users":       totalUsers,
			"peak_online_users": peakOnline,
		}).Error
}

// IncrementNewUsers increments new users count for a specific date
func (r *Repository) IncrementNewUsers(date string) error {
	return r.db.Exec(`
		INSERT INTO user_statistics (date, new_users, total_users, peak_online_users)
		VALUES (?, 1, 0, 0)
		ON DUPLICATE KEY UPDATE new_users = new_users + 1
	`, date).Error
}

// UpdatePeakOnlineUsers updates peak online users if current count is higher
func (r *Repository) UpdatePeakOnlineUsers(date string, currentOnline int) error {
	return r.db.Exec(`
		INSERT INTO user_statistics (date, new_users, total_users, peak_online_users)
		VALUES (?, 0, 0, ?)
		ON DUPLICATE KEY UPDATE
			peak_online_users = IF(? > peak_online_users, ?, peak_online_users)
	`, date, currentOnline, currentOnline, currentOnline).Error
}

// GetOnlineUserSnapshots returns online user snapshots for a time range
func (r *Repository) GetOnlineUserSnapshots(startTime, endTime time.Time) ([]model.OnlineUserSnapshot, error) {
	var snapshots []model.OnlineUserSnapshot
	err := r.db.Where("timestamp >= ? AND timestamp <= ?", startTime, endTime).
		Order("timestamp ASC").
		Find(&snapshots).Error
	return snapshots, err
}

// CreateOnlineUserSnapshot creates a new online user count snapshot
func (r *Repository) CreateOnlineUserSnapshot(timestamp time.Time, onlineCount int) error {
	snapshot := &model.OnlineUserSnapshot{
		Timestamp:   timestamp,
		OnlineCount: onlineCount,
	}
	return r.db.Create(snapshot).Error
}

// FindByPhone finds a user by phone number
func (r *Repository) FindByPhone(phone string) (*User, error) {
	var user User
	err := r.db.Where("phone = ?", phone).First(&user).Error
	if err == gorm.ErrRecordNotFound {
		return nil, nil
	}
	return &user, err
}

// FindAuthProviderByUserAndProvider finds auth provider by user ID and provider type
func (r *Repository) FindAuthProviderByUserAndProvider(userID uint, provider string) (*UserAuthProvider, error) {
	var authProvider UserAuthProvider
	err := r.db.Where("user_id = ? AND provider = ?", userID, provider).First(&authProvider).Error
	if err == gorm.ErrRecordNotFound {
		return nil, nil
	}
	return &authProvider, err
}

// UpdateAuthProvider updates an auth provider record
func (r *Repository) UpdateAuthProvider(provider *UserAuthProvider) error {
	return r.db.Save(provider).Error
}

// DeleteAuthProvider deletes an auth provider by ID
func (r *Repository) DeleteAuthProvider(id uint) error {
	return r.db.Delete(&UserAuthProvider{}, id).Error
}

// FindAuthProviderByProviderAndProviderUserID finds auth provider by provider type and provider user ID
func (r *Repository) FindAuthProviderByProviderAndProviderUserID(provider, providerUserID string) (*UserAuthProvider, error) {
	var authProvider UserAuthProvider
	err := r.db.Where("provider = ? AND provider_user_id = ?", provider, providerUserID).First(&authProvider).Error
	if err == gorm.ErrRecordNotFound {
		return nil, nil
	}
	return &authProvider, err
}

// DeleteUser deletes a user and all associated data (except statistics)
// This method performs a cascading delete for all user-related data
func (r *Repository) DeleteUser(userID uint) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		// 1. Delete usage quotas (not cascaded by FK)
		if err := tx.Where("user_id = ?", userID).Delete(&subscriptionModel.UsageQuota{}).Error; err != nil {
			return fmt.Errorf("failed to delete usage quotas: %w", err)
		}

		// 2. Delete conversation messages (not directly cascaded)
		// First get all conversation IDs for this user
		var conversationIDs []uint
		if err := tx.Model(&conversationModel.Conversation{}).
			Where("user_id = ?", userID).
			Pluck("id", &conversationIDs).Error; err != nil {
			return fmt.Errorf("failed to get conversation IDs: %w", err)
		}

		// Delete all messages for these conversations
		if len(conversationIDs) > 0 {
			if err := tx.Where("conversation_id IN ?", conversationIDs).
				Delete(&conversationModel.ConversationMessage{}).Error; err != nil {
				return fmt.Errorf("failed to delete conversation messages: %w", err)
			}
		}

		// 3. Delete the user (this will cascade delete the following via FK constraints):
		//    - user_auth_providers (ON DELETE CASCADE)
		//    - user_sessions (ON DELETE CASCADE)
		//    - conversations (ON DELETE CASCADE)
		//    - user_subscriptions (ON DELETE CASCADE)
		//    - orders (ON DELETE CASCADE)
		//    - payment_transactions (via orders ON DELETE CASCADE)
		if err := tx.Delete(&User{}, userID).Error; err != nil {
			return fmt.Errorf("failed to delete user: %w", err)
		}

		// Note: user_statistics and online_user_snapshots are intentionally NOT deleted
		// as they are kept for historical statistical analysis

		return nil
	})
}
