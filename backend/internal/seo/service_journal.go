// ============================================================================
// SEO Journal Service —— 期刊业务编排
// 行为镜像 service_author.go: tier=1 详情点击 / tier=2 搜索曝光,写入后失效缓存。
// ============================================================================

package seo

import (
	"context"
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
	var writeErr error
	for i := range seeds {
		seed := &seeds[i]
		if seed.JournalID <= 0 || seed.CanonicalName == "" {
			continue
		}
		slug := GenerateJournalSlug(seed.CanonicalName)
		issnsJSON := marshalStringSlice(seed.ISSNs)

		if err := s.repo.UpsertJournalSeed(seed, slug, issnsJSON); err != nil {
			slog.Warn("seo journal seed upsert failed", "journal_id", seed.JournalID, "err", err)
			writeErr = errors.Join(writeErr, err)
			continue
		}
		written++
	}

	if written > 0 {
		s.invalidateJournalsCache()
	}
	return written, writeErr
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
	bumpSitemapVersion(sitemapJournalsVersionKey)
}

// ─── 全量摄取 / 发布闸门(seoingest 编排层调用)────────────────────────────────

// IngestJournalRow 摄取单行落库:按现存 content_hash 三分流。
//   - 不存在 → InsertJournalIngest(staged)
//   - 哈希相同 → 零写入(updated_at 诚实性:resync 未变行绝不 bump,0123 的坑)
//   - 哈希变化 → UpdateJournalIngest(全字段覆盖 + bump updated_at)
//
// existingHash 由调用方按页批量预取(GetJournalIngestStates),避免逐行 SELECT。
// 返回的 outcome 供 sync run 计数。
func (s *Service) IngestJournalRow(row *JournalIngestRow, existingHash string, exists bool) (JournalIngestOutcome, error) {
	if row == nil || row.JournalID <= 0 || row.CanonicalName == "" {
		return IngestOutcomeSkipped, errors.New("ingest requires journal_id and canonical_name")
	}
	if !exists {
		if err := s.repo.InsertJournalIngest(row); err != nil {
			return IngestOutcomeSkipped, err
		}
		return IngestOutcomeInserted, nil
	}
	if existingHash == row.ContentHash && row.ContentHash != "" {
		return IngestOutcomeUnchanged, nil
	}
	if err := s.repo.UpdateJournalIngest(row); err != nil {
		return IngestOutcomeSkipped, err
	}
	return IngestOutcomeUpdated, nil
}

// GetJournalIngestStates 页级批量预取(见 IngestJournalRow)。
func (s *Service) GetJournalIngestStates(journalIDs []int64) (map[int64]string, error) {
	return s.repo.GetJournalIngestStates(journalIDs)
}

// ResolveJournalISSNLOwners 摄取前的 issn_l 归属预检(冲突行跳过)。
func (s *Service) ResolveJournalISSNLOwners(issnLs []string) (map[string]int64, error) {
	return s.repo.ResolveJournalISSNLOwners(issnLs)
}

// PublishStagedJournals 发布一批 staged 行:置 published + 批次号 → 推送队列
// (canonical /journal/{id}/{slug},双引擎由 seosubmit 内部分流)→ 失效 sitemap 缓存。
// 返回 (批次号, 实际发布数)。没有达标行时返回 (0, 0, nil),不消耗批次号语义
// (批次号已递增但没有行占用它,下次复用同一个数字也无妨 —— NextJournalIngestBatch
// 按 MAX 计算,空批次不留痕)。
func (s *Service) PublishStagedJournals(count, tier int) (int, int, error) {
	batch, err := s.repo.NextJournalIngestBatch()
	if err != nil {
		return 0, 0, err
	}
	refs, err := s.repo.PublishStagedJournals(batch, count, tier)
	if err != nil {
		return 0, 0, err
	}
	if len(refs) == 0 {
		return 0, 0, nil
	}

	if s.submitter != nil {
		paths := make([]string, 0, len(refs))
		for _, ref := range refs {
			paths = append(paths, journalCanonicalPath(ref.JournalID, ref.CanonicalName))
		}
		s.submitter.EnqueuePaths(context.Background(), paths)
	}
	s.invalidateJournalsCache()
	slog.Info("seo journals published", "batch", batch, "count", len(refs), "tier", tier)
	return batch, len(refs), nil
}

// RollbackJournalIngestBatch 整批回滚(打回 staged)+ 失效 sitemap 缓存。
func (s *Service) RollbackJournalIngestBatch(batch int) (int64, error) {
	n, err := s.repo.RollbackJournalIngestBatch(batch)
	if err != nil {
		return 0, err
	}
	if n > 0 {
		s.invalidateJournalsCache()
		slog.Info("seo journal batch rolled back", "batch", batch, "rows", n)
	}
	return n, nil
}

// GetJournalIngestStats admin status 面板计数。
func (s *Service) GetJournalIngestStats() (*JournalIngestStats, error) {
	return s.repo.GetJournalIngestStats()
}

// ListJournalIngestBatches 批次历史。
func (s *Service) ListJournalIngestBatches() ([]JournalIngestBatchSummary, error) {
	return s.repo.ListJournalIngestBatches()
}

// ListPublishedJournalsByCategory 同学科推荐(SSR 层消费)。
func (s *Service) ListPublishedJournalsByCategory(fqbMajor string, excludeID int64, limit int) ([]SEOJournal, error) {
	return s.repo.ListPublishedJournalsByCategory(fqbMajor, excludeID, limit)
}

// ListJournalsForHub 枢纽页列表(SSR 层消费)。
func (s *Service) ListJournalsForHub(filter JournalHubFilter, page, perPage int) ([]SEOJournal, int64, error) {
	return s.repo.ListJournalsForHub(filter, page, perPage)
}

// journalCanonicalPath 期刊 canonical 路径 /journal/{id}/{slug}(与 sitemap
// journalCanonicalURL / SSR canonical link 同构;slug 为空退化为 /journal/{id})。
func journalCanonicalPath(journalID int64, canonicalName string) string {
	id := formatJournalID(journalID)
	if slug := GenerateJournalSlug(canonicalName); slug != "" {
		return "/journal/" + id + "/" + slug
	}
	return "/journal/" + id
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
