package model

import "time"

// SystemConfig represents system configuration settings
type SystemConfig struct {
	ID                       uint      `gorm:"primaryKey" json:"id"`
	RequireEmailVerification bool      `gorm:"default:true" json:"require_email_verification"` // 登录/注册是否需要邮箱验证码
	EnableTurnstile          bool      `gorm:"default:false" json:"enable_turnstile"`          // 是否启用 Cloudflare Turnstile 人机验证
	TurnstileSiteKey         string    `gorm:"type:varchar(100)" json:"turnstile_site_key"`    // Turnstile Site Key (公钥)
	TurnstileSecretKey       string    `gorm:"type:varchar(100)" json:"turnstile_secret_key"`  // Turnstile Secret Key (私钥)
	CreatedAt                time.Time `json:"created_at"`
	UpdatedAt                time.Time `json:"updated_at"`
}

// TableName specifies table name
func (SystemConfig) TableName() string {
	return "system_configs"
}
