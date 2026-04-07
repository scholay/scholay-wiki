// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package model

import "time"

// AppleOAuthConfig represents Apple Sign In configuration
// Apple 使用 JWT 作为 client_secret，需要 Team ID + Key ID + Private Key
type AppleOAuthConfig struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	ServiceID   string    `gorm:"column:service_id;type:varchar(100);not null;default:''" json:"service_id"`
	TeamID      string    `gorm:"column:team_id;type:varchar(20);not null;default:''" json:"team_id"`
	KeyID       string    `gorm:"column:key_id;type:varchar(20);not null;default:''" json:"key_id"`
	PrivateKey  string    `gorm:"column:private_key;type:text;not null;default:''" json:"private_key"`
	RedirectURI string    `gorm:"column:redirect_uri;type:varchar(255);not null;default:''" json:"redirect_uri"`
	Enabled     bool      `gorm:"column:enabled;type:boolean;not null;default:false" json:"enabled"`
	CreatedAt   time.Time `gorm:"column:created_at;not null;default:CURRENT_TIMESTAMP" json:"created_at"`
	UpdatedAt   time.Time `gorm:"column:updated_at;not null;default:CURRENT_TIMESTAMP" json:"updated_at"`
}

func (AppleOAuthConfig) TableName() string {
	return "apple_oauth_config"
}
