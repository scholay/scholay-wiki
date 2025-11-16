package admin

import (
	"net/http"
	"scholar-backend/internal/common/utils"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// DashboardHandler handles dashboard statistics requests
type DashboardHandler struct {
	db *gorm.DB
}

// NewDashboardHandler creates a new dashboard handler
func NewDashboardHandler(db *gorm.DB) *DashboardHandler {
	return &DashboardHandler{db: db}
}

// DashboardStatistics represents overall dashboard statistics
type DashboardStatistics struct {
	// 用户统计
	TotalUsers       int64               `json:"total_users"`        // 总用户数
	ActiveUsers30d   int64               `json:"active_users_30d"`   // 30天活跃用户
	NewUsersToday    int64               `json:"new_users_today"`    // 今日新增
	NewUsers7d       int64               `json:"new_users_7d"`       // 7天新增
	NewUsers30d      int64               `json:"new_users_30d"`      // 30天新增
	OnlineUsers      int64               `json:"online_users"`       // 当前在线用户

	// 订单统计
	TotalOrders      int64               `json:"total_orders"`       // 总订单数
	PendingOrders    int64               `json:"pending_orders"`     // 待支付订单
	PaidOrders       int64               `json:"paid_orders"`        // 已支付订单
	TotalRevenue     float64             `json:"total_revenue"`      // 总收入
	RevenueToday     float64             `json:"revenue_today"`      // 今日收入
	Revenue7d        float64             `json:"revenue_7d"`         // 7天收入
	Revenue30d       float64             `json:"revenue_30d"`        // 30天收入

	// 订阅统计
	ActiveSubscriptions int64            `json:"active_subscriptions"` // 活跃订阅数
	FreeUsers           int64            `json:"free_users"`           // 免费用户
	PaidUsers           int64            `json:"paid_users"`           // 付费用户

	// 优惠券统计
	TotalCoupons        int64            `json:"total_coupons"`        // 总优惠券数
	UsedCoupons         int64            `json:"used_coupons"`         // 已使用
	UnusedCoupons       int64            `json:"unused_coupons"`       // 未使用
	ExpiredCoupons      int64            `json:"expired_coupons"`      // 已过期

	// 会话统计
	TotalConversations  int64            `json:"total_conversations"`  // 总对话数
	ConversationsToday  int64            `json:"conversations_today"`  // 今日对话
	TotalMessages       int64            `json:"total_messages"`       // 总消息数

	// 系统统计
	ThirdPartyAccounts  int64            `json:"third_party_accounts"` // 第三方账号数
	PromptTemplates     int64            `json:"prompt_templates"`     // 提示词模板数

	// 趋势数据 (用于图表)
	UserGrowthChart     []ChartDataPoint `json:"user_growth_chart"`    // 用户增长趋势
	OrderTrendChart     []ChartDataPoint `json:"order_trend_chart"`    // 订单趋势
	RevenueTrendChart   []ChartDataPoint `json:"revenue_trend_chart"`  // 收入趋势
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

	// 当前在线用户 (5分钟内活跃)
	h.db.Table("user_sessions").
		Where("last_active_at >= ?", time.Now().Add(-5*time.Minute)).
		Count(&stats.OnlineUsers)

	// ============================================
	// 订单统计
	// ============================================

	// 总订单数
	h.db.Table("orders").Count(&stats.TotalOrders)

	// 待支付订单
	h.db.Table("orders").
		Where("status = ?", "pending").
		Count(&stats.PendingOrders)

	// 已支付订单
	h.db.Table("orders").
		Where("status = ?", "paid").
		Count(&stats.PaidOrders)

	// 总收入
	h.db.Table("orders").
		Where("status = ?", "paid").
		Select("COALESCE(SUM(final_amount), 0)").
		Scan(&stats.TotalRevenue)

	// 今日收入
	h.db.Table("orders").
		Where("status = ? AND DATE(paid_at) = ?", "paid", today).
		Select("COALESCE(SUM(final_amount), 0)").
		Scan(&stats.RevenueToday)

	// 7天收入
	h.db.Table("orders").
		Where("status = ? AND DATE(paid_at) >= ?", "paid", date7dAgo).
		Select("COALESCE(SUM(final_amount), 0)").
		Scan(&stats.Revenue7d)

	// 30天收入
	h.db.Table("orders").
		Where("status = ? AND DATE(paid_at) >= ?", "paid", date30dAgo).
		Select("COALESCE(SUM(final_amount), 0)").
		Scan(&stats.Revenue30d)

	// ============================================
	// 订阅统计
	// ============================================

	// 活跃订阅数 (未过期)
	h.db.Table("user_subscriptions").
		Where("status = ? AND (expired_at IS NULL OR expired_at > ?)", "active", now).
		Count(&stats.ActiveSubscriptions)

	// 免费用户 (订阅计划为免费)
	h.db.Table("user_subscriptions").
		Joins("JOIN subscription_plans ON user_subscriptions.plan_id = subscription_plans.id").
		Where("subscription_plans.price = 0 AND user_subscriptions.status = ?", "active").
		Count(&stats.FreeUsers)

	// 付费用户
	h.db.Table("user_subscriptions").
		Joins("JOIN subscription_plans ON user_subscriptions.plan_id = subscription_plans.id").
		Where("subscription_plans.price > 0 AND user_subscriptions.status = ?", "active").
		Count(&stats.PaidUsers)

	// ============================================
	// 优惠券统计
	// ============================================

	// 总优惠券数
	h.db.Table("user_coupons").Count(&stats.TotalCoupons)

	// 已使用优惠券
	h.db.Table("user_coupons").
		Where("status = ?", "used").
		Count(&stats.UsedCoupons)

	// 未使用优惠券
	h.db.Table("user_coupons").
		Where("status = ?", "unused").
		Count(&stats.UnusedCoupons)

	// 已过期优惠券
	h.db.Table("user_coupons").
		Where("status = ?", "expired").
		Count(&stats.ExpiredCoupons)

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

	// 订单趋势 (最近30天)
	stats.OrderTrendChart = h.getOrderTrendChart(30)

	// 收入趋势 (最近30天)
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

// getOrderTrendChart 获取订单趋势图表数据
func (h *DashboardHandler) getOrderTrendChart(days int) []ChartDataPoint {
	var results []struct {
		Date  string
		Count int64
	}

	h.db.Table("orders").
		Select("DATE(created_at) as date, COUNT(*) as count").
		Where("created_at >= ? AND status = ?", time.Now().AddDate(0, 0, -days), "paid").
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

// getRevenueTrendChart 获取收入趋势图表数据
func (h *DashboardHandler) getRevenueTrendChart(days int) []ChartDataPoint {
	var results []struct {
		Date   string
		Amount float64
	}

	h.db.Table("orders").
		Select("DATE(paid_at) as date, COALESCE(SUM(final_amount), 0) as amount").
		Where("paid_at >= ? AND status = ?", time.Now().AddDate(0, 0, -days), "paid").
		Group("DATE(paid_at)").
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
