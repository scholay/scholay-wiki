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
	Granularity    string          `json:"granularity"` // day / week / month (registrations 维度)
	Days           int             `json:"days"`        // registrations 查询窗口
	Registrations  []MetricsPoint  `json:"registrations"`
	Sources        []CategoryCount `json:"sources"`
	HourlyActivity []HourlyPoint   `json:"hourly_activity"`
	MAUTrend       []MetricsPoint  `json:"mau_trend"`     // 最近 12 个月
	DailyActive    []MetricsPoint  `json:"daily_active"`  // 每日活跃(去重)用户数,按天 —— 见下注释口径
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
		DailyActive:    []MetricsPoint{},
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
	// 每个月格子 = 该月最后一天往前 30 天内的活跃(去重)用户数(滚动 MAU 在各月末的快照)。
	//
	// 数据源改用 usage_events(append-only,每个被埋点功能动作一行)而**非** users.last_active_at:
	// 后者是**单列覆盖**,只保留每个用户「最后一次」活跃时间 → 历史月份会**系统性少算**(老用户的
	// last_active 早被刷新成近期,不再落进过去月份的 30 天窗口,只有当前月准确)。usage_events 才能
	// 按任意历史窗口 COUNT(DISTINCT user_id) 还原真实 MAU。口径与 daily_active 一致(engaged:窗口内
	// 有功能动作的用户;纯登录不发事件)。JOIN users 排除 admin/super_admin(与其它指标同口径)。
	// 注:usage_events 留存 365 天,最旧 1~2 个月的 30 天窗口可能触达留存边界而略偏低 —— 可接受,
	// 远好于旧实现的系统性衰减。当前月窗口用「今天往前 30 天」,与首页 KPI 对齐。
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
			SELECT COUNT(DISTINCT ue.user_id)
			FROM usage_events ue
			JOIN users u ON u.id = ue.user_id
			WHERE ue.created_at >= ? AND ue.created_at <= ?
			  AND u.role NOT IN ('admin','super_admin')
		`, windowStart, windowEnd).Scan(&count)
		out.MAUTrend = append(out.MAUTrend, MetricsPoint{
			Date:  anchor.Format("2006-01"),
			Value: count,
		})
	}

	// --- 5. daily_active 每日活跃用户折线 ---
	// 口径:当天**执行过被埋点功能动作**的去重用户数(usage_events 按天 COUNT(DISTINCT user_id))。
	// 这是唯一能产出**真实历史每日序列**的源 —— last_active_at 是单列覆盖、无法重建历史每天;
	// 而 usage_events 是 append-only 每动作一行,按天去重才准。语义=engaged-DAU(登录但啥也没干的不计,
	// 这正是「活跃」最实在的定义),非纯登录 DAU(登录动作本身不发事件)。用 DATE_FORMAT 不用 DATE()。
	// JOIN users 排除 admin/super_admin(与 registrations/hourly/mau_trend 同口径);join 隐含 user_id 非空。
	// 缺失日补 0 + 今日虚线进行中由前端 buildDailyTrend 处理(同 registrations 的渲染口径)。
	var daRows []struct {
		Bucket string
		Total  int64
	}
	db.Raw(`
		SELECT DATE_FORMAT(ue.created_at, '%Y-%m-%d') AS bucket, COUNT(DISTINCT ue.user_id) AS total
		FROM usage_events ue
		JOIN users u ON u.id = ue.user_id
		WHERE ue.created_at >= ?
		  AND u.role NOT IN ('admin','super_admin')
		GROUP BY bucket
		ORDER BY bucket ASC
	`, since).Scan(&daRows)
	for _, r := range daRows {
		out.DailyActive = append(out.DailyActive, MetricsPoint{Date: r.Bucket, Value: r.Total})
	}

	return out, nil
}
