// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package checkin

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

// Handler handles HTTP requests for check-in
type Handler struct {
	service *Service
}

// NewHandler creates a new check-in handler
func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// Checkin handles daily check-in request
// POST /api/v1/user/checkin
func (h *Handler) Checkin(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"code":    401,
			"message": "未登录",
		})
		return
	}

	response, err := h.service.Checkin(userID.(uint))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "签到失败: " + err.Error(),
		})
		return
	}

	code := 0
	if !response.Success {
		code = 4001 // Already checked in
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    code,
		"message": response.Message,
		"data":    response,
	})
}

// GetStatus handles get check-in status request
// GET /api/v1/user/checkin/status
func (h *Handler) GetStatus(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"code":    401,
			"message": "未登录",
		})
		return
	}

	response, err := h.service.GetCheckinStatus(userID.(uint))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "获取签到状态失败: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    0,
		"message": "success",
		"data":    response,
	})
}

// CheckinDateInfo 签到日期信息（包含经费奖励）
type CheckinDateInfo struct {
	Date       string `json:"date"`
	GoldReward int64  `json:"gold_reward"`
}

// FutureDateInfo 未来签到日期预计奖励
type FutureDateInfo struct {
	Date             string `json:"date"`
	ConsecutiveDay   int    `json:"consecutive_day"`
	ExpectedGold     int64  `json:"expected_gold"`
	IsMilestone      bool   `json:"is_milestone"`
	MilestoneMessage string `json:"milestone_message,omitempty"`
}

// GetHistory handles get check-in history request
// GET /api/v1/user/checkin/history?year=2025&month=12
func (h *Handler) GetHistory(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"code":    401,
			"message": "未登录",
		})
		return
	}

	// Parse year and month from query params
	yearStr := c.DefaultQuery("year", strconv.Itoa(time.Now().Year()))
	monthStr := c.DefaultQuery("month", strconv.Itoa(int(time.Now().Month())))

	year, err := strconv.Atoi(yearStr)
	if err != nil {
		year = time.Now().Year()
	}
	month, err := strconv.Atoi(monthStr)
	if err != nil {
		month = int(time.Now().Month())
	}

	// Calculate date range for the month
	startDate := time.Date(year, time.Month(month), 1, 0, 0, 0, 0, time.Local)
	endDate := startDate.AddDate(0, 1, 0).Add(-time.Second)

	history, err := h.service.GetCheckinHistory(
		userID.(uint),
		startDate.Format("2006-01-02"),
		endDate.Format("2006-01-02"),
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    500,
			"message": "获取签到历史失败: " + err.Error(),
		})
		return
	}

	// Convert to date list with gold rewards for calendar display
	checkinDates := make([]string, 0, len(history))
	checkinDetails := make([]CheckinDateInfo, 0, len(history))
	for _, checkin := range history {
		dateStr := checkin.GetCheckinDateString()
		checkinDates = append(checkinDates, dateStr)
		// 根据连续签到天数计算当天获得的经费
		goldReward := h.service.GetCheckinGoldRewardPublic(checkin.ConsecutiveDays)
		checkinDetails = append(checkinDetails, CheckinDateInfo{
			Date:       dateStr,
			GoldReward: goldReward,
		})
	}

	// Get user stats for consecutive and total days
	status, _ := h.service.GetCheckinStatus(userID.(uint))
	consecutiveDays := 0
	totalDays := 0
	hasCheckedInToday := false
	if status != nil {
		consecutiveDays = status.ConsecutiveDays
		totalDays = status.TotalCheckins
		hasCheckedInToday = status.HasCheckedIn
	}

	// 计算到当月最后一天的预计签到奖励
	// 计算当月剩余天数
	now := time.Now()
	lastDayOfMonth := time.Date(year, time.Month(month+1), 0, 0, 0, 0, 0, time.Local)
	daysUntilEndOfMonth := int(lastDayOfMonth.Sub(now).Hours()/24) + 1 // +1 包括今天
	if daysUntilEndOfMonth < 1 {
		daysUntilEndOfMonth = 1
	}
	futureRewards := h.service.GetFutureCheckinRewards(consecutiveDays, daysUntilEndOfMonth, hasCheckedInToday)

	c.JSON(http.StatusOK, gin.H{
		"code":    0,
		"message": "success",
		"data": gin.H{
			"year":             year,
			"month":            month,
			"checkin_dates":    checkinDates,
			"checkin_details":  checkinDetails,
			"future_rewards":   futureRewards,
			"total_count":      len(checkinDates),
			"consecutive_days": consecutiveDays,
			"total_days":       totalDays,
		},
	})
}

// RegisterRoutes registers check-in routes
func (h *Handler) RegisterRoutes(rg *gin.RouterGroup) {
	checkin := rg.Group("/checkin")
	{
		checkin.POST("", h.Checkin)
		checkin.GET("/status", h.GetStatus)
		checkin.GET("/history", h.GetHistory)
	}
}

