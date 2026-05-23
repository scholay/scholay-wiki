// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package minicod

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"golang.org/x/sync/errgroup"
)

const (
	DefaultBaseURL      = "https://open.scholay.com"
	DefaultTimeout      = 60 * time.Second
	DialTimeout         = 15 * time.Second
	TLSHandshakeTimeout = 15 * time.Second
	KeepAlive           = 30 * time.Second

	// Search source constants — 与 api-1.json 上游 path 前缀对齐
	// 注意:PMD 上游只暴露 papers/search,**没有** papers/autocomplete;
	// 多源 autocomplete 走 multiSourcePaperAutocomplete 时 PMD 用 SearchPapers 降级。
	SourceSTC = "stc" // Scholay 精选 (STC / Semantic Scholar)
	SourceOLX = "olx" // Scholay 全域 (OpenAlex)
	SourcePMD = "pmd" // Scholay 医学 (PubMed / NCBI E-utilities)
)

// PaperSources lists the 3 paper sources we fan out to in suggestion mode.
// 顺序即"优先级"(展示时 STC 优先,OLX 其次,PMD 最后)。
var PaperSources = []string{SourceSTC, SourceOLX, SourcePMD}

// AuthorSources lists the 2 author sources(PMD 上游无 authors/* 接口)。
var AuthorSources = []string{SourceSTC, SourceOLX}

// sourcePrefix returns the API path prefix for the given source
// e.g. "stc" → "/v1/stc", "olx" → "/v1/olx", "pmd" → "/v1/pmd"
func sourcePrefix(source string) string {
	switch source {
	case SourceOLX:
		return "/v1/olx"
	case SourcePMD:
		return "/v1/pmd"
	default:
		return "/v1/stc"
	}
}

var (
	sharedTransport     *http.Transport
	sharedTransportOnce sync.Once
)

func getSharedTransport() *http.Transport {
	sharedTransportOnce.Do(func() {
		sharedTransport = &http.Transport{
			DialContext: (&net.Dialer{
				Timeout:   DialTimeout,
				KeepAlive: KeepAlive,
			}).DialContext,
			TLSHandshakeTimeout:   TLSHandshakeTimeout,
			ResponseHeaderTimeout: 30 * time.Second,
			ExpectContinueTimeout: 1 * time.Second,
			MaxIdleConns:          100,
			MaxIdleConnsPerHost:   20,
			IdleConnTimeout:       90 * time.Second,
			TLSClientConfig: &tls.Config{
				MinVersion: tls.VersionTLS12,
			},
		}
	})
	return sharedTransport
}

// Client represents a Minicod API client
type Client struct {
	apiKey     string
	httpClient *http.Client
	baseURL    string
}

// NewClient creates a new Minicod API client
func NewClient(apiKey string) *Client {
	return NewClientWithBaseURL(apiKey, DefaultBaseURL)
}

// NewClientWithBaseURL creates a new Minicod API client with custom base URL
func NewClientWithBaseURL(apiKey string, baseURL string) *Client {
	if baseURL == "" {
		baseURL = DefaultBaseURL
	}
	return &Client{
		apiKey: apiKey,
		httpClient: &http.Client{
			Timeout:   DefaultTimeout,
			Transport: getSharedTransport(),
		},
		baseURL: baseURL,
	}
}

// HasAPIKey returns true if the client has an API key configured
func (c *Client) HasAPIKey() bool {
	return c.apiKey != ""
}

// GetAPIKeyLength returns the length of the API key (for debugging)
func (c *Client) GetAPIKeyLength() int {
	return len(c.apiKey)
}

// doPost performs a POST request with JSON body and Bearer auth
func (c *Client) doPost(ctx context.Context, path string, body any) (json.RawMessage, error) {
	bodyBytes, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request body: %w", err)
	}

	url := c.baseURL + path
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	if c.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+c.apiKey)
		slog.Debug("minicod request", "path", path, "keyLength", len(c.apiKey))
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("minicod request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	// Check HTTP status
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("minicod API error (status %d): %s", resp.StatusCode, string(respBody))
	}

	// Parse envelope
	var apiResp APIResponse
	if err := json.Unmarshal(respBody, &apiResp); err != nil {
		return nil, fmt.Errorf("failed to parse minicod response: %w (body: %s)", err, string(respBody))
	}

	// Check business error code
	if apiResp.Code != 0 {
		return nil, fmt.Errorf("minicod API error (code %d): %s", apiResp.Code, apiResp.Message)
	}

	return apiResp.Data, nil
}

// ======================== STC Paper Endpoints ========================

// SearchPapers searches for papers via STC source
func (c *Client) SearchPapers(ctx context.Context, opts PaperSearchOptions) (*SearchResponse, error) {
	// 通用字段(所有源都支持):query / limit / offset / year_from / year_to /
	//   date_from / date_to / venue / fields / sort
	body := map[string]any{
		"query": opts.Query,
	}
	if opts.Limit > 0 {
		body["limit"] = opts.Limit
	}
	if opts.Offset > 0 {
		body["offset"] = opts.Offset
	}
	if opts.YearFrom > 0 {
		body["year_from"] = opts.YearFrom
	}
	if opts.YearTo > 0 {
		body["year_to"] = opts.YearTo
	}
	if opts.DateFrom != "" {
		body["date_from"] = opts.DateFrom
	}
	if opts.DateTo != "" {
		body["date_to"] = opts.DateTo
	}
	if len(opts.Fields) > 0 {
		body["fields"] = strings.Join(opts.Fields, ",")
	}
	if len(opts.Venue) > 0 {
		body["venue"] = strings.Join(opts.Venue, ",")
	}
	if opts.Sort != "" && opts.Sort != "relevance" {
		// 上游 stc 的 relevance 端点忽略 sort;只在用户明确选择 citations/date 时传。
		body["sort"] = opts.Sort
	}

	// 仅 stc/olx 支持的字段(PMD 上游无对应参数,传过去会被忽略或拒)
	if opts.Source != SourcePMD {
		if len(opts.PublicationTypes) > 0 {
			body["types"] = opts.PublicationTypes
		}
		if opts.OpenAccessPDF == "true" {
			body["open_access"] = true
		}
		if opts.MinCitationCount > 0 {
			body["min_citations"] = opts.MinCitationCount
		}
		if len(opts.FieldsOfStudy) > 0 {
			body["subjects"] = opts.FieldsOfStudy
		}
	}

	prefix := sourcePrefix(opts.Source)
	data, err := c.doPost(ctx, prefix+"/papers/search", body)
	if err != nil {
		return nil, err
	}

	var raw RawPaperSearchResult
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("failed to parse paper search result: %w", err)
	}

	// Convert to frontend-compatible format
	result := &SearchResponse{
		Total:  raw.Total,
		Offset: raw.Offset,
		Data:   ConvertPapers(raw.Items),
	}
	if raw.Offset+raw.Limit < raw.Total {
		result.Next = raw.Offset + raw.Limit
	}

	return result, nil
}

// GetPaper retrieves paper details
func (c *Client) GetPaper(ctx context.Context, paperID string, opts PaperDetailsOptions) (*Paper, error) {
	body := map[string]any{
		"id": paperID,
	}
	if len(opts.Fields) > 0 {
		body["fields"] = strings.Join(opts.Fields, ",")
	}

	// Determine endpoint based on ID prefix
	path := "/v1/stc/papers/get"
	if strings.HasPrefix(paperID, "olx:") {
		path = "/v1/olx/works/get"
		// Strip prefix — OLX API expects raw ID (e.g., "W2726369860")
		body["id"] = strings.TrimPrefix(paperID, "olx:")
		// OLX uses "select" instead of "fields"
		if len(opts.Fields) > 0 {
			delete(body, "fields")
			body["select"] = strings.Join(opts.Fields, ",")
		}
	}

	data, err := c.doPost(ctx, path, body)
	if err != nil {
		return nil, err
	}

	var raw RawPaper
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("failed to parse paper detail: %w", err)
	}

	paper := ConvertPaper(raw)
	return &paper, nil
}

// GetPaperBatch retrieves multiple papers by IDs.
//
// 按 ID 前缀分桶分别请求各源批量端点,合并结果。前缀约定:
//   - "olx:..."  → /v1/olx/works/batch  (剥前缀)
//   - "pmd:..."  → /v1/pmd/papers/batch (剥前缀)
//   - 其他       → /v1/stc/papers/batch (原值)
//
// 跨源混合 ID 也 OK,三组各发一个请求,并行/串行(此处串行,样本量小)。
// 注:OLX 用 "select" 替代 "fields" 字段名 —— 上游历史命名差异。
func (c *Client) GetPaperBatch(ctx context.Context, paperIDs []string, fields []string) ([]Paper, error) {
	if len(paperIDs) == 0 {
		return nil, nil
	}

	var stcIDs, olxIDs, pmdIDs []string
	for _, id := range paperIDs {
		switch {
		case strings.HasPrefix(id, "olx:"):
			olxIDs = append(olxIDs, strings.TrimPrefix(id, "olx:"))
		case strings.HasPrefix(id, "pmd:"):
			pmdIDs = append(pmdIDs, strings.TrimPrefix(id, "pmd:"))
		default:
			stcIDs = append(stcIDs, id)
		}
	}

	out := make([]Paper, 0, len(paperIDs))

	if len(stcIDs) > 0 {
		body := map[string]any{"ids": stcIDs}
		if len(fields) > 0 {
			body["fields"] = strings.Join(fields, ",")
		}
		data, err := c.doPost(ctx, "/v1/stc/papers/batch", body)
		if err != nil {
			return nil, err
		}
		var raws []RawPaper
		if err := json.Unmarshal(data, &raws); err != nil {
			return nil, fmt.Errorf("failed to parse stc batch papers: %w", err)
		}
		out = append(out, ConvertPapers(raws)...)
	}

	if len(olxIDs) > 0 {
		body := map[string]any{"ids": olxIDs}
		if len(fields) > 0 {
			body["select"] = strings.Join(fields, ",")
		}
		data, err := c.doPost(ctx, "/v1/olx/works/batch", body)
		if err != nil {
			return nil, err
		}
		var raws []RawPaper
		if err := json.Unmarshal(data, &raws); err != nil {
			return nil, fmt.Errorf("failed to parse olx batch papers: %w", err)
		}
		out = append(out, ConvertPapers(raws)...)
	}

	if len(pmdIDs) > 0 {
		// PMD 的 /v1/pmd/papers/batch 上游走 NCBI esummary,**只返元数据,没 abstract**。
		// 经实测,STC 的 /v1/stc/papers/get 单篇接口会用同一 ID 跑 efetch 拿 abstract
		// (与 GetPaper 单篇路径一致)—— fan-out 复用这个,保留 `pmd:` 前缀。
		// sem 限并发避免上游打爆;单篇失败静默丢弃,不阻塞整批。
		const pmdConcurrency = 8
		results := make([]Paper, len(pmdIDs))
		ok := make([]bool, len(pmdIDs))

		eg, egCtx := errgroup.WithContext(ctx)
		eg.SetLimit(pmdConcurrency)

		for i, id := range pmdIDs {
			i, id := i, id
			fullID := "pmd:" + id // 上面把前缀剥掉了,这里要补回
			eg.Go(func() error {
				body := map[string]any{"id": fullID}
				if len(fields) > 0 {
					body["fields"] = strings.Join(fields, ",")
				}
				data, err := c.doPost(egCtx, "/v1/stc/papers/get", body)
				if err != nil {
					return nil // 单篇失败不冒泡,后面 ok[i]=false 即可
				}
				var raw RawPaper
				if err := json.Unmarshal(data, &raw); err != nil {
					return nil
				}
				results[i] = ConvertPaper(raw)
				ok[i] = true
				return nil
			})
		}
		_ = eg.Wait()

		for i, p := range results {
			if ok[i] {
				out = append(out, p)
			}
		}
	}

	return out, nil
}

// GetPaperCitations retrieves papers that cite the given paper
func (c *Client) GetPaperCitations(ctx context.Context, paperID string, opts CitationsOptions) (*CitationsResponse, error) {
	body := map[string]any{
		"paper_id": paperID,
	}
	if opts.Limit > 0 {
		body["limit"] = opts.Limit
	}
	if opts.Offset > 0 {
		body["offset"] = opts.Offset
	}
	if len(opts.Fields) > 0 {
		body["fields"] = strings.Join(opts.Fields, ",")
	}

	// Determine endpoint based on ID prefix
	path := "/v1/stc/papers/citations"
	if strings.HasPrefix(paperID, "olx:") {
		path = "/v1/olx/works/citations"
		body["paper_id"] = strings.TrimPrefix(paperID, "olx:")
	}

	data, err := c.doPost(ctx, path, body)
	if err != nil {
		return nil, err
	}

	var raw RawPaperSearchResult
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("failed to parse citations: %w", err)
	}

	result := &CitationsResponse{
		Offset: raw.Offset,
		Data:   ConvertPapersToCitations(raw.Items),
	}
	if raw.Offset+raw.Limit < raw.Total {
		result.Next = raw.Offset + raw.Limit
	}

	return result, nil
}

// GetPaperReferences retrieves papers referenced by the given paper
func (c *Client) GetPaperReferences(ctx context.Context, paperID string, opts CitationsOptions) (*ReferencesResponse, error) {
	body := map[string]any{
		"paper_id": paperID,
	}
	if opts.Limit > 0 {
		body["limit"] = opts.Limit
	}
	if opts.Offset > 0 {
		body["offset"] = opts.Offset
	}
	if len(opts.Fields) > 0 {
		body["fields"] = strings.Join(opts.Fields, ",")
	}

	path := "/v1/stc/papers/references"
	if strings.HasPrefix(paperID, "olx:") {
		path = "/v1/olx/works/references"
		body["paper_id"] = strings.TrimPrefix(paperID, "olx:")
	}

	data, err := c.doPost(ctx, path, body)
	if err != nil {
		return nil, err
	}

	var raw RawPaperSearchResult
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("failed to parse references: %w", err)
	}

	result := &ReferencesResponse{
		Offset: raw.Offset,
		Data:   ConvertPapersToCitations(raw.Items),
	}
	if raw.Offset+raw.Limit < raw.Total {
		result.Next = raw.Offset + raw.Limit
	}

	return result, nil
}

// GetPaperAuthors retrieves authors of a specific paper
func (c *Client) GetPaperAuthors(ctx context.Context, paperID string, fields []string, offset, limit int) (*AuthorSearchResponse, error) {
	body := map[string]any{
		"paper_id": paperID,
	}
	if limit > 0 {
		body["limit"] = limit
	}
	if offset > 0 {
		body["offset"] = offset
	}
	if len(fields) > 0 {
		body["fields"] = strings.Join(fields, ",")
	}

	path := "/v1/stc/papers/authors"
	if strings.HasPrefix(paperID, "olx:") {
		path = "/v1/olx/works/authors"
		body["paper_id"] = strings.TrimPrefix(paperID, "olx:")
	}

	data, err := c.doPost(ctx, path, body)
	if err != nil {
		return nil, err
	}

	var raw RawAuthorSearchResult
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("failed to parse paper authors: %w", err)
	}

	return &AuthorSearchResponse{
		Total:  raw.Total,
		Offset: raw.Offset,
		Data:   ConvertAuthors(raw.Items),
	}, nil
}

// PaperAutocomplete returns paper title suggestions
func (c *Client) PaperAutocomplete(ctx context.Context, query, source string) (*AutocompleteResponse, error) {
	body := map[string]any{
		"query": query,
	}

	prefix := sourcePrefix(source)
	data, err := c.doPost(ctx, prefix+"/papers/autocomplete", body)
	if err != nil {
		return nil, err
	}

	var raws []RawAutocompleteItem
	if err := json.Unmarshal(data, &raws); err != nil {
		return nil, fmt.Errorf("failed to parse autocomplete: %w", err)
	}

	matches := make([]AutocompleteMatch, 0, len(raws))
	for _, r := range raws {
		matches = append(matches, AutocompleteMatch{
			ID:    r.ID,
			Title: r.Title,
		})
	}

	return &AutocompleteResponse{Matches: matches}, nil
}

// ======================== STC Author Endpoints ========================

// SearchAuthors searches for authors
func (c *Client) SearchAuthors(ctx context.Context, opts AuthorSearchOptions) (*AuthorSearchResponse, error) {
	body := map[string]any{
		"query": opts.Query,
	}
	if opts.Limit > 0 {
		body["limit"] = opts.Limit
	}
	if opts.Offset > 0 {
		body["offset"] = opts.Offset
	}
	if len(opts.Fields) > 0 {
		body["fields"] = strings.Join(opts.Fields, ",")
	}

	prefix := sourcePrefix(opts.Source)
	data, err := c.doPost(ctx, prefix+"/authors/search", body)
	if err != nil {
		return nil, err
	}

	var raw RawAuthorSearchResult
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("failed to parse author search: %w", err)
	}

	return &AuthorSearchResponse{
		Total:  raw.Total,
		Offset: raw.Offset,
		Data:   ConvertAuthors(raw.Items),
	}, nil
}

// GetAuthor retrieves author details
func (c *Client) GetAuthor(ctx context.Context, authorID string, fields []string) (*Author, error) {
	body := map[string]any{
		"id": authorID,
	}
	if len(fields) > 0 {
		body["fields"] = strings.Join(fields, ",")
	}

	path := "/v1/stc/authors/get"
	if strings.HasPrefix(authorID, "olx:") {
		path = "/v1/olx/authors/get"
		body["id"] = strings.TrimPrefix(authorID, "olx:")
		if len(fields) > 0 {
			delete(body, "fields")
			body["select"] = strings.Join(fields, ",")
		}
	}

	data, err := c.doPost(ctx, path, body)
	if err != nil {
		return nil, err
	}

	var raw RawAuthor
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("failed to parse author detail: %w", err)
	}

	author := ConvertAuthor(raw)
	return &author, nil
}

// GetAuthorPapers retrieves papers by a specific author
func (c *Client) GetAuthorPapers(ctx context.Context, authorID string, fields []string, offset, limit int) (*SearchResponse, error) {
	body := map[string]any{
		"author_id": authorID,
	}
	if limit > 0 {
		body["limit"] = limit
	}
	if offset > 0 {
		body["offset"] = offset
	}
	if len(fields) > 0 {
		body["fields"] = strings.Join(fields, ",")
	}

	path := "/v1/stc/authors/papers"
	if strings.HasPrefix(authorID, "olx:") {
		path = "/v1/olx/authors/papers"
		body["author_id"] = strings.TrimPrefix(authorID, "olx:")
	}

	data, err := c.doPost(ctx, path, body)
	if err != nil {
		return nil, err
	}

	var raw RawPaperSearchResult
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("failed to parse author papers: %w", err)
	}

	result := &SearchResponse{
		Total:  raw.Total,
		Offset: raw.Offset,
		Data:   ConvertPapers(raw.Items),
	}
	if raw.Offset+raw.Limit < raw.Total {
		result.Next = raw.Offset + raw.Limit
	}

	return result, nil
}

// ======================== STC Recommendation Endpoints ========================

// GetRecommendationsForPaper gets recommendations based on a single paper
func (c *Client) GetRecommendationsForPaper(ctx context.Context, paperID string, opts RecommendationsOptions) (*RecommendationsResponse, error) {
	body := map[string]any{
		"paper_id": paperID,
	}
	if opts.Limit > 0 {
		body["limit"] = opts.Limit
	}
	if len(opts.Fields) > 0 {
		body["fields"] = strings.Join(opts.Fields, ",")
	}

	data, err := c.doPost(ctx, "/v1/stc/recommendations/paper", body)
	if err != nil {
		return nil, err
	}

	var raw RawRecommendationResult
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("failed to parse recommendations: %w", err)
	}

	return &RecommendationsResponse{
		RecommendedPapers: ConvertPapers(raw.RecommendedPapers),
	}, nil
}

// GetRecommendations gets recommendations based on positive/negative examples
func (c *Client) GetRecommendations(ctx context.Context, opts RecommendationsOptions) (*RecommendationsResponse, error) {
	body := map[string]any{
		"positive_paper_ids": opts.PositivePaperIDs,
	}
	if len(opts.NegativePaperIDs) > 0 {
		body["negative_paper_ids"] = opts.NegativePaperIDs
	}
	if opts.Limit > 0 {
		body["limit"] = opts.Limit
	}
	if len(opts.Fields) > 0 {
		body["fields"] = strings.Join(opts.Fields, ",")
	}

	data, err := c.doPost(ctx, "/v1/stc/recommendations", body)
	if err != nil {
		return nil, err
	}

	var raw RawRecommendationResult
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("failed to parse recommendations: %w", err)
	}

	return &RecommendationsResponse{
		RecommendedPapers: ConvertPapers(raw.RecommendedPapers),
	}, nil
}

// ======================== JNL Journal Endpoints ========================

// SearchJournals searches journals with multi-dimensional filtering
func (c *Client) SearchJournals(ctx context.Context, opts JournalSearchOptions) (json.RawMessage, error) {
	return c.doPost(ctx, "/v1/jnl/search", opts)
}

// ListJournals lists journals with basic filtering and sorting
func (c *Client) ListJournals(ctx context.Context, opts JournalListOptions) (json.RawMessage, error) {
	return c.doPost(ctx, "/v1/jnl/list", opts)
}

// GetJournal retrieves a single journal by ID
func (c *Client) GetJournal(ctx context.Context, id int, full string) (json.RawMessage, error) {
	body := map[string]any{
		"id": id,
	}
	if full != "" {
		body["full"] = full
	}
	return c.doPost(ctx, "/v1/jnl/get", body)
}

// GetJournalFilters returns available filter options for journal search
func (c *Client) GetJournalFilters(ctx context.Context) (json.RawMessage, error) {
	return c.doPost(ctx, "/v1/jnl/filters", map[string]any{})
}

// GetJournalStats returns journal statistics overview
func (c *Client) GetJournalStats(ctx context.Context) (json.RawMessage, error) {
	return c.doPost(ctx, "/v1/jnl/stats", map[string]any{})
}

// GetJournalByISSN retrieves a journal by ISSN
func (c *Client) GetJournalByISSN(ctx context.Context, issn string, full string) (json.RawMessage, error) {
	body := map[string]any{
		"issn": issn,
	}
	if full != "" {
		body["full"] = full
	}
	return c.doPost(ctx, "/v1/jnl/byIssn", body)
}

// CompareJournals compares 2-10 journals
func (c *Client) CompareJournals(ctx context.Context, ids string) (json.RawMessage, error) {
	return c.doPost(ctx, "/v1/jnl/compare", map[string]any{"ids": ids})
}

// SuggestJournals returns journal-name prefix autocomplete suggestions.
//
// Upstream contract (POST /v1/jnl/suggest):
//   q: required prefix
//   limit / min_sources / has_sources: optional shaping
// Lightweight fields: id / canonical_name / issn_l / source_count / openalex_works_count
func (c *Client) SuggestJournals(ctx context.Context, q string, limit int) (json.RawMessage, error) {
	body := map[string]any{"q": q}
	if limit > 0 {
		body["limit"] = limit
	}
	return c.doPost(ctx, "/v1/jnl/suggest", body)
}

// JournalsByNames batches journal lookups by canonical_name.
//
// Upstream contract (POST /v1/jnl/byNames):
//   names: required, comma-separated canonical names (e.g. "Nature,Cell")
//   full:  optional, "0" | "1" | "true"
//   fields: optional, comma-separated whitelist (mutually exclusive with full)
//
// 用于"一页搜索结果一次性补 Q 分区/IF"的场景，避免逐篇请求。
func (c *Client) JournalsByNames(ctx context.Context, names, fields string) (json.RawMessage, error) {
	body := map[string]any{"names": names}
	if fields != "" {
		body["fields"] = fields
	}
	return c.doPost(ctx, "/v1/jnl/byNames", body)
}

// JournalsByISSNs batches journal lookups by ISSN.
// Upstream caps at 100 ISSNs per call.
func (c *Client) JournalsByISSNs(ctx context.Context, issns, fields string) (json.RawMessage, error) {
	body := map[string]any{"issns": issns}
	if fields != "" {
		body["fields"] = fields
	}
	return c.doPost(ctx, "/v1/jnl/batch", body)
}
