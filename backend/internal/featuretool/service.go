// ============================================================================
// 功能广场 —— 服务层 (业务逻辑)
//
// CRUD (每次变更派发 webhook) + 批量导入 (异步任务) + 分类计数。
// ============================================================================

package featuretool

import (
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"gorm.io/gorm"

	"scholar-backend/internal/common/safego"
	"scholar-backend/internal/seo"
)

var (
	ErrNotFound  = errors.New("featuretool: tool not found")
	ErrNameEmpty = errors.New("featuretool: name is required")
)

type Service struct {
	repo *Repository
	disp *Dispatcher
}

func NewService(repo *Repository, disp *Dispatcher) *Service {
	return &Service{repo: repo, disp: disp}
}

// ── 公开/后台查询 ────────────────────────────────────────────────────────────

func (s *Service) List(f ListFilter) ([]Tool, int64, error) { return s.repo.List(f) }

func (s *Service) GetByID(id uint64) (*Tool, error) {
	t, err := s.repo.GetByID(id)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	return t, err
}

// GetPublic 按 id 或 slug 取已上线工具, 并 +1 浏览。
func (s *Service) GetPublic(idOrSlug string) (*Tool, error) {
	var t *Tool
	var err error
	if isAllDigits(idOrSlug) {
		t, err = s.repo.GetByID(parseUint64(idOrSlug))
	} else {
		t, err = s.repo.GetBySlug(idOrSlug)
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if t.Status != "published" {
		return nil, ErrNotFound
	}
	safego.Go("featuretool.view", func() { _ = s.repo.IncrViewCount(t.ID) })
	return t, nil
}

// CategoryCounts 返回 12 类 + 计数 (status 命中)。public 传 "published"。
func (s *Service) CategoryCounts(status string) ([]CategoryMeta, int64, error) {
	counts, total, err := s.repo.CategoryCounts(status)
	if err != nil {
		return nil, 0, err
	}
	out := make([]CategoryMeta, 0, len(Categories))
	for _, c := range Categories {
		out = append(out, CategoryMeta{Slug: c.Slug, Label: c.Label, Count: counts[c.Slug]})
	}
	return out, total, nil
}

// ── 单条 CRUD ────────────────────────────────────────────────────────────────

func (s *Service) Create(t *Tool, adminID *uint) (*Tool, error) {
	if strings.TrimSpace(t.Name) == "" {
		return nil, ErrNameEmpty
	}
	s.normalize(t)
	slug, err := s.ensureUniqueSlug(t.Slug, t.Name, t.NameEn, t.SourceTopicID, 0)
	if err != nil {
		return nil, err
	}
	t.Slug = slug
	t.CreatedBy = adminID
	if t.Status == "published" && t.PublishedAt == nil {
		now := time.Now()
		t.PublishedAt = &now
	}
	if err := s.repo.Create(t); err != nil {
		return nil, err
	}
	s.disp.Dispatch(EventCreated, t)
	return t, nil
}

func (s *Service) Update(id uint64, t *Tool) (*Tool, error) {
	existing, err := s.repo.GetByID(id)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(t.Name) == "" {
		return nil, ErrNameEmpty
	}
	s.normalize(t)
	slug, err := s.ensureUniqueSlug(t.Slug, t.Name, t.NameEn, t.SourceTopicID, id)
	if err != nil {
		return nil, err
	}
	// 保留不可由编辑覆盖的字段
	t.ID = id
	t.Slug = slug
	t.CreatedBy = existing.CreatedBy
	t.CreatedAt = existing.CreatedAt
	t.ViewCount = existing.ViewCount
	t.FavoriteCount = existing.FavoriteCount
	if t.Status == "published" && existing.PublishedAt == nil {
		now := time.Now()
		t.PublishedAt = &now
	} else {
		t.PublishedAt = existing.PublishedAt
	}
	if err := s.repo.Save(t); err != nil {
		return nil, err
	}
	s.disp.Dispatch(EventUpdated, t)
	return t, nil
}

func (s *Service) Delete(id uint64) error {
	t, err := s.repo.GetByID(id)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if err := s.repo.Delete(id); err != nil {
		return err
	}
	// deleted 事件下游靠 id/slug/source_topic_id 定位要删的帖子
	s.disp.Dispatch(EventDeleted, &Tool{ID: t.ID, Slug: t.Slug, Name: t.Name, SourceTopicID: t.SourceTopicID})
	return nil
}

// ── 批量导入 (异步任务) ──────────────────────────────────────────────────────

type ImportInput struct {
	Items    []json.RawMessage
	Notify   bool
	Source   string
	Filename string
	AdminID  *uint
}

// StartImport 创建导入任务并在后台处理, 立即返回 job (status=pending/running)。
func (s *Service) StartImport(in ImportInput) (*ImportJob, error) {
	source := in.Source
	if source == "" {
		source = "json"
	}
	job := &ImportJob{
		Status:    "pending",
		Source:    source,
		Filename:  in.Filename,
		Notify:    in.Notify,
		Total:     len(in.Items),
		Detail:    []ImportItemResult{},
		CreatedBy: in.AdminID,
	}
	if err := s.repo.CreateJob(job); err != nil {
		return nil, err
	}
	items := in.Items
	notify := in.Notify
	adminID := in.AdminID
	jobID := job.ID
	safego.Go("featuretool.import", func() { s.processImport(jobID, items, notify, adminID) })
	return job, nil
}

func (s *Service) processImport(jobID uint64, items []json.RawMessage, notify bool, adminID *uint) {
	job, err := s.repo.GetJob(jobID)
	if err != nil {
		return
	}
	job.Status = "running"
	_ = s.repo.SaveJob(job)

	results := make([]ImportItemResult, 0, len(items))
	for idx, raw := range items {
		res := ImportItemResult{Idx: idx}
		var t Tool
		if err := json.Unmarshal(raw, &t); err != nil {
			res.Action = "failed"
			res.Error = "JSON 解析失败: " + err.Error()
			job.FailedCnt++
			results = append(results, res)
			job.Processed++
			continue
		}
		action, err := s.upsertOne(&t, adminID, notify)
		res.Name = t.Name
		res.Action = action
		if err != nil {
			res.Action = "failed"
			res.Error = err.Error()
			job.FailedCnt++
		} else {
			switch action {
			case "created":
				job.CreatedCnt++
			case "updated":
				job.UpdatedCnt++
			case "skipped":
				job.SkippedCnt++
			}
		}
		results = append(results, res)
		job.Processed++

		// 每 20 条回写一次进度, 便于前端任务页实时看
		if job.Processed%20 == 0 {
			job.Detail = results
			_ = s.repo.SaveJob(job)
		}
	}

	job.Detail = results
	if job.FailedCnt == 0 {
		job.Status = "succeeded"
	} else if job.FailedCnt < job.Total {
		job.Status = "partial"
	} else {
		job.Status = "failed"
	}
	now := time.Now()
	job.FinishedAt = &now
	_ = s.repo.SaveJob(job)
}

// upsertOne 按 source_topic_id (优先) 或 slug 幂等 upsert 一条, 返回 created/updated。
func (s *Service) upsertOne(t *Tool, adminID *uint, notify bool) (string, error) {
	if strings.TrimSpace(t.Name) == "" {
		return "failed", ErrNameEmpty
	}
	s.normalize(t)

	var existing *Tool
	var err error
	if t.SourceTopicID != nil {
		existing, err = s.repo.GetBySourceTopicID(*t.SourceTopicID)
		if err != nil {
			return "failed", err
		}
	}
	if existing == nil && t.Slug != "" {
		if e, err2 := s.repo.GetBySlug(t.Slug); err2 == nil {
			existing = e
		}
	}

	if existing != nil {
		slug, err := s.ensureUniqueSlug(t.Slug, t.Name, t.NameEn, t.SourceTopicID, existing.ID)
		if err != nil {
			return "failed", err
		}
		t.ID = existing.ID
		t.Slug = slug
		t.CreatedBy = existing.CreatedBy
		t.CreatedAt = existing.CreatedAt
		t.ViewCount = existing.ViewCount
		t.FavoriteCount = existing.FavoriteCount
		if t.Status == "published" && existing.PublishedAt == nil {
			now := time.Now()
			t.PublishedAt = &now
		} else {
			t.PublishedAt = existing.PublishedAt
		}
		if err := s.repo.Save(t); err != nil {
			return "failed", err
		}
		if notify {
			s.disp.Dispatch(EventUpdated, t)
		}
		return "updated", nil
	}

	slug, err := s.ensureUniqueSlug(t.Slug, t.Name, t.NameEn, t.SourceTopicID, 0)
	if err != nil {
		return "failed", err
	}
	t.ID = 0
	t.Slug = slug
	t.CreatedBy = adminID
	if t.Status == "published" && t.PublishedAt == nil {
		now := time.Now()
		t.PublishedAt = &now
	}
	if err := s.repo.Create(t); err != nil {
		return "failed", err
	}
	if notify {
		s.disp.Dispatch(EventCreated, t)
	}
	return "created", nil
}

// ── 规范化 + slug ────────────────────────────────────────────────────────────

func (s *Service) normalize(t *Tool) {
	t.Name = strings.TrimSpace(t.Name)
	if t.Category == "" {
		t.Category = "other"
	}
	t.CategoryLabel = CategoryLabelOf(t.Category)
	if t.PriceType == "" {
		t.PriceType = "unknown"
	}
	if t.AccessType == "" {
		if t.Access != nil && t.Access.Type != "" {
			t.AccessType = t.Access.Type
		} else {
			t.AccessType = "website"
		}
	}
	if t.Status == "" {
		t.Status = "published"
	}
	if t.OfficialURL == "" && t.Access != nil {
		t.OfficialURL = t.Access.OfficialURL
	}
}

var slugRe = regexp.MustCompile(`[^a-z0-9]+`)

func slugify(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = slugRe.ReplaceAllString(s, "-")
	return strings.Trim(s, "-")
}

// ensureUniqueSlug 选定一个全局唯一 slug。优先 provided → name_en → name → 源topic回退。
// reservedToolSlugs: 移动端 /m/tools/* 的保留路由段(all=功能广场列表, pc=「建议电脑端使用」引导),
// 不能作为工具 slug —— 否则 /m/tools/all 之类会被静态路由遮蔽,该工具详情页永远打不开。
// 命中则在 ensureUniqueSlug 里视作「已占用」自动退避到 base-2(如 "all" → "all-2")。
var reservedToolSlugs = map[string]bool{"all": true, "pc": true}

func (s *Service) ensureUniqueSlug(provided, name, nameEn string, topicID *int64, exceptID uint64) (string, error) {
	base := slugify(provided)
	if base == "" {
		base = slugify(nameEn)
	}
	if base == "" {
		base = slugify(name)
	}
	if base == "" && topicID != nil {
		base = fmt.Sprintf("tool-%d", *topicID)
	}
	if base == "" {
		base = fmt.Sprintf("tool-%d", time.Now().UnixNano())
	}
	candidate := base
	for i := 2; i < 100; i++ {
		exists, err := s.repo.SlugExists(candidate, exceptID)
		if err != nil {
			return "", err
		}
		if !exists && !reservedToolSlugs[candidate] {
			return candidate, nil
		}
		candidate = fmt.Sprintf("%s-%d", base, i)
	}
	return fmt.Sprintf("%s-%d", base, time.Now().UnixNano()), nil
}

// ── Webhook 管理 (转发给 repo, dispatcher 测试用) ─────────────────────────────

func (s *Service) ListWebhooks() ([]Webhook, error)       { return s.repo.ListWebhooks() }
func (s *Service) CreateWebhook(w *Webhook) error          { return s.repo.CreateWebhook(w) }
func (s *Service) SaveWebhook(w *Webhook) error            { return s.repo.SaveWebhook(w) }
func (s *Service) DeleteWebhook(id uint64) error           { return s.repo.DeleteWebhook(id) }
func (s *Service) GetWebhook(id uint64) (*Webhook, error)  { return s.repo.GetWebhook(id) }
func (s *Service) ListDeliveries(id uint64, n int) ([]WebhookDelivery, error) {
	return s.repo.ListDeliveries(id, n)
}
func (s *Service) TestWebhook(id uint64) (int, string, error) {
	w, err := s.repo.GetWebhook(id)
	if err != nil {
		return 0, "", err
	}
	return s.disp.TestDeliver(w)
}

func (s *Service) ListJobs(page, pageSize int) ([]ImportJob, int64, error) {
	return s.repo.ListJobs(page, pageSize)
}
func (s *Service) GetJob(id uint64) (*ImportJob, error) { return s.repo.GetJob(id) }

// ── SEO ──────────────────────────────────────────────────────────────────────

// ResolveToolBySlug 实现 config.ToolSEOProvider —— 工具详情页 /tools/{slug} 的 SSR 元数据。
// 仅已上线工具返回;不存在 / 未上线 → (nil, nil) 让 SSR 走通用兜底。
func (s *Service) ResolveToolBySlug(slug string) (*seo.ToolSSRMeta, error) {
	t, err := s.repo.GetBySlug(slug)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if t == nil || t.Status != "published" {
		return nil, nil
	}
	return &seo.ToolSSRMeta{
		Slug:          t.Slug,
		Name:          t.Name,
		NameEn:        t.NameEn,
		Tagline:       t.Tagline,
		Description:   t.DescriptionMD,
		CategoryLabel: t.CategoryLabel,
		Logo:          t.Logo,
		Tags:          t.Tags,
		AccessType:    t.AccessType,
		PriceType:     t.PriceType,
	}, nil
}

// SitemapCount 已上线工具总数 + 最近更新时间(给 sitemap 索引算页数 + lastmod)。
func (s *Service) SitemapCount() (int64, time.Time, error) { return s.repo.SitemapCount() }

// SitemapPage 第 page 页(1-based)已上线工具的 slug + updated_at,按 id 升序稳定分页。
func (s *Service) SitemapPage(page, size int) ([]SitemapRow, error) {
	return s.repo.SitemapPage(page, size)
}

// ── 小工具 ───────────────────────────────────────────────────────────────────

func isAllDigits(s string) bool {
	if s == "" {
		return false
	}
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

func parseUint64(s string) uint64 {
	var n uint64
	for _, r := range s {
		n = n*10 + uint64(r-'0')
	}
	return n
}
