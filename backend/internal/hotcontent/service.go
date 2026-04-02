// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package hotcontent

import (
	"log/slog"

	"scholar-backend/internal/common/database"
)

// Service 热门内容服务
type Service struct {
	repo *Repository
}

// NewService 创建服务
func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

// RecordSearch 记录搜索关键词
func (s *Service) RecordSearch(keyword string) error {
	if keyword == "" {
		return nil
	}
	return s.repo.RecordSearchKeyword(keyword)
}

// RecordPaperView 记录论文查看
func (s *Service) RecordPaperView(paperData *PaperViewData) error {
	if paperData == nil || paperData.PaperID == "" {
		return nil
	}
	return s.repo.RecordPaperView(paperData)
}

// RecordPaperViewFromExtraData 从 extra_data 中解析并记录论文查看
func (s *Service) RecordPaperViewFromExtraData(extraData map[string]any) error {
	if extraData == nil {
		return nil
	}
	
	// 解析 paper_id
	paperID, ok := extraData["paper_id"].(string)
	if !ok || paperID == "" {
		return nil
	}
	
	paper := &PaperViewData{
		PaperID: paperID,
	}
	
	// 解析可选字段
	if doi, ok := extraData["doi"].(string); ok && doi != "" {
		paper.DOI = &doi
	}
	if title, ok := extraData["title"].(string); ok && title != "" {
		paper.Title = &title
	}
	if abstract, ok := extraData["abstract"].(string); ok && abstract != "" {
		paper.Abstract = &abstract
	}
	if authors, ok := extraData["authors"].(string); ok && authors != "" {
		paper.Authors = &authors
	}
	if year, ok := extraData["year"].(float64); ok {
		yearInt := int(year)
		paper.Year = &yearInt
	}
	if venue, ok := extraData["venue"].(string); ok && venue != "" {
		paper.Venue = &venue
	}
	
	return s.repo.RecordPaperView(paper)
}

// RecordSearchFromExtraData 从 extra_data 中解析并记录搜索
func (s *Service) RecordSearchFromExtraData(extraData map[string]any) error {
	if extraData == nil {
		return nil
	}
	
	query, ok := extraData["query"].(string)
	if !ok || query == "" {
		return nil
	}
	
	return s.repo.RecordSearchKeyword(query)
}

// GetHotKeywords 获取热门关键词
func (s *Service) GetHotKeywords(days, page, pageSize int) (*HotKeywordsResponse, error) {
	// 设置默认值
	if days <= 0 {
		days = 30
	}
	if days > HotContentRetentionDays {
		days = HotContentRetentionDays
	}
	page, pageSize = database.NormalizePage(page, pageSize)
	offset := database.CalcOffset(page, pageSize)
	items, total, err := s.repo.ListHotKeywords(days, pageSize, offset)
	if err != nil {
		return nil, err
	}
	
	return &HotKeywordsResponse{
		Items:    items,
		Total:    total,
		Page:     page,
		PageSize: pageSize,
	}, nil
}

// GetHotPapers 获取热门论文
func (s *Service) GetHotPapers(days, page, pageSize int) (*HotPapersResponse, error) {
	// 设置默认值
	if days <= 0 {
		days = 30
	}
	if days > HotContentRetentionDays {
		days = HotContentRetentionDays
	}
	page, pageSize = database.NormalizePage(page, pageSize)
	offset := database.CalcOffset(page, pageSize)
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
}

// Cleanup 清理过期数据
func (s *Service) Cleanup() (*CleanupStats, error) {
	stats := &CleanupStats{}
	
	// 清理关键词
	keywordsDeleted, err := s.repo.CleanupOldKeywords(HotContentRetentionDays, HotContentMaxRecords)
	if err != nil {
		slog.Error("failed to cleanup hot keywords", "err", err)
		return nil, err
	}
	stats.KeywordsDeleted = keywordsDeleted
	
	// 清理论文
	papersDeleted, err := s.repo.CleanupOldPapers(HotContentRetentionDays, HotContentMaxRecords)
	if err != nil {
		slog.Error("failed to cleanup hot papers", "err", err)
		return nil, err
	}
	stats.PapersDeleted = papersDeleted
	
	if keywordsDeleted > 0 || papersDeleted > 0 {
		slog.Info("hot content cleanup completed", "keywords_deleted", keywordsDeleted, "papers_deleted", papersDeleted)
	}
	
	return stats, nil
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
	
	return map[string]any{
		"keywords_count":   keywordsCount,
		"papers_count":     papersCount,
		"retention_days":   HotContentRetentionDays,
		"max_records":      HotContentMaxRecords,
	}, nil
}
