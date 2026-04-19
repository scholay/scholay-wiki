// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

// 论文搜索 MCP 工具
// 提供 arXiv、PubMed、Crossref、通用网络搜索等多源搜索功能

package mcp

import (
	"context"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"scholar-backend/internal/common/httpclient"
)

// SearchToolProvider 搜索工具提供者
type SearchToolProvider struct {
	httpClient     *http.Client
	serperAPIKey   string // Serper API Key（可选）
	crossrefEmail  string // Crossref Polite Pool Email
}

// NewSearchToolProvider 创建搜索工具提供者
func NewSearchToolProvider(serperAPIKey, crossrefEmail string) *SearchToolProvider {
	return &SearchToolProvider{
		httpClient:    httpclient.WithTimeout(30 * time.Second),
		serperAPIKey:  serperAPIKey,
		crossrefEmail: crossrefEmail,
	}
}

// GetCategory 返回工具分类
func (p *SearchToolProvider) GetCategory() ToolCategory {
	return CategorySearch
}

// GetTools 返回工具定义列表
func (p *SearchToolProvider) GetTools() []ToolDefinition {
	return []ToolDefinition{
		{
			Name:        "arxiv_search",
			Description: "在 arXiv 搜索学术论文预印本，支持计算机科学、物理、数学等领域",
			Category:    CategorySearch,
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"query": map[string]any{
						"type":        "string",
						"description": "搜索关键词（英文）",
					},
					"category": map[string]any{
						"type":        "string",
						"description": "arXiv 分类（如 cs.AI, cs.CL, physics.comp-ph）",
					},
					"max_results": map[string]any{
						"type":        "integer",
						"description": "最大返回结果数（默认 10，最大 100）",
						"default":     10,
					},
					"sort_by": map[string]any{
						"type":        "string",
						"enum":        []string{"relevance", "lastUpdatedDate", "submittedDate"},
						"description": "排序方式",
						"default":     "relevance",
					},
				},
				"required": []string{"query"},
			},
			ReadOnlyHint:  true,
			OpenWorldHint: true,
		},
		{
			Name:        "pubmed_search",
			Description: "在 PubMed 搜索生物医学和生命科学论文",
			Category:    CategorySearch,
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"query": map[string]any{
						"type":        "string",
						"description": "搜索关键词",
					},
					"max_results": map[string]any{
						"type":        "integer",
						"description": "最大返回结果数（默认 10，最大 100）",
						"default":     10,
					},
					"sort": map[string]any{
						"type":        "string",
						"enum":        []string{"relevance", "pub_date"},
						"description": "排序方式",
						"default":     "relevance",
					},
				},
				"required": []string{"query"},
			},
			ReadOnlyHint:  true,
			OpenWorldHint: true,
		},
		{
			Name:        "crossref_search",
			Description: "通过 Crossref 搜索学术论文元数据（DOI、引用等）",
			Category:    CategorySearch,
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"query": map[string]any{
						"type":        "string",
						"description": "搜索关键词或论文标题",
					},
					"doi": map[string]any{
						"type":        "string",
						"description": "直接通过 DOI 查询（如果提供则忽略 query）",
					},
					"rows": map[string]any{
						"type":        "integer",
						"description": "返回结果数（默认 10，最大 100）",
						"default":     10,
					},
					"sort": map[string]any{
						"type":        "string",
						"enum":        []string{"relevance", "published", "indexed"},
						"description": "排序方式",
						"default":     "relevance",
					},
				},
			},
			ReadOnlyHint:  true,
			OpenWorldHint: true,
		},
		{
			Name:        "web_search",
			Description: "通用网络搜索，可用于查找学术资源、官方文档等",
			Category:    CategorySearch,
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"query": map[string]any{
						"type":        "string",
						"description": "搜索关键词",
					},
					"num_results": map[string]any{
						"type":        "integer",
						"description": "返回结果数（默认 10）",
						"default":     10,
					},
					"search_type": map[string]any{
						"type":        "string",
						"enum":        []string{"search", "scholar", "news"},
						"description": "搜索类型：search(网页)、scholar(学术)、news(新闻)",
						"default":     "search",
					},
				},
				"required": []string{"query"},
			},
			ReadOnlyHint:  true,
			OpenWorldHint: true,
		},
	}
}

// ExecuteTool 执行工具
func (p *SearchToolProvider) ExecuteTool(ctx context.Context, name string, args map[string]any) (*ToolResult, error) {
	switch name {
	case "arxiv_search":
		return p.arxivSearch(ctx, args)
	case "pubmed_search":
		return p.pubmedSearch(ctx, args)
	case "crossref_search":
		return p.crossrefSearch(ctx, args)
	case "web_search":
		return p.webSearch(ctx, args)
	default:
		return nil, fmt.Errorf("unknown tool: %s", name)
	}
}

// ============================================================================
// arXiv 搜索
// ============================================================================

// ArxivEntry arXiv 论文条目
type ArxivEntry struct {
	ID        string   `json:"id"`
	Title     string   `json:"title"`
	Summary   string   `json:"summary"`
	Authors   []string `json:"authors"`
	Published string   `json:"published"`
	Updated   string   `json:"updated"`
	DOI       string   `json:"doi,omitempty"`
	PDFLink   string   `json:"pdf_link"`
	Category  string   `json:"category"`
}

// arxivSearch 搜索 arXiv
func (p *SearchToolProvider) arxivSearch(ctx context.Context, args map[string]any) (*ToolResult, error) {
	query, ok := args["query"].(string)
	if !ok || query == "" {
		return CreateErrorResult(fmt.Errorf("query is required")), nil
	}

	maxResults := 10
	if max, ok := args["max_results"].(float64); ok {
		maxResults = int(max)
		if maxResults > 100 {
			maxResults = 100
		}
	}

	sortBy := "relevance"
	if sort, ok := args["sort_by"].(string); ok {
		sortBy = sort
	}

	// 构建 arXiv API URL
	baseURL := "http://export.arxiv.org/api/query"
	params := url.Values{}
	
	// 构建搜索查询
	searchQuery := fmt.Sprintf("all:%s", query)
	if category, ok := args["category"].(string); ok && category != "" {
		searchQuery = fmt.Sprintf("cat:%s AND all:%s", category, query)
	}
	
	params.Set("search_query", searchQuery)
	params.Set("start", "0")
	params.Set("max_results", fmt.Sprintf("%d", maxResults))
	params.Set("sortBy", sortBy)
	params.Set("sortOrder", "descending")

	reqURL := baseURL + "?" + params.Encode()
	
	req, err := http.NewRequestWithContext(ctx, "GET", reqURL, nil)
	if err != nil {
		return CreateErrorResult(err), nil
	}

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return CreateErrorResult(fmt.Errorf("arXiv API request failed: %w", err)), nil
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return CreateErrorResult(err), nil
	}

	// 解析 XML 响应
	entries, err := parseArxivResponse(body)
	if err != nil {
		return CreateErrorResult(fmt.Errorf("failed to parse arXiv response: %w", err)), nil
	}

	return CreateSuccessResult(map[string]any{
		"source":  "arxiv",
		"query":   query,
		"total":   len(entries),
		"results": entries,
	}), nil
}

// parseArxivResponse 解析 arXiv XML 响应
func parseArxivResponse(data []byte) ([]ArxivEntry, error) {
	type Author struct {
		Name string `xml:"name"`
	}
	type Link struct {
		Href  string `xml:"href,attr"`
		Title string `xml:"title,attr"`
		Type  string `xml:"type,attr"`
	}
	type Entry struct {
		ID        string   `xml:"id"`
		Title     string   `xml:"title"`
		Summary   string   `xml:"summary"`
		Published string   `xml:"published"`
		Updated   string   `xml:"updated"`
		Authors   []Author `xml:"author"`
		Links     []Link   `xml:"link"`
		Category  struct {
			Term string `xml:"term,attr"`
		} `xml:"category"`
		DOI string `xml:"http://arxiv.org/schemas/atom doi"`
	}
	type Feed struct {
		Entries []Entry `xml:"entry"`
	}

	var feed Feed
	if err := xml.Unmarshal(data, &feed); err != nil {
		return nil, err
	}

	entries := make([]ArxivEntry, 0, len(feed.Entries))
	for _, e := range feed.Entries {
		authors := make([]string, 0, len(e.Authors))
		for _, a := range e.Authors {
			authors = append(authors, a.Name)
		}

		var pdfLink string
		for _, l := range e.Links {
			if l.Title == "pdf" || strings.HasSuffix(l.Href, ".pdf") {
				pdfLink = l.Href
				break
			}
		}

		entries = append(entries, ArxivEntry{
			ID:        e.ID,
			Title:     strings.TrimSpace(e.Title),
			Summary:   strings.TrimSpace(e.Summary),
			Authors:   authors,
			Published: e.Published,
			Updated:   e.Updated,
			DOI:       e.DOI,
			PDFLink:   pdfLink,
			Category:  e.Category.Term,
		})
	}

	return entries, nil
}

// ============================================================================
// PubMed 搜索
// ============================================================================

// PubMedArticle PubMed 文章
type PubMedArticle struct {
	PMID     string   `json:"pmid"`
	Title    string   `json:"title"`
	Abstract string   `json:"abstract"`
	Authors  []string `json:"authors"`
	Journal  string   `json:"journal"`
	PubDate  string   `json:"pub_date"`
	DOI      string   `json:"doi,omitempty"`
}

// pubmedSearch 搜索 PubMed
func (p *SearchToolProvider) pubmedSearch(ctx context.Context, args map[string]any) (*ToolResult, error) {
	query, ok := args["query"].(string)
	if !ok || query == "" {
		return CreateErrorResult(fmt.Errorf("query is required")), nil
	}

	maxResults := 10
	if max, ok := args["max_results"].(float64); ok {
		maxResults = int(max)
		if maxResults > 100 {
			maxResults = 100
		}
	}

	sort := "relevance"
	if s, ok := args["sort"].(string); ok {
		sort = s
	}

	// Step 1: 使用 esearch 获取 PMID 列表
	searchURL := "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
	params := url.Values{}
	params.Set("db", "pubmed")
	params.Set("term", query)
	params.Set("retmax", fmt.Sprintf("%d", maxResults))
	params.Set("retmode", "json")
	if sort == "pub_date" {
		params.Set("sort", "pub+date")
	}

	searchReq, err := http.NewRequestWithContext(ctx, "GET", searchURL+"?"+params.Encode(), nil)
	if err != nil {
		return CreateErrorResult(err), nil
	}

	searchResp, err := p.httpClient.Do(searchReq)
	if err != nil {
		return CreateErrorResult(fmt.Errorf("PubMed search failed: %w", err)), nil
	}
	defer searchResp.Body.Close()

	var searchResult struct {
		ESearchResult struct {
			IDList []string `json:"idlist"`
			Count  string   `json:"count"`
		} `json:"esearchresult"`
	}

	if err := json.NewDecoder(searchResp.Body).Decode(&searchResult); err != nil {
		return CreateErrorResult(fmt.Errorf("failed to parse PubMed search response: %w", err)), nil
	}

	if len(searchResult.ESearchResult.IDList) == 0 {
		return CreateSuccessResult(map[string]any{
			"source":  "pubmed",
			"query":   query,
			"total":   0,
			"results": []PubMedArticle{},
		}), nil
	}

	// Step 2: 使用 efetch 获取详细信息
	ids := strings.Join(searchResult.ESearchResult.IDList, ",")
	fetchURL := "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi"
	fetchParams := url.Values{}
	fetchParams.Set("db", "pubmed")
	fetchParams.Set("id", ids)
	fetchParams.Set("retmode", "json")

	fetchReq, err := http.NewRequestWithContext(ctx, "GET", fetchURL+"?"+fetchParams.Encode(), nil)
	if err != nil {
		return CreateErrorResult(err), nil
	}

	fetchResp, err := p.httpClient.Do(fetchReq)
	if err != nil {
		return CreateErrorResult(fmt.Errorf("PubMed fetch failed: %w", err)), nil
	}
	defer fetchResp.Body.Close()

	body, err := io.ReadAll(fetchResp.Body)
	if err != nil {
		return CreateErrorResult(err), nil
	}

	articles := parsePubMedResponse(body, searchResult.ESearchResult.IDList)

	return CreateSuccessResult(map[string]any{
		"source":  "pubmed",
		"query":   query,
		"total":   len(articles),
		"results": articles,
	}), nil
}

// parsePubMedResponse 解析 PubMed 响应
func parsePubMedResponse(data []byte, pmids []string) []PubMedArticle {
	var result map[string]any
	if err := json.Unmarshal(data, &result); err != nil {
		return []PubMedArticle{}
	}

	resultData, ok := result["result"].(map[string]any)
	if !ok {
		return []PubMedArticle{}
	}

	articles := make([]PubMedArticle, 0, len(pmids))
	for _, pmid := range pmids {
		article, ok := resultData[pmid].(map[string]any)
		if !ok {
			continue
		}

		var authors []string
		if authorsData, ok := article["authors"].([]any); ok {
			for _, a := range authorsData {
				if author, ok := a.(map[string]any); ok {
					if name, ok := author["name"].(string); ok {
						authors = append(authors, name)
					}
				}
			}
		}

		var doi string
		if articleIds, ok := article["articleids"].([]any); ok {
			for _, id := range articleIds {
				if idMap, ok := id.(map[string]any); ok {
					if idtype, ok := idMap["idtype"].(string); ok && idtype == "doi" {
						if value, ok := idMap["value"].(string); ok {
							doi = value
							break
						}
					}
				}
			}
		}

		articles = append(articles, PubMedArticle{
			PMID:    pmid,
			Title:   getString(article, "title"),
			Journal: getString(article, "source"),
			PubDate: getString(article, "pubdate"),
			Authors: authors,
			DOI:     doi,
		})
	}

	return articles
}

// ============================================================================
// Crossref 搜索
// ============================================================================

// CrossrefWork Crossref 作品
type CrossrefWork struct {
	DOI            string   `json:"doi"`
	Title          string   `json:"title"`
	Authors        []string `json:"authors"`
	Publisher      string   `json:"publisher"`
	PublishedDate  string   `json:"published_date"`
	Type           string   `json:"type"`
	CitationCount  int      `json:"citation_count"`
	Abstract       string   `json:"abstract,omitempty"`
	ContainerTitle string   `json:"container_title"` // 期刊名
}

// crossrefSearch 搜索 Crossref
func (p *SearchToolProvider) crossrefSearch(ctx context.Context, args map[string]any) (*ToolResult, error) {
	// 如果提供了 DOI，直接查询
	if doi, ok := args["doi"].(string); ok && doi != "" {
		return p.crossrefGetByDOI(ctx, doi)
	}

	query, ok := args["query"].(string)
	if !ok || query == "" {
		return CreateErrorResult(fmt.Errorf("query or doi is required")), nil
	}

	rows := 10
	if r, ok := args["rows"].(float64); ok {
		rows = int(r)
		if rows > 100 {
			rows = 100
		}
	}

	sort := "relevance"
	if s, ok := args["sort"].(string); ok {
		sort = s
	}

	// 构建 Crossref API URL
	baseURL := "https://api.crossref.org/works"
	params := url.Values{}
	params.Set("query", query)
	params.Set("rows", fmt.Sprintf("%d", rows))
	
	if sort == "published" {
		params.Set("sort", "published")
		params.Set("order", "desc")
	} else if sort == "indexed" {
		params.Set("sort", "indexed")
		params.Set("order", "desc")
	}

	reqURL := baseURL + "?" + params.Encode()

	req, err := http.NewRequestWithContext(ctx, "GET", reqURL, nil)
	if err != nil {
		return CreateErrorResult(err), nil
	}

	// Crossref Polite Pool
	if p.crossrefEmail != "" {
		req.Header.Set("User-Agent", fmt.Sprintf("Scholar-Academic/1.0 (mailto:%s)", p.crossrefEmail))
	}

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return CreateErrorResult(fmt.Errorf("Crossref API request failed: %w", err)), nil
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return CreateErrorResult(err), nil
	}

	works, total := parseCrossrefResponse(body)

	return CreateSuccessResult(map[string]any{
		"source":  "crossref",
		"query":   query,
		"total":   total,
		"results": works,
	}), nil
}

// crossrefGetByDOI 通过 DOI 查询
func (p *SearchToolProvider) crossrefGetByDOI(ctx context.Context, doi string) (*ToolResult, error) {
	reqURL := fmt.Sprintf("https://api.crossref.org/works/%s", url.PathEscape(doi))

	req, err := http.NewRequestWithContext(ctx, "GET", reqURL, nil)
	if err != nil {
		return CreateErrorResult(err), nil
	}

	if p.crossrefEmail != "" {
		req.Header.Set("User-Agent", fmt.Sprintf("Scholar-Academic/1.0 (mailto:%s)", p.crossrefEmail))
	}

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return CreateErrorResult(fmt.Errorf("Crossref API request failed: %w", err)), nil
	}
	defer resp.Body.Close()

	if resp.StatusCode == 404 {
		return CreateErrorResult(fmt.Errorf("DOI not found: %s", doi)), nil
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return CreateErrorResult(err), nil
	}

	var result struct {
		Status  string                 `json:"status"`
		Message map[string]any `json:"message"`
	}

	if err := json.Unmarshal(body, &result); err != nil {
		return CreateErrorResult(err), nil
	}

	work := parseCrossrefWork(result.Message)

	return CreateSuccessResult(map[string]any{
		"source": "crossref",
		"doi":    doi,
		"result": work,
	}), nil
}

// parseCrossrefResponse 解析 Crossref 响应
func parseCrossrefResponse(data []byte) ([]CrossrefWork, int) {
	var result struct {
		Status  string `json:"status"`
		Message struct {
			TotalResults int                      `json:"total-results"`
			Items        []map[string]any `json:"items"`
		} `json:"message"`
	}

	if err := json.Unmarshal(data, &result); err != nil {
		return []CrossrefWork{}, 0
	}

	works := make([]CrossrefWork, 0, len(result.Message.Items))
	for _, item := range result.Message.Items {
		work := parseCrossrefWork(item)
		works = append(works, work)
	}

	return works, result.Message.TotalResults
}

// parseCrossrefWork 解析单个 Crossref 作品
func parseCrossrefWork(item map[string]any) CrossrefWork {
	work := CrossrefWork{}

	work.DOI = getString(item, "DOI")
	
	if titles, ok := item["title"].([]any); ok && len(titles) > 0 {
		work.Title = titles[0].(string)
	}

	if authors, ok := item["author"].([]any); ok {
		for _, a := range authors {
			if author, ok := a.(map[string]any); ok {
				given := getString(author, "given")
				family := getString(author, "family")
				if family != "" {
					if given != "" {
						work.Authors = append(work.Authors, given+" "+family)
					} else {
						work.Authors = append(work.Authors, family)
					}
				}
			}
		}
	}

	work.Publisher = getString(item, "publisher")
	work.Type = getString(item, "type")

	if citedBy, ok := item["is-referenced-by-count"].(float64); ok {
		work.CitationCount = int(citedBy)
	}

	if containerTitles, ok := item["container-title"].([]any); ok && len(containerTitles) > 0 {
		work.ContainerTitle = containerTitles[0].(string)
	}

	// 解析发布日期
	if published, ok := item["published"].(map[string]any); ok {
		if dateParts, ok := published["date-parts"].([]any); ok && len(dateParts) > 0 {
			if parts, ok := dateParts[0].([]any); ok {
				var dateStr string
				for i, p := range parts {
					if num, ok := p.(float64); ok {
						if i > 0 {
							dateStr += "-"
						}
						dateStr += fmt.Sprintf("%02d", int(num))
					}
				}
				work.PublishedDate = dateStr
			}
		}
	}

	return work
}

// ============================================================================
// 通用网络搜索
// ============================================================================

// WebSearchResult 网络搜索结果
type WebSearchResult struct {
	Title   string `json:"title"`
	Link    string `json:"link"`
	Snippet string `json:"snippet"`
	Source  string `json:"source"`
}

// webSearch 通用网络搜索
func (p *SearchToolProvider) webSearch(ctx context.Context, args map[string]any) (*ToolResult, error) {
	query, ok := args["query"].(string)
	if !ok || query == "" {
		return CreateErrorResult(fmt.Errorf("query is required")), nil
	}

	numResults := 10
	if num, ok := args["num_results"].(float64); ok {
		numResults = int(num)
	}

	searchType := "search"
	if st, ok := args["search_type"].(string); ok {
		searchType = st
	}

	// 如果没有配置 Serper API Key，返回提示
	if p.serperAPIKey == "" {
		return CreateSuccessResult(map[string]any{
			"source":  "web_search",
			"query":   query,
			"message": "Web search requires Serper API key. Please configure SERPER_API_KEY in admin settings.",
			"results": []WebSearchResult{},
		}), nil
	}

	// 使用 Serper API
	reqBody := map[string]any{
		"q":   query,
		"num": numResults,
	}

	apiURL := "https://google.serper.dev/search"
	if searchType == "scholar" {
		apiURL = "https://google.serper.dev/scholar"
	} else if searchType == "news" {
		apiURL = "https://google.serper.dev/news"
	}

	bodyBytes, _ := json.Marshal(reqBody)
	req, err := http.NewRequestWithContext(ctx, "POST", apiURL, strings.NewReader(string(bodyBytes)))
	if err != nil {
		return CreateErrorResult(err), nil
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-API-KEY", p.serperAPIKey)

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return CreateErrorResult(fmt.Errorf("web search failed: %w", err)), nil
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return CreateErrorResult(err), nil
	}

	results := parseSerperResponse(body)

	return CreateSuccessResult(map[string]any{
		"source":      "web_search",
		"search_type": searchType,
		"query":       query,
		"total":       len(results),
		"results":     results,
	}), nil
}

// parseSerperResponse 解析 Serper 响应
func parseSerperResponse(data []byte) []WebSearchResult {
	var result map[string]any
	if err := json.Unmarshal(data, &result); err != nil {
		return []WebSearchResult{}
	}

	results := []WebSearchResult{}

	// 解析 organic 结果
	if organic, ok := result["organic"].([]any); ok {
		for _, item := range organic {
			if r, ok := item.(map[string]any); ok {
				results = append(results, WebSearchResult{
					Title:   getString(r, "title"),
					Link:    getString(r, "link"),
					Snippet: getString(r, "snippet"),
					Source:  "organic",
				})
			}
		}
	}

	return results
}

// ============================================================================
// 辅助函数
// ============================================================================

// getString 安全获取字符串
func getString(m map[string]any, key string) string {
	if v, ok := m[key].(string); ok {
		return v
	}
	return ""
}
