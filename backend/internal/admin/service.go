// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package admin

import (
	"errors"
	"fmt"
	"net/mail"
	"scholar-backend/internal/common/utils"
	"strings"
)

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

	token, err := utils.GenerateTokenWithRole(admin.ID, admin.Username, "user", "admin")
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

	if !utils.CheckPassword(oldPassword, admin.PasswordHash) {
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

	return utils.CheckPassword(password, admin.PasswordHash), nil
}

// GetProfile gets an admin user's profile
func (s *Service) GetProfile(id uint) (*AdminUser, error) {
	return s.repo.FindByID(id)
}

// InitializeDefaultAdmin creates the default admin user if not exists
func (s *Service) InitializeDefaultAdmin(username, password string) error {
	existing, err := s.repo.FindByLogin(username)
	if err != nil {
		return err
	}
	if existing == nil {
		existing, err = s.repo.FindByLogin(normalizeAdminEmail(username))
		if err != nil {
			return err
		}
	}

	if existing != nil {
		// Default admin already exists
		return nil
	}

	hashedPassword, err := utils.HashPassword(password)
	if err != nil {
		return err
	}

	email := normalizeAdminEmail(username)
	admin := &AdminUser{
		Username:      username,
		Email:         &email,
		PasswordHash:  hashedPassword,
		Role:          "admin",
		Status:        1,
		EmailVerified: true,
	}

	return s.repo.Create(admin)
}

func normalizeAdminEmail(login string) string {
	normalized := strings.TrimSpace(strings.ToLower(login))
	if normalized == "" {
		return "admin@scholay.com"
	}

	if _, err := mail.ParseAddress(normalized); err == nil {
		return normalized
	}

	return fmt.Sprintf("%s@scholay.com", sanitizeAdminLocalPart(normalized))
}

func sanitizeAdminLocalPart(value string) string {
	var builder strings.Builder
	for _, r := range value {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '.' || r == '_' || r == '-' {
			builder.WriteRune(r)
		}
	}

	if builder.Len() == 0 {
		return "admin"
	}

	return builder.String()
}
