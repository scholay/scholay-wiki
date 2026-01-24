// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package usagelog

import (
	"encoding/json"
	"strings"
	"time"
)

// Service 业务逻辑层
type Service struct {
	repo *Repository
}

// NewService 创建Service
func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

// Log 记录使用日志
func (s *Service) Log(req *LogRequest, userID *uint, ipAddress, userAgent string) error {
	// 解析User-Agent获取设备信息
	deviceType, browser, os := parseUserAgent(userAgent)

	// 获取功能名称（如果未提供，尝试从配置获取）
	featureName := req.FeatureName
	if featureName == "" {
		if config, err := s.repo.GetFeatureConfigByCode(req.FeatureCode); err == nil {
			featureName = config.FeatureName
		} else {
			featureName = req.FeatureCode
		}
	}

	// 构建额外数据
	var extraData json.RawMessage
	if req.ExtraData != nil {
		data, _ := json.Marshal(req.ExtraData)
		extraData = data
	}

	log := &UsageLog{
		UserID:      userID,
		SessionID:   req.SessionID,
		FeatureCode: req.FeatureCode,
		FeatureName: featureName,
		Action:      req.Action,
		EntryPoint:  req.EntryPoint,
		RequestPath: req.RequestPath,
		RefererPath: req.RefererPath,
		IPAddress:   ipAddress,
		UserAgent:   userAgent,
		DeviceType:  deviceType,
		Browser:     browser,
		OS:          os,
		ExtraData:   extraData,
		CreatedAt:   time.Now(),
	}

	return s.repo.Create(log)
}

// List 分页查询日志
func (s *Service) List(query *ListQuery) ([]UsageLogWithUser, int64, error) {
	if query.Page < 1 {
		query.Page = 1
	}
	if query.PageSize < 1 || query.PageSize > 100 {
		query.PageSize = 20
	}
	// 默认查询最近7天的数据
	if query.Days < 1 {
		query.Days = 7
	}
	// 最大允许查询180天
	if query.Days > 180 {
		query.Days = 180
	}
	return s.repo.List(query)
}

// GetStatsSummary 获取统计摘要
func (s *Service) GetStatsSummary(days int) (*StatsSummary, error) {
	if days < 1 {
		days = 7
	}
	// 最大允许查询365天
	if days > 365 {
		days = 365
	}
	return s.repo.GetStatsSummary(days)
}

// GetStatsSummaryByDateRange 根据自定义日期范围获取统计摘要
func (s *Service) GetStatsSummaryByDateRange(startDate, endDate string) (*StatsSummary, error) {
	return s.repo.GetStatsSummaryByDateRange(startDate, endDate)
}

// GetFeatureConfigs 获取功能配置列表
func (s *Service) GetFeatureConfigs() ([]FeatureConfig, error) {
	return s.repo.GetFeatureConfigs()
}

// GetFilterOptions 获取筛选选项
func (s *Service) GetFilterOptions() (map[string]interface{}, error) {
	features, err := s.repo.GetFeatureConfigs()
	if err != nil {
		return nil, err
	}

	actions, err := s.repo.GetDistinctActions()
	if err != nil {
		return nil, err
	}

	entryPoints, err := s.repo.GetDistinctEntryPoints()
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"features":     features,
		"actions":      actions,
		"entry_points": entryPoints,
	}, nil
}

// GetPopularPaperIDs 获取热门论文ID列表
func (s *Service) GetPopularPaperIDs(days int, limit int) ([]PopularPaper, error) {
	if days < 1 {
		days = 30 // 默认30天
	}
	if days > 90 {
		days = 90
	}
	if limit < 1 {
		limit = 100 // 默认100篇
	}
	if limit > 500 {
		limit = 500
	}
	return s.repo.GetPopularPaperIDs(days, limit)
}

// parseUserAgent 解析User-Agent
func parseUserAgent(ua string) (deviceType, browser, os string) {
	ua = strings.ToLower(ua)

	// 设备类型
	if strings.Contains(ua, "mobile") || strings.Contains(ua, "android") && !strings.Contains(ua, "tablet") {
		deviceType = "mobile"
	} else if strings.Contains(ua, "tablet") || strings.Contains(ua, "ipad") {
		deviceType = "tablet"
	} else {
		deviceType = "desktop"
	}

	// 浏览器
	switch {
	case strings.Contains(ua, "edg/"):
		browser = "Edge"
	case strings.Contains(ua, "chrome/") && !strings.Contains(ua, "edg/"):
		browser = "Chrome"
	case strings.Contains(ua, "firefox/"):
		browser = "Firefox"
	case strings.Contains(ua, "safari/") && !strings.Contains(ua, "chrome/"):
		browser = "Safari"
	case strings.Contains(ua, "opera") || strings.Contains(ua, "opr/"):
		browser = "Opera"
	case strings.Contains(ua, "msie") || strings.Contains(ua, "trident/"):
		browser = "IE"
	default:
		browser = "Other"
	}

	// 操作系统
	switch {
	case strings.Contains(ua, "windows"):
		os = "Windows"
	case strings.Contains(ua, "mac os"):
		os = "macOS"
	case strings.Contains(ua, "linux") && !strings.Contains(ua, "android"):
		os = "Linux"
	case strings.Contains(ua, "android"):
		os = "Android"
	case strings.Contains(ua, "iphone") || strings.Contains(ua, "ipad"):
		os = "iOS"
	default:
		os = "Other"
	}

	return
}

// ========== 配置管理 ==========

// GetConfig 获取使用统计配置
func (s *Service) GetConfig() (*UsageLogConfig, error) {
	return s.repo.GetConfig()
}

// UpdateConfig 更新使用统计配置
func (s *Service) UpdateConfig(req *ConfigUpdateRequest) (*UsageLogConfig, error) {
	// 验证保留天数范围
	if req.RetentionDays < 7 {
		req.RetentionDays = 7
	}
	if req.RetentionDays > 730 { // 最多2年
		req.RetentionDays = 730
	}

	config := &UsageLogConfig{
		RetentionDays: req.RetentionDays,
	}

	if err := s.repo.UpdateConfig(config); err != nil {
		return nil, err
	}

	return s.repo.GetConfig()
}

// ========== 数据清理 ==========

// CleanupOldLogs 清理过期日志（分批删除，不影响性能）
// 返回总共删除的数量
func (s *Service) CleanupOldLogs() (int64, error) {
	// 获取配置的保留天数
	config, err := s.repo.GetConfig()
	if err != nil {
		return 0, err
	}

	// 计算截止时间
	cutoffTime := time.Now().AddDate(0, 0, -config.RetentionDays)

	// 分批删除参数
	const batchSize = 1000                       // 每批删除1000条
	const batchDelay = 100 * time.Millisecond    // 批次间隔100ms

	var totalDeleted int64

	for {
		deleted, hasMore, err := s.repo.DeleteOldLogsBatch(cutoffTime, batchSize)
		if err != nil {
			return totalDeleted, err
		}

		totalDeleted += deleted

		// 如果没有更多数据，退出循环
		if !hasMore || deleted == 0 {
			break
		}

		// 批次间休眠，避免对数据库造成压力
		time.Sleep(batchDelay)
	}

	return totalDeleted, nil
}

// CountOldLogs 统计过期日志数量
func (s *Service) CountOldLogs() (int64, int, error) {
	config, err := s.repo.GetConfig()
	if err != nil {
		return 0, 0, err
	}

	cutoffTime := time.Now().AddDate(0, 0, -config.RetentionDays)
	count, err := s.repo.CountOldLogs(cutoffTime)
	return count, config.RetentionDays, err
}

// ClearAllLogs 清空所有日志数据
// 返回清空前的数量
func (s *Service) ClearAllLogs() (int64, error) {
	// 先统计数量
	count, err := s.repo.CountAllLogs()
	if err != nil {
		return 0, err
	}

	// 清空数据
	_, err = s.repo.DeleteAllLogs()
	if err != nil {
		return 0, err
	}

	return count, nil
}

