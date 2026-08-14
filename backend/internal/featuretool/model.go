// ============================================================================
// 功能广场 (学术工具黄页) —— GORM 模型
//
// 嵌套/可变字段统一用 gorm `serializer:json` 落 JSON 列, 与
// docker/mysql/migrations/0010_feature_tools.sql 的列一一对应。表由 SQL 迁移建,
// 本包不做 AutoMigrate。
// ============================================================================

package featuretool

import "time"

// Tool 工具主记录。
type Tool struct {
	ID               uint64        `gorm:"primaryKey" json:"id"`
	Slug             string        `gorm:"column:slug" json:"slug"`
	SourceTopicID    *int64        `gorm:"column:source_topic_id" json:"source_topic_id,omitempty"`
	SourceURL        string        `gorm:"column:source_url" json:"source_url,omitempty"`
	SourceCategoryID *int          `gorm:"column:source_category_id" json:"source_category_id,omitempty"`
	Name             string        `gorm:"column:name" json:"name"`
	NameEn           string        `gorm:"column:name_en" json:"name_en,omitempty"`
	Aliases          []string      `gorm:"column:aliases;serializer:json" json:"aliases"`
	Logo             string        `gorm:"column:logo" json:"logo,omitempty"`
	Tagline          string        `gorm:"column:tagline" json:"tagline,omitempty"`
	DescriptionMD    string        `gorm:"column:description_md" json:"description_md,omitempty"`
	Category         string        `gorm:"column:category" json:"category"`
	CategoryLabel    string        `gorm:"column:category_label" json:"category_label,omitempty"`
	Tags             []string      `gorm:"column:tags;serializer:json" json:"tags"`
	PriceType        string        `gorm:"column:price_type" json:"price_type"`
	IsOpenSource     *bool         `gorm:"column:is_open_source" json:"is_open_source,omitempty"`
	Languages        []string      `gorm:"column:languages;serializer:json" json:"languages"`
	Platforms        []string      `gorm:"column:platforms;serializer:json" json:"platforms"`
	AccessType       string        `gorm:"column:access_type" json:"access_type"`
	OfficialURL      string        `gorm:"column:official_url" json:"official_url,omitempty"`
	Access           *Access       `gorm:"column:access;serializer:json" json:"access,omitempty"`
	Spec             *Spec         `gorm:"column:spec;serializer:json" json:"spec,omitempty"`
	FAQ              []QA          `gorm:"column:faq;serializer:json" json:"faq"`
	Disclaimer       string        `gorm:"column:disclaimer" json:"disclaimer,omitempty"`
	UseCases         []UseCase     `gorm:"column:use_cases;serializer:json" json:"use_cases"`
	Vendor           *Vendor       `gorm:"column:vendor;serializer:json" json:"vendor,omitempty"`
	FoundedYear      *int          `gorm:"column:founded_year" json:"founded_year,omitempty"`
	Country          string        `gorm:"column:country" json:"country,omitempty"`
	Pricing          []PriceTier   `gorm:"column:pricing;serializer:json" json:"pricing"`
	FreeTrial        string        `gorm:"column:free_trial" json:"free_trial,omitempty"`
	Alternatives     []Alternative `gorm:"column:alternatives;serializer:json" json:"alternatives"`
	Tutorials        []Tutorial    `gorm:"column:tutorials;serializer:json" json:"tutorials"`
	Stats            *Stats        `gorm:"column:stats;serializer:json" json:"stats,omitempty"`
	Reviews          []Review      `gorm:"column:reviews;serializer:json" json:"reviews"`
	Status           string        `gorm:"column:status" json:"status"`
	// Product publication and search-engine eligibility are deliberately separate.
	// Bulk imports must never become indexable without an explicit editorial review.
	SEOIndexable bool `gorm:"column:seo_indexable" json:"seo_indexable"`
	// Audit identities stay server-side. Public list/detail responses only need
	// seo_indexable and must not expose an internal administrator user id.
	SEOReviewedAt *time.Time   `gorm:"column:seo_reviewed_at" json:"-"`
	SEOReviewedBy *uint        `gorm:"column:seo_reviewed_by" json:"-"`
	SortWeight    int          `gorm:"column:sort_weight" json:"sort_weight"`
	ViewCount     int64        `gorm:"column:view_count" json:"view_count"`
	FavoriteCount int64        `gorm:"column:favorite_count" json:"favorite_count"`
	DataQuality   *DataQuality `gorm:"column:data_quality;serializer:json" json:"data_quality,omitempty"`
	CreatedBy     *uint        `gorm:"column:created_by" json:"created_by,omitempty"`
	CreatedAt     time.Time    `gorm:"column:created_at" json:"created_at"`
	UpdatedAt     time.Time    `gorm:"column:updated_at" json:"updated_at"`
	PublishedAt   *time.Time   `gorm:"column:published_at" json:"published_at,omitempty"`
}

func (Tool) TableName() string { return "feature_tools" }

// ── 嵌套 JSON 子结构 ─────────────────────────────────────────────────────────

type Access struct {
	Type        string     `json:"type"`
	OfficialURL string     `json:"official_url,omitempty"`
	Resources   []Resource `json:"resources,omitempty"`
	Download    *Download  `json:"download,omitempty"`
}

type Resource struct {
	Label string `json:"label"`
	URL   string `json:"url"`
}

type Download struct {
	Provider    string `json:"provider,omitempty"`
	URL         string `json:"url,omitempty"`
	ExtractCode string `json:"extract_code,omitempty"`
	Filename    string `json:"filename,omitempty"`
	Gated       bool   `json:"gated,omitempty"`
}

type Spec struct {
	CoreUse      string   `json:"core_use,omitempty"`
	Audience     string   `json:"audience,omitempty"`
	Scenarios    []string `json:"scenarios,omitempty"`
	Workflow     []string `json:"workflow,omitempty"`
	KeyFeatures  []string `json:"key_features,omitempty"`
	InputFormats []string `json:"input_formats,omitempty"`
	Output       []string `json:"output,omitempty"`
	Version      string   `json:"version,omitempty"`
}

type QA struct {
	Q string `json:"q"`
	A string `json:"a"`
}

type UseCase struct {
	Icon  string `json:"icon,omitempty"`
	Title string `json:"title"`
	Desc  string `json:"desc,omitempty"`
}

type Vendor struct {
	Name     string `json:"name,omitempty"`
	Country  string `json:"country,omitempty"`
	Founded  *int   `json:"founded,omitempty"`
	Homepage string `json:"homepage,omitempty"`
	Desc     string `json:"desc,omitempty"`
}

type PriceTier struct {
	Label string `json:"label"`
	Price string `json:"price"`
}

type Alternative struct {
	Name string `json:"name"`
	Note string `json:"note,omitempty"`
	URL  string `json:"url,omitempty"`
}

type Tutorial struct {
	Title string `json:"title"`
	URL   string `json:"url"`
}

// Stats 只读统计 —— 种子期均空, 上线后由热度 pipeline 回填。用指针/可空区分"未知"与 0。
type Stats struct {
	Rating        *float64 `json:"rating"`
	RatingCount   int64    `json:"rating_count"`
	MonthlyVisits *int64   `json:"monthly_visits"`
	Favorites     int64    `json:"favorites"`
	Citations     *string  `json:"citations"`
}

type Review struct {
	Rating      int    `json:"rating,omitempty"`
	Quote       string `json:"quote,omitempty"`
	User        string `json:"user,omitempty"`
	Title       string `json:"title,omitempty"`
	Institution string `json:"institution,omitempty"`
}

type DataQuality struct {
	Enriched    bool     `json:"enriched"`
	NeedsReview bool     `json:"needs_review"`
	NeedsEnrich []string `json:"needs_enrich,omitempty"`
	Sources     []string `json:"sources,omitempty"`
}

// ── 导入任务 ─────────────────────────────────────────────────────────────────

type ImportJob struct {
	ID         uint64             `gorm:"primaryKey" json:"id"`
	Status     string             `gorm:"column:status" json:"status"`
	Phase      string             `gorm:"column:phase" json:"phase,omitempty"` // uploading_logos | importing | done
	Source     string             `gorm:"column:source" json:"source"`
	Filename   string             `gorm:"column:filename" json:"filename,omitempty"`
	Notify     bool               `gorm:"column:notify" json:"notify"`
	Total      int                `gorm:"column:total" json:"total"`
	Processed  int                `gorm:"column:processed" json:"processed"`
	LogoTotal  int                `gorm:"column:logo_total" json:"logo_total"` // zip 内待上传 logo 总数
	LogoDone   int                `gorm:"column:logo_done" json:"logo_done"`   // 已上传 logo 数(并发进度)
	CreatedCnt int                `gorm:"column:created_cnt" json:"created_cnt"`
	UpdatedCnt int                `gorm:"column:updated_cnt" json:"updated_cnt"`
	SkippedCnt int                `gorm:"column:skipped_cnt" json:"skipped_cnt"`
	FailedCnt  int                `gorm:"column:failed_cnt" json:"failed_cnt"`
	Error      string             `gorm:"column:error" json:"error,omitempty"`
	Detail     []ImportItemResult `gorm:"column:detail;serializer:json" json:"detail"`
	CreatedBy  *uint              `gorm:"column:created_by" json:"created_by,omitempty"`
	CreatedAt  time.Time          `gorm:"column:created_at" json:"created_at"`
	UpdatedAt  time.Time          `gorm:"column:updated_at" json:"updated_at"`
	FinishedAt *time.Time         `gorm:"column:finished_at" json:"finished_at,omitempty"`
}

func (ImportJob) TableName() string { return "feature_tool_import_jobs" }

type ImportItemResult struct {
	Idx    int    `json:"idx"`
	Name   string `json:"name"`
	Action string `json:"action"` // created | updated | skipped | failed
	Error  string `json:"error,omitempty"`
}

// ── Webhook ──────────────────────────────────────────────────────────────────

type Webhook struct {
	ID              uint64     `gorm:"primaryKey" json:"id"`
	Name            string     `gorm:"column:name" json:"name"`
	URL             string     `gorm:"column:url" json:"url"`
	Secret          string     `gorm:"column:secret" json:"secret,omitempty"`
	Events          []string   `gorm:"column:events;serializer:json" json:"events"`
	Enabled         bool       `gorm:"column:enabled" json:"enabled"`
	LastStatus      string     `gorm:"column:last_status" json:"last_status,omitempty"`
	LastDeliveredAt *time.Time `gorm:"column:last_delivered_at" json:"last_delivered_at,omitempty"`
	LastError       string     `gorm:"column:last_error" json:"last_error,omitempty"`
	CreatedBy       *uint      `gorm:"column:created_by" json:"created_by,omitempty"`
	CreatedAt       time.Time  `gorm:"column:created_at" json:"created_at"`
	UpdatedAt       time.Time  `gorm:"column:updated_at" json:"updated_at"`
}

func (Webhook) TableName() string { return "feature_tool_webhooks" }

type WebhookDelivery struct {
	ID           uint64    `gorm:"primaryKey" json:"id"`
	WebhookID    uint64    `gorm:"column:webhook_id" json:"webhook_id"`
	ToolID       *uint64   `gorm:"column:tool_id" json:"tool_id,omitempty"`
	Event        string    `gorm:"column:event" json:"event"`
	Status       string    `gorm:"column:status" json:"status"`
	HTTPStatus   int       `gorm:"column:http_status" json:"http_status"`
	Attempt      int       `gorm:"column:attempt" json:"attempt"`
	RequestBody  string    `gorm:"column:request_body" json:"request_body,omitempty"`
	ResponseBody string    `gorm:"column:response_body" json:"response_body,omitempty"`
	Error        string    `gorm:"column:error" json:"error,omitempty"`
	CreatedAt    time.Time `gorm:"column:created_at" json:"created_at"`
}

func (WebhookDelivery) TableName() string { return "feature_tool_webhook_deliveries" }

// CategoryMeta 分类元信息 (slug → 中文名), 供前端左栏渲染。与 TAXONOMY.md 一致。
type CategoryMeta struct {
	Slug  string `json:"slug"`
	Label string `json:"label"`
	Count int64  `json:"count"`
}

// Categories 精炼 12 类 (顺序即展示顺序)。
var Categories = []CategoryMeta{
	{Slug: "stats-econometrics", Label: "统计 & 计量分析"},
	{Slug: "chem-materials", Label: "化学 · 材料 · 光谱"},
	{Slug: "bio-life", Label: "生物信息 & 生命科学"},
	{Slug: "math-numerical", Label: "数学 & 数值计算"},
	{Slug: "viz-plotting", Label: "绘图 · 可视化 · 数字化"},
	{Slug: "engineering-cad", Label: "工程 · 仿真 · CAD/EDA"},
	{Slug: "lit-manage-pdf", Label: "文献管理 & 阅读/PDF"},
	{Slug: "writing-latex", Label: "学术写作 · LaTeX · 查重"},
	{Slug: "journal-metrics", Label: "期刊评价 & 投稿"},
	{Slug: "medical-reference", Label: "医药参考 & 考试"},
	{Slug: "general-utility", Label: "通用工具 · 效率 · 系统"},
	{Slug: "other", Label: "其他"},
}

// CategoryLabelOf 返回 slug 的中文名 (未知则原样返回)。
func CategoryLabelOf(slug string) string {
	for _, c := range Categories {
		if c.Slug == slug {
			return c.Label
		}
	}
	return slug
}
