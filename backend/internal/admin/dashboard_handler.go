// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package admin

import (
	"net/http"
	ifaces "scholar-backend/internal/common/interfaces"
	"scholar-backend/internal/common/utils"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// DashboardHandler handles dashboard statistics requests
type DashboardHandler struct {
	db                  *gorm.DB
	onlineStatsProvider ifaces.OnlineStatsProvider
}

// NewDashboardHandler creates a new dashboard handler
func NewDashboardHandler(db *gorm.DB) *DashboardHandler {
	return &DashboardHandler{db: db}
}

// SetOnlineStatsProvider 设置在线统计提供者（WebSocket Hub）
func (h *DashboardHandler) SetOnlineStatsProvider(provider ifaces.OnlineStatsProvider) {
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
	PaidUsers        int64               `json:"paid_users"`
	FreeUsers        int64               `json:"free_users"`

	// 收入统计
	TotalRevenue     float64             `json:"total_revenue"`
	RevenueToday     float64             `json:"revenue_today"`
	Revenue7d        float64             `json:"revenue_7d"`
	Revenue30d       float64             `json:"revenue_30d"`

	// 订单统计
	TotalOrders      int64               `json:"total_orders"`
	PaidOrders       int64               `json:"paid_orders"`
	PendingOrders    int64               `json:"pending_orders"`

	// 会话统计
	TotalConversations  int64            `json:"total_conversations"`
	ConversationsToday  int64            `json:"conversations_today"`
	TotalMessages       int64            `json:"total_messages"`

	// 优惠券统计
	TotalCoupons     int64               `json:"total_coupons"`
	UsedCoupons      int64               `json:"used_coupons"`
	UnusedCoupons    int64               `json:"unused_coupons"`

	// 系统统计
	ThirdPartyAccounts  int64            `json:"third_party_accounts"`
	PromptTemplates     int64            `json:"prompt_templates"`

	// 趋势数据 (用于图表)
	UserGrowthChart     []ChartDataPoint `json:"user_growth_chart"`
	OrderTrendChart     []ChartDataPoint `json:"order_trend_chart"`
	RevenueTrendChart   []ChartDataPoint `json:"revenue_trend_chart"`
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
		Where("last_activity >= ?", time.Now().AddDate(0, 0, -30)).
		Distinct("user_id").
		Count(&stats.ActiveUsers30d)

	// 当前在线用户和访客（基于 WebSocket 连接状态）
	if h.onlineStatsProvider != nil {
		stats.OnlineUsers = int64(h.onlineStatsProvider.GetOnlineUserCount())
		stats.OnlineGuests = int64(h.onlineStatsProvider.GetOnlineGuestCount())
	} else {
		// 回退到数据库查询（兼容旧逻辑）
		h.db.Table("user_sessions").
			Where("last_activity >= ?", time.Now().Add(-5*time.Minute)).
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
	// 收入统计
	// ============================================

	h.db.Table("orders").
		Select("COALESCE(SUM(final_amount), 0)").
		Where("status = ?", "paid").
		Scan(&stats.TotalRevenue)

	h.db.Table("orders").
		Select("COALESCE(SUM(final_amount), 0)").
		Where("status = ? AND DATE(payment_time) = ?", "paid", today).
		Scan(&stats.RevenueToday)

	h.db.Table("orders").
		Select("COALESCE(SUM(final_amount), 0)").
		Where("status = ? AND DATE(payment_time) >= ?", "paid", date7dAgo).
		Scan(&stats.Revenue7d)

	h.db.Table("orders").
		Select("COALESCE(SUM(final_amount), 0)").
		Where("status = ? AND DATE(payment_time) >= ?", "paid", date30dAgo).
		Scan(&stats.Revenue30d)

	// ============================================
	// 订单统计
	// ============================================

	h.db.Table("orders").Count(&stats.TotalOrders)

	h.db.Table("orders").Where("status = ?", "paid").Count(&stats.PaidOrders)

	h.db.Table("orders").Where("status = ?", "pending").Count(&stats.PendingOrders)

	// ============================================
	// 付费/免费用户
	// ============================================

	h.db.Table("user_subscriptions").
		Where("status = ? AND end_date > ?", "active", now).
		Distinct("user_id").
		Count(&stats.PaidUsers)

	stats.FreeUsers = stats.TotalUsers - stats.PaidUsers
	if stats.FreeUsers < 0 {
		stats.FreeUsers = 0
	}

	// ============================================
	// 优惠券统计
	// ============================================

	h.db.Table("user_coupons").Count(&stats.TotalCoupons)

	h.db.Table("user_coupons").Where("status = ?", "used").Count(&stats.UsedCoupons)

	h.db.Table("user_coupons").Where("status = ?", "unused").Count(&stats.UnusedCoupons)

	// ============================================
	// 系统统计
	// ============================================

	h.db.Table("third_party_accounts").Count(&stats.ThirdPartyAccounts)

	h.db.Table("prompt_templates").Count(&stats.PromptTemplates)

	// ============================================
	// 趋势图表数据
	// ============================================

	stats.UserGrowthChart = h.getUserGrowthChart(30)
	stats.OrderTrendChart = h.getOrderTrendChart(30)
	stats.RevenueTrendChart = h.getRevenueTrendChart(30)

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

// getOrderTrendChart 获取订单趋势图表数据（已支付订单）
func (h *DashboardHandler) getOrderTrendChart(days int) []ChartDataPoint {
	var results []struct {
		Date  string
		Count int64
	}

	h.db.Table("orders").
		Select("DATE(payment_time) as date, COUNT(*) as count").
		Where("status = ? AND payment_time >= ?", "paid", time.Now().AddDate(0, 0, -days)).
		Group("DATE(payment_time)").
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

// getRevenueTrendChart 获取收入趋势图表数据
func (h *DashboardHandler) getRevenueTrendChart(days int) []ChartDataPoint {
	var results []struct {
		Date   string
		Amount float64
	}

	h.db.Table("orders").
		Select("DATE(payment_time) as date, COALESCE(SUM(final_amount), 0) as amount").
		Where("status = ? AND payment_time >= ?", "paid", time.Now().AddDate(0, 0, -days)).
		Group("DATE(payment_time)").
		Order("date ASC").
		Scan(&results)

	chart := make([]ChartDataPoint, 0, len(results))
	for _, r := range results {
		chart = append(chart, ChartDataPoint{
			Date:  r.Date,
			Value: r.Amount,
		})
	}

	return chart
}

