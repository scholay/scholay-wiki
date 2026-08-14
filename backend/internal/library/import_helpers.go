// ============================================================================
// Scholay 文献集 · 上传 PDF 智能识别 —— 辅助函数
// ----------------------------------------------------------------------------
// 三源标题搜索 —— 上传弹窗的"解析"阶段调用,
// 由 handler_upload_resolve.go 的 SSE 流编排。
//
// 与 handler.go 分文件:这个流程跨多个外部依赖(minicod、storage),
// 文件体量会比单纯 CRUD 大,单独切出来好维护。
// ============================================================================

package library

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"sync"
	"unicode"

	"scholar-backend/internal/common/database"
	"scholar-backend/internal/common/safego"
	"scholar-backend/internal/minicod"
)

// ============================================================================
// 三源并行标题搜索
// ============================================================================

// 上传 PDF 识别时,候选的匹配类型(置信度由强到弱)——前端据此展示置信度,不再盲信第一条。
const (
	MatchTypeDOI    = "doi"         // DOI 精确解析:最强,DOI 唯一标识论文
	MatchTypeTitle  = "title_match" // 标题精确匹配(stc /search/match)
	MatchTypeSearch = "search"      // 模糊全文检索兜底
)

// matchTypeRank 匹配类型的排序权重(越大越靠前)。
func matchTypeRank(t string) int {
	switch t {
	case MatchTypeDOI:
		return 3
	case MatchTypeTitle:
		return 2
	default:
		return 1
	}
}

// SearchHit 单条搜索结果 —— 字段是前端展示需要的最小集 + 给后续 confirm 用的 source/source_paper_id
type SearchHit struct {
	Source        string  `json:"source"` // stc / olx / pmd
	SourcePaperID string  `json:"source_paper_id"`
	Title         string  `json:"title"`
	Abstract      string  `json:"abstract,omitempty"`
	Year          *uint16 `json:"year,omitempty"`
	Venue         string  `json:"venue,omitempty"`
	DOI           string  `json:"doi,omitempty"`
	CitationCount uint32  `json:"citation_count,omitempty"`
	PdfURL        string  `json:"pdf_url,omitempty"`
	// MatchType 候选是怎么来的(doi 精确 / 标题精确 / 模糊搜索)——前端展示置信度用。
	MatchType string `json:"match_type,omitempty"`
	// MatchScore 与 PDF 抽取标题的相似度 [0,1](DOI 精确命中固定 1.0)——排序 + 低置信提醒用。
	MatchScore float64 `json:"match_score,omitempty"`
	// AlreadySaved 该论文是否已在当前用户文献集中(前端用来加 chip);**不参与识别候选排序**。
	AlreadySaved bool `json:"already_saved"`
	// AlreadyPaperID 已收藏对应的 user_library_papers.id —— 合并场景需要
	AlreadyPaperID uint64 `json:"already_paper_id,omitempty"`
	// Authors / raw 由 confirm 阶段从 SearchHit 复刻进入库,
	// 这里展开一层透传,前端只用前面那几个字段做选择
	Authors json.RawMessage `json:"authors,omitempty"`
	Raw     json.RawMessage `json:"raw,omitempty"`
}

// hitFromPaper 把 minicod.Paper 转成 SearchHit(source 显式传入,doi/match 端点响应可能不带 source)。
func hitFromPaper(source string, p minicod.Paper) SearchHit {
	hit := SearchHit{
		Source:        source,
		SourcePaperID: p.PaperID,
		Title:         p.Title,
		Abstract:      p.Abstract,
		Venue:         p.Venue,
		CitationCount: uint32(p.CitationCount),
	}
	if p.Year > 0 {
		y := uint16(p.Year)
		hit.Year = &y
	}
	if doi := extractDOIFromExternal(p.ExternalIDs); doi != "" {
		hit.DOI = doi
	}
	if p.OpenAccessPDF != nil && p.OpenAccessPDF.URL != "" {
		hit.PdfURL = p.OpenAccessPDF.URL
	} else if p.IsOpenAccess && p.URL != "" {
		hit.PdfURL = p.URL
	}
	if len(p.Authors) > 0 {
		if b, err := json.Marshal(p.Authors); err == nil {
			hit.Authors = b
		}
	}
	if b, err := json.Marshal(p); err == nil {
		hit.Raw = b
	}
	return hit
}

// SearchThreeSources 标题并行查 stc / olx / pmd,合并去重 + 标记已收藏。
//
// 某源失败 —— 静默吞错,其他源结果仍展示(典型场景:PMD 网络抖动,
// 不应因此拒绝整个上传流程)。
//
// 已收藏的优先排在前面(对应用户要求"标记已收藏并排序优先")。
func (h *Handler) SearchThreeSources(ctx context.Context, userID uint64, title string, perSourceLimit int) ([]SearchHit, error) {
	if h.deps.Minicod == nil {
		return nil, fmt.Errorf("minicod manager not configured")
	}
	if perSourceLimit <= 0 {
		perSourceLimit = 5
	}
	sources := []string{SourceSTC, SourceOLX, SourcePMD}

	// 并行查 3 源,各源失败独立处理
	type sourceResult struct {
		source string
		papers []minicod.Paper
		err    error
	}
	results := make([]sourceResult, len(sources))
	var wg sync.WaitGroup
	for i, src := range sources {
		wg.Add(1)
		i, src := i, src
		safego.Go("library-import-source-search", func() {
			defer wg.Done()
			resp, err := h.deps.Minicod.SearchPapers(ctx, minicod.PaperSearchOptions{
				Query:  title,
				Limit:  perSourceLimit,
				Source: src,
			})
			if err != nil {
				results[i] = sourceResult{source: src, err: err}
				return
			}
			results[i] = sourceResult{source: src, papers: resp.Data}
		})
	}
	wg.Wait()

	// 合成 SearchHit 列表 —— 保留各源顺序,源内顺序按搜索结果原本顺序
	hits := make([]SearchHit, 0, len(sources)*perSourceLimit)
	for _, r := range results {
		if r.err != nil || len(r.papers) == 0 {
			continue
		}
		for _, p := range r.papers {
			hits = append(hits, hitFromPaper(r.source, p))
		}
	}

	// PMD 上游 /v1/pmd/papers/search 只返元数据,没 abstract —— 补一次 batch
	// (与 frontend shared/api/paper-enrich.ts 同款逻辑,服务端版,保证 upload-PDF
	// 流程命中 PMD 时 abstract 不丢)
	hits = h.enrichPmdAbstractsInHits(ctx, hits)

	// 批量 check 哪些已收藏 —— 一次查询全部命中,O(N)
	if len(hits) > 0 {
		hits = markAlreadySaved(h, userID, hits)
	}

	// 排序:已收藏 → 前面;其余保持源/原顺序
	sortBySaved(hits)
	return hits, nil
}

// extractDOIFromExternal —— minicod.Paper.ExternalIDs 字段大小写多样兜底
func extractDOIFromExternal(ext map[string]interface{}) string {
	if ext == nil {
		return ""
	}
	for _, k := range []string{"DOI", "doi", "Doi"} {
		if v, ok := ext[k]; ok {
			if s, ok := v.(string); ok && strings.TrimSpace(s) != "" {
				return strings.TrimSpace(s)
			}
		}
	}
	return ""
}

// markAlreadySaved 批量查"这些 (source, source_paper_id) 是不是已在该用户文献集",
// 命中的填 AlreadySaved=true + AlreadyPaperID
func markAlreadySaved(h *Handler, userID uint64, hits []SearchHit) []SearchHit {
	// 简单实现:按 source 分组后一次 IN 查询
	type rowKey struct {
		Source        string
		SourcePaperID string
	}
	bySource := make(map[string][]string)
	for _, h := range hits {
		bySource[h.Source] = append(bySource[h.Source], h.SourcePaperID)
	}

	// 用 GORM 查,key→ID
	saved := make(map[rowKey]uint64)
	db := database.GetDB()
	for src, ids := range bySource {
		var rows []struct {
			ID            uint64
			Source        string
			SourcePaperID string
		}
		if err := db.Model(&UserLibraryPaper{}).
			Select("id, source, source_paper_id").
			Where("user_id = ? AND source = ? AND source_paper_id IN ?", userID, src, ids).
			Find(&rows).Error; err != nil {
			continue
		}
		for _, r := range rows {
			saved[rowKey{r.Source, r.SourcePaperID}] = r.ID
		}
	}
	for i := range hits {
		if id, ok := saved[rowKey{hits[i].Source, hits[i].SourcePaperID}]; ok {
			hits[i].AlreadySaved = true
			hits[i].AlreadyPaperID = id
		}
	}
	return hits
}

// enrichPmdAbstractsInHits —— PMD 命中行的 abstract 补全。
// 上游 /v1/pmd/papers/search 不返 abstract，但单篇 /v1/pmd/papers/get
// （GetPaperBatch 会按 pmd:/pubmed: 前缀路由）能拿到 efetch abstract。
// 收集所有 PMD + abstract 为空的 hit 一次性请 GetPaperBatch,merge 回去;
// 失败静默 fallback —— abstract 留空,主流程不挂。
func (h *Handler) enrichPmdAbstractsInHits(ctx context.Context, hits []SearchHit) []SearchHit {
	if h.deps.Minicod == nil || len(hits) == 0 {
		return hits
	}
	var ids []string
	for _, hit := range hits {
		if hit.Source == SourcePMD && strings.TrimSpace(hit.Abstract) == "" && hit.SourcePaperID != "" {
			ids = append(ids, hit.SourcePaperID)
		}
	}
	if len(ids) == 0 {
		return hits
	}
	papers, err := h.deps.Minicod.GetPaperBatch(ctx, ids, []string{"abstract"})
	if err != nil {
		return hits
	}
	byID := make(map[string]string, len(papers))
	for _, p := range papers {
		if p.PaperID != "" && strings.TrimSpace(p.Abstract) != "" {
			byID[p.PaperID] = p.Abstract
		}
	}
	if len(byID) == 0 {
		return hits
	}
	for i := range hits {
		if hits[i].Source != SourcePMD || hits[i].Abstract != "" {
			continue
		}
		if abs, ok := byID[hits[i].SourcePaperID]; ok {
			hits[i].Abstract = abs
			// raw 里也补一下 abstract,与正常字段一致(linked 行 confirm 把 raw 也写进 RawJSON)
			hits[i].Raw = mergeAbstractIntoRaw(hits[i].Raw, abs)
		}
	}
	return hits
}

// mergeAbstractIntoRaw 把 abstract 注入到 raw_json 顶层(若已有则不动)。
// 失败回退到原 raw,数据不丢。
func mergeAbstractIntoRaw(raw json.RawMessage, abstract string) json.RawMessage {
	if len(raw) == 0 || abstract == "" {
		return raw
	}
	var obj map[string]interface{}
	if err := json.Unmarshal(raw, &obj); err != nil {
		return raw
	}
	// 仅当原 raw 里没 abstract 或为空时填进去
	if v, ok := obj["abstract"]; ok {
		if s, _ := v.(string); strings.TrimSpace(s) != "" {
			return raw
		}
	}
	obj["abstract"] = abstract
	b, err := json.Marshal(obj)
	if err != nil {
		return raw
	}
	return b
}

// sortBySaved —— 已收藏放最前,内部相对顺序不变(stable sort 心智但用最朴素的算法)
func sortBySaved(hits []SearchHit) {
	saved := make([]SearchHit, 0, len(hits))
	others := make([]SearchHit, 0, len(hits))
	for _, h := range hits {
		if h.AlreadySaved {
			saved = append(saved, h)
		} else {
			others = append(others, h)
		}
	}
	copy(hits, append(saved, others...))
}

// searchMultiQueriesMerged 用多个查询词依次跑 SearchThreeSources,合并结果并去重。
// 去重键:(source, source_paper_id)。早出现的优先 —— 调用方按"信号强度"排好序传入
// (DOI > arXiv > 标题)。
//
// 合并后再做一次 sortBySaved,把"已收藏"行重新顶到前面(不同 query 的结果掺起来后顺序乱了)。
func (h *Handler) searchMultiQueriesMerged(ctx context.Context, userID uint64, queries []string, perSourceLimit int) []SearchHit {
	type key struct {
		Source        string
		SourcePaperID string
	}
	seen := make(map[key]bool)
	merged := make([]SearchHit, 0, len(queries)*perSourceLimit*3)
	for _, q := range queries {
		if strings.TrimSpace(q) == "" {
			continue
		}
		hits, err := h.SearchThreeSources(ctx, userID, q, perSourceLimit)
		if err != nil {
			continue
		}
		for _, hit := range hits {
			k := key{hit.Source, hit.SourcePaperID}
			if seen[k] {
				continue
			}
			seen[k] = true
			merged = append(merged, hit)
		}
	}
	sortBySaved(merged)
	return merged
}

// resolveUploadCandidates 上传 PDF 识别的「在线查询」候选解析(part 2)。
//
// 与旧的「把 DOI/标题当模糊查询词 + sortBySaved 重排」不同,这里分置信度优先级:
//  1. 有 DOI → 三源并行**精确解析**(GetPaperByDOI),命中即最高置信(score=1)
//  2. 有标题 → stc **标题精确匹配**(MatchPaperByTitle),按与抽取标题的相似度打分
//  3. 模糊兜底 → 现有多 query 三源检索(searchMultiQueriesMerged),每条按标题相似度打分
//
// 合并去重 (source, source_paper_id):同一篇保留最强匹配类型;
// 最终排序 = 匹配类型(doi>title>search)→ 相似度降序。**已收藏只标注 already_saved,
// 不参与排序** —— 识别场景「库里有」不代表「就是这篇 PDF」(旧 sortBySaved 会把无关的已收藏
// 论文顶成 ✨ 最佳建议)。
func (h *Handler) resolveUploadCandidates(ctx context.Context, uid uint64, doi, arxiv, title string) []SearchHit {
	if h.deps.Minicod == nil {
		return nil
	}
	doi = strings.TrimSpace(doi)
	title = strings.TrimSpace(title)

	type keyT struct{ source, id string }
	byKey := make(map[keyT]SearchHit)
	// upsert:同 (source,id) 保留匹配类型更强的;同类型保留分更高的
	upsert := func(hit SearchHit) {
		if strings.TrimSpace(hit.SourcePaperID) == "" {
			return
		}
		k := keyT{hit.Source, hit.SourcePaperID}
		if prev, ok := byKey[k]; ok {
			pr, hr := matchTypeRank(prev.MatchType), matchTypeRank(hit.MatchType)
			if pr > hr || (pr == hr && prev.MatchScore >= hit.MatchScore) {
				return
			}
		}
		byKey[k] = hit
	}

	// 1) DOI 三源并行精确解析
	if doi != "" {
		sources := []string{SourceSTC, SourceOLX, SourcePMD}
		found := make([]*minicod.Paper, len(sources))
		var wg sync.WaitGroup
		for i, src := range sources {
			wg.Add(1)
			i, src := i, src
			safego.Go("library-doi-resolve", func() {
				defer wg.Done()
				if p, err := h.deps.Minicod.GetPaperByDOI(ctx, src, doi); err == nil && p != nil {
					found[i] = p
				}
			})
		}
		wg.Wait()
		for i, p := range found {
			if p == nil {
				continue
			}
			hit := hitFromPaper(sources[i], *p)
			hit.MatchType = MatchTypeDOI
			hit.MatchScore = 1.0
			upsert(hit)
		}
	}

	// 2) 标题精确匹配(stc)
	if title != "" {
		if p, err := h.deps.Minicod.MatchPaperByTitle(ctx, title); err == nil && p != nil {
			hit := hitFromPaper(SourceSTC, *p)
			hit.MatchType = MatchTypeTitle
			hit.MatchScore = titleSimilarity(title, p.Title)
			upsert(hit)
		}
	}

	// 3) 模糊兜底(现有多 query 三源检索,提供覆盖面)
	queries := []string{}
	if doi != "" {
		queries = append(queries, doi)
	}
	if a := strings.TrimSpace(arxiv); a != "" {
		queries = append(queries, "arXiv:"+a)
	}
	if title != "" {
		queries = append(queries, title)
	}
	if len(queries) > 0 {
		for _, hit := range h.searchMultiQueriesMerged(ctx, uid, queries, 5) {
			hit.MatchType = MatchTypeSearch
			hit.MatchScore = titleSimilarity(title, hit.Title)
			upsert(hit)
		}
	}

	// 收敛成 slice + 标注已收藏(仅标注,不排序)
	hits := make([]SearchHit, 0, len(byKey))
	for _, hit := range byKey {
		hits = append(hits, hit)
	}
	hits = markAlreadySaved(h, uid, hits)

	// 最终排序:匹配类型(doi>title>search)→ 相似度降序 → 被引降序 → source_paper_id。
	// 后两级是确定性 tiebreaker:byKey 是 map,若只按 (type,score) 排,同分候选(如中文
	// 标题相似度恒 0 的一批模糊候选)会因 map 迭代顺序随机而每次排序不同。不看已收藏。
	sort.SliceStable(hits, func(i, j int) bool {
		ri, rj := matchTypeRank(hits[i].MatchType), matchTypeRank(hits[j].MatchType)
		if ri != rj {
			return ri > rj
		}
		if hits[i].MatchScore != hits[j].MatchScore {
			return hits[i].MatchScore > hits[j].MatchScore
		}
		if hits[i].CitationCount != hits[j].CitationCount {
			return hits[i].CitationCount > hits[j].CitationCount
		}
		return hits[i].SourcePaperID < hits[j].SourcePaperID
	})
	return hits
}

// titleStopwords 标题里的高频虚词 —— 计算相似度时剔除,避免两个不相干标题因共享
// the/of/for 等被高估相似度。
var titleStopwords = map[string]bool{
	"the": true, "of": true, "for": true, "and": true, "an": true,
	"in": true, "on": true, "to": true, "with": true, "via": true,
	"using": true, "based": true, "by": true, "from": true, "at": true,
}

// titleSimilarity 归一化标题相似度 [0,1] —— token 集合的 Dice 系数(剔虚词)。
// 抽取标题与候选标题实词重叠越高,越可能是同一篇。
func titleSimilarity(a, b string) float64 {
	ta, tb := titleTokens(a), titleTokens(b)
	if len(ta) == 0 || len(tb) == 0 {
		return 0
	}
	inter := 0
	for tok := range ta {
		if tb[tok] {
			inter++
		}
	}
	return 2 * float64(inter) / float64(len(ta)+len(tb))
}

// isCJK 判断是否中日韩表意/音节字符(这些语言标题无词间空格,需另行处理)。
func isCJK(r rune) bool {
	return unicode.Is(unicode.Han, r) ||
		unicode.Is(unicode.Hiragana, r) ||
		unicode.Is(unicode.Katakana, r) ||
		unicode.Is(unicode.Hangul, r)
}

// titleTokens 归一化分词,返回 token 集合:
//   - 拉丁/数字:小写整词(≥2 字符,剔虚词),空格/标点当分隔符
//   - 中日韩:无词间空格,用**字符 bigram**近似分词(单字也留),否则整句中文会塌成一个
//     token → 任意两个不同中文标题相似度恒为 0,中文论文的模糊候选打分全废
func titleTokens(s string) map[string]bool {
	set := make(map[string]bool)
	var latin strings.Builder
	var cjk []rune
	flushLatin := func() {
		if latin.Len() >= 2 {
			w := latin.String()
			if !titleStopwords[w] {
				set[w] = true
			}
		}
		latin.Reset()
	}
	flushCJK := func() {
		if len(cjk) == 1 {
			set[string(cjk)] = true
		} else {
			for i := 0; i+1 < len(cjk); i++ {
				set[string(cjk[i:i+2])] = true
			}
		}
		cjk = cjk[:0]
	}
	for _, r := range strings.ToLower(s) {
		switch {
		case isCJK(r):
			flushLatin()
			cjk = append(cjk, r)
		case unicode.IsLetter(r) || unicode.IsDigit(r):
			flushCJK()
			latin.WriteRune(r)
		default:
			flushLatin()
			flushCJK()
		}
	}
	flushLatin()
	flushCJK()
	return set
}

// 注:历史上这里有一段"AI 兜底抽取"(LLM 把 PDF 全文抽成结构化元数据 AIPaperMeta),
// 已下线删除 —— 实际上传解析只走 pdfparse(标题/DOI/摘要文本),不调大模型,
// 抽取结果经 JobState.Parsed* 落 og_* 字段。
