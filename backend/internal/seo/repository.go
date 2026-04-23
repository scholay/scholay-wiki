// ============================================================================
// Scholay学术 V1.0
// SEO Repository —— seo_papers 的 CRUD 与批量 upsert
// ============================================================================

package seo

import (
	"errors"
	"time"

	"gorm.io/gorm"
)

// Repository 数据访问层
type Repository struct {
	db *gorm.DB
}

// NewRepository 构造 Repository
func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

// UpsertResult 单次 upsert 的影响行信息
type UpsertResult struct {
	Inserted bool // true 表示新插入；false 表示已存在并更新
	Tier     int  // 当前行的最终 tier（可能由 2 升级到 1）
}

// UpsertDetail 用户点击详情页（tier=1，高质量）
// 行为：
//   - 新行：以 tier=1 写入，写 slug
//   - 老行：tier 升级到 1（若原来是 2），view_count+1，last_seen_at = now，刷新可变字段
//   - slug 字段一旦写入后不再更新（保持 SEO 稳定）
//
// updated_at (sitemap <lastmod> 数据源) 仅在以下情况才 bump：
//   1. quality_tier 由 2 升级到 1 （priority 0.5→0.7，对爬虫是有意义的变化）
//   2. title 发生变化
//   3. abstract 发生变化
// 否则（仅是再次点击/曝光）保持原值，避免误导爬虫重复抓取。
//
// ⚠️ updated_at 必须放在所有其它赋值之前 —— ON DUPLICATE KEY UPDATE 按左到右求值，
// 一旦 title = VALUES(title) 先执行，后面对比 title 就永远相等。
func (r *Repository) UpsertDetail(seed *PaperSeed, slug, authorsJSON, fieldsJSON string) error {
	if seed == nil || seed.PaperID == "" {
		return errors.New("empty paper_id")
	}
	now := time.Now()
	sitemapPage := calcSitemapPage(0) // 新行由触发器/后续 ALTER 不易拿到 id；先置 0，服务层兜底

	return r.db.Exec(`
		INSERT INTO seo_papers
			(paper_id, slug, doi, title, abstract, authors_json, year, venue,
			 citation_count, fields_of_study, source,
			 sitemap_page, status, quality_tier, priority,
			 first_seen_at, last_seen_at, view_count,
			 created_at, updated_at)
		VALUES
			(?, ?, NULLIF(?,''), ?, ?, NULLIF(?,''), ?, NULLIF(?,''),
			 ?, NULLIF(?,''), NULLIF(?,''),
			 ?, ?, ?, ?,
			 ?, ?, 1,
			 ?, ?)
		ON DUPLICATE KEY UPDATE
			updated_at = IF(
				quality_tier = 2
				OR title <> VALUES(title)
				OR COALESCE(abstract,'') <> COALESCE(NULLIF(VALUES(abstract),''), COALESCE(abstract,'')),
				CURRENT_TIMESTAMP,
				updated_at
			),
			quality_tier   = LEAST(quality_tier, 1),
			priority       = GREATEST(priority, 0.7),
			view_count     = view_count + 1,
			last_seen_at   = VALUES(last_seen_at),
			doi            = COALESCE(VALUES(doi), doi),
			title          = VALUES(title),
			abstract       = COALESCE(NULLIF(VALUES(abstract), ''), abstract),
			authors_json   = COALESCE(VALUES(authors_json), authors_json),
			year           = COALESCE(VALUES(year), year),
			venue          = COALESCE(VALUES(venue), venue),
			citation_count = GREATEST(VALUES(citation_count), citation_count),
			fields_of_study = COALESCE(VALUES(fields_of_study), fields_of_study),
			source         = COALESCE(VALUES(source), source)
	`,
		seed.PaperID, slug, seed.DOI, seed.Title, seed.Abstract, authorsJSON, seed.Year, seed.Venue,
		seed.CitationCount, fieldsJSON, seed.Source,
		sitemapPage, StatusActive, TierDetailClick, 0.7,
		now, now,
		now, now,
	).Error
}

// UpsertSeed 搜索曝光种子（tier=2，长尾）
// 行为：
//   - 新行：以 tier=2 写入
//   - 老行：不动 tier（已经是 1 的不降级），只刷新 last_seen_at 和可变元数据
//   - view_count 不递增（搜索曝光不算详情页浏览）
//
// updated_at (sitemap <lastmod> 数据源) 仅在 title / abstract 真的变化时才 bump。
// 单纯的再次曝光不刷新 lastmod，避免误导爬虫把几十万 URL 全部重抓一遍。
func (r *Repository) UpsertSeed(seed *PaperSeed, slug, authorsJSON, fieldsJSON string) error {
	if seed == nil || seed.PaperID == "" {
		return errors.New("empty paper_id")
	}
	now := time.Now()

	return r.db.Exec(`
		INSERT INTO seo_papers
			(paper_id, slug, doi, title, abstract, authors_json, year, venue,
			 citation_count, fields_of_study, source,
			 sitemap_page, status, quality_tier, priority,
			 first_seen_at, last_seen_at, view_count,
			 created_at, updated_at)
		VALUES
			(?, ?, NULLIF(?,''), ?, ?, NULLIF(?,''), ?, NULLIF(?,''),
			 ?, NULLIF(?,''), NULLIF(?,''),
			 ?, ?, ?, ?,
			 ?, ?, 0,
			 ?, ?)
		ON DUPLICATE KEY UPDATE
			updated_at = IF(
				title <> VALUES(title)
				OR COALESCE(abstract,'') <> COALESCE(NULLIF(VALUES(abstract),''), COALESCE(abstract,'')),
				CURRENT_TIMESTAMP,
				updated_at
			),
			last_seen_at   = VALUES(last_seen_at),
			doi            = COALESCE(VALUES(doi), doi),
			title          = VALUES(title),
			abstract       = COALESCE(NULLIF(VALUES(abstract), ''), abstract),
			authors_json   = COALESCE(VALUES(authors_json), authors_json),
			year           = COALESCE(VALUES(year), year),
			venue          = COALESCE(VALUES(venue), venue),
			citation_count = GREATEST(VALUES(citation_count), citation_count),
			fields_of_study = COALESCE(VALUES(fields_of_study), fields_of_study),
			source         = COALESCE(VALUES(source), source)
	`,
		seed.PaperID, slug, seed.DOI, seed.Title, seed.Abstract, authorsJSON, seed.Year, seed.Venue,
		seed.CitationCount, fieldsJSON, seed.Source,
		0, StatusActive, TierSearchSeeded, 0.5,
		now, now,
		now, now,
	).Error
}

// BackfillSitemapPage 扫描 sitemap_page=0 的新行，填入正确的分页号
// 仅依赖 id（严格单调递增）：page = FLOOR((id-1)/50000)+1
func (r *Repository) BackfillSitemapPage() (int64, error) {
	res := r.db.Exec(`
		UPDATE seo_papers
		SET sitemap_page = FLOOR((id - 1) / ?) + 1
		WHERE sitemap_page = 0 AND status = 1
	`, URLsPerSitemapPage)
	return res.RowsAffected, res.Error
}

// GetBySlug 路由解析：通过 slug 反查 paper_id + metadata（SSR 用）
func (r *Repository) GetBySlug(slug string) (*SEOPaper, error) {
	var p SEOPaper
	err := r.db.Where("slug = ?", slug).First(&p).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &p, nil
}

// GetByPaperID 通过 paperId 查询（SSR 兜底、后台维护用）
func (r *Repository) GetByPaperID(paperID string) (*SEOPaper, error) {
	var p SEOPaper
	err := r.db.Where("paper_id = ?", paperID).First(&p).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &p, nil
}

// ListSitemapPage 读取指定分页的 sitemap 条目（仅取 SEO 必要字段）
func (r *Repository) ListSitemapPage(page int) ([]SitemapEntry, error) {
	if page <= 0 {
		return nil, errors.New("page must be > 0")
	}
	var rows []struct {
		Slug      string    `gorm:"column:slug"`
		UpdatedAt time.Time `gorm:"column:updated_at"`
		Priority  float64   `gorm:"column:priority"`
	}
	err := r.db.Table("seo_papers").
		Select("slug, updated_at, priority").
		Where("status = ? AND sitemap_page = ?", StatusActive, page).
		Order("id").
		Find(&rows).Error
	if err != nil {
		return nil, err
	}
	out := make([]SitemapEntry, 0, len(rows))
	for _, r := range rows {
		out = append(out, SitemapEntry{Slug: r.Slug, UpdatedAt: r.UpdatedAt, Priority: r.Priority})
	}
	return out, nil
}

// GetSitemapSummary 返回 sitemap 分页总数和最后修改时间
func (r *Repository) GetSitemapSummary() (*SitemapSummary, error) {
	var row struct {
		Total   int64      `gorm:"column:total"`
		LastMod *time.Time `gorm:"column:last_mod"`
	}
	err := r.db.Table("seo_papers").
		Select("COUNT(*) AS total, MAX(updated_at) AS last_mod").
		Where("status = ?", StatusActive).
		Scan(&row).Error
	if err != nil {
		return nil, err
	}
	summary := &SitemapSummary{}
	if row.Total > 0 {
		summary.TotalPages = int((row.Total-1)/int64(URLsPerSitemapPage)) + 1
	}
	if row.LastMod != nil {
		summary.LastMod = *row.LastMod
	}
	return summary, nil
}

// calcSitemapPage 由 id 计算所属分页（1-based）。新行 id 未知时返回 0（由 BackfillSitemapPage 事后修正）
func calcSitemapPage(id uint64) int {
	if id == 0 {
		return 0
	}
	return int((id-1)/URLsPerSitemapPage) + 1
}
