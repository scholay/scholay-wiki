// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package model

import "time"

// SystemConfig represents system configuration settings
type SystemConfig struct {
	ID                       uint      `gorm:"primaryKey" json:"id"`
	RequireEmailVerification bool      `gorm:"default:true" json:"require_email_verification"` // 登录/注册是否需要邮箱验证码
	EnableTurnstile          bool      `gorm:"default:false" json:"enable_turnstile"`          // 是否启用 Cloudflare Turnstile 人机验证
	TurnstileSiteKey         string    `gorm:"type:varchar(100)" json:"turnstile_site_key"`    // Turnstile Site Key (公钥)
	TurnstileSecretKey       string    `gorm:"type:varchar(100)" json:"turnstile_secret_key"`  // Turnstile Secret Key (私钥)
	GoogleAnalyticsID        string    `gorm:"column:google_analytics_id;type:varchar(40)" json:"google_analytics_id"` // GA4 衡量 ID(G-XXXX);非机密;空=不接入
	CreatedAt                time.Time `json:"created_at"`
	UpdatedAt                time.Time `json:"updated_at"`
}

// TableName specifies table name
func (SystemConfig) TableName() string {
	return "system_configs"
}
