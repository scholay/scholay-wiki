package mcp

import (
	"encoding/json"
	"fmt"
	"log"
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
	InputSchema map[string]interface{} `json:"inputSchema"`
}

// ToolRequest represents an MCP tool call request
type ToolRequest struct {
	Name      string                 `json:"name"`
	Arguments map[string]interface{} `json:"arguments"`
}

// ToolResponse represents an MCP tool call response
type ToolResponse struct {
	Content []map[string]interface{} `json:"content"`
}

// ListTools returns available MCP tools
func (s *MCPServer) ListTools() []Tool {
	return []Tool{
		{
			Name:        "search_papers",
			Description: "Search for academic papers by query",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"query": map[string]interface{}{
						"type":        "string",
						"description": "Search query string",
					},
					"year": map[string]interface{}{
						"type":        "string",
						"description": "Publication year or range (e.g., '2020' or '2019-2021')",
					},
					"fieldsOfStudy": map[string]interface{}{
						"type":        "array",
						"items":       map[string]string{"type": "string"},
						"description": "Fields of study filter",
					},
					"limit": map[string]interface{}{
						"type":        "number",
						"description": "Number of results to return (max 100)",
						"default":     10,
					},
					"offset": map[string]interface{}{
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
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"paperId": map[string]interface{}{
						"type":        "string",
						"description": "Paper ID (Semantic Scholar ID, DOI, ArXiv ID, or PubMed ID)",
					},
					"fields": map[string]interface{}{
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
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"paperId": map[string]interface{}{
						"type":        "string",
						"description": "Paper ID",
					},
					"limit": map[string]interface{}{
						"type":        "number",
						"description": "Number of citations to return",
						"default":     100,
					},
					"offset": map[string]interface{}{
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
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"paperId": map[string]interface{}{
						"type":        "string",
						"description": "Paper ID",
					},
					"limit": map[string]interface{}{
						"type":        "number",
						"description": "Number of references to return",
						"default":     100,
					},
					"offset": map[string]interface{}{
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
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"query": map[string]interface{}{
						"type":        "string",
						"description": "Author name search query",
					},
					"limit": map[string]interface{}{
						"type":        "number",
						"description": "Number of results to return",
						"default":     10,
					},
					"offset": map[string]interface{}{
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
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"authorId": map[string]interface{}{
						"type":        "string",
						"description": "Author ID",
					},
					"fields": map[string]interface{}{
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
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"authorId": map[string]interface{}{
						"type":        "string",
						"description": "Author ID",
					},
					"limit": map[string]interface{}{
						"type":        "number",
						"description": "Number of papers to return",
						"default":     100,
					},
					"offset": map[string]interface{}{
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
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"paperId": map[string]interface{}{
						"type":        "string",
						"description": "Paper ID to base recommendations on",
					},
					"limit": map[string]interface{}{
						"type":        "number",
						"description": "Number of recommendations to return",
						"default":     10,
					},
				},
				"required": []string{"paperId"},
			},
		},
	}
}

// CallTool executes an MCP tool call
func (s *MCPServer) CallTool(req ToolRequest) (*ToolResponse, error) {
	switch req.Name {
	case "search_papers":
		return s.handleSearchPapers(req.Arguments)
	case "get_paper":
		return s.handleGetPaper(req.Arguments)
	case "get_paper_citations":
		return s.handleGetPaperCitations(req.Arguments)
	case "get_paper_references":
		return s.handleGetPaperReferences(req.Arguments)
	case "search_authors":
		return s.handleSearchAuthors(req.Arguments)
	case "get_author":
		return s.handleGetAuthor(req.Arguments)
	case "get_author_papers":
		return s.handleGetAuthorPapers(req.Arguments)
	case "get_recommendations":
		return s.handleGetRecommendations(req.Arguments)
	default:
		return nil, fmt.Errorf("unknown tool: %s", req.Name)
	}
}

func (s *MCPServer) handleSearchPapers(args map[string]interface{}) (*ToolResponse, error) {
	query, ok := args["query"].(string)
	if !ok {
		return nil, fmt.Errorf("query is required")
	}

	// Default fields to return for complete paper information
	defaultFields := []string{
		"paperId", "title", "abstract", "year", "authors",
		"citationCount", "venue", "publicationDate", "url",
		"referenceCount", "fieldsOfStudy", "externalIds",
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
	if fields, ok := args["fieldsOfStudy"].([]interface{}); ok {
		opts.FieldsOfStudy = interfaceSliceToStringSlice(fields)
	}

	// Use manager which will automatically get API key from backend config
	result, err := s.manager.SearchPapers(opts)
	if err != nil {
		return nil, err
	}

	return createJSONResponse(result)
}

func (s *MCPServer) handleGetPaper(args map[string]interface{}) (*ToolResponse, error) {
	paperID, ok := args["paperId"].(string)
	if !ok {
		return nil, fmt.Errorf("paperId is required")
	}

	opts := semanticscholar.PaperDetailsOptions{}
	if fields, ok := args["fields"].([]interface{}); ok {
		opts.Fields = interfaceSliceToStringSlice(fields)
	}

	result, err := s.manager.GetPaper(paperID, opts)
	if err != nil {
		return nil, err
	}

	return createJSONResponse(result)
}

func (s *MCPServer) handleGetPaperCitations(args map[string]interface{}) (*ToolResponse, error) {
	paperID, ok := args["paperId"].(string)
	if !ok {
		return nil, fmt.Errorf("paperId is required")
	}

	opts := semanticscholar.CitationsOptions{
		Limit:  getIntArg(args, "limit", 100),
		Offset: getIntArg(args, "offset", 0),
	}

	result, err := s.manager.GetPaperCitations(paperID, opts)
	if err != nil {
		return nil, err
	}

	return createJSONResponse(result)
}

func (s *MCPServer) handleGetPaperReferences(args map[string]interface{}) (*ToolResponse, error) {
	paperID, ok := args["paperId"].(string)
	if !ok {
		return nil, fmt.Errorf("paperId is required")
	}

	opts := semanticscholar.CitationsOptions{
		Limit:  getIntArg(args, "limit", 100),
		Offset: getIntArg(args, "offset", 0),
	}

	result, err := s.manager.GetPaperReferences(paperID, opts)
	if err != nil {
		return nil, err
	}

	return createJSONResponse(result)
}

func (s *MCPServer) handleSearchAuthors(args map[string]interface{}) (*ToolResponse, error) {
	query, ok := args["query"].(string)
	if !ok {
		return nil, fmt.Errorf("query is required")
	}

	opts := semanticscholar.AuthorSearchOptions{
		Query:  query,
		Limit:  getIntArg(args, "limit", 10),
		Offset: getIntArg(args, "offset", 0),
	}

	result, err := s.manager.SearchAuthors(opts)
	if err != nil {
		return nil, err
	}

	return createJSONResponse(result)
}

func (s *MCPServer) handleGetAuthor(args map[string]interface{}) (*ToolResponse, error) {
	authorID, ok := args["authorId"].(string)
	if !ok {
		return nil, fmt.Errorf("authorId is required")
	}

	var fields []string
	if f, ok := args["fields"].([]interface{}); ok {
		fields = interfaceSliceToStringSlice(f)
	}

	result, err := s.manager.GetAuthor(authorID, fields)
	if err != nil {
		return nil, err
	}

	return createJSONResponse(result)
}

func (s *MCPServer) handleGetAuthorPapers(args map[string]interface{}) (*ToolResponse, error) {
	authorID, ok := args["authorId"].(string)
	if !ok {
		return nil, fmt.Errorf("authorId is required")
	}

	limit := getIntArg(args, "limit", 100)
	offset := getIntArg(args, "offset", 0)

	result, err := s.manager.GetAuthorPapers(authorID, nil, offset, limit)
	if err != nil {
		return nil, err
	}

	return createJSONResponse(result)
}

func (s *MCPServer) handleGetRecommendations(args map[string]interface{}) (*ToolResponse, error) {
	paperID, ok := args["paperId"].(string)
	if !ok {
		return nil, fmt.Errorf("paperId is required")
	}

	opts := semanticscholar.RecommendationsOptions{
		Limit: getIntArg(args, "limit", 10),
	}

	result, err := s.manager.GetRecommendationsForPaper(paperID, opts)
	if err != nil {
		return nil, err
	}

	return createJSONResponse(result)
}

// Helper functions

func getIntArg(args map[string]interface{}, key string, defaultValue int) int {
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

func interfaceSliceToStringSlice(slice []interface{}) []string {
	result := make([]string, 0, len(slice))
	for _, item := range slice {
		if str, ok := item.(string); ok {
			result = append(result, str)
		}
	}
	return result
}

func createJSONResponse(data interface{}) (*ToolResponse, error) {
	jsonData, err := json.Marshal(data)
	if err != nil {
		log.Printf("Failed to marshal response: %v", err)
		return nil, fmt.Errorf("failed to marshal response: %w", err)
	}

	return &ToolResponse{
		Content: []map[string]interface{}{
			{
				"type": "text",
				"text": string(jsonData),
			},
		},
	}, nil
}
