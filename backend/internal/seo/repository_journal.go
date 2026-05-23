// ============================================================================
// SEO Journal Repository —— seo_journals 的 CRUD 与批量 upsert
// 行为镜像 repository_author.go (作者域),只是把 author_id 换成 journal_id,
// 字段集换成期刊侧 (canonical_name / publisher / issns_json / impact factor 等)。
//
// updated_at (sitemap <lastmod>) 仅在 canonical_name 真正变化, 或 publisher / issns_json
// 真正变长时才 bump, 避免长尾期刊的"再次曝光"误导爬虫每天回抓。
// ============================================================================

package seo

import (
	"errors"
	"time"

	"gorm.io/gorm"
)

// UpsertJournalDetail 用户点击期刊详情页 (tier=1, 高质量)
//
// updated_at 触发条件:
//   1. quality_tier 由 2 升级到 1 (新晋活跃)
//   2. canonical_name 变化
//   3. publisher / issns_json 真的变长 (升级覆盖)
func (r *Repository) UpsertJournalDetail(seed *JournalSeed, slug, issnsJSON string) error {
	if seed == nil || seed.JournalID <= 0 {
		return errors.New("empty journal_id")
	}
	now := time.Now()

	return r.db.Exec(`
		INSERT INTO seo_journals
			(journal_id, slug, canonical_name, publisher, issns_json,
			 country, type, is_oa, jcr_impact_factor, jcr_quartile, openalex_h_index,
			 sitemap_page, status, quality_tier, priority,
			 first_seen_at, last_seen_at, view_count,
			 created_at, updated_at)
		VALUES
			(?, ?, ?, NULLIF(?,''), NULLIF(?,''),
			 NULLIF(?,''), NULLIF(?,''), ?, NULLIF(?,0), NULLIF(?,''), ?,
			 ?, ?, ?, ?,
			 ?, ?, 1,
			 ?, ?)
		ON DUPLICATE KEY UPDATE
			updated_at = IF(
				quality_tier = 2
				OR canonical_name <> VALUES(canonical_name)
				OR (NULLIF(VALUES(publisher),'') IS NOT NULL
				    AND LENGTH(VALUES(publisher)) > COALESCE(LENGTH(publisher),0))
				OR (NULLIF(VALUES(issns_json),'') IS NOT NULL
				    AND LENGTH(VALUES(issns_json)) > COALESCE(LENGTH(issns_json),0)),
				CURRENT_TIMESTAMP,
				updated_at
			),
			quality_tier      = LEAST(quality_tier, 1),
			priority          = GREATEST(priority, 0.7),
			view_count        = view_count + 1,
			last_seen_at      = VALUES(last_seen_at),
			slug              = IF(slug = '' AND VALUES(slug) <> '', VALUES(slug), slug),
			canonical_name    = VALUES(canonical_name),
			publisher         = CASE
				WHEN NULLIF(VALUES(publisher),'') IS NULL THEN publisher
				WHEN LENGTH(VALUES(publisher)) > COALESCE(LENGTH(publisher),0) THEN VALUES(publisher)
				ELSE publisher
			END,
			issns_json        = CASE
				WHEN NULLIF(VALUES(issns_json),'') IS NULL THEN issns_json
				WHEN LENGTH(VALUES(issns_json)) > COALESCE(LENGTH(issns_json),0) THEN VALUES(issns_json)
				ELSE issns_json
			END,
			country           = COALESCE(VALUES(country), country),
			type              = COALESCE(VALUES(type), type),
			is_oa             = VALUES(is_oa),
			jcr_impact_factor = COALESCE(VALUES(jcr_impact_factor), jcr_impact_factor),
			jcr_quartile      = COALESCE(VALUES(jcr_quartile), jcr_quartile),
			openalex_h_index  = COALESCE(VALUES(openalex_h_index), openalex_h_index)
	`,
		seed.JournalID, slug, seed.CanonicalName, seed.Publisher, issnsJSON,
		seed.Country, seed.Type, seed.IsOA, seed.JCRImpactFactor, seed.JCRQuartile, seed.OpenAlexHIndex,
		0, StatusActive, TierDetailClick, 0.7,
		now, now,
		now, now,
	).Error
}

// UpsertJournalSeed 搜索曝光种子 (tier=2, 长尾)
// 不动 tier (已 1 不降级)、不递增 view_count, 只刷可变元数据
func (r *Repository) UpsertJournalSeed(seed *JournalSeed, slug, issnsJSON string) error {
	if seed == nil || seed.JournalID <= 0 {
		return errors.New("empty journal_id")
	}
	now := time.Now()

	return r.db.Exec(`
		INSERT INTO seo_journals
			(journal_id, slug, canonical_name, publisher, issns_json,
			 country, type, is_oa, jcr_impact_factor, jcr_quartile, openalex_h_index,
			 sitemap_page, status, quality_tier, priority,
			 first_seen_at, last_seen_at, view_count,
			 created_at, updated_at)
		VALUES
			(?, ?, ?, NULLIF(?,''), NULLIF(?,''),
			 NULLIF(?,''), NULLIF(?,''), ?, NULLIF(?,0), NULLIF(?,''), ?,
			 ?, ?, ?, ?,
			 ?, ?, 0,
			 ?, ?)
		ON DUPLICATE KEY UPDATE
			updated_at = IF(
				canonical_name <> VALUES(canonical_name)
				OR (NULLIF(VALUES(publisher),'') IS NOT NULL
				    AND LENGTH(VALUES(publisher)) > COALESCE(LENGTH(publisher),0))
				OR (NULLIF(VALUES(issns_json),'') IS NOT NULL
				    AND LENGTH(VALUES(issns_json)) > COALESCE(LENGTH(issns_json),0)),
				CURRENT_TIMESTAMP,
				updated_at
			),
			last_seen_at      = VALUES(last_seen_at),
			slug              = IF(slug = '' AND VALUES(slug) <> '', VALUES(slug), slug),
			canonical_name    = VALUES(canonical_name),
			publisher         = CASE
				WHEN NULLIF(VALUES(publisher),'') IS NULL THEN publisher
				WHEN LENGTH(VALUES(publisher)) > COALESCE(LENGTH(publisher),0) THEN VALUES(publisher)
				ELSE publisher
			END,
			issns_json        = CASE
				WHEN NULLIF(VALUES(issns_json),'') IS NULL THEN issns_json
				WHEN LENGTH(VALUES(issns_json)) > COALESCE(LENGTH(issns_json),0) THEN VALUES(issns_json)
				ELSE issns_json
			END,
			country           = COALESCE(VALUES(country), country),
			type              = COALESCE(VALUES(type), type),
			is_oa             = VALUES(is_oa),
			jcr_impact_factor = COALESCE(VALUES(jcr_impact_factor), jcr_impact_factor),
			jcr_quartile      = COALESCE(VALUES(jcr_quartile), jcr_quartile),
			openalex_h_index  = COALESCE(VALUES(openalex_h_index), openalex_h_index)
	`,
		seed.JournalID, slug, seed.CanonicalName, seed.Publisher, issnsJSON,
		seed.Country, seed.Type, seed.IsOA, seed.JCRImpactFactor, seed.JCRQuartile, seed.OpenAlexHIndex,
		0, StatusActive, TierSearchSeeded, 0.5,
		now, now,
		now, now,
	).Error
}

// BackfillJournalSitemapPage 扫描 sitemap_page=0 的新行,填入正确的分页号
func (r *Repository) BackfillJournalSitemapPage() (int64, error) {
	res := r.db.Exec(`
		UPDATE seo_journals
		SET sitemap_page = FLOOR((id - 1) / ?) + 1
		WHERE sitemap_page = 0 AND status = 1
	`, URLsPerSitemapPage)
	return res.RowsAffected, res.Error
}

// GetJournalByID 通过上游 journal_id 查询 (SSR / 301 校验用)
func (r *Repository) GetJournalByID(journalID int64) (*SEOJournal, error) {
	var j SEOJournal
	err := r.db.Where("journal_id = ?", journalID).First(&j).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &j, nil
}

// ListJournalSitemapPage 读取指定分页的 sitemap 条目 (按 id 顺序)
//
// 取 journal_id + slug + updated_at + priority + quality_tier ——
// sitemap URL 是 /journal/{journal_id}/{slug}, slug 为空时回落到 /journal/{journal_id}。
func (r *Repository) ListJournalSitemapPage(page int) ([]SitemapEntry, error) {
	if page <= 0 {
		return nil, errors.New("page must be > 0")
	}
	var rows []struct {
		JournalID   int64     `gorm:"column:journal_id"`
		Slug        string    `gorm:"column:slug"`
		UpdatedAt   time.Time `gorm:"column:updated_at"`
		Priority    float64   `gorm:"column:priority"`
		QualityTier int       `gorm:"column:quality_tier"`
	}
	err := r.db.Table("seo_journals").
		Select("journal_id, slug, updated_at, priority, quality_tier").
		Where("status = ? AND sitemap_page = ?", StatusActive, page).
		Order("id").
		Find(&rows).Error
	if err != nil {
		return nil, err
	}
	out := make([]SitemapEntry, 0, len(rows))
	for _, r := range rows {
		out = append(out, SitemapEntry{
			Slug:        r.Slug,
			EntityID:    formatJournalID(r.JournalID),
			UpdatedAt:   r.UpdatedAt,
			Priority:    r.Priority,
			QualityTier: r.QualityTier,
		})
	}
	return out, nil
}

// GetJournalSitemapLastModPerPage 每个分页的最大 updated_at
func (r *Repository) GetJournalSitemapLastModPerPage() (map[int]time.Time, error) {
	var rows []struct {
		Page    int       `gorm:"column:sitemap_page"`
		LastMod time.Time `gorm:"column:last_mod"`
	}
	err := r.db.Table("seo_journals").
		Select("sitemap_page, MAX(updated_at) AS last_mod").
		Where("status = ? AND sitemap_page > 0", StatusActive).
		Group("sitemap_page").
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	out := make(map[int]time.Time, len(rows))
	for _, r := range rows {
		out[r.Page] = r.LastMod
	}
	return out, nil
}

// GetJournalSitemapSummary 返回期刊 sitemap 分页总数 + 最后修改时间
func (r *Repository) GetJournalSitemapSummary() (*SitemapSummary, error) {
	var row struct {
		Total   int64      `gorm:"column:total"`
		LastMod *time.Time `gorm:"column:last_mod"`
	}
	err := r.db.Table("seo_journals").
		Select("COUNT(*) AS total, MAX(updated_at) AS last_mod").
		Where("status = ? AND sitemap_page > 0", StatusActive).
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
