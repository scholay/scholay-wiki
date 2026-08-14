// ============================================================================
// Scholay学术 V1.0
// SEO 期刊索引库 —— 永久保留的 SEO 主数据，服务于 sitemap 和 /journal/{id}/{slug} 路由
// 与 SEOPaper / SEOAuthor 同构: 双 tier 写入路径、版本化 sitemap 缓存。期刊 URL 已有
// journal_id 消歧，slug 随 canonical_name 更名而更新，旧路径由 SSR 301 归一。
// 差异点: URL 形态 /journal/{id}/{slug}, id 是 BIGINT 主键(不是 string),slug 仅作辅助。
// ============================================================================

package seo

import "time"

// publish_state 定义 (0125):批量摄取行的发布闸门。
// staged 行三不:不进 sitemap、SSR noindex、不主动推送 —— journalRowIndexable(Go)
// 与 journalSitemapRows(SQL)成对以 publish_state=1 为硬前置。
// 有机路径(搜索曝光/详情点击,服务端已验证的 minicod 数据)插入即 published,
// 与摄取前的行为一致;只有 seoingest 批量摄取的新行落在 staged。
const (
	PublishStateStaged    = 0
	PublishStatePublished = 1
)

// value_tier 定义 (0125):发布节奏按数据价值分层,升序放行。
const (
	JournalTierPartitioned  = 1 // jcr / 中科院 / 新锐 有分区
	JournalTierScimagoCCF   = 2 // scimago / ccf
	JournalTierOA           = 3 // doaj / OA
	JournalTierOpenAlexOnly = 4 // 仅 openalex 体量数据
	JournalTierUnrated      = 9 // 未评(摄取前的存量老行)
)

// SEOJournal 对应 seo_journals 表
//
// 0125 起扩出「全量摄取」字段面:发布闸门(publish_state/ingest_batch/value_tier)、
// 指标矩阵(JCR/中科院/新锐/SCImago/CCF)、预警、OpenAlex 体量、投稿参考与压缩
// 趋势 JSON。可空数值列用值类型接收(GORM 对 NULL 落零值,与 JCRImpactFactor 同例),
// 谓词按「>0 / 非空」判断,零值即缺失。
type SEOJournal struct {
	ID              uint64  `gorm:"primaryKey" json:"id"`
	JournalID       int64   `gorm:"column:journal_id;not null;uniqueIndex:uk_journal_id" json:"journal_id"`
	Slug            string  `gorm:"size:220;not null;default:''" json:"slug"`
	CanonicalName   string  `gorm:"column:canonical_name;size:500;not null" json:"canonical_name"`
	Publisher       string  `gorm:"size:500" json:"publisher,omitempty"`
	ISSNsJSON       string  `gorm:"column:issns_json;type:json" json:"-"`
	Country         string  `gorm:"size:64" json:"country,omitempty"`
	Type            string  `gorm:"size:64" json:"type,omitempty"`
	IsOA            bool    `gorm:"column:is_oa;not null;default:0" json:"is_oa"`
	JCRImpactFactor float64 `gorm:"column:jcr_impact_factor;type:decimal(8,3)" json:"jcr_impact_factor,omitempty"`
	JCRQuartile     string  `gorm:"column:jcr_quartile;size:8" json:"jcr_quartile,omitempty"`
	OpenAlexHIndex  *int    `gorm:"column:openalex_h_index" json:"openalex_h_index,omitempty"`

	// ── 发布闸门 (0125) ──
	PublishState int    `gorm:"column:publish_state;not null;default:0" json:"publish_state"`
	IngestBatch  int    `gorm:"column:ingest_batch;not null;default:0" json:"ingest_batch"`
	ValueTier    int    `gorm:"column:value_tier;not null;default:9" json:"value_tier"`
	ISSNL        string `gorm:"column:issn_l;size:16" json:"issn_l,omitempty"`

	// ── 指标矩阵 (0125) ──
	JCRCategory      string  `gorm:"column:jcr_category;size:255" json:"jcr_category,omitempty"`
	JCRYear          int     `gorm:"column:jcr_year" json:"jcr_year,omitempty"`
	SJR              string  `gorm:"column:sjr;size:32" json:"sjr,omitempty"`
	SJRBestQuartile  string  `gorm:"column:sjr_best_quartile;size:8" json:"sjr_best_quartile,omitempty"`
	ScimagoHIndex    int     `gorm:"column:scimago_h_index" json:"scimago_h_index,omitempty"`
	FQBMajorCategory string  `gorm:"column:fqb_major_category;size:64" json:"fqb_major_category,omitempty"`
	FQBMajorQuartile string  `gorm:"column:fqb_major_quartile;size:8" json:"fqb_major_quartile,omitempty"`
	FQBTop           bool    `gorm:"column:fqb_top" json:"fqb_top,omitempty"`
	FQBYear          int     `gorm:"column:fqb_year" json:"fqb_year,omitempty"`
	FQBSubcategory   string  `gorm:"column:fqb_subcategory;size:128" json:"fqb_subcategory,omitempty"`
	FQBSubQuartile   string  `gorm:"column:fqb_sub_quartile;size:8" json:"fqb_sub_quartile,omitempty"`
	XRMajorCategory  string  `gorm:"column:xr_major_category_cn;size:64" json:"xr_major_category_cn,omitempty"`
	XRMajorQuartile  string  `gorm:"column:xr_major_quartile;size:8" json:"xr_major_quartile,omitempty"`
	XRTop            bool    `gorm:"column:xr_top" json:"xr_top,omitempty"`
	XRYear           int     `gorm:"column:xr_year" json:"xr_year,omitempty"`
	CCFRank          string  `gorm:"column:ccf_rank;size:8" json:"ccf_rank,omitempty"`
	CCFField         string  `gorm:"column:ccf_field;size:64" json:"ccf_field,omitempty"`
	GJQKWarningLevel string  `gorm:"column:gjqk_warning_level;size:16" json:"gjqk_warning_level,omitempty"`
	GJQKWarningWhy   string  `gorm:"column:gjqk_warning_reason;size:255" json:"gjqk_warning_reason,omitempty"`
	GJQKYear         int     `gorm:"column:gjqk_year" json:"gjqk_year,omitempty"`
	WorksCount       int     `gorm:"column:works_count" json:"works_count,omitempty"`
	CitedByCount     int64   `gorm:"column:cited_by_count" json:"cited_by_count,omitempty"`
	I10Index         int     `gorm:"column:i10_index" json:"i10_index,omitempty"`
	TwoYrCitedness   float64 `gorm:"column:two_yr_citedness;type:decimal(8,3)" json:"two_yr_citedness,omitempty"`

	// ── OA / 身份 / 投稿参考 (0125) ──
	IsInDOAJ          bool       `gorm:"column:is_in_doaj" json:"is_in_doaj,omitempty"`
	HasAPC            bool       `gorm:"column:has_apc" json:"has_apc,omitempty"`
	WikidataLabelZH   string     `gorm:"column:wikidata_label_zh;size:255" json:"wikidata_label_zh,omitempty"`
	Inception         string     `gorm:"column:inception;size:16" json:"inception,omitempty"`
	CoverURL          string     `gorm:"column:cover_url;size:512" json:"cover_url,omitempty"`
	HasGuideline      bool       `gorm:"column:has_guideline" json:"has_guideline,omitempty"`
	HasLatex          bool       `gorm:"column:has_latex" json:"has_latex,omitempty"`
	LatexClass        string     `gorm:"column:latex_class;size:64" json:"latex_class,omitempty"`
	CommentCount      int        `gorm:"column:comment_count" json:"comment_count,omitempty"`
	CommentRating     float64    `gorm:"column:comment_rating;type:decimal(3,2)" json:"comment_rating,omitempty"`
	FirstReviewMonths float64    `gorm:"column:scirev_first_review_months;type:decimal(5,2)" json:"scirev_first_review_months,omitempty"`
	MetricsJSON       string     `gorm:"column:metrics_json;type:json" json:"-"`
	ExtraJSON         string     `gorm:"column:extra_json;type:json" json:"-"`
	UpstreamBuiltAt   *time.Time `gorm:"column:upstream_built_at" json:"upstream_built_at,omitempty"`
	ContentHash       string     `gorm:"column:content_hash;size:40" json:"-"`

	SitemapPage int     `gorm:"column:sitemap_page;not null;default:0" json:"sitemap_page"`
	Status      int     `gorm:"not null;default:1" json:"status"`
	QualityTier int     `gorm:"column:quality_tier;not null;default:2" json:"quality_tier"`
	Priority    float64 `gorm:"type:decimal(2,1);not null;default:0.5" json:"priority"`

	FirstSeenAt time.Time `gorm:"column:first_seen_at;not null" json:"first_seen_at"`
	LastSeenAt  time.Time `gorm:"column:last_seen_at;not null" json:"last_seen_at"`
	ViewCount   int       `gorm:"column:view_count;not null;default:0" json:"view_count"`

	CreatedAt time.Time `gorm:"column:created_at" json:"created_at"`
	UpdatedAt time.Time `gorm:"column:updated_at" json:"updated_at"`
}

// TableName 指定表名
func (SEOJournal) TableName() string {
	return "seo_journals"
}

// JournalSeed 上游传入的种子数据 (搜索曝光 / 详情点击共用)
//   - 字段尽量从 minicod.Journal 平移过来,只截选 SEO 渲染需要的子集
//   - JournalID 必填,其它字段尽力而为 (缺失会按 SQL 默认值处理)
type JournalSeed struct {
	JournalID       int64    `json:"journal_id"`
	CanonicalName   string   `json:"canonical_name"`
	Publisher       string   `json:"publisher,omitempty"`
	ISSNs           []string `json:"issns,omitempty"`
	Country         string   `json:"country,omitempty"`
	Type            string   `json:"type,omitempty"`
	IsOA            bool     `json:"is_oa,omitempty"`
	JCRImpactFactor float64  `json:"jcr_impact_factor,omitempty"`
	JCRQuartile     string   `json:"jcr_quartile,omitempty"`
	OpenAlexHIndex  *int     `json:"openalex_h_index,omitempty"`
}
