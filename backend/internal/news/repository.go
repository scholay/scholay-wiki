// ============================================================================
// 情报(学术新闻)—— 数据访问。
// ============================================================================

package news

import (
	"errors"
	"fmt"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ErrDuplicateDelivery RecordDelivery 命中已存在的 delivery_id(幂等)。
var ErrDuplicateDelivery = errors.New("duplicate delivery")

type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository { return &Repository{db: db} }

// ─── 配置(单行 id=1)──────────────────────────────────────────────────────

// GetConfig 取单行配置;迁移已 seed id=1,记录不存在时兜底空配置(不报错)。
func (r *Repository) GetConfig() (*NewsWebhookConfig, error) {
	var c NewsWebhookConfig
	if err := r.db.First(&c).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return &NewsWebhookConfig{ID: 1}, nil
		}
		return nil, err
	}
	return &c, nil
}

// UpdateConfig 全量更新单行(map 指定字段,避免 gorm 跳零值导致开关关不掉)。
func (r *Repository) UpdateConfig(c *NewsWebhookConfig) error {
	return r.db.Model(&NewsWebhookConfig{}).Where("id = ?", 1).Updates(map[string]any{
		"enabled":        c.Enabled,
		"webhook_secret": c.WebhookSecret,
	}).Error
}

// ─── 投递去重 ──────────────────────────────────────────────────────────────

// DeliveryExists 该 delivery_id 是否已成功处理过(DB 兜底层去重)。
func (r *Repository) DeliveryExists(deliveryID string) (bool, error) {
	if deliveryID == "" {
		return false, nil
	}
	var n int64
	err := r.db.Model(&NewsDelivery{}).Where("delivery_id = ?", deliveryID).Count(&n).Error
	return n > 0, err
}

// RecordDelivery 记录一条「已处理」投递(成功后调用)。命中唯一冲突 → ErrDuplicateDelivery。
func (r *Repository) RecordDelivery(deliveryID, eventType, status string) error {
	if deliveryID == "" {
		return nil
	}
	now := time.Now()
	d := NewsDelivery{DeliveryID: deliveryID, EventType: eventType, Status: status, ReceivedAt: now, CreatedAt: now}
	res := r.db.Clauses(clause.OnConflict{DoNothing: true}).Create(&d)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrDuplicateDelivery
	}
	return nil
}

// ─── 情报写入(webhook 落库)─────────────────────────────────────────────

// newsUpdatableCols upsert 命中已存在 id 时要覆盖的列。
// 刻意排除 view_count(本侧累加,不被上游覆盖)与 created_at(行创建时间,保留)。
var newsUpdatableCols = []string{
	"slug", "url", "report_id", "report_type", "section", "section_label",
	"title", "summary", "body_md", "body_html", "credibility_note", "cover_image",
	"original_date", "published_at", "sources", "status", "is_featured", "score",
	"heat_external", "heat_trend", "heat_measured_at",
	"upstream_created_at", "upstream_updated_at", "updated_at",
}

// UpsertItem 按 id 覆盖(news.created / news.updated)。
//
// 乱序防护:平台失败后按 1m/5m/30m/2h/6h 退避重试 —— 一条更早的 news.updated 可能在更晚的
// 版本之后才被重投,直接覆盖会用「旧内容盖新内容」。故仅当来的 upstream_updated_at **不更旧**时
// 才覆盖各列;任一侧为 NULL(无可比时间)则回落 last-writer-wins。整条 ON DUPLICATE KEY UPDATE
// 是单条原子 SQL,无需读改写,天然抗并发。
func (r *Repository) UpsertItem(item *NewsItem) error {
	const cond = "VALUES(`upstream_updated_at`) IS NULL OR `upstream_updated_at` IS NULL OR VALUES(`upstream_updated_at`) >= `upstream_updated_at`"
	assignments := make(map[string]interface{}, len(newsUpdatableCols))
	for _, c := range newsUpdatableCols {
		assignments[c] = gorm.Expr(fmt.Sprintf("IF(%s, VALUES(`%s`), `%s`)", cond, c, c))
	}
	return r.db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "id"}},
		DoUpdates: clause.Assignments(assignments),
	}).Create(item).Error
}

// ApplyHeat 批量按 id 只覆盖热度三列(news.heat)。
// 不动正文、不动 upstream_updated_at(热度≠内容更新)。id 不存在 → 该条静默跳过。
func (r *Repository) ApplyHeat(updates []HeatUpdate) error {
	if len(updates) == 0 {
		return nil
	}
	return r.db.Transaction(func(tx *gorm.DB) error {
		for _, u := range updates {
			if u.ID == "" {
				continue
			}
			if err := tx.Model(&NewsItem{}).Where("id = ?", u.ID).Updates(map[string]any{
				"heat_external":    u.HeatExternal,
				"heat_trend":       u.HeatTrend,
				"heat_measured_at": u.HeatMeasuredAt,
			}).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

// ─── 公开读取 ──────────────────────────────────────────────────────────────

// ListCards 列表:sort = "heat"(按 heat_external) 否则按 published_at;section 空=全部。
func (r *Repository) ListCards(sort, section string, limit, offset int) ([]NewsItem, error) {
	q := r.db.Model(&NewsItem{}).Where("status = ?", "published")
	if section != "" {
		q = q.Where("section = ?", section)
	}
	if sort == "heat" {
		q = q.Order("heat_external DESC").Order("published_at DESC")
	} else {
		q = q.Order("published_at DESC")
	}
	var items []NewsItem
	err := q.Limit(limit).Offset(offset).Find(&items).Error
	return items, err
}

// Trending 热榜:近 days 天内按 heat_external 降序取 limit 条(days<=0 不限时间)。
func (r *Repository) Trending(days, limit int) ([]NewsItem, error) {
	q := r.db.Model(&NewsItem{}).Where("status = ?", "published")
	if days > 0 {
		since := time.Now().AddDate(0, 0, -days)
		q = q.Where("published_at >= ?", since)
	}
	var items []NewsItem
	err := q.Order("is_featured DESC").Order("heat_external DESC").Order("published_at DESC").
		Limit(limit).Find(&items).Error
	return items, err
}

// GetBySlug 取单篇。
func (r *Repository) GetBySlug(slug string) (*NewsItem, bool, error) {
	var item NewsItem
	err := r.db.Where("slug = ? AND status = ?", slug, "published").First(&item).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, false, nil
		}
		return nil, false, err
	}
	return &item, true, nil
}

// RelatedBySection 同分区其它热门(排除自身)。
func (r *Repository) RelatedBySection(section, excludeID string, limit int) ([]NewsItem, error) {
	var items []NewsItem
	err := r.db.Model(&NewsItem{}).
		Where("status = ? AND section = ? AND id <> ?", "published", section, excludeID).
		Order("heat_external DESC").Order("published_at DESC").
		Limit(limit).Find(&items).Error
	return items, err
}

// IncrViewCount 详情访问 +1(best-effort)。
func (r *Repository) IncrViewCount(id string) error {
	return r.db.Model(&NewsItem{}).Where("id = ?", id).
		UpdateColumn("view_count", gorm.Expr("view_count + 1")).Error
}

// AllSlugsForSitemap 取全部已发布的 slug + lastmod(分页),供 sitemap 用。
func (r *Repository) AllSlugsForSitemap(limit, offset int) ([]NewsItem, error) {
	var items []NewsItem
	err := r.db.Model(&NewsItem{}).Where("status = ?", "published").
		Select("slug", "upstream_updated_at", "updated_at", "published_at").
		Order("published_at DESC").Limit(limit).Offset(offset).Find(&items).Error
	return items, err
}

// CountPublished 已发布总数(sitemap 分页 / 列表是否还有下一页)。
func (r *Repository) CountPublished() (int64, error) {
	var n int64
	err := r.db.Model(&NewsItem{}).Where("status = ?", "published").Count(&n).Error
	return n, err
}

// MaxUpstreamUpdated 全量最新 upstream_updated_at(sitemap index lastmod)。
func (r *Repository) MaxUpstreamUpdated() (*time.Time, error) {
	var item NewsItem
	err := r.db.Model(&NewsItem{}).Where("status = ?", "published").
		Order("upstream_updated_at DESC").First(&item).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return item.UpstreamUpdatedAt, nil
}
