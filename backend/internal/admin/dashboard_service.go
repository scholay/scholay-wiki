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
// 指标口径(2026-06 体检后收口,只留运营者真实会看的):
//   - 用户:users 表(活)。付费用户 = users.vip_tier IN (pro,max) 且未过期 —— 旧版读
//     stranded 的 user_subscriptions(vip 重做后无代码写入)导致永远停在历史值,已修正。
//   - 订单/营收:orders 表 —— vip 重做**复用了**该表(充值 recharge / 订阅 subscription,
//     status=pending|paid|expired,金额「元」),是活数据,口径与 internal/vip/order.go 一致。
//   - AI 成本:llm_token_usage(per-call 账本)按日汇总 —— 营收旁边放成本,看板才能看出毛利。
//   - 兑换码:vip_redemption_codes / vip_code_redemptions(活)。
//   - 已删除:优惠券(user_coupons stranded)、对话数(conversations 表 0049 已 DROP)、
//     三方账号计数(配置库存不是经营指标,健康告警由 TodayPanel 负责)。
type DashboardStatistics struct {
	// 用户统计
	TotalUsers    int64 `json:"total_users"`
	NewUsersToday int64 `json:"new_users_today"`
	NewUsers7d    int64 `json:"new_users_7d"`
	NewUsers30d   int64 `json:"new_users_30d"`
	PaidUsers     int64 `json:"paid_users"`
	FreeUsers     int64 `json:"free_users"`

	// 收入统计(orders, status=paid)
	TotalRevenue float64 `json:"total_revenue"`
	RevenueToday float64 `json:"revenue_today"`
	Revenue7d    float64 `json:"revenue_7d"`
	Revenue30d   float64 `json:"revenue_30d"`

	// 订单统计
	TotalOrders   int64 `json:"total_orders"`
	PaidOrders    int64 `json:"paid_orders"`
	PendingOrders int64 `json:"pending_orders"`

	// AI 成本(llm_token_usage 总 token,含缓存口径见 llmusage)
	TokensToday int64 `json:"tokens_today"`
	Tokens30d   int64 `json:"tokens_30d"`

	// 兑换码
	TotalCodes    int64 `json:"total_codes"`
	RedeemedCodes int64 `json:"redeemed_codes"`

	// 趋势数据 (用于图表)
	UserGrowthChart   []ChartDataPoint `json:"user_growth_chart"`
	RevenueTrendChart []ChartDataPoint `json:"revenue_trend_chart"`
	TokenTrendChart   []ChartDataPoint `json:"token_trend_chart"`
}

// ChartDataPoint represents a point in time-series chart
type ChartDataPoint struct {
	Date  string  `json:"date"`  // YYYY-MM-DD format
	Value float64 `json:"value"` // 数值
}

// fillChartDays 把 GROUP BY DATE 的稀疏结果补成 [今天-(days-1) .. 今天] 的连续日序列(缺失日补 0)。
// 否则趋势图会跳过无数据的天 → 点漏掉、折线连错;补 0 后还保证最后一桶恒为"今天"(供前端画虚线)。
// 直接 time.Now()(容器时区=北京),不做时区转换。
func fillChartDays(points []ChartDataPoint, days int) []ChartDataPoint {
	if days <= 0 {
		days = 30
	}
	byDate := make(map[string]float64, len(points))
	for _, p := range points {
		byDate[p.Date] = p.Value
	}
	now := time.Now()
	day0 := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	out := make([]ChartDataPoint, 0, days)
	for i := days - 1; i >= 0; i-- {
		d := day0.AddDate(0, 0, -i).Format("2006-01-02")
		out = append(out, ChartDataPoint{Date: d, Value: byDate[d]})
	}
	return out
}

// dashboardService 汇总看板所需的业务库表统计 —— 把直连 DB 的查询从 handler
// 收进 service 层 (handler 不再持有 *gorm.DB), 与其他模块的分层保持一致。
type dashboardService struct {
	db *gorm.DB

	// 看板缓存: 每次加载要跑十多条串行 COUNT/SUM, 30s 内多次打开/刷新复用同一份。
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

	// 用户统计 —— 一律排除 admin/super_admin(与 internal/user/metrics.go 注册量同口径)。
	// 历史 bug:此处不排除管理员 → 看板「今日新增/总用户」比用户管理页多算种子超管等管理员账号,
	// 两处数字对不上(2026-07 用户反馈);统一加 role 过滤后彻底对齐。
	const notAdmin = "role NOT IN ('admin','super_admin')"
	s.db.Table("users").Where(notAdmin).Count(&stats.TotalUsers)
	// 全部半开区间 [start, tomorrowStart):缺上界时,异常的未来时间戳会把窗口统计虚增。
	s.db.Table("users").Where(notAdmin).Where("created_at >= ? AND created_at < ?", todayStart, tomorrowStart).Count(&stats.NewUsersToday)
	s.db.Table("users").Where(notAdmin).Where("created_at >= ? AND created_at < ?", start7d, tomorrowStart).Count(&stats.NewUsers7d)
	s.db.Table("users").Where(notAdmin).Where("created_at >= ? AND created_at < ?", start30d, tomorrowStart).Count(&stats.NewUsers30d)

	// 付费用户 —— 真值在 users.vip_tier / vip_expires_at(与 vip.effectiveTier 同口径:
	// 付费档 + 未过期;expires NULL = 永久)。加 role 过滤,防管理员被算进付费用户。
	s.db.Table("users").
		Where(notAdmin).
		Where("vip_tier IN ('pro','max') AND (vip_expires_at IS NULL OR vip_expires_at > ?)", now).
		Count(&stats.PaidUsers)
	stats.FreeUsers = stats.TotalUsers - stats.PaidUsers
	if stats.FreeUsers < 0 {
		stats.FreeUsers = 0
	}

	// 收入统计(orders: vip 充值/订阅,status=paid,金额「元」)
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
		Where("status = ? AND payment_time >= ? AND payment_time < ?", "paid", start7d, tomorrowStart).
		Scan(&stats.Revenue7d)

	s.db.Table("orders").
		Select("COALESCE(SUM(final_amount), 0)").
		Where("status = ? AND payment_time >= ? AND payment_time < ?", "paid", start30d, tomorrowStart).
		Scan(&stats.Revenue30d)

	// 订单统计
	s.db.Table("orders").Count(&stats.TotalOrders)
	s.db.Table("orders").Where("status = ?", "paid").Count(&stats.PaidOrders)
	s.db.Table("orders").Where("status = ?", "pending").Count(&stats.PendingOrders)

	// AI 成本(token 账本;与营收并排看)
	s.db.Table("llm_token_usage").
		Select("COALESCE(SUM(total_tokens), 0)").
		Where("created_at >= ? AND created_at < ?", todayStart, tomorrowStart).
		Scan(&stats.TokensToday)
	s.db.Table("llm_token_usage").
		Select("COALESCE(SUM(total_tokens), 0)").
		Where("created_at >= ? AND created_at < ?", start30d, tomorrowStart).
		Scan(&stats.Tokens30d)

	// 兑换码
	s.db.Table("vip_redemption_codes").Count(&stats.TotalCodes)
	s.db.Table("vip_code_redemptions").Count(&stats.RedeemedCodes)

	// 趋势图表数据
	stats.UserGrowthChart = s.getUserGrowthChart(30)
	stats.RevenueTrendChart = s.getRevenueTrendChart(30)
	stats.TokenTrendChart = s.getTokenTrendChart(30)

	return stats
}

// getUserGrowthChart 获取用户增长趋势图表数据。
// 排除 admin/super_admin + 零点对齐窗口(since = 今天往前 days-1 天的零点),与
// internal/user/metrics.go 注册量图完全同口径,保证看板与用户管理页首桶/今日值都对得上。
func (s *dashboardService) getUserGrowthChart(days int) []ChartDataPoint {
	var results []struct {
		Date  string
		Count int64
	}

	now := time.Now()
	day0 := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	since := day0.AddDate(0, 0, -(days - 1))
	s.db.Table("users").
		Select("DATE_FORMAT(created_at, '%Y-%m-%d') as date, COUNT(*) as count").
		Where("role NOT IN ('admin','super_admin')").
		Where("created_at >= ?", since).
		Group("DATE_FORMAT(created_at, '%Y-%m-%d')").
		Order("date ASC").
		Scan(&results)

	chart := make([]ChartDataPoint, 0, len(results))
	for _, r := range results {
		chart = append(chart, ChartDataPoint{
			Date:  r.Date,
			Value: float64(r.Count),
		})
	}

	return fillChartDays(chart, days)
}

// getRevenueTrendChart 获取收入趋势图表数据
func (s *dashboardService) getRevenueTrendChart(days int) []ChartDataPoint {
	var results []struct {
		Date   string
		Amount float64
	}

	s.db.Table("orders").
		Select("DATE_FORMAT(payment_time, '%Y-%m-%d') as date, COALESCE(SUM(final_amount), 0) as amount").
		Where("status = ? AND payment_time >= ?", "paid", time.Now().AddDate(0, 0, -days)).
		Group("DATE_FORMAT(payment_time, '%Y-%m-%d')").
		Order("date ASC").
		Scan(&results)

	chart := make([]ChartDataPoint, 0, len(results))
	for _, r := range results {
		chart = append(chart, ChartDataPoint{
			Date:  r.Date,
			Value: r.Amount,
		})
	}

	return fillChartDays(chart, days)
}

// getTokenTrendChart AI token 成本趋势(每日总 token)。与营收趋势并排 = 粗粒度毛利视角。
// 用 DATE_FORMAT 而非 DATE():DSN 开 parseTime 时 DATE() 会被扫成带时区 time(llmusage 同款坑)。
func (s *dashboardService) getTokenTrendChart(days int) []ChartDataPoint {
	var results []struct {
		Date   string
		Tokens int64
	}

	s.db.Table("llm_token_usage").
		Select("DATE_FORMAT(created_at, '%Y-%m-%d') as date, COALESCE(SUM(total_tokens), 0) as tokens").
		Where("created_at >= ?", time.Now().AddDate(0, 0, -days)).
		Group("DATE_FORMAT(created_at, '%Y-%m-%d')").
		Order("date ASC").
		Scan(&results)

	chart := make([]ChartDataPoint, 0, len(results))
	for _, r := range results {
		chart = append(chart, ChartDataPoint{
			Date:  r.Date,
			Value: float64(r.Tokens),
		})
	}

	return fillChartDays(chart, days)
}
