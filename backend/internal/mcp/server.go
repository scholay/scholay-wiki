// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package mcp

import (
	"context"
	"encoding/json"
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

// ListTools returns available MCP tools
func (s *MCPServer) ListTools() []Tool {
	return []Tool{
		{
			Name:        "search_papers",
			Description: "Search for academic papers by query",
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"query": map[string]any{
						"type":        "string",
						"description": "Search query string",
					},
					"year": map[string]any{
						"type":        "string",
						"description": "Publication year or range (e.g., '2020' or '2019-2021')",
					},
					"fieldsOfStudy": map[string]any{
						"type":        "array",
						"items":       map[string]string{"type": "string"},
						"description": "Fields of study filter",
					},
					"limit": map[string]any{
						"type":        "number",
						"description": "Number of results to return (max 100)",
						"default":     10,
					},
					"offset": map[string]any{
						"type":        "number",
						"description": "Pagination offset",
						"default":     0,
					},
				},
				"required": []string{"query"},
			},
		},
		{
			Name:        "search_papers_advanced",
			Description: "Advanced paper search with multiple keywords (OR operation), quality filters, and sorting",
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"keywords": map[string]any{
						"type":        "array",
						"items":       map[string]string{"type": "string"},
						"description": "Multiple keywords to search (combined with OR operator)",
					},
					"year_from": map[string]any{
						"type":        "string",
						"description": "Start year (e.g., '2020')",
						"default":     "2020",
					},
					"year_to": map[string]any{
						"type":        "string",
						"description": "End year (e.g., '2024')",
						"default":     "2024",
					},
					"min_citations": map[string]any{
						"type":        "number",
						"description": "Minimum citation count for quality filtering",
						"default":     10,
					},
					"sort_by": map[string]any{
						"type":        "string",
						"enum":        []string{"citationCount:desc", "publicationDate:desc", "paperId"},
						"description": "Sort order for results",
						"default":     "citationCount:desc",
					},
					"fields_of_study": map[string]any{
						"type":        "array",
						"items":       map[string]string{"type": "string"},
						"description": "Fields of study filter (e.g., ['Computer Science', 'Medicine'])",
					},
					"limit": map[string]any{
						"type":        "number",
						"description": "Number of results to return (max 100)",
						"default":     50,
					},
					"token": map[string]any{
						"type":        "string",
						"description": "Pagination token for fetching next page of results",
					},
				},
				"required": []string{"keywords"},
			},
		},
		{
			Name:        "search_papers_relevance",
			Description: "Search papers by semantic relevance using natural language query. Best for finding conceptually related papers that may not have high citations yet.",
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"query": map[string]any{
						"type":        "string",
						"description": "Natural language search query in English academic terms (e.g., 'mitigating hallucination in large language models')",
					},
					"year_from": map[string]any{
						"type":        "string",
						"description": "Start year (e.g., '2020')",
						"default":     "2020",
					},
					"year_to": map[string]any{
						"type":        "string",
						"description": "End year (e.g., '2024')",
						"default":     "2024",
					},
					"fields_of_study": map[string]any{
						"type":        "array",
						"items":       map[string]string{"type": "string"},
						"description": "Fields of study filter (e.g., ['Computer Science', 'Medicine'])",
					},
					"limit": map[string]any{
						"type":        "number",
						"description": "Number of results to return (max 100)",
						"default":     50,
					},
					"offset": map[string]any{
						"type":        "number",
						"description": "Pagination offset",
						"default":     0,
					},
				},
				"required": []string{"query"},
			},
		},
		{
			Name:        "get_paper",
			Description: "Get detailed information about a specific paper",
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"paperId": map[string]any{
						"type":        "string",
						"description": "Paper ID (Semantic Scholar ID, DOI, ArXiv ID, or PubMed ID)",
					},
					"fields": map[string]any{
						"type":        "array",
						"items":       map[string]string{"type": "string"},
						"description": "Fields to return (e.g., ['title', 'abstract', 'authors'])",
					},
				},
				"required": []string{"paperId"},
			},
		},
		{
			Name:        "get_paper_citations",
			Description: "Get citations for a specific paper",
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"paperId": map[string]any{
						"type":        "string",
						"description": "Paper ID",
					},
					"limit": map[string]any{
						"type":        "number",
						"description": "Number of citations to return",
						"default":     100,
					},
					"offset": map[string]any{
						"type":        "number",
						"description": "Pagination offset",
						"default":     0,
					},
				},
				"required": []string{"paperId"},
			},
		},
		{
			Name:        "get_paper_references",
			Description: "Get references for a specific paper",
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"paperId": map[string]any{
						"type":        "string",
						"description": "Paper ID",
					},
					"limit": map[string]any{
						"type":        "number",
						"description": "Number of references to return",
						"default":     100,
					},
					"offset": map[string]any{
						"type":        "number",
						"description": "Pagination offset",
						"default":     0,
					},
				},
				"required": []string{"paperId"},
			},
		},
		{
			Name:        "search_authors",
			Description: "Search for authors by name",
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"query": map[string]any{
						"type":        "string",
						"description": "Author name search query",
					},
					"limit": map[string]any{
						"type":        "number",
						"description": "Number of results to return",
						"default":     10,
					},
					"offset": map[string]any{
						"type":        "number",
						"description": "Pagination offset",
						"default":     0,
					},
				},
				"required": []string{"query"},
			},
		},
		{
			Name:        "get_author",
			Description: "Get detailed information about a specific author",
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"authorId": map[string]any{
						"type":        "string",
						"description": "Author ID",
					},
					"fields": map[string]any{
						"type":        "array",
						"items":       map[string]string{"type": "string"},
						"description": "Fields to return",
					},
				},
				"required": []string{"authorId"},
			},
		},
		{
			Name:        "get_author_papers",
			Description: "Get papers authored by a specific author",
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"authorId": map[string]any{
						"type":        "string",
						"description": "Author ID",
					},
					"limit": map[string]any{
						"type":        "number",
						"description": "Number of papers to return",
						"default":     100,
					},
					"offset": map[string]any{
						"type":        "number",
						"description": "Pagination offset",
						"default":     0,
					},
				},
				"required": []string{"authorId"},
			},
		},
		{
			Name:        "get_recommendations",
			Description: "Get paper recommendations based on a paper",
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"paperId": map[string]any{
						"type":        "string",
						"description": "Paper ID to base recommendations on",
					},
					"limit": map[string]any{
						"type":        "number",
						"description": "Number of recommendations to return",
						"default":     10,
					},
				},
				"required": []string{"paperId"},
			},
		},
		{
			Name:        "snippet_search",
			Description: "Search papers by text snippet or quote. Use when user provides a piece of text (e.g., a paragraph, citation, or abstract fragment) and wants to find the source paper or related papers.",
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"query": map[string]any{
						"type":        "string",
						"description": "The text snippet to search for",
					},
					"year": map[string]any{
						"type":        "string",
						"description": "Publication year or range (e.g., '2020' or '2019-2021')",
					},
					"fieldsOfStudy": map[string]any{
						"type":        "array",
						"items":       map[string]string{"type": "string"},
						"description": "Fields of study filter",
					},
					"minCitationCount": map[string]any{
						"type":        "number",
						"description": "Minimum citation count filter",
						"default":     0,
					},
					"limit": map[string]any{
						"type":        "number",
						"description": "Number of results to return (max 1000)",
						"default":     20,
					},
				},
				"required": []string{"query"},
			},
		},
		{
			Name:        "paper_title_match",
			Description: "Find paper by exact title. Use when user provides a complete or near-complete paper title (e.g., 'Attention is All You Need') for precise lookup.",
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"query": map[string]any{
						"type":        "string",
						"description": "The paper title to search for",
					},
					"year": map[string]any{
						"type":        "string",
						"description": "Publication year or range (e.g., '2017' or '2015-2020')",
					},
					"fieldsOfStudy": map[string]any{
						"type":        "array",
						"items":       map[string]string{"type": "string"},
						"description": "Fields of study filter",
					},
				},
				"required": []string{"query"},
			},
		},
		{
			Name:        "recommendations_by_examples",
			Description: "Get paper recommendations based on liked and disliked papers. Use when user provides positive examples (papers they like) and optionally negative examples (papers they don't like).",
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"positivePaperIds": map[string]any{
						"type":        "array",
						"items":       map[string]string{"type": "string"},
						"description": "Paper IDs the user likes (positive examples)",
					},
					"negativePaperIds": map[string]any{
						"type":        "array",
						"items":       map[string]string{"type": "string"},
						"description": "Paper IDs the user dislikes (negative examples, optional)",
					},
					"limit": map[string]any{
						"type":        "number",
						"description": "Number of recommendations to return (max 500)",
						"default":     20,
					},
				},
				"required": []string{"positivePaperIds"},
			},
		},
		{
			Name:        "paper_autocomplete",
			Description: "Get search suggestions for partial query. Use to understand ambiguous user intent or suggest search terms.",
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"query": map[string]any{
						"type":        "string",
						"description": "Partial search query (will be truncated to 100 characters)",
					},
				},
				"required": []string{"query"},
			},
		},
	}
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

// Helper functions

func getIntArg(args map[string]any, key string, defaultValue int) int {
	if val, ok := args[key]; ok {
		switch v := val.(type) {
		case float64:
			return int(v)
		case int:
			return v
		}
	}
	return defaultValue
}

func getStringArg(args map[string]any, key string, defaultValue string) string {
	if val, ok := args[key]; ok {
		if str, ok := val.(string); ok {
			return str
		}
	}
	return defaultValue
}

func interfaceSliceToStringSlice(slice []any) []string {
	result := make([]string, 0, len(slice))
	for _, item := range slice {
		if str, ok := item.(string); ok {
			result = append(result, str)
		}
	}
	return result
}

func createJSONResponse(data any) (*ToolResponse, error) {
	jsonData, err := json.Marshal(data)
	if err != nil {
		slog.Error("failed to marshal response", "err", err)
		return nil, fmt.Errorf("failed to marshal response: %w", err)
	}

	return &ToolResponse{
		Content: []map[string]any{
			{
				"type": "text",
				"text": string(jsonData),
			},
		},
	}, nil
}
