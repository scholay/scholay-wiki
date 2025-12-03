// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package model

import "time"

// GithubOAuthConfig represents GitHub OAuth configuration
type GithubOAuthConfig struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	ClientID     string    `gorm:"column:client_id;type:varchar(100);not null;default:''" json:"client_id"`
	ClientSecret string    `gorm:"column:client_secret;type:varchar(255);not null;default:''" json:"client_secret"`
	RedirectURI  string    `gorm:"column:redirect_uri;type:varchar(255);not null;default:''" json:"redirect_uri"`
	Enabled      bool      `gorm:"column:enabled;type:boolean;not null;default:false" json:"enabled"`
	CreatedAt    time.Time `gorm:"column:created_at;not null;default:CURRENT_TIMESTAMP" json:"created_at"`
	UpdatedAt    time.Time `gorm:"column:updated_at;not null;default:CURRENT_TIMESTAMP" json:"updated_at"`
}

// TableName specifies the table name for GithubOAuthConfig
func (GithubOAuthConfig) TableName() string {
	return "github_oauth_config"
}
