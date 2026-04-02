// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package user

import (
	"fmt"
	"log/slog"
	"scholar-backend/internal/common/middleware"
	"scholar-backend/internal/common/model"
	"scholar-backend/internal/common/utils"
	"time"
)

// CreateSession creates a new user session
// CreateSession creates a new session for a user
// Implements single sign-on per device type: PC and mobile are separate
// When a user logs in on a new device, other sessions of the same device type are invalidated
func (s *Service) CreateSession(userID uint, token, ip, userAgent string, expiresIn time.Duration) error {
	// 解析设备类型
	deviceType := utils.ParseDeviceType(userAgent)

	// 使旧会话的 Redis 缓存失效（在删除数据库记录之前）
	if validator := middleware.GetSessionValidator(); validator != nil {
		validator.InvalidateUserSessions(userID)
	}

	// 单点登录：删除同一用户同一设备类型的其他会话
	// PC端只能有一个会话，移动端只能有一个会话，但PC和移动端可以同时存在
	if err := s.repo.DeleteUserSessionsByDeviceType(userID, deviceType); err != nil {
		// 删除失败不影响创建新会话，只记录日志
		slog.Warn("failed to delete old sessions", "user_id", userID, "device_type", deviceType, "err", err)
	}

	session := &model.UserSession{
		UserID:       userID,
		Token:        token,
		DeviceType:   deviceType,
		IP:           ip,
		UserAgent:    userAgent,
		LastActivity: time.Now(),
		ExpiresAt:    time.Now().Add(expiresIn),
	}
	return s.repo.CreateSession(session)
}

// UpdateSessionActivity updates the last activity time of a session and user's last login IP
func (s *Service) UpdateSessionActivity(token, ip string) error {
	return s.repo.UpdateSessionActivity(token, ip)
}

// UpdateSessionActivityByUserID updates session activity by user ID (used by WebSocket)
func (s *Service) UpdateSessionActivityByUserID(userID uint, ip string) error {
	return s.repo.UpdateSessionActivityByUserID(userID, ip)
}

// CleanupExpiredSessions deletes expired sessions
func (s *Service) CleanupExpiredSessions() error {
	return s.repo.DeleteExpiredSessions()
}

// Logout deletes all sessions for a user
func (s *Service) Logout(userID uint) error {
	return s.repo.DeleteUserSessions(userID)
}

// RecordOnlineUserSnapshot records current online user count (called periodically)
func (s *Service) RecordOnlineUserSnapshot() error {
	var onlineCount, guestCount int

	// 优先使用 WebSocket 连接状态
	if s.onlineStatsProvider != nil {
		onlineCount = s.onlineStatsProvider.GetOnlineUserCount()
		guestCount = s.onlineStatsProvider.GetOnlineGuestCount()
	} else {
		// 回退到数据库查询（不支持访客数）
		count, err := s.repo.GetOnlineUserCount()
		if err != nil {
			return err
		}
		onlineCount = int(count)
		guestCount = 0
	}

	// Record snapshot
	now := time.Now()
	if err := s.repo.CreateOnlineUserSnapshot(now, onlineCount, guestCount); err != nil {
		return err
	}

	// Also update peak for today (仅统计登录用户)
	today := now.Format("2006-01-02")
	_ = s.repo.UpdatePeakOnlineUsers(today, onlineCount)

	return nil
}

// RecordOnlineSnapshot 实时记录在线快照（WebSocket 连接/断开时调用）
// 使用 UPSERT 逻辑：同一分钟内只保留峰值
func (s *Service) RecordOnlineSnapshot(userCount, guestCount int) error {
	now := time.Now()
	// 按分钟取整
	minuteTimestamp := time.Date(now.Year(), now.Month(), now.Day(), now.Hour(), now.Minute(), 0, 0, now.Location())

	// 使用 UPSERT 记录峰值
	if err := s.repo.UpsertOnlineSnapshot(minuteTimestamp, userCount, guestCount); err != nil {
		return err
	}

	// 更新今日峰值
	today := now.Format("2006-01-02")
	_ = s.repo.UpdatePeakOnlineUsers(today, userCount)

	return nil
}

// GetUserStatisticsChart returns user registration statistics for charts (legacy, kept for compatibility)
func (s *Service) GetUserStatisticsChart(days int) ([]map[string]any, error) {
	startDate := time.Now().AddDate(0, 0, -days+1)
	startDate = time.Date(startDate.Year(), startDate.Month(), startDate.Day(), 0, 0, 0, 0, startDate.Location())
	endDate := time.Now()
	return s.GetUserStatisticsChartWithGranularity(startDate, endDate, "day")
}

// GetUserStatisticsChartWithGranularity returns user registration statistics with custom time range and granularity
// granularity: hour, day, week, month
func (s *Service) GetUserStatisticsChartWithGranularity(startTime, endTime time.Time, granularity string) ([]map[string]any, error) {
	result := make([]map[string]any, 0)
	loc := startTime.Location()

	switch granularity {
	case "hour":
		// 按小时统计
		currentTime := time.Date(startTime.Year(), startTime.Month(), startTime.Day(), startTime.Hour(), 0, 0, 0, loc)
		for currentTime.Before(endTime) || currentTime.Equal(endTime) {
			nextTime := currentTime.Add(time.Hour)

			count, err := s.repo.CountUsersInTimeRange(currentTime, nextTime)
			if err != nil {
				count = 0
			}

			result = append(result, map[string]any{
				"time":      currentTime.Format("2006-01-02 15:04"),
				"label":     currentTime.Format("01-02 15:00"),
				"new_users": count,
			})
			currentTime = nextTime
		}

	case "day":
		// 按天统计
		currentDate := time.Date(startTime.Year(), startTime.Month(), startTime.Day(), 0, 0, 0, 0, loc)
		endDate := time.Date(endTime.Year(), endTime.Month(), endTime.Day(), 0, 0, 0, 0, loc)
		for currentDate.Before(endDate) || currentDate.Equal(endDate) {
			nextDate := currentDate.AddDate(0, 0, 1)

			count, err := s.repo.CountUsersInTimeRange(currentDate, nextDate)
			if err != nil {
				count = 0
			}

			result = append(result, map[string]any{
				"time":      currentDate.Format("2006-01-02"),
				"label":     currentDate.Format("01-02"),
				"new_users": count,
			})
			currentDate = nextDate
		}

	case "week":
		// 按周统计（从周一开始）
		currentDate := startTime
		// 调整到周一
		weekday := int(currentDate.Weekday())
		if weekday == 0 {
			weekday = 7
		}
		currentDate = currentDate.AddDate(0, 0, -(weekday - 1))
		currentDate = time.Date(currentDate.Year(), currentDate.Month(), currentDate.Day(), 0, 0, 0, 0, loc)

		for currentDate.Before(endTime) {
			nextWeek := currentDate.AddDate(0, 0, 7)
			weekEnd := nextWeek
			if weekEnd.After(endTime) {
				weekEnd = endTime.AddDate(0, 0, 1)
			}

			count, err := s.repo.CountUsersInTimeRange(currentDate, weekEnd)
			if err != nil {
				count = 0
			}

			result = append(result, map[string]any{
				"time":      currentDate.Format("2006-01-02"),
				"label":     currentDate.Format("01-02") + "周",
				"new_users": count,
			})
			currentDate = nextWeek
		}

	case "month":
		// 按月统计
		currentDate := time.Date(startTime.Year(), startTime.Month(), 1, 0, 0, 0, 0, loc)
		endMonth := time.Date(endTime.Year(), endTime.Month(), 1, 0, 0, 0, 0, loc)

		for currentDate.Before(endMonth) || currentDate.Equal(endMonth) {
			nextMonth := currentDate.AddDate(0, 1, 0)
			monthEnd := nextMonth
			if monthEnd.After(endTime) {
				monthEnd = endTime.AddDate(0, 0, 1)
			}

			count, err := s.repo.CountUsersInTimeRange(currentDate, monthEnd)
			if err != nil {
				count = 0
			}

			result = append(result, map[string]any{
				"time":      currentDate.Format("2006-01"),
				"label":     currentDate.Format("2006年01月"),
				"new_users": count,
			})
			currentDate = nextMonth
		}

	default:
		return nil, fmt.Errorf("invalid granularity: %s", granularity)
	}

	return result, nil
}

// GetOnlineUserChartData returns online user count snapshots for charts (legacy, kept for compatibility)
func (s *Service) GetOnlineUserChartData(hours int) ([]map[string]any, error) {
	endTime := time.Now()
	startTime := endTime.Add(-time.Duration(hours) * time.Hour)
	return s.GetOnlineUserChartDataWithGranularity(startTime, endTime, "5min")
}

// GetOnlineUserChartDataWithGranularity returns online user count snapshots with custom time range and granularity
// granularity: 5min, hour
func (s *Service) GetOnlineUserChartDataWithGranularity(startTime, endTime time.Time, granularity string) ([]map[string]any, error) {
	// Round start time based on granularity
	loc := startTime.Location()

	var interval time.Duration
	var timeFormat, labelFormat string

	switch granularity {
	case "5min":
		startTime = startTime.Truncate(5 * time.Minute)
		interval = 5 * time.Minute
		timeFormat = "2006-01-02 15:04"
		labelFormat = "15:04"
	case "hour":
		startTime = time.Date(startTime.Year(), startTime.Month(), startTime.Day(), startTime.Hour(), 0, 0, 0, loc)
		interval = time.Hour
		timeFormat = "2006-01-02 15:00"
		labelFormat = "01-02 15:00"
	default:
		return nil, fmt.Errorf("invalid granularity: %s", granularity)
	}

	// Get snapshots from database
	snapshots, err := s.repo.GetOnlineUserSnapshots(startTime, endTime)
	if err != nil {
		return nil, err
	}

	// Aggregated counts struct
	type aggregatedCounts struct {
		onlineCounts []int
		guestCounts  []int
	}

	// Create a map for aggregating snapshots by interval
	snapshotsMap := make(map[string]*aggregatedCounts)
	for _, snapshot := range snapshots {
		var key string
		switch granularity {
		case "5min":
			roundedTime := snapshot.Timestamp.Truncate(5 * time.Minute)
			key = roundedTime.Format(timeFormat)
		case "hour":
			roundedTime := time.Date(snapshot.Timestamp.Year(), snapshot.Timestamp.Month(), snapshot.Timestamp.Day(),
				snapshot.Timestamp.Hour(), 0, 0, 0, loc)
			key = roundedTime.Format(timeFormat)
		}
		if snapshotsMap[key] == nil {
			snapshotsMap[key] = &aggregatedCounts{}
		}
		snapshotsMap[key].onlineCounts = append(snapshotsMap[key].onlineCounts, snapshot.OnlineCount)
		snapshotsMap[key].guestCounts = append(snapshotsMap[key].guestCounts, snapshot.GuestCount)
	}

	// Generate result with all time points filled
	result := make([]map[string]any, 0)
	currentTime := startTime

	for currentTime.Before(endTime) || currentTime.Equal(endTime) {
		timeStr := currentTime.Format(timeFormat)
		labelStr := currentTime.Format(labelFormat)

		// Get average counts for this interval
		onlineCount := 0
		guestCount := 0
		if agg, exists := snapshotsMap[timeStr]; exists && agg != nil {
			if len(agg.onlineCounts) > 0 {
				sum := 0
				for _, c := range agg.onlineCounts {
					sum += c
				}
				onlineCount = sum / len(agg.onlineCounts)
			}
			if len(agg.guestCounts) > 0 {
				sum := 0
				for _, c := range agg.guestCounts {
					sum += c
				}
				guestCount = sum / len(agg.guestCounts)
			}
		}

		result = append(result, map[string]any{
			"time":         timeStr,
			"label":        labelStr,
			"online_count": onlineCount,
			"guest_count":  guestCount,
		})

		currentTime = currentTime.Add(interval)
	}

	return result, nil
}
