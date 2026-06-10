// ============================================================================
// Scholay学术 V1.0
// SEO 论文索引库 —— 永久保留的 SEO 主数据，服务于 sitemap 和 /paper/{slug} 路由
// ============================================================================

package seo

import "time"

// SEO 调度常量
const (
	// 每页最大 URL 数。sitemap 协议上限 5 万/页，我们严格按此切分。
	URLsPerSitemapPage = 50000

	// quality_tier 定义
	TierDetailClick  = 1 // 用户点击过详情页
	TierSearchSeeded = 2 // 仅搜索曝光（长尾种子）

	// status 定义
	StatusActive = 1
	StatusHidden = 0
	StatusDead   = 2

	// Tier 升级阈值：tier=2 被再次点击即升级到 tier=1
	// (由 view_count 的第一次递增触发，不设数值门槛)

	// Search 曝光单次批量 upsert 上限（防止单次请求写入过大）
	SearchSeedBatchLimit = 20
)

// SEOPaper 对应 seo_papers 表
type SEOPaper struct {
	ID            uint64 `gorm:"primaryKey" json:"id"`
	PaperID       string `gorm:"size:64;not null;uniqueIndex:uk_paper_id" json:"paper_id"`
	Slug          string `gorm:"size:200;not null;uniqueIndex:uk_slug" json:"slug"`
	DOI           string `gorm:"size:255" json:"doi,omitempty"`
	Title         string `gorm:"size:1024;not null" json:"title"`
	Abstract      string `gorm:"type:text" json:"abstract,omitempty"`
	AuthorsJSON   string `gorm:"column:authors_json;type:json" json:"-"`
	Year          *int   `json:"year,omitempty"`
	Venue         string `gorm:"size:500" json:"venue,omitempty"`
	CitationCount int    `gorm:"not null;default:0" json:"citation_count"`
	FieldsOfStudy string `gorm:"column:fields_of_study;type:json" json:"-"`
	Source        string `gorm:"size:32" json:"source,omitempty"`

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
func (SEOPaper) TableName() string {
	return "seo_papers"
}

// PaperSeed 前端/usagelog 传入的种子数据（两种写入路径共用）
type PaperSeed struct {
	PaperID       string   `json:"paper_id"`
	DOI           string   `json:"doi,omitempty"`
	Title         string   `json:"title"`
	Abstract      string   `json:"abstract,omitempty"`
	Authors       []Author `json:"authors,omitempty"`
	Year          *int     `json:"year,omitempty"`
	Venue         string   `json:"venue,omitempty"`
	CitationCount int      `json:"citation_count,omitempty"`
	FieldsOfStudy []string `json:"fields_of_study,omitempty"`
	Source        string   `json:"source,omitempty"`
}

// Author 作者精简结构（仅保留 SEO 需要的字段）
type Author struct {
	Name     string `json:"name"`
	AuthorID string `json:"authorId,omitempty"`
}

// SitemapEntry sitemap 生成所需的最小字段集（论文/作者通用）
// QualityTier 用于按 tier 区分 <changefreq>（tier=1 weekly / tier=2 monthly）。
//
// URL 构造(2026-05 改为 SEO canonical 后):
//
//	论文 → /paper/{Source}/{EntityID}   ← Source/EntityID 来自 seo_papers
//	学者 → /author/{Source}/{EntityID}  ← Source/EntityID 来自 seo_authors
//	期刊 → /journal/{EntityID}          ← 暂未实现,Source 留空,EntityID 是 journal id
//
// Slug 字段保留 —— 旧 /paper/{slug} legacy 301 端点要用它做反查。
type SitemapEntry struct {
	Slug        string
	Source      string // 'stc' / 'olx' / 'pmd'(期刊空)
	EntityID    string // 论文/学者的上游 paper_id/author_id;期刊的 journal id 字符串化
	UpdatedAt   time.Time
	Priority    float64
	QualityTier int
}

// SitemapSummary /sitemap.xml 索引页需要的 meta
type SitemapSummary struct {
	TotalPages int       // 分页总数
	LastMod    time.Time // 最新 updated_at（用作索引页 <lastmod>）
}
