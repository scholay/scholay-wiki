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
}

// GetProfile gets a user's profile
func (s *Service) GetProfile(id uint) (*User, error) {
	return s.repo.FindByID(id)
}

// UpdateProfile updates a user's profile.
// 部分更新走 UpdatePartial: 只 SET 用户实际改的列, 避免 18+ 列的 SAVE 把
// 其他字段一并写回 (省网络/binlog, 也避免并发改其他字段时的覆盖竞争)。
func (s *Service) UpdateProfile(id uint, username *string, avatarURL *string, bio *string) error {
	// 先确认用户存在 —— 仍需要 404 分支, UpdatePartial 自己只会"无影响行"不会报错。
	exists, err := s.repo.FindByID(id)
	if err != nil {
		return err
	}
	if exists == nil {
		return errors.New("user not found")
	}

	fields := make(map[string]any, 3)
	if username != nil {
		fields["username"] = username
	}
	if avatarURL != nil {
		fields["avatar_url"] = avatarURL
	}
	if bio != nil {
		fields["bio"] = bio
	}
	if len(fields) == 0 {
		return nil // 没传任何字段就不发 SQL
	}
	return s.repo.UpdatePartial(id, fields)
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
// supports server-side keyword search + status/role/tier/verified/date filter + sort.
func (s *Service) GetUserListWithFilter(page, pageSize int, f UserListFilter) ([]User, int64, error) {
	return s.repo.GetUserListWithFilter(database.CalcOffset(page, pageSize), pageSize, f)
}

// GetUserAuthProviders 返回某用户的第三方/账号绑定(admin 用户详情:登录方式)。
func (s *Service) GetUserAuthProviders(userID uint) ([]UserAuthProvider, error) {
	m, err := s.repo.GetUserAuthProviders([]uint{userID})
	if err != nil {
		return nil, err
	}
	return m[userID], nil
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

	// 删号后吊销其全部 token,避免已删除用户的 JWT 在过期前仍能调用接口
	// (中间件只验签名+黑名单,不一定每次回查 user 行)。失败只记日志,删除已落库。
	if err := utils.RevokeUserAllTokens(context.Background(), userID); err != nil {
		slog.Error("delete user: revoke tokens failed", "user_id", userID, "err", err)
	}

	return nil
}

