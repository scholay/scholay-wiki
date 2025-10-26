package model

import "time"

// SystemConfig represents system configuration settings
type SystemConfig struct {
	ID                      uint      `gorm:"primaryKey" json:"id"`
	RequireEmailVerification bool      `gorm:"default:true" json:"require_email_verification"` // 登录/注册是否需要邮箱验证码
	CreatedAt               time.Time `json:"created_at"`
	UpdatedAt               time.Time `json:"updated_at"`
}

// TableName specifies table name
func (SystemConfig) TableName() string {
	return "system_configs"
}
