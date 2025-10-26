package user

import (
	"errors"
	"time"

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
