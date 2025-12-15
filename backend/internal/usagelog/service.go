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
	return s.repo.List(query)
}

// GetStatsSummary 获取统计摘要
func (s *Service) GetStatsSummary(days int) (*StatsSummary, error) {
	if days < 1 {
		days = 7
	}
	if days > 90 {
		days = 90
	}
	return s.repo.GetStatsSummary(days)
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

