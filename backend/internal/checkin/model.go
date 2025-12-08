// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package checkin

import (
	"time"
)

// UserCheckin represents a user's daily check-in record
type UserCheckin struct {
	ID              uint      `gorm:"primaryKey" json:"id"`
	UserID          uint      `gorm:"not null;index:idx_user_date,unique" json:"user_id"`
	CheckinDate     time.Time `gorm:"type:date;not null;index:idx_user_date,unique" json:"checkin_date"` // YYYY-MM-DD
	ConsecutiveDays int       `gorm:"not null;default:1" json:"consecutive_days"`                        // 连续签到天数
	CreatedAt       time.Time `json:"created_at"`
}

// GetCheckinDateString returns the checkin date in YYYY-MM-DD format
func (u *UserCheckin) GetCheckinDateString() string {
	return u.CheckinDate.Format("2006-01-02")
}

// TableName specifies the table name for UserCheckin
func (UserCheckin) TableName() string {
	return "user_checkins"
}

// UserCheckinStats represents user's check-in statistics
type UserCheckinStats struct {
	ID              uint      `gorm:"primaryKey" json:"id"`
	UserID          uint      `gorm:"uniqueIndex" json:"user_id"`
	TotalCheckins   int       `gorm:"not null;default:0" json:"total_checkins"`  // 总签到天数
	CurrentStreak   int       `gorm:"not null;default:0" json:"current_streak"`  // 当前连续签到天数
	LongestStreak   int       `gorm:"not null;default:0" json:"longest_streak"`  // 最长连续签到天数
	LastCheckinDate *string   `gorm:"type:date" json:"last_checkin_date"`        // 最后签到日期
	UpdatedAt       time.Time `json:"updated_at"`
}

// TableName specifies the table name for UserCheckinStats
func (UserCheckinStats) TableName() string {
	return "user_checkin_stats"
}

// CheckinResponse is the response for check-in API
type CheckinResponse struct {
	Success         bool   `json:"success"`
	Message         string `json:"message"`
	CheckinDate     string `json:"checkin_date"`
	ConsecutiveDays int    `json:"consecutive_days"` // 当前连续签到天数
	GoldReward      int64  `json:"gold_reward"`      // 本次获得的金币
	TotalCheckins   int    `json:"total_checkins"`   // 总签到天数
	LongestStreak   int    `json:"longest_streak"`   // 最长连续签到天数
}

// CheckinStatusResponse is the response for check-in status API
type CheckinStatusResponse struct {
	HasCheckedIn    bool   `json:"has_checked_in"`    // 今日是否已签到
	CheckinDate     string `json:"checkin_date"`      // 今日日期
	ConsecutiveDays int    `json:"consecutive_days"`  // 当前连续签到天数
	TotalCheckins   int    `json:"total_checkins"`    // 总签到天数
	LongestStreak   int    `json:"longest_streak"`    // 最长连续签到天数
	LastCheckinDate string `json:"last_checkin_date"` // 最后签到日期
}
