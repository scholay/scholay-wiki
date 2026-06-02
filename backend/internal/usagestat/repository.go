// ============================================================================
// usagestat 数据仓库 —— 写一条事件 + admin 读时聚合查询。
// ============================================================================

package usagestat

import (
	"time"

	"gorm.io/gorm"
)

// Repository 使用统计数据仓库
type Repository struct {
	db *gorm.DB
}

// NewRepository 创建仓库
func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

// Create 插入一条事件
func (r *Repository) Create(ev *UsageEvent) error {
	return r.db.Create(ev).Error
}

// ---- admin 聚合查询 ----

// FeatureCount 按功能聚合结果
type FeatureCount struct {
	Feature     string `json:"feature"`
	Count       int64  `json:"count"`
	UniqueUsers int64  `json:"unique_users"` // 去重登录用户
	UniqueAnon  int64  `json:"unique_anon"`  // 去重匿名访客 (user_id 为空, 按 anon_id 去重)
}

// ActionCount 按动作聚合结果 (功能内下钻)
type ActionCount struct {
	Feature string `json:"feature"`
	Action  string `json:"action"`
	Count   int64  `json:"count"`
}

// DayCount 按日聚合结果
type DayCount struct {
	Date  string `json:"date"`
	Count int64  `json:"count"`
}

// FunnelStage 审稿漏斗某一阶段 (action) 的去重 submission 数 + 事件数
type FunnelStage struct {
	Action      string `json:"action"`
	Submissions int64  `json:"submissions"` // 去重 correlation_id (submission) 数
	Events      int64  `json:"events"`      // 该阶段事件总数
}

func cutoff(days int) time.Time {
	if days <= 0 {
		days = 30
	}
	return time.Now().AddDate(0, 0, -days)
}

// Totals 总览数字 (窗口内)
func (r *Repository) Totals(days int) (total, today, uniqueUsers, uniqueAnon int64, err error) {
	c := cutoff(days)
	base := r.db.Model(&UsageEvent{}).Where("created_at >= ?", c)

	if err = base.Session(&gorm.Session{}).Count(&total).Error; err != nil {
		return
	}
	// "今日" 直接用 time.Now() 取当天日期串比对 (DATE_FORMAT), 不在代码里做任何时区
	// 转换 —— 容器时区统一设为北京 (TZ=Asia/Shanghai), time.Now() 与 DB 时间天然同区。
	todayStr := time.Now().Format("2006-01-02")
	if err = r.db.Model(&UsageEvent{}).
		Where("DATE_FORMAT(created_at, '%Y-%m-%d') = ?", todayStr).
		Count(&today).Error; err != nil {
		return
	}
	if err = r.db.Model(&UsageEvent{}).
		Where("created_at >= ? AND user_id IS NOT NULL", c).
		Distinct("user_id").Count(&uniqueUsers).Error; err != nil {
		return
	}
	// 独立匿名访客 = 仅未登录(user_id 为空)的事件按 anon_id 去重; 登录用户即便也带
	// anon_id 也不算进匿名, 避免和 uniqueUsers 重叠。
	if err = r.db.Model(&UsageEvent{}).
		Where("created_at >= ? AND user_id IS NULL AND anon_id <> ''", c).
		Distinct("anon_id").Count(&uniqueAnon).Error; err != nil {
		return
	}
	return
}

// ByFeature 按功能聚合 (count DESC)
func (r *Repository) ByFeature(days int) ([]FeatureCount, error) {
	var out []FeatureCount
	err := r.db.Model(&UsageEvent{}).
		Select("feature, COUNT(*) AS count, " +
			"COUNT(DISTINCT user_id) AS unique_users, " +
			"COUNT(DISTINCT CASE WHEN user_id IS NULL AND anon_id <> '' THEN anon_id END) AS unique_anon").
		Where("created_at >= ?", cutoff(days)).
		Group("feature").
		Order("count DESC").
		Scan(&out).Error
	return out, err
}

// ByAction 某功能内按动作聚合 (count DESC); feature 为空则跨全部功能
func (r *Repository) ByAction(days int, feature string) ([]ActionCount, error) {
	var out []ActionCount
	q := r.db.Model(&UsageEvent{}).
		Select("feature, action, COUNT(*) AS count").
		Where("created_at >= ?", cutoff(days))
	if feature != "" {
		q = q.Where("feature = ?", feature)
	}
	err := q.Group("feature, action").Order("count DESC").Scan(&out).Error
	return out, err
}

// ByDay 按日聚合 (升序; 缺失日期由 service 补 0)
func (r *Repository) ByDay(days int) ([]DayCount, error) {
	var out []DayCount
	// 用 DATE_FORMAT 而非 DATE(): DSN 开了 parseTime, DATE() 会被驱动解析成 time.Time
	// 再塞进 string 字段, 变成带时区后缀的 "2006-01-02T00:00:00+08:00", 和 Go 侧
	// "2006-01-02" 对不上, 导致按日填充全查不中、趋势图全 0。DATE_FORMAT 返回纯字符串,
	// 格式可控 (旧 usagelog 也踩过这个坑, 见其 "DATE_FORMAT 确保格式一致" 注释)。
	err := r.db.Model(&UsageEvent{}).
		Select("DATE_FORMAT(created_at, '%Y-%m-%d') AS date, COUNT(*) AS count").
		Where("created_at >= ?", cutoff(days)).
		Group("DATE_FORMAT(created_at, '%Y-%m-%d')").
		Order("date ASC").
		Scan(&out).Error
	return out, err
}

// PeerReviewFunnel 审稿连贯性漏斗 —— 每个 action 阶段的去重 submission 数。
func (r *Repository) PeerReviewFunnel(days int) ([]FunnelStage, error) {
	var out []FunnelStage
	err := r.db.Model(&UsageEvent{}).
		Select("action, COUNT(DISTINCT correlation_id) AS submissions, COUNT(*) AS events").
		Where("feature = ? AND created_at >= ? AND correlation_id <> ''", FeaturePeerReview, cutoff(days)).
		Group("action").
		Scan(&out).Error
	return out, err
}

// ListFilter 事件列表过滤条件
type ListFilter struct {
	Days          int
	Feature       string
	Action        string
	CorrelationID string
	UserID        *uint
}

// ListEvents 分页拉原始事件 (admin 下钻)
func (r *Repository) ListEvents(f ListFilter, limit, offset int) ([]UsageEvent, int64, error) {
	q := r.db.Model(&UsageEvent{}).Where("created_at >= ?", cutoff(f.Days))
	if f.Feature != "" {
		q = q.Where("feature = ?", f.Feature)
	}
	if f.Action != "" {
		q = q.Where("action = ?", f.Action)
	}
	if f.CorrelationID != "" {
		q = q.Where("correlation_id = ?", f.CorrelationID)
	}
	if f.UserID != nil {
		q = q.Where("user_id = ?", *f.UserID)
	}

	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var items []UsageEvent
	if err := q.Order("created_at DESC").Limit(limit).Offset(offset).Find(&items).Error; err != nil {
		return nil, 0, err
	}
	return items, total, nil
}

// DeleteOlderThan 删除超过保留天数的事件 (cleanup 用), 返回删除行数。
func (r *Repository) DeleteOlderThan(retentionDays int) (int64, error) {
	if retentionDays <= 0 {
		retentionDays = RetentionDays
	}
	c := time.Now().AddDate(0, 0, -retentionDays)
	res := r.db.Where("created_at < ?", c).Delete(&UsageEvent{})
	return res.RowsAffected, res.Error
}
