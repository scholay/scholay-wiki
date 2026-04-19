// ============================================================================
// Scholay学术 V1.0
// MCP 工具列表定义（输入 schema）
// ============================================================================

package mcp

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
