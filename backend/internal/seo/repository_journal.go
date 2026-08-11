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
//  1. quality_tier 由 2 升级到 1 (新晋活跃)
//  2. canonical_name 变化
//  3. publisher / issns_json 真的变长 (升级覆盖)
//  4. publish_state 由 staged 升为 published (页面由 noindex 转可索引, 对爬虫是真实变化)
//
// publish_state:有机详情点击是服务端已验证的真实用户需求,插入即 published
// (与摄取前行为一致);已存在的 staged 摄取行被真实用户点开 → 就地发布
// (GREATEST 只升不降,批量发布闸门管的是无人问津的长尾,不拦真实需求)。
func (r *Repository) UpsertJournalDetail(seed *JournalSeed, slug, issnsJSON string) error {
	if seed == nil || seed.JournalID <= 0 {
		return errors.New("empty journal_id")
	}
	now := time.Now()

	return r.db.Exec(`
		INSERT INTO seo_journals
			(journal_id, slug, canonical_name, publisher, issns_json,
			 country, type, is_oa, jcr_impact_factor, jcr_quartile, openalex_h_index,
			 publish_state,
			 sitemap_page, status, quality_tier, priority,
			 first_seen_at, last_seen_at, view_count,
			 created_at, updated_at)
		VALUES
			(?, ?, ?, NULLIF(?,''), NULLIF(?,''),
			 NULLIF(?,''), NULLIF(?,''), ?, NULLIF(?,0), NULLIF(?,''), ?,
			 ?,
			 ?, ?, ?, ?,
			 ?, ?, 1,
			 ?, ?)
		ON DUPLICATE KEY UPDATE
			updated_at = IF(
				quality_tier = 2
				OR publish_state < VALUES(publish_state)
				OR canonical_name <> VALUES(canonical_name)
				OR slug <> VALUES(slug)
				OR (NULLIF(VALUES(publisher),'') IS NOT NULL
				    AND LENGTH(VALUES(publisher)) > COALESCE(LENGTH(publisher),0))
				OR (NULLIF(VALUES(issns_json),'') IS NOT NULL
				    AND LENGTH(VALUES(issns_json)) > COALESCE(LENGTH(issns_json),0)),
				CURRENT_TIMESTAMP,
				updated_at
			),
			publish_state     = GREATEST(publish_state, VALUES(publish_state)),
			quality_tier      = LEAST(quality_tier, 1),
			priority          = GREATEST(priority, 0.7),
			view_count        = view_count + 1,
			last_seen_at      = VALUES(last_seen_at),
			slug              = IF(VALUES(slug) <> '', VALUES(slug), slug),
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
		PublishStatePublished,
		0, StatusActive, TierDetailClick, 0.7,
		now, now,
		now, now,
	).Error
}

// UpsertJournalSeed 搜索曝光种子 (tier=2, 长尾)
// 不动 tier (已 1 不降级)、不递增 view_count, 只刷可变元数据
//
// publish_state 同 UpsertJournalDetail:服务端已验证的搜索结果曝光插入即
// published(维持摄取前「有出版社/ISSN 的曝光行可进 sitemap」的老行为);
// staged 摄取行出现在真实用户的搜索结果里 → 就地发布(GREATEST 只升不降)。
func (r *Repository) UpsertJournalSeed(seed *JournalSeed, slug, issnsJSON string) error {
	if seed == nil || seed.JournalID <= 0 {
		return errors.New("empty journal_id")
	}
	now := time.Now()

	return r.db.Exec(`
		INSERT INTO seo_journals
			(journal_id, slug, canonical_name, publisher, issns_json,
			 country, type, is_oa, jcr_impact_factor, jcr_quartile, openalex_h_index,
			 publish_state,
			 sitemap_page, status, quality_tier, priority,
			 first_seen_at, last_seen_at, view_count,
			 created_at, updated_at)
		VALUES
			(?, ?, ?, NULLIF(?,''), NULLIF(?,''),
			 NULLIF(?,''), NULLIF(?,''), ?, NULLIF(?,0), NULLIF(?,''), ?,
			 ?,
			 ?, ?, ?, ?,
			 ?, ?, 0,
			 ?, ?)
		ON DUPLICATE KEY UPDATE
			updated_at = IF(
				publish_state < VALUES(publish_state)
				OR canonical_name <> VALUES(canonical_name)
				OR slug <> VALUES(slug)
				OR (NULLIF(VALUES(publisher),'') IS NOT NULL
				    AND LENGTH(VALUES(publisher)) > COALESCE(LENGTH(publisher),0))
				OR (NULLIF(VALUES(issns_json),'') IS NOT NULL
				    AND LENGTH(VALUES(issns_json)) > COALESCE(LENGTH(issns_json),0)),
				CURRENT_TIMESTAMP,
				updated_at
			),
			publish_state     = GREATEST(publish_state, VALUES(publish_state)),
			last_seen_at      = VALUES(last_seen_at),
			slug              = IF(VALUES(slug) <> '', VALUES(slug), slug),
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
		PublishStatePublished,
		0, StatusActive, TierSearchSeeded, 0.5,
		now, now,
		now, now,
	).Error
}

// BackfillJournalSitemapPage 扫描 sitemap_page=0 的新行,填入正确的分页号
// updated_at 自赋值原因见 repository.go BackfillSitemapPage。
func (r *Repository) BackfillJournalSitemapPage() (int64, error) {
	res := r.db.Exec(`
		UPDATE seo_journals
		SET updated_at = updated_at, sitemap_page = FLOOR((id - 1) / ?) + 1
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
		JournalID     int64     `gorm:"column:journal_id"`
		CanonicalName string    `gorm:"column:canonical_name"`
		UpdatedAt     time.Time `gorm:"column:updated_at"`
		CreatedAt     time.Time `gorm:"column:created_at"`
		Priority      float64   `gorm:"column:priority"`
		QualityTier   int       `gorm:"column:quality_tier"`
	}
	err := r.journalSitemapRows().
		Select("journal_id, canonical_name, updated_at, created_at, priority, quality_tier").
		Where("sitemap_page = ?", page).
		Order("id").
		Find(&rows).Error
	if err != nil {
		return nil, err
	}
	out := make([]SitemapEntry, 0, len(rows))
	for _, r := range rows {
		out = append(out, SitemapEntry{
			Slug:        GenerateJournalSlug(r.CanonicalName),
			EntityID:    formatJournalID(r.JournalID),
			UpdatedAt:   r.UpdatedAt,
			CreatedAt:   r.CreatedAt,
			Priority:    r.Priority,
			QualityTier: r.QualityTier,
		})
	}
	return out, nil
}

// journalSitemapRows 是期刊 leaf、主动提交与 sitemap index 共用的 eligibility
// 单一真源。只有刊名的搜索曝光壳不进入 sitemap。
// publish_state = 1 是 2026-08-11 全量摄取加的硬前置(镜像 journalRowIndexable,
// 成对修改,sitemap_pages_test.go 钉住):staged 摄取行数据再全也不进 sitemap。
func (r *Repository) journalSitemapRows() *gorm.DB {
	return r.db.Table("seo_journals").Where(`
		status = ?
		AND publish_state = ?
		AND journal_id > 0
		AND TRIM(COALESCE(canonical_name, '')) <> ''
		AND (
			quality_tier = ?
			OR TRIM(COALESCE(publisher, '')) <> ''
			OR COALESCE(JSON_LENGTH(issns_json), 0) > 0
			OR COALESCE(jcr_impact_factor, 0) > 0
			OR COALESCE(openalex_h_index, 0) > 0
		)
	`, StatusActive, PublishStatePublished, TierDetailClick)
}

// GetJournalSitemapLastModPerPage 返回每个真实非空分页的最大 updated_at。
func (r *Repository) GetJournalSitemapLastModPerPage() (map[int]time.Time, error) {
	return sitemapPageLastMods(r.journalSitemapRows())
}

// GetJournalSitemapSummary 返回真实非空 sitemap 分片数量和最后修改时间。
// TotalPages 不能用于构造连续页号；真实页号取 GetJournalSitemapLastModPerPage 的 key。
func (r *Repository) GetJournalSitemapSummary() (*SitemapSummary, error) {
	pages, err := r.GetJournalSitemapLastModPerPage()
	if err != nil {
		return nil, err
	}
	return sitemapSummaryFromPageLastMods(pages), nil
}
