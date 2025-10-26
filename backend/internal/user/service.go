package user

import (
	"errors"
	"fmt"
	"math/rand"
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

// RegisterWithEmail registers a new user with email and password
func (s *Service) RegisterWithEmail(email, password, code string) (*User, string, error) {
	// Verify the email code
	vc, err := s.repo.FindVerificationCode(email, code, "register")
	if err != nil {
		return nil, "", err
	}

	if vc == nil {
		return nil, "", errors.New("invalid or expired verification code")
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

	// Mark verification code as used
	_ = s.repo.MarkVerificationCodeAsUsed(vc.ID)

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
