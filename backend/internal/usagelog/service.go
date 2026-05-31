// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

// usagelog Service: 历史上还承载过 public Log 公开上报入口、SEO seed 写入、热门内容
// 抽取等逻辑, 在 /public/usage-log 路由下线后这些链路 (Log + recordHotContent +
// parseUserAgent + buildSEOSeedFromExtra + SEORecorder 接口 + SEOSeed/SEOAuthor 类型)
// 全部失去消费者, 一并移除。Service 退化成 admin 后台的列表/统计/清理三件套。
//
// SetHotContentService 仍保留: bootstrap 跨域注入用 (即便目前 service 本体不再
// 调用 hotContentService, 后续 admin 端如果要新加 "实时热度" 类需求可以接进来)。

package usagelog

import (
	"time"

	"scholar-backend/internal/hotcontent"
)

// Service 业务逻辑层
type Service struct {
	repo              *Repository
	hotContentService *hotcontent.Service
}

// NewService 创建Service
func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

// SetHotContentService 设置热门内容服务 (后续 admin 复用入口)
func (s *Service) SetHotContentService(hotContentService *hotcontent.Service) {
	s.hotContentService = hotContentService
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
	if days > 365 {
		days = 365
	}
	return s.repo.GetStatsSummary(days, featureCode)
}

// GetStatsSummaryByDateRange 根据自定义日期范围获取统计摘要
func (s *Service) GetStatsSummaryByDateRange(startDate, endDate string, featureCode string) (*StatsSummary, error) {
	return s.repo.GetStatsSummaryByDateRange(startDate, endDate, featureCode)
}

// GetPopularPaperIDs 获取热门论文ID列表 (hotcontent 内部任务消费)
func (s *Service) GetPopularPaperIDs(days int, limit int) ([]PopularPaper, error) {
	if days < 1 {
		days = 30
	}
	if days > 90 {
		days = 90
	}
	if limit < 1 {
		limit = 100
	}
	if limit > 500 {
		limit = 500
	}
	return s.repo.GetPopularPaperIDs(days, limit)
}

// ========== 配置管理 ==========

// GetConfig 获取使用统计配置
func (s *Service) GetConfig() (*UsageLogConfig, error) {
	return s.repo.GetConfig()
}

// UpdateConfig 更新使用统计配置
func (s *Service) UpdateConfig(req *ConfigUpdateRequest) (*UsageLogConfig, error) {
	if req.RetentionDays < 7 {
		req.RetentionDays = 7
	}
	if req.RetentionDays > 730 {
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

// CleanupOldLogs 清理过期日志 (分批删除, 不影响性能)
// 返回总共删除的数量
func (s *Service) CleanupOldLogs() (int64, error) {
	config, err := s.repo.GetConfig()
	if err != nil {
		return 0, err
	}

	cutoffTime := time.Now().AddDate(0, 0, -config.RetentionDays)

	const batchSize = 1000
	const batchDelay = 100 * time.Millisecond

	var totalDeleted int64
	for {
		deleted, hasMore, err := s.repo.DeleteOldLogsBatch(cutoffTime, batchSize)
		if err != nil {
			return totalDeleted, err
		}
		totalDeleted += deleted
		if !hasMore || deleted == 0 {
			break
		}
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
