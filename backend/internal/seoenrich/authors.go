// ============================================================================
// Scholay学术 V1.0
// internal/seoenrich —— 作者维度回填(H3):机构 / 指标 / 代表作。
// 把「只有人名」的薄作者页补成「有机构 + 代表作(内链论文页)」的可排名内容。
// 每个作者最多拉一次(enriched_at 标记),minicod 配额有界。作者每条 = 2 次 minicod 调用
// (GetAuthor + GetAuthorPapers),故批量比论文慢,靠 BatchDelay 限流。
// ============================================================================

package seoenrich

import (
	"context"
	"encoding/json"
	"log/slog"
	"sort"
	"strings"

	"scholar-backend/internal/minicod"
	"scholar-backend/internal/seo"
)

var authorEnrichFields = []string{"authorId", "name", "affiliations", "homepage", "paperCount", "citationCount", "hIndex", "orcid"}
var authorWorksFields = []string{"paperId", "title", "year", "venue", "citationCount", "source"}

const maxTopWorks = 6 // noscript 代表作条数上限:够体现产出、又不至于让页面无限长

// RunAuthorBackfill 扫「未回填」的作者,逐个拉 minicod 补机构/指标/代表作,直到扫空或 ctx 取消。
// 返回补到实质内容(机构或代表作)的作者数。整批统一打 enriched_at。
func (e *Enricher) RunAuthorBackfill(ctx context.Context) (int, error) {
	filled := 0
	for {
		if ctx.Err() != nil {
			return filled, ctx.Err()
		}
		refs, err := e.svc.ListAuthorsToEnrich(e.cfg.BatchSize)
		if err != nil {
			return filled, err
		}
		if len(refs) == 0 {
			return filled, nil
		}
		done := make([]string, 0, len(refs))
		for _, r := range refs {
			if ctx.Err() != nil {
				return filled, ctx.Err()
			}
			ok, fetchErr := e.enrichOneAuthor(ctx, r.AuthorID)
			if fetchErr != nil {
				// 拉失败(限流/熔断)—— 不标记该作者(下轮重试);sleep 后继续本批剩余。
				slog.Warn("seoenrich: author fetch failed", "author_id", r.AuthorID, "err", fetchErr)
			} else {
				done = append(done, r.AuthorID)
				if ok {
					filled++
				}
			}
			if !sleepCtx(ctx, e.cfg.BatchDelay) {
				return filled, ctx.Err()
			}
		}
		if err := e.svc.MarkAuthorsEnriched(done); err != nil {
			slog.Warn("seoenrich: MarkAuthorsEnriched failed", "err", err)
		}
		slog.Info("seoenrich: author backfill batch done", "batch", len(refs), "filled_total", filled)
	}
}

// EnrichAuthorOnMiss 供 SSR 冷门作者 URL(seo 无行)现拉一次落库并返回 meta(M2)。拉不到返回 (nil,nil)。
func (e *Enricher) EnrichAuthorOnMiss(ctx context.Context, source, authorID string) (*seo.AuthorSSRMeta, error) {
	if authorID == "" {
		return nil, nil
	}
	a, err := e.mc.GetAuthor(ctx, authorID, authorEnrichFields)
	if err != nil {
		return nil, err
	}
	if a == nil || strings.TrimSpace(a.Name) == "" {
		return nil, nil // 失效/伪造 ID
	}
	// 先落一条基础行(搜索种子路径,tier-2 插入),再补机构/代表作。
	seed := seo.AuthorSeed{
		AuthorID:      authorID,
		Name:          a.Name,
		Affiliations:  a.Affiliations,
		Homepage:      a.Homepage,
		PaperCount:    a.PaperCount,
		CitationCount: a.CitationCount,
		Source:        source,
		ORCID:         a.ORCID,
	}
	if a.HIndex > 0 {
		h := a.HIndex
		seed.HIndex = &h
	}
	if _, err := e.svc.RecordAuthorSearchSeeds([]seo.AuthorSeed{seed}); err != nil {
		slog.Warn("seoenrich: author on-miss record failed", "author_id", authorID, "err", err)
	}
	// 补代表作(EnrichAuthor 走「更完整才覆盖」,不改 tier / 不推送)。
	if _, err := e.enrichOneAuthor(ctx, authorID); err != nil {
		slog.Warn("seoenrich: author on-miss enrich failed", "author_id", authorID, "err", err)
	}
	return e.svc.ResolveByAuthorID(source, authorID)
}

// enrichOneAuthor 拉一个作者的完整元数据 + 代表作,补进 seo。返回是否补到实质内容(机构或代表作)。
func (e *Enricher) enrichOneAuthor(ctx context.Context, authorID string) (bool, error) {
	a, err := e.mc.GetAuthor(ctx, authorID, authorEnrichFields)
	if err != nil {
		return false, err
	}
	if a == nil {
		return false, nil
	}

	// 代表作:拉作者论文,按被引降序取前 N。
	worksJSON := ""
	if resp, err := e.mc.GetAuthorPapers(ctx, authorID, authorWorksFields, 0, 25); err == nil && resp != nil {
		if works := topWorks(resp.Data, maxTopWorks); len(works) > 0 {
			if b, e2 := json.Marshal(works); e2 == nil {
				worksJSON = string(b)
			}
		}
	}

	affJSON := ""
	if len(a.Affiliations) > 0 {
		if b, e2 := json.Marshal(a.Affiliations); e2 == nil {
			affJSON = string(b)
		}
	}
	var hIdx *int
	if a.HIndex > 0 {
		h := a.HIndex
		hIdx = &h
	}
	if err := e.svc.EnrichAuthor(authorID, affJSON, a.Homepage, a.ORCID, worksJSON, a.PaperCount, a.CitationCount, hIdx); err != nil {
		return false, err
	}
	return worksJSON != "" || affJSON != "", nil
}

// topWorks 从作者论文里选被引最高的前 n 篇,转成 seo.AuthorWork。
func topWorks(papers []minicod.Paper, n int) []seo.AuthorWork {
	filtered := make([]minicod.Paper, 0, len(papers))
	for _, p := range papers {
		if strings.TrimSpace(p.Title) != "" {
			filtered = append(filtered, p)
		}
	}
	sort.SliceStable(filtered, func(i, j int) bool {
		return filtered[i].CitationCount > filtered[j].CitationCount
	})
	if len(filtered) > n {
		filtered = filtered[:n]
	}
	out := make([]seo.AuthorWork, 0, len(filtered))
	for _, p := range filtered {
		out = append(out, seo.AuthorWork{
			Title:         p.Title,
			Year:          p.Year,
			Venue:         p.Venue,
			PaperID:       p.PaperID,
			Source:        p.Source,
			CitationCount: p.CitationCount,
		})
	}
	return out
}
