package semanticscholar

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"scholar-backend/internal/common/cache"
	"strconv"
)

// SearchPapers searches for papers by query
func (c *Client) SearchPapers(opts PaperSearchOptions) (*SearchResponse, error) {
	if opts.Query == "" {
		return nil, fmt.Errorf("query is required")
	}

	// Build cache key parameters
	cacheParams := map[string]interface{}{
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

	// Try to get from cache
	var cachedResult SearchResponse
	hit, err := cache.GetCachedSearchResult(context.Background(), cacheParams, &cachedResult)
	if err != nil {
		log.Printf("Warning: cache error: %v", err)
	}
	if hit {
		log.Printf("✓ Cache hit for search: %s", opts.Query)
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
		params["publicationTypes"] = joinStrings(opts.PublicationTypes, ",")
	}
	if len(opts.Venue) > 0 {
		params["venue"] = joinStrings(opts.Venue, ",")
	}
	if len(opts.FieldsOfStudy) > 0 {
		params["fieldsOfStudy"] = joinStrings(opts.FieldsOfStudy, ",")
	}
	if len(opts.Fields) > 0 {
		params["fields"] = joinStrings(opts.Fields, ",")
	}

	// Set default limit if not specified
	if opts.Limit == 0 {
		params["limit"] = strconv.Itoa(DefaultLimit)
	}

	// Build URL
	urlStr := c.baseURL + "/paper/search" + buildQueryString(params)

	// Perform request
	resp, err := c.doRequest("GET", urlStr, nil)
	if err != nil {
		return nil, err
	}

	// Parse response
	var result SearchResponse
	if err := unmarshalResponse(resp, &result); err != nil {
		return nil, err
	}

	// Cache the result (async, don't block response)
	go func() {
		if err := cache.CacheSearchResult(context.Background(), cacheParams, &result); err != nil {
			log.Printf("Warning: failed to cache search result: %v", err)
		}
	}()

	return &result, nil
}

// GetPaper retrieves details for a specific paper
func (c *Client) GetPaper(paperID string, opts PaperDetailsOptions) (*Paper, error) {
	if paperID == "" {
		return nil, fmt.Errorf("paperID is required")
	}

	// Try to get from cache
	var cachedPaper Paper
	hit, err := cache.GetCachedPaperDetails(context.Background(), paperID, &cachedPaper)
	if err != nil {
		log.Printf("Warning: cache error: %v", err)
	}
	if hit {
		log.Printf("✓ Cache hit for paper: %s", paperID)
		return &cachedPaper, nil
	}

	// Build query parameters
	params := map[string]string{}
	if len(opts.Fields) > 0 {
		params["fields"] = joinStrings(opts.Fields, ",")
	}

	// Build URL
	urlStr := c.baseURL + "/paper/" + paperID + buildQueryString(params)

	// Perform request
	resp, err := c.doRequest("GET", urlStr, nil)
	if err != nil {
		return nil, err
	}

	// Parse response
	var result Paper
	if err := unmarshalResponse(resp, &result); err != nil {
		return nil, err
	}

	// Cache the result (async)
	go func() {
		if err := cache.CachePaperDetails(context.Background(), paperID, &result); err != nil {
			log.Printf("Warning: failed to cache paper details: %v", err)
		}
	}()

	return &result, nil
}

// GetPaperBatch retrieves details for multiple papers
func (c *Client) GetPaperBatch(paperIDs []string, fields []string) ([]Paper, error) {
	if len(paperIDs) == 0 {
		return nil, fmt.Errorf("paperIDs is required")
	}

	// Build query parameters
	params := map[string]string{}
	if len(fields) > 0 {
		params["fields"] = joinStrings(fields, ",")
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
	resp, err := c.doRequest("POST", urlStr, bytes.NewReader(bodyBytes))
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
func (c *Client) GetPaperAuthors(paperID string, fields []string, offset, limit int) (*AuthorSearchResponse, error) {
	if paperID == "" {
		return nil, fmt.Errorf("paperID is required")
	}

	// Build query parameters
	params := map[string]string{
		"offset": strconv.Itoa(offset),
		"limit":  strconv.Itoa(limit),
	}
	if len(fields) > 0 {
		params["fields"] = joinStrings(fields, ",")
	}
	if limit == 0 {
		params["limit"] = strconv.Itoa(DefaultLimit)
	}

	// Build URL
	urlStr := c.baseURL + "/paper/" + paperID + "/authors" + buildQueryString(params)

	// Perform request
	resp, err := c.doRequest("GET", urlStr, nil)
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
func (c *Client) GetPaperCitations(paperID string, opts CitationsOptions) (*CitationsResponse, error) {
	if paperID == "" {
		return nil, fmt.Errorf("paperID is required")
	}

	// Build query parameters
	params := map[string]string{
		"offset": strconv.Itoa(opts.Offset),
		"limit":  strconv.Itoa(opts.Limit),
	}
	if len(opts.Fields) > 0 {
		params["fields"] = joinStrings(opts.Fields, ",")
	}
	if opts.Limit == 0 {
		params["limit"] = strconv.Itoa(DefaultLimit)
	}

	// Build URL
	urlStr := c.baseURL + "/paper/" + paperID + "/citations" + buildQueryString(params)

	// Perform request
	resp, err := c.doRequest("GET", urlStr, nil)
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
func (c *Client) GetPaperReferences(paperID string, opts CitationsOptions) (*ReferencesResponse, error) {
	if paperID == "" {
		return nil, fmt.Errorf("paperID is required")
	}

	// Build query parameters
	params := map[string]string{
		"offset": strconv.Itoa(opts.Offset),
		"limit":  strconv.Itoa(opts.Limit),
	}
	if len(opts.Fields) > 0 {
		params["fields"] = joinStrings(opts.Fields, ",")
	}
	if opts.Limit == 0 {
		params["limit"] = strconv.Itoa(DefaultLimit)
	}

	// Build URL
	urlStr := c.baseURL + "/paper/" + paperID + "/references" + buildQueryString(params)

	// Perform request
	resp, err := c.doRequest("GET", urlStr, nil)
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
func (c *Client) SearchAuthors(opts AuthorSearchOptions) (*AuthorSearchResponse, error) {
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
		params["fields"] = joinStrings(opts.Fields, ",")
	}
	if opts.Limit == 0 {
		params["limit"] = strconv.Itoa(DefaultLimit)
	}

	// Build URL
	urlStr := c.baseURL + "/author/search" + buildQueryString(params)

	// Perform request
	resp, err := c.doRequest("GET", urlStr, nil)
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
func (c *Client) GetAuthor(authorID string, fields []string) (*Author, error) {
	if authorID == "" {
		return nil, fmt.Errorf("authorID is required")
	}

	// Build query parameters
	params := map[string]string{}
	if len(fields) > 0 {
		params["fields"] = joinStrings(fields, ",")
	}

	// Build URL
	urlStr := c.baseURL + "/author/" + authorID + buildQueryString(params)

	// Perform request
	resp, err := c.doRequest("GET", urlStr, nil)
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
func (c *Client) GetAuthorPapers(authorID string, fields []string, offset, limit int) (*SearchResponse, error) {
	if authorID == "" {
		return nil, fmt.Errorf("authorID is required")
	}

	// Build query parameters
	params := map[string]string{
		"offset": strconv.Itoa(offset),
		"limit":  strconv.Itoa(limit),
	}
	if len(fields) > 0 {
		params["fields"] = joinStrings(fields, ",")
	}
	if limit == 0 {
		params["limit"] = strconv.Itoa(DefaultLimit)
	}

	// Build URL
	urlStr := c.baseURL + "/author/" + authorID + "/papers" + buildQueryString(params)

	// Perform request
	resp, err := c.doRequest("GET", urlStr, nil)
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
