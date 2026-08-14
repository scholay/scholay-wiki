// ============================================================================
// Scholay学术 V1.0
// SEO 完整性回填 —— 从上游(minicod)补全 seo_papers / seo_authors 的实质内容。
//
// 编排(拉 minicod → 落库)在 internal/seoenrich(它 import seo + minicod);
// 本文件只提供 seo 侧的「查待补行 / 补字段 / 打已尝试标记」纯 DB 方法,seo 不 import minicod
// (minicod 反向 import 了 seo,seo 再 import minicod 会成环)。
// ============================================================================

package seo

import "errors"

// PaperEnrichRef 待回填论文的最小标识。
type PaperEnrichRef struct {
	ID      uint64 `gorm:"column:id"`
	PaperID string `gorm:"column:paper_id"`
}

// AuthorEnrichRef 待回填作者的最小标识。
type AuthorEnrichRef struct {
	ID       uint64 `gorm:"column:id"`
	AuthorID string `gorm:"column:author_id"`
}

// ─── 论文 ────────────────────────────────────────────────────────────────

// ListPapersToEnrich 返回「无 abstract 且从未回填过(enriched_at IS NULL)」的论文一批,按 id 升序。
// 处理后由 MarkPapersEnriched 打 enriched_at,自然从谓词里掉出,无需游标;走 idx_seo_papers_enrich_scan。
func (s *Service) ListPapersToEnrich(limit int) ([]PaperEnrichRef, error) {
	if limit <= 0 {
		limit = 100
	}
	var rows []PaperEnrichRef
	err := s.repo.db.Table("seo_papers").
		Select("id, paper_id").
		Where("status = ? AND COALESCE(abstract,'') = '' AND enriched_at IS NULL", StatusActive).
		Order("id ASC").Limit(limit).Find(&rows).Error
	return rows, err
}

// EnrichPaper 用上游元数据补全一篇论文的实质字段(service 层负责 JSON 序列化)。
// 只在新值更长时覆盖(与 UpsertSeed 的降级保护一致),updated_at 仅在 abstract 真变长时 bump
// (sitemap lastmod 反映真实变化);不动 tier/priority/view_count。补全后若刚达到
// 收录门槛，同步换 sitemap 版本并提交 canonical。
func (s *Service) EnrichPaper(paperID, abstract string, authors []Author, fields []string, citationCount int) error {
	if paperID == "" {
		return errors.New("empty paper_id")
	}
	// ⚠️ updated_at 必须在 abstract 之前赋值 —— 同一条 UPDATE 内赋值左→右生效,放前面才能读到「旧 abstract」长度。
	if err := s.repo.db.Exec(`
		UPDATE seo_papers SET
			updated_at = CASE
				WHEN NULLIF(?,'') IS NOT NULL AND LENGTH(?) > COALESCE(LENGTH(abstract),0) THEN NOW()
				ELSE updated_at END,
			abstract = CASE
				WHEN NULLIF(?,'') IS NOT NULL AND LENGTH(?) > COALESCE(LENGTH(abstract),0) THEN ?
				ELSE abstract END,
			authors_json = CASE
				WHEN NULLIF(?,'') IS NOT NULL AND LENGTH(?) > COALESCE(LENGTH(authors_json),0) THEN ?
				ELSE authors_json END,
			fields_of_study = CASE
				WHEN NULLIF(?,'') IS NOT NULL AND LENGTH(?) > COALESCE(LENGTH(fields_of_study),0) THEN ?
				ELSE fields_of_study END,
			citation_count = GREATEST(citation_count, ?)
		WHERE paper_id = ?`,
		abstract, abstract,
		abstract, abstract, abstract,
		marshalAuthors(authors), marshalAuthors(authors), marshalAuthors(authors),
		marshalFields(fields), marshalFields(fields), marshalFields(fields),
		citationCount,
		paperID,
	).Error; err != nil {
		return err
	}
	// Enrichment can move a title-only seed into the sitemap eligibility
	// scope. Rotate cached leaves/indexes and actively submit the now-complete
	// canonical instead of leaving stale thin-page decisions for six hours.
	s.invalidatePapersCache()
	if row, err := s.GetByPaperID(paperID); err == nil && paperRowIndexable(row) {
		s.enqueuePaperPaths(paperCanonicalPath(row.Source, row.PaperID))
	}
	return nil
}

// MarkPapersEnriched 给一批论文打 enriched_at=NOW()(无论是否拿到 abstract,标记「已尝试」不再重复拉,
// 把 minicod 配额消耗收敛)。
func (s *Service) MarkPapersEnriched(paperIDs []string) error {
	if len(paperIDs) == 0 {
		return nil
	}
	// updated_at 显式自赋值:enriched_at 只是「已尝试补全」的内部标记,不是内容变化,
	// 不加会被 ON UPDATE CURRENT_TIMESTAMP 连带刷新 sitemap <lastmod>
	// (2026-08-10 审计:papers-2 全片 4,737 条 lastmod 集中在 enrich 批处理的 2 小时窗口)。
	return s.repo.db.Exec(`UPDATE seo_papers SET updated_at = updated_at, enriched_at = NOW() WHERE paper_id IN (?)`, paperIDs).Error
}

// ─── 作者(H3)────────────────────────────────────────────────────────────

// ListAuthorsToEnrich 返回「无代表作(top_works 空)且从未回填过」的作者一批。
func (s *Service) ListAuthorsToEnrich(limit int) ([]AuthorEnrichRef, error) {
	if limit <= 0 {
		limit = 100
	}
	var rows []AuthorEnrichRef
	err := s.repo.db.Table("seo_authors").
		Select("id, author_id").
		Where("status = ? AND enriched_at IS NULL", StatusActive).
		Order("id ASC").Limit(limit).Find(&rows).Error
	return rows, err
}

// EnrichAuthor 补全作者的机构 / 指标 / 代表作(topWorksJSON 已由 service 上层序列化)。
// 与论文同理:只补更完整的值。affiliations/homepage/orcid 已存在则不覆盖
// (长度保护)；补全后换 sitemap 版本并对新达标页主动提交。
func (s *Service) EnrichAuthor(authorID string, affiliationsJSON, homepage, orcid, topWorksJSON string, paperCount, citationCount int, hIndex *int) error {
	if authorID == "" {
		return errors.New("empty author_id")
	}
	// ⚠️ updated_at 必须显式管理且放在最前(同一条 UPDATE 内赋值左→右生效,放前面才能读到
	// 旧 top_works / affiliations):仅当「代表作从无到有」或「机构列表真的变长」才 bump ——
	// 这两种是页面可见的内容变化,值得爬虫重抓。此前这条 UPDATE 完全没管 updated_at,
	// ON UPDATE CURRENT_TIMESTAMP 让每次 enrich 尝试(哪怕什么都没补到)都刷新 lastmod,
	// 正是 2026-08-10 审计发现 authors-3 全片 17,375 条 lastmod 同日分钟桶戳的根因。
	if err := s.repo.db.Exec(`
		UPDATE seo_authors SET
			updated_at = CASE
				WHEN (COALESCE(JSON_LENGTH(top_works),0) = 0 AND NULLIF(?,'') IS NOT NULL)
				  OR (NULLIF(?,'') IS NOT NULL AND LENGTH(?) > COALESCE(LENGTH(affiliations),0))
				THEN NOW() ELSE updated_at END,
			affiliations = CASE
				WHEN NULLIF(?,'') IS NOT NULL AND LENGTH(?) > COALESCE(LENGTH(affiliations),0) THEN ?
				ELSE affiliations END,
			homepage       = CASE WHEN COALESCE(homepage,'')='' AND NULLIF(?,'') IS NOT NULL THEN ? ELSE homepage END,
			orcid          = CASE WHEN COALESCE(orcid,'')='' AND NULLIF(?,'') IS NOT NULL THEN ? ELSE orcid END,
			top_works      = CASE WHEN NULLIF(?,'') IS NOT NULL THEN ? ELSE top_works END,
			paper_count    = GREATEST(paper_count, ?),
			citation_count = GREATEST(citation_count, ?),
			h_index        = GREATEST(COALESCE(h_index,0), COALESCE(?,0))
		WHERE author_id = ?`,
		topWorksJSON, affiliationsJSON, affiliationsJSON,
		affiliationsJSON, affiliationsJSON, affiliationsJSON,
		homepage, homepage,
		orcid, orcid,
		topWorksJSON, topWorksJSON,
		paperCount, citationCount, hIndex,
		authorID,
	).Error; err != nil {
		return err
	}
	s.invalidateAuthorsCache()
	if row, err := s.GetAuthorByAuthorID(authorID); err == nil && authorRowIndexable(row) {
		s.enqueueAuthorPaths(authorCanonicalPath(row.Source, row.AuthorID))
	}
	return nil
}

// MarkAuthorsEnriched 给一批作者打 enriched_at=NOW()。
func (s *Service) MarkAuthorsEnriched(authorIDs []string) error {
	if len(authorIDs) == 0 {
		return nil
	}
	// updated_at 自赋值原因同 MarkPapersEnriched。
	return s.repo.db.Exec(`UPDATE seo_authors SET updated_at = updated_at, enriched_at = NOW() WHERE author_id IN (?)`, authorIDs).Error
}
