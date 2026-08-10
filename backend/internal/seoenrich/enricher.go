// ============================================================================
// Scholay学术 V1.0
// internal/seoenrich —— SEO 完整性回填的「编排层」。
//
// 职责:从上游(minicod)拉论文/作者的完整元数据,落进 seo_papers / seo_authors,
// 把「只有标题/人名」的薄页补成「有摘要/代表作」的可排名、可被 AI 引用的内容。
//
// 为什么单独成包:minicod 反向 import 了 seo(seo 不能再 import minicod,否则成环)。
// seoenrich 同时 import seo + minicod 做编排,seo 保持纯 DB。
//
// 两条使用路径,共用同一套「拉 minicod → 落 seo」:
//   1) RunPaperBackfill: 后台批量回填历史/新增的无摘要论文(env SEO_ENRICH_ENABLED 开关 + 限流)。
//   2) EnrichPaperOnMiss: SSR 冷门 URL(seo 无行)现场拉一次、落库并返回 meta(M2 方案 A)。
// 每篇论文最多拉一次(enriched_at 标记),minicod 配额消耗有界。
// ============================================================================

package seoenrich

import (
	"context"
	"log/slog"
	"strings"
	"time"

	"scholar-backend/internal/minicod"
	"scholar-backend/internal/seo"
)

// Fetcher 抽象 minicod 取论文 / 作者能力(便于测试 / 解耦)。*minicod.Manager 直接满足。
type Fetcher interface {
	GetPaperBatch(ctx context.Context, paperIDs []string, fields []string) ([]minicod.Paper, error)
	GetPaper(ctx context.Context, paperID string, opts minicod.PaperDetailsOptions) (*minicod.Paper, error)
	GetAuthor(ctx context.Context, authorID string, fields []string) (*minicod.Author, error)
	GetAuthorPapers(ctx context.Context, authorID string, fields []string, offset, limit int) (*minicod.SearchResponse, error)
}

// Config 回填 worker 的可调节流参数。
type Config struct {
	Enabled     bool          // 后台批量回填开关(env SEO_ENRICH_ENABLED);关=只保留 on-miss 能力(如已注入)
	BatchSize   int           // 每批拉多少篇(GetPaperBatch);默认 50
	BatchDelay  time.Duration // 批间延迟,给 minicod 配额留余量;默认 2s
	RunInterval time.Duration // 周期扫描间隔(catch 新增搜索种子);默认 6h
}

// Enricher 回填器。
type Enricher struct {
	mc  Fetcher
	svc *seo.Service
	cfg Config
}

// New 构造。零值参数回落到保守默认。
func New(mc Fetcher, svc *seo.Service, cfg Config) *Enricher {
	if cfg.BatchSize <= 0 {
		cfg.BatchSize = 50
	}
	if cfg.BatchDelay <= 0 {
		cfg.BatchDelay = 2 * time.Second
	}
	if cfg.RunInterval <= 0 {
		cfg.RunInterval = 6 * time.Hour
	}
	return &Enricher{mc: mc, svc: svc, cfg: cfg}
}

// paperEnrichFields 回填要向 minicod 请求的字段。
var paperEnrichFields = []string{"paperId", "title", "abstract", "authors", "year", "venue", "citationCount", "fieldsOfStudy", "externalIds"}

// RunPaperBackfill 扫「无 abstract 且未回填」的论文,批量拉 minicod 补 abstract,直到扫空或 ctx 取消。
// 返回补到 abstract 的篇数。整批处理后统一打 enriched_at(不管是否拿到 abstract),避免重复拉。
func (e *Enricher) RunPaperBackfill(ctx context.Context) (int, error) {
	filled := 0
	for {
		if ctx.Err() != nil {
			return filled, ctx.Err()
		}
		refs, err := e.svc.ListPapersToEnrich(e.cfg.BatchSize)
		if err != nil {
			return filled, err
		}
		if len(refs) == 0 {
			return filled, nil // 扫空
		}
		ids := make([]string, 0, len(refs))
		for _, r := range refs {
			ids = append(ids, r.PaperID)
		}

		papers, err := e.mc.GetPaperBatch(ctx, ids, paperEnrichFields)
		if err != nil {
			// 拉失败(限流/熔断/网络)—— 不打 enriched_at(下轮重试),sleep 后继续。
			slog.Warn("seoenrich: GetPaperBatch failed", "err", err, "batch", len(ids))
			if !sleepCtx(ctx, e.cfg.BatchDelay) {
				return filled, ctx.Err()
			}
			continue
		}
		for i := range papers {
			if applyPaper(e.svc, ids2set(ids), &papers[i]) {
				filled++
			}
		}
		// 整批打「已尝试」标记(含 minicod 没返回的失效 ID)—— 收敛配额消耗。
		if err := e.svc.MarkPapersEnriched(ids); err != nil {
			slog.Warn("seoenrich: MarkPapersEnriched failed", "err", err)
		}
		slog.Info("seoenrich: paper backfill batch done", "batch", len(ids), "filled_total", filled)
		if !sleepCtx(ctx, e.cfg.BatchDelay) {
			return filled, ctx.Err()
		}
	}
}

// EnrichPaperOnMiss 供 SSR 冷门 URL(seo 无行)现场拉一次 minicod、落库并返回 meta(M2 方案 A)。
// 拉不到(伪造/失效 ID)返回 (nil, nil) —— 调用方据此打 noindex。超时由传入 ctx 控制。
func (e *Enricher) EnrichPaperOnMiss(ctx context.Context, source, paperID string) (*seo.PaperSSRMeta, error) {
	if paperID == "" || !seo.IsCanonicalSource(source) {
		return nil, nil
	}
	p, err := e.mc.GetPaper(ctx, paperID, minicod.PaperDetailsOptions{Fields: paperEnrichFields})
	if err != nil {
		return nil, err
	}
	if p == nil || strings.TrimSpace(p.Title) == "" {
		return nil, nil // 失效/伪造 ID
	}
	canonicalID := strings.TrimSpace(p.PaperID)
	if canonicalID == "" {
		canonicalID = paperID
	}
	canonicalSource := seo.AuthoritativeSource(p.Source, canonicalID)
	// 落库只使用上游返回的来源（缺失时由已归一 ID 推断），绝不使用 URL source。
	seed := seo.PaperSeed{
		PaperID:       canonicalID,
		Title:         p.Title,
		Abstract:      p.Abstract,
		Year:          yearPtr(p.Year),
		Venue:         p.Venue,
		CitationCount: p.CitationCount,
		Source:        canonicalSource,
		DOI:           extractDOI(p),
		FieldsOfStudy: p.FieldsOfStudy,
		Authors:       toSeoAuthors(p.Authors),
	}
	if _, err := e.svc.RecordSearchSeeds([]seo.PaperSeed{seed}); err != nil {
		slog.Warn("seoenrich: on-miss record failed", "paper_id", canonicalID, "err", err)
		return nil, err
	}
	return e.svc.ResolveByPaperID(canonicalSource, canonicalID)
}

// Start 启动周期性回填 worker(仅当 Enabled)。首次立即跑一遍,之后每 RunInterval 一遍。
// 阻塞直到 ctx 取消 —— 调用方用 safego.Go 包起来。
func (e *Enricher) Start(ctx context.Context) {
	if !e.cfg.Enabled {
		slog.Info("seoenrich: 后台回填未启用(设 SEO_ENRICH_ENABLED=true 开启摘要回填)")
		return
	}
	slog.Info("seoenrich: paper backfill worker started", "batch_size", e.cfg.BatchSize, "batch_delay", e.cfg.BatchDelay.String(), "interval", e.cfg.RunInterval.String())
	run := func() {
		if n, err := e.RunPaperBackfill(ctx); err != nil && ctx.Err() == nil {
			slog.Error("seoenrich: paper backfill run error", "err", err, "filled", n)
		} else {
			slog.Info("seoenrich: paper backfill run complete", "filled", n)
		}
		if n, err := e.RunAuthorBackfill(ctx); err != nil && ctx.Err() == nil {
			slog.Error("seoenrich: author backfill run error", "err", err, "filled", n)
		} else {
			slog.Info("seoenrich: author backfill run complete", "filled", n)
		}
	}
	run()
	ticker := time.NewTicker(e.cfg.RunInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			run()
		}
	}
}

// ─── helpers ──────────────────────────────────────────────────────────────

// applyPaper 把一篇 minicod 论文补进 seo(有 abstract 才补)。返回是否补到 abstract。
func applyPaper(svc *seo.Service, requested map[string]struct{}, p *minicod.Paper) bool {
	if p.PaperID == "" {
		return false
	}
	// minicod 返回的 paperId 需在本批请求集内(GetPaperBatch 理应如此,防御一下)。
	if _, ok := requested[p.PaperID]; !ok {
		return false
	}
	if strings.TrimSpace(p.Abstract) == "" {
		return false
	}
	if err := svc.EnrichPaper(p.PaperID, p.Abstract, toSeoAuthors(p.Authors), p.FieldsOfStudy, p.CitationCount); err != nil {
		slog.Warn("seoenrich: EnrichPaper failed", "paper_id", p.PaperID, "err", err)
		return false
	}
	return true
}

func toSeoAuthors(in []minicod.Author) []seo.Author {
	out := make([]seo.Author, 0, len(in))
	for _, a := range in {
		if a.Name != "" {
			out = append(out, seo.Author{Name: a.Name, AuthorID: a.AuthorID})
		}
	}
	return out
}

func extractDOI(p *minicod.Paper) string {
	if p.ExternalIDs != nil {
		if d, ok := p.ExternalIDs["DOI"].(string); ok {
			return d
		}
	}
	return ""
}

func yearPtr(y int) *int {
	if y > 0 {
		return &y
	}
	return nil
}

func ids2set(ids []string) map[string]struct{} {
	m := make(map[string]struct{}, len(ids))
	for _, id := range ids {
		m[id] = struct{}{}
	}
	return m
}

func sleepCtx(ctx context.Context, d time.Duration) bool {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-t.C:
		return true
	}
}
