// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package semanticscholar

import (
	"context"
	"log/slog"
	"scholar-backend/internal/common/utils"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

// SearchSuggester 定义搜索建议接口（避免循环依赖）
type SearchSuggester interface {
	GetSearchSuggestions(ctx context.Context, query string) ([]string, error)
}

// Handler handles HTTP requests for Semantic Scholar API
type Handler struct {
	manager   *Manager
	suggester SearchSuggester
}

// NewHandler creates a new Semantic Scholar handler with key rotation
func NewHandler(manager *Manager, suggester SearchSuggester) *Handler {
	return &Handler{
		manager:   manager,
		suggester: suggester,
	}
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
	MinCitationCount  int      `json:"minCitationCount"`            // 最小引用次数筛选
	EnableTranslation *bool    `json:"enableTranslation,omitempty"` // 是否启用AI翻译，nil表示默认true，false表示禁用
}

// SearchPapersResponse 定义学术检索的响应结构
type SearchPapersResponse struct {
	Data              any `json:"data"`              // 原始搜索结果
	OriginalQuery     string      `json:"originalQuery"`     // 用户原始输入
	SearchSuggestions []string    `json:"searchSuggestions"` // AI生成的搜索建议（最多3个）
	ActualQuery       string      `json:"actualQuery"`       // 实际使用的查询
	HasSuggestions    bool        `json:"hasSuggestions"`    // 是否有搜索建议
	SearchStrategy    string      `json:"searchStrategy"`    // 搜索策略: original
}

// SearchPapers handles paper search requests (学术检索)
// POST /api/v1/scholar/papers/search
// 搜索策略优化：
// 1. 先用组合查询（原始词 + 翻译词）搜索
// 2. 如果组合查询没有结果，用原始词搜索
// 3. 如果原始词也没有结果，用翻译词搜索
func (h *Handler) SearchPapers(c *gin.Context) {
	var req SearchPapersRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	// 验证查询字符长度限制（最多500字符）
	if len(req.Query) > 500 {
		utils.Error(c, 4001, "Query exceeds 500 characters limit")
		return
	}

	if req.Query == "" {
		utils.Error(c, 4001, "请输入搜索词")
		return
	}

	// 使用AI获取搜索建议（使用low级别模型）
	// 检查请求中的 enableTranslation 参数
	// nil 表示未设置，默认启用建议
	// false 表示显式禁用建议（用户点击了某个建议进行搜索）
	enableSuggestions := true
	if req.EnableTranslation != nil && !*req.EnableTranslation {
		enableSuggestions = false
		slog.Info("suggestions explicitly disabled by request")
	}

	// 分页请求时不重新获取建议，避免结果不一致
	if req.Offset > 0 {
		enableSuggestions = false
	}

	var searchSuggestions []string
	if enableSuggestions && h.suggester != nil {
		suggestions, err := h.suggester.GetSearchSuggestions(c.Request.Context(), req.Query)
		if err != nil {
			slog.Warn("failed to get search suggestions with AI", "err", err)
		} else {
			searchSuggestions = suggestions
			slog.Info("search suggestions generated", "query", req.Query, "suggestions", searchSuggestions)
		}
	}

	// 处理年份范围参数
	year := req.Year
	if year == "" && (req.YearFrom != "" || req.YearTo != "") {
		if req.YearFrom != "" && req.YearTo != "" {
			year = req.YearFrom + "-" + req.YearTo
		} else if req.YearFrom != "" {
			year = req.YearFrom + "-"
		} else if req.YearTo != "" {
			year = "-" + req.YearTo
		}
	}

	// 构建基础搜索选项
	baseOpts := PaperSearchOptions{
		Year:             year,
		Offset:           req.Offset,
		Limit:            req.Limit,
		Fields:           req.Fields,
		PublicationTypes: req.PublicationTypes,
		Venue:            req.Venue,
		FieldsOfStudy:    req.FieldsOfStudy,
		OpenAccessPDF:    req.OpenAccessPdf,
		MinCitationCount: req.MinCitationCount,
	}

	// 设置默认limit
	if baseOpts.Limit == 0 {
		baseOpts.Limit = 10
	}

	// 简化搜索策略：始终使用原始查询搜索，建议仅供用户参考
	hasSuggestions := len(searchSuggestions) > 0

	// 始终使用原始查询进行搜索
	opts := baseOpts
	opts.Query = req.Query
	if hasSuggestions {
		slog.Info("using original query", "query", req.Query, "suggestions", searchSuggestions)
	} else {
		slog.Info("using original query", "query", req.Query)
	}

	result, err := h.manager.SearchPapers(c.Request.Context(), opts)
	if err != nil {
		utils.Error(c, 4002, "搜索论文失败,请稍后重试")
		return
	}

	slog.Info("search completed", "totalResults", result.Total)

	// 构建响应，包含查询信息
	// searchSuggestions 作为联想建议返回，用户可点击搜索
	response := SearchPapersResponse{
		Data:              result,
		OriginalQuery:     req.Query,
		SearchSuggestions: searchSuggestions, // 联想搜索建议（如有）
		ActualQuery:       req.Query,         // 始终是原始查询
		HasSuggestions:    hasSuggestions,    // 是否有搜索建议
		SearchStrategy:    "original",        // 始终使用原始查询策略
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

	// Parse options
	opts := PaperDetailsOptions{}
	if fields := c.Query("fields"); fields != "" {
		opts.Fields = strings.Split(fields, ",")
	}

	// Call API
	result, err := h.manager.GetPaper(c.Request.Context(), paperID, opts)
	if err != nil {
		utils.Error(c, 4004, "加载论文详情失败,请稍后重试")
		return
	}

	utils.Success(c, result)
}

// GetPaperCitations handles get paper citations requests
// GET /api/v1/scholar/papers/:paperId/citations
func (h *Handler) GetPaperCitations(c *gin.Context) {
	paperID := c.Param("paperId")
	if paperID == "" {
		utils.Error(c, 4005, "请提供论文 ID")
		return
	}

	// Parse options
	opts := CitationsOptions{
		Offset: parseIntQuery(c, "offset", 0),
		Limit:  parseIntQuery(c, "limit", 100),
	}
	if fields := c.Query("fields"); fields != "" {
		opts.Fields = strings.Split(fields, ",")
	}

	// Call API
	result, err := h.manager.GetPaperCitations(c.Request.Context(), paperID, opts)
	if err != nil {
		utils.Error(c, 4006, "加载引用信息失败,请稍后重试")
		return
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

	// Parse options
	opts := CitationsOptions{
		Offset: parseIntQuery(c, "offset", 0),
		Limit:  parseIntQuery(c, "limit", 100),
	}
	if fields := c.Query("fields"); fields != "" {
		opts.Fields = strings.Split(fields, ",")
	}

	// Call API
	result, err := h.manager.GetPaperReferences(c.Request.Context(), paperID, opts)
	if err != nil {
		utils.Error(c, 4008, "加载参考文献失败,请稍后重试")
		return
	}

	utils.Success(c, result)
}

// GetPaperAuthors handles get paper authors requests
// GET /api/v1/scholar/papers/:paperId/authors
func (h *Handler) GetPaperAuthors(c *gin.Context) {
	paperID := c.Param("paperId")
	if paperID == "" {
		utils.Error(c, 4009, "请提供论文 ID")
		return
	}

	// Parse options
	offset := parseIntQuery(c, "offset", 0)
	limit := parseIntQuery(c, "limit", 100)
	var fields []string
	if f := c.Query("fields"); f != "" {
		fields = strings.Split(f, ",")
	}

	// Call API
	result, err := h.manager.GetPaperAuthors(c.Request.Context(), paperID, fields, offset, limit)
	if err != nil {
		utils.Error(c, 4010, "加载作者信息失败,请稍后重试")
		return
	}

	utils.Success(c, result)
}

// SearchAuthors handles author search requests
// GET /api/v1/scholar/authors/search
func (h *Handler) SearchAuthors(c *gin.Context) {
	query := c.Query("query")
	if query == "" {
		utils.Error(c, 4011, "请输入搜索词")
		return
	}

	// Parse options
	opts := AuthorSearchOptions{
		Query:  query,
		Offset: parseIntQuery(c, "offset", 0),
		Limit:  parseIntQuery(c, "limit", 10),
	}
	if fields := c.Query("fields"); fields != "" {
		opts.Fields = strings.Split(fields, ",")
	}

	// Call API
	result, err := h.manager.SearchAuthors(c.Request.Context(), opts)
	if err != nil {
		utils.Error(c, 4012, "搜索作者失败,请稍后重试")
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

	// Parse options
	var fields []string
	if f := c.Query("fields"); f != "" {
		fields = strings.Split(f, ",")
	}

	// Call API
	result, err := h.manager.GetAuthor(c.Request.Context(), authorID, fields)
	if err != nil {
		utils.Error(c, 4014, "加载作者详情失败,请稍后重试")
		return
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

	// Parse options
	offset := parseIntQuery(c, "offset", 0)
	limit := parseIntQuery(c, "limit", 100)
	var fields []string
	if f := c.Query("fields"); f != "" {
		fields = strings.Split(f, ",")
	}

	// Call API
	result, err := h.manager.GetAuthorPapers(c.Request.Context(), authorID, fields, offset, limit)
	if err != nil {
		utils.Error(c, 4016, "加载作者论文列表失败,请稍后重试")
		return
	}

	utils.Success(c, result)
}

// GetRecommendationsForPaper handles paper recommendations requests
// GET /api/v1/scholar/recommendations/papers/:paperId
func (h *Handler) GetRecommendationsForPaper(c *gin.Context) {
	paperID := c.Param("paperId")
	if paperID == "" {
		utils.Error(c, 4017, "请提供论文 ID")
		return
	}

	// Parse options
	opts := RecommendationsOptions{
		Limit: parseIntQuery(c, "limit", 10),
	}
	if fields := c.Query("fields"); fields != "" {
		opts.Fields = strings.Split(fields, ",")
	}

	// Call API
	result, err := h.manager.GetRecommendationsForPaper(c.Request.Context(), paperID, opts)
	if err != nil {
		utils.Error(c, 4018, "加载推荐论文失败,请稍后重试")
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

	// Build options
	opts := RecommendationsOptions{
		PositivePaperIDs: req.PositivePaperIDs,
		NegativePaperIDs: req.NegativePaperIDs,
		Fields:           req.Fields,
		Limit:            req.Limit,
	}

	// Call API
	result, err := h.manager.GetRecommendations(c.Request.Context(), opts)
	if err != nil {
		utils.Error(c, 4020, "加载推荐论文失败,请稍后重试")
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

	// Call API
	result, err := h.manager.GetPaperBatch(c.Request.Context(), req.PaperIDs, req.Fields)
	if err != nil {
		utils.Error(c, 4022, "Failed to get batch papers: "+err.Error())
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

// GetSearchSuggestions handles search suggestions requests (paper autocomplete + author search)
// GET /api/v1/public/search/suggestions?query=xxx&paperLimit=5&authorLimit=5
func (h *Handler) GetSearchSuggestions(c *gin.Context) {
	query := c.Query("query")
	if query == "" {
		utils.Error(c, 4023, "请输入搜索词")
		return
	}

	// Validate query length (max 100 characters as per Semantic Scholar API)
	if len(query) > 100 {
		query = query[:100]
	}

	// Parse optional limits
	paperLimit := parseIntQuery(c, "paperLimit", 5)
	authorLimit := parseIntQuery(c, "authorLimit", 5)

	// Enforce reasonable limits
	if paperLimit > 10 {
		paperLimit = 10
	}
	if authorLimit > 10 {
		authorLimit = 10
	}

	// Call manager to get combined suggestions
	result, err := h.manager.GetSearchSuggestions(c.Request.Context(), query, paperLimit, authorLimit)
	if err != nil {
		utils.Error(c, 4024, "Failed to get search suggestions: "+err.Error())
		return
	}

	utils.Success(c, result)
}

// PaperAutocomplete handles paper autocomplete requests
// GET /api/v1/public/papers/autocomplete?query=xxx
func (h *Handler) PaperAutocomplete(c *gin.Context) {
	query := c.Query("query")
	if query == "" {
		utils.Error(c, 4025, "请输入搜索词")
		return
	}

	// Validate query length (max 100 characters as per Semantic Scholar API)
	if len(query) > 100 {
		query = query[:100]
	}

	// Call manager to get paper autocomplete
	result, err := h.manager.PaperAutocomplete(c.Request.Context(), query)
	if err != nil {
		utils.Error(c, 4026, "Failed to get paper autocomplete: "+err.Error())
		return
	}

	utils.Success(c, result)
}
