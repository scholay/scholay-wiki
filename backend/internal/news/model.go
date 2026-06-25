// ============================================================================
// 情报(学术新闻)—— 数据模型。
//
// 数据来自上游 Minicod news webhook(server-to-server 推送),本侧只接收/落库/展示:
//   - NewsItem            情报主表(news_items),稳定主键 = id(uuid)
//   - NewsDelivery        投递去重/审计(news_deliveries),主键 = delivery_id
//   - NewsWebhookConfig   单行配置(news_webhook_config,id=1):enabled + 密钥
//
// 协议要点:heat_external / heat_trend / score 都是「数值」(可含小数、heat_trend 可负),
// 故用 float64;时间字段上游给 RFC3339 字符串,落库解析成 *time.Time(可空)。
// upstream_updated_at = 内容更新真源(dateModified);news.heat 只刷 heat_* 不动它。
// ============================================================================

package news

import "time"

// Source 来源(协议 sources 数组的元素)。
type Source struct {
	URL   string `json:"url"`
	Label string `json:"label"`
}

// NewsItem 情报主表行。sources 以 JSON 字符串存列;对外 DTO 再解析成数组。
type NewsItem struct {
	ID              string `gorm:"column:id;primaryKey"`
	Slug            string `gorm:"column:slug"`
	URL             string `gorm:"column:url"`
	ReportID        string `gorm:"column:report_id"`
	ReportType      string `gorm:"column:report_type"`
	Section         string `gorm:"column:section"`
	SectionLabel    string `gorm:"column:section_label"`
	Title           string `gorm:"column:title"`
	Summary         string `gorm:"column:summary"`
	BodyMD          string `gorm:"column:body_md"`
	BodyHTML        string `gorm:"column:body_html"`
	CredibilityNote string `gorm:"column:credibility_note"`
	CoverImage      string `gorm:"column:cover_image"`
	OriginalDate    string `gorm:"column:original_date"`
	PublishedAt     *time.Time `gorm:"column:published_at"`
	Sources         string     `gorm:"column:sources"` // JSON 字符串 [{url,label}]
	Status          string     `gorm:"column:status"`
	IsFeatured      bool       `gorm:"column:is_featured"`
	Score           float64    `gorm:"column:score"`
	ViewCount       int64      `gorm:"column:view_count"`
	HeatExternal    float64    `gorm:"column:heat_external"`
	HeatTrend       float64    `gorm:"column:heat_trend"`
	HeatMeasuredAt  *time.Time `gorm:"column:heat_measured_at"`
	UpstreamCreatedAt *time.Time `gorm:"column:upstream_created_at"`
	UpstreamUpdatedAt *time.Time `gorm:"column:upstream_updated_at"`
	CreatedAt       time.Time  `gorm:"column:created_at"` // 行创建时间(DB 管)
	UpdatedAt       time.Time  `gorm:"column:updated_at"` // 行更新时间(DB 管)
}

func (NewsItem) TableName() string { return "news_items" }

// NewsDelivery 投递去重/审计行。
type NewsDelivery struct {
	DeliveryID string    `gorm:"column:delivery_id;primaryKey"`
	EventType  string    `gorm:"column:event_type"`
	Status     string    `gorm:"column:status"`
	ReceivedAt time.Time `gorm:"column:received_at"`
	CreatedAt  time.Time `gorm:"column:created_at"`
}

func (NewsDelivery) TableName() string { return "news_deliveries" }

// NewsWebhookConfig 单行配置(id=1)。
type NewsWebhookConfig struct {
	ID            uint      `gorm:"column:id;primaryKey"`
	Enabled       bool      `gorm:"column:enabled"`
	WebhookSecret string    `gorm:"column:webhook_secret"`
	CreatedAt     time.Time `gorm:"column:created_at"`
	UpdatedAt     time.Time `gorm:"column:updated_at"`
}

func (NewsWebhookConfig) TableName() string { return "news_webhook_config" }

// HeatUpdate 一条热度覆盖(news.heat 事件 items[] 的元素,映射后给 repo)。
type HeatUpdate struct {
	ID             string
	HeatExternal   float64
	HeatTrend      float64
	HeatMeasuredAt *time.Time
}

// ─── 公开下发 DTO ──────────────────────────────────────────────────────────

// CardDTO 列表卡片(不含正文,瘦身)。
type CardDTO struct {
	Slug         string   `json:"slug"`
	Title        string   `json:"title"`
	Summary      string   `json:"summary"`
	Section      string   `json:"section"`
	SectionLabel string   `json:"section_label"`
	ReportType   string   `json:"report_type"`
	CoverImage   string   `json:"cover_image,omitempty"`
	Sources      []Source `json:"sources"`
	IsFeatured   bool     `json:"is_featured"`
	Score        float64  `json:"score"`
	ViewCount    int64    `json:"view_count"`
	HeatExternal float64  `json:"heat_external"`
	HeatTrend    float64  `json:"heat_trend"`
	PublishedAt  string   `json:"published_at"` // RFC3339
}

// DetailDTO 单篇全文(含正文 + 来源 + 可信度)。
type DetailDTO struct {
	CardDTO
	URL             string `json:"url"`
	BodyMD          string `json:"body_md"`
	BodyHTML        string `json:"body_html"`
	CredibilityNote string `json:"credibility_note"`
	OriginalDate    string `json:"original_date,omitempty"`
	HeatMeasuredAt  string `json:"heat_measured_at,omitempty"`
	UpdatedAt       string `json:"updated_at"` // 上游 updated_at(RFC3339,dateModified)
}
