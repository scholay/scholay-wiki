// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package model

import "time"

// GoogleOAuthConfig represents Google OAuth configuration
// 使用 Google Identity Services (GIS) ID Token 模式，只需 Client ID
type GoogleOAuthConfig struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	ClientID     string    `gorm:"column:client_id;type:varchar(200);not null;default:''" json:"client_id"`
	ClientSecret string    `gorm:"column:client_secret;type:varchar(255);not null;default:''" json:"client_secret"`
	Enabled      bool      `gorm:"column:enabled;type:boolean;not null;default:false" json:"enabled"`
	CreatedAt    time.Time `gorm:"column:created_at;not null;default:CURRENT_TIMESTAMP" json:"created_at"`
	UpdatedAt    time.Time `gorm:"column:updated_at;not null;default:CURRENT_TIMESTAMP" json:"updated_at"`
}

// TableName specifies the table name for GoogleOAuthConfig
func (GoogleOAuthConfig) TableName() string {
	return "google_oauth_config"
}
