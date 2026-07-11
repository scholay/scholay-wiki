// ============================================================================
// Scholay学术 V1.0
// SEO 作者索引库 —— 永久保留的 SEO 主数据，服务于 sitemap 和 /author/{slug} 路由
// 与 SEOPaper 同构设计：双 tier 写入路径、版本化 sitemap 缓存、slug 永久冻结。
// ============================================================================

package seo

import "time"

// SEOAuthor 对应 seo_authors 表
type SEOAuthor struct {
	ID               uint64 `gorm:"primaryKey" json:"id"`
	AuthorID         string `gorm:"size:64;not null;uniqueIndex:uk_author_id" json:"author_id"`
	Slug             string `gorm:"size:200;not null;uniqueIndex:uk_slug" json:"slug"`
	Name             string `gorm:"size:500;not null" json:"name"`
	AffiliationsJSON string `gorm:"column:affiliations;type:json" json:"-"`
	Homepage         string `gorm:"size:500" json:"homepage,omitempty"`
	PaperCount       int    `gorm:"column:paper_count;not null;default:0" json:"paper_count"`
	CitationCount    int    `gorm:"column:citation_count;not null;default:0" json:"citation_count"`
	HIndex           *int   `gorm:"column:h_index" json:"h_index,omitempty"`
	Source           string `gorm:"size:32" json:"source,omitempty"`
	// ORCID 裸 iD(形如 0000-0002-1825-0097)。来自 Minicod 作者,详情点击时持久化。
	// 供 SSR ProfilePage 的 sameAs 结构化数据 + 作者页「已验证 ORCID」链接。
	ORCID string `gorm:"column:orcid;size:32" json:"orcid,omitempty"`
	// TopWorksJSON 代表作 JSON 数组(seoenrich 从 minicod 作者论文回填)。SSR 作者页 noscript
	// 列代表作(标题+年份+期刊,带内链到论文页)+ Person JSON-LD,把「只有人名」的薄页补成实质内容。
	TopWorksJSON string `gorm:"column:top_works;type:json" json:"-"`

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
func (SEOAuthor) TableName() string {
	return "seo_authors"
}

// AuthorSeed 上游传入的种子数据（搜索曝光 / 详情点击共用）
type AuthorSeed struct {
	AuthorID      string   `json:"author_id"`
	Name          string   `json:"name"`
	Affiliations  []string `json:"affiliations,omitempty"`
	Homepage      string   `json:"homepage,omitempty"`
	PaperCount    int      `json:"paper_count,omitempty"`
	CitationCount int      `json:"citation_count,omitempty"`
	HIndex        *int     `json:"h_index,omitempty"`
	Source        string   `json:"source,omitempty"`
	// ORCID 裸 iD;有则在详情点击时旁路写入 seo_authors.orcid(不进 affiliations 长度保护逻辑)。
	ORCID string `json:"orcid,omitempty"`
}
