// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package minicod

import (
	"context"
	"log/slog"
	"strconv"
	"strings"

	"scholar-backend/internal/common/safego"
	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

// SearchSuggester 定义搜索建议接口（避免循环依赖）
type SearchSuggester interface {
	GetSearchSuggestions(ctx context.Context, query string) ([]string, error)
}

// AuthorSEORecorder 由 seo 包实现，作者详情命中时写入 SEO 索引库 tier=1
// 与 usagelog.SEORecorder 同构，跨包通过接口反转避免循环依赖。
type AuthorSEORecorder interface {
	RecordAuthorDetailClick(seed *AuthorSEOSeed) error
}

// AuthorSEOSeed 字段镜像 seo.AuthorSeed，转换在 adapter 层完成。
type AuthorSEOSeed struct {
	AuthorID      string
	Name          string
	Affiliations  []string
	Homepage      string
	PaperCount    int
	CitationCount int
	HIndex        *int
	Source        string
}

// Handler handles HTTP requests for Minicod API
type Handler struct {
	manager           *Manager
	suggester         SearchSuggester
	authorSEORecorder AuthorSEORecorder
}

// NewHandler creates a new Minicod handler
func NewHandler(manager *Manager, suggester SearchSuggester) *Handler {
	return &Handler{
		manager:   manager,
		suggester: suggester,
	}
}

// SetAuthorSEORecorder 注入作者 SEO 记录器（详情命中时记录 tier=1 click）
func (h *Handler) SetAuthorSEORecorder(r AuthorSEORecorder) {
	h.authorSEORecorder = r
}

// SearchPapersRequest 定义学术检索的POST请求结构
type SearchPapersRequest struct {
	Query             string   `json:"query" binding:"required"`
	Year              string   `json:"year"`
	YearFrom          string   `json:"yearFrom"`
	YearTo            string   `json:"yearTo"`
	Offset            int      `json:"offset"`
	Limit             int      `json:"limit"`
	Fields            []string `json:"fields"`
	PublicationTypes  []string `json:"publicationTypes"`
	Venue             []string `json:"venue"`
	FieldsOfStudy     []string `json:"fieldsOfStudy"`
	OpenAccessPdf     string   `json:"openAccessPdf"`
	MinCitationCount  int      `json:"minCitationCount"`
	EnableTranslation *bool    `json:"enableTranslation,omitempty"`
	Source            string   `json:"source,omitempty"` // stc, olx, or all
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
		utils.Error(c, 4001, "Query exceeds 500 characters limit")
		return
	}
	if req.Query == "" {
		utils.Error(c, 4001, "Query parameter is required")
		return
	}

	// Search suggestions logic (same as before)
	enableSuggestions := true
	if req.EnableTranslation != nil && !*req.EnableTranslation {
		enableSuggestions = false
	}
	if req.Offset > 0 {
		enableSuggestions = false
	}

	var searchSuggestions []string
	if enableSuggestions && h.suggester != nil {
		suggestions, err := h.suggester.GetSearchSuggestions(c.Request.Context(), req.Query)
		if err != nil {
			slog.Warn("failed to get search suggestions", "err", err)
		} else {
			searchSuggestions = suggestions
		}
	}

	// Parse year range (upstream expects integers year_from/year_to)
	yearFrom, yearTo := parseYearRange(req.Year, req.YearFrom, req.YearTo)

	opts := PaperSearchOptions{
		Query:            req.Query,
		YearFrom:         yearFrom,
		YearTo:           yearTo,
		Offset:           req.Offset,
		Limit:            req.Limit,
		Fields:           req.Fields,
		PublicationTypes: req.PublicationTypes,
		Venue:            req.Venue,
		FieldsOfStudy:    req.FieldsOfStudy,
		OpenAccessPDF:    req.OpenAccessPdf,
		MinCitationCount: req.MinCitationCount,
		Source:           req.Source,
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
		utils.Error(c, 4002, "Failed to search papers: "+err.Error())
		return
	}

	hasSuggestions := len(searchSuggestions) > 0

	response := SearchPapersResponse{
		Data:              result,
		OriginalQuery:     req.Query,
		SearchSuggestions: searchSuggestions,
		ActualQuery:       req.Query,
		HasSuggestions:    hasSuggestions,
		SearchStrategy:    "original",
	}

	utils.Success(c, response)
}

// GetPaper handles get paper details requests
// GET /api/v1/scholar/papers/:paperId
func (h *Handler) GetPaper(c *gin.Context) {
	paperID := c.Param("paperId")
	if paperID == "" {
		utils.Error(c, 4003, "Paper ID is required")
		return
	}

	opts := PaperDetailsOptions{}
	if fields := c.Query("fields"); fields != "" {
		opts.Fields = strings.Split(fields, ",")
	}

	result, err := h.manager.GetPaper(c.Request.Context(), paperID, opts)
	if err != nil {
		utils.Error(c, 4004, "Failed to get paper: "+err.Error())
		return
	}

	utils.Success(c, result)
}

// GetPaperCitations handles get paper citations requests
// GET /api/v1/scholar/papers/:paperId/citations
func (h *Handler) GetPaperCitations(c *gin.Context) {
	paperID := c.Param("paperId")
	if paperID == "" {
		utils.Error(c, 4005, "Paper ID is required")
		return
	}

	opts := CitationsOptions{
		Offset: clampOffset(parseIntQuery(c, "offset", 0)),
		Limit:  clampLimit(parseIntQuery(c, "limit", 100)),
	}
	if fields := c.Query("fields"); fields != "" {
		opts.Fields = strings.Split(fields, ",")
	}

	result, err := h.manager.GetPaperCitations(c.Request.Context(), paperID, opts)
	if err != nil {
		utils.Error(c, 4006, "Failed to get citations: "+err.Error())
		return
	}

	utils.Success(c, result)
}

// GetPaperReferences handles get paper references requests
// GET /api/v1/scholar/papers/:paperId/references
func (h *Handler) GetPaperReferences(c *gin.Context) {
	paperID := c.Param("paperId")
	if paperID == "" {
		utils.Error(c, 4007, "Paper ID is required")
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
		utils.Error(c, 4008, "Failed to get references: "+err.Error())
		return
	}

	utils.Success(c, result)
}

// GetPaperAuthors handles get paper authors requests
// GET /api/v1/scholar/papers/:paperId/authors
func (h *Handler) GetPaperAuthors(c *gin.Context) {
	paperID := c.Param("paperId")
	if paperID == "" {
		utils.Error(c, 4009, "Paper ID is required")
		return
	}

	offset := clampOffset(parseIntQuery(c, "offset", 0))
	limit := clampLimit(parseIntQuery(c, "limit", 100))
	var fields []string
	if f := c.Query("fields"); f != "" {
		fields = strings.Split(f, ",")
	}

	result, err := h.manager.GetPaperAuthors(c.Request.Context(), paperID, fields, offset, limit)
	if err != nil {
		utils.Error(c, 4010, "Failed to get authors: "+err.Error())
		return
	}

	utils.Success(c, result)
}

// SearchAuthors handles author search requests
// GET /api/v1/scholar/authors/search
func (h *Handler) SearchAuthors(c *gin.Context) {
	query := c.Query("query")
	if query == "" {
		utils.Error(c, 4011, "Query parameter is required")
		return
	}

	opts := AuthorSearchOptions{
		Query:  query,
		Offset: clampOffset(parseIntQuery(c, "offset", 0)),
		Limit:  clampLimit(parseIntQuery(c, "limit", 10)),
		Source: c.Query("source"),
	}
	if fields := c.Query("fields"); fields != "" {
		opts.Fields = strings.Split(fields, ",")
	}

	result, err := h.manager.SearchAuthors(c.Request.Context(), opts)
	if err != nil {
		utils.Error(c, 4012, "Failed to search authors: "+err.Error())
		return
	}

	utils.Success(c, result)
}

// GetAuthor handles get author details requests
// GET /api/v1/scholar/authors/:authorId
func (h *Handler) GetAuthor(c *gin.Context) {
	authorID := c.Param("authorId")
	if authorID == "" {
		utils.Error(c, 4013, "Author ID is required")
		return
	}

	var fields []string
	if f := c.Query("fields"); f != "" {
		fields = strings.Split(f, ",")
	}

	result, err := h.manager.GetAuthor(c.Request.Context(), authorID, fields)
	if err != nil {
		utils.Error(c, 4014, "Failed to get author: "+err.Error())
		return
	}

	// 详情命中即 tier=1 写入 seo_authors。异步执行，失败不影响主响应。
	if h.authorSEORecorder != nil && result != nil && result.Name != "" {
		seed := &AuthorSEOSeed{
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
		utils.Error(c, 4015, "Author ID is required")
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
		utils.Error(c, 4016, "Failed to get author papers: "+err.Error())
		return
	}

	utils.Success(c, result)
}

// GetRecommendationsForPaper handles paper recommendations requests
// GET /api/v1/scholar/recommendations/papers/:paperId
func (h *Handler) GetRecommendationsForPaper(c *gin.Context) {
	paperID := c.Param("paperId")
	if paperID == "" {
		utils.Error(c, 4017, "Paper ID is required")
		return
	}

	opts := RecommendationsOptions{
		Limit: clampLimit(parseIntQuery(c, "limit", 10)),
	}
	if fields := c.Query("fields"); fields != "" {
		opts.Fields = strings.Split(fields, ",")
	}

	result, err := h.manager.GetRecommendationsForPaper(c.Request.Context(), paperID, opts)
	if err != nil {
		utils.Error(c, 4018, "Failed to get recommendations: "+err.Error())
		return
	}

	utils.Success(c, result)
}

// RecommendationRequestBody represents POST body for recommendations
type RecommendationRequestBody struct {
	PositivePaperIDs []string `json:"positivePaperIds" binding:"required"`
	NegativePaperIDs []string `json:"negativePaperIds"`
	Fields           []string `json:"fields"`
	Limit            int      `json:"limit"`
}

// GetRecommendations handles paper recommendations based on positive/negative papers
// POST /api/v1/scholar/recommendations/papers
func (h *Handler) GetRecommendations(c *gin.Context) {
	var req RecommendationRequestBody
	if !utils.BindJSON(c, &req) {
		return
	}

	opts := RecommendationsOptions{
		PositivePaperIDs: req.PositivePaperIDs,
		NegativePaperIDs: req.NegativePaperIDs,
		Fields:           req.Fields,
		Limit:            clampLimit(req.Limit),
	}

	result, err := h.manager.GetRecommendations(c.Request.Context(), opts)
	if err != nil {
		utils.Error(c, 4020, "Failed to get recommendations: "+err.Error())
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
		utils.Error(c, 4021, "paperIds is required")
		return
	}

	result, err := h.manager.GetPaperBatch(c.Request.Context(), ids, req.Fields)
	if err != nil {
		utils.Error(c, 4022, "Failed to get batch papers: "+err.Error())
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
		utils.Error(c, 4023, "Query parameter is required")
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
		utils.Error(c, 4024, "Failed to get search suggestions: "+err.Error())
		return
	}

	utils.Success(c, result)
}

// PaperAutocomplete handles paper autocomplete requests
// GET /api/v1/public/papers/autocomplete
func (h *Handler) PaperAutocomplete(c *gin.Context) {
	query := c.Query("query")
	if query == "" {
		utils.Error(c, 4025, "Query parameter is required")
		return
	}
	if len(query) > 100 {
		query = query[:100]
	}

	source := c.Query("source") // stc or olx
	result, err := h.manager.PaperAutocomplete(c.Request.Context(), query, source)
	if err != nil {
		utils.Error(c, 4026, "Failed to get paper autocomplete: "+err.Error())
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
		utils.Error(c, 4030, "Failed to search journals: "+err.Error())
		return
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
		utils.Error(c, 4031, "Failed to list journals: "+err.Error())
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
		utils.Error(c, 4032, "Failed to get journal: "+err.Error())
		return
	}

	utils.Success(c, result)
}

// GetJournalFilters returns available filter options
// POST /api/v1/scholar/journals/filters
func (h *Handler) GetJournalFilters(c *gin.Context) {
	result, err := h.manager.GetJournalFilters(c.Request.Context())
	if err != nil {
		utils.Error(c, 4033, "Failed to get journal filters: "+err.Error())
		return
	}

	utils.Success(c, result)
}

// GetJournalStats returns journal statistics
// POST /api/v1/scholar/journals/stats
func (h *Handler) GetJournalStats(c *gin.Context) {
	result, err := h.manager.GetJournalStats(c.Request.Context())
	if err != nil {
		utils.Error(c, 4034, "Failed to get journal stats: "+err.Error())
		return
	}

	utils.Success(c, result)
}

// GetJournalByISSN retrieves journal by ISSN
// POST /api/v1/scholar/journals/byIssn
func (h *Handler) GetJournalByISSN(c *gin.Context) {
	var req struct {
		ISSN string `json:"issn" binding:"required"`
		Full string `json:"full"`
	}
	if !utils.BindJSON(c, &req) {
		return
	}

	result, err := h.manager.GetJournalByISSN(c.Request.Context(), req.ISSN, req.Full)
	if err != nil {
		utils.Error(c, 4035, "Failed to get journal by ISSN: "+err.Error())
		return
	}

	utils.Success(c, result)
}

// CompareJournals compares multiple journals
// POST /api/v1/scholar/journals/compare
func (h *Handler) CompareJournals(c *gin.Context) {
	var req struct {
		IDs string `json:"ids" binding:"required"`
	}
	if !utils.BindJSON(c, &req) {
		return
	}

	result, err := h.manager.CompareJournals(c.Request.Context(), req.IDs)
	if err != nil {
		utils.Error(c, 4036, "Failed to compare journals: "+err.Error())
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
