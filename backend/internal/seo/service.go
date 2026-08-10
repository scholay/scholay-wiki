// ============================================================================
// Scholay学术 V1.0
// SEO Service —— 业务编排层
//
// 职责：
//   1. 将上游 PaperSeed 补全为可写行（生成 slug、序列化 authors/fields）
//   2. 提供两种写入入口（detail 点击 / search 曝光）
//   3. 维护 sitemap_page 字段的定期回填
//   4. 失效 Redis 中的 sitemap 缓存（写入驱动，非轮询）
// ============================================================================

package seo

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/url"
	"time"

	"scholar-backend/internal/common/cache"
	"scholar-backend/internal/common/ctxutil"
)

// PushSubmitter 由 seosubmit.Service 实现,把待收录的 URL 路径喂给主动提交队列。
// 用接口解耦,seo 包不直接 import seosubmit(避免循环或硬绑)。
type PushSubmitter interface {
	EnqueuePaths(ctx context.Context, paths []string)
}

// Service 业务层
type Service struct {
	repo      *Repository
	submitter PushSubmitter // 可选;nil 时所有写入路径都不会触发主动提交
}

// NewService 构造
func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

// SetPushSubmitter 注入主动 SEO 提交器。bootstrap 阶段调用一次。
func (s *Service) SetPushSubmitter(p PushSubmitter) {
	s.submitter = p
}

// paperCanonicalPath 由 source + paperID 拼出**canonical** 论文路径 /paper/{source}/{id}。
// 必须与 sitemap(canonicalEntityURL)和 SSR canonical link 一致 —— 主动推送(百度/IndexNow)
// 若推 legacy /paper/{slug} 会被 canonicalRedirectFor 301,浪费推送配额、稀释 canonical 信号。
func paperCanonicalPath(source, paperID string) string {
	if !IsCanonicalSource(source) || paperID == "" {
		return ""
	}
	return "/paper/" + source + "/" + url.PathEscape(paperID)
}

// enqueuePaperPaths 把若干**已是 canonical** 的论文路径入队主动推送。
func (s *Service) enqueuePaperPaths(paths ...string) {
	if s.submitter == nil || len(paths) == 0 {
		return
	}
	out := make([]string, 0, len(paths))
	for _, p := range paths {
		if p != "" {
			out = append(out, p)
		}
	}
	if len(out) > 0 {
		s.submitter.EnqueuePaths(context.Background(), out)
	}
}

// enqueueIndexablePaperRows keeps proactive submission on the exact same
// row-level eligibility contract as sitemap leaves and SSR. Search discovery
// may persist a title-only tier-2 row for later enrichment, but that thin row
// must not be sent to IndexNow/Baidu while its HTML is still noindex.
func (s *Service) enqueueIndexablePaperRows(rows ...*SEOPaper) {
	paths := make([]string, 0, len(rows))
	for _, row := range rows {
		if !paperRowIndexable(row) {
			continue
		}
		paths = append(paths, paperCanonicalPath(row.Source, row.PaperID))
	}
	s.enqueuePaperPaths(paths...)
}

// authorCanonicalPath 由 source + authorID 拼出 canonical 作者路径 /author/{source}/{id}
// (与 sitemap canonicalEntityURL 一致;避免推送 legacy /author/{slug} 被 301)。
func authorCanonicalPath(source, authorID string) string {
	if source == "" || authorID == "" {
		return ""
	}
	return "/author/" + source + "/" + url.PathEscape(authorID)
}

// enqueueAuthorPaths 把若干**已是 canonical** 的作者路径入队主动推送。
func (s *Service) enqueueAuthorPaths(paths ...string) {
	if s.submitter == nil || len(paths) == 0 {
		return
	}
	out := make([]string, 0, len(paths))
	for _, p := range paths {
		if p != "" {
			out = append(out, p)
		}
	}
	if len(out) > 0 {
		s.submitter.EnqueuePaths(context.Background(), out)
	}
}

// enqueueIndexableAuthorRows mirrors authorSitemapRows/authorRowIndexable for
// proactive submission. Name-only tier-2 shells remain available for future
// enrichment without consuming crawler submission quota prematurely.
func (s *Service) enqueueIndexableAuthorRows(rows ...*SEOAuthor) {
	paths := make([]string, 0, len(rows))
	for _, row := range rows {
		if !authorRowIndexable(row) {
			continue
		}
		paths = append(paths, authorCanonicalPath(row.Source, row.AuthorID))
	}
	s.enqueueAuthorPaths(paths...)
}

// RecordDetailClick 记录用户点击详情页（tier=1 高质量）
// 由 usagelog 的 detail_page_view / landing_page_view 钩子调用
// 必填：seed.PaperID、seed.Title；其它字段尽力而为
func (s *Service) RecordDetailClick(seed *PaperSeed) error {
	if seed == nil || seed.PaperID == "" || seed.Title == "" {
		return errors.New("detail click requires paper_id and title")
	}

	// entity ID 是来源的权威信号；忽略公开请求中可伪造的 source。
	seed.Source = InferSource(seed.PaperID)

	slug := GenerateSlug(seed.Title, seed.PaperID)
	authorsJSON := marshalAuthors(seed.Authors)
	fieldsJSON := marshalFields(seed.FieldsOfStudy)

	if err := s.repo.UpsertDetail(seed, slug, authorsJSON, fieldsJSON); err != nil {
		return err
	}
	s.invalidatePapersCache()
	s.enqueuePaperPaths(paperCanonicalPath(seed.Source, seed.PaperID))
	return nil
}

// RecordDetailSeeds 把论文**详情曝光**按 tier-1 记录(priority 高 / changefreq weekly)。返回成功数。
// 详情正常 1 条;设小上限防滥用。每条走 RecordDetailClick(tier-1 upsert + canonical 入队)。
func (s *Service) RecordDetailSeeds(seeds []PaperSeed) (int, error) {
	const detailSeedBatchLimit = 10
	if len(seeds) > detailSeedBatchLimit {
		seeds = seeds[:detailSeedBatchLimit]
	}
	n := 0
	for i := range seeds {
		if err := s.RecordDetailClick(&seeds[i]); err != nil {
			slog.Warn("seo detail seed upsert failed", "paper_id", seeds[i].PaperID, "err", err)
			continue
		}
		n++
	}
	return n, nil
}

// RecordSearchSeeds 记录一批搜索曝光（tier=2 长尾种子）
// 由搜索结果页调用：传入 1-20 条搜索结果的精简元数据
// 去重由 DB 层唯一索引兜底，这里只负责打包和限流
func (s *Service) RecordSearchSeeds(seeds []PaperSeed) (int, error) {
	if len(seeds) == 0 {
		return 0, nil
	}
	if len(seeds) > SearchSeedBatchLimit {
		seeds = seeds[:SearchSeedBatchLimit]
	}

	written := 0
	var writeErr error
	pushRows := make([]*SEOPaper, 0, len(seeds))
	for i := range seeds {
		seed := &seeds[i]
		if seed.PaperID == "" || seed.Title == "" {
			continue
		}
		seed.Source = InferSource(seed.PaperID)
		slug := GenerateSlug(seed.Title, seed.PaperID)
		authorsJSON := marshalAuthors(seed.Authors)
		fieldsJSON := marshalFields(seed.FieldsOfStudy)

		if err := s.repo.UpsertSeed(seed, slug, authorsJSON, fieldsJSON); err != nil {
			slog.Warn("seo seed upsert failed", "paper_id", seed.PaperID, "err", err)
			writeErr = errors.Join(writeErr, err)
			continue
		}
		written++

		// Read the durable final row rather than judging only the incoming seed:
		// an existing row may already be tier-1 / enriched, hidden, or retired.
		// This is the same object SSR evaluates with paperRowIndexable.
		row, err := s.repo.GetByPaperID(seed.PaperID)
		if err != nil {
			slog.Warn("seo seed eligibility read failed", "paper_id", seed.PaperID, "err", err)
			writeErr = errors.Join(writeErr, err)
			continue
		}
		pushRows = append(pushRows, row)
	}

	if written > 0 {
		s.invalidatePapersCache()
		s.enqueueIndexablePaperRows(pushRows...)
	}
	return written, writeErr
}

// GetBySlug 路由解析（SSR 用）
func (s *Service) GetBySlug(slug string) (*SEOPaper, error) {
	return s.repo.GetBySlug(slug)
}

// GetByPaperID 兼容老链接、后台维护
func (s *Service) GetByPaperID(paperID string) (*SEOPaper, error) {
	return s.repo.GetByPaperID(paperID)
}

// GetSitemapPage 获取指定分页的 sitemap 条目
func (s *Service) GetSitemapPage(page int) ([]SitemapEntry, error) {
	return s.repo.ListSitemapPage(page)
}

// GetTopPaperPaths 用于主动 SEO 提交的启动 seed:返回最值得推送的论文 canonical 路径。
func (s *Service) GetTopPaperPaths(limit int) []string {
	paths, err := s.repo.ListTopPaperPaths(limit)
	if err != nil {
		return nil
	}
	return paths
}

// GetTopAuthorPaths 用于主动 SEO 提交的启动 seed:返回最值得推送的作者 canonical 路径。
func (s *Service) GetTopAuthorPaths(limit int) []string {
	paths, err := s.repo.ListTopAuthorPaths(limit)
	if err != nil {
		return nil
	}
	return paths
}

// GetSitemapSummary 生成 sitemap 索引文件所需的摘要
func (s *Service) GetSitemapSummary() (*SitemapSummary, error) {
	return s.repo.GetSitemapSummary()
}

// GetSitemapLastModPerPage 索引文件用,拿每个 papers 分页的真实 lastmod
func (s *Service) GetSitemapLastModPerPage() (map[int]time.Time, error) {
	return s.repo.GetSitemapLastModPerPage()
}

// ReconcileSitemapPages 定期回填 sitemap_page=0 的新行（后台任务）
// 每个新行插入时 sitemap_page 暂置 0；这里按 id 区间一次性计算并写回。
func (s *Service) ReconcileSitemapPages() error {
	affected, err := s.repo.BackfillSitemapPage()
	if err != nil {
		return err
	}
	if affected > 0 {
		slog.Info("seo sitemap pages reconciled", "rows", affected)
		s.invalidatePapersCache()
	}
	return nil
}

// 缓存版本号: 写入路径 INCR,handler 把它织进 cache key,旧版本随 TTL 自然失效。
//
// 拆成 papers / authors 两个独立计数器(原本是单一 seo:sitemap:version):
//   - 论文写入只让 papers cache 失效,作者 sitemap 不受影响,反之亦然
//   - 索引文件 cache key 同时引用两个版本号,任一变化都重建
//
// 每次成功写入都必须 INCR。曾用 SETNX 5s 做 leading-edge 合并，但窗口内
// 第二次写入没有 trailing bump：若爬虫在首次 bump 后立即缓存 leaf，后续行
// 会被漏到 6h TTL 结束。各批量 service 本就只在批次尾 invalidate 一次，
// Redis INCR 成本远低于错过 sitemap URL，因此优先 correctness。
const (
	sitemapPapersVersionKey   = "seo:sitemap:papers:version"
	sitemapAuthorsVersionKey  = "seo:sitemap:authors:version"
	sitemapJournalsVersionKey = "seo:sitemap:journals:version"
	// 版本号本身的 TTL: 一周。Redis 重启会清零(handler 拿到 0,正常重建)
	sitemapVersionTTL = 7 * 24 * time.Hour
)

// invalidatePapersCache 论文相关写入触发 (RecordDetailClick / RecordSearchSeeds / Reconcile)
func (s *Service) invalidatePapersCache() {
	bumpSitemapVersion(sitemapPapersVersionKey)
}

// invalidateAuthorsCache 作者相关写入触发
func (s *Service) invalidateAuthorsCache() {
	bumpSitemapVersion(sitemapAuthorsVersionKey)
}

func bumpSitemapVersion(versionKey string) {
	rdb := cache.GetRedis()
	if rdb == nil {
		return
	}
	ctx, cancel := ctxutil.With(ctxutil.CacheWrite)
	defer cancel()

	if err := rdb.Incr(ctx, versionKey).Err(); err != nil {
		slog.Warn("seo sitemap version bump failed", "key", versionKey, "err", err)
		return
	}
	// 给版本号一个长 TTL,避免无限驻留(Redis 重启自然归零)
	_ = rdb.Expire(ctx, versionKey, sitemapVersionTTL).Err()
}

// marshalAuthors 把 Author 列表序列化为紧凑 JSON，空值返回空串（触发 NULLIF 在 SQL 中存 NULL）
func marshalAuthors(authors []Author) string {
	if len(authors) == 0 {
		return ""
	}
	b, err := json.Marshal(authors)
	if err != nil {
		return ""
	}
	return string(b)
}

// marshalFields 序列化 fields_of_study，空值返回空串
func marshalFields(fields []string) string {
	if len(fields) == 0 {
		return ""
	}
	b, err := json.Marshal(fields)
	if err != nil {
		return ""
	}
	return string(b)
}
