// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package hotcontent

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"scholar-backend/internal/common/cache"
	"scholar-backend/internal/common/database"
)

// 热榜缓存 TTL：榜单聚合天然容忍分钟级延迟
const hotContentCacheTTL = 5 * time.Minute

// Service 热门内容服务
type Service struct {
	repo *Repository
}

// NewService 创建服务
func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

// RecordSearch 记录搜索关键词（按 search_type 分桶: 文献 / 期刊）。
func (s *Service) RecordSearch(keyword string, searchType SearchType) error {
	if keyword == "" {
		return nil
	}
	return s.repo.RecordSearchKeyword(keyword, searchType)
}

// RecordImpressions 记录一次搜索结果集的曝光（每篇论文曝光量 +1）。
func (s *Service) RecordImpressions(papers []PaperViewData) error {
	if len(papers) == 0 {
		return nil
	}
	return s.repo.RecordImpressions(papers)
}

// RecordClick 记录一次"从搜索结果点开详情"的点击（点击量 +1）。
func (s *Service) RecordClick(paperData *PaperViewData) error {
	if paperData == nil || paperData.PaperID == "" {
		return nil
	}
	return s.repo.RecordClick(paperData)
}

// RecordSeoView 记录一次"经 /paper/:slug 直接访问详情"的 SEO 直访（直访量 +1）。
// 与 RecordClick 走不同入口(接口),不会和搜索点击重复计数。
func (s *Service) RecordSeoView(paperData *PaperViewData) error {
	if paperData == nil || paperData.PaperID == "" {
		return nil
	}
	return s.repo.RecordSeoView(paperData)
}

// effectiveRetentionDays 取当前配置的保留天数 (失败兜底到硬编码默认)。
// 业务路径 (GetHot*/Cleanup) 都走这里, 不再直接引用常量。
func (s *Service) effectiveRetentionDays() int {
	cfg, err := s.repo.GetConfig()
	if err != nil || cfg == nil || cfg.RetentionDays == 0 {
		return HotContentRetentionDays
	}
	return int(cfg.RetentionDays)
}

// GetHotKeywords 获取热门关键词（5min Redis 缓存）。searchType 为空 = 全部类型。
func (s *Service) GetHotKeywords(days, page, pageSize int, searchType string) (*HotKeywordsResponse, error) {
	if days <= 0 {
		days = 30
	}
	if max := s.effectiveRetentionDays(); days > max {
		days = max
	}
	page, pageSize = database.NormalizePage(page, pageSize)
	offset := database.CalcOffset(page, pageSize)

	cacheKey := fmt.Sprintf("hot:keywords:d=%d:t=%s:p=%d:s=%d", days, searchType, page, pageSize)
	resp := &HotKeywordsResponse{}
	err := cache.GetOrSet(context.Background(), cacheKey, hotContentCacheTTL, func() (any, error) {
		items, total, err := s.repo.ListHotKeywords(days, searchType, pageSize, offset)
		if err != nil {
			return nil, err
		}
		return &HotKeywordsResponse{
			Items:    items,
			Total:    total,
			Page:     page,
			PageSize: pageSize,
		}, nil
	}, resp)
	if err != nil {
		if errors.Is(err, cache.ErrNotFound) {
			return &HotKeywordsResponse{Items: nil, Total: 0, Page: page, PageSize: pageSize}, nil
		}
		return nil, err
	}
	return resp, nil
}

// GetHotPapers 获取热门论文（5min Redis 缓存）
func (s *Service) GetHotPapers(days, page, pageSize int) (*HotPapersResponse, error) {
	if days <= 0 {
		days = 30
	}
	if max := s.effectiveRetentionDays(); days > max {
		days = max
	}
	page, pageSize = database.NormalizePage(page, pageSize)
	offset := database.CalcOffset(page, pageSize)

	cacheKey := fmt.Sprintf("hot:papers:d=%d:p=%d:s=%d", days, page, pageSize)
	resp := &HotPapersResponse{}
	err := cache.GetOrSet(context.Background(), cacheKey, hotContentCacheTTL, func() (any, error) {
		items, total, err := s.repo.ListHotPapers(days, pageSize, offset)
		if err != nil {
			return nil, err
		}
		return &HotPapersResponse{
			Items:    items,
			Total:    total,
			Page:     page,
			PageSize: pageSize,
		}, nil
	}, resp)
	if err != nil {
		if errors.Is(err, cache.ErrNotFound) {
			return &HotPapersResponse{Items: nil, Total: 0, Page: page, PageSize: pageSize}, nil
		}
		return nil, err
	}
	return resp, nil
}

// Cleanup 清理过期数据 —— 保留天数 / 最大记录数 从 hot_content_config 读取
// (失败兜底到硬编码默认值)。daily 04:30 任务和 admin 手动触发都走这里。
func (s *Service) Cleanup() (*CleanupStats, error) {
	cfg, err := s.repo.GetConfig()
	if err != nil {
		slog.Warn("hot content cleanup: failed to read config, falling back to defaults", "err", err)
		cfg = &HotContentConfig{
			RetentionDays: HotContentRetentionDays,
			MaxRecords:    HotContentMaxRecords,
		}
	}
	retention := int(cfg.RetentionDays)
	maxRec := int(cfg.MaxRecords)

	stats := &CleanupStats{}

	// 清理关键词
	keywordsDeleted, err := s.repo.CleanupOldKeywords(retention, maxRec)
	if err != nil {
		slog.Error("failed to cleanup hot keywords", "err", err)
		return nil, err
	}
	stats.KeywordsDeleted = keywordsDeleted

	// 清理论文
	papersDeleted, err := s.repo.CleanupOldPapers(retention, maxRec)
	if err != nil {
		slog.Error("failed to cleanup hot papers", "err", err)
		return nil, err
	}
	stats.PapersDeleted = papersDeleted

	if keywordsDeleted > 0 || papersDeleted > 0 {
		slog.Info("hot content cleanup completed",
			"keywords_deleted", keywordsDeleted, "papers_deleted", papersDeleted,
			"retention_days", retention, "max_records", maxRec)
	}

	return stats, nil
}

// GetConfig 取当前清理策略 (admin 后台展示用)。
func (s *Service) GetConfig() (*HotContentConfig, error) {
	return s.repo.GetConfig()
}

// UpdateConfig 更新清理策略。req 已由 binding 校验过范围
// (retention 1-3650 天, max_records 100-1000万)。
func (s *Service) UpdateConfig(req *HotContentConfigUpdateRequest) (*HotContentConfig, error) {
	if req == nil {
		return nil, fmt.Errorf("nil config update")
	}
	return s.repo.UpdateConfig(uint(req.RetentionDays), uint(req.MaxRecords))
}

// GetStats 获取统计信息
func (s *Service) GetStats() (map[string]any, error) {
	keywordsCount, err := s.repo.GetKeywordsCount()
	if err != nil {
		return nil, err
	}
	
	papersCount, err := s.repo.GetPapersCount()
	if err != nil {
		return nil, err
	}
	
	// 当前清理策略 (来自 hot_content_config); 读不到时兜底常量。
	cfg, _ := s.repo.GetConfig()
	retention := HotContentRetentionDays
	maxRec := HotContentMaxRecords
	if cfg != nil {
		if cfg.RetentionDays > 0 {
			retention = int(cfg.RetentionDays)
		}
		if cfg.MaxRecords > 0 {
			maxRec = int(cfg.MaxRecords)
		}
	}
	return map[string]any{
		"keywords_count": keywordsCount,
		"papers_count":   papersCount,
		"retention_days": retention,
		"max_records":    maxRec,
	}, nil
}
