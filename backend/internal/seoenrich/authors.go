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

// authorWorksFields —— 拉作者代表作时向 minicod 请求的字段。
// 注意:**不要**再加 "source" —— 上游 /v1/stc/authors/papers 已不再支持选 source 字段,
// 带上会整条请求 400("Unrecognized or unsupported fields: [source]"),代表作永远拉不到。
// 每篇论文的来源可从作者自身 source 回填,无需逐篇向上游请求。
var authorWorksFields = []string{"paperId", "title", "year", "venue", "citationCount"}

const maxTopWorks = 6 // noscript 代表作条数上限:够体现产出、又不至于让页面无限长

// RunAuthorBackfill 扫「未回填」的作者,逐个拉 minicod 补机构/指标/代表作,直到扫空或 ctx 取消。
// 返回补到实质内容(机构或代表作)的作者数。
//
// 收敛保证(为什么这么写):ListAuthorsToEnrich 取的是 enriched_at IS NULL 的行。若「拉失败就
// 永不标记」,那些**永久性失败**的作者(404 查无此人 / 400 参数错)会 enriched_at 永远为 NULL、
// 每轮被重选 → 外层 for{} 永不返回 → 变成每 2s 一次的热循环空转,还把共享 MinicodBreaker 顶开
// (线上事故根因)。因此:
//   - 成功 或 客户端侧永久错误(minicod.IsClientSideError:404/400/鉴权)→ 打 enriched_at「退休」;
//   - 暂时性错误(限流/熔断 open/5xx/网络)→ 不退休,留给下个 RunInterval(6h)周期重试;
//   - attempted 集合保证「同一轮」里对暂时性失败者不会被重复处理 → 单次 run 必然终止。
func (e *Enricher) RunAuthorBackfill(ctx context.Context) (int, error) {
	filled := 0
	attempted := make(map[string]bool) // 本轮已尝试过的作者:防止暂时性失败者在同一轮被无限重选
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
		progressed := false // 本批是否处理了「本轮还没试过」的新作者
		for _, r := range refs {
			if ctx.Err() != nil {
				_ = e.svc.MarkAuthorsEnriched(done) // flush 已完成的再退出
				return filled, ctx.Err()
			}
			if attempted[r.AuthorID] {
				continue // 本轮已试过(上次暂时性失败没退休)—— 跳过,交给下个 6h 周期
			}
			attempted[r.AuthorID] = true
			progressed = true

			// 2026-07 线上审计:脏数据 "pmd:"(来源前缀后 ID 为空)打上游恒 500,被当暂时性
			// 错误每 6h 一轮重试 6 次、永不收敛。前缀后空 ID 重试也不会变 —— 不打上游,
			// 直接退休(打 enriched_at),Warn 一次留档原值。
			if bareAuthorID(r.AuthorID) == "" {
				done = append(done, r.AuthorID)
				slog.Warn("seoenrich: empty bare author id, retiring without upstream call", "author_id", r.AuthorID)
				continue
			}

			ok, fetchErr := e.enrichOneAuthor(ctx, r.AuthorID)
			switch {
			case fetchErr == nil:
				done = append(done, r.AuthorID)
				if ok {
					filled++
				}
			case minicod.IsClientSideError(fetchErr):
				// 404 查无此人 / 400 参数错 —— 重试也不会变,退休该作者(打 enriched_at),
				// 否则它每轮被重选,形成热循环空转。
				done = append(done, r.AuthorID)
				slog.Debug("seoenrich: author permanently unresolvable, retiring", "author_id", r.AuthorID, "err", fetchErr)
			default:
				// 暂时性(限流/熔断 open/5xx/网络)—— 不退休,留给下个 6h 周期重试。
				slog.Warn("seoenrich: author fetch failed (transient, retry next cycle)", "author_id", r.AuthorID, "err", fetchErr)
			}
			if !sleepCtx(ctx, e.cfg.BatchDelay) {
				_ = e.svc.MarkAuthorsEnriched(done) // flush 已完成的再退出
				return filled, ctx.Err()
			}
		}
		if err := e.svc.MarkAuthorsEnriched(done); err != nil {
			slog.Warn("seoenrich: MarkAuthorsEnriched failed", "err", err)
		}
		if !progressed {
			// 本批全是「已试过的暂时性失败」残留 —— 无新进展,结束本轮,交给 RunInterval ticker。
			return filled, nil
		}
		slog.Info("seoenrich: author backfill batch done", "batch", len(refs), "filled_total", filled)
	}
}

// bareAuthorID 剥掉来源前缀("pmd:"/"olx:" 等 "<src>:")后返回裸 ID;无前缀则原样返回(去空白)。
// 2026-07 线上审计:用于识别 "pmd:" 这类「前缀后 ID 为空」的脏数据,避免打上游永久重试。
func bareAuthorID(id string) string {
	if i := strings.Index(id, ":"); i >= 0 {
		return strings.TrimSpace(id[i+1:])
	}
	return strings.TrimSpace(id)
}

// EnrichAuthorOnMiss 供 SSR 冷门作者 URL(seo 无行)现拉一次落库并返回 meta(M2)。拉不到返回 (nil,nil)。
func (e *Enricher) EnrichAuthorOnMiss(ctx context.Context, source, authorID string) (*seo.AuthorSSRMeta, error) {
	// 2026-07 线上审计:空 / 前缀后空 ID("pmd:")直接短路,不打上游(同 RunAuthorBackfill 口径)。
	if bareAuthorID(authorID) == "" || !seo.IsCanonicalSource(source) {
		return nil, nil
	}
	a, err := e.mc.GetAuthor(ctx, authorID, authorEnrichFields)
	if err != nil {
		return nil, err
	}
	if a == nil || strings.TrimSpace(a.Name) == "" {
		return nil, nil // 失效/伪造 ID
	}
	canonicalID := strings.TrimSpace(a.AuthorID)
	if canonicalID == "" {
		canonicalID = authorID
	}
	canonicalSource := seo.AuthoritativeSource(a.Source, canonicalID)
	// 先落一条基础行；source 只信上游/已归一 ID，不信 URL。
	seed := seo.AuthorSeed{
		AuthorID:      canonicalID,
		Name:          a.Name,
		Affiliations:  a.Affiliations,
		Homepage:      a.Homepage,
		PaperCount:    a.PaperCount,
		CitationCount: a.CitationCount,
		Source:        canonicalSource,
		ORCID:         a.ORCID,
	}
	if a.HIndex > 0 {
		h := a.HIndex
		seed.HIndex = &h
	}
	if _, err := e.svc.RecordAuthorSearchSeeds([]seo.AuthorSeed{seed}); err != nil {
		slog.Warn("seoenrich: author on-miss record failed", "author_id", canonicalID, "err", err)
		return nil, err
	}
	// 补代表作(EnrichAuthor 走「更完整才覆盖」,不改 tier / 不推送)。
	if _, err := e.enrichOneAuthor(ctx, canonicalID); err != nil {
		slog.Warn("seoenrich: author on-miss enrich failed", "author_id", canonicalID, "err", err)
	}
	return e.svc.ResolveByAuthorID(canonicalSource, canonicalID)
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
