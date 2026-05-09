// Package admin — Dashboard 进阶洞察:DAU/WAU/MAU + 付费转化漏斗
package admin

import (
	"strconv"
	"time"

	"scholar-backend/internal/common/database"
	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

// ActivePoint 活跃用户折线点
type ActivePoint struct {
	Date  string `json:"date"`
	Value int64  `json:"value"`
}

// ActiveUserInsights DAU/WAU/MAU 折线数据
type ActiveUserInsights struct {
	Granularity string        `json:"granularity"` // day / week / month
	Days        int           `json:"days"`        // 查询天数
	Series      []ActivePoint `json:"series"`
	// 当前快照
	DAUNow int64 `json:"dau_now"` // 今日活跃
	WAUNow int64 `json:"wau_now"` // 7 日活跃
	MAUNow int64 `json:"mau_now"` // 30 日活跃
}

// GetActiveUserInsights GET /api/v1/admin/dashboard/active-users?days=30&granularity=day
//
// 数据源:user_sessions.last_activity (用 DISTINCT user_id 聚合)
func GetActiveUserInsights(c *gin.Context) {
	days, _ := strconv.Atoi(c.DefaultQuery("days", "30"))
	if days < 7 {
		days = 7
	}
	if days > 180 {
		days = 180
	}
	granularity := c.DefaultQuery("granularity", "day")
	if granularity != "day" && granularity != "week" && granularity != "month" {
		granularity = "day"
	}

	now := time.Now()
	out := ActiveUserInsights{
		Granularity: granularity,
		Days:        days,
		Series:      []ActivePoint{},
	}

	// 当前快照
	database.GetDB().Raw(`
		SELECT COUNT(DISTINCT user_id) FROM user_sessions
		WHERE last_activity >= ?`, now.Add(-24*time.Hour)).Scan(&out.DAUNow)
	database.GetDB().Raw(`
		SELECT COUNT(DISTINCT user_id) FROM user_sessions
		WHERE last_activity >= ?`, now.Add(-7*24*time.Hour)).Scan(&out.WAUNow)
	database.GetDB().Raw(`
		SELECT COUNT(DISTINCT user_id) FROM user_sessions
		WHERE last_activity >= ?`, now.Add(-30*24*time.Hour)).Scan(&out.MAUNow)

	// 折线 — 按 granularity 分桶,DISTINCT user_id 在该桶内的不重复 user 数
	// MySQL 没有 date_trunc,用 DATE_FORMAT 实现
	var fmtExpr string
	switch granularity {
	case "week":
		fmtExpr = "DATE_FORMAT(last_activity, '%x-W%v')" // ISO 周
	case "month":
		fmtExpr = "DATE_FORMAT(last_activity, '%Y-%m')"
	default:
		fmtExpr = "DATE_FORMAT(last_activity, '%Y-%m-%d')"
	}

	startTime := now.AddDate(0, 0, -days)

	type row struct {
		Bucket string
		Total  int64
	}
	var rows []row
	database.GetDB().Raw(`
		SELECT `+fmtExpr+` AS bucket, COUNT(DISTINCT user_id) AS total
		FROM user_sessions
		WHERE last_activity >= ?
		GROUP BY bucket
		ORDER BY bucket ASC
	`, startTime).Scan(&rows)
	for _, r := range rows {
		out.Series = append(out.Series, ActivePoint{Date: r.Bucket, Value: r.Total})
	}

	utils.Success(c, out)
}

// FunnelStep 漏斗一步
type FunnelStep struct {
	Stage string  `json:"stage"`
	Count int64   `json:"count"`
	Rate  float64 `json:"rate"` // vs 上一步的转化率,首步 = 1
}

// PaymentFunnel 付费转化漏斗
type PaymentFunnel struct {
	WindowDays int          `json:"window_days"`
	Steps      []FunnelStep `json:"steps"`
}

// GetPaymentFunnel GET /api/v1/admin/dashboard/payment-funnel?days=30
//
// 漏斗:
//   1. 注册        users count
//   2. 激活/活跃    user_sessions 至少出现一次
//   3. 下过订单    orders 表至少 1 条
//   4. 支付成功    orders.status = 'paid' 至少 1 条
func GetPaymentFunnel(c *gin.Context) {
	days, _ := strconv.Atoi(c.DefaultQuery("days", "30"))
	if days < 1 {
		days = 30
	}
	if days > 365 {
		days = 365
	}
	since := time.Now().AddDate(0, 0, -days)

	out := PaymentFunnel{WindowDays: days}
	db := database.GetDB()

	var registered int64
	db.Raw("SELECT COUNT(*) FROM users WHERE created_at >= ? AND role NOT IN ('admin','super_admin')", since).Scan(&registered)

	var activated int64
	db.Raw(`
		SELECT COUNT(DISTINCT u.id) FROM users u
		JOIN user_sessions s ON s.user_id = u.id
		WHERE u.created_at >= ?
		  AND u.role NOT IN ('admin','super_admin')
	`, since).Scan(&activated)

	var ordered int64
	db.Raw(`
		SELECT COUNT(DISTINCT o.user_id) FROM orders o
		JOIN users u ON u.id = o.user_id
		WHERE u.created_at >= ?
		  AND u.role NOT IN ('admin','super_admin')
	`, since).Scan(&ordered)

	var paid int64
	db.Raw(`
		SELECT COUNT(DISTINCT o.user_id) FROM orders o
		JOIN users u ON u.id = o.user_id
		WHERE u.created_at >= ?
		  AND o.status = 'paid'
		  AND u.role NOT IN ('admin','super_admin')
	`, since).Scan(&paid)

	steps := []FunnelStep{
		{Stage: "注册", Count: registered, Rate: 1},
		{Stage: "活跃", Count: activated, Rate: rate(activated, registered)},
		{Stage: "下单", Count: ordered, Rate: rate(ordered, activated)},
		{Stage: "支付", Count: paid, Rate: rate(paid, ordered)},
	}
	out.Steps = steps

	utils.Success(c, out)
}

func rate(curr, prev int64) float64 {
	if prev == 0 {
		return 0
	}
	return float64(curr) / float64(prev)
}
