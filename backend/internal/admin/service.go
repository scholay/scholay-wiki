// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package admin

import (
	"context"
	"errors"
	"log/slog"

	"scholar-backend/internal/common/utils"
)

// revokeAfterRoleChange — 角色变更后吊销该用户全部 token。
// role 烤进了 JWT,不吊销的话:升级的用户要等下次登录才拿到 admin 权限,
// 而**降级的管理员手里的 token 仍带 role=admin**,在过期前可继续越权 —— 必须当场失效。
func revokeAfterRoleChange(targetID uint) {
	if err := utils.RevokeUserAllTokens(context.Background(), targetID); err != nil {
		slog.Error("role change: revoke tokens failed", "user_id", targetID, "err", err)
	}
}

// Service handles business logic for admin operations
type Service struct {
	repo *Repository
}

// NewService creates a new admin service
func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

// 注:遗留的 admin Login 已下线(见 handler.go 注释)—— 管理员走统一的
// /api/v1/user/login 入口。repo 的 FindByLogin/UpdateLastLogin 暂保留(兼容/调试)。

// VerifyPassword verifies an admin user's password (for sensitive operations)
func (s *Service) VerifyPassword(id uint, password string) (bool, error) {
	admin, err := s.repo.FindByID(id)
	if err != nil {
		return false, err
	}

	if admin == nil {
		return false, errors.New("admin user not found")
	}

	return utils.CheckPassword(password, admin.PasswordHash), nil
}

// InitializeDefaultAdmin creates the default admin user if not exists.
// Email 留空(nil),管理员后续在后台自行补真实邮箱 —— 早期自动生成 admin@<domain>
// 伪邮箱的迁移期路径已下线。
func (s *Service) InitializeDefaultAdmin(username, password string) error {
	existing, err := s.repo.FindByLogin(username)
	if err != nil {
		return err
	}
	if existing != nil {
		// Default admin already exists
		return nil
	}

	hashedPassword, err := utils.HashPassword(password)
	if err != nil {
		return err
	}

	admin := &AdminUser{
		Username:     username,
		Email:        nil,
		PasswordHash: hashedPassword,
		// 新部署的默认账号直接给超级管理员权限（与历史管理员权限对齐）
		Role:   RoleSuperAdmin,
		Status: 1,
	}

	return s.repo.Create(admin)
}

// SetUserRole 把指定用户的角色设为 newRole。合法目标仅 user / operations / admin
// 三种 —— 不允许经此端点造 super_admin（防提权），也不允许改动现有 super_admin
// （防意外失锁）。这三种角色之间可任意互相迁移（含 user↔operations↔admin）。
//
// role 烤进 JWT，变更后必须吊销该用户全部 token —— 降级尤其关键：不吊销的话
// 被降级者手里的旧 token 仍带高权 role，在过期前可继续越权（见 revokeAfterRoleChange）。
func (s *Service) SetUserRole(targetID uint, newRole string) error {
	switch newRole {
	case RoleUser, RoleOperations, RoleAdmin:
		// 允许的目标角色
	default:
		return errors.New("invalid target role")
	}

	target, err := s.repo.FindUserByID(targetID)
	if err != nil {
		return err
	}
	if target == nil {
		return errors.New("user not found")
	}
	if target.Role == RoleSuperAdmin {
		return errors.New("cannot modify super admin role")
	}
	if target.Role == newRole {
		return errors.New("user already has this role")
	}

	if err := s.repo.UpdateRole(targetID, newRole); err != nil {
		return err
	}
	revokeAfterRoleChange(targetID)
	return nil
}

