// ============================================================================
// SEO Journal Ingest Repository —— 全量摄取(seoingest)对 seo_journals 的写入面
//
// 与 repository_journal.go(有机曝光/点击路径)分开:摄取是幂等批量 resync,
// 字段面是全字段矩阵,updated_at 语义由 content_hash 决定,与有机路径的
// 「LENGTH 变长才覆盖」策略完全不同,混在一个文件里会互相污染心智。
//
// updated_at 诚实规则(0123 迁移刚修完的坑,这里是最大复发面):
//   - 哈希相同的行**零写入**(连 UPDATE 语句都不发),updated_at 物理上不可能被碰;
//   - 哈希变化才 UPDATE,updated_at = CURRENT_TIMESTAMP(页面可见内容真实变化);
//   - 发布/回滚见 PublishStagedJournals / RollbackJournalIngestBatch 的头注。
// ============================================================================

package seo

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"
)

// JournalIngestRow seoingest 映射好的一行(seo_journals 摄取字段面 + 预计算哈希)。
// 字段与 SEOJournal 的 0125 扩列一一对应;ContentHash 必填(updated_at 判据)。
type JournalIngestRow struct {
	JournalID     int64
	CanonicalName string
	Slug          string
	Publisher     string
	ISSNsJSON     string
	ISSNL         string
	Country       string
	Type          string
	IsOA          bool
	ValueTier     int

	JCRImpactFactor   float64
	JCRQuartile       string
	JCRCategory       string
	JCRYear           int
	OpenAlexHIndex    int
	SJR               string
	SJRBestQuartile   string
	ScimagoHIndex     int
	FQBMajorCategory  string
	FQBMajorQuartile  string
	FQBTop            bool
	FQBYear           int
	FQBSubcategory    string
	FQBSubQuartile    string
	XRMajorCategory   string
	XRMajorQuartile   string
	XRTop             bool
	XRYear            int
	CCFRank           string
	CCFField          string
	GJQKWarningLevel  string
	GJQKWarningWhy    string
	GJQKYear          int
	WorksCount        int
	CitedByCount      int64
	I10Index          int
	TwoYrCitedness    float64
	IsInDOAJ          bool
	HasAPC            bool
	WikidataLabelZH   string
	Inception         string
	CoverURL          string
	HasGuideline      bool
	HasLatex          bool
	LatexClass        string
	CommentCount      int
	CommentRating     float64
	FirstReviewMonths float64
	MetricsJSON       string
	ExtraJSON         string

	UpstreamBuiltAt *time.Time
	ContentHash     string
}

// JournalIngestOutcome 单行摄取结果(sync run 计数口径)。
type JournalIngestOutcome int

const (
	IngestOutcomeInserted  JournalIngestOutcome = iota // 新行(staged)
	IngestOutcomeUpdated                               // 内容真实变化, updated_at 已 bump
	IngestOutcomeUnchanged                             // 哈希相同, 零写入
	IngestOutcomeSkipped                               // issn_l 冲突等, 由调用方预检后计数
)

// journalIngestState upsert 前置状态查询的最小行。
type journalIngestState struct {
	JournalID   int64  `gorm:"column:journal_id"`
	ContentHash string `gorm:"column:content_hash"`
}

// GetJournalIngestStates 批量查一页行的现存状态(journal_id → content_hash)。
// 摄取 upsert 靠它区分 insert / update / unchanged —— 不能用「UPDATE 影响行数=0
// 则 INSERT」判存在性:go-sql-driver 的 RowsAffected 是 changed 而非 found,
// 内容未变的行会被误判为不存在。
func (r *Repository) GetJournalIngestStates(journalIDs []int64) (map[int64]string, error) {
	out := make(map[int64]string, len(journalIDs))
	if len(journalIDs) == 0 {
		return out, nil
	}
	var rows []journalIngestState
	if err := r.db.Table("seo_journals").
		Select("journal_id, content_hash").
		Where("journal_id IN ?", journalIDs).
		Find(&rows).Error; err != nil {
		return nil, err
	}
	for _, row := range rows {
		out[row.JournalID] = row.ContentHash
	}
	return out, nil
}

// ResolveJournalISSNLOwners 批量查 issn_l 的现有归属(issn_l → journal_id)。
// uk_issn_l 与 uk_journal_id 双唯一键并存时,INSERT ... ON DUPLICATE 撞上
// issn_l 键会更新**另一本刊**的行(字段嫁接事故形状),所以摄取方必须先预检:
// issn_l 已属于别的 journal_id 的行整行跳过(rows_skipped)。
func (r *Repository) ResolveJournalISSNLOwners(issnLs []string) (map[string]int64, error) {
	out := make(map[string]int64, len(issnLs))
	if len(issnLs) == 0 {
		return out, nil
	}
	var rows []struct {
		ISSNL     string `gorm:"column:issn_l"`
		JournalID int64  `gorm:"column:journal_id"`
	}
	if err := r.db.Table("seo_journals").
		Select("issn_l, journal_id").
		Where("issn_l IN ?", issnLs).
		Find(&rows).Error; err != nil {
		return nil, err
	}
	for _, row := range rows {
		out[row.ISSNL] = row.JournalID
	}
	return out, nil
}

// journalIngestContentAssignments 摄取写入的内容字段集(INSERT 与 UPDATE 共用口径)。
// 不含 publish_state / quality_tier / view_count / first_seen_at —— 那些是
// 发布闸门与有机行为字段,resync 绝不触碰。
const journalIngestColumns = `slug, canonical_name, publisher, issns_json, issn_l,
	country, type, is_oa, value_tier,
	jcr_impact_factor, jcr_quartile, jcr_category, jcr_year, openalex_h_index,
	sjr, sjr_best_quartile, scimago_h_index,
	fqb_major_category, fqb_major_quartile, fqb_top, fqb_year, fqb_subcategory, fqb_sub_quartile,
	xr_major_category_cn, xr_major_quartile, xr_top, xr_year,
	ccf_rank, ccf_field,
	gjqk_warning_level, gjqk_warning_reason, gjqk_year,
	works_count, cited_by_count, i10_index, two_yr_citedness,
	is_in_doaj, has_apc, wikidata_label_zh, inception, cover_url,
	has_guideline, has_latex, latex_class,
	comment_count, comment_rating, scirev_first_review_months,
	metrics_json, extra_json, upstream_built_at, content_hash`

// journalIngestValues 与 journalIngestColumns 一一对应的参数序列。
func journalIngestValues(row *JournalIngestRow) []any {
	return []any{
		row.Slug, row.CanonicalName, nullIfEmpty(row.Publisher), nullIfEmpty(row.ISSNsJSON), nullIfEmpty(row.ISSNL),
		nullIfEmpty(row.Country), nullIfEmpty(row.Type), row.IsOA, row.ValueTier,
		nullIfZeroF(row.JCRImpactFactor), nullIfEmpty(row.JCRQuartile), nullIfEmpty(row.JCRCategory), nullIfZero(row.JCRYear), nullIfZero(row.OpenAlexHIndex),
		nullIfEmpty(row.SJR), nullIfEmpty(row.SJRBestQuartile), nullIfZero(row.ScimagoHIndex),
		nullIfEmpty(row.FQBMajorCategory), nullIfEmpty(row.FQBMajorQuartile), row.FQBTop, nullIfZero(row.FQBYear), nullIfEmpty(row.FQBSubcategory), nullIfEmpty(row.FQBSubQuartile),
		nullIfEmpty(row.XRMajorCategory), nullIfEmpty(row.XRMajorQuartile), row.XRTop, nullIfZero(row.XRYear),
		nullIfEmpty(row.CCFRank), nullIfEmpty(row.CCFField),
		nullIfEmpty(row.GJQKWarningLevel), nullIfEmpty(row.GJQKWarningWhy), nullIfZero(row.GJQKYear),
		nullIfZero(row.WorksCount), nullIfZero64(row.CitedByCount), nullIfZero(row.I10Index), nullIfZeroF(row.TwoYrCitedness),
		row.IsInDOAJ, row.HasAPC, nullIfEmpty(row.WikidataLabelZH), nullIfEmpty(row.Inception), nullIfEmpty(row.CoverURL),
		row.HasGuideline, row.HasLatex, nullIfEmpty(row.LatexClass),
		nullIfZero(row.CommentCount), nullIfZeroF(row.CommentRating), nullIfZeroF(row.FirstReviewMonths),
		nullIfEmpty(row.MetricsJSON), nullIfEmpty(row.ExtraJSON), row.UpstreamBuiltAt, row.ContentHash,
	}
}

func nullIfEmpty(s string) any {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	return s
}

func nullIfZero(n int) any {
	if n == 0 {
		return nil
	}
	return n
}

func nullIfZero64(n int64) any {
	if n == 0 {
		return nil
	}
	return n
}

func nullIfZeroF(f float64) any {
	if f == 0 {
		return nil
	}
	return f
}

// InsertJournalIngest 摄取新行:staged(publish_state=0)、tier=2、priority=0.5。
// 调用方已预检 issn_l 归属;仍撞唯一键(理论上只剩极端竞态)时由调用方按 skipped 计数。
func (r *Repository) InsertJournalIngest(row *JournalIngestRow) error {
	if row == nil || row.JournalID <= 0 || strings.TrimSpace(row.CanonicalName) == "" {
		return errors.New("ingest insert requires journal_id and canonical_name")
	}
	now := time.Now()
	values := journalIngestValues(row)
	args := []any{row.JournalID}
	args = append(args, values...)
	args = append(args, PublishStateStaged, 0, StatusActive, TierSearchSeeded, 0.5, now, now, now, now)
	return r.db.Exec(fmt.Sprintf(`
		INSERT INTO seo_journals
			(journal_id, %s,
			 publish_state, sitemap_page, status, quality_tier, priority,
			 first_seen_at, last_seen_at, view_count,
			 created_at, updated_at)
		VALUES (?%s, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
	`, journalIngestColumns, strings.Repeat(", ?", len(values))), args...).Error
}

// UpdateJournalIngest 摄取已存在行(仅在 content_hash 变化时被调用):
// 全字段覆盖 + updated_at = CURRENT_TIMESTAMP(页面可见内容真实变化,bump 是诚实的)。
// WHERE 带 journal_id 精确匹配,绝不会写到别的刊。
func (r *Repository) UpdateJournalIngest(row *JournalIngestRow) error {
	if row == nil || row.JournalID <= 0 || strings.TrimSpace(row.CanonicalName) == "" {
		return errors.New("ingest update requires journal_id and canonical_name")
	}
	cols := strings.Split(journalIngestColumns, ",")
	assigns := make([]string, 0, len(cols)+1)
	for _, c := range cols {
		c = strings.TrimSpace(c)
		assigns = append(assigns, fmt.Sprintf("%s = ?", c))
	}
	assigns = append(assigns, "updated_at = CURRENT_TIMESTAMP")
	args := journalIngestValues(row)
	args = append(args, row.JournalID)
	return r.db.Exec(fmt.Sprintf(
		"UPDATE seo_journals SET %s WHERE journal_id = ?",
		strings.Join(assigns, ", "),
	), args...).Error
}

// journalPublishEligibleSQL 发布资格的 SQL 镜像(Go 谓词 = JournalPublishEligible,
// 成对修改;journal_publish_gate_test.go 钉住信号集合一致):
// canonical_name + (issn_l 或 publisher) + ≥2 项实质信号。
const journalPublishEligibleSQL = `
	TRIM(COALESCE(canonical_name, '')) <> ''
	AND (TRIM(COALESCE(issn_l, '')) <> '' OR TRIM(COALESCE(publisher, '')) <> '')
	AND (
		(COALESCE(jcr_impact_factor, 0) > 0)
		+ (TRIM(COALESCE(jcr_quartile, '')) <> '' OR TRIM(COALESCE(fqb_major_quartile, '')) <> ''
		   OR TRIM(COALESCE(xr_major_quartile, '')) <> '' OR TRIM(COALESCE(sjr_best_quartile, '')) <> '')
		+ (COALESCE(openalex_h_index, 0) > 0 OR COALESCE(scimago_h_index, 0) > 0)
		+ (COALESCE(works_count, 0) >= 50)
		+ (COALESCE(is_in_doaj, 0) = 1)
		+ (TRIM(COALESCE(ccf_rank, '')) <> '')
		+ (TRIM(COALESCE(gjqk_warning_level, '')) <> '')
		+ (COALESCE(comment_count, 0) > 0)
	) >= 2`

// PublishedJournalRef 发布产出的最小引用(canonical URL 构造用)。
type PublishedJournalRef struct {
	JournalID     int64  `gorm:"column:journal_id"`
	CanonicalName string `gorm:"column:canonical_name"`
}

// NextJournalIngestBatch 下一个发布批次号(现有最大值 + 1;0 保留给非批量行)。
func (r *Repository) NextJournalIngestBatch() (int, error) {
	var maxBatch int
	err := r.db.Table("seo_journals").
		Select("COALESCE(MAX(ingest_batch), 0)").
		Scan(&maxBatch).Error
	if err != nil {
		return 0, err
	}
	return maxBatch + 1, nil
}

// PublishStagedJournals 按 value_tier 升序 + journal_id 升序把「发布资格达标」的
// staged 行置为 published、打上批次号,返回本批行引用(调用方拼 URL 入推送队列)。
//
// updated_at 在此 bump:发布让页面从 noindex 转为可索引 —— 对爬虫这是该 URL 的
// 真实变化时刻,sitemap <lastmod> = 发布时间是诚实表达(行刚摄取时 created_at ≈
// updated_at,leaf 会省略 lastmod;发布这一下把它显式拉开)。
//
// tier=0 表示不过滤 tier。
func (r *Repository) PublishStagedJournals(batch, count, tier int) ([]PublishedJournalRef, error) {
	if batch <= 0 {
		return nil, errors.New("publish batch must be > 0")
	}
	if count <= 0 {
		return nil, errors.New("publish count must be > 0")
	}
	tierFilter := ""
	args := []any{batch, PublishStateStaged, StatusActive}
	if tier > 0 {
		tierFilter = " AND value_tier = ?"
		args = append(args, tier)
	}
	args = append(args, count)

	res := r.db.Exec(fmt.Sprintf(`
		UPDATE seo_journals
		SET updated_at = CURRENT_TIMESTAMP, publish_state = 1, ingest_batch = ?
		WHERE publish_state = ? AND status = ?%s
		AND %s
		ORDER BY value_tier ASC, journal_id ASC
		LIMIT ?
	`, tierFilter, journalPublishEligibleSQL), args...)
	if res.Error != nil {
		return nil, res.Error
	}
	if res.RowsAffected == 0 {
		return nil, nil
	}

	var refs []PublishedJournalRef
	err := r.db.Table("seo_journals").
		Select("journal_id, canonical_name").
		Where("ingest_batch = ? AND publish_state = ?", batch, PublishStatePublished).
		Order("journal_id").
		Find(&refs).Error
	return refs, err
}

// RollbackJournalIngestBatch 整批打回 staged。updated_at 显式自赋值(0123 双保险
// 惯例):回滚的行本就要从 sitemap 消失,没有理由制造一批新 lastmod。
// batch 必须 > 0 —— 0 是「非批量发布」(老行/有机行)的哨兵值,整批回滚会把
// 存量 1,161 刊全部打回 staged。
func (r *Repository) RollbackJournalIngestBatch(batch int) (int64, error) {
	if batch <= 0 {
		return 0, errors.New("rollback batch must be > 0")
	}
	res := r.db.Exec(`
		UPDATE seo_journals
		SET updated_at = updated_at, publish_state = 0
		WHERE ingest_batch = ? AND publish_state = 1
	`, batch)
	return res.RowsAffected, res.Error
}

// JournalIngestStats 摄取/发布状态计数(admin status 面板)。
type JournalIngestStats struct {
	Total            int64         `json:"total"`
	Staged           int64         `json:"staged"`
	Published        int64         `json:"published"`
	EligibleStaged   int64         `json:"eligible_staged"`
	TierDistribution map[int]int64 `json:"tier_distribution"`
}

// GetJournalIngestStats 一组聚合查询(全部走 0126 索引)。
func (r *Repository) GetJournalIngestStats() (*JournalIngestStats, error) {
	stats := &JournalIngestStats{TierDistribution: map[int]int64{}}

	var byState []struct {
		PublishState int   `gorm:"column:publish_state"`
		N            int64 `gorm:"column:n"`
	}
	if err := r.db.Table("seo_journals").
		Select("publish_state, COUNT(*) AS n").
		Group("publish_state").
		Find(&byState).Error; err != nil {
		return nil, err
	}
	for _, row := range byState {
		stats.Total += row.N
		switch row.PublishState {
		case PublishStateStaged:
			stats.Staged += row.N
		case PublishStatePublished:
			stats.Published += row.N
		}
	}

	var byTier []struct {
		ValueTier int   `gorm:"column:value_tier"`
		N         int64 `gorm:"column:n"`
	}
	if err := r.db.Table("seo_journals").
		Select("value_tier, COUNT(*) AS n").
		Group("value_tier").
		Find(&byTier).Error; err != nil {
		return nil, err
	}
	for _, row := range byTier {
		stats.TierDistribution[row.ValueTier] = row.N
	}

	if err := r.db.Table("seo_journals").
		Where("publish_state = ? AND status = ?", PublishStateStaged, StatusActive).
		Where(journalPublishEligibleSQL).
		Count(&stats.EligibleStaged).Error; err != nil {
		return nil, err
	}
	return stats, nil
}

// JournalIngestBatchSummary 批次历史(admin 批次表 + 回滚入口)。
type JournalIngestBatchSummary struct {
	Batch       int        `gorm:"column:batch" json:"batch"`
	Total       int64      `gorm:"column:total" json:"total"`
	Published   int64      `gorm:"column:published" json:"published"`
	PublishedAt *time.Time `gorm:"column:published_at" json:"published_at,omitempty"`
}

// ListJournalIngestBatches 按批次聚合(published=0 即已整批回滚)。
func (r *Repository) ListJournalIngestBatches() ([]JournalIngestBatchSummary, error) {
	var out []JournalIngestBatchSummary
	err := r.db.Table("seo_journals").
		Select(`ingest_batch AS batch, COUNT(*) AS total,
			SUM(publish_state = 1) AS published,
			MAX(updated_at) AS published_at`).
		Where("ingest_batch > 0").
		Group("ingest_batch").
		Order("ingest_batch DESC").
		Find(&out).Error
	return out, err
}

// ─── 发现层查询(backend-ssr 同学科推荐 / 枢纽页消费;此处只供查询,不渲染)────

// publishedJournalRows 发现层(同学科推荐 / 枢纽页)的共用基础 scope:
// **只允许消费 published 行** —— staged 行经推荐内链/枢纽列表泄漏 = 绕过发布闸门。
func (r *Repository) publishedJournalRows() *gorm.DB {
	return r.db.Table("seo_journals").
		Where("publish_state = ? AND status = ?", PublishStatePublished, StatusActive)
}

// journalCategoryScope 同学科匹配:fqb_major_category(中科院大类)优先心智,
// 同一入参对 jcr_category 也做 OR 匹配以覆盖「无中科院数据、只有 JCR 类目」的
// fallback(索引 idx_seo_journals_fqb_major / idx_seo_journals_jcr_category)。
func (r *Repository) journalCategoryScope(category string) *gorm.DB {
	return r.publishedJournalRows().
		Where("(fqb_major_category = ? OR jcr_category = ?)", category, category)
}

// ListPublishedJournalsByCategory 同学科已发布期刊(SSR「同学科推荐 6-8 刊」用)。
// 排序:tier 升序(数据价值高的先) + IF 降序,稳定尾序 journal_id。
func (r *Repository) ListPublishedJournalsByCategory(fqbMajor string, excludeID int64, limit int) ([]SEOJournal, error) {
	category := strings.TrimSpace(fqbMajor)
	if category == "" || limit <= 0 {
		return nil, nil
	}
	var out []SEOJournal
	err := r.journalCategoryScope(category).
		Where("journal_id <> ?", excludeID).
		Order("value_tier ASC, jcr_impact_factor DESC, journal_id ASC").
		Limit(limit).
		Find(&out).Error
	return out, err
}

// JournalHubFilter 枢纽页维度筛选(零值维度不过滤)。
// 一次只应设一个主维度(category / country / warning / oa),与路由一一对应。
type JournalHubFilter struct {
	FQBMajorCategory string // /journals/category/{slug} 一级:中科院大类(中文)
	JCRCategory      string // /journals/category/{slug} 二级:JCR 类目
	Country          string // /journals/country/{cc}:openalex 两位国家码
	WarningOnly      bool   // /journals/warning:gjqk_warning_level 非空
	OAOnly           bool   // /journals/oa:is_oa 或 doaj
}

// journalHubScope 枢纽页 scope 构造(与 ListJournalsForHub 分离,便于 dry-run 钉 SQL)。
func (r *Repository) journalHubScope(filter JournalHubFilter) *gorm.DB {
	scope := r.publishedJournalRows()
	if c := strings.TrimSpace(filter.FQBMajorCategory); c != "" {
		scope = scope.Where("fqb_major_category = ?", c)
	}
	if c := strings.TrimSpace(filter.JCRCategory); c != "" {
		scope = scope.Where("jcr_category = ?", c)
	}
	if c := strings.TrimSpace(filter.Country); c != "" {
		scope = scope.Where("country = ?", strings.ToUpper(c))
	}
	if filter.WarningOnly {
		scope = scope.Where("TRIM(COALESCE(gjqk_warning_level, '')) <> ''")
	}
	if filter.OAOnly {
		scope = scope.Where("(is_oa = 1 OR COALESCE(is_in_doaj, 0) = 1)")
	}
	return scope
}

// ListJournalsForHub 枢纽页列表(仅 published;路径式真分页)。
// 返回 (rows, total):total 供页脚「上一页/下一页」判断与分页 SEO;page 1-based。
func (r *Repository) ListJournalsForHub(filter JournalHubFilter, page, perPage int) ([]SEOJournal, int64, error) {
	if page <= 0 {
		page = 1
	}
	if perPage <= 0 {
		perPage = 50
	}
	scope := r.journalHubScope(filter)

	var total int64
	if err := scope.Session(&gorm.Session{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var rows []SEOJournal
	err := scope.
		Order("value_tier ASC, jcr_impact_factor DESC, journal_id ASC").
		Offset((page - 1) * perPage).
		Limit(perPage).
		Find(&rows).Error
	return rows, total, err
}
