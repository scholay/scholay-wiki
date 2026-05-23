// ============================================================================
// Scholay 文献集 · 上传 PDF 智能识别 —— 辅助函数
// ----------------------------------------------------------------------------
// 三源标题搜索 + AI 全文兜底抽取 —— 上传弹窗的"解析"阶段串这两个调用,
// 由 handler_upload_resolve.go 的 SSE 流编排。
//
// 与 handler.go 分文件:这个流程跨多个外部依赖(minicod、ai、storage),
// 文件体量会比单纯 CRUD 大,单独切出来好维护。
// ============================================================================

package library

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"

	"scholar-backend/internal/ai"
	"scholar-backend/internal/common/database"
	"scholar-backend/internal/minicod"
	"scholar-backend/internal/thirdparty"
)

// ============================================================================
// 三源并行标题搜索
// ============================================================================

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
	// AlreadySaved 该论文是否已在当前用户文献集中(前端用来加 chip + 排序)
	AlreadySaved bool `json:"already_saved"`
	// AlreadyPaperID 已收藏对应的 user_library_papers.id —— 合并场景需要
	AlreadyPaperID uint64 `json:"already_paper_id,omitempty"`
	// Authors / publication_types / raw 由 confirm 阶段从 SearchHit 复刻进入库,
	// 这里展开一层透传,前端只用前面那几个字段做选择
	Authors          json.RawMessage `json:"authors,omitempty"`
	PublicationTypes json.RawMessage `json:"publication_types,omitempty"`
	Raw              json.RawMessage `json:"raw,omitempty"`
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
		go func(i int, src string) {
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
		}(i, src)
	}
	wg.Wait()

	// 合成 SearchHit 列表 —— 保留各源顺序,源内顺序按搜索结果原本顺序
	hits := make([]SearchHit, 0, len(sources)*perSourceLimit)
	for _, r := range results {
		if r.err != nil || len(r.papers) == 0 {
			continue
		}
		for _, p := range r.papers {
			hit := SearchHit{
				Source:        r.source,
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
			// DOI / OpenAccessPdf 从 externalIds + openAccessPdf 中取
			if doi := extractDOIFromExternal(p.ExternalIDs); doi != "" {
				hit.DOI = doi
			}
			if p.OpenAccessPDF != nil && p.OpenAccessPDF.URL != "" {
				hit.PdfURL = p.OpenAccessPDF.URL
			} else if p.IsOpenAccess && p.URL != "" {
				hit.PdfURL = p.URL
			}
			// 保存 authors / raw 给 confirm 阶段直接落库
			if len(p.Authors) > 0 {
				if b, err := json.Marshal(p.Authors); err == nil {
					hit.Authors = b
				}
			}
			if b, err := json.Marshal(p); err == nil {
				hit.Raw = b
			}
			hits = append(hits, hit)
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
// 上游 /v1/pmd/papers/search 不返 abstract,但单篇 /v1/stc/papers/get(后端
// GetPaperBatch 会按 "pmd:" 前缀路由过去)能拿到 efetch abstract。
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

// ============================================================================
// AI 兜底抽取(全文 → 结构化字段)
// ============================================================================

// AIPaperMeta AI 从 PDF 全文抽取出来的论文元数据 —— 字段名与 ai_* 列对应
type AIPaperMeta struct {
	Title    string   `json:"title"`
	Abstract string   `json:"abstract"`
	Authors  []string `json:"authors"`
	Year     uint16   `json:"year"`
	Venue    string   `json:"venue"`
	DOI      string   `json:"doi"`
}

// extractMetadataPromptSystem 系统提示词 —— 只输出 JSON,不带任何 markdown / 解释
const extractMetadataPromptSystem = `你是论文元数据抽取助手。给你一段从学术论文 PDF 提取的纯文本,你必须输出一个 JSON 对象,字段如下:
- title (string): 论文完整标题
- abstract (string): 论文摘要全文
- authors (string[]): 作者姓名数组,顺序与 PDF 一致
- year (number): 发表年份,4 位整数,未知填 0
- venue (string): 期刊/会议名称,未知填空字符串
- doi (string): DOI 字符串,未知填空字符串

严格规则:
1. 必须只输出**单个合法的 JSON 对象**,不要附带任何说明、markdown 围栏、注释
2. 字段缺失就填空字符串 ""(或 0,authors 用空数组 [])
3. 不要瞎编;明确不知道就留空
4. 文本可能含有 OCR 噪声 / 排版错位,尽力还原`

const extractMetadataPromptUserTpl = `以下是论文 PDF 提取的纯文本(可能含有排版/换行噪声),请抽取元数据:

---
%s
---

只输出 JSON。`

// ExtractMetadataFromPDF 调 LLM 把 PDF 全文转成 AIPaperMeta
//
// 用 ModelLevelLow(廉价模型够用)+ 截断 fullText 到 ~40k 字符防超 context。
// 若返回不是合法 JSON 或字段全空,返回 error 让上层走 "失败兜底"。
func (h *Handler) ExtractMetadataFromPDF(ctx context.Context, fullText string) (*AIPaperMeta, error) {
	if h.deps.AI == nil {
		return nil, fmt.Errorf("ai service not configured")
	}
	// 截断 —— 论文前 40k 字符通常已经覆盖 title/abstract/authors/year/venue/doi
	const maxLen = 40_000
	if len(fullText) > maxLen {
		fullText = fullText[:maxLen]
	}

	messages := []ai.ChatMessage{
		{Role: "system", Content: extractMetadataPromptSystem},
		{Role: "user", Content: fmt.Sprintf(extractMetadataPromptUserTpl, fullText)},
	}
	resp, err := h.deps.AI.ChatCompletionWithTools(ctx, messages, nil, "", thirdparty.ModelLevelLow)
	if err != nil {
		return nil, fmt.Errorf("ai extract failed: %w", err)
	}
	if len(resp.Choices) == 0 {
		return nil, fmt.Errorf("ai extract: empty choices")
	}
	raw := strings.TrimSpace(resp.Choices[0].Message.Content)
	// 容错:有些模型仍会包 ```json … ```
	raw = stripCodeFence(raw)

	var meta AIPaperMeta
	if err := json.Unmarshal([]byte(raw), &meta); err != nil {
		return nil, fmt.Errorf("ai extract: invalid JSON: %w (raw=%q)", err, raw)
	}
	// 至少要有 title 或 abstract 才算有效
	if strings.TrimSpace(meta.Title) == "" && strings.TrimSpace(meta.Abstract) == "" {
		return nil, fmt.Errorf("ai extract: title and abstract both empty")
	}
	return &meta, nil
}

// stripCodeFence 去掉 markdown ```json 围栏
func stripCodeFence(s string) string {
	s = strings.TrimSpace(s)
	if !strings.HasPrefix(s, "```") {
		return s
	}
	// 去掉首行 ``` 或 ```json
	if i := strings.Index(s, "\n"); i >= 0 {
		s = s[i+1:]
	}
	s = strings.TrimSuffix(s, "```")
	s = strings.TrimSpace(s)
	// 残留尾部三引号
	s = strings.TrimSuffix(s, "```")
	return strings.TrimSpace(s)
}
