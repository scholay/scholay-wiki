// ============================================================================
// admin 读侧聚合/列表查询 —— 后台 token 用量看板的数据来源。
// 全部以 llm_token_usage 为主表;用户名/账号名通过 LEFT JOIN 取(NULL 用 COALESCE 兜成空串,
// 避免 database/sql 把 NULL 扫进非指针 string 报错)。列名一律带 `llm_token_usage.` 前缀,
// 在带 join 的查询里消除歧义(created_at / user_id 在 users 表里也存在)。
// ============================================================================

package llmusage

import (
	"fmt"
	"time"

	"scholar-backend/internal/common/utils"

	"gorm.io/gorm"
)

// cutoff 回看窗口起点;days<=0 回退 30 天。直接 time.Now()(容器时区=北京, 与 DB 同区)。
//
// 用 -(days-1):窗口含今天共 days 个自然日(如 days=30 → [今天-29, 今天]),与 fillDailyGaps
// 的折线区间口径一致。否则 cutoff 多回看一天(-days = days+1 天)→ KPI/明细比折线多统计最旧一天,
// 出现「KPI 总数 ≠ 各柱之和」的对不上。
func cutoff(days int) time.Time {
	if days <= 0 {
		days = 30
	}
	// 对齐当日 0 点(2026-07-15 时区彻查):不对齐时最旧一个自然日被「当时钟点」拦腰截断 ——
	// 折线首柱系统性偏低且同日内反复刷新持续缩水,并与 admin_orders 的 0 点对齐口径对不上账。
	now := time.Now()
	day0 := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.Local)
	return day0.AddDate(0, 0, -(days - 1))
}

// applyStatsFilter 把 StatsFilter 翻成 WHERE 链(时间窗口 + 维度过滤)。
func applyStatsFilter(q *gorm.DB, f StatsFilter) *gorm.DB {
	if !f.DateFrom.IsZero() && !f.DateTo.IsZero() {
		q = q.Where("llm_token_usage.created_at BETWEEN ? AND ?", f.DateFrom, f.DateTo)
	} else {
		q = q.Where("llm_token_usage.created_at >= ?", cutoff(f.Days))
	}
	if f.Feature != "" {
		q = q.Where("llm_token_usage.feature = ?", f.Feature)
	}
	if f.Source != "" {
		q = q.Where("llm_token_usage.source = ?", f.Source)
	}
	if f.Model != "" {
		q = q.Where("llm_token_usage.model = ?", f.Model)
	}
	if f.Provider != "" {
		q = q.Where("llm_token_usage.provider = ?", f.Provider)
	}
	if f.AnonOnly {
		q = q.Where("llm_token_usage.user_id IS NULL")
	} else if len(f.UserIDs) > 0 {
		q = q.Where("llm_token_usage.user_id IN ?", f.UserIDs) // 关键词解析出的用户集合([0]=无命中→空结果)
	} else if f.UserID != nil {
		q = q.Where("llm_token_usage.user_id = ?", *f.UserID)
	}
	return q
}

// ResolveUserIDs 把「用户关键词」(ID/用户名/邮箱/手机号)解析成 user_id 集合(上限 limit)。
// 给按用户筛选 token 用量用 —— 先在 users 表查命中,再 user_id IN(...)。无命中回 nil。
func (r *Repository) ResolveUserIDs(keyword string, limit int) []uint {
	sql, args := utils.UserSearchClause(keyword, "id", "username", "email", "phone")
	if sql == "" {
		return nil
	}
	var ids []uint
	r.db.Table("users").Where(sql, args...).Limit(limit).Pluck("id", &ids)
	return ids
}

// StatsTotals 汇总 KPI(过滤窗口内一次查完)。
func (r *Repository) StatsTotals(f StatsFilter) (*Totals, error) {
	var out Totals
	q := applyStatsFilter(r.db.Model(&LLMTokenUsage{}), f)
	err := q.Select(
		"COALESCE(SUM(llm_token_usage.total_tokens),0) AS total_tokens, " +
			"COALESCE(SUM(llm_token_usage.input_tokens),0) AS input_tokens, " +
			"COALESCE(SUM(llm_token_usage.output_tokens),0) AS output_tokens, " +
			"COALESCE(SUM(llm_token_usage.cache_read_tokens),0) AS cache_read_tokens, " +
			"COALESCE(SUM(llm_token_usage.cache_creation_tokens),0) AS cache_creation_tokens, " +
			"COUNT(*) AS total_calls, " +
			"COUNT(DISTINCT llm_token_usage.user_id) AS unique_users, " +
			"COALESCE(SUM(CASE WHEN llm_token_usage.user_id IS NULL THEN 1 ELSE 0 END),0) AS anon_calls, " +
			"COALESCE(SUM(CASE WHEN llm_token_usage.user_id IS NULL THEN llm_token_usage.total_tokens ELSE 0 END),0) AS anon_tokens, " +
			"COALESCE(SUM(llm_token_usage.cost_micro_yuan),0) AS cost_micro_yuan, " +
			"COALESCE(SUM(CASE WHEN llm_token_usage.user_id IS NULL THEN llm_token_usage.cost_micro_yuan ELSE 0 END),0) AS anon_cost_micro_yuan, " +
			// 未计价行(cost=0 但有 token):历史行 / 模型当时未计价。单独统计而不是并进成本,
			// 让「0 算力点」与「没花钱」在看板上可区分(见 Totals.UnpricedCalls 注释)。
			"COALESCE(SUM(CASE WHEN llm_token_usage.cost_micro_yuan = 0 THEN 1 ELSE 0 END),0) AS unpriced_calls, " +
			"COALESCE(SUM(CASE WHEN llm_token_usage.cost_micro_yuan = 0 THEN llm_token_usage.total_tokens ELSE 0 END),0) AS unpriced_tokens",
	).Scan(&out).Error
	return &out, err
}

// StatsByDay 每日趋势(按日分桶);缺失日由 service 补 0。
// 用 DATE_FORMAT 而非 DATE():DSN 开了 parseTime, DATE() 会被解析成带时区的 time, 塞进
// string 字段后与 Go 侧 "2006-01-02" 对不上(usagestat 注释里踩过这个坑)。
func (r *Repository) StatsByDay(f StatsFilter) ([]DayPoint, error) {
	var out []DayPoint
	q := applyStatsFilter(r.db.Model(&LLMTokenUsage{}), f)
	err := q.Select(
		"DATE_FORMAT(llm_token_usage.created_at, '%Y-%m-%d') AS date, " +
			"COALESCE(SUM(llm_token_usage.total_tokens),0) AS total_tokens, " +
			"COALESCE(SUM(llm_token_usage.input_tokens),0) AS input_tokens, " +
			"COALESCE(SUM(llm_token_usage.output_tokens),0) AS output_tokens, " +
			"COALESCE(SUM(llm_token_usage.cache_read_tokens),0) AS cache_read_tokens, " +
			"COALESCE(SUM(llm_token_usage.cache_creation_tokens),0) AS cache_creation_tokens, " +
			"COALESCE(SUM(llm_token_usage.cost_micro_yuan),0) AS cost_micro_yuan, " +
			"COUNT(*) AS calls",
	).Group("DATE_FORMAT(llm_token_usage.created_at, '%Y-%m-%d')").
		Order("date ASC").
		Scan(&out).Error
	return out, err
}

// statsDimColumns 维度白名单 —— 防止 SELECT 列名注入(col 来自 handler 固定取值, 仍二次校验)。
var statsDimColumns = map[string]bool{
	"feature":  true,
	"source":   true,
	"model":    true,
	"provider": true,
}

// StatsByDimension 按某维度聚合。col 必须在白名单内, 否则返回错误。
//
// 排序口径 = 算力点(cost)优先、总 token 兜底。cost 是页面的主单位, 排序必须跟主单位一致,
// 否则「最贵的模型」排在第三行。兜底那一半不是冗余:一段全是历史未计价行的窗口里 cost 恒 0,
// 只按 cost 排会退化成 DB 返回顺序(看起来像随机), 用 token 兜底仍给出有意义的次序。
func (r *Repository) StatsByDimension(f StatsFilter, col string) ([]BreakdownItem, error) {
	if !statsDimColumns[col] {
		return nil, fmt.Errorf("llmusage: invalid breakdown dimension %q", col)
	}
	var out []BreakdownItem
	q := applyStatsFilter(r.db.Model(&LLMTokenUsage{}), f)
	err := q.Select(fmt.Sprintf(
		"llm_token_usage.%s AS dim_key, "+
			"COALESCE(SUM(llm_token_usage.total_tokens),0) AS total_tokens, "+
			"COALESCE(SUM(llm_token_usage.input_tokens),0) AS input_tokens, "+
			"COALESCE(SUM(llm_token_usage.output_tokens),0) AS output_tokens, "+
			"COALESCE(SUM(llm_token_usage.cache_read_tokens),0) AS cache_read_tokens, "+
			"COALESCE(SUM(llm_token_usage.cache_creation_tokens),0) AS cache_creation_tokens, "+
			"COALESCE(SUM(llm_token_usage.cost_micro_yuan),0) AS cost_micro_yuan, "+
			"COALESCE(SUM(CASE WHEN llm_token_usage.cost_micro_yuan = 0 THEN 1 ELSE 0 END),0) AS unpriced_calls, "+
			"COUNT(*) AS calls", col),
	).Group(fmt.Sprintf("llm_token_usage.%s", col)).
		Order("cost_micro_yuan DESC, total_tokens DESC").
		Scan(&out).Error
	return out, err
}

// StatsByDayDimension 「天 × 维度」交叉聚合(看板主图分段堆叠柱:同一天按 model/feature 分段)。
// col 必须在 statsDimColumns 白名单内。行数有界:窗口天数 × 维度取值数, admin 流量低可直查。
func (r *Repository) StatsByDayDimension(f StatsFilter, col string) ([]DayDimPoint, error) {
	if !statsDimColumns[col] {
		return nil, fmt.Errorf("llmusage: invalid day-dimension %q", col)
	}
	var out []DayDimPoint
	q := applyStatsFilter(r.db.Model(&LLMTokenUsage{}), f)
	err := q.Select(fmt.Sprintf(
		"DATE_FORMAT(llm_token_usage.created_at, '%%Y-%%m-%%d') AS date, "+
			"llm_token_usage.%s AS dim_key, "+
			"COALESCE(SUM(llm_token_usage.total_tokens),0) AS total_tokens, "+
			"COALESCE(SUM(llm_token_usage.input_tokens),0) AS input_tokens, "+
			"COALESCE(SUM(llm_token_usage.output_tokens),0) AS output_tokens, "+
			"COALESCE(SUM(llm_token_usage.cache_read_tokens),0) AS cache_read_tokens, "+
			"COALESCE(SUM(llm_token_usage.cache_creation_tokens),0) AS cache_creation_tokens, "+
			"COALESCE(SUM(llm_token_usage.cost_micro_yuan),0) AS cost_micro_yuan, "+
			"COUNT(*) AS calls", col),
	).Group(fmt.Sprintf("DATE_FORMAT(llm_token_usage.created_at, '%%Y-%%m-%%d'), llm_token_usage.%s", col)).
		Order("date ASC").
		Scan(&out).Error
	return out, err
}

// StatsTopUsers top 用户榜(算力点 DESC、总 token 兜底, LIMIT n);LEFT JOIN users 取用户名/邮箱。
// 排序口径与 StatsByDimension 一致 —— 见那里对「为什么要 token 兜底」的说明。
func (r *Repository) StatsTopUsers(f StatsFilter, limit int) ([]UserUsageItem, error) {
	if limit <= 0 {
		limit = 20
	}
	var out []UserUsageItem
	q := applyStatsFilter(
		r.db.Table("llm_token_usage").
			Joins("LEFT JOIN users ON users.id = llm_token_usage.user_id"),
		f,
	).Where("llm_token_usage.user_id IS NOT NULL") // 匿名/公众号(user_id NULL)不进"用户"榜, 其成本由 Totals.Anon* 单列
	err := q.Select(
		"llm_token_usage.user_id AS user_id, " +
			"COALESCE(users.username,'') AS username, " +
			"COALESCE(users.email,'') AS email, " +
			"COALESCE(SUM(llm_token_usage.total_tokens),0) AS total_tokens, " +
			"COALESCE(SUM(llm_token_usage.input_tokens),0) AS input_tokens, " +
			"COALESCE(SUM(llm_token_usage.output_tokens),0) AS output_tokens, " +
			"COALESCE(SUM(llm_token_usage.cache_read_tokens),0) AS cache_read_tokens, " +
			"COALESCE(SUM(llm_token_usage.cache_creation_tokens),0) AS cache_creation_tokens, " +
			"COALESCE(SUM(llm_token_usage.cost_micro_yuan),0) AS cost_micro_yuan, " +
			"COALESCE(SUM(CASE WHEN llm_token_usage.cost_micro_yuan = 0 THEN 1 ELSE 0 END),0) AS unpriced_calls, " +
			"COUNT(*) AS calls",
	).Group("llm_token_usage.user_id, users.username, users.email").
		Order("cost_micro_yuan DESC, total_tokens DESC").
		Limit(limit).
		Scan(&out).Error
	return out, err
}

// statsLogSort 排序白名单 —— sortBy → ORDER BY 片段。
// cost_micro_yuan(= 算力点)是页面主单位的排序;total_tokens 保留给「谁吃上下文最多」的运维视角。
var statsLogSort = map[string]string{
	"created_at":      "llm_token_usage.created_at DESC",
	"total_tokens":    "llm_token_usage.total_tokens DESC",
	"cost_micro_yuan": "llm_token_usage.cost_micro_yuan DESC, llm_token_usage.created_at DESC",
}

// StatsListLogs 明细调用日志(分页);LEFT JOIN users + third_party_accounts 取展示名。
// 返回 (当前页行, 过滤后总行数)。total 单独用主表 count(LEFT JOIN 不放大行数, 但单表 count 更快)。
func (r *Repository) StatsListLogs(f StatsFilter, limit, offset int, sortBy string) ([]LogEntry, int64, error) {
	order, ok := statsLogSort[sortBy]
	if !ok {
		order = statsLogSort["created_at"]
	}

	var total int64
	if err := applyStatsFilter(r.db.Model(&LLMTokenUsage{}), f).Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var items []LogEntry
	q := applyStatsFilter(
		r.db.Table("llm_token_usage").
			Joins("LEFT JOIN users ON users.id = llm_token_usage.user_id").
			Joins("LEFT JOIN third_party_accounts ON third_party_accounts.id = llm_token_usage.account_id"),
		f,
	)
	err := q.Select(
		"llm_token_usage.*, " +
			"COALESCE(users.username,'') AS username, " +
			"COALESCE(users.email,'') AS email, " +
			"COALESCE(third_party_accounts.name,'') AS account_name",
	).Order(order).Limit(limit).Offset(offset).Scan(&items).Error
	if err != nil {
		return nil, 0, err
	}
	return items, total, nil
}

// StatsFacets 给前端筛选下拉用的动态可选值(只按时间窗口取, 不叠加其它过滤, 让下拉显示全集)。
func (r *Repository) StatsFacets(days int) (*Facets, error) {
	c := cutoff(days)
	out := &Facets{Models: []string{}, Providers: []string{}, Accounts: []FacetAccount{}}

	if err := r.db.Model(&LLMTokenUsage{}).
		Where("created_at >= ? AND model <> ''", c).
		Distinct().Order("model ASC").Pluck("model", &out.Models).Error; err != nil {
		return nil, err
	}
	if err := r.db.Model(&LLMTokenUsage{}).
		Where("created_at >= ? AND provider <> ''", c).
		Distinct().Order("provider ASC").Pluck("provider", &out.Providers).Error; err != nil {
		return nil, err
	}
	if err := r.db.Table("llm_token_usage").
		Joins("JOIN third_party_accounts ON third_party_accounts.id = llm_token_usage.account_id").
		Where("llm_token_usage.created_at >= ? AND llm_token_usage.account_id IS NOT NULL", c).
		Distinct("third_party_accounts.id, third_party_accounts.name").
		Select("third_party_accounts.id AS id, third_party_accounts.name AS name").
		Order("name ASC").
		Scan(&out.Accounts).Error; err != nil {
		return nil, err
	}
	return out, nil
}

// DeleteOlderThan 删除超过保留天数的账本行(admin 手动清理用), 返回删除行数。
func (r *Repository) DeleteOlderThan(retentionDays int) (int64, error) {
	if retentionDays <= 0 {
		retentionDays = RetentionDays
	}
	c := time.Now().AddDate(0, 0, -retentionDays)
	res := r.db.Where("created_at < ?", c).Delete(&LLMTokenUsage{})
	return res.RowsAffected, res.Error
}
