// Package user — admin 端"用户管理"图表数据聚合
//
// 用 GET /admin/users/metrics 一次返回:
//   - registrations:  注册量时间序列 (按天 / 周 / 月,可配 days 参数)
//   - sources:        注册来源分布 (来自 user_auth_providers,首个 provider 即注册渠道)
//   - hourly_activity:24h 活跃分布 (基于 users.last_login_at 的小时桶)
//   - mau_trend:      MAU 月度趋势 (每月「30 天内登录过」的不重复用户数)
//
// 所有数据源都在「业务库本身」(users / user_auth_providers),已不依赖 user_sessions。

package user

import (
	"time"

	"scholar-backend/internal/common/database"
)

// MetricsPoint 通用时间序列点 (折线/柱状)
type MetricsPoint struct {
	Date  string `json:"date"`  // YYYY-MM-DD / YYYY-Wxx / YYYY-MM 视 granularity
	Value int64  `json:"value"`
}

// CategoryCount 分类计数 (饼图)
type CategoryCount struct {
	Name  string `json:"name"`
	Value int64  `json:"value"`
}

// HourlyPoint 24h 分布
type HourlyPoint struct {
	Hour  int   `json:"hour"`  // 0..23
	Value int64 `json:"value"` // 该小时桶内 last_login_at 命中次数
}

// UserMetrics 总响应
type UserMetrics struct {
	Granularity     string          `json:"granularity"`      // day / week / month (registrations 维度)
	Days            int             `json:"days"`             // registrations 查询窗口
	Registrations   []MetricsPoint  `json:"registrations"`
	Sources         []CategoryCount `json:"sources"`
	HourlyActivity  []HourlyPoint   `json:"hourly_activity"`
	MAUTrend        []MetricsPoint  `json:"mau_trend"` // 最近 12 个月
}

// GetUserMetrics 聚合返回 4 维数据 —— 给 admin /users 顶部图表区。
//
// 参数:
//   days        registrations + hourly_activity 的查询窗口 (默认 30,clamp [7,365])
//   granularity registrations 的时间粒度 (day / week / month,默认 day)
func (s *Service) GetUserMetrics(days int, granularity string) (*UserMetrics, error) {
	if days < 7 {
		days = 30
	}
	if days > 365 {
		days = 365
	}
	if granularity != "day" && granularity != "week" && granularity != "month" {
		granularity = "day"
	}

	out := &UserMetrics{
		Granularity:    granularity,
		Days:           days,
		Registrations:  []MetricsPoint{},
		Sources:        []CategoryCount{},
		HourlyActivity: []HourlyPoint{},
		MAUTrend:       []MetricsPoint{},
	}

	db := database.GetDB()
	now := time.Now()
	since := now.AddDate(0, 0, -days)

	// --- 1. registrations 折线 ---
	var fmtExpr string
	switch granularity {
	case "week":
		fmtExpr = "DATE_FORMAT(created_at, '%x-W%v')"
	case "month":
		fmtExpr = "DATE_FORMAT(created_at, '%Y-%m')"
	default:
		fmtExpr = "DATE_FORMAT(created_at, '%Y-%m-%d')"
	}
	var regRows []struct {
		Bucket string
		Total  int64
	}
	db.Raw(`
		SELECT `+fmtExpr+` AS bucket, COUNT(*) AS total
		FROM users
		WHERE created_at >= ?
		  AND role NOT IN ('admin','super_admin')
		GROUP BY bucket
		ORDER BY bucket ASC
	`, since).Scan(&regRows)
	for _, r := range regRows {
		out.Registrations = append(out.Registrations, MetricsPoint{Date: r.Bucket, Value: r.Total})
	}
	// day 粒度补连续日(缺失日补 0,最后一桶恒为今天)——否则没注册的天会被折线跳过、最后一桶也不一定是今天。
	// week/month 桶口径特殊(%x-W%v / %Y-%m),不在此补;前端"今日虚线"也只对 day 生效。
	if granularity == "day" {
		byDate := make(map[string]int64, len(out.Registrations))
		for _, p := range out.Registrations {
			byDate[p.Date] = p.Value
		}
		d0 := time.Date(since.Year(), since.Month(), since.Day(), 0, 0, 0, 0, now.Location())
		today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
		filled := make([]MetricsPoint, 0)
		for d := d0; !d.After(today); d = d.AddDate(0, 0, 1) {
			ds := d.Format("2006-01-02")
			filled = append(filled, MetricsPoint{Date: ds, Value: byDate[ds]})
		}
		out.Registrations = filled
	}

	// --- 2. sources 饼图 ---
	// 每个用户取「最早绑定的 provider」作为注册来源 —— 既能识别 OAuth (wechat/github/...)
	// 也能区分 email / phone 注册;email 用户若后续绑定其他 provider,仍归 email。
	var srcRows []struct {
		Provider string
		Total    int64
	}
	db.Raw(`
		SELECT first_provider AS provider, COUNT(*) AS total FROM (
			SELECT user_id, MIN(provider) AS first_provider
			FROM user_auth_providers
			GROUP BY user_id
		) t
		JOIN users u ON u.id = t.user_id
		WHERE u.role NOT IN ('admin','super_admin')
		GROUP BY first_provider
		ORDER BY total DESC
	`).Scan(&srcRows)
	for _, r := range srcRows {
		name := r.Provider
		if name == "" {
			name = "unknown"
		}
		out.Sources = append(out.Sources, CategoryCount{Name: name, Value: r.Total})
	}

	// --- 3. hourly_activity 24h 柱状 ---
	// 基于「时间窗口 days 内最后活跃时间」的 0..23 桶 —— 反映用户活跃时段。
	// 用 COALESCE(last_active_at, last_login_at): 优先真实使用时间, 老数据(还没产生活跃记录)
	// 回落到 last_login_at, 避免迁移后指标一夜归零。不区分时区(服务时区即业务时区 UTC+8)。
	var hourRows []struct {
		Hour  int
		Total int64
	}
	db.Raw(`
		SELECT HOUR(COALESCE(last_active_at, last_login_at)) AS hour, COUNT(*) AS total
		FROM users
		WHERE COALESCE(last_active_at, last_login_at) IS NOT NULL
		  AND COALESCE(last_active_at, last_login_at) >= ?
		  AND role NOT IN ('admin','super_admin')
		GROUP BY hour
		ORDER BY hour ASC
	`, since).Scan(&hourRows)
	// 填充 0..23,缺失的桶值为 0
	hourMap := make(map[int]int64, 24)
	for _, r := range hourRows {
		hourMap[r.Hour] = r.Total
	}
	for h := 0; h < 24; h++ {
		out.HourlyActivity = append(out.HourlyActivity, HourlyPoint{Hour: h, Value: hourMap[h]})
	}

	// --- 4. mau_trend 最近 12 个月 ---
	// 每个月格子 = 该月最后一天往前 30 天内「最后活跃」不为空的用户数(MAU 看的是活跃, 非登录)。
	// 用 COALESCE(last_active_at, last_login_at): 优先真实使用时间, 老数据回落 last_login_at。
	// 当前月格子用「今天往前 30 天」,与首页 KPI 对齐。
	for i := 11; i >= 0; i-- {
		anchor := time.Date(now.Year(), now.Month()-time.Month(i), 1, 0, 0, 0, 0, now.Location())
		// 取本月最后一天 (= 次月 1 号 - 1 秒);当前月直接用 now
		var windowEnd time.Time
		if i == 0 {
			windowEnd = now
		} else {
			windowEnd = anchor.AddDate(0, 1, 0).Add(-time.Second)
		}
		windowStart := windowEnd.AddDate(0, 0, -30)
		var count int64
		db.Raw(`
			SELECT COUNT(*) FROM users
			WHERE COALESCE(last_active_at, last_login_at) IS NOT NULL
			  AND COALESCE(last_active_at, last_login_at) >= ?
			  AND COALESCE(last_active_at, last_login_at) <= ?
			  AND role NOT IN ('admin','super_admin')
		`, windowStart, windowEnd).Scan(&count)
		out.MAUTrend = append(out.MAUTrend, MetricsPoint{
			Date:  anchor.Format("2006-01"),
			Value: count,
		})
	}

	return out, nil
}
