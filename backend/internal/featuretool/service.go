// ============================================================================
// 功能广场 —— 服务层 (业务逻辑)
//
// CRUD (每次变更派发 webhook) + 批量导入 (异步任务) + 分类计数。
// ============================================================================

package featuretool

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"gorm.io/gorm"

	"scholar-backend/internal/common/safego"
	"scholar-backend/internal/seo"
)

var (
	ErrNotFound  = errors.New("featuretool: tool not found")
	ErrNameEmpty = errors.New("featuretool: name is required")
	ErrSEOReview = errors.New("featuretool: SEO approval requirements not met")
)

type Service struct {
	repo      *Repository
	disp      *Dispatcher
	submitter PushSubmitter
}

func NewService(repo *Repository, disp *Dispatcher) *Service {
	return &Service{repo: repo, disp: disp}
}

// PushSubmitter is implemented by seosubmit.Service. Feature tools keep this
// interface local so the catalogue package does not depend on the submission
// implementation (or on a particular search engine).
type PushSubmitter interface {
	EnqueuePaths(ctx context.Context, paths []string)
}

// SetPushSubmitter wires approved tool changes into the same canonical URL
// queue used by papers/authors/news. It is optional in tests and local tooling.
func (s *Service) SetPushSubmitter(p PushSubmitter) { s.submitter = p }

func (s *Service) enqueueToolPaths(slugs ...string) {
	if s.submitter == nil {
		return
	}
	seen := make(map[string]struct{}, len(slugs))
	paths := make([]string, 0, len(slugs))
	for _, slug := range slugs {
		slug = strings.TrimSpace(slug)
		if slug == "" {
			continue
		}
		path := "/tools/" + url.PathEscape(slug)
		if _, ok := seen[path]; ok {
			continue
		}
		seen[path] = struct{}{}
		paths = append(paths, path)
	}
	if len(paths) > 0 {
		s.submitter.EnqueuePaths(context.Background(), paths)
	}
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
		id, ok := parseNumericToolID(idOrSlug)
		if !ok {
			return nil, ErrNotFound
		}
		t, err = s.repo.GetByID(id)
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
	if err := applySEOReview(t, false, adminID); err != nil {
		return nil, err
	}
	if t.Status == "published" && t.PublishedAt == nil {
		now := time.Now()
		t.PublishedAt = &now
	}
	if err := s.repo.Create(t); err != nil {
		return nil, err
	}
	s.disp.Dispatch(EventCreated, t)
	if t.SEOIndexable {
		s.enqueueToolPaths(t.Slug)
	}
	return t, nil
}

func (s *Service) Update(id uint64, t *Tool, adminID *uint) (*Tool, error) {
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
	t.SEOReviewedAt = existing.SEOReviewedAt
	t.SEOReviewedBy = existing.SEOReviewedBy
	if err := applySEOReview(t, existing.SEOIndexable, adminID); err != nil {
		return nil, err
	}
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
	if existing.SEOIndexable || t.SEOIndexable {
		// Submit both paths when an approved slug changes. The old URL must be
		// revisited to observe its 404/redirect and the new canonical must be
		// discovered without waiting for sitemap cache expiry.
		s.enqueueToolPaths(existing.Slug, t.Slug)
	}
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
	if t.SEOIndexable {
		s.enqueueToolPaths(t.Slug)
	}
	return nil
}

// ── 批量导入 (异步任务) ──────────────────────────────────────────────────────

type ImportInput struct {
	Items    []json.RawMessage
	Images   map[string]imageEntry // zip 导入: slug→logo, 在后台任务里并发上传(避免请求超时)
	Notify   bool
	Source   string
	Filename string
	AdminID  *uint
}

// StartImport 创建导入任务并在后台处理, 立即返回 job (status=pending/running)。
// logo 上传(zip 场景最多 5000 张 MinIO 写)也在后台进行, handler 不再同步阻塞 → 不超时。
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
	images := in.Images
	notify := in.Notify
	adminID := in.AdminID
	jobID := job.ID
	safego.Go("featuretool.import", func() { s.processImport(jobID, items, images, notify, adminID) })
	return job, nil
}

func (s *Service) processImport(jobID uint64, items []json.RawMessage, images map[string]imageEntry, notify bool, adminID *uint) {
	job, err := s.repo.GetJob(jobID)
	if err != nil {
		return
	}
	job.Status = "running"
	_ = s.repo.SaveJob(job)

	// ── 阶段一: 并发上传 logo 到 MinIO(仅 zip 导入且 storage 可用)──
	// 这是原来卡在 HTTP 请求里导致超时的活, 现在移到后台并发做, 带实时进度。
	if logosEnabled(images) {
		job.Phase = "uploading_logos"
		job.LogoTotal = len(images)
		job.LogoDone = 0
		_ = s.repo.SaveJob(job)

		var done atomic.Int64
		stop := make(chan struct{})
		go func() { // 独立 ticker: 周期把 logo_done 落库, 任务页 1.5s 轮询即可看到爬动
			t := time.NewTicker(800 * time.Millisecond)
			defer t.Stop()
			for {
				select {
				case <-stop:
					return
				case <-t.C:
					_ = s.repo.UpdateJobLogoDone(jobID, int(done.Load()))
				}
			}
		}()
		logoBySlug := uploadLogosConcurrent(context.Background(), images, &done)
		close(stop)
		items = rewriteLogos(items, logoBySlug)
		job.LogoDone = len(images)
	}

	// ── 阶段二: 逐条 upsert ──
	job.Phase = "importing"
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
	job.Phase = "done"
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
		// An automated import invalidates the editorial decision, even when the tool
		// stays published. Changed content must be reviewed again before re-entering
		// the sitemap.
		t.SEOIndexable = false
		t.SEOReviewedAt = nil
		t.SEOReviewedBy = nil
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
		if existing.SEOIndexable {
			// Imports deliberately revoke editorial approval. Ask engines to
			// revisit the formerly indexable URL and observe noindex promptly.
			s.enqueueToolPaths(existing.Slug, t.Slug)
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
	t.SEOIndexable = false
	t.SEOReviewedAt = nil
	t.SEOReviewedBy = nil
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

// applySEOReview enforces the objective minimum contract before an administrator
// can expose a tool to search engines. It deliberately does not infer approval
// from `published`: imported catalogue records remain product-visible but noindex.
func applySEOReview(t *Tool, wasIndexable bool, adminID *uint) error {
	if !t.SEOIndexable {
		if wasIndexable {
			now := time.Now()
			t.SEOReviewedAt = &now
			t.SEOReviewedBy = adminID
		}
		// false -> false is a normal edit of an already non-indexable row.
		// Preserve the last explicit approval/revocation audit copied from the
		// database instead of silently erasing who made that decision.
		return nil
	}
	if adminID == nil {
		return ErrSEOReview
	}
	if seoReviewViolation(t) != "" {
		return ErrSEOReview
	}
	now := time.Now()
	t.SEOReviewedAt = &now
	t.SEOReviewedBy = adminID
	return nil
}

// seoReviewViolation 返回工具不满足 SEO 客观最低契约的原因;"" 表示通过。
// applySEOReview(单件管理员编辑)与 BatchSEOReview(批量审核)共用这一份契约,
// 两条路径永不漂移。
func seoReviewViolation(t *Tool) string {
	switch {
	case t.Status != "published":
		return "status != published"
	case isAllDigits(t.Slug):
		return "numeric-only slug"
	case !isPublicHTTPURL(t.OfficialURL):
		return "official_url is not a public http(s) URL"
	case len([]rune(strings.TrimSpace(t.DescriptionMD))) < 120:
		return "description_md shorter than 120 chars"
	case t.DataQuality == nil || !t.DataQuality.Enriched:
		return "data_quality not enriched"
	case t.DataQuality.NeedsReview:
		return "data_quality.needs_review is set"
	case len(t.DataQuality.NeedsEnrich) > 0:
		return "data_quality.needs_enrich pending"
	case !hasPublicSource(t.DataQuality.Sources):
		return "no public data_quality source"
	case countSubstantiveUseCases(t.UseCases) < 2:
		return "fewer than 2 substantive use cases"
	default:
		return ""
	}
}

// ── 批量 SEO 审核放行 ────────────────────────────────────────────────────────

// BatchSEOReviewResult 一次批量审核的结果与续扫游标。
type BatchSEOReviewResult struct {
	Scanned     int               `json:"scanned"`      // 本批扫描的候选数
	Approved    int               `json:"approved"`     // 通过契约并置位的条数(dry_run 时为「将通过」数)
	Skipped     int               `json:"skipped"`      // 未过契约、保持 noindex 的条数
	SkipSamples []BatchSkipSample `json:"skip_samples"` // 未过原因样本(≤10 条,便于诊断)
	LastID      uint64            `json:"last_id"`      // 续扫游标:下一批传 after_id=LastID
	Done        bool              `json:"done"`         // 候选已扫完
	DryRun      bool              `json:"dry_run"`
}

type BatchSkipSample struct {
	Slug   string `json:"slug"`
	Reason string `json:"reason"`
}

// BatchSEOReview 把「已发布但未过 SEO 审核」的工具按 seoReviewViolation 的同一份
// 客观契约批量审核放行。2026-08-10 审计:50,200 个已发布工具 seo_indexable 全为 0,
// 单件审核流程从未执行,整个垂类零 sitemap 发现性,而它恰是收录表现最好的一族页面
// (noindex 生效前的历史收录,会随重抓消失)。
//
// 设计:
//   - 幂等:只扫 seo_indexable=0 的行;通过的置位并落审计字段(reviewed_by=触发的管理员);
//   - 游标分批(afterID/limit),管理员可 dry_run 预览、分批灰度;
//   - 不过契约的行保持 noindex,原因进 SkipSamples;
//   - 放行的 slug 喂给主动提交队列(幂等 ZSET,IndexNow/百度按日额慢慢消化)。
func (s *Service) BatchSEOReview(adminID *uint, afterID uint64, limit int, dryRun bool) (*BatchSEOReviewResult, error) {
	if adminID == nil {
		return nil, ErrSEOReview
	}
	if limit <= 0 {
		limit = 1000
	}
	if limit > 5000 {
		limit = 5000
	}
	tools, err := s.repo.SEOReviewCandidates(afterID, limit)
	if err != nil {
		return nil, err
	}
	res := &BatchSEOReviewResult{
		Scanned:     len(tools),
		LastID:      afterID,
		Done:        len(tools) < limit,
		DryRun:      dryRun,
		SkipSamples: []BatchSkipSample{},
	}
	ids := make([]uint64, 0, len(tools))
	slugs := make([]string, 0, len(tools))
	for i := range tools {
		t := &tools[i]
		if t.ID > res.LastID {
			res.LastID = t.ID
		}
		if reason := seoReviewViolation(t); reason != "" {
			res.Skipped++
			if len(res.SkipSamples) < 10 {
				res.SkipSamples = append(res.SkipSamples, BatchSkipSample{Slug: t.Slug, Reason: reason})
			}
			continue
		}
		ids = append(ids, t.ID)
		slugs = append(slugs, t.Slug)
	}
	if dryRun {
		res.Approved = len(ids)
		return res, nil
	}
	approved, err := s.repo.ApproveSEOBatch(ids, adminID, time.Now())
	if err != nil {
		return nil, err
	}
	res.Approved = int(approved)
	s.enqueueToolPaths(slugs...)
	return res, nil
}

func isPublicHTTPURL(raw string) bool {
	u, err := url.ParseRequestURI(strings.TrimSpace(raw))
	if err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" || u.User != nil {
		return false
	}
	host := strings.TrimSuffix(strings.ToLower(u.Hostname()), ".")
	if host == "" || host == "localhost" || strings.HasSuffix(host, ".localhost") || strings.HasSuffix(host, ".local") {
		return false
	}
	if ip := net.ParseIP(host); ip != nil {
		return !ip.IsPrivate() && !ip.IsLoopback() && !ip.IsLinkLocalUnicast() && !ip.IsUnspecified()
	}
	return true
}

func hasPublicSource(sources []string) bool {
	for _, source := range sources {
		if isPublicHTTPURL(source) {
			return true
		}
	}
	return false
}

func countSubstantiveUseCases(items []UseCase) int {
	count := 0
	for _, item := range items {
		if strings.TrimSpace(item.Title) != "" && len([]rune(strings.TrimSpace(item.Desc))) >= 12 {
			count++
		}
	}
	return count
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
// reservedToolSlugs: 桌面/移动工具子路由的保留段（skills=社区技能，all=功能
// 广场列表，pc=「建议电脑端使用」引导），不能作为工具 slug；否则 sitemap 会
// 指向一个被静态路由遮蔽的错误页面。
// 命中则在 ensureUniqueSlug 里视作「已占用」自动退避到 base-2(如 "all" → "all-2")。
var reservedToolSlugs = map[string]bool{"all": true, "pc": true, "skills": true}

func (s *Service) ensureUniqueSlug(provided, name, nameEn string, topicID *int64, exceptID uint64) (string, error) {
	base := slugify(provided)
	// Numeric path segments are ambiguous with the public detail endpoint's
	// legacy ID fallback, so they are never valid slugs. Migration 0121 rewrites
	// the historical numeric rows before any page can be approved.
	if isAllDigits(base) {
		base = ""
	}
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
func (s *Service) CreateWebhook(w *Webhook) error         { return s.repo.CreateWebhook(w) }
func (s *Service) SaveWebhook(w *Webhook) error           { return s.repo.SaveWebhook(w) }
func (s *Service) DeleteWebhook(id uint64) error          { return s.repo.DeleteWebhook(id) }
func (s *Service) GetWebhook(id uint64) (*Webhook, error) { return s.repo.GetWebhook(id) }
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
// 公开 API 历史上也接受 /tools/{numeric-id}；SSR 必须用同一解析规则找到该行，
// 再由 handler 统一 301 到权威 slug。仅已上线工具返回。
func (s *Service) ResolveToolBySlug(slug string) (*seo.ToolSSRMeta, error) {
	var t *Tool
	var err error
	if isAllDigits(slug) {
		id, ok := parseNumericToolID(slug)
		if !ok {
			return nil, nil
		}
		t, err = s.repo.GetByID(id)
	} else {
		t, err = s.repo.GetBySlug(slug)
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if t == nil || t.Status != "published" {
		return nil, nil
	}
	return toolSSRMeta(t), nil
}

// ListIndexableToolsForSEO supplies the public /tools SSR hub with real,
// crawlable internal links. The repository applies the exact same editorial
// eligibility scope as the tool sitemap.
func (s *Service) ListIndexableToolsForSEO(limit int) ([]*seo.ToolSSRMeta, error) {
	tools, err := s.repo.ListIndexableForSEO(limit)
	if err != nil {
		return nil, err
	}
	out := make([]*seo.ToolSSRMeta, 0, len(tools))
	for i := range tools {
		out = append(out, toolSSRMeta(&tools[i]))
	}
	return out, nil
}

func toolSSRMeta(t *Tool) *seo.ToolSSRMeta {
	if t == nil {
		return nil
	}
	useCases := make([]seo.ToolUseCaseMeta, 0, len(t.UseCases))
	for _, item := range t.UseCases {
		if strings.TrimSpace(item.Title) != "" {
			useCases = append(useCases, seo.ToolUseCaseMeta{Title: item.Title, Desc: item.Desc})
		}
	}
	faq := make([]seo.ToolQAMeta, 0, len(t.FAQ))
	for _, item := range t.FAQ {
		if strings.TrimSpace(item.Q) != "" && strings.TrimSpace(item.A) != "" {
			faq = append(faq, seo.ToolQAMeta{Question: item.Q, Answer: item.A})
		}
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
		OfficialURL:   t.OfficialURL,
		SEOIndexable:  t.SEOIndexable,
		UseCases:      useCases,
		FAQ:           faq,
	}
}

// SitemapCount 已上线工具总数 + 最近更新时间(给 sitemap 索引算页数 + lastmod)。
func (s *Service) SitemapCount() (int64, time.Time, error) { return s.repo.SitemapCount() }

// SitemapPages 返回工具 sitemap 的分片总数 + 最新 lastmod(YYYY-MM-DD 粒度)。
// 供 seo 主 sitemap 索引「直接列出各叶子分片 /sitemap-tools-N.xml」用 —— 避免主索引引用
// /sitemap-tools.xml(索引套索引,协议/Google 不递归)。分片数用与 sitemap.go 同一个
// toolSitemapPageSize 计算,单一真源。无数据返回 (0, "", nil)；
// 仓储错误必须上抛，主 sitemap 应返回 5xx，不能缓存一份静默丢失全部工具分片的 200 索引。
func (s *Service) SitemapPages() (int, string, error) {
	count, lastMod, err := s.repo.SitemapCount()
	if err != nil {
		return 0, "", err
	}
	if count <= 0 {
		return 0, "", nil
	}
	pages := int((count + toolSitemapPageSize - 1) / toolSitemapPageSize)
	if pages < 1 {
		pages = 1
	}
	return pages, lastMod.Format("2006-01-02"), nil
}

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

func parseNumericToolID(s string) (uint64, bool) {
	if !isAllDigits(s) {
		return 0, false
	}
	id, err := strconv.ParseUint(s, 10, 64)
	if err != nil || id == 0 {
		return 0, false
	}
	return id, true
}
