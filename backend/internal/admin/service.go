// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package admin

import (
	"errors"
	"scholar-backend/internal/common/utils"
)

// Service handles business logic for admin operations
type Service struct {
	repo *Repository
}

// NewService creates a new admin service
func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

// Login authenticates an admin user
func (s *Service) Login(username, password string) (*AdminUser, string, error) {
	admin, err := s.repo.FindByUsername(username)
	if err != nil {
		return nil, "", err
	}

	if admin == nil {
		return nil, "", errors.New("invalid username or password")
	}

	if admin.Status != 1 {
		return nil, "", errors.New("account is inactive")
	}

	if admin.PasswordHash == nil {
		return nil, "", errors.New("password not set")
	}

	if !utils.CheckPassword(password, *admin.PasswordHash) {
		return nil, "", errors.New("invalid username or password")
	}

	token, err := utils.GenerateToken(admin.ID, *admin.Username, "admin")
	if err != nil {
		return nil, "", err
	}

	_ = s.repo.UpdateLastLogin(admin.ID)

	return admin, token, nil
}

// UpdatePassword updates an admin user's password
func (s *Service) UpdatePassword(id uint, oldPassword, newPassword string) error {
	admin, err := s.repo.FindByID(id)
	if err != nil {
		return err
	}

	if admin == nil {
		return errors.New("admin user not found")
	}

	if admin.PasswordHash == nil {
		return errors.New("password not set")
	}

	if !utils.CheckPassword(oldPassword, *admin.PasswordHash) {
		return errors.New("invalid old password")
	}

	hashedPassword, err := utils.HashPassword(newPassword)
	if err != nil {
		return err
	}

	return s.repo.UpdatePassword(id, hashedPassword)
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

	if admin.PasswordHash == nil {
		return false, errors.New("password not set")
	}

	return utils.CheckPassword(password, *admin.PasswordHash), nil
}

// GetProfile gets an admin user's profile
func (s *Service) GetProfile(id uint) (*AdminUser, error) {
	return s.repo.FindByID(id)
}

// InitializeDefaultAdmin creates the default admin user in the users table if not exists
func (s *Service) InitializeDefaultAdmin(username, password string) error {
	// Check if admin with this username already exists
	existing, err := s.repo.FindByUsername(username)
	if err != nil {
		return err
	}
	if existing != nil {
		return nil
	}

	// Check if a non-admin user with this username exists → upgrade to admin
	existingUser, err := s.repo.FindUserByUsername(username)
	if err != nil {
		return err
	}
	if existingUser != nil {
		return s.repo.UpdateRole(existingUser.ID, "admin")
	}

	// Create new admin user
	hashedPassword, err := utils.HashPassword(password)
	if err != nil {
		return err
	}

	u := username
	admin := &AdminUser{
		Username:     &u,
		PasswordHash: &hashedPassword,
		Role:         "admin",
		Status:       1,
	}

	return s.repo.Create(admin)
}
