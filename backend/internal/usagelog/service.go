// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package usagelog

import (
	"encoding/json"
	"log/slog"
	"strings"
	"time"

	"scholar-backend/internal/common/safego"
	"scholar-backend/internal/hotcontent"
)

// SEORecorder 由 seo 包实现，用于详情页点击写入 SEO 索引库（避免循环依赖）
type SEORecorder interface {
	RecordDetailClick(seed *SEOSeed) error
}

// SEOSeed 复制自 seo.PaperSeed，避免 usagelog 反向依赖 seo 包。
// 字段一一对应；转换仅在接口边界发生。
type SEOSeed struct {
	PaperID       string
	DOI           string
	Title         string
	Abstract      string
	Authors       []SEOAuthor
	Year          *int
	Venue         string
	CitationCount int
	FieldsOfStudy []string
	Source        string
}

// SEOAuthor 同上
type SEOAuthor struct {
	Name     string
	AuthorID string
}

// Service 业务逻辑层
type Service struct {
	repo              *Repository
	hotContentService *hotcontent.Service
	seoRecorder       SEORecorder
}

// NewService 创建Service
func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

// SetHotContentService 设置热门内容服务（用于解决循环依赖）
func (s *Service) SetHotContentService(hotContentService *hotcontent.Service) {
	s.hotContentService = hotContentService
}

// SetSEORecorder 设置 SEO 记录器（详情页点击触发）
func (s *Service) SetSEORecorder(r SEORecorder) {
	s.seoRecorder = r
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

	usageLog := &UsageLog{
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

	// 保存使用日志
	if err := s.repo.Create(usageLog); err != nil {
		return err
	}

	// 同步记录到热门内容统计（异步，不影响主流程）
	if s.hotContentService != nil && req.ExtraData != nil {
		fc := req.FeatureCode
		ed := req.ExtraData
		safego.Go("usagelog-record-hot-content", func() { s.recordHotContent(fc, ed) })
	}

	return nil
}

// recordHotContent 记录热门内容（异步调用）
func (s *Service) recordHotContent(featureCode string, extraData map[string]any) {
	defer func() {
		if r := recover(); r != nil {
			slog.Error("panic in recordHotContent", "recover", r)
		}
	}()

	switch featureCode {
	case "direct_search", "smart_search":
		// 记录热门搜索关键词
		if err := s.hotContentService.RecordSearchFromExtraData(extraData); err != nil {
			slog.Error("failed to record hot search keyword", "err", err)
		}
	case "landing_page_view", "detail_page_view":
		// 记录热门论文
		if err := s.hotContentService.RecordPaperViewFromExtraData(extraData); err != nil {
			slog.Error("failed to record hot paper view", "err", err)
		}
		// 写入 SEO 索引库（tier=1 高质量条目）
		if s.seoRecorder != nil {
			if seed := buildSEOSeedFromExtra(extraData); seed != nil {
				if err := s.seoRecorder.RecordDetailClick(seed); err != nil {
					slog.Error("failed to record SEO detail click", "err", err)
				}
			}
		}
	}
}

// buildSEOSeedFromExtra 把 usage-log extra_data 解析成 SEOSeed。
//
// 作者字段读取优先级:
//   1. authors_json (string)  — 前端 trackDetailPageView 新增,JSON 格式带 authorId
//   2. authors (string)       — hotcontent 老路径,逗号分隔,只有 name
//
// 之前只读 #2 会导致 seo_papers.authors_json 被覆盖成"无 authorId"版本,
// 影响落地页的 schema.org Author identifier 完整性。
func buildSEOSeedFromExtra(extraData map[string]any) *SEOSeed {
	if extraData == nil {
		return nil
	}
	paperID, _ := extraData["paper_id"].(string)
	if paperID == "" {
		return nil
	}
	title, _ := extraData["title"].(string)
	if title == "" {
		// 没标题 → slug 无意义，跳过写入（详情页首次 SSR 时再补）
		return nil
	}
	seed := &SEOSeed{PaperID: paperID, Title: title}
	if doi, ok := extraData["doi"].(string); ok {
		seed.DOI = doi
	}
	if abstract, ok := extraData["abstract"].(string); ok {
		seed.Abstract = abstract
	}
	if venue, ok := extraData["venue"].(string); ok {
		seed.Venue = venue
	}
	if year, ok := extraData["year"].(float64); ok {
		y := int(year)
		seed.Year = &y
	}
	// 先尝试 JSON 路径,失败再降级到逗号分隔的 name-only 路径
	if rawJSON, ok := extraData["authors_json"].(string); ok && rawJSON != "" {
		var arr []struct {
			Name     string `json:"name"`
			AuthorID string `json:"authorId"`
		}
		if err := json.Unmarshal([]byte(rawJSON), &arr); err == nil {
			for _, a := range arr {
				if a.Name == "" {
					continue
				}
				seed.Authors = append(seed.Authors, SEOAuthor{Name: a.Name, AuthorID: a.AuthorID})
			}
		}
	}
	if len(seed.Authors) == 0 {
		if authors, ok := extraData["authors"].(string); ok && authors != "" {
			// 逗号分隔字符串 → Author 切片（只存 name,无 authorId）
			for _, name := range splitAndTrim(authors, ",") {
				seed.Authors = append(seed.Authors, SEOAuthor{Name: name})
			}
		}
	}
	return seed
}

func splitAndTrim(s, sep string) []string {
	var out []string
	for _, part := range strings.Split(s, sep) {
		p := strings.TrimSpace(part)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
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
func (s *Service) GetStatsSummary(days int, featureCode string) (*StatsSummary, error) {
	if days < 1 {
		days = 7
	}
	// 最大允许查询365天
	if days > 365 {
		days = 365
	}
	return s.repo.GetStatsSummary(days, featureCode)
}

// GetStatsSummaryByDateRange 根据自定义日期范围获取统计摘要
func (s *Service) GetStatsSummaryByDateRange(startDate, endDate string, featureCode string) (*StatsSummary, error) {
	return s.repo.GetStatsSummaryByDateRange(startDate, endDate, featureCode)
}

// GetFeatureConfigs 获取功能配置列表
func (s *Service) GetFeatureConfigs() ([]FeatureConfig, error) {
	return s.repo.GetFeatureConfigs()
}

// GetFilterOptions 获取筛选选项
func (s *Service) GetFilterOptions() (map[string]any, error) {
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

	deviceTypes, err := s.repo.GetDistinctDeviceTypes()
	if err != nil {
		return nil, err
	}

	browsers, err := s.repo.GetDistinctBrowsers()
	if err != nil {
		return nil, err
	}

	return map[string]any{
		"features":     features,
		"actions":      actions,
		"entry_points": entryPoints,
		"device_types": deviceTypes,
		"browsers":     browsers,
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

