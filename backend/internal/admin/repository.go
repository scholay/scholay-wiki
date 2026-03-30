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

// FindByLogin finds an admin user by username or email in the unified users table.
func (r *Repository) FindByLogin(login string) (*AdminUser, error) {
	var admin AdminUser
	err := r.db.Where("role = ? AND (username = ? OR email = ?)", "admin", login, login).First(&admin).Error
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
	err := r.db.Where("id = ? AND role = ?", id, "admin").First(&admin).Error
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
	return r.db.Model(&AdminUser{}).Where("id = ? AND role = ?", id, "admin").Update("password_hash", passwordHash).Error
}

// UpdateLastLogin updates the last login timestamp
func (r *Repository) UpdateLastLogin(id uint) error {
	now := time.Now()
	return r.db.Model(&AdminUser{}).Where("id = ? AND role = ?", id, "admin").Update("last_login_at", now).Error
}
