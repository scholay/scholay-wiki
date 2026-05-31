// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package minicod

import (
	"encoding/json"
	"log/slog"
	"strconv"
	"strings"

	"scholar-backend/internal/common/safego"
	"scholar-backend/internal/common/utils"
	"scholar-backend/internal/hotcontent"
	"scholar-backend/internal/seo"
	"scholar-backend/internal/usagelog"

	"github.com/gin-gonic/gin"
)

// AuthorSEORecorder 由 seo.Service 直接实现, 作者详情命中时写入 SEO 索引库 tier=1。
// 历史上 minicod 自定义了一份 AuthorSEOSeed 与 seo.AuthorSeed 字段镜像, 中间靠
// cmd/server/authorSEORecorderAdapter 翻译; 现在改成 minicod 直接 import seo 用
// seo.AuthorSeed, adapter 已下线。
type AuthorSEORecorder interface {
	RecordAuthorDetailClick(seed *seo.AuthorSeed) error
}

// JournalSEORecorder 同构 — 也直接用 seo.JournalSeed。
type JournalSEORecorder interface {
	RecordJournalDetailClick(seed *seo.JournalSeed) error
}

// HotContentRecorder 由 hotcontent.Service 直接实现 —— 落热门搜索词 / 论文曝光 / 点击。
//   - RecordSearch: 关键词按类型(文献/期刊)分桶计数
//   - RecordImpressions: 一次搜索结果集的曝光量 +1
//   - RecordClick: 从搜索结果点开详情(GET /papers/:id)的点击量 +1
//
// SEO 直访(/paper/:slug)由 seo 模块单独记 seo_view, 与 RecordClick 走不同接口, 不重复计数。
type HotContentRecorder interface {
	RecordSearch(keyword string, searchType hotcontent.SearchType) error
	RecordImpressions(papers []hotcontent.PaperViewData) error
	RecordClick(paper *hotcontent.PaperViewData) error
}

// Handler handles HTTP requests for Minicod API
type Handler struct {
	manager            *Manager
	authorSEORecorder  AuthorSEORecorder
	journalSEORecorder JournalSEORecorder
	hotRecorder        HotContentRecorder
	usageRecorder      usagelog.FeatureRecorder
}

// NewHandler creates a new Minicod handler
func NewHandler(manager *Manager) *Handler {
	return &Handler{
		manager: manager,
	}
}

// SetAuthorSEORecorder 注入作者 SEO 记录器（详情命中时记录 tier=1 click）
func (h *Handler) SetAuthorSEORecorder(r AuthorSEORecorder) {
	h.authorSEORecorder = r
}

// SetJournalSEORecorder 注入期刊 SEO 记录器 (详情命中时记录 tier=1 click)
func (h *Handler) SetJournalSEORecorder(r JournalSEORecorder) {
	h.journalSEORecorder = r
}

// SetHotContentRecorder 注入热门内容记录器（搜索词 / 曝光 / 点击统计）
func (h *Handler) SetHotContentRecorder(r HotContentRecorder) {
	h.hotRecorder = r
}

// SetUsageRecorder 注入功能使用统计录入器(用户实际提交搜索时记一次)
func (h *Handler) SetUsageRecorder(r usagelog.FeatureRecorder) {
	h.usageRecorder = r
}

// paperToViewData 把上游 Paper 映射成 hotcontent 落库用的 PaperViewData。
func paperToViewData(p *Paper) hotcontent.PaperViewData {
	vd := hotcontent.PaperViewData{PaperID: p.PaperID}
	if p.Title != "" {
		t := p.Title
		vd.Title = &t
	}
	if p.Abstract != "" {
		a := p.Abstract
		vd.Abstract = &a
	}
	if p.Year > 0 {
		y := p.Year
		vd.Year = &y
	}
	if p.Venue != "" {
		v := p.Venue
		vd.Venue = &v
	}
	if doi, ok := p.ExternalIDs["DOI"].(string); ok && doi != "" {
		vd.DOI = &doi
	}
	if len(p.Authors) > 0 {
		names := make([]string, 0, len(p.Authors))
		for _, a := range p.Authors {
			if a.Name != "" {
				names = append(names, a.Name)
			}
		}
		if len(names) > 0 {
			if b, err := json.Marshal(names); err == nil {
				s := string(b)
				vd.Authors = &s
			}
		}
	}
	return vd
}

// papersToViewData 批量映射(用于曝光)。
func papersToViewData(papers []Paper) []hotcontent.PaperViewData {
	out := make([]hotcontent.PaperViewData, 0, len(papers))
	for i := range papers {
		if papers[i].PaperID == "" {
			continue
		}
		out = append(out, paperToViewData(&papers[i]))
	}
	return out
}

// SearchPapersRequest 定义学术检索的POST请求结构
type SearchPapersRequest struct {
	Query             string   `json:"query" binding:"required"`
	Year              string   `json:"year"`
	YearFrom          string   `json:"yearFrom"`
	YearTo            string   `json:"yearTo"`
	DateFrom          string   `json:"dateFrom"` // YYYY-MM-DD,比 yearFrom 精度更高
	DateTo            string   `json:"dateTo"`
	Offset            int      `json:"offset"`
	Limit             int      `json:"limit"`
	Fields            []string `json:"fields"`
	PublicationTypes  []string `json:"publicationTypes"`
	Venue             []string `json:"venue"`
	FieldsOfStudy     []string `json:"fieldsOfStudy"`
	OpenAccessPdf     string   `json:"openAccessPdf"`
	MinCitationCount  int      `json:"minCitationCount"`
	EnableTranslation *bool    `json:"enableTranslation,omitempty"`
	Source            string   `json:"source,omitempty"` // stc | olx | pmd | all
	Sort              string   `json:"sort,omitempty"`   // relevance | citations | date
}

// SearchPapersResponse 定义学术检索的响应结构
type SearchPapersResponse struct {
	Data              any      `json:"data"`
	OriginalQuery     string   `json:"originalQuery"`
	SearchSuggestions []string `json:"searchSuggestions"`
	ActualQuery       string   `json:"actualQuery"`
	HasSuggestions    bool     `json:"hasSuggestions"`
	SearchStrategy    string   `json:"searchStrategy"`
}

// SearchPapers handles paper search requests
// POST /api/v1/scholar/papers/search
func (h *Handler) SearchPapers(c *gin.Context) {
	var req SearchPapersRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	if len(req.Query) > 500 {
		utils.Error(c, 4001, "搜索词过长,请精简到 500 字以内")
		return
	}
	if req.Query == "" {
		utils.Error(c, 4001, "请输入搜索词")
		return
	}

	// AI 搜索建议已下线 (新前端不消费 searchSuggestions, 详见 ai 包瘦身)。
	// SearchSuggestions / HasSuggestions 字段保留但恒为空, 维持响应 JSON 形状兼容。

	// Parse year range (upstream expects integers year_from/year_to)
	yearFrom, yearTo := parseYearRange(req.Year, req.YearFrom, req.YearTo)

	opts := PaperSearchOptions{
		Query:            req.Query,
		YearFrom:         yearFrom,
		YearTo:           yearTo,
		DateFrom:         req.DateFrom,
		DateTo:           req.DateTo,
		Offset:           req.Offset,
		Limit:            req.Limit,
		Fields:           req.Fields,
		PublicationTypes: req.PublicationTypes,
		Venue:            req.Venue,
		FieldsOfStudy:    req.FieldsOfStudy,
		OpenAccessPDF:    req.OpenAccessPdf,
		MinCitationCount: req.MinCitationCount,
		Source:           req.Source,
		Sort:             req.Sort,
	}

	if opts.Limit <= 0 {
		opts.Limit = 10
	}
	// 上游 Semantic Scholar 单次最多返回 100；大于 100 会被截断反而浪费带宽和缓存 key 空间，
	// 还可能被拿来批量爬库。这里硬性夹在 [1,100]，与 DefaultLimit 保持一致。
	if opts.Limit > 100 {
		opts.Limit = 100
	}
	if opts.Offset < 0 {
		opts.Offset = 0
	}

	result, err := h.manager.SearchPapers(c.Request.Context(), opts)
	if err != nil {
		utils.Error(c, 4002, "搜索论文失败,请稍后重试")
		return
	}

	response := SearchPapersResponse{
		Data:           result,
		OriginalQuery:  req.Query,
		ActualQuery:    req.Query,
		HasSuggestions: false,
		SearchStrategy: "original",
	}

	// 热门内容: 记文献搜索词 + 结果集曝光量。异步, 不阻塞响应。
	if h.hotRecorder != nil && result != nil {
		rec := h.hotRecorder
		query := req.Query
		impressions := papersToViewData(result.Data)
		safego.Go("hotcontent-paper-search", func() {
			_ = rec.RecordSearch(query, hotcontent.SearchTypePaper)
			if len(impressions) > 0 {
				_ = rec.RecordImpressions(impressions)
			}
		})
	}

	// 功能使用统计: "文献搜索" 真实被用了一次(公开接口, 匿名 user_id 为 nil 也记)。
	// 自身已 safego, 不必再包一层。
	if h.usageRecorder != nil {
		h.usageRecorder.RecordFromGin(c,
			usagelog.FeaturePaperSearch, usagelog.FeatureNames[usagelog.FeaturePaperSearch],
			"search",
			map[string]any{"query": req.Query})
	}

	utils.Success(c, response)
}

// GetPaper handles get paper details requests
// GET /api/v1/scholar/papers/:paperId
func (h *Handler) GetPaper(c *gin.Context) {
	paperID := c.Param("paperId")
	if paperID == "" {
		utils.Error(c, 4003, "请提供论文 ID")
		return
	}

	opts := PaperDetailsOptions{}
	if fields := c.Query("fields"); fields != "" {
		opts.Fields = strings.Split(fields, ",")
	}

	result, err := h.manager.GetPaper(c.Request.Context(), paperID, opts)
	if err != nil {
		utils.Error(c, 4004, "加载论文详情失败,请稍后重试")
		return
	}

	// 热门内容: 从搜索结果点开详情 = 一次点击。异步, 不阻塞响应。
	// (SEO 直访走 /paper/:slug → seo 模块记 seo_view, 两条入口接口不同, 不重复计数)
	if h.hotRecorder != nil && result != nil && result.PaperID != "" {
		rec := h.hotRecorder
		vd := paperToViewData(result)
		safego.Go("hotcontent-paper-click", func() {
			_ = rec.RecordClick(&vd)
		})
	}

	utils.Success(c, result)
}

// GetPaperReferences handles get paper references requests
// GET /api/v1/scholar/papers/:paperId/references
func (h *Handler) GetPaperReferences(c *gin.Context) {
	paperID := c.Param("paperId")
	if paperID == "" {
		utils.Error(c, 4007, "请提供论文 ID")
		return
	}

	opts := CitationsOptions{
		Offset: clampOffset(parseIntQuery(c, "offset", 0)),
		Limit:  clampLimit(parseIntQuery(c, "limit", 100)),
	}
	if fields := c.Query("fields"); fields != "" {
		opts.Fields = strings.Split(fields, ",")
	}

	result, err := h.manager.GetPaperReferences(c.Request.Context(), paperID, opts)
	if err != nil {
		utils.Error(c, 4008, "加载参考文献失败,请稍后重试")
		return
	}

	utils.Success(c, result)
}

// GetAuthor handles get author details requests
// GET /api/v1/scholar/authors/:authorId
func (h *Handler) GetAuthor(c *gin.Context) {
	authorID := c.Param("authorId")
	if authorID == "" {
		utils.Error(c, 4013, "请提供作者 ID")
		return
	}

	var fields []string
	if f := c.Query("fields"); f != "" {
		fields = strings.Split(f, ",")
	}

	result, err := h.manager.GetAuthor(c.Request.Context(), authorID, fields)
	if err != nil {
		utils.Error(c, 4014, "加载作者详情失败,请稍后重试")
		return
	}

	// 详情命中即 tier=1 写入 seo_authors。异步执行，失败不影响主响应。
	if h.authorSEORecorder != nil && result != nil && result.Name != "" {
		seed := &seo.AuthorSeed{
			AuthorID:      result.AuthorID,
			Name:          result.Name,
			Affiliations:  result.Affiliations,
			Homepage:      result.Homepage,
			PaperCount:    result.PaperCount,
			CitationCount: result.CitationCount,
			Source:        result.Source,
		}
		if result.HIndex > 0 {
			hi := result.HIndex
			seed.HIndex = &hi
		}
		recorder := h.authorSEORecorder
		safego.Go("seo-author-detail-click", func() {
			if err := recorder.RecordAuthorDetailClick(seed); err != nil {
				slog.Warn("seo author detail click record failed", "author_id", seed.AuthorID, "err", err)
			}
		})
	}

	utils.Success(c, result)
}

// GetAuthorPapers handles get author papers requests
// GET /api/v1/scholar/authors/:authorId/papers
func (h *Handler) GetAuthorPapers(c *gin.Context) {
	authorID := c.Param("authorId")
	if authorID == "" {
		utils.Error(c, 4015, "请提供作者 ID")
		return
	}

	offset := clampOffset(parseIntQuery(c, "offset", 0))
	limit := clampLimit(parseIntQuery(c, "limit", 100))
	var fields []string
	if f := c.Query("fields"); f != "" {
		fields = strings.Split(f, ",")
	}

	result, err := h.manager.GetAuthorPapers(c.Request.Context(), authorID, fields, offset, limit)
	if err != nil {
		utils.Error(c, 4016, "加载作者论文列表失败,请稍后重试")
		return
	}

	utils.Success(c, result)
}

// BatchPaperRequestBody represents POST body for batch paper request
type BatchPaperRequestBody struct {
	PaperIDs []string `json:"paperIds" binding:"required"`
	Fields   []string `json:"fields"`
}

// GetPaperBatch handles batch paper details requests
// POST /api/v1/scholar/papers/batch
func (h *Handler) GetPaperBatch(c *gin.Context) {
	var req BatchPaperRequestBody
	if !utils.BindJSON(c, &req) {
		return
	}

	// 去重 + 空值过滤：上游 Semantic Scholar batch 接口按 count 计费，
	// 客户端重复传同一个 paperID 会白白浪费额度，且命中的 paper 也会在响应中重复。
	// 同时夹一个硬上限（500）防止恶意巨量请求。
	ids := dedupNonEmpty(req.PaperIDs, 500)
	if len(ids) == 0 {
		utils.Error(c, 4021, "请选择要查询的论文")
		return
	}

	result, err := h.manager.GetPaperBatch(c.Request.Context(), ids, req.Fields)
	if err != nil {
		utils.Error(c, 4022, "批量加载论文失败,请稍后重试")
		return
	}

	utils.Success(c, result)
}

// dedupNonEmpty 返回去重、去空、按首现顺序排列的切片，最多保留 maxLen 条。
func dedupNonEmpty(in []string, maxLen int) []string {
	if len(in) == 0 {
		return nil
	}
	seen := make(map[string]struct{}, len(in))
	out := make([]string, 0, len(in))
	for _, s := range in {
		if s == "" {
			continue
		}
		if _, ok := seen[s]; ok {
			continue
		}
		seen[s] = struct{}{}
		out = append(out, s)
		if maxLen > 0 && len(out) >= maxLen {
			break
		}
	}
	return out
}

// GetSearchSuggestions handles search suggestions requests
// GET /api/v1/public/search/suggestions
func (h *Handler) GetSearchSuggestions(c *gin.Context) {
	query := c.Query("query")
	if query == "" {
		utils.Error(c, 4023, "请输入搜索词")
		return
	}
	if len(query) > 100 {
		query = query[:100]
	}

	source := c.Query("source") // stc or olx
	paperLimit := parseIntQuery(c, "paperLimit", 5)
	authorLimit := parseIntQuery(c, "authorLimit", 5)
	if paperLimit > 10 {
		paperLimit = 10
	}
	if authorLimit > 10 {
		authorLimit = 10
	}

	result, err := h.manager.GetSearchSuggestions(c.Request.Context(), query, source, paperLimit, authorLimit)
	if err != nil {
		utils.Error(c, 4024, "获取搜索建议失败,请稍后重试")
		return
	}

	utils.Success(c, result)
}

// ======================== JNL Journal Handlers ========================

// SearchJournals handles journal search requests
// POST /api/v1/scholar/journals/search
func (h *Handler) SearchJournals(c *gin.Context) {
	var req JournalSearchOptions
	if !utils.BindJSON(c, &req) {
		return
	}
	if req.PageSize == 0 {
		req.PageSize = 20
	}
	if req.Page == 0 {
		req.Page = 1
	}

	result, err := h.manager.SearchJournals(c.Request.Context(), req)
	if err != nil {
		utils.Error(c, 4030, "搜索期刊失败,请稍后重试")
		return
	}

	// 热门内容: 记期刊搜索词(与文献搜索词分桶)。hot_papers 是论文专用, 期刊不记曝光。
	if h.hotRecorder != nil && req.Keyword != "" {
		rec := h.hotRecorder
		keyword := req.Keyword
		safego.Go("hotcontent-journal-search", func() {
			_ = rec.RecordSearch(keyword, hotcontent.SearchTypeJournal)
		})
	}

	// 功能使用统计: "期刊搜索" 真实被用了一次。
	if h.usageRecorder != nil {
		h.usageRecorder.RecordFromGin(c,
			usagelog.FeatureJournalSearch, usagelog.FeatureNames[usagelog.FeatureJournalSearch],
			"search",
			map[string]any{"keyword": req.Keyword})
	}

	utils.Success(c, result)
}

// ListJournals handles journal listing requests
// POST /api/v1/scholar/journals/list
func (h *Handler) ListJournals(c *gin.Context) {
	var req JournalListOptions
	if !utils.BindJSON(c, &req) {
		return
	}
	if req.PageSize == 0 {
		req.PageSize = 20
	}
	if req.Page == 0 {
		req.Page = 1
	}

	result, err := h.manager.ListJournals(c.Request.Context(), req)
	if err != nil {
		utils.Error(c, 4031, "加载期刊列表失败,请稍后重试")
		return
	}

	utils.Success(c, result)
}

// GetJournal handles get journal detail requests
// POST /api/v1/scholar/journals/get
func (h *Handler) GetJournal(c *gin.Context) {
	var req struct {
		ID   int    `json:"id" binding:"required"`
		Full string `json:"full"`
	}
	if !utils.BindJSON(c, &req) {
		return
	}

	result, err := h.manager.GetJournal(c.Request.Context(), req.ID, req.Full)
	if err != nil {
		utils.Error(c, 4032, "加载期刊详情失败,请稍后重试")
		return
	}

	// 详情命中即 tier=1 写入 seo_journals。异步执行,失败不阻断主响应。
	// result 是 json.RawMessage,顶层结构 {unified: {...}, cover: ..., sources: ...},
	// SEO 关心的元数据都在 unified 下,但字段名是上游多源原貌
	// (publisher 在 crossref_publisher / doaj_publisher; issns 拆成 print/electronic 两列)。
	// 这里做一次轻量映射,失败回写就好,日志带 journal_id 方便排查。
	if h.journalSEORecorder != nil && len(result) > 0 {
		if seed := buildJournalSEOSeed(result); seed != nil {
			recorder := h.journalSEORecorder
			safego.Go("seo-journal-detail-click", func() {
				if err := recorder.RecordJournalDetailClick(seed); err != nil {
					slog.Warn("seo journal detail click record failed", "journal_id", seed.JournalID, "err", err)
				}
			})
		}
	}

	utils.Success(c, result)
}

// buildJournalSEOSeed 从 GetJournal raw 响应里抽出 SEO 入库需要的字段。
//
// raw 顶层结构 { "unified": {...}, "cover": ..., "issn_details": ..., "sources": ... }。
// unified 内字段名是多源原貌(publisher 落在 crossref_publisher / doaj_publisher,
// issns 拆成 print_issn / electronic_issn, all_issns 是 CSV 形式)。
//
// 返回 nil 表示数据不足以入库 (id<=0 / canonical_name 空 / 解码失败), 调用方应跳过。
func buildJournalSEOSeed(raw []byte) *seo.JournalSeed {
	var envelope struct {
		Unified struct {
			ID                int     `json:"id"`
			CanonicalName     string  `json:"canonical_name"`
			CrossrefPublisher string  `json:"crossref_publisher"`
			DOAJPublisher     string  `json:"doaj_publisher"`
			ISSNL             string  `json:"issn_l"`
			PrintISSN         string  `json:"print_issn"`
			ElectronicISSN    string  `json:"electronic_issn"`
			AllISSNs          string  `json:"all_issns"`
			Country           string  `json:"country"`
			Type              string  `json:"type"`
			// 上游字段类型不稳定 (bool / 数字 0|1 / null) —— 用 RawMessage 兜底, 后面手动解
			IsOA            json.RawMessage `json:"is_oa"`
			JCRImpactFactor json.RawMessage `json:"jcr_impact_factor"`
			JCRQuartile     string          `json:"jcr_quartile"`
			OpenAlexHIndex  json.RawMessage `json:"openalex_h_index"`
		} `json:"unified"`
	}
	if err := json.Unmarshal(raw, &envelope); err != nil {
		return nil
	}
	u := envelope.Unified
	if u.ID <= 0 || u.CanonicalName == "" {
		return nil
	}

	// publisher: 优先 crossref(覆盖率高), 退到 doaj
	publisher := u.CrossrefPublisher
	if publisher == "" {
		publisher = u.DOAJPublisher
	}

	// issns: 收集 print + electronic 去重, 若仍空再切 all_issns CSV
	seen := make(map[string]struct{}, 4)
	var issns []string
	add := func(s string) {
		s = strings.TrimSpace(s)
		if s == "" {
			return
		}
		if _, ok := seen[s]; ok {
			return
		}
		seen[s] = struct{}{}
		issns = append(issns, s)
	}
	add(u.ISSNL)
	add(u.PrintISSN)
	add(u.ElectronicISSN)
	if len(issns) == 0 && u.AllISSNs != "" {
		for _, s := range strings.Split(u.AllISSNs, ",") {
			add(s)
		}
	}

	seed := &seo.JournalSeed{
		JournalID:       int64(u.ID),
		CanonicalName:   u.CanonicalName,
		Publisher:       publisher,
		ISSNs:           issns,
		Country:         u.Country,
		Type:            u.Type,
		IsOA:            parseFlexibleBool(u.IsOA),
		JCRImpactFactor: parseFlexibleFloat(u.JCRImpactFactor),
		JCRQuartile:     u.JCRQuartile,
	}
	if h := parseFlexibleInt(u.OpenAlexHIndex); h > 0 {
		seed.OpenAlexHIndex = &h
	}
	return seed
}

// parseFlexibleBool 接受 true/false / 1/0 / "1"/"0" / null, 默认 false。
// 上游不同源会用不同形态的"是否 OA",这里统一兼容。
func parseFlexibleBool(raw json.RawMessage) bool {
	s := strings.TrimSpace(string(raw))
	if s == "" || s == "null" {
		return false
	}
	switch s {
	case "true", "1", `"1"`, `"true"`, `"True"`:
		return true
	}
	return false
}

// parseFlexibleFloat 接受 number / "number" / null, 默认 0。
func parseFlexibleFloat(raw json.RawMessage) float64 {
	s := strings.TrimSpace(string(raw))
	if s == "" || s == "null" {
		return 0
	}
	// 去引号(若上游用字符串包数字)
	s = strings.Trim(s, `"`)
	v, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return 0
	}
	return v
}

// parseFlexibleInt 接受 number / "number" / null, 默认 0。
func parseFlexibleInt(raw json.RawMessage) int {
	s := strings.TrimSpace(string(raw))
	if s == "" || s == "null" {
		return 0
	}
	s = strings.Trim(s, `"`)
	v, err := strconv.Atoi(s)
	if err != nil {
		return 0
	}
	return v
}

// JournalsByNames batches journal lookups by canonical_name.
// POST /api/v1/public/journals/byNames
//
// 主要场景：搜索结果页一次拿一整页 venue 的分区/IF 信息回灌到论文卡。
// 上游约定：names 逗号分隔，可选 fields 字段白名单。
func (h *Handler) JournalsByNames(c *gin.Context) {
	var req struct {
		Names  string `json:"names" binding:"required"`
		Fields string `json:"fields"`
	}
	if !utils.BindJSON(c, &req) {
		return
	}

	result, err := h.manager.JournalsByNames(c.Request.Context(), req.Names, req.Fields)
	if err != nil {
		utils.Error(c, 4040, "批量加载期刊失败,请稍后重试")
		return
	}
	utils.Success(c, result)
}

// SuggestJournals returns journal-name prefix autocomplete suggestions.
// POST /api/v1/scholar/journals/suggest  (or /public/journals/suggest)
//
// 前端用来做"搜索框联想"。upstream /v1/jnl/suggest 返回轻量字段
// （id / canonical_name / issn_l / source_count / openalex_works_count）。
func (h *Handler) SuggestJournals(c *gin.Context) {
	var req struct {
		Q     string `json:"q" binding:"required"`
		Limit int    `json:"limit"`
	}
	if !utils.BindJSON(c, &req) {
		return
	}
	if req.Limit <= 0 || req.Limit > 20 {
		req.Limit = 10
	}

	result, err := h.manager.SuggestJournals(c.Request.Context(), req.Q, req.Limit)
	if err != nil {
		utils.Error(c, 4039, "获取期刊建议失败,请稍后重试")
		return
	}

	utils.Success(c, result)
}

// GetJournalStats returns journal statistics
// POST /api/v1/scholar/journals/stats
func (h *Handler) GetJournalStats(c *gin.Context) {
	result, err := h.manager.GetJournalStats(c.Request.Context())
	if err != nil {
		utils.Error(c, 4034, "加载期刊统计数据失败,请稍后重试")
		return
	}

	utils.Success(c, result)
}

// Helper function to parse integer query parameters
func parseIntQuery(c *gin.Context, key string, defaultValue int) int {
	if val := c.Query(key); val != "" {
		if intVal, err := strconv.Atoi(val); err == nil {
			return intVal
		}
	}
	return defaultValue
}

// maxPageSize Semantic Scholar 单次最大返回条数；超过会被上游截断。
const maxPageSize = 100

// clampLimit 将 limit 夹在 [1, maxPageSize]。
// 用于所有 list/search 接口参数校验，防止客户端传 10000 触发上游慢查询或大量流量。
func clampLimit(limit int) int {
	if limit <= 0 {
		return 10
	}
	if limit > maxPageSize {
		return maxPageSize
	}
	return limit
}

// clampOffset 保证 offset 非负。
func clampOffset(offset int) int {
	if offset < 0 {
		return 0
	}
	return offset
}

// parseYearRange 将前端传入的 year / yearFrom / yearTo 统一转换为上游需要的 int 对。
// 支持 "2020", "2020-", "-2023", "2020-2023" 以及分离字段两种来源。
func parseYearRange(year, yearFrom, yearTo string) (int, int) {
	from := atoiSafe(yearFrom)
	to := atoiSafe(yearTo)
	if from == 0 && to == 0 && year != "" {
		if strings.Contains(year, "-") {
			parts := strings.SplitN(year, "-", 2)
			from = atoiSafe(parts[0])
			if len(parts) == 2 {
				to = atoiSafe(parts[1])
			}
		} else {
			from = atoiSafe(year)
		}
	}
	return from, to
}

func atoiSafe(s string) int {
	if s == "" {
		return 0
	}
	n, err := strconv.Atoi(strings.TrimSpace(s))
	if err != nil {
		return 0
	}
	return n
}
