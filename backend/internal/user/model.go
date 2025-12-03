// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package user

import (
	"time"
)

// User represents a user in the system
type User struct {
	ID            uint       `gorm:"primaryKey" json:"id"`
	Username      *string    `gorm:"unique;size:50" json:"username"`
	Email         *string    `gorm:"unique;size:100" json:"email"`
	Phone         *string    `gorm:"unique;size:20" json:"phone"`
	PasswordHash  *string    `gorm:"size:255" json:"-"`
	AvatarURL     *string    `gorm:"size:255" json:"avatar_url"`
	Bio           *string    `gorm:"type:text" json:"bio"`
	Status        int8       `gorm:"not null;default:1" json:"status"` // 1=active, 0=inactive, 2=suspended
	EmailVerified bool       `gorm:"not null;default:false" json:"email_verified"`
	PhoneVerified bool       `gorm:"not null;default:false" json:"phone_verified"`
	LastLoginAt   *time.Time `json:"last_login_at"`
	LastLoginIP   *string    `gorm:"size:45" json:"last_login_ip"` // 最后登录IP
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
}

// TableName specifies the table name for User
func (User) TableName() string {
	return "users"
}

// UserAuthProvider represents a user's authentication provider
type UserAuthProvider struct {
	ID              uint      `gorm:"primaryKey" json:"id"`
	UserID          uint      `gorm:"not null" json:"user_id"`
	Provider        string    `gorm:"not null;size:20" json:"provider"` // email, phone, wechat, google, etc.
	ProviderUserID  string    `gorm:"not null;size:255" json:"provider_user_id"` // 微信为 openID
	ProviderUnionID *string   `gorm:"size:255" json:"provider_union_id"` // 微信 UnionID，用于跨应用识别
	ProviderData    *string   `gorm:"type:json" json:"provider_data"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

// TableName specifies the table name for UserAuthProvider
func (UserAuthProvider) TableName() string {
	return "user_auth_providers"
}

// EmailVerificationCode represents an email verification code
type EmailVerificationCode struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Email     string    `gorm:"not null;size:100" json:"email"`
	Code      string    `gorm:"not null;size:10" json:"code"`
	Purpose   string    `gorm:"not null;size:20" json:"purpose"` // register, login, reset_password
	ExpiresAt time.Time `gorm:"not null" json:"expires_at"`
	Used      bool      `gorm:"not null;default:false" json:"used"`
	CreatedAt time.Time `json:"created_at"`
}

// TableName specifies the table name for EmailVerificationCode
func (EmailVerificationCode) TableName() string {
	return "email_verification_codes"
}
