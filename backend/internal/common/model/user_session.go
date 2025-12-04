// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package model

import "time"

// 会话最长有效期：30天
const MaxSessionAge = 30 * 24 * time.Hour

// 设备类型常量
const (
	DeviceTypePC     = "pc"     // PC端（桌面浏览器）
	DeviceTypeMobile = "mobile" // 移动端（手机、平板）
)

// UserSession represents user session for tracking online status
type UserSession struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	UserID       uint      `gorm:"index;not null" json:"user_id"`
	Token        string    `gorm:"size:500;index" json:"token"`
	DeviceType   string    `gorm:"size:20;index;default:'pc'" json:"device_type"` // 设备类型：pc, mobile
	IP           string    `gorm:"size:45" json:"ip"`
	UserAgent    string    `gorm:"size:500" json:"user_agent"`
	LastActivity time.Time `gorm:"index;not null" json:"last_activity"`
	CreatedAt    time.Time `json:"created_at"`
	ExpiresAt    time.Time `gorm:"index;not null" json:"expires_at"`
}

// TableName specifies table name
func (UserSession) TableName() string {
	return "user_sessions"
}

// IsActive checks if session is still active
func (s *UserSession) IsActive() bool {
	return time.Now().Before(s.ExpiresAt)
}

// CanRefresh checks if session can be refreshed (within 30 days of creation)
func (s *UserSession) CanRefresh() bool {
	maxExpiry := s.CreatedAt.Add(MaxSessionAge)
	return time.Now().Before(maxExpiry)
}

// GetMaxExpiryTime returns the maximum expiry time for this session (30 days from creation)
func (s *UserSession) GetMaxExpiryTime() time.Time {
	return s.CreatedAt.Add(MaxSessionAge)
}
