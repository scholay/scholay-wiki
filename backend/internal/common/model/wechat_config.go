// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package model

import (
	"time"
)

// WeChatConfig represents a WeChat OAuth configuration
type WeChatConfig struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	AppID       string    `gorm:"type:varchar(32);not null" json:"app_id"`
	AppSecret   string    `gorm:"type:varchar(64);not null" json:"app_secret"`
	RedirectURI string    `gorm:"type:varchar(255);not null" json:"redirect_uri"`
	Scope       string    `gorm:"type:varchar(50);not null;default:'snsapi_login'" json:"scope"`
	IsActive    bool      `gorm:"not null;default:true;index" json:"is_active"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// TableName specifies the table name for WeChatConfig
func (WeChatConfig) TableName() string {
	return "wechat_configs"
}
