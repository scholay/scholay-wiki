// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package checkin

import (
	"context"
	"fmt"
	"log"
	"time"

	"scholar-backend/internal/currency"
)

// CurrencyService 货币服务接口
type CurrencyService interface {
	GetCurrencyConfigAmount(configKey string) (int64, error)
	GiftGold(ctx context.Context, userID uint, amount int64, bizType, bizID, desc string) (any, error)
}

// Service handles check-in business logic
type Service struct {
	repo            *Repository
	currencyService CurrencyService
}

// NewService creates a new check-in service
func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

// SetCurrencyService 设置货币服务（用于依赖注入）
func (s *Service) SetCurrencyService(cs CurrencyService) {
	s.currencyService = cs
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
		longestStreak := 0
		if stats != nil {
			totalCheckins = stats.TotalCheckins
			longestStreak = stats.LongestStreak
		}
		return &CheckinResponse{
			Success:         false,
			Message:         "今日已签到",
			CheckinDate:     today,
			ConsecutiveDays: existingCheckin.ConsecutiveDays,
			GoldReward:      0,
			TotalCheckins:   totalCheckins,
			LongestStreak:   longestStreak,
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

	// Calculate gold reward based on consecutive days from config
	goldReward := s.getCheckinGoldReward(consecutiveDays)

	// Create check-in record
	checkin := &UserCheckin{
		UserID:          userID,
		CheckinDate:     todayTime,
		ConsecutiveDays: consecutiveDays,
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
			UserID:          userID,
			TotalCheckins:   1,
			CurrentStreak:   consecutiveDays,
			LongestStreak:   consecutiveDays,
			LastCheckinDate: &today,
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
		stats.LastCheckinDate = &today
		if err := s.repo.UpdateUserStats(stats); err != nil {
			return nil, err
		}
	}

	// 发放签到金币奖励（异步，不阻塞签到流程）
	if goldReward > 0 && s.currencyService != nil {
		go func() {
			ctx := context.Background()
			bizID := fmt.Sprintf("checkin_%d_%s", userID, today)
			desc := fmt.Sprintf("签到奖励（连续%d天）", consecutiveDays)
			_, err := s.currencyService.GiftGold(ctx, userID, goldReward, "daily_checkin", bizID, desc)
			if err != nil {
				log.Printf("Failed to gift checkin gold to user %d: %v", userID, err)
			} else {
				log.Printf("Successfully gifted %d gold to user %d for checkin (day %d)", goldReward, userID, consecutiveDays)
			}
		}()
	}

	return &CheckinResponse{
		Success:         true,
		Message:         "签到成功",
		CheckinDate:     today,
		ConsecutiveDays: consecutiveDays,
		GoldReward:      goldReward,
		TotalCheckins:   stats.TotalCheckins,
		LongestStreak:   stats.LongestStreak,
	}, nil
}

// getCheckinGoldReward 根据连续签到天数获取金币奖励
func (s *Service) getCheckinGoldReward(consecutiveDays int) int64 {
	if s.currencyService == nil {
		// 如果没有配置货币服务，使用默认值
		return getDefaultCheckinGold(consecutiveDays)
	}

	var configKey string
	switch consecutiveDays {
	case 3:
		configKey = currency.ConfigKeyCheckin3Days
	case 7:
		configKey = currency.ConfigKeyCheckin7Days
	case 15:
		configKey = currency.ConfigKeyCheckin15Days
	default:
		if consecutiveDays > 15 {
			configKey = currency.ConfigKeyCheckinAfter15
		} else {
			configKey = currency.ConfigKeyDailyCheckin
		}
	}

	amount, err := s.currencyService.GetCurrencyConfigAmount(configKey)
	if err != nil {
		log.Printf("Failed to get checkin gold config %s: %v", configKey, err)
		return getDefaultCheckinGold(consecutiveDays)
	}
	return amount
}

// getDefaultCheckinGold 获取默认签到金币（配置不可用时的降级）
func getDefaultCheckinGold(consecutiveDays int) int64 {
	switch consecutiveDays {
	case 3:
		return 50
	case 7:
		return 150
	case 15:
		return 350
	default:
		if consecutiveDays > 15 {
			return 30
		}
		return 10
	}
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
		LongestStreak:   0,
		LastCheckinDate: "",
	}

	if stats != nil {
		response.ConsecutiveDays = stats.CurrentStreak
		response.TotalCheckins = stats.TotalCheckins
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
