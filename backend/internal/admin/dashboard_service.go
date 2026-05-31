// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package admin

import (
	"time"

	"gorm.io/gorm"
)

// DashboardStatistics represents overall dashboard statistics
//
// 历史上还有 conversations / conversation_messages 两组字段, 在迁移 0049
// DROP 那两张表后只能 500; 已彻底移除字段 + 查询 (前端会拿不到这两个 key)。
//
// 订单/收入/优惠券字段保留 — 支付流以后会重启, 当前空查只是返回 0, 不会报错。
type DashboardStatistics struct {
	// 用户统计
	TotalUsers    int64 `json:"total_users"`
	NewUsersToday int64 `json:"new_users_today"`
	NewUsers7d    int64 `json:"new_users_7d"`
	NewUsers30d   int64 `json:"new_users_30d"`
	PaidUsers     int64 `json:"paid_users"`
	FreeUsers     int64 `json:"free_users"`

	// 收入统计
	TotalRevenue float64 `json:"total_revenue"`
	RevenueToday float64 `json:"revenue_today"`
	Revenue7d    float64 `json:"revenue_7d"`
	Revenue30d   float64 `json:"revenue_30d"`

	// 订单统计
	TotalOrders   int64 `json:"total_orders"`
	PaidOrders    int64 `json:"paid_orders"`
	PendingOrders int64 `json:"pending_orders"`

	// 优惠券统计
	TotalCoupons  int64 `json:"total_coupons"`
	UsedCoupons   int64 `json:"used_coupons"`
	UnusedCoupons int64 `json:"unused_coupons"`

	// 系统统计
	ThirdPartyAccounts int64 `json:"third_party_accounts"`

	// 趋势数据 (用于图表)
	UserGrowthChart   []ChartDataPoint `json:"user_growth_chart"`
	OrderTrendChart   []ChartDataPoint `json:"order_trend_chart"`
	RevenueTrendChart []ChartDataPoint `json:"revenue_trend_chart"`
}

// ChartDataPoint represents a point in time-series chart
type ChartDataPoint struct {
	Date  string  `json:"date"`  // YYYY-MM-DD format
	Value float64 `json:"value"` // 数值
}

// dashboardService 汇总看板所需的业务库表统计 —— 把直连 DB 的查询从 handler
// 收进 service 层 (handler 不再持有 *gorm.DB), 与其他模块的分层保持一致。
type dashboardService struct {
	db *gorm.DB
}

func newDashboardService(db *gorm.DB) *dashboardService {
	return &dashboardService{db: db}
}

// GetStatistics 跑全部看板汇总查询并装配成 DashboardStatistics。
func (s *dashboardService) GetStatistics() *DashboardStatistics {
	stats := &DashboardStatistics{}
	now := time.Now()
	today := now.Format("2006-01-02")
	date7dAgo := now.AddDate(0, 0, -7).Format("2006-01-02")
	date30dAgo := now.AddDate(0, 0, -30).Format("2006-01-02")

	// 用户统计
	s.db.Table("users").Count(&stats.TotalUsers)
	s.db.Table("users").Where("DATE(created_at) = ?", today).Count(&stats.NewUsersToday)
	s.db.Table("users").Where("DATE(created_at) >= ?", date7dAgo).Count(&stats.NewUsers7d)
	s.db.Table("users").Where("DATE(created_at) >= ?", date30dAgo).Count(&stats.NewUsers30d)

	// (对话统计已下线 — conversations/conversation_messages 表在迁移 0049 DROP)

	// 收入统计
	s.db.Table("orders").
		Select("COALESCE(SUM(final_amount), 0)").
		Where("status = ?", "paid").
		Scan(&stats.TotalRevenue)

	s.db.Table("orders").
		Select("COALESCE(SUM(final_amount), 0)").
		Where("status = ? AND DATE(payment_time) = ?", "paid", today).
		Scan(&stats.RevenueToday)

	s.db.Table("orders").
		Select("COALESCE(SUM(final_amount), 0)").
		Where("status = ? AND DATE(payment_time) >= ?", "paid", date7dAgo).
		Scan(&stats.Revenue7d)

	s.db.Table("orders").
		Select("COALESCE(SUM(final_amount), 0)").
		Where("status = ? AND DATE(payment_time) >= ?", "paid", date30dAgo).
		Scan(&stats.Revenue30d)

	// 订单统计
	s.db.Table("orders").Count(&stats.TotalOrders)
	s.db.Table("orders").Where("status = ?", "paid").Count(&stats.PaidOrders)
	s.db.Table("orders").Where("status = ?", "pending").Count(&stats.PendingOrders)

	// 付费/免费用户
	s.db.Table("user_subscriptions").
		Where("status = ? AND end_date > ?", "active", now).
		Distinct("user_id").
		Count(&stats.PaidUsers)
	stats.FreeUsers = stats.TotalUsers - stats.PaidUsers
	if stats.FreeUsers < 0 {
		stats.FreeUsers = 0
	}

	// 优惠券统计
	s.db.Table("user_coupons").Count(&stats.TotalCoupons)
	s.db.Table("user_coupons").Where("status = ?", "used").Count(&stats.UsedCoupons)
	s.db.Table("user_coupons").Where("status = ?", "unused").Count(&stats.UnusedCoupons)

	// 系统统计
	s.db.Table("third_party_accounts").Count(&stats.ThirdPartyAccounts)

	// 趋势图表数据
	stats.UserGrowthChart = s.getUserGrowthChart(30)
	stats.OrderTrendChart = s.getOrderTrendChart(30)
	stats.RevenueTrendChart = s.getRevenueTrendChart(30)

	return stats
}

// getUserGrowthChart 获取用户增长趋势图表数据
func (s *dashboardService) getUserGrowthChart(days int) []ChartDataPoint {
	var results []struct {
		Date  string
		Count int64
	}

	s.db.Table("users").
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
func (s *dashboardService) getOrderTrendChart(days int) []ChartDataPoint {
	var results []struct {
		Date  string
		Count int64
	}

	s.db.Table("orders").
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
func (s *dashboardService) getRevenueTrendChart(days int) []ChartDataPoint {
	var results []struct {
		Date   string
		Amount float64
	}

	s.db.Table("orders").
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
