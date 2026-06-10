// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package admin

import (
	"sync"
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

	// 看板缓存: 每次加载要跑 ~17 条串行 COUNT/SUM, 30s 内多次打开/刷新复用同一份。
	// 锁覆盖整个计算过程, 顺带把并发冷加载折叠成一次 (admin-only 低频, 简单优先)。
	mu       sync.Mutex
	cached   *DashboardStatistics
	cachedAt time.Time
}

// dashboardCacheTTL 看板汇总缓存时长 —— 运营指标不需要秒级新鲜。
const dashboardCacheTTL = 30 * time.Second

func newDashboardService(db *gorm.DB) *dashboardService {
	return &dashboardService{db: db}
}

// GetStatistics 返回看板汇总 (30s 进程内缓存; 缓存结果只读共享, handler 仅序列化)。
func (s *dashboardService) GetStatistics() *DashboardStatistics {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cached != nil && time.Since(s.cachedAt) < dashboardCacheTTL {
		return s.cached
	}
	stats := s.computeStatistics()
	s.cached = stats
	s.cachedAt = time.Now()
	return stats
}

// computeStatistics 跑全部看板汇总查询并装配成 DashboardStatistics。
func (s *dashboardService) computeStatistics() *DashboardStatistics {
	stats := &DashboardStatistics{}
	now := time.Now()
	// 半开区间替代 DATE(col) = / >= : DATE() 包列不可走索引 (非 sargable), 会扫全部候选行。
	// 北京时间语义不变 —— 容器 TZ 即北京时, 直接取本地零点, 不做任何时区转换。
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	tomorrowStart := todayStart.AddDate(0, 0, 1)
	start7d := todayStart.AddDate(0, 0, -7)
	start30d := todayStart.AddDate(0, 0, -30)

	// 用户统计
	s.db.Table("users").Count(&stats.TotalUsers)
	s.db.Table("users").Where("created_at >= ? AND created_at < ?", todayStart, tomorrowStart).Count(&stats.NewUsersToday)
	s.db.Table("users").Where("created_at >= ?", start7d).Count(&stats.NewUsers7d)
	s.db.Table("users").Where("created_at >= ?", start30d).Count(&stats.NewUsers30d)

	// (对话统计已下线 — conversations/conversation_messages 表在迁移 0049 DROP)

	// 收入统计
	s.db.Table("orders").
		Select("COALESCE(SUM(final_amount), 0)").
		Where("status = ?", "paid").
		Scan(&stats.TotalRevenue)

	s.db.Table("orders").
		Select("COALESCE(SUM(final_amount), 0)").
		Where("status = ? AND payment_time >= ? AND payment_time < ?", "paid", todayStart, tomorrowStart).
		Scan(&stats.RevenueToday)

	s.db.Table("orders").
		Select("COALESCE(SUM(final_amount), 0)").
		Where("status = ? AND payment_time >= ?", "paid", start7d).
		Scan(&stats.Revenue7d)

	s.db.Table("orders").
		Select("COALESCE(SUM(final_amount), 0)").
		Where("status = ? AND payment_time >= ?", "paid", start30d).
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
