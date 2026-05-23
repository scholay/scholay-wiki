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
	"time"

	"scholar-backend/internal/common/cache"
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

// enqueuePaperSlugs 把若干 paper slug 转成 /paper/{slug} 入队
func (s *Service) enqueuePaperSlugs(slugs ...string) {
	if s.submitter == nil || len(slugs) == 0 {
		return
	}
	paths := make([]string, 0, len(slugs))
	for _, slug := range slugs {
		if slug != "" {
			paths = append(paths, "/paper/"+slug)
		}
	}
	s.submitter.EnqueuePaths(context.Background(), paths)
}

// enqueueAuthorSlugs 把若干 author slug 转成 /author/{slug} 入队
func (s *Service) enqueueAuthorSlugs(slugs ...string) {
	if s.submitter == nil || len(slugs) == 0 {
		return
	}
	paths := make([]string, 0, len(slugs))
	for _, slug := range slugs {
		if slug != "" {
			paths = append(paths, "/author/"+slug)
		}
	}
	s.submitter.EnqueuePaths(context.Background(), paths)
}

// RecordDetailClick 记录用户点击详情页（tier=1 高质量）
// 由 usagelog 的 detail_page_view / landing_page_view 钩子调用
// 必填：seed.PaperID、seed.Title；其它字段尽力而为
func (s *Service) RecordDetailClick(seed *PaperSeed) error {
	if seed == nil || seed.PaperID == "" || seed.Title == "" {
		return errors.New("detail click requires paper_id and title")
	}

	// source 缺失时按 paperId 前缀兜底推断（stc / olx）
	if seed.Source == "" {
		seed.Source = InferSource(seed.PaperID)
	}

	slug := GenerateSlug(seed.Title, seed.PaperID)
	authorsJSON := marshalAuthors(seed.Authors)
	fieldsJSON := marshalFields(seed.FieldsOfStudy)

	if err := s.repo.UpsertDetail(seed, slug, authorsJSON, fieldsJSON); err != nil {
		return err
	}
	s.invalidatePapersCache()
	s.enqueuePaperSlugs(slug)
	return nil
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
	pushSlugs := make([]string, 0, len(seeds))
	for i := range seeds {
		seed := &seeds[i]
		if seed.PaperID == "" || seed.Title == "" {
			continue
		}
		if seed.Source == "" {
			seed.Source = InferSource(seed.PaperID)
		}
		slug := GenerateSlug(seed.Title, seed.PaperID)
		authorsJSON := marshalAuthors(seed.Authors)
		fieldsJSON := marshalFields(seed.FieldsOfStudy)

		if err := s.repo.UpsertSeed(seed, slug, authorsJSON, fieldsJSON); err != nil {
			slog.Warn("seo seed upsert failed", "paper_id", seed.PaperID, "err", err)
			continue
		}
		written++
		pushSlugs = append(pushSlugs, slug)
	}

	if written > 0 {
		s.invalidatePapersCache()
		s.enqueuePaperSlugs(pushSlugs...)
	}
	return written, nil
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

// GetTopPaperSlugs 用于主动 SEO 提交的启动 seed:返回最值得推送的 paper slug。
func (s *Service) GetTopPaperSlugs(limit int) []string {
	slugs, err := s.repo.ListTopSlugs(limit)
	if err != nil {
		return nil
	}
	return slugs
}

// GetTopAuthorSlugs 用于主动 SEO 提交的启动 seed:返回最值得推送的 author slug。
func (s *Service) GetTopAuthorSlugs(limit int) []string {
	slugs, err := s.repo.ListTopAuthorSlugs(limit)
	if err != nil {
		return nil
	}
	return slugs
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
// 合并锁(SETNX EX coalesceWindow): 同一计数器在 coalesceWindow 秒内的多次写入
// 只触发一次 INCR,避免高并发下 cache key 频繁失效导致冷启风暴。
const (
	sitemapPapersVersionKey   = "seo:sitemap:papers:version"
	sitemapAuthorsVersionKey  = "seo:sitemap:authors:version"
	sitemapJournalsVersionKey = "seo:sitemap:journals:version"
	sitemapPapersLockKey      = "seo:sitemap:papers:invalidate-lock"
	sitemapAuthorsLockKey     = "seo:sitemap:authors:invalidate-lock"
	sitemapJournalsLockKey    = "seo:sitemap:journals:invalidate-lock"

	// 合并窗口: 5 秒内的多次写入只触发 1 次版本递增
	// 代价: sitemap 最多比写入晚 5 秒可见; 收益: cache key 不会随每次 expose 抖动
	sitemapCoalesceWindow = 5 * time.Second
	// 版本号本身的 TTL: 一周。Redis 重启会清零(handler 拿到 0,正常重建)
	sitemapVersionTTL = 7 * 24 * time.Hour
)

// invalidatePapersCache 论文相关写入触发 (RecordDetailClick / RecordSearchSeeds / Reconcile)
func (s *Service) invalidatePapersCache() {
	bumpVersionWithCoalesce(sitemapPapersLockKey, sitemapPapersVersionKey)
}

// invalidateAuthorsCache 作者相关写入触发
func (s *Service) invalidateAuthorsCache() {
	bumpVersionWithCoalesce(sitemapAuthorsLockKey, sitemapAuthorsVersionKey)
}

// bumpVersionWithCoalesce SETNX 合并锁实现:
//   - SETNX lock=1 EX 5s 成功 → 当前调用是窗口内第一个,执行 INCR
//   - 失败 → 已有同窗口内的调用做过 INCR,本次跳过
// 这样高 QPS 下也只产生 ~1 INCR / 5s,平稳缓存键。
func bumpVersionWithCoalesce(lockKey, versionKey string) {
	rdb := cache.GetRedis()
	if rdb == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
	defer cancel()

	// 抢窗口锁
	ok, err := rdb.SetNX(ctx, lockKey, "1", sitemapCoalesceWindow).Result()
	if err != nil {
		slog.Warn("seo sitemap invalidate lock failed", "key", lockKey, "err", err)
		return
	}
	if !ok {
		// 窗口内已经 bumped 过,本次合并跳过
		return
	}

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
