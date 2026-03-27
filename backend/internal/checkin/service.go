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
	"log/slog"
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

// getLocalLocation 获取本地时区（Asia/Shanghai）
func getLocalLocation() *time.Location {
	loc, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		// 如果加载失败，使用本地时区
		return time.Local
	}
	return loc
}

// GetTodayDateString returns today's date in YYYY-MM-DD format (using Asia/Shanghai timezone)
func GetTodayDateString() string {
	return time.Now().In(getLocalLocation()).Format("2006-01-02")
}

// GetTodayTime returns today's date as time.Time (at midnight, using Asia/Shanghai timezone)
func GetTodayTime() time.Time {
	loc := getLocalLocation()
	now := time.Now().In(loc)
	return time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
}

// GetYesterdayDateString returns yesterday's date in YYYY-MM-DD format (using Asia/Shanghai timezone)
func GetYesterdayDateString() string {
	return time.Now().In(getLocalLocation()).AddDate(0, 0, -1).Format("2006-01-02")
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

	// 发放签到经费奖励（异步，不阻塞签到流程）
	if goldReward > 0 && s.currencyService != nil {
		go func() {
			ctx := context.Background()
			bizID := fmt.Sprintf("checkin_%d_%s", userID, today)
			desc := fmt.Sprintf("签到奖励（连续%d天）", consecutiveDays)
			_, err := s.currencyService.GiftGold(ctx, userID, goldReward, "daily_checkin", bizID, desc)
			if err != nil {
				slog.Error("failed to gift checkin gold", "user_id", userID, "err", err)
			} else {
				slog.Info("checkin gold gifted", "amount", goldReward, "user_id", userID, "day", consecutiveDays)
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

// getCheckinGoldReward 根据连续签到天数获取经费奖励
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
		slog.Warn("failed to get checkin gold config", "config_key", configKey, "err", err)
		return getDefaultCheckinGold(consecutiveDays)
	}
	return amount
}

// getDefaultCheckinGold 获取默认签到经费（配置不可用时的降级）
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

// GetCheckinGoldRewardPublic 公开方法：根据连续签到天数获取经费奖励
func (s *Service) GetCheckinGoldRewardPublic(consecutiveDays int) int64 {
	return s.getCheckinGoldReward(consecutiveDays)
}

// FutureRewardInfo 未来签到奖励信息
type FutureRewardInfo struct {
	Date             string `json:"date"`
	ConsecutiveDay   int    `json:"consecutive_day"`
	ExpectedGold     int64  `json:"expected_gold"`
	IsMilestone      bool   `json:"is_milestone"`
	MilestoneMessage string `json:"milestone_message,omitempty"`
	IsBaseUpgrade    bool   `json:"is_base_upgrade"`     // 是否为基础奖励提升日（第16天）
	IsAfterUpgrade   bool   `json:"is_after_upgrade"`    // 是否为基础奖励提升后的日期（第16天及之后）
	BaseUpgradeMsg   string `json:"base_upgrade_msg,omitempty"` // 基础奖励提升提示
}

// GetFutureCheckinRewards 获取未来N天连续签到的预计奖励（包括今天）
// hasCheckedInToday: 今天是否已签到，影响连续天数的计算
func (s *Service) GetFutureCheckinRewards(currentStreak int, days int, hasCheckedInToday bool) []FutureRewardInfo {
	loc := getLocalLocation()
	today := time.Now().In(loc)
	
	// 获取基础奖励和15天后奖励的配置值
	baseGold := s.getCheckinGoldReward(1)      // 基础每日奖励
	after15Gold := s.getCheckinGoldReward(16)  // 15天后每日奖励
	
	rewards := make([]FutureRewardInfo, 0, days+1)
	
	// 从今天开始（i=0表示今天）
	for i := 0; i <= days; i++ {
		futureDate := today.AddDate(0, 0, i)
		
		// 计算该日期签到后的连续天数
		var consecutiveDay int
		if hasCheckedInToday {
			// 今天已签到，currentStreak 已包含今天
			// i=0（今天）: consecutiveDay = currentStreak（今天的连续天数）
			// i=1（明天）: consecutiveDay = currentStreak + 1（明天签到后）
			consecutiveDay = currentStreak + i
		} else {
			// 今天未签到，currentStreak 是昨天的连续天数
			// i=0（今天）: consecutiveDay = currentStreak + 1（今天签到后）
			// i=1（明天）: consecutiveDay = currentStreak + 2（明天签到后）
			consecutiveDay = currentStreak + 1 + i
		}
		expectedGold := s.getCheckinGoldReward(consecutiveDay)
		
		// 判断是否为里程碑日期
		isMilestone := false
		milestoneMsg := ""
		switch consecutiveDay {
		case 3:
			isMilestone = true
			milestoneMsg = "连续签到3天奖励"
		case 7:
			isMilestone = true
			milestoneMsg = "连续签到7天奖励"
		case 15:
			isMilestone = true
			milestoneMsg = "连续签到15天奖励"
		}
		
		// 判断是否为基础奖励提升日（第16天，从基础奖励升级到15天后奖励）
		isBaseUpgrade := consecutiveDay == 16
		// 判断是否为基础奖励提升后的日期（第16天及之后）
		isAfterUpgrade := consecutiveDay >= 16
		baseUpgradeMsg := ""
		if isBaseUpgrade {
			baseUpgradeMsg = fmt.Sprintf("基础奖励提升：%d → %d 经费/天", baseGold, after15Gold)
		} else if isAfterUpgrade {
			baseUpgradeMsg = fmt.Sprintf("每日基础奖励：%d 经费", after15Gold)
		}
		
		rewards = append(rewards, FutureRewardInfo{
			Date:             futureDate.Format("2006-01-02"),
			ConsecutiveDay:   consecutiveDay,
			ExpectedGold:     expectedGold,
			IsMilestone:      isMilestone,
			MilestoneMessage: milestoneMsg,
			IsBaseUpgrade:    isBaseUpgrade,
			IsAfterUpgrade:   isAfterUpgrade,
			BaseUpgradeMsg:   baseUpgradeMsg,
		})
	}
	
	return rewards
}
