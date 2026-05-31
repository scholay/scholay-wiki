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

// adminRoles 是后台管理员角色集合（admin + super_admin）
var adminRoles = []string{RoleAdmin, RoleSuperAdmin}

// FindByLogin finds an admin user by username or email in the unified users table.
func (r *Repository) FindByLogin(login string) (*AdminUser, error) {
	var admin AdminUser
	err := r.db.Where("role IN ? AND (username = ? OR email = ?)", adminRoles, login, login).First(&admin).Error
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
	err := r.db.Where("id = ? AND role IN ?", id, adminRoles).First(&admin).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &admin, nil
}

// FindUserByID 在 users 表里按 ID 查任意用户（不限角色），用于角色分配场景。
func (r *Repository) FindUserByID(id uint) (*AdminUser, error) {
	var u AdminUser
	err := r.db.Where("id = ?", id).First(&u).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &u, nil
}

// UpdateRole 更新指定用户的角色字段（用于 super_admin 提升/降级 admin）。
func (r *Repository) UpdateRole(id uint, newRole string) error {
	return r.db.Model(&AdminUser{}).Where("id = ?", id).Update("role", newRole).Error
}

// Create creates a new admin user
func (r *Repository) Create(admin *AdminUser) error {
	return r.db.Create(admin).Error
}

// Update updates an admin user
func (r *Repository) Update(admin *AdminUser) error {
	return r.db.Save(admin).Error
}

// UpdateLastLogin updates the last login timestamp
func (r *Repository) UpdateLastLogin(id uint) error {
	now := time.Now()
	return r.db.Model(&AdminUser{}).Where("id = ? AND role IN ?", id, adminRoles).Update("last_login_at", now).Error
}
