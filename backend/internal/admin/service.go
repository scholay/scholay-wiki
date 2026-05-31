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

// Login authenticates an admin user and returns a unified JWT (type=user, role=admin).
func (s *Service) Login(login, password string) (*AdminUser, string, error) {
	admin, err := s.repo.FindByLogin(login)
	if err != nil {
		return nil, "", err
	}

	if admin == nil {
		return nil, "", errors.New("invalid username or password")
	}

	if admin.Status != 1 {
		return nil, "", errors.New("account is inactive")
	}

	if !utils.CheckPassword(password, admin.PasswordHash) {
		return nil, "", errors.New("invalid username or password")
	}

	// JWT 中的 role 直接使用账号实际角色（admin 或 super_admin），
	// 让 SuperAdminAuthMiddleware 能据此区分权限。
	token, err := utils.GenerateTokenWithRole(admin.ID, admin.Username, "user", admin.Role)
	if err != nil {
		return nil, "", err
	}

	_ = s.repo.UpdateLastLogin(admin.ID)

	return admin, token, nil
}

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

// PromoteToAdmin 把指定用户提升为普通管理员（admin）。
// 仅当目标当前是 user 时允许；不允许操作 super_admin / 已是 admin 的账号。
func (s *Service) PromoteToAdmin(targetID uint) error {
	target, err := s.repo.FindUserByID(targetID)
	if err != nil {
		return err
	}
	if target == nil {
		return errors.New("user not found")
	}
	switch target.Role {
	case RoleAdmin:
		return errors.New("user is already an admin")
	case RoleSuperAdmin:
		return errors.New("cannot modify super admin role")
	}
	if err := s.repo.UpdateRole(targetID, RoleAdmin); err != nil {
		return err
	}
	revokeAfterRoleChange(targetID)
	return nil
}

// DemoteFromAdmin 把普通管理员降级为普通用户。
// 不允许操作 super_admin。目标必须当前是 admin。
func (s *Service) DemoteFromAdmin(targetID uint) error {
	target, err := s.repo.FindUserByID(targetID)
	if err != nil {
		return err
	}
	if target == nil {
		return errors.New("user not found")
	}
	if target.Role == RoleSuperAdmin {
		return errors.New("cannot demote super admin")
	}
	if target.Role != RoleAdmin {
		return errors.New("user is not an admin")
	}
	if err := s.repo.UpdateRole(targetID, RoleUser); err != nil {
		return err
	}
	revokeAfterRoleChange(targetID)
	return nil
}

