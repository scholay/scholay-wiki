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
	"strings"
	"time"

	"scholar-backend/internal/common/model"
	"scholar-backend/internal/common/utils"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// Repository handles database operations for users
type Repository struct {
	db *gorm.DB
}

// NewRepository creates a new user repository
func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

// nonAdminScope is a reusable GORM scope that excludes admin / super_admin
// accounts from user-facing queries. After the admin-to-users migration every
// row has an explicit role value.
func nonAdminScope(db *gorm.DB) *gorm.DB {
	return db.Where("role NOT IN ?", []string{"admin", "super_admin"})
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

// FindByIDs finds users by IDs and returns a map
func (r *Repository) FindByIDs(ids []uint) (map[uint]*User, error) {
	if len(ids) == 0 {
		return make(map[uint]*User), nil
	}

	var users []User
	err := r.db.Where("id IN ?", ids).Find(&users).Error
	if err != nil {
		return nil, err
	}

	result := make(map[uint]*User)
	for i := range users {
		result[users[i].ID] = &users[i]
	}
	return result, nil
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

// UpdateLastLoginWithIP updates the last login timestamp and IP
func (r *Repository) UpdateLastLoginWithIP(id uint, ip string) error {
	now := time.Now()
	return r.db.Model(&User{}).Where("id = ?", id).Updates(map[string]any{
		"last_login_at": now,
		"last_login_ip": ip,
	}).Error
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

// GetTotalUserCount returns the total number of non-admin users
func (r *Repository) GetTotalUserCount() (int64, error) {
	var count int64
	err := r.db.Model(&User{}).Scopes(nonAdminScope).Count(&count).Error
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

// GetUserList returns a paginated list of non-admin users
func (r *Repository) GetUserList(offset, limit int) ([]User, int64, error) {
	var users []User
	var total int64

	if err := r.db.Model(&User{}).Scopes(nonAdminScope).Count(&total).Error; err != nil {
		return nil, 0, err
	}

	// id DESC tiebreaker：避免高并发注册时同一秒多用户在 OFFSET 分页中漏页/重复
	err := r.db.Scopes(nonAdminScope).
		Order("created_at DESC, id DESC").
		Offset(offset).
		Limit(limit).
		Find(&users).Error

	return users, total, err
}

var allowedSortColumns = map[string]bool{
	"last_login_at": true,
	"created_at":    true,
}

// GetUserListWithSort returns a paginated list of non-admin users with sorting.
// sortBy and sortOrder are validated against a whitelist to prevent SQL injection.
func (r *Repository) GetUserListWithSort(offset, limit int, sortBy, sortOrder string) ([]User, int64, error) {
	return r.GetUserListWithFilter(offset, limit, UserListFilter{
		SortBy:    sortBy,
		SortOrder: sortOrder,
	})
}

// UserListFilter aggregates server-side query options for the admin user list.
//
// Semantics:
//   - Q       : LIKE 搜索 username / email / phone
//   - Status  : nil 不过滤；指定值精确匹配 (0/1/-1/2)
//   - Role    : "" 时默认排除 admin/super_admin；指定值精确匹配 (允许查看管理员行)
//   - TagID   : 0 不过滤;>0 筛选打了该标签的用户
//   - SortBy  / SortOrder : 与 GetUserListWithSort 同义，走白名单校验
type UserListFilter struct {
	Q         string
	Status    *int8
	Role      string
	TagID     uint
	SortBy    string
	SortOrder string
}

// GetUserListWithFilter returns paginated users with optional search/filter/sort.
// 安全：role/status 走精确匹配避免注入；q 用 LIKE 但参数化 + 转义 % / _。
func (r *Repository) GetUserListWithFilter(offset, limit int, f UserListFilter) ([]User, int64, error) {
	if !allowedSortColumns[f.SortBy] {
		f.SortBy = "last_login_at"
	}
	if f.SortOrder != "asc" && f.SortOrder != "desc" {
		f.SortOrder = "desc"
	}

	query := r.db.Model(&User{})

	// role: 指定就精确匹配（允许列出 admin/super_admin），未指定时按用户列表语义排除管理员
	switch f.Role {
	case "":
		query = query.Scopes(nonAdminScope)
	case "user", "admin", "super_admin":
		query = query.Where("role = ?", f.Role)
	default:
		// 非法 role 值 → 当作未指定，避免给攻击者枚举字段值的能力
		query = query.Scopes(nonAdminScope)
	}

	if f.Status != nil {
		query = query.Where("status = ?", *f.Status)
	}

	// 标签筛选 — 走 join
	if f.TagID > 0 {
		query = query.Joins("JOIN user_tag_assignments ON user_tag_assignments.user_id = users.id").
			Where("user_tag_assignments.tag_id = ?", f.TagID)
	}

	if f.Q != "" {
		// 转义 LIKE 元字符；上限 100 字符防滥用
		raw := f.Q
		if len(raw) > 100 {
			raw = raw[:100]
		}
		escaped := strings.ReplaceAll(raw, `\`, `\\`)
		escaped = strings.ReplaceAll(escaped, "%", `\%`)
		escaped = strings.ReplaceAll(escaped, "_", `\_`)
		like := "%" + escaped + "%"
		query = query.Where(
			"username LIKE ? ESCAPE '\\\\' OR email LIKE ? ESCAPE '\\\\' OR phone LIKE ? ESCAPE '\\\\'",
			like, like, like,
		)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var users []User
	// id DESC tiebreaker：避免 OFFSET 分页在并发场景下漏页/重复
	err := query.Order(f.SortBy + " " + f.SortOrder + ", id DESC").
		Offset(offset).
		Limit(limit).
		Find(&users).Error
	return users, total, err
}

// GetUserAuthProviders returns all auth providers for given user IDs
func (r *Repository) GetUserAuthProviders(userIDs []uint) (map[uint][]UserAuthProvider, error) {
	var providers []UserAuthProvider
	if err := r.db.Where("user_id IN ?", userIDs).Find(&providers).Error; err != nil {
		return nil, err
	}

	// Group by user ID
	result := make(map[uint][]UserAuthProvider)
	for _, p := range providers {
		result[p.UserID] = append(result[p.UserID], p)
	}
	return result, nil
}

// CreateSession creates a new user session
func (r *Repository) CreateSession(session *model.UserSession) error {
	return r.db.Create(session).Error
}

// UpdateSessionActivity updates the last activity time of a session and user's last login time and IP
func (r *Repository) UpdateSessionActivity(token, ip string) error {
	// Get session to find user_id
	var session model.UserSession
	if err := r.db.Where("token = ?", token).First(&session).Error; err != nil {
		return err
	}

	// Use transaction to update both session and user
	return r.db.Transaction(func(tx *gorm.DB) error {
		// Update session last_activity and IP
		if err := tx.Model(&model.UserSession{}).
			Where("token = ?", token).
			Updates(map[string]any{
				"last_activity": time.Now(),
				"ip":            ip,
			}).Error; err != nil {
			return err
		}

		// Update user's last_login_at and last_login_ip
		if err := tx.Model(&User{}).
			Where("id = ?", session.UserID).
			Updates(map[string]any{
				"last_login_at": time.Now(),
				"last_login_ip": ip,
			}).Error; err != nil {
			return err
		}

		return nil
	})
}

// UpdateSessionActivityByUserID updates session activity and user's last login info by user ID
// Used by WebSocket connections which don't have access to the original token
func (r *Repository) UpdateSessionActivityByUserID(userID uint, ip string) error {
	now := time.Now()

	// Use transaction to update both session and user
	return r.db.Transaction(func(tx *gorm.DB) error {
		// Update all active sessions for this user
		if err := tx.Model(&model.UserSession{}).
			Where("user_id = ? AND expires_at > ?", userID, now).
			Updates(map[string]any{
				"last_activity": now,
				"ip":            ip,
			}).Error; err != nil {
			return err
		}

		// Update user's last_login_at and last_login_ip
		if err := tx.Model(&User{}).
			Where("id = ?", userID).
			Updates(map[string]any{
				"last_login_at": now,
				"last_login_ip": ip,
			}).Error; err != nil {
			return err
		}

		return nil
	})
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

// DeleteUserSessionsByDeviceType deletes all sessions for a user with specific device type
// This is used for single sign-on: when user logs in on a new device,
// kick out other sessions of the same device type
func (r *Repository) DeleteUserSessionsByDeviceType(userID uint, deviceType string) error {
	return r.db.Where("user_id = ? AND device_type = ?", userID, deviceType).
		Delete(&model.UserSession{}).Error
}

// GetUserSessionsByDeviceType gets all sessions for a user with specific device type
func (r *Repository) GetUserSessionsByDeviceType(userID uint, deviceType string) ([]model.UserSession, error) {
	var sessions []model.UserSession
	err := r.db.Where("user_id = ? AND device_type = ?", userID, deviceType).
		Find(&sessions).Error
	return sessions, err
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

// GetSessionByID finds a session by ID
func (r *Repository) GetSessionByID(id uint) (*model.UserSession, error) {
	var session model.UserSession
	err := r.db.Where("id = ?", id).First(&session).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &session, nil
}

// UpdateSessionToken updates the token and expiry for a session
func (r *Repository) UpdateSessionToken(sessionID uint, newToken string, newExpiry time.Time) error {
	return r.db.Model(&model.UserSession{}).
		Where("id = ?", sessionID).
		Updates(map[string]any{
			"token":         newToken,
			"expires_at":    newExpiry,
			"last_activity": time.Now(),
		}).Error
}

// GetOnlineUsers returns list of currently online users with their session info
// A user is considered online if they have an active session with activity in the last 2 minutes
func (r *Repository) GetOnlineUsers() ([]map[string]any, error) {
	type OnlineUserRaw struct {
		ID           uint      `json:"id"`
		Email        *string   `json:"email"`
		Username     *string   `json:"username"`
		LastActivity time.Time `json:"last_activity"`
		IP           string    `json:"ip"`
		UserAgent    string    `json:"user_agent"`
	}

	var rawResults []OnlineUserRaw

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
	`, time.Now(), onlineThreshold).Scan(&rawResults).Error

	if err != nil {
		return nil, err
	}

	// Convert to map and add parsed information
	results := make([]map[string]any, len(rawResults))
	for i, raw := range rawResults {
		result := map[string]any{
			"id":            raw.ID,
			"email":         raw.Email,
			"username":      raw.Username,
			"last_activity": raw.LastActivity,
			"ip":            raw.IP,
			"user_agent":    raw.UserAgent,
		}

		// Parse IP location
		location := utils.ParseIPLocation(raw.IP)
		result["location"] = utils.GetLocationString(location)
		result["location_detail"] = location

		// Parse user agent
		deviceInfo := utils.ParseUserAgent(raw.UserAgent)
		result["device"] = utils.GetSimpleDeviceString(deviceInfo)
		result["device_detail"] = deviceInfo

		results[i] = result
	}

	return results, nil
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
		Updates(map[string]any{
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
func (r *Repository) CreateOnlineUserSnapshot(timestamp time.Time, onlineCount, guestCount int) error {
	snapshot := &model.OnlineUserSnapshot{
		Timestamp:   timestamp,
		OnlineCount: onlineCount,
		GuestCount:  guestCount,
	}
	return r.db.Create(snapshot).Error
}

// UpsertOnlineSnapshot 插入或更新在线快照（保留峰值）
// 如果同一分钟已有记录且新值更大，则更新；否则插入新记录
func (r *Repository) UpsertOnlineSnapshot(timestamp time.Time, onlineCount, guestCount int) error {
	// MySQL 8.0 兼容语法：使用 AS 别名 + 列引用
	return r.db.Exec(`
		INSERT INTO online_user_snapshots (`+"`timestamp`"+`, online_count, guest_count, created_at)
		VALUES (?, ?, ?, NOW()) AS new_values
		ON DUPLICATE KEY UPDATE
			online_count = IF(new_values.online_count > online_user_snapshots.online_count, new_values.online_count, online_user_snapshots.online_count),
			guest_count = IF(new_values.guest_count > online_user_snapshots.guest_count, new_values.guest_count, online_user_snapshots.guest_count)
	`, timestamp, onlineCount, guestCount).Error
}

// CountUsersSince counts non-admin users created on or after the given date string (YYYY-MM-DD)
func (r *Repository) CountUsersSince(dateStr string) (int64, error) {
	var count int64
	err := r.db.Table("users").Scopes(nonAdminScope).
		Where("DATE(created_at) >= ?", dateStr).
		Count(&count).Error
	return count, err
}

// CountUsersOnDate counts non-admin users created on a specific date (YYYY-MM-DD)
func (r *Repository) CountUsersOnDate(dateStr string) (int64, error) {
	var count int64
	err := r.db.Table("users").Scopes(nonAdminScope).
		Where("DATE(created_at) = ?", dateStr).
		Count(&count).Error
	return count, err
}

// FindByPhone finds a user by phone number
func (r *Repository) FindByPhone(phone string) (*User, error) {
	var user User
	err := r.db.Where("phone = ?", phone).First(&user).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &user, err
}

// FindAuthProviderByUserAndProvider finds auth provider by user ID and provider type
func (r *Repository) FindAuthProviderByUserAndProvider(userID uint, provider string) (*UserAuthProvider, error) {
	var authProvider UserAuthProvider
	err := r.db.Where("user_id = ? AND provider = ?", userID, provider).First(&authProvider).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
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
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &authProvider, err
}

// FindAuthProviderByUnionID finds auth provider by provider type and union ID (for WeChat UnionID)
func (r *Repository) FindAuthProviderByUnionID(provider, unionID string) (*UserAuthProvider, error) {
	var authProvider UserAuthProvider
	err := r.db.Where("provider = ? AND provider_union_id = ?", provider, unionID).First(&authProvider).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &authProvider, err
}

// DeleteUser 删除用户及所有关联数据（统计数据除外）
// 使用原生 SQL 操作关联表，避免跨包导入 conversation/subscription 模型
func (r *Repository) DeleteUser(userID uint) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		// 1. 删除使用配额（外键未配置级联）
		if err := tx.Exec("DELETE FROM usage_quotas WHERE user_id = ?", userID).Error; err != nil {
			return fmt.Errorf("failed to delete usage quotas: %w", err)
		}

		// 2. 删除对话消息（外键未直接级联到用户）
		var conversationIDs []uint
		if err := tx.Raw("SELECT id FROM conversations WHERE user_id = ?", userID).Scan(&conversationIDs).Error; err != nil {
			return fmt.Errorf("failed to get conversation IDs: %w", err)
		}

		if len(conversationIDs) > 0 {
			if err := tx.Exec("DELETE FROM conversation_messages WHERE conversation_id IN ?", conversationIDs).Error; err != nil {
				return fmt.Errorf("failed to delete conversation messages: %w", err)
			}
		}

		// 3. 删除用户（以下通过外键 ON DELETE CASCADE 自动级联删除）：
		//    - user_auth_providers
		//    - user_sessions
		//    - conversations
		//    - user_subscriptions
		//    - orders → payment_transactions
		if err := tx.Delete(&User{}, userID).Error; err != nil {
			return fmt.Errorf("failed to delete user: %w", err)
		}

		return nil
	})
}

// ==================== Result types for cross-table queries ====================

type ConversationSummaryRow struct {
	TotalConv   int        `gorm:"column:total_conv"`
	TotalRounds int        `gorm:"column:total_rounds"`
	LastConvAt  *time.Time `gorm:"column:last_conv_at"`
}

// ==================== Transaction helper ====================

// ExecuteInTransaction wraps a function in a database transaction,
// providing a transaction-scoped Repository to the callback.
func (r *Repository) ExecuteInTransaction(fn func(txRepo *Repository) error) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		return fn(NewRepository(tx))
	})
}

// ==================== Cross-table query methods ====================

// GetConversationSummary returns conversation totals for a user and conversation type.
func (r *Repository) GetConversationSummary(userID uint, convType string) (*ConversationSummaryRow, error) {
	var row ConversationSummaryRow
	err := r.db.Table("conversations").
		Select("COUNT(DISTINCT id) as total_conv, "+
			"COALESCE(SUM((SELECT COUNT(*) FROM conversation_messages WHERE conversation_id = conversations.id)), 0) as total_rounds, "+
			"MAX(updated_at) as last_conv_at").
		Where("user_id = ? AND conversation_type = ?", userID, convType).
		Scan(&row).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}

// CountConversationMessagesSince counts conversation messages for a user since a given time.
func (r *Repository) CountConversationMessagesSince(userID uint, convType string, since time.Time) (int64, error) {
	var count int64
	err := r.db.Table("conversation_messages").
		Joins("JOIN conversations ON conversations.id = conversation_messages.conversation_id").
		Where("conversations.user_id = ? AND conversations.conversation_type = ? AND conversation_messages.created_at >= ?", userID, convType, since).
		Count(&count).Error
	return count, err
}

// CountUsersInTimeRange counts non-admin users created within [start, end).
func (r *Repository) CountUsersInTimeRange(start, end time.Time) (int64, error) {
	var count int64
	err := r.db.Model(&User{}).Scopes(nonAdminScope).
		Where("created_at >= ? AND created_at < ?", start, end).
		Count(&count).Error
	return count, err
}

// ==================== Unbind transaction methods ====================

// UnbindPhoneInTx atomically unbinds phone from a user within a transaction with row locking.
func (r *Repository) UnbindPhoneInTx(userID uint) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		var lockedUser User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ?", userID).First(&lockedUser).Error; err != nil {
			return fmt.Errorf("failed to lock user record: %w", err)
		}

		if lockedUser.Phone == nil || *lockedUser.Phone == "" {
			return errors.New("phone is not bound")
		}

		hasEmail := lockedUser.Email != nil && *lockedUser.Email != ""

		var wechatCount int64
		if err := tx.Model(&UserAuthProvider{}).
			Where("user_id = ? AND provider = ?", userID, "wechat").
			Count(&wechatCount).Error; err != nil {
			return fmt.Errorf("failed to check WeChat binding: %w", err)
		}

		if !hasEmail && wechatCount == 0 {
			return errors.New("cannot unbind phone: at least one login method must remain")
		}

		lockedUser.Phone = nil
		lockedUser.PhoneVerified = false
		if err := tx.Save(&lockedUser).Error; err != nil {
			return fmt.Errorf("failed to unbind phone: %w", err)
		}

		if err := tx.Where("user_id = ? AND provider = ?", userID, "phone").
			Delete(&UserAuthProvider{}).Error; err != nil {
			return fmt.Errorf("failed to delete phone auth provider: %w", err)
		}

		return nil
	})
}

// UnbindEmailInTx atomically unbinds email from a user within a transaction with row locking.
func (r *Repository) UnbindEmailInTx(userID uint) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		var lockedUser User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ?", userID).First(&lockedUser).Error; err != nil {
			return fmt.Errorf("failed to lock user record: %w", err)
		}

		if lockedUser.Email == nil || *lockedUser.Email == "" {
			return errors.New("email is not bound")
		}

		hasPhone := lockedUser.Phone != nil && *lockedUser.Phone != ""

		var wechatCount int64
		if err := tx.Model(&UserAuthProvider{}).
			Where("user_id = ? AND provider = ?", userID, "wechat").
			Count(&wechatCount).Error; err != nil {
			return fmt.Errorf("failed to check WeChat binding: %w", err)
		}

		if !hasPhone && wechatCount == 0 {
			return errors.New("cannot unbind email: at least one login method must remain")
		}

		lockedUser.Email = nil
		lockedUser.EmailVerified = false
		if err := tx.Save(&lockedUser).Error; err != nil {
			return fmt.Errorf("failed to unbind email: %w", err)
		}

		if err := tx.Where("user_id = ? AND provider = ?", userID, "email").
			Delete(&UserAuthProvider{}).Error; err != nil {
			return fmt.Errorf("failed to delete email auth provider: %w", err)
		}

		return nil
	})
}

// UnbindWeChatInTx atomically unbinds WeChat from a user within a transaction with row locking.
func (r *Repository) UnbindWeChatInTx(userID uint) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		var lockedUser User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ?", userID).First(&lockedUser).Error; err != nil {
			return fmt.Errorf("failed to lock user record: %w", err)
		}

		var wechatCount int64
		if err := tx.Model(&UserAuthProvider{}).
			Where("user_id = ? AND provider = ?", userID, "wechat").
			Count(&wechatCount).Error; err != nil {
			return fmt.Errorf("failed to check WeChat binding: %w", err)
		}

		if wechatCount == 0 {
			return errors.New("WeChat is not bound")
		}

		hasEmail := lockedUser.Email != nil && *lockedUser.Email != ""
		hasPhone := lockedUser.Phone != nil && *lockedUser.Phone != ""

		if !hasEmail && !hasPhone {
			return errors.New("cannot unbind WeChat: at least one login method must remain")
		}

		if err := tx.Where("user_id = ? AND provider = ?", userID, "wechat").
			Delete(&UserAuthProvider{}).Error; err != nil {
			return fmt.Errorf("failed to delete WeChat auth provider: %w", err)
		}

		return nil
	})
}

// UnbindGitHubInTx atomically unbinds GitHub from a user within a transaction with row locking.
func (r *Repository) UnbindGitHubInTx(userID uint) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		var lockedUser User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ?", userID).First(&lockedUser).Error; err != nil {
			return fmt.Errorf("failed to lock user record: %w", err)
		}

		var githubCount int64
		if err := tx.Model(&UserAuthProvider{}).
			Where("user_id = ? AND provider = ?", userID, "github").
			Count(&githubCount).Error; err != nil {
			return fmt.Errorf("failed to check GitHub binding: %w", err)
		}

		if githubCount == 0 {
			return errors.New("GitHub is not bound")
		}

		hasEmail := lockedUser.Email != nil && *lockedUser.Email != ""
		hasPhone := lockedUser.Phone != nil && *lockedUser.Phone != ""

		var wechatCount int64
		if err := tx.Model(&UserAuthProvider{}).
			Where("user_id = ? AND provider = ?", userID, "wechat").
			Count(&wechatCount).Error; err != nil {
			return fmt.Errorf("failed to check WeChat binding: %w", err)
		}

		if !hasEmail && !hasPhone && wechatCount == 0 {
			return errors.New("cannot unbind GitHub: at least one login method must remain")
		}

		if err := tx.Where("user_id = ? AND provider = ?", userID, "github").
			Delete(&UserAuthProvider{}).Error; err != nil {
			return fmt.Errorf("failed to delete GitHub auth provider: %w", err)
		}

		return nil
	})
}

// UnbindProviderInTx atomically unbinds any OAuth provider from a user.
func (r *Repository) UnbindProviderInTx(userID uint, provider string) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		var lockedUser User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ?", userID).First(&lockedUser).Error; err != nil {
			return fmt.Errorf("failed to lock user record: %w", err)
		}

		var providerCount int64
		if err := tx.Model(&UserAuthProvider{}).
			Where("user_id = ? AND provider = ?", userID, provider).
			Count(&providerCount).Error; err != nil {
			return fmt.Errorf("failed to check binding: %w", err)
		}
		if providerCount == 0 {
			return fmt.Errorf("%s is not bound", provider)
		}

		hasEmail := lockedUser.Email != nil && *lockedUser.Email != ""
		hasPhone := lockedUser.Phone != nil && *lockedUser.Phone != ""
		var otherProviders int64
		tx.Model(&UserAuthProvider{}).
			Where("user_id = ? AND provider != ?", userID, provider).
			Count(&otherProviders)

		if !hasEmail && !hasPhone && otherProviders == 0 {
			return errors.New("cannot unbind: at least one login method must remain")
		}

		if err := tx.Where("user_id = ? AND provider = ?", userID, provider).
			Delete(&UserAuthProvider{}).Error; err != nil {
			return fmt.Errorf("failed to delete auth provider: %w", err)
		}

		return nil
	})
}
