// ============================================================================
// SEO Author Service —— 业务编排层（与 service.go 中 paper 部分对偶）
// ============================================================================

package seo

import (
	"encoding/json"
	"errors"
	"log/slog"
	"time"
)

// AuthorSeedBatchLimit 单次批量 expose 上限（与 SearchSeedBatchLimit 相同语义）
// 因为搜索结果一页通常只有 10 篇论文,每篇平均 3-5 个作者,合并去重后远小于 50。
const AuthorSeedBatchLimit = 50

// RecordAuthorDetailClick 记录用户点击作者详情页（tier=1）
func (s *Service) RecordAuthorDetailClick(seed *AuthorSeed) error {
	if seed == nil || seed.AuthorID == "" || seed.Name == "" {
		return errors.New("author detail click requires author_id and name")
	}
	// entity ID 是来源的权威信号；忽略公开请求中可伪造的 source。
	seed.Source = InferAuthorSource(seed.AuthorID)
	slug := GenerateAuthorSlug(seed.Name, seed.AuthorID)
	affJSON := marshalStrings(seed.Affiliations)

	if err := s.repo.UpsertAuthorDetail(seed, slug, affJSON); err != nil {
		return err
	}
	// ORCID 旁路写入(首次拿到即固化);失败不致命,不影响主记录。
	if seed.ORCID != "" {
		if err := s.repo.SetAuthorORCID(seed.AuthorID, seed.ORCID); err != nil {
			slog.Warn("seo author orcid set failed", "author_id", seed.AuthorID, "err", err)
		}
	}
	s.invalidateAuthorsCache()
	s.enqueueAuthorPaths(authorCanonicalPath(seed.Source, seed.AuthorID))
	return nil
}

// RecordAuthorSearchSeeds 记录一批搜索曝光的作者（tier=2 长尾种子）
// 调用方:前端搜索结果页 expose 时把每篇论文的 authors 抽出来做去重后传过来。
func (s *Service) RecordAuthorSearchSeeds(seeds []AuthorSeed) (int, error) {
	if len(seeds) == 0 {
		return 0, nil
	}
	if len(seeds) > AuthorSeedBatchLimit {
		seeds = seeds[:AuthorSeedBatchLimit]
	}

	written := 0
	var writeErr error
	pushRows := make([]*SEOAuthor, 0, len(seeds))
	for i := range seeds {
		seed := &seeds[i]
		if seed.AuthorID == "" || seed.Name == "" {
			continue
		}
		seed.Source = InferAuthorSource(seed.AuthorID)
		slug := GenerateAuthorSlug(seed.Name, seed.AuthorID)
		affJSON := marshalStrings(seed.Affiliations)

		if err := s.repo.UpsertAuthorSeed(seed, slug, affJSON); err != nil {
			slog.Warn("seo author seed upsert failed", "author_id", seed.AuthorID, "err", err)
			writeErr = errors.Join(writeErr, err)
			continue
		}
		written++

		// Judge the persisted final row. Existing detail/enrichment data can make
		// it eligible, while hidden/retired rows must never be proactively sent.
		row, err := s.repo.GetAuthorByAuthorID(seed.AuthorID)
		if err != nil {
			slog.Warn("seo author seed eligibility read failed", "author_id", seed.AuthorID, "err", err)
			writeErr = errors.Join(writeErr, err)
			continue
		}
		pushRows = append(pushRows, row)
	}

	if written > 0 {
		s.invalidateAuthorsCache()
		s.enqueueIndexableAuthorRows(pushRows...)
	}
	return written, writeErr
}

// GetAuthorBySlug 路由解析（SSR 用）
func (s *Service) GetAuthorBySlug(slug string) (*SEOAuthor, error) {
	return s.repo.GetAuthorBySlug(slug)
}

// GetAuthorByAuthorID 兼容老链接 / 后台维护
func (s *Service) GetAuthorByAuthorID(authorID string) (*SEOAuthor, error) {
	return s.repo.GetAuthorByAuthorID(authorID)
}

// GetAuthorSitemapPage 获取指定分页的作者 sitemap 条目
func (s *Service) GetAuthorSitemapPage(page int) ([]SitemapEntry, error) {
	return s.repo.ListAuthorSitemapPage(page)
}

// GetAuthorSitemapSummary 索引页 meta
func (s *Service) GetAuthorSitemapSummary() (*SitemapSummary, error) {
	return s.repo.GetAuthorSitemapSummary()
}

// GetAuthorSitemapLastModPerPage 各分页 lastmod
func (s *Service) GetAuthorSitemapLastModPerPage() (map[int]time.Time, error) {
	return s.repo.GetAuthorSitemapLastModPerPage()
}

// ReconcileAuthorSitemapPages 后台任务定期回填 sitemap_page=0 的新行
func (s *Service) ReconcileAuthorSitemapPages() error {
	affected, err := s.repo.BackfillAuthorSitemapPage()
	if err != nil {
		return err
	}
	if affected > 0 {
		slog.Info("seo author sitemap pages reconciled", "rows", affected)
		s.invalidateAuthorsCache()
	}
	return nil
}

// marshalStrings 把字符串切片序列化为紧凑 JSON,空切片返回空串
func marshalStrings(items []string) string {
	if len(items) == 0 {
		return ""
	}
	b, err := json.Marshal(items)
	if err != nil {
		return ""
	}
	return string(b)
}
