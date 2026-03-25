// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

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

// FindByUsername finds an admin user by username (role='admin')
func (r *Repository) FindByUsername(username string) (*AdminUser, error) {
	var admin AdminUser
	err := r.db.Where("username = ? AND role = 'admin'", username).First(&admin).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &admin, nil
}

// FindByID finds an admin user by ID (role='admin')
func (r *Repository) FindByID(id uint) (*AdminUser, error) {
	var admin AdminUser
	err := r.db.Where("id = ? AND role = 'admin'", id).First(&admin).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &admin, nil
}

// FindUserByUsername finds any user by username (regardless of role)
func (r *Repository) FindUserByUsername(username string) (*AdminUser, error) {
	var user AdminUser
	err := r.db.Where("username = ?", username).First(&user).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &user, nil
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
	return r.db.Model(&AdminUser{}).Where("id = ? AND role = 'admin'", id).Update("password_hash", passwordHash).Error
}

// UpdateLastLogin updates the last login timestamp
func (r *Repository) UpdateLastLogin(id uint) error {
	now := time.Now()
	return r.db.Model(&AdminUser{}).Where("id = ? AND role = 'admin'", id).Update("last_login_at", now).Error
}

// UpdateRole updates a user's role
func (r *Repository) UpdateRole(id uint, role string) error {
	return r.db.Model(&AdminUser{}).Where("id = ?", id).Update("role", role).Error
}
