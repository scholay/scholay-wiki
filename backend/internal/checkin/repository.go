// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package checkin

import (
	"time"

	"gorm.io/gorm"
)

// Repository handles database operations for check-in
type Repository struct {
	db *gorm.DB
}

// NewRepository creates a new check-in repository
func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

// GetTodayCheckin gets today's check-in record for a user
func (r *Repository) GetTodayCheckin(userID uint, today string) (*UserCheckin, error) {
	var checkin UserCheckin
	err := r.db.Where("user_id = ? AND checkin_date = ?", userID, today).First(&checkin).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, err
	}
	return &checkin, nil
}

// GetLastCheckin gets the most recent check-in record for a user
func (r *Repository) GetLastCheckin(userID uint) (*UserCheckin, error) {
	var checkin UserCheckin
	err := r.db.Where("user_id = ?", userID).Order("checkin_date DESC").First(&checkin).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, err
	}
	return &checkin, nil
}

// CreateCheckin creates a new check-in record
func (r *Repository) CreateCheckin(checkin *UserCheckin) error {
	return r.db.Create(checkin).Error
}

// GetUserStats gets user's check-in statistics
func (r *Repository) GetUserStats(userID uint) (*UserCheckinStats, error) {
	var stats UserCheckinStats
	err := r.db.Where("user_id = ?", userID).First(&stats).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, err
	}
	return &stats, nil
}

// CreateUserStats creates new user check-in statistics
func (r *Repository) CreateUserStats(stats *UserCheckinStats) error {
	return r.db.Create(stats).Error
}

// UpdateUserStats updates user's check-in statistics
func (r *Repository) UpdateUserStats(stats *UserCheckinStats) error {
	return r.db.Save(stats).Error
}

// GetCheckinHistory gets user's check-in history
func (r *Repository) GetCheckinHistory(userID uint, startDate, endDate string) ([]UserCheckin, error) {
	var checkins []UserCheckin
	err := r.db.Where("user_id = ? AND checkin_date BETWEEN ? AND ?", userID, startDate, endDate).
		Order("checkin_date DESC").
		Find(&checkins).Error
	return checkins, err
}

// GetCheckinCountInMonth gets the number of check-ins in a specific month
func (r *Repository) GetCheckinCountInMonth(userID uint, year int, month int) (int64, error) {
	var count int64
	startDate := time.Date(year, time.Month(month), 1, 0, 0, 0, 0, time.Local)
	endDate := startDate.AddDate(0, 1, 0).Add(-time.Second)
	
	err := r.db.Model(&UserCheckin{}).
		Where("user_id = ? AND checkin_date BETWEEN ? AND ?", userID, startDate.Format("2006-01-02"), endDate.Format("2006-01-02")).
		Count(&count).Error
	return count, err
}

