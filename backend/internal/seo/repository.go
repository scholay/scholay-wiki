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
// 数据降级保护（abstract / authors_json）:
//
//	早期 bug — usagelog 钩子上来的 extra_data 里 abstract 被前端截断到 500 字符,
//	authors_json 又是从 name-only 字符串拼出来的(无 authorId),
//	COALESCE(NULLIF(NEW,''), OLD) 的写法会让"短截断版"覆盖"完整版",
//	破坏 tier=2 搜索曝光时已经写入的优质数据。
//
//	现在改为长度比较: 仅当新值比旧值更长才覆盖。
//	前端已同步修复(不再截断 abstract,authors_json 直接传完整 JSON),
//	两侧合力确保 SEO 落地页拿到的是最完整的元数据。
//
// updated_at (sitemap <lastmod> 数据源) 与 abstract 实际变化保持一致:
//  1. quality_tier 由 2 升级到 1 （priority 0.5→0.7，对爬虫是有意义的变化）
//  2. title 发生变化
//  3. abstract 真的变长 (会被新值覆盖)
//
// ⚠️ updated_at 必须放在所有其它赋值之前 —— ON DUPLICATE KEY UPDATE 按左到右求值。
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
				OR (NULLIF(VALUES(abstract),'') IS NOT NULL
				    AND LENGTH(VALUES(abstract)) > COALESCE(LENGTH(abstract),0)),
				CURRENT_TIMESTAMP,
				updated_at
			),
			quality_tier   = LEAST(quality_tier, 1),
			priority       = GREATEST(priority, 0.7),
			view_count     = view_count + 1,
			last_seen_at   = VALUES(last_seen_at),
			doi            = COALESCE(VALUES(doi), doi),
			title          = VALUES(title),
			abstract       = CASE
				WHEN NULLIF(VALUES(abstract),'') IS NULL THEN abstract
				WHEN LENGTH(VALUES(abstract)) > COALESCE(LENGTH(abstract),0) THEN VALUES(abstract)
				ELSE abstract
			END,
			authors_json   = CASE
				WHEN NULLIF(VALUES(authors_json),'') IS NULL THEN authors_json
				WHEN LENGTH(VALUES(authors_json)) > COALESCE(LENGTH(authors_json),0) THEN VALUES(authors_json)
				ELSE authors_json
			END,
			year           = COALESCE(VALUES(year), year),
			venue          = COALESCE(VALUES(venue), venue),
			citation_count = GREATEST(VALUES(citation_count), citation_count),
			fields_of_study = CASE
				WHEN NULLIF(VALUES(fields_of_study),'') IS NULL THEN fields_of_study
				WHEN LENGTH(VALUES(fields_of_study)) > COALESCE(LENGTH(fields_of_study),0) THEN VALUES(fields_of_study)
				ELSE fields_of_study
			END,
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
// 数据降级保护: 与 UpsertDetail 一致 —— abstract / authors_json / fields_of_study
// 仅当新值更长时才覆盖。详细原因见 UpsertDetail 注释。
//
// updated_at 仅在 title / abstract 真的变长时才 bump,与实际写入条件保持一致。
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
				OR (NULLIF(VALUES(abstract),'') IS NOT NULL
				    AND LENGTH(VALUES(abstract)) > COALESCE(LENGTH(abstract),0)),
				CURRENT_TIMESTAMP,
				updated_at
			),
			last_seen_at   = VALUES(last_seen_at),
			doi            = COALESCE(VALUES(doi), doi),
			title          = VALUES(title),
			abstract       = CASE
				WHEN NULLIF(VALUES(abstract),'') IS NULL THEN abstract
				WHEN LENGTH(VALUES(abstract)) > COALESCE(LENGTH(abstract),0) THEN VALUES(abstract)
				ELSE abstract
			END,
			authors_json   = CASE
				WHEN NULLIF(VALUES(authors_json),'') IS NULL THEN authors_json
				WHEN LENGTH(VALUES(authors_json)) > COALESCE(LENGTH(authors_json),0) THEN VALUES(authors_json)
				ELSE authors_json
			END,
			year           = COALESCE(VALUES(year), year),
			venue          = COALESCE(VALUES(venue), venue),
			citation_count = GREATEST(VALUES(citation_count), citation_count),
			fields_of_study = CASE
				WHEN NULLIF(VALUES(fields_of_study),'') IS NULL THEN fields_of_study
				WHEN LENGTH(VALUES(fields_of_study)) > COALESCE(LENGTH(fields_of_study),0) THEN VALUES(fields_of_study)
				ELSE fields_of_study
			END,
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
//
// 多 select 一个 source 和 paper_id —— sitemap 写入的 URL 现在是
// /paper/{source}/{paperId}(SEO canonical),不再用 /paper/{slug}。
// slug 仍然 select,留给旧 /paper/{slug} legacy 301 端点反查 source+paperId 用。
func (r *Repository) ListSitemapPage(page int) ([]SitemapEntry, error) {
	if page <= 0 {
		return nil, errors.New("page must be > 0")
	}
	var rows []struct {
		Slug        string    `gorm:"column:slug"`
		Source      string    `gorm:"column:source"`
		PaperID     string    `gorm:"column:paper_id"`
		UpdatedAt   time.Time `gorm:"column:updated_at"`
		Priority    float64   `gorm:"column:priority"`
		QualityTier int       `gorm:"column:quality_tier"`
	}
	// 只把「有实质内容」的论文写进 sitemap,不再主动向爬虫提交仅标题的薄页。
	//   - 有 abstract → 一定收(noscript / JSON-LD 能给出真实正文,可排名 / 可被 AI 引用)
	//   - quality_tier=1(详情点击,真实用户到访过)→ 即使暂无 abstract 也保留(数量小、非批量长尾)
	// 过滤掉的是 tier=2 搜索种子里无 abstract 的部分 —— 正是「规模化 thin content」降权风险来源。
	// 注:分页仍按预计算的 sitemap_page 列,过滤后单页 URL 数变少(合法),不额外重排。
	// OR 条件用显式括号写进同一个 Where，不依赖 GORM 对多段 Where 的括号化(不同版本行为不一,
	// 漏括号会让 `AND ... OR ...` 优先级错乱)。
	err := r.paperSitemapRows().
		Select("slug, source, paper_id, updated_at, priority, quality_tier").
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
			EntityID:    r.PaperID,
			UpdatedAt:   r.UpdatedAt,
			Priority:    r.Priority,
			QualityTier: r.QualityTier,
		})
	}
	return out, nil
}

// paperSitemapRows 是论文 leaf 与 sitemap index 共用的 eligibility 单一真源。
// 任何改动都必须同时影响 ListSitemapPage 和 GetSitemapLastModPerPage，避免 index
// 发布一个 leaf 实际为空的页，或遗漏真实有内容的页。
func (r *Repository) paperSitemapRows() *gorm.DB {
	return r.db.Table("seo_papers").
		Where("status = ? AND source IN ? AND TRIM(COALESCE(paper_id, '')) <> '' AND TRIM(COALESCE(title, '')) <> '' AND (TRIM(COALESCE(abstract, '')) <> '' OR quality_tier = ?)", StatusActive, []string{SourceSTC, SourceOLX, SourcePMD}, TierDetailClick)
}

type sitemapPageLastModRow struct {
	Page    int       `gorm:"column:sitemap_page"`
	LastMod time.Time `gorm:"column:last_mod"`
}

// sitemapPageLastModQuery 枚举 scope 中真实存在的非空 sitemap_page。
// sitemap_page 是按持久化 id 区间分桶，可能因删除/失效产生缺号，因此调用方必须
// 使用返回 map 的真实 key，禁止再由 COUNT 推导 1..N 连续页。
func sitemapPageLastModQuery(scope *gorm.DB) *gorm.DB {
	return scope.
		Select("sitemap_page, MAX(updated_at) AS last_mod").
		Where("sitemap_page > 0").
		Group("sitemap_page").
		Order("sitemap_page")
}

func sitemapPageLastMods(scope *gorm.DB) (map[int]time.Time, error) {
	var rows []sitemapPageLastModRow
	if err := sitemapPageLastModQuery(scope).Scan(&rows).Error; err != nil {
		return nil, err
	}
	out := make(map[int]time.Time, len(rows))
	for _, row := range rows {
		out[row.Page] = row.LastMod
	}
	return out, nil
}

func sitemapSummaryFromPageLastMods(pages map[int]time.Time) *SitemapSummary {
	summary := &SitemapSummary{TotalPages: len(pages)}
	for _, lastMod := range pages {
		if lastMod.After(summary.LastMod) {
			summary.LastMod = lastMod
		}
	}
	return summary
}

// GetSitemapLastModPerPage 返回每个真实非空分页的最大 updated_at。
// map key 同时就是主 sitemap 必须枚举的真实页号。
func (r *Repository) GetSitemapLastModPerPage() (map[int]time.Time, error) {
	return sitemapPageLastMods(r.paperSitemapRows())
}

// ListTopPaperPaths 返回最值得主动推送的论文 **canonical 路径** /paper/{source}/{id}
// (按 quality_tier 升序 + view_count 降序)。用于首次接入主动 SEO 提交时打底。
// 返回 canonical 而非 legacy /paper/{slug},避免推送时被 301(rank 12)。source/id 缺失时回落 slug。
//
//	limit: 最多返回多少条;0 或负值表示不查
func (r *Repository) ListTopPaperPaths(limit int) ([]string, error) {
	if limit <= 0 {
		return nil, nil
	}
	var rows []struct {
		Slug    string `gorm:"column:slug"`
		Source  string `gorm:"column:source"`
		PaperID string `gorm:"column:paper_id"`
	}
	err := r.paperSitemapRows().
		Select("slug, source, paper_id").
		Where("slug <> ''").
		Order("quality_tier ASC, view_count DESC, id ASC"). // tier=1 优先,然后看人气
		Limit(limit).
		Find(&rows).Error
	if err != nil {
		return nil, err
	}
	out := make([]string, 0, len(rows))
	for _, row := range rows {
		if p := paperCanonicalPath(row.Source, row.PaperID); p != "" {
			out = append(out, p)
		} else if row.Slug != "" {
			out = append(out, "/paper/"+row.Slug)
		}
	}
	return out, nil
}

// GetSitemapSummary 返回真实非空 sitemap 分片数量和最后修改时间。
// TotalPages 仅是非空分片数量，不能用于构造 1..N；真实页号必须取
// GetSitemapLastModPerPage 的 map key。
func (r *Repository) GetSitemapSummary() (*SitemapSummary, error) {
	pages, err := r.GetSitemapLastModPerPage()
	if err != nil {
		return nil, err
	}
	return sitemapSummaryFromPageLastMods(pages), nil
}

// calcSitemapPage 由 id 计算所属分页（1-based）。新行 id 未知时返回 0（由 BackfillSitemapPage 事后修正）
func calcSitemapPage(id uint64) int {
	if id == 0 {
		return 0
	}
	return int((id-1)/URLsPerSitemapPage) + 1
}
