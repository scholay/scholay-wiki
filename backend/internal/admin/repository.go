package admin

import (
	"errors"
	"time"

	"gorm.io/gorm"
)

// Repository handles database operations for admin users
type Repository struct {
	db *gorm.DB
}

// NewRepository creates a new admin repository
func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

// FindByUsername finds an admin user by username
func (r *Repository) FindByUsername(username string) (*AdminUser, error) {
	var admin AdminUser
	err := r.db.Where("username = ?", username).First(&admin).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &admin, nil
}

// FindByID finds an admin user by ID
func (r *Repository) FindByID(id uint) (*AdminUser, error) {
	var admin AdminUser
	err := r.db.First(&admin, id).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &admin, nil
}

// Create creates a new admin user
func (r *Repository) Create(admin *AdminUser) error {
	return r.db.Create(admin).Error
}

// Update updates an admin user
func (r *Repository) Update(admin *AdminUser) error {
	return r.db.Save(admin).Error
}

// UpdatePassword updates an admin user's password
func (r *Repository) UpdatePassword(id uint, passwordHash string) error {
	return r.db.Model(&AdminUser{}).Where("id = ?", id).Update("password_hash", passwordHash).Error
}

// UpdateLastLogin updates the last login timestamp
func (r *Repository) UpdateLastLogin(id uint) error {
	now := time.Now()
	return r.db.Model(&AdminUser{}).Where("id = ?", id).Update("last_login_at", now).Error
}
