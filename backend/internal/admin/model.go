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

// AdminUser represents an admin account stored in the unified users table.
type AdminUser struct {
	ID            uint       `gorm:"primaryKey" json:"id"`
	Username      string     `gorm:"size:50" json:"username"`
	PasswordHash  string     `gorm:"size:255" json:"-"`
	Email         *string    `gorm:"size:100" json:"email"`
	Role          string     `gorm:"size:20" json:"role"`
	Status        int8       `gorm:"not null;default:1" json:"status"` // 1=active, 0=inactive
	EmailVerified bool       `gorm:"not null;default:false" json:"email_verified"`
	LastLoginAt   *time.Time `json:"last_login_at"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
}

// TableName specifies the table name for AdminUser
func (AdminUser) TableName() string {
	return "users"
}
