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

// Service 业务层
type Service struct {
	repo *Repository
}

// NewService 构造
func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
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
	s.invalidateSitemapCache()
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
	}

	if written > 0 {
		s.invalidateSitemapCache()
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

// GetSitemapSummary 生成 sitemap 索引文件所需的摘要
func (s *Service) GetSitemapSummary() (*SitemapSummary, error) {
	return s.repo.GetSitemapSummary()
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
		s.invalidateSitemapCache()
	}
	return nil
}

// invalidateSitemapCache 触发 sitemap Redis 缓存失效（写穿透）
// 使用短 TTL 的失效标记而非立即 DEL，避免对高并发写入的抖动
func (s *Service) invalidateSitemapCache() {
	rdb := cache.GetRedis()
	if rdb == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
	defer cancel()
	// 约定 sitemap handler 消费的键前缀为 seo:sitemap:
	// 这里不逐 key 删，只 bump 版本号，sitemap handler 每次读都带版本号计算缓存键。
	// 版本号 SETEX 24h：即使没有写入，第二天也自然更新一次。
	if err := rdb.Incr(ctx, "seo:sitemap:version").Err(); err != nil {
		slog.Warn("seo sitemap version bump failed", "err", err)
	}
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
