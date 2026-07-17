// Package user — admin 端"用户管理"图表数据聚合
//
// 用 GET /admin/users/metrics 一次返回:
//   - registrations:  注册量时间序列 (按天 / 周 / 月,可配 days 参数)
//   - sources:        注册来源分布 (来自 user_auth_providers,首个 provider 即注册渠道)
//   - hourly_activity:24h 活跃分布 (基于 users.last_login_at 的小时桶)
//   - mau_trend:      MAU 月度趋势 (每月「30 天窗口内活跃」的不重复用户数,口径「打开即活跃」)
//   - daily_active:   每日活跃 DAU (口径「打开即活跃」,排除注册当天)
//
// 数据源都在业务库本身:registrations/sources/hourly 走 users / user_auth_providers;
// daily_active + mau_trend 走 user_daily_active 台账 (0069)。均不依赖 user_sessions。

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

	// 窗口总计(供图表标题旁展示「这个时间段的总量」):
	//   RegistrationsTotal = 窗口内新注册总数(= registrations 各桶之和,精确)。
	//   ActiveTotal        = 窗口内**去重**活跃用户数(≠ daily_active 逐日相加那种人次;
	//                        一个用户窗口内活跃多天只计一次),与 daily_active 同口径(打开即活跃 + 排除注册当天)。
	RegistrationsTotal int64 `json:"registrations_total"`
	ActiveTotal        int64 `json:"active_total"`
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
	// 对齐当日 0 点(2026-07-15 时区彻查):不对齐时最旧一个自然日桶只含「当时钟点」之后的行,
	// 折线首柱假低且同日反复查看数值漂移,与 dashboard_service 的同名图表对不上。
	day0 := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.Local)
	since := day0.AddDate(0, 0, -(days - 1))

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
	// 数据源 = user_daily_active 台账(0069,append-only,一行=某用户某本地日有过任意鉴权请求)。
	// 口径「打开即活跃」,与 daily_active 完全同源同规则(见第 5 块):RecordActivity 在每个登录后
	// 请求上落行,不再只数埋点功能(usage_events)—— 后者会漏掉所有非埋点的真实使用。台账 append-only
	// 才能按任意历史窗口 COUNT(DISTINCT user_id) 还原真实 MAU(last_active_at 单列覆盖做不到)。
	// JOIN users 排除 admin/super_admin;active_date > DATE(created_at) 排除注册当天(与 daily_active 一致)。
	// 注:台账由 usage_events 回填播种,故上线前的历史月份仍是 engaged 口径,上线后才是完整「打开即活跃」。
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
			SELECT COUNT(DISTINCT uda.user_id)
			FROM user_daily_active uda
			JOIN users u ON u.id = uda.user_id
			WHERE uda.active_date >= ? AND uda.active_date <= ?
			  AND u.role NOT IN ('admin','super_admin')
			  AND uda.active_date > DATE(u.created_at)
		`, windowStart.Format("2006-01-02"), windowEnd.Format("2006-01-02")).Scan(&count)
		out.MAUTrend = append(out.MAUTrend, MetricsPoint{
			Date:  anchor.Format("2006-01"),
			Value: count,
		})
	}

	// --- 5. daily_active 每日活跃用户折线 ---
	// 口径「打开即活跃」:当天有过**任意鉴权请求**的去重用户数(user_daily_active 台账,0069)。
	// RecordActivity 在每个登录后请求上落一行/人/本地日 —— 不再只数埋点功能(usage_events 会漏掉
	// 所有非埋点的真实使用)。台账 append-only,是唯一能产出**真实历史每日序列**的源(last_active_at
	// 单列覆盖做不到)。DATE_FORMAT 保证与 Go 侧 'YYYY-MM-DD' 桶键一致(active_date 是 DATE,本无时区坑)。
	// JOIN users 排除 admin/super_admin(与 registrations/hourly/mau_trend 同口径);join 隐含 user_id 非空。
	// active_date > DATE(u.created_at):注册当天不算当天活跃(保证活跃真实性,不影响其他天/其他用户)。
	// 缺失日补 0 + 今日虚线进行中由前端 buildDailyTrend 处理(同 registrations 的渲染口径)。
	var daRows []struct {
		Bucket string
		Total  int64
	}
	db.Raw(`
		SELECT DATE_FORMAT(uda.active_date, '%Y-%m-%d') AS bucket, COUNT(DISTINCT uda.user_id) AS total
		FROM user_daily_active uda
		JOIN users u ON u.id = uda.user_id
		WHERE uda.active_date >= ?
		  AND u.role NOT IN ('admin','super_admin')
		  AND uda.active_date > DATE(u.created_at)
		GROUP BY bucket
		ORDER BY bucket ASC
	`, since.Format("2006-01-02")).Scan(&daRows)
	for _, r := range daRows {
		out.DailyActive = append(out.DailyActive, MetricsPoint{Date: r.Bucket, Value: r.Total})
	}

	// --- 6. 窗口总计(标题旁「本区间总量」)---
	// 注册总数:窗口内新注册(排 admin),与 registrations 折线同窗同口径(= 各桶之和,这里直接 COUNT 更省事)。
	sinceDate := since.Format("2006-01-02")
	db.Raw(`
		SELECT COUNT(*)
		FROM users
		WHERE created_at >= ? AND role NOT IN ('admin','super_admin')
	`, since).Scan(&out.RegistrationsTotal)
	// 活跃总数:窗口内**去重**活跃用户(COUNT(DISTINCT user_id),非逐日相加的人次),
	// 与 daily_active 折线同口径(打开即活跃 + JOIN users 排 admin + 排除注册当天)。
	db.Raw(`
		SELECT COUNT(DISTINCT uda.user_id)
		FROM user_daily_active uda
		JOIN users u ON u.id = uda.user_id
		WHERE uda.active_date >= ?
		  AND u.role NOT IN ('admin','super_admin')
		  AND uda.active_date > DATE(u.created_at)
	`, sinceDate).Scan(&out.ActiveTotal)

	return out, nil
}
