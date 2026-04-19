// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package semanticscholar

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strconv"
	"strings"

	"scholar-backend/internal/common/cache"
	"scholar-backend/internal/common/safego"
)

// SearchPapersBulk searches for papers using bulk endpoint with advanced features
func (c *Client) SearchPapersBulk(ctx context.Context, opts BulkSearchOptions) (*SearchResponse, error) {
	// Build cache key parameters
	cacheParams := map[string]any{
		"bulk":  true,
		"query": opts.Query,
		"sort":  opts.Sort,
		"token": opts.Token,
	}

	if opts.MinCitationCount > 0 {
		cacheParams["minCitations"] = opts.MinCitationCount
	}
	if opts.Year != "" {
		cacheParams["year"] = opts.Year
	}
	if len(opts.Fields) > 0 {
		cacheParams["fields"] = opts.Fields
	}

	// Try to get from cache
	var cachedResult SearchResponse
	hit, err := cache.GetCachedSearchResult(ctx, cacheParams, &cachedResult)
	if err != nil {
		slog.Warn("cache error", "err", err)
	}
	if hit {
		slog.Info("cache hit for bulk search", "query", opts.Query)
		return &cachedResult, nil
	}

	// Build query parameters for API call
	params := map[string]string{}

	if opts.Query != "" {
		params["query"] = opts.Query
	}
	if opts.Token != "" {
		params["token"] = opts.Token
	}
	if opts.Sort != "" {
		params["sort"] = opts.Sort
	}
	if opts.MinCitationCount > 0 {
		params["minCitationCount"] = strconv.Itoa(opts.MinCitationCount)
	}
	if opts.Year != "" {
		params["year"] = opts.Year
	}
	if opts.OpenAccessPDF != "" {
		params["openAccessPdf"] = opts.OpenAccessPDF
	}
	if len(opts.PublicationTypes) > 0 {
		params["publicationTypes"] = strings.Join(opts.PublicationTypes, ",")
	}
	if len(opts.Venue) > 0 {
		params["venue"] = strings.Join(opts.Venue, ",")
	}
	if len(opts.FieldsOfStudy) > 0 {
		params["fieldsOfStudy"] = strings.Join(opts.FieldsOfStudy, ",")
	}
	if len(opts.Fields) > 0 {
		params["fields"] = strings.Join(opts.Fields, ",")
	}

	// Build URL for bulk endpoint
	urlStr := c.baseURL + "/paper/search/bulk" + buildQueryString(params)

	// Debug: Log the actual API call
	slog.Debug("bulk search API call",
		"url", urlStr,
		"query", opts.Query,
		"year", opts.Year,
		"minCitations", opts.MinCitationCount,
		"sort", opts.Sort,
		"fieldsOfStudy", opts.FieldsOfStudy,
	)

	// Perform request
	resp, err := c.doRequest(ctx, "GET", urlStr, nil)
	if err != nil {
		return nil, err
	}

	// Parse response
	var result SearchResponse
	if err := unmarshalResponse(resp, &result); err != nil {
		return nil, err
	}

	// Cache the result using worker pool
	cache.GetWorkerPool().Submit(ctx, func() error {
		return cache.CacheSearchResult(ctx, cacheParams, &result)
	})

	return &result, nil
}

// SearchPapers searches for papers by query
func (c *Client) SearchPapers(ctx context.Context, opts PaperSearchOptions) (*SearchResponse, error) {
	if opts.Query == "" {
		return nil, fmt.Errorf("query is required")
	}

	// Build cache key parameters
	cacheParams := map[string]any{
		"query":  opts.Query,
		"offset": opts.Offset,
		"limit":  opts.Limit,
	}

	if opts.Year != "" {
		cacheParams["year"] = opts.Year
	}
	if opts.OpenAccessPDF != "" {
		cacheParams["openAccessPdf"] = opts.OpenAccessPDF
	}
	if len(opts.PublicationTypes) > 0 {
		cacheParams["publicationTypes"] = opts.PublicationTypes
	}
	if len(opts.Venue) > 0 {
		cacheParams["venue"] = opts.Venue
	}
	if len(opts.FieldsOfStudy) > 0 {
		cacheParams["fieldsOfStudy"] = opts.FieldsOfStudy
	}
	if len(opts.Fields) > 0 {
		cacheParams["fields"] = opts.Fields
	}
	if opts.MinCitationCount > 0 {
		cacheParams["minCitationCount"] = opts.MinCitationCount
	}

	// Try to get from cache
	var cachedResult SearchResponse
	hit, err := cache.GetCachedSearchResult(ctx, cacheParams, &cachedResult)
	if err != nil {
		slog.Warn("cache error", "err", err)
	}
	if hit {
		slog.Info("cache hit for search", "query", opts.Query)
		return &cachedResult, nil
	}

	// Build query parameters for API call
	params := map[string]string{
		"query":  opts.Query,
		"offset": strconv.Itoa(opts.Offset),
		"limit":  strconv.Itoa(opts.Limit),
	}

	if opts.Year != "" {
		params["year"] = opts.Year
	}
	if opts.OpenAccessPDF != "" {
		params["openAccessPdf"] = opts.OpenAccessPDF
	}
	if len(opts.PublicationTypes) > 0 {
		params["publicationTypes"] = strings.Join(opts.PublicationTypes, ",")
	}
	if len(opts.Venue) > 0 {
		params["venue"] = strings.Join(opts.Venue, ",")
	}
	if len(opts.FieldsOfStudy) > 0 {
		params["fieldsOfStudy"] = strings.Join(opts.FieldsOfStudy, ",")
	}
	if len(opts.Fields) > 0 {
		params["fields"] = strings.Join(opts.Fields, ",")
	}
	if opts.MinCitationCount > 0 {
		params["minCitationCount"] = strconv.Itoa(opts.MinCitationCount)
	}

	// Set default limit if not specified
	if opts.Limit == 0 {
		params["limit"] = strconv.Itoa(DefaultLimit)
	}

	// Build URL
	urlStr := c.baseURL + "/paper/search" + buildQueryString(params)

	// Perform request
	resp, err := c.doRequest(ctx, "GET", urlStr, nil)
	if err != nil {
		return nil, err
	}

	// Parse response
	var result SearchResponse
	if err := unmarshalResponse(resp, &result); err != nil {
		return nil, err
	}

	// Cache the result using worker pool (prevents goroutine accumulation)
	cache.GetWorkerPool().Submit(ctx, func() error {
		return cache.CacheSearchResult(ctx, cacheParams, &result)
	})

	return &result, nil
}

// GetPaper retrieves details for a specific paper
func (c *Client) GetPaper(ctx context.Context, paperID string, opts PaperDetailsOptions) (*Paper, error) {
	if paperID == "" {
		return nil, fmt.Errorf("paperID is required")
	}

	// Try to get from cache (with fields parameter to ensure exact match)
	var cachedPaper Paper
	hit, err := cache.GetCachedPaperDetails(ctx, paperID, opts.Fields, &cachedPaper)
	if err != nil {
		slog.Warn("cache error", "err", err)
	}
	if hit {
		slog.Info("cache hit for paper", "paperID", paperID, "fields", opts.Fields)
		return &cachedPaper, nil
	}

	// Build query parameters
	params := map[string]string{}
	if len(opts.Fields) > 0 {
		params["fields"] = strings.Join(opts.Fields, ",")
	}

	// Build URL
	urlStr := c.baseURL + "/paper/" + paperID + buildQueryString(params)

	// Perform request
	resp, err := c.doRequest(ctx, "GET", urlStr, nil)
	if err != nil {
		return nil, err
	}

	// Parse response
	var result Paper
	if err := unmarshalResponse(resp, &result); err != nil {
		return nil, err
	}

	// Cache the result (async) with fields parameter for unique cache key
	safego.Go("s2-cache-paper-details", func() {
		if err := cache.CachePaperDetails(context.Background(), paperID, opts.Fields, &result); err != nil {
			slog.Warn("failed to cache paper details", "err", err)
		}
	})

	return &result, nil
}

// GetPaperBatch retrieves details for multiple papers
func (c *Client) GetPaperBatch(ctx context.Context, paperIDs []string, fields []string) ([]Paper, error) {
	if len(paperIDs) == 0 {
		return nil, fmt.Errorf("paperIDs is required")
	}

	// Build query parameters
	params := map[string]string{}
	if len(fields) > 0 {
		params["fields"] = strings.Join(fields, ",")
	}

	// Build request body
	reqBody := BatchPaperRequest{IDs: paperIDs}
	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	// Build URL
	urlStr := c.baseURL + "/paper/batch" + buildQueryString(params)

	// Perform request
	resp, err := c.doRequest(ctx, "POST", urlStr, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, err
	}

	// Parse response
	var result []Paper
	if err := unmarshalResponse(resp, &result); err != nil {
		return nil, err
	}

	return result, nil
}

// GetPaperAuthors retrieves authors for a specific paper
func (c *Client) GetPaperAuthors(ctx context.Context, paperID string, fields []string, offset, limit int) (*AuthorSearchResponse, error) {
	if paperID == "" {
		return nil, fmt.Errorf("paperID is required")
	}

	// Build query parameters
	params := map[string]string{
		"offset": strconv.Itoa(offset),
		"limit":  strconv.Itoa(limit),
	}
	if len(fields) > 0 {
		params["fields"] = strings.Join(fields, ",")
	}
	if limit == 0 {
		params["limit"] = strconv.Itoa(DefaultLimit)
	}

	// Build URL
	urlStr := c.baseURL + "/paper/" + paperID + "/authors" + buildQueryString(params)

	// Perform request
	resp, err := c.doRequest(ctx, "GET", urlStr, nil)
	if err != nil {
		return nil, err
	}

	// Parse response
	var result AuthorSearchResponse
	if err := unmarshalResponse(resp, &result); err != nil {
		return nil, err
	}

	return &result, nil
}

// GetPaperCitations retrieves citations for a specific paper
func (c *Client) GetPaperCitations(ctx context.Context, paperID string, opts CitationsOptions) (*CitationsResponse, error) {
	if paperID == "" {
		return nil, fmt.Errorf("paperID is required")
	}

	// Build query parameters
	params := map[string]string{
		"offset": strconv.Itoa(opts.Offset),
		"limit":  strconv.Itoa(opts.Limit),
	}
	if len(opts.Fields) > 0 {
		params["fields"] = strings.Join(opts.Fields, ",")
	}
	if opts.Limit == 0 {
		params["limit"] = strconv.Itoa(DefaultLimit)
	}

	// Build URL
	urlStr := c.baseURL + "/paper/" + paperID + "/citations" + buildQueryString(params)

	// Perform request
	resp, err := c.doRequest(ctx, "GET", urlStr, nil)
	if err != nil {
		return nil, err
	}

	// Parse response
	var result CitationsResponse
	if err := unmarshalResponse(resp, &result); err != nil {
		return nil, err
	}

	return &result, nil
}

// GetPaperReferences retrieves references for a specific paper
func (c *Client) GetPaperReferences(ctx context.Context, paperID string, opts CitationsOptions) (*ReferencesResponse, error) {
	if paperID == "" {
		return nil, fmt.Errorf("paperID is required")
	}

	// Build query parameters
	params := map[string]string{
		"offset": strconv.Itoa(opts.Offset),
		"limit":  strconv.Itoa(opts.Limit),
	}
	if len(opts.Fields) > 0 {
		params["fields"] = strings.Join(opts.Fields, ",")
	}
	if opts.Limit == 0 {
		params["limit"] = strconv.Itoa(DefaultLimit)
	}

	// Build URL
	urlStr := c.baseURL + "/paper/" + paperID + "/references" + buildQueryString(params)

	// Perform request
	resp, err := c.doRequest(ctx, "GET", urlStr, nil)
	if err != nil {
		return nil, err
	}

	// Parse response
	var result ReferencesResponse
	if err := unmarshalResponse(resp, &result); err != nil {
		return nil, err
	}

	return &result, nil
}

// SearchAuthors searches for authors by query
func (c *Client) SearchAuthors(ctx context.Context, opts AuthorSearchOptions) (*AuthorSearchResponse, error) {
	if opts.Query == "" {
		return nil, fmt.Errorf("query is required")
	}

	// Build query parameters
	params := map[string]string{
		"query":  opts.Query,
		"offset": strconv.Itoa(opts.Offset),
		"limit":  strconv.Itoa(opts.Limit),
	}
	if len(opts.Fields) > 0 {
		params["fields"] = strings.Join(opts.Fields, ",")
	}
	if opts.Limit == 0 {
		params["limit"] = strconv.Itoa(DefaultLimit)
	}

	// Build URL
	urlStr := c.baseURL + "/author/search" + buildQueryString(params)

	// Perform request
	resp, err := c.doRequest(ctx, "GET", urlStr, nil)
	if err != nil {
		return nil, err
	}

	// Parse response
	var result AuthorSearchResponse
	if err := unmarshalResponse(resp, &result); err != nil {
		return nil, err
	}

	return &result, nil
}

// GetAuthor retrieves details for a specific author
func (c *Client) GetAuthor(ctx context.Context, authorID string, fields []string) (*Author, error) {
	if authorID == "" {
		return nil, fmt.Errorf("authorID is required")
	}

	// Build query parameters
	params := map[string]string{}
	if len(fields) > 0 {
		params["fields"] = strings.Join(fields, ",")
	}

	// Build URL
	urlStr := c.baseURL + "/author/" + authorID + buildQueryString(params)

	// Perform request
	resp, err := c.doRequest(ctx, "GET", urlStr, nil)
	if err != nil {
		return nil, err
	}

	// Parse response
	var result Author
	if err := unmarshalResponse(resp, &result); err != nil {
		return nil, err
	}

	return &result, nil
}

// GetAuthorPapers retrieves papers for a specific author
func (c *Client) GetAuthorPapers(ctx context.Context, authorID string, fields []string, offset, limit int) (*SearchResponse, error) {
	if authorID == "" {
		return nil, fmt.Errorf("authorID is required")
	}

	// Build query parameters
	params := map[string]string{
		"offset": strconv.Itoa(offset),
		"limit":  strconv.Itoa(limit),
	}
	if len(fields) > 0 {
		params["fields"] = strings.Join(fields, ",")
	}
	if limit == 0 {
		params["limit"] = strconv.Itoa(DefaultLimit)
	}

	// Build URL
	urlStr := c.baseURL + "/author/" + authorID + "/papers" + buildQueryString(params)

	// Perform request
	resp, err := c.doRequest(ctx, "GET", urlStr, nil)
	if err != nil {
		return nil, err
	}

	// Parse response
	var result SearchResponse
	if err := unmarshalResponse(resp, &result); err != nil {
		return nil, err
	}

	return &result, nil
}

// PaperAutocomplete returns paper title suggestions based on partial query
// API: GET /paper/autocomplete?query=xxx
func (c *Client) PaperAutocomplete(ctx context.Context, query string) (*AutocompleteResponse, error) {
	if query == "" {
		return nil, fmt.Errorf("query is required")
	}

	// Build query parameters
	params := map[string]string{
		"query": query,
	}

	// Build URL
	urlStr := c.baseURL + "/paper/autocomplete" + buildQueryString(params)

	// Perform request
	resp, err := c.doRequest(ctx, "GET", urlStr, nil)
	if err != nil {
		return nil, err
	}

	// Parse response
	var result AutocompleteResponse
	if err := unmarshalResponse(resp, &result); err != nil {
		return nil, err
	}

	return &result, nil
}

// SnippetSearch searches for papers by text snippet/quote
// API: GET /snippet/search
// Use when user provides a piece of text and wants to find the source paper
func (c *Client) SnippetSearch(ctx context.Context, opts SnippetSearchOptions) (*SnippetSearchResponse, error) {
	if opts.Query == "" {
		return nil, fmt.Errorf("query is required")
	}

	// Build query parameters
	params := map[string]string{
		"query": opts.Query,
	}

	if opts.Year != "" {
		params["year"] = opts.Year
	}
	if opts.MinCitationCount > 0 {
		params["minCitationCount"] = strconv.Itoa(opts.MinCitationCount)
	}
	if len(opts.Venue) > 0 {
		params["venue"] = strings.Join(opts.Venue, ",")
	}
	if len(opts.FieldsOfStudy) > 0 {
		params["fieldsOfStudy"] = strings.Join(opts.FieldsOfStudy, ",")
	}
	if len(opts.Fields) > 0 {
		params["fields"] = strings.Join(opts.Fields, ",")
	}
	if opts.Limit > 0 {
		if opts.Limit > 1000 {
			opts.Limit = 1000 // API max is 1000
		}
		params["limit"] = strconv.Itoa(opts.Limit)
	}

	// Build URL
	urlStr := c.baseURL + "/snippet/search" + buildQueryString(params)

	slog.Debug("snippet search API call", "url", urlStr, "query", opts.Query)

	// Perform request
	resp, err := c.doRequest(ctx, "GET", urlStr, nil)
	if err != nil {
		return nil, err
	}

	// Parse response
	var result SnippetSearchResponse
	if err := unmarshalResponse(resp, &result); err != nil {
		return nil, err
	}

	return &result, nil
}

// PaperTitleMatch finds paper by exact title match
// API: GET /paper/search/match
// Use when user provides a complete paper title for precise lookup
func (c *Client) PaperTitleMatch(ctx context.Context, opts TitleMatchOptions) (*SearchResponse, error) {
	if opts.Query == "" {
		return nil, fmt.Errorf("query (paper title) is required")
	}

	// Build query parameters
	params := map[string]string{
		"query": opts.Query,
	}

	if opts.Year != "" {
		params["year"] = opts.Year
	}
	if opts.MinCitationCount > 0 {
		params["minCitationCount"] = strconv.Itoa(opts.MinCitationCount)
	}
	if opts.OpenAccessPDF != "" {
		params["openAccessPdf"] = opts.OpenAccessPDF
	}
	if len(opts.PublicationTypes) > 0 {
		params["publicationTypes"] = strings.Join(opts.PublicationTypes, ",")
	}
	if len(opts.Venue) > 0 {
		params["venue"] = strings.Join(opts.Venue, ",")
	}
	if len(opts.FieldsOfStudy) > 0 {
		params["fieldsOfStudy"] = strings.Join(opts.FieldsOfStudy, ",")
	}
	if len(opts.Fields) > 0 {
		params["fields"] = strings.Join(opts.Fields, ",")
	}

	// Build URL
	urlStr := c.baseURL + "/paper/search/match" + buildQueryString(params)

	slog.Debug("title match API call", "url", urlStr, "titleQuery", opts.Query)

	// Perform request
	resp, err := c.doRequest(ctx, "GET", urlStr, nil)
	if err != nil {
		return nil, err
	}

	// Parse response
	var result SearchResponse
	if err := unmarshalResponse(resp, &result); err != nil {
		return nil, err
	}

	return &result, nil
}
