// ============================================================================
// Scholay学术 V1.0
// SEO 期刊索引库 —— 永久保留的 SEO 主数据，服务于 sitemap 和 /journal/{id}/{slug} 路由
// 与 SEOPaper / SEOAuthor 同构: 双 tier 写入路径、版本化 sitemap 缓存、slug 永久冻结。
// 差异点: URL 形态 /journal/{id}/{slug}, id 是 BIGINT 主键(不是 string),slug 仅作辅助。
// ============================================================================

package seo

import "time"

// SEOJournal 对应 seo_journals 表
type SEOJournal struct {
	ID               uint64  `gorm:"primaryKey" json:"id"`
	JournalID        int64   `gorm:"column:journal_id;not null;uniqueIndex:uk_journal_id" json:"journal_id"`
	Slug             string  `gorm:"size:220;not null;default:''" json:"slug"`
	CanonicalName    string  `gorm:"column:canonical_name;size:500;not null" json:"canonical_name"`
	Publisher        string  `gorm:"size:500" json:"publisher,omitempty"`
	ISSNsJSON        string  `gorm:"column:issns_json;type:json" json:"-"`
	Country          string  `gorm:"size:64" json:"country,omitempty"`
	Type             string  `gorm:"size:64" json:"type,omitempty"`
	IsOA             bool    `gorm:"column:is_oa;not null;default:0" json:"is_oa"`
	JCRImpactFactor  float64 `gorm:"column:jcr_impact_factor;type:decimal(8,3)" json:"jcr_impact_factor,omitempty"`
	JCRQuartile      string  `gorm:"column:jcr_quartile;size:8" json:"jcr_quartile,omitempty"`
	OpenAlexHIndex   *int    `gorm:"column:openalex_h_index" json:"openalex_h_index,omitempty"`

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
