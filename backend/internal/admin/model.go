// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package admin

import (
	"time"
)

// AdminUser represents an admin user in the system (stored in users table with role='admin')
type AdminUser struct {
	ID           uint       `gorm:"primaryKey" json:"id"`
	Username     *string    `gorm:"unique;size:50" json:"username"`
	Email        *string    `gorm:"unique;size:100" json:"email"`
	PasswordHash *string    `gorm:"size:255" json:"-"`
	AvatarURL    *string    `gorm:"size:255" json:"avatar_url"`
	Role         string     `gorm:"size:20;default:user" json:"role"`
	Status       int8       `gorm:"not null;default:1" json:"status"` // 1=active, 0=inactive
	LastLoginAt  *time.Time `json:"last_login_at"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
}

// TableName specifies the table name for AdminUser
func (AdminUser) TableName() string {
	return "users"
}
