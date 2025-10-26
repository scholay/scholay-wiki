package model

import "time"

// UserStatistics stores daily user statistics
type UserStatistics struct {
	ID                uint      `gorm:"primaryKey" json:"id"`
	Date              string    `gorm:"type:date;uniqueIndex;not null" json:"date"` // YYYY-MM-DD format
	NewUsers          int       `gorm:"default:0" json:"new_users"`                 // New registrations on this day
	TotalUsers        int       `gorm:"default:0" json:"total_users"`               // Total users up to this day
	PeakOnlineUsers   int       `gorm:"default:0" json:"peak_online_users"`         // Peak online users on this day
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

// OnlineUserSnapshot stores hourly online user count snapshots
type OnlineUserSnapshot struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	Timestamp    time.Time `gorm:"index;not null" json:"timestamp"`       // Snapshot time
	OnlineCount  int       `gorm:"default:0" json:"online_count"`         // Number of online users at this time
	CreatedAt    time.Time `json:"created_at"`
}
