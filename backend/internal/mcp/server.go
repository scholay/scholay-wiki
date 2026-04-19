// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package mcp

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"scholar-backend/internal/semanticscholar"
)

// MCPServer represents an MCP server for Semantic Scholar API
type MCPServer struct {
	manager *semanticscholar.Manager
}

// NewMCPServer creates a new MCP server with Manager
func NewMCPServer(manager *semanticscholar.Manager) *MCPServer {
	return &MCPServer{
		manager: manager,
	}
}

// Tool represents an MCP tool
type Tool struct {
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	InputSchema map[string]any `json:"inputSchema"`
}

// ToolRequest represents an MCP tool call request
type ToolRequest struct {
	Name      string                 `json:"name"`
	Arguments map[string]any `json:"arguments"`
}

// ToolResponse represents an MCP tool call response
type ToolResponse struct {
	Content []map[string]any `json:"content"`
}


// CallTool executes an MCP tool call
func (s *MCPServer) CallTool(ctx context.Context, req ToolRequest) (*ToolResponse, error) {
	switch req.Name {
	case "search_papers":
		return s.handleSearchPapers(ctx, req.Arguments)
	case "search_papers_advanced":
		return s.handleSearchPapersAdvanced(ctx, req.Arguments)
	case "search_papers_relevance":
		return s.handleSearchPapersRelevance(ctx, req.Arguments)
	case "get_paper":
		return s.handleGetPaper(ctx, req.Arguments)
	case "get_paper_citations":
		return s.handleGetPaperCitations(ctx, req.Arguments)
	case "get_paper_references":
		return s.handleGetPaperReferences(ctx, req.Arguments)
	case "search_authors":
		return s.handleSearchAuthors(ctx, req.Arguments)
	case "get_author":
		return s.handleGetAuthor(ctx, req.Arguments)
	case "get_author_papers":
		return s.handleGetAuthorPapers(ctx, req.Arguments)
	case "get_recommendations":
		return s.handleGetRecommendations(ctx, req.Arguments)
	case "snippet_search":
		return s.handleSnippetSearch(ctx, req.Arguments)
	case "paper_title_match":
		return s.handlePaperTitleMatch(ctx, req.Arguments)
	case "recommendations_by_examples":
		return s.handleRecommendationsByExamples(ctx, req.Arguments)
	case "paper_autocomplete":
		return s.handlePaperAutocomplete(ctx, req.Arguments)
	default:
		return nil, fmt.Errorf("unknown tool: %s", req.Name)
	}
}

func (s *MCPServer) handleSearchPapers(ctx context.Context, args map[string]any) (*ToolResponse, error) {
	query, ok := args["query"].(string)
	if !ok {
		return nil, fmt.Errorf("query is required")
	}

	// Default fields to return for complete paper information
	defaultFields := []string{
		"paperId", "title", "abstract", "year", "authors",
		"citationCount", "venue", "publicationDate", "url",
		"referenceCount", "fieldsOfStudy", "externalIds", "tldr",
	}

	opts := semanticscholar.PaperSearchOptions{
		Query:  query,
		Limit:  getIntArg(args, "limit", 40),
		Offset: getIntArg(args, "offset", 0),
		Fields: defaultFields,
	}

	if year, ok := args["year"].(string); ok {
		opts.Year = year
	}
	if fields, ok := args["fieldsOfStudy"].([]any); ok {
		opts.FieldsOfStudy = interfaceSliceToStringSlice(fields)
	}

	// Use manager which will automatically get API key from backend config
	result, err := s.manager.SearchPapers(ctx, opts)
	if err != nil {
		return nil, err
	}

	return createJSONResponse(result)
}

func (s *MCPServer) handleSearchPapersAdvanced(ctx context.Context, args map[string]any) (*ToolResponse, error) {
	// Get keywords array
	keywords, ok := args["keywords"].([]any)
	if !ok || len(keywords) == 0 {
		return nil, fmt.Errorf("keywords array is required")
	}

	slog.Debug("search_papers_advanced called", "keywords", keywords)

	// Get parameters with defaults
	yearFrom := getStringArg(args, "year_from", "2020")
	yearTo := getStringArg(args, "year_to", "2024")
	minCitations := getIntArg(args, "min_citations", 10)
	sortBy := getStringArg(args, "sort_by", "citationCount:desc")
	limit := getIntArg(args, "limit", 50)
	token := getStringArg(args, "token", "") // 分页token

	slog.Debug("search_papers_advanced params",
		"yearFrom", yearFrom, "yearTo", yearTo,
		"minCitations", minCitations, "sortBy", sortBy,
		"limit", limit, "token", token,
	)

	// Get optional fields of study
	var fieldsOfStudy []string
	if fields, ok := args["fields_of_study"].([]any); ok {
		fieldsOfStudy = interfaceSliceToStringSlice(fields)
	}

	// Build year range
	yearRange := fmt.Sprintf("%s-%s", yearFrom, yearTo)

	// Convert keywords to query with OR operator
	keywordStrings := interfaceSliceToStringSlice(keywords)
	query := strings.Join(keywordStrings, " | ")

	slog.Debug("search_papers_advanced query built",
		"keywordStrings", keywordStrings,
		"query", query,
		"yearRange", yearRange,
	)

	// Default fields to return
	// Note: tldr is not supported in bulk search API, only in regular search
	defaultFields := []string{
		"paperId", "title", "abstract", "year", "authors",
		"citationCount", "venue", "publicationDate", "url",
		"referenceCount", "fieldsOfStudy", "externalIds",
		"openAccessPdf", "journal",
	}

	// Use bulk search for better performance and features
	opts := semanticscholar.BulkSearchOptions{
		Query:            query,
		Year:             yearRange,
		MinCitationCount: minCitations,
		Sort:             sortBy,
		FieldsOfStudy:    fieldsOfStudy,
		Fields:           defaultFields,
		Token:            token, // 传递分页token
	}

	// Use manager which will handle API key rotation
	result, err := s.manager.SearchPapersBulk(ctx, opts)
	if err != nil {
		return nil, err
	}

	// Add search parameters to response for transparency
	responseData := map[string]any{
		"data":  result.Data,
		"total": result.Total,
		"token": result.Token, // 返回下一页token
		"search_params": map[string]any{
			"keywords":      keywordStrings,
			"query":         query,
			"year_range":    yearRange,
			"min_citations": minCitations,
			"sort_by":       sortBy,
			"limit":         limit,
		},
	}

	return createJSONResponse(responseData)
}

// handleSearchPapersRelevance handles the search_papers_relevance tool call
// Uses /paper/search API which returns results sorted by relevance
func (s *MCPServer) handleSearchPapersRelevance(ctx context.Context, args map[string]any) (*ToolResponse, error) {
	query, ok := args["query"].(string)
	if !ok || query == "" {
		return nil, fmt.Errorf("query is required")
	}

	slog.Debug("search_papers_relevance called", "query", query)

	// Get parameters with defaults
	yearFrom := getStringArg(args, "year_from", "2020")
	yearTo := getStringArg(args, "year_to", "2024")
	limit := getIntArg(args, "limit", 50)
	offset := getIntArg(args, "offset", 0)

	// Build year range
	yearRange := fmt.Sprintf("%s-%s", yearFrom, yearTo)

	slog.Debug("search_papers_relevance params",
		"yearFrom", yearFrom, "yearTo", yearTo,
		"limit", limit, "offset", offset,
		"yearRange", yearRange,
	)

	// Get optional fields of study
	var fieldsOfStudy []string
	if fields, ok := args["fields_of_study"].([]any); ok {
		fieldsOfStudy = interfaceSliceToStringSlice(fields)
		slog.Debug("search_papers_relevance fields of study", "fieldsOfStudy", fieldsOfStudy)
	}

	// Default fields to return - includes tldr which is supported by /paper/search
	defaultFields := []string{
		"paperId", "title", "abstract", "year", "authors",
		"citationCount", "venue", "publicationDate", "url",
		"referenceCount", "fieldsOfStudy", "externalIds", "tldr",
		"openAccessPdf", "journal",
	}

	// Use regular search API (sorted by relevance)
	opts := semanticscholar.PaperSearchOptions{
		Query:         query,
		Year:          yearRange,
		Limit:         limit,
		Offset:        offset,
		Fields:        defaultFields,
		FieldsOfStudy: fieldsOfStudy,
	}

	slog.Debug("calling SearchPapers", "opts", opts)

	// Use manager which will handle API key rotation
	result, err := s.manager.SearchPapers(ctx, opts)
	if err != nil {
		slog.Error("SearchPapers error", "err", err)
		return nil, err
	}

	slog.Debug("SearchPapers returned", "paperCount", len(result.Data), "total", result.Total)

	// Add search parameters to response for transparency
	responseData := map[string]any{
		"data":   result.Data,
		"total":  result.Total,
		"offset": result.Offset,
		"search_params": map[string]any{
			"query":      query,
			"year_range": yearRange,
			"limit":      limit,
			"offset":     offset,
		},
	}

	slog.Debug("search_papers_relevance completed")

	return createJSONResponse(responseData)
}

func (s *MCPServer) handleGetPaper(ctx context.Context, args map[string]any) (*ToolResponse, error) {
	paperID, ok := args["paperId"].(string)
	if !ok {
		return nil, fmt.Errorf("paperId is required")
	}

	opts := semanticscholar.PaperDetailsOptions{}
	if fields, ok := args["fields"].([]any); ok {
		opts.Fields = interfaceSliceToStringSlice(fields)
	}

	result, err := s.manager.GetPaper(ctx, paperID, opts)
	if err != nil {
		return nil, err
	}

	return createJSONResponse(result)
}

func (s *MCPServer) handleGetPaperCitations(ctx context.Context, args map[string]any) (*ToolResponse, error) {
	paperID, ok := args["paperId"].(string)
	if !ok {
		return nil, fmt.Errorf("paperId is required")
	}

	opts := semanticscholar.CitationsOptions{
		Limit:  getIntArg(args, "limit", 100),
		Offset: getIntArg(args, "offset", 0),
	}

	result, err := s.manager.GetPaperCitations(ctx, paperID, opts)
	if err != nil {
		return nil, err
	}

	return createJSONResponse(result)
}

func (s *MCPServer) handleGetPaperReferences(ctx context.Context, args map[string]any) (*ToolResponse, error) {
	paperID, ok := args["paperId"].(string)
	if !ok {
		return nil, fmt.Errorf("paperId is required")
	}

	opts := semanticscholar.CitationsOptions{
		Limit:  getIntArg(args, "limit", 100),
		Offset: getIntArg(args, "offset", 0),
	}

	result, err := s.manager.GetPaperReferences(ctx, paperID, opts)
	if err != nil {
		return nil, err
	}

	return createJSONResponse(result)
}

func (s *MCPServer) handleSearchAuthors(ctx context.Context, args map[string]any) (*ToolResponse, error) {
	query, ok := args["query"].(string)
	if !ok {
		return nil, fmt.Errorf("query is required")
	}

	opts := semanticscholar.AuthorSearchOptions{
		Query:  query,
		Limit:  getIntArg(args, "limit", 10),
		Offset: getIntArg(args, "offset", 0),
	}

	result, err := s.manager.SearchAuthors(ctx, opts)
	if err != nil {
		return nil, err
	}

	return createJSONResponse(result)
}

func (s *MCPServer) handleGetAuthor(ctx context.Context, args map[string]any) (*ToolResponse, error) {
	authorID, ok := args["authorId"].(string)
	if !ok {
		return nil, fmt.Errorf("authorId is required")
	}

	var fields []string
	if f, ok := args["fields"].([]any); ok {
		fields = interfaceSliceToStringSlice(f)
	}

	result, err := s.manager.GetAuthor(ctx, authorID, fields)
	if err != nil {
		return nil, err
	}

	return createJSONResponse(result)
}

func (s *MCPServer) handleGetAuthorPapers(ctx context.Context, args map[string]any) (*ToolResponse, error) {
	authorID, ok := args["authorId"].(string)
	if !ok {
		return nil, fmt.Errorf("authorId is required")
	}

	limit := getIntArg(args, "limit", 100)
	offset := getIntArg(args, "offset", 0)

	result, err := s.manager.GetAuthorPapers(ctx, authorID, nil, offset, limit)
	if err != nil {
		return nil, err
	}

	return createJSONResponse(result)
}

func (s *MCPServer) handleGetRecommendations(ctx context.Context, args map[string]any) (*ToolResponse, error) {
	paperID, ok := args["paperId"].(string)
	if !ok {
		return nil, fmt.Errorf("paperId is required")
	}

	opts := semanticscholar.RecommendationsOptions{
		Limit: getIntArg(args, "limit", 10),
	}

	result, err := s.manager.GetRecommendationsForPaper(ctx, paperID, opts)
	if err != nil {
		return nil, err
	}

	return createJSONResponse(result)
}

func (s *MCPServer) handleSnippetSearch(ctx context.Context, args map[string]any) (*ToolResponse, error) {
	query, ok := args["query"].(string)
	if !ok {
		return nil, fmt.Errorf("query is required")
	}

	// Default fields to return
	defaultFields := []string{
		"paperId", "title", "abstract", "year", "authors",
		"citationCount", "venue", "publicationDate", "url",
		"referenceCount", "fieldsOfStudy", "externalIds", "tldr",
	}

	opts := semanticscholar.SnippetSearchOptions{
		Query:            query,
		Limit:            getIntArg(args, "limit", 20),
		MinCitationCount: getIntArg(args, "minCitationCount", 0),
		Fields:           defaultFields,
	}

	if year, ok := args["year"].(string); ok {
		opts.Year = year
	}
	if fields, ok := args["fieldsOfStudy"].([]any); ok {
		opts.FieldsOfStudy = interfaceSliceToStringSlice(fields)
	}

	slog.Debug("snippet_search called", "query", query)

	result, err := s.manager.SnippetSearch(ctx, opts)
	if err != nil {
		return nil, err
	}

	return createJSONResponse(result)
}

func (s *MCPServer) handlePaperTitleMatch(ctx context.Context, args map[string]any) (*ToolResponse, error) {
	query, ok := args["query"].(string)
	if !ok {
		return nil, fmt.Errorf("query (paper title) is required")
	}

	// Default fields to return
	defaultFields := []string{
		"paperId", "title", "abstract", "year", "authors",
		"citationCount", "venue", "publicationDate", "url",
		"referenceCount", "fieldsOfStudy", "externalIds", "tldr",
	}

	opts := semanticscholar.TitleMatchOptions{
		Query:  query,
		Fields: defaultFields,
	}

	if year, ok := args["year"].(string); ok {
		opts.Year = year
	}
	if fields, ok := args["fieldsOfStudy"].([]any); ok {
		opts.FieldsOfStudy = interfaceSliceToStringSlice(fields)
	}

	slog.Debug("paper_title_match called", "title", query)

	result, err := s.manager.PaperTitleMatch(ctx, opts)
	if err != nil {
		return nil, err
	}

	return createJSONResponse(result)
}

func (s *MCPServer) handleRecommendationsByExamples(ctx context.Context, args map[string]any) (*ToolResponse, error) {
	positivePaperIds, ok := args["positivePaperIds"].([]any)
	if !ok || len(positivePaperIds) == 0 {
		return nil, fmt.Errorf("positivePaperIds is required and must not be empty")
	}

	opts := semanticscholar.RecommendationsOptions{
		PositivePaperIDs: interfaceSliceToStringSlice(positivePaperIds),
		Limit:            getIntArg(args, "limit", 20),
	}

	if negativePaperIds, ok := args["negativePaperIds"].([]any); ok {
		opts.NegativePaperIDs = interfaceSliceToStringSlice(negativePaperIds)
	}

	slog.Debug("recommendations_by_examples called",
		"positiveCount", len(opts.PositivePaperIDs),
		"negativeCount", len(opts.NegativePaperIDs),
	)

	result, err := s.manager.GetRecommendations(ctx, opts)
	if err != nil {
		return nil, err
	}

	return createJSONResponse(result)
}

func (s *MCPServer) handlePaperAutocomplete(ctx context.Context, args map[string]any) (*ToolResponse, error) {
	query, ok := args["query"].(string)
	if !ok {
		return nil, fmt.Errorf("query is required")
	}

	// Truncate to 100 characters as per API spec
	if len(query) > 100 {
		query = query[:100]
	}

	slog.Debug("paper_autocomplete called", "query", query)

	result, err := s.manager.PaperAutocomplete(ctx, query)
	if err != nil {
		return nil, err
	}

	return createJSONResponse(result)
}

