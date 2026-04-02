// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package usagelog

import (
	"errors"
	"fmt"
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

	// 根据时间范围过滤
	if query.StartDate != "" && query.EndDate != "" {
		// 使用自定义日期范围
		startTime := query.StartDate + " 00:00:00"
		endTime := query.EndDate + " 23:59:59"
		db = db.Where("usage_logs.created_at >= ? AND usage_logs.created_at <= ?", startTime, endTime)
	} else if query.Days > 0 {
		// 使用 Days 参数过滤时间范围
		// 注意：days=1 表示"今天"，应该从今天0点开始
		// days=7 表示"近7天"，应该从6天前0点开始（包含今天共7天）
		startDate := time.Now().AddDate(0, 0, -(query.Days - 1)).Format("2006-01-02")
		db = db.Where("usage_logs.created_at >= ?", startDate+" 00:00:00")
	}

	// 应用其他过滤条件
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
	if query.Keyword != "" {
		db = db.Where("(usage_logs.feature_name LIKE ? OR usage_logs.request_path LIKE ? OR usage_logs.referer_path LIKE ? OR users.username LIKE ?)",
			"%"+query.Keyword+"%", "%"+query.Keyword+"%", "%"+query.Keyword+"%", "%"+query.Keyword+"%")
	}
	if query.DeviceType != "" {
		db = db.Where("usage_logs.device_type = ?", query.DeviceType)
	}
	if query.Browser != "" {
		db = db.Where("usage_logs.browser = ?", query.Browser)
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

// GetStatsSummary 获取统计摘要（所有统计都基于时间范围）
// featureCode 可选，用于筛选特定功能的趋势数据
func (r *Repository) GetStatsSummary(days int, featureCode string) (*StatsSummary, error) {
	summary := &StatsSummary{}

	// 计算时间范围
	// 注意：days=1 表示"今天"，应该从今天0点开始
	// days=7 表示"近7天"，应该从6天前0点开始（包含今天共7天）
	startDate := time.Now().AddDate(0, 0, -(days - 1)).Format("2006-01-02")
	startTime := startDate + " 00:00:00"
	today := time.Now().Format("2006-01-02")

	// 时间范围内的总数
	r.db.Model(&UsageLog{}).
		Where("created_at >= ?", startTime).
		Count(&summary.TotalCount)

	// 今日数量
	r.db.Model(&UsageLog{}).
		Where("DATE(created_at) = ?", today).
		Count(&summary.TodayCount)

	// 时间范围内的独立用户数
	r.db.Model(&UsageLog{}).
		Where("created_at >= ?", startTime).
		Where("user_id IS NOT NULL").
		Distinct("user_id").
		Count(&summary.UniqueUsers)

	// 时间范围内的独立会话数
	r.db.Model(&UsageLog{}).
		Where("created_at >= ?", startTime).
		Where("session_id != ''").
		Distinct("session_id").
		Count(&summary.UniqueSessions)

	// 时间范围内按功能统计（不限制数量，返回所有功能）
	r.db.Model(&UsageLog{}).
		Select("feature_code, feature_name, COUNT(*) as count").
		Where("created_at >= ?", startTime).
		Group("feature_code, feature_name").
		Order("count DESC").
		Find(&summary.FeatureCounts)

	// 每日趋势（原始数据，保持兼容）
	r.db.Model(&UsageLog{}).
		Select("DATE(created_at) as date, COUNT(*) as count").
		Where("created_at >= ?", startTime).
		Group("DATE(created_at)").
		Order("date ASC").
		Find(&summary.DailyTrend)

	// 生成填充后的趋势数据（支持按功能筛选）
	if days == 1 {
		// 今天：按小时统计
		summary.TrendGranularity = "hour"
		summary.TrendData = r.getHourlyTrendDataWithFilter(today, featureCode)
	} else {
		// 其他：按天统计，填充所有日期
		summary.TrendGranularity = "day"
		summary.TrendData = r.getDailyTrendDataFilledWithFilter(days, featureCode)
	}

	// 时间范围内的入口统计
	r.db.Model(&UsageLog{}).
		Select("entry_point, COUNT(*) as count").
		Where("created_at >= ?", startTime).
		Where("entry_point != ''").
		Group("entry_point").
		Order("count DESC").
		Limit(10).
		Find(&summary.EntryPointStats)

	return summary, nil
}

// GetStatsSummaryByDateRange 根据自定义日期范围获取统计摘要
// featureCode 可选，用于筛选特定功能的趋势数据
func (r *Repository) GetStatsSummaryByDateRange(startDate, endDate string, featureCode string) (*StatsSummary, error) {
	summary := &StatsSummary{}

	// 构建时间范围
	startTime := startDate + " 00:00:00"
	endTime := endDate + " 23:59:59"
	today := time.Now().Format("2006-01-02")

	// 时间范围内的总数
	r.db.Model(&UsageLog{}).
		Where("created_at >= ? AND created_at <= ?", startTime, endTime).
		Count(&summary.TotalCount)

	// 今日数量（始终显示今日数据）
	r.db.Model(&UsageLog{}).
		Where("DATE(created_at) = ?", today).
		Count(&summary.TodayCount)

	// 时间范围内的独立用户数
	r.db.Model(&UsageLog{}).
		Where("created_at >= ? AND created_at <= ?", startTime, endTime).
		Where("user_id IS NOT NULL").
		Distinct("user_id").
		Count(&summary.UniqueUsers)

	// 时间范围内的独立会话数
	r.db.Model(&UsageLog{}).
		Where("created_at >= ? AND created_at <= ?", startTime, endTime).
		Where("session_id != ''").
		Distinct("session_id").
		Count(&summary.UniqueSessions)

	// 时间范围内按功能统计（不限制数量，返回所有功能）
	r.db.Model(&UsageLog{}).
		Select("feature_code, feature_name, COUNT(*) as count").
		Where("created_at >= ? AND created_at <= ?", startTime, endTime).
		Group("feature_code, feature_name").
		Order("count DESC").
		Find(&summary.FeatureCounts)

	// 每日趋势（原始数据）
	r.db.Model(&UsageLog{}).
		Select("DATE(created_at) as date, COUNT(*) as count").
		Where("created_at >= ? AND created_at <= ?", startTime, endTime).
		Group("DATE(created_at)").
		Order("date ASC").
		Find(&summary.DailyTrend)

	// 生成填充后的趋势数据（自定义日期范围，支持按功能筛选）
	summary.TrendGranularity = "day"
	summary.TrendData = r.getCustomDateRangeTrendDataWithFilter(startDate, endDate, featureCode)

	// 时间范围内的入口统计
	r.db.Model(&UsageLog{}).
		Select("entry_point, COUNT(*) as count").
		Where("created_at >= ? AND created_at <= ?", startTime, endTime).
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

// GetDistinctDeviceTypes 获取所有不同的设备类型
func (r *Repository) GetDistinctDeviceTypes() ([]string, error) {
	var deviceTypes []string
	err := r.db.Model(&UsageLog{}).
		Where("device_type != ''").
		Distinct("device_type").
		Pluck("device_type", &deviceTypes).Error
	return deviceTypes, err
}

// GetDistinctBrowsers 获取所有不同的浏览器
func (r *Repository) GetDistinctBrowsers() ([]string, error) {
	var browsers []string
	err := r.db.Model(&UsageLog{}).
		Where("browser != ''").
		Distinct("browser").
		Pluck("browser", &browsers).Error
	return browsers, err
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

// GetConfig 获取使用统计配置
func (r *Repository) GetConfig() (*UsageLogConfig, error) {
	var config UsageLogConfig
	err := r.db.First(&config).Error
	if err != nil {
		// 如果不存在，返回默认配置
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return &UsageLogConfig{
				ID:            1,
				RetentionDays: 180, // 默认180天
			}, nil
		}
		return nil, err
	}
	return &config, nil
}

// UpdateConfig 更新使用统计配置
func (r *Repository) UpdateConfig(config *UsageLogConfig) error {
	// 使用 upsert 逻辑：如果存在则更新，不存在则创建
	result := r.db.Model(&UsageLogConfig{}).
		Where("id = ?", 1).
		Updates(map[string]any{
			"retention_days": config.RetentionDays,
			"updated_at":     time.Now(),
		})

	if result.RowsAffected == 0 {
		// 不存在则创建
		config.ID = 1
		return r.db.Create(config).Error
	}

	return result.Error
}

// DeleteOldLogsBatch 分批删除旧日志
// 返回删除的数量和是否还有更多数据需要删除
func (r *Repository) DeleteOldLogsBatch(olderThan time.Time, batchSize int) (int64, bool, error) {
	// 使用 LIMIT 分批删除，避免长时间锁表
	result := r.db.Exec(`
		DELETE FROM usage_logs 
		WHERE created_at < ? 
		ORDER BY created_at ASC 
		LIMIT ?
	`, olderThan, batchSize)

	if result.Error != nil {
		return 0, false, result.Error
	}

	// 如果删除的数量等于 batchSize，说明可能还有更多数据需要删除
	hasMore := result.RowsAffected >= int64(batchSize)

	return result.RowsAffected, hasMore, nil
}

// CountOldLogs 统计过期日志数量
func (r *Repository) CountOldLogs(olderThan time.Time) (int64, error) {
	var count int64
	err := r.db.Model(&UsageLog{}).
		Where("created_at < ?", olderThan).
		Count(&count).Error
	return count, err
}

// DeleteAllLogs 清空所有日志
func (r *Repository) DeleteAllLogs() (int64, error) {
	result := r.db.Exec("TRUNCATE TABLE usage_logs")
	return result.RowsAffected, result.Error
}

// CountAllLogs 统计所有日志数量
func (r *Repository) CountAllLogs() (int64, error) {
	var count int64
	err := r.db.Model(&UsageLog{}).Count(&count).Error
	return count, err
}

// getHourlyTrendData 获取今天的小时趋势数据（0-23点，填充空缺）
func (r *Repository) getHourlyTrendData(today string) []TrendPoint {
	// 查询今天按小时的统计
	type HourCount struct {
		Hour  int   `gorm:"column:hour"`
		Count int64 `gorm:"column:count"`
	}
	var hourCounts []HourCount
	
	// 使用时间范围查询，避免 DATE() 函数的格式问题
	startTime := today + " 00:00:00"
	endTime := today + " 23:59:59"
	r.db.Model(&UsageLog{}).
		Select("HOUR(created_at) as hour, COUNT(*) as count").
		Where("created_at >= ? AND created_at <= ?", startTime, endTime).
		Group("hour").
		Order("hour ASC").
		Find(&hourCounts)

	// 创建小时到计数的映射
	hourMap := make(map[int]int64)
	for _, hc := range hourCounts {
		hourMap[hc.Hour] = hc.Count
	}

	// 获取当前小时
	currentHour := time.Now().Hour()

	// 生成0点到当前小时的数据（填充空缺为0）
	result := make([]TrendPoint, 0, currentHour+1)
	for h := 0; h <= currentHour; h++ {
		count := hourMap[h]
		result = append(result, TrendPoint{
			Label: fmt.Sprintf("%02d:00", h),
			Value: fmt.Sprintf("%02d", h),
			Count: count,
		})
	}

	return result
}

// getDailyTrendDataFilled 获取按天的趋势数据（填充所有日期）
func (r *Repository) getDailyTrendDataFilled(days int) []TrendPoint {
	// 计算开始日期（包含今天共 days 天）
	now := time.Now()
	startDateVal := now.AddDate(0, 0, -(days - 1))

	// 查询日期范围内的每日统计（使用 DATE_FORMAT 确保格式一致）
	type DateCount struct {
		DateStr string `gorm:"column:date_str"`
		Count   int64  `gorm:"column:count"`
	}
	var dateCounts []DateCount
	startTime := startDateVal.Format("2006-01-02") + " 00:00:00"
	r.db.Model(&UsageLog{}).
		Select("DATE_FORMAT(created_at, '%Y-%m-%d') as date_str, COUNT(*) as count").
		Where("created_at >= ?", startTime).
		Group("date_str").
		Order("date_str ASC").
		Find(&dateCounts)

	// 创建日期到计数的映射
	dateMap := make(map[string]int64)
	for _, dc := range dateCounts {
		dateMap[dc.DateStr] = dc.Count
	}

	// 生成从开始日期到今天的所有日期（填充空缺为0）
	result := make([]TrendPoint, 0, days)
	for d := startDateVal; !d.After(now); d = d.AddDate(0, 0, 1) {
		dateStr := d.Format("2006-01-02")
		count := dateMap[dateStr]
		
		// 标签格式：月/日
		label := fmt.Sprintf("%d/%d", d.Month(), d.Day())
		
		result = append(result, TrendPoint{
			Label: label,
			Value: dateStr,
			Count: count,
		})
	}

	return result
}

// getHourlyTrendDataWithFilter 获取今天的小时趋势数据（支持按功能筛选）
func (r *Repository) getHourlyTrendDataWithFilter(today string, featureCode string) []TrendPoint {
	type HourCount struct {
		Hour  int   `gorm:"column:hour"`
		Count int64 `gorm:"column:count"`
	}
	var hourCounts []HourCount
	
	startTime := today + " 00:00:00"
	endTime := today + " 23:59:59"
	
	db := r.db.Model(&UsageLog{}).
		Select("HOUR(created_at) as hour, COUNT(*) as count").
		Where("created_at >= ? AND created_at <= ?", startTime, endTime)
	
	// 如果指定了功能筛选
	if featureCode != "" {
		db = db.Where("feature_code = ?", featureCode)
	}
	
	db.Group("hour").Order("hour ASC").Find(&hourCounts)

	hourMap := make(map[int]int64)
	for _, hc := range hourCounts {
		hourMap[hc.Hour] = hc.Count
	}

	currentHour := time.Now().Hour()
	result := make([]TrendPoint, 0, currentHour+1)
	for h := 0; h <= currentHour; h++ {
		count := hourMap[h]
		result = append(result, TrendPoint{
			Label: fmt.Sprintf("%02d:00", h),
			Value: fmt.Sprintf("%02d", h),
			Count: count,
		})
	}

	return result
}

// getDailyTrendDataFilledWithFilter 获取按天的趋势数据（支持按功能筛选）
func (r *Repository) getDailyTrendDataFilledWithFilter(days int, featureCode string) []TrendPoint {
	now := time.Now()
	startDateVal := now.AddDate(0, 0, -(days - 1))

	type DateCount struct {
		DateStr string `gorm:"column:date_str"`
		Count   int64  `gorm:"column:count"`
	}
	var dateCounts []DateCount
	startTime := startDateVal.Format("2006-01-02") + " 00:00:00"
	
	db := r.db.Model(&UsageLog{}).
		Select("DATE_FORMAT(created_at, '%Y-%m-%d') as date_str, COUNT(*) as count").
		Where("created_at >= ?", startTime)
	
	// 如果指定了功能筛选
	if featureCode != "" {
		db = db.Where("feature_code = ?", featureCode)
	}
	
	db.Group("date_str").Order("date_str ASC").Find(&dateCounts)

	dateMap := make(map[string]int64)
	for _, dc := range dateCounts {
		dateMap[dc.DateStr] = dc.Count
	}

	result := make([]TrendPoint, 0, days)
	for d := startDateVal; !d.After(now); d = d.AddDate(0, 0, 1) {
		dateStr := d.Format("2006-01-02")
		count := dateMap[dateStr]
		label := fmt.Sprintf("%d/%d", d.Month(), d.Day())
		
		result = append(result, TrendPoint{
			Label: label,
			Value: dateStr,
			Count: count,
		})
	}

	return result
}

// getCustomDateRangeTrendDataWithFilter 获取自定义日期范围的趋势数据（支持按功能筛选）
func (r *Repository) getCustomDateRangeTrendDataWithFilter(startDateStr, endDateStr string, featureCode string) []TrendPoint {
	startDateVal, err := time.Parse("2006-01-02", startDateStr)
	if err != nil {
		return nil
	}
	endDateVal, err := time.Parse("2006-01-02", endDateStr)
	if err != nil {
		return nil
	}

	type DateCount struct {
		DateStr string `gorm:"column:date_str"`
		Count   int64  `gorm:"column:count"`
	}
	var dateCounts []DateCount
	startTime := startDateStr + " 00:00:00"
	endTime := endDateStr + " 23:59:59"
	
	db := r.db.Model(&UsageLog{}).
		Select("DATE_FORMAT(created_at, '%Y-%m-%d') as date_str, COUNT(*) as count").
		Where("created_at >= ? AND created_at <= ?", startTime, endTime)
	
	// 如果指定了功能筛选
	if featureCode != "" {
		db = db.Where("feature_code = ?", featureCode)
	}
	
	db.Group("date_str").Order("date_str ASC").Find(&dateCounts)

	dateMap := make(map[string]int64)
	for _, dc := range dateCounts {
		dateMap[dc.DateStr] = dc.Count
	}

	days := int(endDateVal.Sub(startDateVal).Hours()/24) + 1
	result := make([]TrendPoint, 0, days)
	for d := startDateVal; !d.After(endDateVal); d = d.AddDate(0, 0, 1) {
		dateStr := d.Format("2006-01-02")
		count := dateMap[dateStr]
		label := fmt.Sprintf("%d/%d", d.Month(), d.Day())
		
		result = append(result, TrendPoint{
			Label: label,
			Value: dateStr,
			Count: count,
		})
	}

	return result
}

// getCustomDateRangeTrendData 获取自定义日期范围的趋势数据（填充所有日期）
func (r *Repository) getCustomDateRangeTrendData(startDateStr, endDateStr string) []TrendPoint {
	// 解析日期
	startDateVal, err := time.Parse("2006-01-02", startDateStr)
	if err != nil {
		return nil
	}
	endDateVal, err := time.Parse("2006-01-02", endDateStr)
	if err != nil {
		return nil
	}

	// 查询日期范围内的每日统计（使用 DATE_FORMAT 确保格式一致）
	type DateCount struct {
		DateStr string `gorm:"column:date_str"`
		Count   int64  `gorm:"column:count"`
	}
	var dateCounts []DateCount
	startTime := startDateStr + " 00:00:00"
	endTime := endDateStr + " 23:59:59"
	r.db.Model(&UsageLog{}).
		Select("DATE_FORMAT(created_at, '%Y-%m-%d') as date_str, COUNT(*) as count").
		Where("created_at >= ? AND created_at <= ?", startTime, endTime).
		Group("date_str").
		Order("date_str ASC").
		Find(&dateCounts)

	// 创建日期到计数的映射
	dateMap := make(map[string]int64)
	for _, dc := range dateCounts {
		dateMap[dc.DateStr] = dc.Count
	}

	// 计算天数
	days := int(endDateVal.Sub(startDateVal).Hours()/24) + 1

	// 生成从开始日期到结束日期的所有日期（填充空缺为0）
	result := make([]TrendPoint, 0, days)
	for d := startDateVal; !d.After(endDateVal); d = d.AddDate(0, 0, 1) {
		dateStr := d.Format("2006-01-02")
		count := dateMap[dateStr]
		label := fmt.Sprintf("%d/%d", d.Month(), d.Day())
		
		result = append(result, TrendPoint{
			Label: label,
			Value: dateStr,
			Count: count,
		})
	}

	return result
}

