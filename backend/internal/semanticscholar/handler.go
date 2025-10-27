package semanticscholar

import (
	"scholar-backend/internal/common/utils"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

// Handler handles HTTP requests for Semantic Scholar API
type Handler struct {
	manager *Manager
}

// NewHandler creates a new Semantic Scholar handler with key rotation
func NewHandler(manager *Manager) *Handler {
	return &Handler{
		manager: manager,
	}
}

// NewHandlerWithAPIKey creates a new handler with a fixed API key (legacy)
func NewHandlerWithAPIKey(apiKey string) *Handler {
	return &Handler{
		manager: &Manager{}, // Empty manager, will use direct client
	}
}

// SearchPapers handles paper search requests
// GET /api/v1/scholar/papers/search
func (h *Handler) SearchPapers(c *gin.Context) {
	query := c.Query("query")
	if query == "" {
		utils.Error(c, 4001, "Query parameter is required")
		return
	}

	// Parse options
	opts := PaperSearchOptions{
		Query:  query,
		Year:   c.Query("year"),
		Offset: parseIntQuery(c, "offset", 0),
		Limit:  parseIntQuery(c, "limit", 10),
	}

	// Parse string arrays
	if fields := c.Query("fields"); fields != "" {
		opts.Fields = strings.Split(fields, ",")
	}
	if pubTypes := c.Query("publicationTypes"); pubTypes != "" {
		opts.PublicationTypes = strings.Split(pubTypes, ",")
	}
	if venue := c.Query("venue"); venue != "" {
		opts.Venue = strings.Split(venue, ",")
	}
	if fieldsOfStudy := c.Query("fieldsOfStudy"); fieldsOfStudy != "" {
		opts.FieldsOfStudy = strings.Split(fieldsOfStudy, ",")
	}

	opts.OpenAccessPDF = c.Query("openAccessPdf")

	// Call API with key rotation
	result, err := h.manager.SearchPapers(opts)
	if err != nil {
		utils.Error(c, 4002, "Failed to search papers: "+err.Error())
		return
	}

	utils.Success(c, result)
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
