// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package usagelog

import (
	"time"

	"gorm.io/gorm"
)

// Repository 数据访问层
type Repository struct {
	db *gorm.DB
}

// NewRepository 创建Repository
func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

// Create 创建日志记录
func (r *Repository) Create(log *UsageLog) error {
	return r.db.Create(log).Error
}

// List 分页查询日志
func (r *Repository) List(query *ListQuery) ([]UsageLogWithUser, int64, error) {
	var logs []UsageLogWithUser
	var total int64

	db := r.db.Table("usage_logs").
		Select("usage_logs.*, users.username, users.email").
		Joins("LEFT JOIN users ON usage_logs.user_id = users.id")

	// 应用过滤条件
	if query.FeatureCode != "" {
		db = db.Where("usage_logs.feature_code = ?", query.FeatureCode)
	}
	if query.Action != "" {
		db = db.Where("usage_logs.action = ?", query.Action)
	}
	if query.EntryPoint != "" {
		db = db.Where("usage_logs.entry_point = ?", query.EntryPoint)
	}
	if query.UserID != nil {
		db = db.Where("usage_logs.user_id = ?", *query.UserID)
	}
	if query.IPAddress != "" {
		db = db.Where("usage_logs.ip_address LIKE ?", "%"+query.IPAddress+"%")
	}
	if query.StartDate != "" {
		db = db.Where("usage_logs.created_at >= ?", query.StartDate+" 00:00:00")
	}
	if query.EndDate != "" {
		db = db.Where("usage_logs.created_at <= ?", query.EndDate+" 23:59:59")
	}
	if query.Keyword != "" {
		db = db.Where("(usage_logs.feature_name LIKE ? OR usage_logs.request_path LIKE ? OR usage_logs.referer_path LIKE ? OR users.username LIKE ?)",
			"%"+query.Keyword+"%", "%"+query.Keyword+"%", "%"+query.Keyword+"%", "%"+query.Keyword+"%")
	}

	// 统计总数
	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	// 分页查询
	offset := (query.Page - 1) * query.PageSize
	if err := db.Order("usage_logs.created_at DESC").
		Offset(offset).
		Limit(query.PageSize).
		Find(&logs).Error; err != nil {
		return nil, 0, err
	}

	return logs, total, nil
}

// GetStatsSummary 获取统计摘要
func (r *Repository) GetStatsSummary(days int) (*StatsSummary, error) {
	summary := &StatsSummary{}

	// 总数
	r.db.Model(&UsageLog{}).Count(&summary.TotalCount)

	// 今日数量
	today := time.Now().Format("2006-01-02")
	r.db.Model(&UsageLog{}).
		Where("DATE(created_at) = ?", today).
		Count(&summary.TodayCount)

	// 独立用户数
	r.db.Model(&UsageLog{}).
		Where("user_id IS NOT NULL").
		Distinct("user_id").
		Count(&summary.UniqueUsers)

	// 独立会话数
	r.db.Model(&UsageLog{}).
		Where("session_id != ''").
		Distinct("session_id").
		Count(&summary.UniqueSessions)

	// 按功能统计
	r.db.Model(&UsageLog{}).
		Select("feature_code, feature_name, COUNT(*) as count").
		Group("feature_code, feature_name").
		Order("count DESC").
		Limit(20).
		Find(&summary.FeatureCounts)

	// 每日趋势
	startDate := time.Now().AddDate(0, 0, -days).Format("2006-01-02")
	r.db.Model(&UsageLog{}).
		Select("DATE(created_at) as date, COUNT(*) as count").
		Where("created_at >= ?", startDate+" 00:00:00").
		Group("DATE(created_at)").
		Order("date ASC").
		Find(&summary.DailyTrend)

	// 入口统计
	r.db.Model(&UsageLog{}).
		Select("entry_point, COUNT(*) as count").
		Where("entry_point != ''").
		Group("entry_point").
		Order("count DESC").
		Limit(10).
		Find(&summary.EntryPointStats)

	return summary, nil
}

// GetFeatureConfigs 获取功能配置列表
func (r *Repository) GetFeatureConfigs() ([]FeatureConfig, error) {
	var configs []FeatureConfig
	err := r.db.Order("sort_order ASC").Find(&configs).Error
	return configs, err
}

// GetFeatureConfigByCode 根据代码获取功能配置
func (r *Repository) GetFeatureConfigByCode(code string) (*FeatureConfig, error) {
	var config FeatureConfig
	err := r.db.Where("feature_code = ?", code).First(&config).Error
	if err != nil {
		return nil, err
	}
	return &config, nil
}

// GetDistinctActions 获取所有不同的action
func (r *Repository) GetDistinctActions() ([]string, error) {
	var actions []string
	err := r.db.Model(&UsageLog{}).
		Distinct("action").
		Pluck("action", &actions).Error
	return actions, err
}

// GetDistinctEntryPoints 获取所有不同的入口
func (r *Repository) GetDistinctEntryPoints() ([]string, error) {
	var entryPoints []string
	err := r.db.Model(&UsageLog{}).
		Where("entry_point != ''").
		Distinct("entry_point").
		Pluck("entry_point", &entryPoints).Error
	return entryPoints, err
}

// PopularPaper 热门论文记录
type PopularPaper struct {
	PaperID string `json:"paper_id"`
	Count   int64  `json:"count"`
}

// GetPopularPaperIDs 获取热门论文ID列表（基于访问统计）
// 返回最近 days 天内访问量最高的 limit 篇论文
func (r *Repository) GetPopularPaperIDs(days int, limit int) ([]PopularPaper, error) {
	var results []PopularPaper

	// 计算起始日期
	startDate := time.Now().AddDate(0, 0, -days).Format("2006-01-02")

	// 从 extra_data JSON 中提取 paper_id，并统计访问次数
	err := r.db.Model(&UsageLog{}).
		Select("JSON_UNQUOTE(JSON_EXTRACT(extra_data, '$.paper_id')) as paper_id, COUNT(*) as count").
		Where("feature_code = ?", "paper_detail").
		Where("created_at >= ?", startDate+" 00:00:00").
		Where("JSON_EXTRACT(extra_data, '$.paper_id') IS NOT NULL").
		Group("paper_id").
		Order("count DESC").
		Limit(limit).
		Find(&results).Error

	if err != nil {
		return nil, err
	}

	// 过滤掉空的 paper_id
	filtered := make([]PopularPaper, 0, len(results))
	for _, r := range results {
		if r.PaperID != "" && r.PaperID != "null" {
			filtered = append(filtered, r)
		}
	}

	return filtered, nil
}

