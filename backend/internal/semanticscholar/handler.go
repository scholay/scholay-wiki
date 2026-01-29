// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package semanticscholar

import (
	"fmt"
	"scholar-backend/internal/common/utils"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

// SearchSuggester 定义搜索建议接口（避免循环依赖）
type SearchSuggester interface {
	GetSearchSuggestions(query string) ([]string, error)
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
	Data              interface{} `json:"data"`              // 原始搜索结果
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
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 4001, "Invalid request: "+err.Error())
		return
	}

	// 验证查询字符长度限制（最多500字符）
	if len(req.Query) > 500 {
		utils.Error(c, 4001, "Query exceeds 500 characters limit")
		return
	}

	if req.Query == "" {
		utils.Error(c, 4001, "Query parameter is required")
		return
	}

	// 使用AI获取搜索建议（使用low级别模型）
	// 检查请求中的 enableTranslation 参数
	// nil 表示未设置，默认启用建议
	// false 表示显式禁用建议（用户点击了某个建议进行搜索）
	enableSuggestions := true
	if req.EnableTranslation != nil && !*req.EnableTranslation {
		enableSuggestions = false
		fmt.Printf("[INFO] Suggestions explicitly disabled by request\n")
	}

	// 分页请求时不重新获取建议，避免结果不一致
	if req.Offset > 0 {
		enableSuggestions = false
	}

	var searchSuggestions []string
	if enableSuggestions && h.suggester != nil {
		suggestions, err := h.suggester.GetSearchSuggestions(req.Query)
		if err != nil {
			fmt.Printf("[WARN] Failed to get search suggestions with AI: %v\n", err)
		} else {
			searchSuggestions = suggestions
			fmt.Printf("[INFO] Search suggestions for '%s': %v\n", req.Query, searchSuggestions)
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
		fmt.Printf("[INFO] Using original query: %s (suggestions: %v)\n", req.Query, searchSuggestions)
	} else {
		fmt.Printf("[INFO] Using original query: %s\n", req.Query)
	}

	result, err := h.manager.SearchPapers(opts)
	if err != nil {
		utils.Error(c, 4002, "Failed to search papers: "+err.Error())
		return
	}

	fmt.Printf("[INFO] Search completed, found %d results\n", result.Total)

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
		utils.Error(c, 4003, "Paper ID is required")
		return
	}

	// Parse options
	opts := PaperDetailsOptions{}
	if fields := c.Query("fields"); fields != "" {
		opts.Fields = strings.Split(fields, ",")
	}

	// Call API
	result, err := h.manager.GetPaper(paperID, opts)
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

	// Parse options
	opts := CitationsOptions{
		Offset: parseIntQuery(c, "offset", 0),
		Limit:  parseIntQuery(c, "limit", 100),
	}
	if fields := c.Query("fields"); fields != "" {
		opts.Fields = strings.Split(fields, ",")
	}

	// Call API
	result, err := h.manager.GetPaperCitations(paperID, opts)
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

	// Parse options
	opts := CitationsOptions{
		Offset: parseIntQuery(c, "offset", 0),
		Limit:  parseIntQuery(c, "limit", 100),
	}
	if fields := c.Query("fields"); fields != "" {
		opts.Fields = strings.Split(fields, ",")
	}

	// Call API
	result, err := h.manager.GetPaperReferences(paperID, opts)
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

	// Parse options
	offset := parseIntQuery(c, "offset", 0)
	limit := parseIntQuery(c, "limit", 100)
	var fields []string
	if f := c.Query("fields"); f != "" {
		fields = strings.Split(f, ",")
	}

	// Call API
	result, err := h.manager.GetPaperAuthors(paperID, fields, offset, limit)
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
	result, err := h.manager.SearchAuthors(opts)
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

	// Parse options
	var fields []string
	if f := c.Query("fields"); f != "" {
		fields = strings.Split(f, ",")
	}

	// Call API
	result, err := h.manager.GetAuthor(authorID, fields)
	if err != nil {
		utils.Error(c, 4014, "Failed to get author: "+err.Error())
		return
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

	// Parse options
	offset := parseIntQuery(c, "offset", 0)
	limit := parseIntQuery(c, "limit", 100)
	var fields []string
	if f := c.Query("fields"); f != "" {
		fields = strings.Split(f, ",")
	}

	// Call API
	result, err := h.manager.GetAuthorPapers(authorID, fields, offset, limit)
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

	// Parse options
	opts := RecommendationsOptions{
		Limit: parseIntQuery(c, "limit", 10),
	}
	if fields := c.Query("fields"); fields != "" {
		opts.Fields = strings.Split(fields, ",")
	}

	// Call API
	result, err := h.manager.GetRecommendationsForPaper(paperID, opts)
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
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 4019, "Invalid request body: "+err.Error())
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
	result, err := h.manager.GetRecommendations(opts)
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
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 4021, "Invalid request body: "+err.Error())
		return
	}

	// Call API
	result, err := h.manager.GetPaperBatch(req.PaperIDs, req.Fields)
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
		utils.Error(c, 4023, "Query parameter is required")
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
	result, err := h.manager.GetSearchSuggestions(query, paperLimit, authorLimit)
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
		utils.Error(c, 4025, "Query parameter is required")
		return
	}

	// Validate query length (max 100 characters as per Semantic Scholar API)
	if len(query) > 100 {
		query = query[:100]
	}

	// Call manager to get paper autocomplete
	result, err := h.manager.PaperAutocomplete(query)
	if err != nil {
		utils.Error(c, 4026, "Failed to get paper autocomplete: "+err.Error())
		return
	}

	utils.Success(c, result)
}
