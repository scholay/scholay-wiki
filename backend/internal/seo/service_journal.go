// ============================================================================
// SEO Journal Service —— 期刊业务编排
// 行为镜像 service_author.go: tier=1 详情点击 / tier=2 搜索曝光,写入后失效缓存。
// ============================================================================

package seo

import (
	"encoding/json"
	"errors"
	"log/slog"
	"strconv"
	"time"
)

// RecordJournalDetailClick 记录用户点击期刊详情页 (tier=1)
//   - minicod GetJournal handler 调用 (后端兜底, 任何打开期刊页都记)
//   - 也可由前端 useOpenJournalInBrowser 主动调用 (与后端是幂等的)
//
// 必填: seed.JournalID > 0, seed.CanonicalName 非空 (没标题写进 sitemap 也没意义)
func (s *Service) RecordJournalDetailClick(seed *JournalSeed) error {
	if seed == nil || seed.JournalID <= 0 || seed.CanonicalName == "" {
		return errors.New("detail click requires journal_id and canonical_name")
	}
	slug := GenerateJournalSlug(seed.CanonicalName)
	issnsJSON := marshalStringSlice(seed.ISSNs)

	if err := s.repo.UpsertJournalDetail(seed, slug, issnsJSON); err != nil {
		return err
	}
	s.invalidateJournalsCache()
	return nil
}

// RecordJournalSearchSeeds 批量记录搜索曝光 (tier=2)
// 同 RecordSearchSeeds / RecordAuthorSearchSeeds: 上限 SearchSeedBatchLimit, 单条失败不阻断其它
func (s *Service) RecordJournalSearchSeeds(seeds []JournalSeed) (int, error) {
	if len(seeds) == 0 {
		return 0, nil
	}
	if len(seeds) > SearchSeedBatchLimit {
		seeds = seeds[:SearchSeedBatchLimit]
	}

	written := 0
	for i := range seeds {
		seed := &seeds[i]
		if seed.JournalID <= 0 || seed.CanonicalName == "" {
			continue
		}
		slug := GenerateJournalSlug(seed.CanonicalName)
		issnsJSON := marshalStringSlice(seed.ISSNs)

		if err := s.repo.UpsertJournalSeed(seed, slug, issnsJSON); err != nil {
			slog.Warn("seo journal seed upsert failed", "journal_id", seed.JournalID, "err", err)
			continue
		}
		written++
	}

	if written > 0 {
		s.invalidateJournalsCache()
	}
	return written, nil
}

// GetJournalByID 路由解析 (SSR / 301 校验用)
func (s *Service) GetJournalByID(journalID int64) (*SEOJournal, error) {
	return s.repo.GetJournalByID(journalID)
}

// GetJournalSitemapPage handler 用
func (s *Service) GetJournalSitemapPage(page int) ([]SitemapEntry, error) {
	return s.repo.ListJournalSitemapPage(page)
}

// GetJournalSitemapSummary 索引文件用
func (s *Service) GetJournalSitemapSummary() (*SitemapSummary, error) {
	return s.repo.GetJournalSitemapSummary()
}

// GetJournalSitemapLastModPerPage 索引文件用
func (s *Service) GetJournalSitemapLastModPerPage() (map[int]time.Time, error) {
	return s.repo.GetJournalSitemapLastModPerPage()
}

// ReconcileJournalSitemapPages 定期回填 sitemap_page=0 的新行
func (s *Service) ReconcileJournalSitemapPages() error {
	affected, err := s.repo.BackfillJournalSitemapPage()
	if err != nil {
		return err
	}
	if affected > 0 {
		slog.Info("seo journal sitemap pages reconciled", "rows", affected)
		s.invalidateJournalsCache()
	}
	return nil
}

// invalidateJournalsCache 期刊写入触发, 独立计数器, 不影响 papers / authors cache
func (s *Service) invalidateJournalsCache() {
	bumpVersionWithCoalesce(sitemapJournalsLockKey, sitemapJournalsVersionKey)
}

// formatJournalID 把 BIGINT id 序列化成 URL 路径用的字符串
func formatJournalID(id int64) string {
	return strconv.FormatInt(id, 10)
}

// marshalStringSlice 把 []string 序列化为紧凑 JSON, 空值返回空串 (触发 NULLIF -> NULL)
func marshalStringSlice(items []string) string {
	if len(items) == 0 {
		return ""
	}
	b, err := json.Marshal(items)
	if err != nil {
		return ""
	}
	return string(b)
}
