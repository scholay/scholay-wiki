// ============================================================================
// SEO Author Repository —— seo_authors 的 CRUD 与批量 upsert
// 行为镜像 repository.go 中 paper 部分;
// updated_at 同样仅在 name / affiliations 真实变化时 bump,避免误导爬虫。
// ============================================================================

package seo

import (
	"errors"
	"time"

	"gorm.io/gorm"
)

// UpsertAuthorDetail 用户点击作者详情页（tier=1，高质量）
//
// 数据降级保护: affiliations 仅当新值更长时才覆盖。
// 同 UpsertDetail —— 避免某条短数据来源覆盖此前更完整的版本。
//
// updated_at (sitemap <lastmod> 数据源) 仅在以下情况才 bump:
//  1. quality_tier 由 2 升级到 1
//  2. name 变化
//  3. affiliations 真的变长 (会被新值覆盖)
func (r *Repository) UpsertAuthorDetail(seed *AuthorSeed, slug, affiliationsJSON string) error {
	if seed == nil || seed.AuthorID == "" {
		return errors.New("empty author_id")
	}
	now := time.Now()

	return r.db.Exec(`
		INSERT INTO seo_authors
			(author_id, slug, name, affiliations, homepage,
			 paper_count, citation_count, h_index, source,
			 sitemap_page, status, quality_tier, priority,
			 first_seen_at, last_seen_at, view_count,
			 created_at, updated_at)
		VALUES
			(?, ?, ?, NULLIF(?,''), NULLIF(?,''),
			 ?, ?, ?, NULLIF(?,''),
			 ?, ?, ?, ?,
			 ?, ?, 1,
			 ?, ?)
		ON DUPLICATE KEY UPDATE
			updated_at = IF(
				quality_tier = 2
				OR name <> VALUES(name)
				OR (NULLIF(VALUES(affiliations),'') IS NOT NULL
				    AND LENGTH(VALUES(affiliations)) > COALESCE(LENGTH(affiliations),0)),
				CURRENT_TIMESTAMP,
				updated_at
			),
			quality_tier   = LEAST(quality_tier, 1),
			priority       = GREATEST(priority, 0.7),
			view_count     = view_count + 1,
			last_seen_at   = VALUES(last_seen_at),
			name           = VALUES(name),
			affiliations   = CASE
				WHEN NULLIF(VALUES(affiliations),'') IS NULL THEN affiliations
				WHEN LENGTH(VALUES(affiliations)) > COALESCE(LENGTH(affiliations),0) THEN VALUES(affiliations)
				ELSE affiliations
			END,
			homepage       = COALESCE(VALUES(homepage), homepage),
			paper_count    = GREATEST(VALUES(paper_count), paper_count),
			citation_count = GREATEST(VALUES(citation_count), citation_count),
			h_index        = COALESCE(VALUES(h_index), h_index),
			source         = COALESCE(VALUES(source), source)
	`,
		seed.AuthorID, slug, seed.Name, affiliationsJSON, seed.Homepage,
		seed.PaperCount, seed.CitationCount, seed.HIndex, seed.Source,
		0, StatusActive, TierDetailClick, 0.7,
		now, now,
		now, now,
	).Error
}

// UpsertAuthorSeed 搜索曝光种子（tier=2，长尾）
// 行为：
//   - 新行：tier=2 写入
//   - 老行：不动 tier，只刷新可变元数据；view_count 不递增
//   - affiliations 长度保护(同 UpsertAuthorDetail)
//   - updated_at 仅在 name 变化 / affiliations 变长时 bump
func (r *Repository) UpsertAuthorSeed(seed *AuthorSeed, slug, affiliationsJSON string) error {
	if seed == nil || seed.AuthorID == "" {
		return errors.New("empty author_id")
	}
	now := time.Now()

	return r.db.Exec(`
		INSERT INTO seo_authors
			(author_id, slug, name, affiliations, homepage,
			 paper_count, citation_count, h_index, source,
			 sitemap_page, status, quality_tier, priority,
			 first_seen_at, last_seen_at, view_count,
			 created_at, updated_at)
		VALUES
			(?, ?, ?, NULLIF(?,''), NULLIF(?,''),
			 ?, ?, ?, NULLIF(?,''),
			 ?, ?, ?, ?,
			 ?, ?, 0,
			 ?, ?)
		ON DUPLICATE KEY UPDATE
			updated_at = IF(
				name <> VALUES(name)
				OR (NULLIF(VALUES(affiliations),'') IS NOT NULL
				    AND LENGTH(VALUES(affiliations)) > COALESCE(LENGTH(affiliations),0)),
				CURRENT_TIMESTAMP,
				updated_at
			),
			last_seen_at   = VALUES(last_seen_at),
			name           = VALUES(name),
			affiliations   = CASE
				WHEN NULLIF(VALUES(affiliations),'') IS NULL THEN affiliations
				WHEN LENGTH(VALUES(affiliations)) > COALESCE(LENGTH(affiliations),0) THEN VALUES(affiliations)
				ELSE affiliations
			END,
			homepage       = COALESCE(VALUES(homepage), homepage),
			paper_count    = GREATEST(VALUES(paper_count), paper_count),
			citation_count = GREATEST(VALUES(citation_count), citation_count),
			h_index        = COALESCE(VALUES(h_index), h_index),
			source         = COALESCE(VALUES(source), source)
	`,
		seed.AuthorID, slug, seed.Name, affiliationsJSON, seed.Homepage,
		seed.PaperCount, seed.CitationCount, seed.HIndex, seed.Source,
		0, StatusActive, TierSearchSeeded, 0.5,
		now, now,
		now, now,
	).Error
}

// SetAuthorORCID 旁路写入 ORCID —— 独立于主 upsert 的幂等小更新,避免改动那段
// 手工对齐参数的原始 SQL。仅在当前 orcid 为空时写(首次拿到即固化,不反复覆盖),
// 且不 bump updated_at(ORCID 不改变 sitemap 新鲜度语义)。
func (r *Repository) SetAuthorORCID(authorID, orcid string) error {
	if authorID == "" || orcid == "" {
		return nil
	}
	// updated_at 显式自赋值:否则 ON UPDATE CURRENT_TIMESTAMP 会 bump lastmod,
	// 与本函数「不改变 sitemap 新鲜度语义」的承诺相反(2026-08-10 审计修正)。
	return r.db.Exec(`
		UPDATE seo_authors
		SET updated_at = updated_at, orcid = ?
		WHERE author_id = ? AND (orcid IS NULL OR orcid = '')
	`, orcid, authorID).Error
}

// BackfillAuthorSitemapPage 扫描 sitemap_page=0 的新行，填入正确的分页号
// updated_at 自赋值原因见 BackfillSitemapPage。
func (r *Repository) BackfillAuthorSitemapPage() (int64, error) {
	res := r.db.Exec(`
		UPDATE seo_authors
		SET updated_at = updated_at, sitemap_page = FLOOR((id - 1) / ?) + 1
		WHERE sitemap_page = 0 AND status = 1
	`, URLsPerSitemapPage)
	return res.RowsAffected, res.Error
}

// GetAuthorBySlug 路由解析（SSR / 前端解析用）
func (r *Repository) GetAuthorBySlug(slug string) (*SEOAuthor, error) {
	var a SEOAuthor
	err := r.db.Where("slug = ?", slug).First(&a).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &a, nil
}

// GetAuthorByAuthorID 通过 authorId 查询（兜底）
func (r *Repository) GetAuthorByAuthorID(authorID string) (*SEOAuthor, error) {
	var a SEOAuthor
	err := r.db.Where("author_id = ?", authorID).First(&a).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &a, nil
}

// ListAuthorSitemapPage 读取指定分页的 sitemap 条目
//
// 同时取 source + author_id —— sitemap URL 采用 canonical `/author/{source}/{authorId}`,
// slug 仍保留以支持 legacy `/author/:slug` 反查。
func (r *Repository) ListAuthorSitemapPage(page int) ([]SitemapEntry, error) {
	if page <= 0 {
		return nil, errors.New("page must be > 0")
	}
	var rows []struct {
		Slug        string    `gorm:"column:slug"`
		Source      string    `gorm:"column:source"`
		AuthorID    string    `gorm:"column:author_id"`
		UpdatedAt   time.Time `gorm:"column:updated_at"`
		CreatedAt   time.Time `gorm:"column:created_at"`
		Priority    float64   `gorm:"column:priority"`
		QualityTier int       `gorm:"column:quality_tier"`
	}
	err := r.authorSitemapRows().
		Select("slug, source, author_id, updated_at, created_at, priority, quality_tier").
		Where("sitemap_page = ?", page).
		Order("id").
		Find(&rows).Error
	if err != nil {
		return nil, err
	}
	out := make([]SitemapEntry, 0, len(rows))
	for _, r := range rows {
		out = append(out, SitemapEntry{
			Slug:        r.Slug,
			Source:      r.Source,
			EntityID:    r.AuthorID,
			UpdatedAt:   r.UpdatedAt,
			CreatedAt:   r.CreatedAt,
			Priority:    r.Priority,
			QualityTier: r.QualityTier,
		})
	}
	return out, nil
}

// authorSitemapRows 是作者 leaf、主动提交与 sitemap index 共用的 eligibility
// 单一真源(必须与 eligibility.go authorRowIndexable 保持逐条一致)。
// 2026-08-10 审计收紧:纯指标行(仅 paper_count/citation_count/h_index)不再入选 ——
// 它们渲染出来只有「姓名 + 三个数字」的薄页,线上 2.6 万条 stc 作者属此类,
// 是索引质量的最大拖累。enrich 补齐 top_works / affiliations 后自动恢复资格。
func (r *Repository) authorSitemapRows() *gorm.DB {
	return r.db.Table("seo_authors").Where(`
		status = ?
		AND source IN ?
		AND TRIM(COALESCE(author_id, '')) <> ''
		AND TRIM(COALESCE(name, '')) <> ''
		AND (
			quality_tier = ?
			OR COALESCE(JSON_LENGTH(affiliations), 0) > 0
			OR TRIM(COALESCE(homepage, '')) <> ''
			OR TRIM(COALESCE(orcid, '')) <> ''
			OR COALESCE(JSON_LENGTH(top_works), 0) > 0
		)
	`, StatusActive, []string{SourceSTC, SourceOLX, SourcePMD}, TierDetailClick)
}

// ListTopAuthorPaths 返回最值得主动推送的作者 canonical 路径 /author/{source}/{id}
// (同 ListTopPaperPaths 思路;canonical 避免推送被 301,source/id 缺失回落 slug)。
func (r *Repository) ListTopAuthorPaths(limit int) ([]string, error) {
	if limit <= 0 {
		return nil, nil
	}
	var rows []struct {
		Slug     string `gorm:"column:slug"`
		Source   string `gorm:"column:source"`
		AuthorID string `gorm:"column:author_id"`
	}
	err := r.authorSitemapRows().
		Select("slug, source, author_id").
		Where("slug <> ''").
		Order("quality_tier ASC, view_count DESC, id ASC").
		Limit(limit).
		Find(&rows).Error
	if err != nil {
		return nil, err
	}
	out := make([]string, 0, len(rows))
	for _, row := range rows {
		if p := authorCanonicalPath(row.Source, row.AuthorID); p != "" {
			out = append(out, p)
		} else if row.Slug != "" {
			out = append(out, "/author/"+row.Slug)
		}
	}
	return out, nil
}

// GetAuthorSitemapLastModPerPage 返回每个真实非空分页的最大 updated_at。
// 真实页号允许有缺口（例如只有 page 1、2、4），调用方必须枚举 map key。
func (r *Repository) GetAuthorSitemapLastModPerPage() (map[int]time.Time, error) {
	return sitemapPageLastMods(r.authorSitemapRows())
}

// GetAuthorSitemapSummary 返回真实非空 sitemap 分片数量和最后修改时间。
// TotalPages 不能用于构造连续页号；真实页号取 GetAuthorSitemapLastModPerPage 的 key。
func (r *Repository) GetAuthorSitemapSummary() (*SitemapSummary, error) {
	pages, err := r.GetAuthorSitemapLastModPerPage()
	if err != nil {
		return nil, err
	}
	return sitemapSummaryFromPageLastMods(pages), nil
}
