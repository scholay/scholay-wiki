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

// RecordSearchKeyword 记录搜索关键词（UPSERT模式，按 search_type 分桶计数）
func (r *Repository) RecordSearchKeyword(keyword string, searchType SearchType) error {
	normalized := normalizeKeyword(keyword)
	if normalized == "" {
		return nil
	}
	st := string(searchType)
	if st == "" {
		st = string(SearchTypePaper)
	}

	keywordHash := hashKeyword(normalized)
	now := time.Now()

	// 唯一键是 (keyword_hash, search_type) —— 同词不同类型各计各的。
	return r.db.Exec(`
		INSERT INTO hot_search_keywords (keyword, keyword_hash, search_type, search_count, first_searched_at, last_searched_at)
		VALUES (?, ?, ?, 1, ?, ?)
		ON DUPLICATE KEY UPDATE
			search_count = search_count + 1,
			last_searched_at = ?
	`, normalized, keywordHash, st, now, now, now).Error
}

// hotPaperCounterColumns 是允许自增的计数器列白名单 —— 防止列名被外部拼进 SQL。
var hotPaperCounterColumns = map[string]bool{
	"impression_count": true,
	"click_count":      true,
	"seo_view_count":   true,
}

// recordPaperMetric 对单篇论文的某个计数器 +1（UPSERT，首次插入带元数据）。
// counterCol 只接受白名单内的列名,杜绝 SQL 注入。
func (r *Repository) recordPaperMetric(paper *PaperViewData, counterCol string) error {
	if paper == nil || paper.PaperID == "" || !hotPaperCounterColumns[counterCol] {
		return nil
	}
	now := time.Now()
	sql := `
		INSERT INTO hot_papers (paper_id, doi, title, abstract, authors, year, venue, ` + counterCol + `, first_viewed_at, last_viewed_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
		ON DUPLICATE KEY UPDATE
			` + counterCol + ` = ` + counterCol + ` + 1,
			last_viewed_at = ?,
			doi = COALESCE(VALUES(doi), doi),
			title = COALESCE(VALUES(title), title),
			abstract = COALESCE(VALUES(abstract), abstract),
			authors = COALESCE(VALUES(authors), authors),
			year = COALESCE(VALUES(year), year),
			venue = COALESCE(VALUES(venue), venue)`
	return r.db.Exec(sql, paper.PaperID, paper.DOI, paper.Title, paper.Abstract, paper.Authors, paper.Year, paper.Venue, now, now, now).Error
}

// RecordClick 论文被从搜索结果点开详情 —— 点击量 +1。
func (r *Repository) RecordClick(paper *PaperViewData) error {
	return r.recordPaperMetric(paper, "click_count")
}

// RecordSeoView 论文经 /paper/:slug 直接访问详情 —— SEO 直访量 +1(不含搜索点击)。
func (r *Repository) RecordSeoView(paper *PaperViewData) error {
	return r.recordPaperMetric(paper, "seo_view_count")
}

// RecordImpressions 一次搜索返回的结果集 —— 每篇曝光量 +1（单条多行 UPSERT，一次往返）。
func (r *Repository) RecordImpressions(papers []PaperViewData) error {
	if len(papers) == 0 {
		return nil
	}
	now := time.Now()
	placeholders := make([]string, 0, len(papers))
	args := make([]any, 0, len(papers)*9)
	for i := range papers {
		p := &papers[i]
		if p.PaperID == "" {
			continue
		}
		placeholders = append(placeholders, "(?, ?, ?, ?, ?, ?, ?, 1, ?, ?)")
		args = append(args, p.PaperID, p.DOI, p.Title, p.Abstract, p.Authors, p.Year, p.Venue, now, now)
	}
	if len(placeholders) == 0 {
		return nil
	}
	sql := `
		INSERT INTO hot_papers (paper_id, doi, title, abstract, authors, year, venue, impression_count, first_viewed_at, last_viewed_at)
		VALUES ` + strings.Join(placeholders, ",") + `
		ON DUPLICATE KEY UPDATE
			impression_count = impression_count + 1,
			last_viewed_at = VALUES(last_viewed_at),
			doi = COALESCE(VALUES(doi), doi),
			title = COALESCE(VALUES(title), title),
			abstract = COALESCE(VALUES(abstract), abstract),
			authors = COALESCE(VALUES(authors), authors),
			year = COALESCE(VALUES(year), year),
			venue = COALESCE(VALUES(venue), venue)`
	return r.db.Exec(sql, args...).Error
}

// ListHotKeywords 获取热门关键词列表。searchType 为空 = 不过滤(全部类型)。
func (r *Repository) ListHotKeywords(days int, searchType string, limit int, offset int) ([]HotSearchKeyword, int64, error) {
	var items []HotSearchKeyword
	var total int64

	query := r.db.Model(&HotSearchKeyword{})

	// 按时间过滤
	if days > 0 {
		cutoff := time.Now().AddDate(0, 0, -days)
		query = query.Where("last_searched_at >= ?", cutoff)
	}

	// 按搜索类型过滤(文献 / 期刊)
	if searchType != "" {
		query = query.Where("search_type = ?", searchType)
	}

	// 获取总数
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	
	// 获取数据，按搜索次数降序（附加 id 作为稳定 tiebreaker，避免分页重复/跳漏）
	if err := query.Order("search_count DESC, last_searched_at DESC, id DESC").
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
	
	// 热度排序：先点击量、再曝光量,recency + id 作稳定 tiebreaker(避免分页重复/跳漏)
	if err := query.Order("click_count DESC, impression_count DESC, last_viewed_at DESC, id DESC").
		Limit(limit).
		Offset(offset).
		Find(&items).Error; err != nil {
		return nil, 0, err
	}

	return items, total, nil
}

// cleanupBatchSize 单次 DELETE 的行数上限 —— 控制单次事务的锁持有时间。
// 10000 行在 InnoDB 上 row-level lock 通常 <100ms, 不会让其他写入排队太久。
const cleanupBatchSize = 10000

// CleanupOldKeywords 清理过期的关键词记录
//
// 两阶段:
//  1. 按保留天数删 (WHERE last_searched_at < cutoff) —— 走 idx_last_searched, 单条 SQL
//  2. 超过 maxRecords 的部分按 last_searched_at ASC 分批删 —— 每批 10000 行,
//     避免一次性锁过多行影响 RecordSearch 写入
//
// 之前实现用 OFFSET maxRecords 子查询找阈值时间戳, 当总行数到百万级时 OFFSET 走
// 索引仍要遍历 ~maxRecords 个 leaf entry, 慢且会被 binlog 放大。改成"batched DELETE
// ORDER BY ASC LIMIT N" 后, MySQL 直接 idx_last_searched 升序取 N 个 → delete →
// 重复, 单批 I/O 受控。
func (r *Repository) CleanupOldKeywords(retentionDays int, maxRecords int) (int64, error) {
	var totalDeleted int64

	// 1. 删除超过保留期的记录 —— 单条 DELETE 走 idx_last_searched, 由 InnoDB 自己
	//    分块, 不需要应用层分批
	cutoff := time.Now().AddDate(0, 0, -retentionDays)
	result := r.db.Where("last_searched_at < ?", cutoff).Delete(&HotSearchKeyword{})
	if result.Error != nil {
		return 0, result.Error
	}
	totalDeleted += result.RowsAffected

	// 2. 检查是否还超额, 若超额则分批裁掉最旧的 (count - maxRecords) 行
	var count int64
	if err := r.db.Model(&HotSearchKeyword{}).Count(&count).Error; err != nil {
		return totalDeleted, err
	}
	toTrim := count - int64(maxRecords)
	if toTrim <= 0 {
		return totalDeleted, nil
	}
	for toTrim > 0 {
		batch := int64(cleanupBatchSize)
		if batch > toTrim {
			batch = toTrim
		}
		// MySQL DELETE ... ORDER BY ... LIMIT 走 idx_last_searched 升序扫,
		// 每批严格只动 N 行, 锁持有短可控。
		res := r.db.Exec(
			"DELETE FROM hot_search_keywords ORDER BY last_searched_at ASC LIMIT ?",
			batch,
		)
		if res.Error != nil {
			return totalDeleted, res.Error
		}
		totalDeleted += res.RowsAffected
		// 防御:如果某一批一行没删 (理论上 toTrim>0 不该出现), 直接退出避免死循环
		if res.RowsAffected == 0 {
			break
		}
		toTrim -= res.RowsAffected
	}

	return totalDeleted, nil
}

// CleanupOldPapers 清理过期的论文记录。同 CleanupOldKeywords 两阶段 + 分批 DELETE。
func (r *Repository) CleanupOldPapers(retentionDays int, maxRecords int) (int64, error) {
	var totalDeleted int64

	cutoff := time.Now().AddDate(0, 0, -retentionDays)
	result := r.db.Where("last_viewed_at < ?", cutoff).Delete(&HotPaper{})
	if result.Error != nil {
		return 0, result.Error
	}
	totalDeleted += result.RowsAffected

	var count int64
	if err := r.db.Model(&HotPaper{}).Count(&count).Error; err != nil {
		return totalDeleted, err
	}
	toTrim := count - int64(maxRecords)
	if toTrim <= 0 {
		return totalDeleted, nil
	}
	for toTrim > 0 {
		batch := int64(cleanupBatchSize)
		if batch > toTrim {
			batch = toTrim
		}
		res := r.db.Exec(
			"DELETE FROM hot_papers ORDER BY last_viewed_at ASC LIMIT ?",
			batch,
		)
		if res.Error != nil {
			return totalDeleted, res.Error
		}
		totalDeleted += res.RowsAffected
		if res.RowsAffected == 0 {
			break
		}
		toTrim -= res.RowsAffected
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

// GetConfig 读取单行清理策略配置。
// 若 DB 里因某种原因没有 id=1 行(理论上 migration 已 seed), 返回默认值兜底,
// 而不是让上游 nil-deref / 抓 ErrRecordNotFound。
func (r *Repository) GetConfig() (*HotContentConfig, error) {
	var cfg HotContentConfig
	err := r.db.Where("id = 1").First(&cfg).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return &HotContentConfig{
			ID:            1,
			RetentionDays: HotContentRetentionDays,
			MaxRecords:    HotContentMaxRecords,
		}, nil
	}
	if err != nil {
		return nil, err
	}
	return &cfg, nil
}

// UpdateConfig 写入/覆盖单行配置 (id=1)。调用方需要先校验范围。
func (r *Repository) UpdateConfig(retentionDays, maxRecords uint) (*HotContentConfig, error) {
	cfg := HotContentConfig{
		ID:            1,
		RetentionDays: retentionDays,
		MaxRecords:    maxRecords,
		UpdatedAt:     time.Now(),
	}
	if err := r.db.Save(&cfg).Error; err != nil {
		return nil, err
	}
	return &cfg, nil
}

// 确保 clause 包被使用（用于后续可能的扩展）
var _ = clause.OnConflict{}
