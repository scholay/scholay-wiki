// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package admin

import (
	"net/http"
	"scholar-backend/internal/common/utils"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// OnlineStatsProvider 提供在线统计的接口（由 WebSocket Hub 实现）
type OnlineStatsProvider interface {
	GetOnlineUserCount() int
	GetOnlineGuestCount() int
}

// DashboardHandler handles dashboard statistics requests
type DashboardHandler struct {
	db                  *gorm.DB
	onlineStatsProvider OnlineStatsProvider
}

// NewDashboardHandler creates a new dashboard handler
func NewDashboardHandler(db *gorm.DB) *DashboardHandler {
	return &DashboardHandler{db: db}
}

// SetOnlineStatsProvider 设置在线统计提供者（WebSocket Hub）
func (h *DashboardHandler) SetOnlineStatsProvider(provider OnlineStatsProvider) {
	h.onlineStatsProvider = provider
}

// DashboardStatistics represents overall dashboard statistics
type DashboardStatistics struct {
	// 用户统计
	TotalUsers       int64               `json:"total_users"`
	ActiveUsers30d   int64               `json:"active_users_30d"`
	NewUsersToday    int64               `json:"new_users_today"`
	NewUsers7d       int64               `json:"new_users_7d"`
	NewUsers30d      int64               `json:"new_users_30d"`
	OnlineUsers      int64               `json:"online_users"`
	OnlineGuests     int64               `json:"online_guests"`

	// 会话统计
	TotalConversations  int64            `json:"total_conversations"`
	ConversationsToday  int64            `json:"conversations_today"`
	TotalMessages       int64            `json:"total_messages"`

	// 系统统计
	ThirdPartyAccounts  int64            `json:"third_party_accounts"`
	PromptTemplates     int64            `json:"prompt_templates"`

	// 趋势数据 (用于图表)
	UserGrowthChart     []ChartDataPoint `json:"user_growth_chart"`
}

// ChartDataPoint represents a point in time-series chart
type ChartDataPoint struct {
	Date  string  `json:"date"`  // YYYY-MM-DD format
	Value float64 `json:"value"` // 数值
}

// GetDashboardStatistics handles GET /api/v1/admin/dashboard/statistics
func (h *DashboardHandler) GetDashboardStatistics(c *gin.Context) {
	stats := &DashboardStatistics{}
	now := time.Now()
	today := now.Format("2006-01-02")
	date7dAgo := now.AddDate(0, 0, -7).Format("2006-01-02")
	date30dAgo := now.AddDate(0, 0, -30).Format("2006-01-02")

	// ============================================
	// 用户统计
	// ============================================

	// 总用户数
	h.db.Table("users").Count(&stats.TotalUsers)

	// 今日新增用户
	h.db.Table("users").
		Where("DATE(created_at) = ?", today).
		Count(&stats.NewUsersToday)

	// 7天新增用户
	h.db.Table("users").
		Where("DATE(created_at) >= ?", date7dAgo).
		Count(&stats.NewUsers7d)

	// 30天新增用户
	h.db.Table("users").
		Where("DATE(created_at) >= ?", date30dAgo).
		Count(&stats.NewUsers30d)

	// 30天活跃用户 (有登录记录)
	h.db.Table("user_sessions").
		Where("last_active_at >= ?", time.Now().AddDate(0, 0, -30)).
		Distinct("user_id").
		Count(&stats.ActiveUsers30d)

	// 当前在线用户和访客（基于 WebSocket 连接状态）
	if h.onlineStatsProvider != nil {
		stats.OnlineUsers = int64(h.onlineStatsProvider.GetOnlineUserCount())
		stats.OnlineGuests = int64(h.onlineStatsProvider.GetOnlineGuestCount())
	} else {
		h.db.Table("user_sessions").
			Where("last_active_at >= ?", time.Now().Add(-5*time.Minute)).
			Count(&stats.OnlineUsers)
	}

	// ============================================
	// 会话统计
	// ============================================

	// 总对话数
	h.db.Table("conversations").Count(&stats.TotalConversations)

	// 今日对话数
	h.db.Table("conversations").
		Where("DATE(created_at) = ?", today).
		Count(&stats.ConversationsToday)

	// 总消息数
	h.db.Table("conversation_messages").Count(&stats.TotalMessages)

	// ============================================
	// 系统统计
	// ============================================

	// 第三方账号数
	h.db.Table("third_party_accounts").Count(&stats.ThirdPartyAccounts)

	// 提示词模板数
	h.db.Table("prompt_templates").Count(&stats.PromptTemplates)

	// ============================================
	// 趋势图表数据
	// ============================================

	// 用户增长趋势 (最近30天)
	stats.UserGrowthChart = h.getUserGrowthChart(30)

	utils.SuccessResponse(c, http.StatusOK, "Dashboard statistics retrieved successfully", stats)
}

// getUserGrowthChart 获取用户增长趋势图表数据
func (h *DashboardHandler) getUserGrowthChart(days int) []ChartDataPoint {
	var results []struct {
		Date  string
		Count int64
	}

	h.db.Table("users").
		Select("DATE(created_at) as date, COUNT(*) as count").
		Where("created_at >= ?", time.Now().AddDate(0, 0, -days)).
		Group("DATE(created_at)").
		Order("date ASC").
		Scan(&results)

	chart := make([]ChartDataPoint, 0, len(results))
	for _, r := range results {
		chart = append(chart, ChartDataPoint{
			Date:  r.Date,
			Value: float64(r.Count),
		})
	}

	return chart
}

