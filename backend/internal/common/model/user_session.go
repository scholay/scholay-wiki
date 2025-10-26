package model

import "time"

// UserSession represents user session for tracking online status
type UserSession struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	UserID       uint      `gorm:"index;not null" json:"user_id"`
	Token        string    `gorm:"size:500;index" json:"token"`
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
