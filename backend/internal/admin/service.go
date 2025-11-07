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

	if !utils.CheckPassword(password, admin.PasswordHash) {
		return nil, "", errors.New("invalid username or password")
	}

	// Generate JWT token
	token, err := utils.GenerateToken(admin.ID, admin.Username, "admin")
	if err != nil {
		return nil, "", err
	}

	// Update last login time
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
	existing, err := s.repo.FindByUsername(username)
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
		PasswordHash: hashedPassword,
		Status:       1,
	}

	return s.repo.Create(admin)
}
