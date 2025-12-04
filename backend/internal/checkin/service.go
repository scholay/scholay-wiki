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

// Service handles check-in business logic
type Service struct {
	repo *Repository
}

// NewService creates a new check-in service
func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

// GetTodayDateString returns today's date in YYYY-MM-DD format
func GetTodayDateString() string {
	return time.Now().Format("2006-01-02")
}

// GetTodayTime returns today's date as time.Time (at midnight)
func GetTodayTime() time.Time {
	now := time.Now()
	return time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
}

// GetYesterdayDateString returns yesterday's date in YYYY-MM-DD format
func GetYesterdayDateString() string {
	return time.Now().AddDate(0, 0, -1).Format("2006-01-02")
}

// Checkin performs daily check-in for a user
func (s *Service) Checkin(userID uint) (*CheckinResponse, error) {
	today := GetTodayDateString()
	todayTime := GetTodayTime()

	// Check if already checked in today
	existingCheckin, err := s.repo.GetTodayCheckin(userID, today)
	if err != nil {
		return nil, err
	}
	if existingCheckin != nil {
		// Already checked in today
		stats, _ := s.repo.GetUserStats(userID)
		totalCheckins := 0
		totalPoints := 0
		if stats != nil {
			totalCheckins = stats.TotalCheckins
			totalPoints = stats.TotalRewardPoints
		}
		return &CheckinResponse{
			Success:         false,
			Message:         "今日已签到",
			CheckinDate:     today,
			ConsecutiveDays: existingCheckin.ConsecutiveDays,
			RewardPoints:    0,
			TotalCheckins:   totalCheckins,
			TotalPoints:     totalPoints,
		}, nil
	}

	// Calculate consecutive days
	consecutiveDays := 1
	yesterday := GetYesterdayDateString()
	lastCheckin, err := s.repo.GetLastCheckin(userID)
	if err != nil {
		return nil, err
	}
	if lastCheckin != nil && lastCheckin.GetCheckinDateString() == yesterday {
		consecutiveDays = lastCheckin.ConsecutiveDays + 1
	}

	// Calculate reward points based on consecutive days
	rewardPoints := GetRewardPoints(consecutiveDays)

	// Create check-in record
	checkin := &UserCheckin{
		UserID:          userID,
		CheckinDate:     todayTime,
		ConsecutiveDays: consecutiveDays,
		RewardPoints:    rewardPoints,
		CreatedAt:       time.Now(),
	}
	if err := s.repo.CreateCheckin(checkin); err != nil {
		return nil, err
	}

	// Update user stats
	stats, err := s.repo.GetUserStats(userID)
	if err != nil {
		return nil, err
	}
	if stats == nil {
		// Create new stats
		stats = &UserCheckinStats{
			UserID:            userID,
			TotalCheckins:     1,
			CurrentStreak:     consecutiveDays,
			LongestStreak:     consecutiveDays,
			TotalRewardPoints: rewardPoints,
			LastCheckinDate:   &today,
		}
		if err := s.repo.CreateUserStats(stats); err != nil {
			return nil, err
		}
	} else {
		// Update existing stats
		stats.TotalCheckins++
		stats.CurrentStreak = consecutiveDays
		if consecutiveDays > stats.LongestStreak {
			stats.LongestStreak = consecutiveDays
		}
		stats.TotalRewardPoints += rewardPoints
		stats.LastCheckinDate = &today
		if err := s.repo.UpdateUserStats(stats); err != nil {
			return nil, err
		}
	}

	return &CheckinResponse{
		Success:         true,
		Message:         "签到成功",
		CheckinDate:     today,
		ConsecutiveDays: consecutiveDays,
		RewardPoints:    rewardPoints,
		TotalCheckins:   stats.TotalCheckins,
		TotalPoints:     stats.TotalRewardPoints,
	}, nil
}

// GetCheckinStatus gets user's check-in status for today
func (s *Service) GetCheckinStatus(userID uint) (*CheckinStatusResponse, error) {
	today := GetTodayDateString()

	// Check if already checked in today
	todayCheckin, err := s.repo.GetTodayCheckin(userID, today)
	if err != nil {
		return nil, err
	}

	hasCheckedIn := todayCheckin != nil

	// Get user stats
	stats, err := s.repo.GetUserStats(userID)
	if err != nil {
		return nil, err
	}

	response := &CheckinStatusResponse{
		HasCheckedIn:    hasCheckedIn,
		CheckinDate:     today,
		ConsecutiveDays: 0,
		TotalCheckins:   0,
		TotalPoints:     0,
		LongestStreak:   0,
		LastCheckinDate: "",
	}

	if stats != nil {
		response.ConsecutiveDays = stats.CurrentStreak
		response.TotalCheckins = stats.TotalCheckins
		response.TotalPoints = stats.TotalRewardPoints
		response.LongestStreak = stats.LongestStreak
		if stats.LastCheckinDate != nil {
			response.LastCheckinDate = *stats.LastCheckinDate
		}

		// If user didn't check in yesterday and today, reset current streak display
		if !hasCheckedIn {
			yesterday := GetYesterdayDateString()
			if stats.LastCheckinDate == nil || (*stats.LastCheckinDate != yesterday && *stats.LastCheckinDate != today) {
				response.ConsecutiveDays = 0
			}
		}
	}

	return response, nil
}

// GetCheckinHistory gets user's check-in history for a date range
func (s *Service) GetCheckinHistory(userID uint, startDate, endDate string) ([]UserCheckin, error) {
	return s.repo.GetCheckinHistory(userID, startDate, endDate)
}

// GetMonthlyCheckins gets the number of check-ins in a specific month
func (s *Service) GetMonthlyCheckins(userID uint, year, month int) (int64, error) {
	return s.repo.GetCheckinCountInMonth(userID, year, month)
}

