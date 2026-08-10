// ============================================================================
// 功能广场 —— 仓储层 (GORM)
// ============================================================================

package featuretool

import (
	"errors"
	"strings"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository { return &Repository{db: db} }

// ── 查询过滤 ─────────────────────────────────────────────────────────────────

// ListФilter 列表过滤条件。
type ListFilter struct {
	Status     string // 空 = 不限 (admin); "published" = 仅上线 (public)
	Category   string
	AccessType string
	PriceType  string
	OpenSource string // "" 不限 | "open" 仅开源 | "closed" 仅闭源
	SEOReview  string // "" 不限 | "indexable" 已审核 | "pending" 未审核
	Keyword    string // 搜索词:>=2 字走 FULLTEXT(ngram), 1 字回退 LIKE
	Page       int
	PageSize   int
	SortBy     string // created_at | updated_at | name | view_count | sort_weight
	SortOrder  string // asc | desc
}

// useFulltext 关键词 >=2 字(含 1 个中文字 = 2 字节但 1 rune,这里按 rune 计)走 ngram 全文检索;
// 1 rune 太短 ngram 命中不到, 回退 LIKE。
func (f ListFilter) keyword() (kw string, ft bool) {
	kw = strings.TrimSpace(f.Keyword)
	return kw, len([]rune(kw)) >= 2
}

func (r *Repository) applyFilter(q *gorm.DB, f ListFilter) *gorm.DB {
	if f.Status != "" {
		q = q.Where("status = ?", f.Status)
	}
	if f.Category != "" {
		q = q.Where("category = ?", f.Category)
	}
	if f.AccessType != "" {
		// 形式筛选只暴露 在线(website)/ 下载(download);"两者"(both) 不单列,
		// 而是同时归入这两类 —— 筛 website / download 时都把 both 计入。
		if f.AccessType == "website" || f.AccessType == "download" {
			q = q.Where("access_type IN ?", []string{f.AccessType, "both"})
		} else {
			q = q.Where("access_type = ?", f.AccessType)
		}
	}
	if f.PriceType != "" {
		q = q.Where("price_type = ?", f.PriceType)
	}
	switch f.OpenSource {
	case "open":
		q = q.Where("is_open_source = 1")
	case "closed":
		q = q.Where("is_open_source = 0")
	}
	switch f.SEOReview {
	case "indexable":
		q = q.Where("seo_indexable = ?", true)
	case "pending":
		q = q.Where("seo_indexable = ?", false)
	}
	// 搜索:优先标题(name/name_en)其次内容(tagline/description_md)。
	// >=2 rune 走 ngram FULLTEXT(对 10W+ 行可用索引, 不全表扫); 1 rune 回退 LIKE。
	if kw, ft := f.keyword(); kw != "" {
		if ft {
			q = q.Where(
				"(MATCH(`name`,`name_en`) AGAINST(? IN NATURAL LANGUAGE MODE) OR MATCH(`tagline`,`description_md`) AGAINST(? IN NATURAL LANGUAGE MODE))",
				kw, kw,
			)
		} else {
			like := "%" + kw + "%"
			q = q.Where("name LIKE ? OR name_en LIKE ?", like, like)
		}
	}
	return q
}

// List 分页列表 + 总数。
func (r *Repository) List(f ListFilter) ([]Tool, int64, error) {
	q := r.applyFilter(r.db.Model(&Tool{}), f)

	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	page, pageSize := f.Page, f.PageSize
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 200 {
		pageSize = 24
	}

	// 排序:有全文搜索词时按相关度;否则按 权重/指定列。
	if kw, ft := f.keyword(); kw != "" && ft {
		// 标题命中优先:标题精确相等(3) > 标题包含(2) > 仅内容命中(0);同档再按全文相关度
		// (标题 3× + 内容 1×),最后按热度兜底。ngram 对 "matlab" 这类拉丁词会在大量中文/英文
		// 简介里命中 bigram(噪声),靠这一档把"标题正中"的工具(如 MATLAB)稳定顶到内容命中之上。
		like := "%" + kw + "%"
		// 注意:GORM v1.25 的 db.Order() 只认 string / clause.OrderByColumn,直接传 clause.Expr
		// 会被静默丢弃(ORDER BY 根本不生成,结果退化成主键序)。必须用 Clauses(OrderBy{Expression}).
		q = q.Clauses(clause.OrderBy{Expression: clause.Expr{
			SQL: "(CASE WHEN `name` = ? OR `name_en` = ? THEN 3 " +
				"WHEN `name` LIKE ? OR `name_en` LIKE ? THEN 2 ELSE 0 END) DESC, " +
				"(MATCH(`name`,`name_en`) AGAINST(? IN NATURAL LANGUAGE MODE) * 3 + " +
				"MATCH(`tagline`,`description_md`) AGAINST(? IN NATURAL LANGUAGE MODE)) DESC, " +
				"`view_count` DESC",
			Vars: []interface{}{kw, kw, like, like, kw, kw},
		}})
	} else {
		sortBy := "created_at"
		switch f.SortBy {
		case "updated_at", "name", "view_count", "sort_weight", "created_at":
			sortBy = f.SortBy
		}
		order := "DESC"
		if strings.EqualFold(f.SortOrder, "asc") {
			order = "ASC"
		}
		q = q.Order("sort_weight DESC, " + sortBy + " " + order)
	}

	var items []Tool
	if err := q.Offset((page - 1) * pageSize).Limit(pageSize).
		Find(&items).Error; err != nil {
		return nil, 0, err
	}
	return items, total, nil
}

func (r *Repository) GetByID(id uint64) (*Tool, error) {
	var t Tool
	if err := r.db.First(&t, id).Error; err != nil {
		return nil, err
	}
	return &t, nil
}

func (r *Repository) GetBySlug(slug string) (*Tool, error) {
	var t Tool
	if err := r.db.Where("slug = ?", slug).First(&t).Error; err != nil {
		return nil, err
	}
	return &t, nil
}

func (r *Repository) GetBySourceTopicID(topicID int64) (*Tool, error) {
	var t Tool
	err := r.db.Where("source_topic_id = ?", topicID).First(&t).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func (r *Repository) Create(t *Tool) error { return r.db.Create(t).Error }

func (r *Repository) Save(t *Tool) error { return r.db.Save(t).Error }

func (r *Repository) Delete(id uint64) error {
	return r.db.Delete(&Tool{}, id).Error
}

// IncrViewCount 详情页访问 +1 (best-effort, 不阻塞)。
func (r *Repository) IncrViewCount(id uint64) error {
	return r.db.Model(&Tool{}).Where("id = ?", id).
		UpdateColumn("view_count", gorm.Expr("view_count + 1")).Error
}

// CategoryCounts 各分类下 status 命中的工具数 (public 传 "published")。
func (r *Repository) CategoryCounts(status string) (map[string]int64, int64, error) {
	type row struct {
		Category string
		Cnt      int64
	}
	q := r.db.Model(&Tool{}).Select("category, COUNT(*) AS cnt")
	if status != "" {
		q = q.Where("status = ?", status)
	}
	var rows []row
	if err := q.Group("category").Scan(&rows).Error; err != nil {
		return nil, 0, err
	}
	m := make(map[string]int64, len(rows))
	var total int64
	for _, x := range rows {
		m[x.Category] = x.Cnt
		total += x.Cnt
	}
	return m, total, nil
}

func (r *Repository) SlugExists(slug string, exceptID uint64) (bool, error) {
	var cnt int64
	q := r.db.Model(&Tool{}).Where("slug = ?", slug)
	if exceptID > 0 {
		q = q.Where("id <> ?", exceptID)
	}
	if err := q.Count(&cnt).Error; err != nil {
		return false, err
	}
	return cnt > 0, nil
}

// ── 导入任务 ─────────────────────────────────────────────────────────────────

func (r *Repository) CreateJob(j *ImportJob) error { return r.db.Create(j).Error }
func (r *Repository) SaveJob(j *ImportJob) error   { return r.db.Save(j).Error }

// UpdateJobLogoDone 只更新 logo_done 单列 —— 上传阶段由独立 ticker goroutine 调用,
// 不碰 job 结构体其余字段, 避免和主流程并发写同一行/同一对象造成竞态。
func (r *Repository) UpdateJobLogoDone(id uint64, done int) error {
	return r.db.Model(&ImportJob{}).Where("id = ?", id).Update("logo_done", done).Error
}

func (r *Repository) GetJob(id uint64) (*ImportJob, error) {
	var j ImportJob
	if err := r.db.First(&j, id).Error; err != nil {
		return nil, err
	}
	return &j, nil
}

func (r *Repository) ListJobs(page, pageSize int) ([]ImportJob, int64, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	var items []ImportJob
	var total int64
	if err := r.db.Model(&ImportJob{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	if err := r.db.Order("created_at DESC").
		Offset((page - 1) * pageSize).Limit(pageSize).
		Find(&items).Error; err != nil {
		return nil, 0, err
	}
	return items, total, nil
}

// ── Webhook ──────────────────────────────────────────────────────────────────

func (r *Repository) CreateWebhook(w *Webhook) error { return r.db.Create(w).Error }
func (r *Repository) SaveWebhook(w *Webhook) error   { return r.db.Save(w).Error }
func (r *Repository) DeleteWebhook(id uint64) error  { return r.db.Delete(&Webhook{}, id).Error }

func (r *Repository) GetWebhook(id uint64) (*Webhook, error) {
	var w Webhook
	if err := r.db.First(&w, id).Error; err != nil {
		return nil, err
	}
	return &w, nil
}

func (r *Repository) ListWebhooks() ([]Webhook, error) {
	var items []Webhook
	err := r.db.Order("created_at DESC").Find(&items).Error
	return items, err
}

// EnabledWebhooks 取所有启用的 webhook (派发时用)。
func (r *Repository) EnabledWebhooks() ([]Webhook, error) {
	var items []Webhook
	err := r.db.Where("enabled = 1").Find(&items).Error
	return items, err
}

// UpdateWebhookStatus 回写最近一次投递结果 (last_status/last_error/last_delivered_at)。
func (r *Repository) UpdateWebhookStatus(id uint64, status, lastErr string, at time.Time) error {
	return r.db.Model(&Webhook{}).Where("id = ?", id).Updates(map[string]any{
		"last_status":       status,
		"last_error":        lastErr,
		"last_delivered_at": at,
	}).Error
}

func (r *Repository) InsertDelivery(d *WebhookDelivery) error { return r.db.Create(d).Error }

func (r *Repository) ListDeliveries(webhookID uint64, limit int) ([]WebhookDelivery, error) {
	if limit < 1 || limit > 200 {
		limit = 50
	}
	var items []WebhookDelivery
	err := r.db.Where("webhook_id = ?", webhookID).
		Order("created_at DESC").Limit(limit).Find(&items).Error
	return items, err
}

// ── Sitemap ──────────────────────────────────────────────────────────────────

// SitemapRow sitemap 一条:slug + 最后更新时间。
type SitemapRow struct {
	Slug      string    `gorm:"column:slug"`
	UpdatedAt time.Time `gorm:"column:updated_at"`
}

func (r *Repository) sitemapEligibleTools() *gorm.DB {
	return r.db.Model(&Tool{}).
		Where("status = ? AND seo_indexable = ?", "published", true)
}

// SEOReviewCandidates 返回「已发布但尚未过 SEO 审核」的完整行,按 id 升序、
// id > afterID 取 limit 条 —— 供 BatchSEOReview 游标分批扫描。
func (r *Repository) SEOReviewCandidates(afterID uint64, limit int) ([]Tool, error) {
	var items []Tool
	err := r.db.Where("status = ? AND seo_indexable = ? AND id > ?", "published", false, afterID).
		Order("id ASC").Limit(limit).Find(&items).Error
	return items, err
}

// ApproveSEOBatch 批量置位 seo_indexable 并落审计字段。只影响仍未置位的行(幂等,
// 且不会覆盖并发的人工审核结果)。返回实际置位条数。
func (r *Repository) ApproveSEOBatch(ids []uint64, adminID *uint, at time.Time) (int64, error) {
	if len(ids) == 0 {
		return 0, nil
	}
	res := r.db.Model(&Tool{}).
		Where("id IN ? AND seo_indexable = ?", ids, false).
		Updates(map[string]any{
			"seo_indexable":   true,
			"seo_reviewed_at": at,
			"seo_reviewed_by": adminID,
		})
	return res.RowsAffected, res.Error
}

// SitemapCount 仅统计已上线且经过 SEO 人工审核的工具。产品可见与搜索引擎可索引
// 是两套独立状态，批量导入绝不能自动扩张 sitemap。
func (r *Repository) SitemapCount() (int64, time.Time, error) {
	var aggregate struct {
		Count   int64      `gorm:"column:count"`
		LastMod *time.Time `gorm:"column:last_mod"`
	}
	// Keep count and lastmod in one aggregate statement. Two independent
	// queries could observe opposite sides of a concurrent review change and
	// produce count>0 with a NULL/zero lastmod in the sitemap index.
	if err := r.sitemapEligibleTools().
		Select("COUNT(*) AS count, MAX(updated_at) AS last_mod").
		Scan(&aggregate).Error; err != nil {
		return 0, time.Time{}, err
	}
	var t time.Time
	if aggregate.LastMod != nil {
		t = *aggregate.LastMod
	}
	return aggregate.Count, t, nil
}

// SitemapPage 第 page 页(1-based)已上线且通过 SEO 审核的工具，按 id 稳定分页。
func (r *Repository) SitemapPage(page, size int) ([]SitemapRow, error) {
	if page < 1 {
		page = 1
	}
	if size < 1 {
		size = 20000
	}
	var rows []SitemapRow
	err := r.sitemapEligibleTools().Select("slug, updated_at").
		Order("id ASC").Offset((page - 1) * size).Limit(size).
		Scan(&rows).Error
	return rows, err
}

// ListIndexableForSEO returns a bounded set of editorially approved tools for
// the crawlable /tools hub. It deliberately reuses the sitemap scope so the hub
// can never link a page that the sitemap quality gate excludes.
func (r *Repository) ListIndexableForSEO(limit int) ([]Tool, error) {
	if limit <= 0 {
		return nil, nil
	}
	if limit > 200 {
		limit = 200
	}
	var tools []Tool
	err := r.sitemapEligibleTools().
		Select("slug, name, tagline, seo_indexable").
		Order("sort_weight DESC, updated_at DESC, id ASC").
		Limit(limit).
		Find(&tools).Error
	return tools, err
}
