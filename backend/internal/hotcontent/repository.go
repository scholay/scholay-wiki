// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package hotcontent

import (
	"crypto/md5"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// Repository 热门内容数据仓库
type Repository struct {
	db *gorm.DB
}

// NewRepository 创建数据仓库
func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

// hashKeyword 计算关键词的MD5哈希
func hashKeyword(keyword string) string {
	hash := md5.Sum([]byte(keyword))
	return hex.EncodeToString(hash[:])
}

// normalizeKeyword 标准化关键词
func normalizeKeyword(keyword string) string {
	// 去除首尾空格，转小写
	return strings.ToLower(strings.TrimSpace(keyword))
}

// RecordSearchKeyword 记录搜索关键词（UPSERT模式）
func (r *Repository) RecordSearchKeyword(keyword string) error {
	normalized := normalizeKeyword(keyword)
	if normalized == "" {
		return nil
	}
	
	keywordHash := hashKeyword(normalized)
	now := time.Now()
	
	// 使用 ON DUPLICATE KEY UPDATE 实现 UPSERT
	return r.db.Exec(`
		INSERT INTO hot_search_keywords (keyword, keyword_hash, search_count, first_searched_at, last_searched_at)
		VALUES (?, ?, 1, ?, ?)
		ON DUPLICATE KEY UPDATE
			search_count = search_count + 1,
			last_searched_at = ?
	`, normalized, keywordHash, now, now, now).Error
}

// RecordPaperView 记录论文查看（UPSERT模式）
func (r *Repository) RecordPaperView(paper *PaperViewData) error {
	if paper == nil || paper.PaperID == "" {
		return nil
	}
	
	now := time.Now()
	
	// 使用 ON DUPLICATE KEY UPDATE 实现 UPSERT
	return r.db.Exec(`
		INSERT INTO hot_papers (paper_id, doi, title, abstract, authors, year, venue, view_count, first_viewed_at, last_viewed_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
		ON DUPLICATE KEY UPDATE
			view_count = view_count + 1,
			last_viewed_at = ?,
			doi = COALESCE(VALUES(doi), doi),
			title = COALESCE(VALUES(title), title),
			abstract = COALESCE(VALUES(abstract), abstract),
			authors = COALESCE(VALUES(authors), authors),
			year = COALESCE(VALUES(year), year),
			venue = COALESCE(VALUES(venue), venue)
	`, paper.PaperID, paper.DOI, paper.Title, paper.Abstract, paper.Authors, paper.Year, paper.Venue, now, now, now).Error
}

// ListHotKeywords 获取热门关键词列表
func (r *Repository) ListHotKeywords(days int, limit int, offset int) ([]HotSearchKeyword, int64, error) {
	var items []HotSearchKeyword
	var total int64
	
	query := r.db.Model(&HotSearchKeyword{})
	
	// 按时间过滤
	if days > 0 {
		cutoff := time.Now().AddDate(0, 0, -days)
		query = query.Where("last_searched_at >= ?", cutoff)
	}
	
	// 获取总数
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	
	// 获取数据，按搜索次数降序
	if err := query.Order("search_count DESC, last_searched_at DESC").
		Limit(limit).
		Offset(offset).
		Find(&items).Error; err != nil {
		return nil, 0, err
	}
	
	return items, total, nil
}

// ListHotPapers 获取热门论文列表
func (r *Repository) ListHotPapers(days int, limit int, offset int) ([]HotPaper, int64, error) {
	var items []HotPaper
	var total int64
	
	query := r.db.Model(&HotPaper{})
	
	// 按时间过滤
	if days > 0 {
		cutoff := time.Now().AddDate(0, 0, -days)
		query = query.Where("last_viewed_at >= ?", cutoff)
	}
	
	// 获取总数
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	
	// 获取数据，按查看次数降序
	if err := query.Order("view_count DESC, last_viewed_at DESC").
		Limit(limit).
		Offset(offset).
		Find(&items).Error; err != nil {
		return nil, 0, err
	}
	
	return items, total, nil
}

// CleanupOldKeywords 清理过期的关键词记录
func (r *Repository) CleanupOldKeywords(retentionDays int, maxRecords int) (int64, error) {
	var totalDeleted int64
	
	// 1. 删除超过保留期的记录
	cutoff := time.Now().AddDate(0, 0, -retentionDays)
	result := r.db.Where("last_searched_at < ?", cutoff).Delete(&HotSearchKeyword{})
	if result.Error != nil {
		return 0, result.Error
	}
	totalDeleted += result.RowsAffected
	
	// 2. 如果记录数超过最大限制，删除最旧的记录
	var count int64
	if err := r.db.Model(&HotSearchKeyword{}).Count(&count).Error; err != nil {
		return totalDeleted, err
	}
	
	if count > int64(maxRecords) {
		// 找出需要保留的最后一条记录的时间
		var threshold HotSearchKeyword
		if err := r.db.Model(&HotSearchKeyword{}).
			Order("last_searched_at DESC").
			Offset(maxRecords - 1).
			Limit(1).
			Select("last_searched_at").
			First(&threshold).Error; err != nil {
			if !errors.Is(err, gorm.ErrRecordNotFound) {
				return totalDeleted, err
			}
		} else {
			// 删除比这个时间更早的记录
			result := r.db.Where("last_searched_at < ?", threshold.LastSearchedAt).Delete(&HotSearchKeyword{})
			if result.Error != nil {
				return totalDeleted, result.Error
			}
			totalDeleted += result.RowsAffected
		}
	}
	
	return totalDeleted, nil
}

// CleanupOldPapers 清理过期的论文记录
func (r *Repository) CleanupOldPapers(retentionDays int, maxRecords int) (int64, error) {
	var totalDeleted int64
	
	// 1. 删除超过保留期的记录
	cutoff := time.Now().AddDate(0, 0, -retentionDays)
	result := r.db.Where("last_viewed_at < ?", cutoff).Delete(&HotPaper{})
	if result.Error != nil {
		return 0, result.Error
	}
	totalDeleted += result.RowsAffected
	
	// 2. 如果记录数超过最大限制，删除最旧的记录
	var count int64
	if err := r.db.Model(&HotPaper{}).Count(&count).Error; err != nil {
		return totalDeleted, err
	}
	
	if count > int64(maxRecords) {
		// 找出需要保留的最后一条记录的时间
		var threshold HotPaper
		if err := r.db.Model(&HotPaper{}).
			Order("last_viewed_at DESC").
			Offset(maxRecords - 1).
			Limit(1).
			Select("last_viewed_at").
			First(&threshold).Error; err != nil {
			if !errors.Is(err, gorm.ErrRecordNotFound) {
				return totalDeleted, err
			}
		} else {
			// 删除比这个时间更早的记录
			result := r.db.Where("last_viewed_at < ?", threshold.LastViewedAt).Delete(&HotPaper{})
			if result.Error != nil {
				return totalDeleted, result.Error
			}
			totalDeleted += result.RowsAffected
		}
	}
	
	return totalDeleted, nil
}

// GetKeywordsCount 获取关键词总数
func (r *Repository) GetKeywordsCount() (int64, error) {
	var count int64
	err := r.db.Model(&HotSearchKeyword{}).Count(&count).Error
	return count, err
}

// GetPapersCount 获取论文总数
func (r *Repository) GetPapersCount() (int64, error) {
	var count int64
	err := r.db.Model(&HotPaper{}).Count(&count).Error
	return count, err
}

// 确保 clause 包被使用（用于后续可能的扩展）
var _ = clause.OnConflict{}
