// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package minicod

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"

	"scholar-backend/internal/common/cache"
	"scholar-backend/internal/common/circuitbreaker"
	"scholar-backend/internal/common/safego"
	"scholar-backend/internal/thirdparty"
)

const MaxRetries = 5

// Manager manages Minicod API clients with key rotation
type Manager struct {
	accountService *thirdparty.Service
}

// NewManager creates a new Minicod client manager.
//
// base URL 来源优先级(在 getClientWithAccountID 里按此顺序尝试):
//   1. third_party_accounts 当前账户的 MinicodConfig.BaseURL(管理后台配)
//   2. minicod.DefaultBaseURL 常量(代码内兜底,默认 https://open.scholay.com)
//
// env 层不再单独提供 OPENALEX_BASE_URL —— 因为兜底 URL 没有配套 API key,
// 实际可用性的来源始终是管理后台 third_party_accounts 的整行配置。
func NewManager(accountService *thirdparty.Service) *Manager {
	return &Manager{
		accountService: accountService,
	}
}

// isRetryableError checks if an error is retryable (auth or rate limit)
func isRetryableError(err error) bool {
	if err == nil {
		return false
	}
	errStr := err.Error()
	return strings.Contains(errStr, "401") ||
		strings.Contains(errStr, "40101") ||
		strings.Contains(errStr, "429") ||
		strings.Contains(errStr, "42901") ||
		strings.Contains(errStr, "Too Many Requests") ||
		strings.Contains(errStr, "Unauthorized")
}

// executeWithRetry executes an operation with retry logic and key rotation
func (m *Manager) executeWithRetry(operation func(client *Client) (any, error)) (any, error) {
	var lastErr error
	usedAccountIDs := make(map[uint]bool)

	for attempt := 0; attempt <= MaxRetries; attempt++ {
		client, accountID, err := m.getClientWithAccountID()
		if err != nil {
			slog.Warn("minicod: failed to get client", "attempt", attempt+1, "err", err)
			lastErr = err
			continue
		}

		if attempt > 0 && usedAccountIDs[accountID] {
			slog.Debug("minicod: account already tried, skipping", "attempt", attempt+1, "accountID", accountID)
			continue
		}

		usedAccountIDs[accountID] = true

		if attempt > 0 {
			slog.Info("minicod: retry attempt", "attempt", attempt, "maxRetries", MaxRetries, "accountID", accountID)
		}

		result, err := operation(client)
		if err == nil {
			return result, nil
		}

		lastErr = err

		if isRetryableError(err) {
			slog.Warn("minicod: retryable error", "attempt", attempt+1, "accountID", accountID, "err", err)
			continue
		}

		slog.Error("minicod: non-retryable error", "attempt", attempt+1, "err", err)
		return nil, err
	}

	return nil, fmt.Errorf("minicod: all %d retry attempts failed, last error: %w", MaxRetries+1, lastErr)
}

// getClientWithAccountID gets a client with API key from account service
func (m *Manager) getClientWithAccountID() (*Client, uint, error) {
	apiKey, accountID, err := m.accountService.GetRandomAPIKey(thirdparty.AccountTypeMinicod)
	if err != nil {
		return nil, 0, fmt.Errorf("minicod: no API key available: %w", err)
	}

	slog.Debug("minicod: got API key", "keyLength", len(apiKey), "accountID", accountID)

	// Base URL 优先级: third_party_accounts 配置 > minicod.DefaultBaseURL 常量
	accounts, err := m.accountService.GetActiveAccountsByType(thirdparty.AccountTypeMinicod)
	if err != nil || len(accounts) == 0 {
		// 没拿到账户(异常路径) → 用 const 兜底,NewClientWithBaseURL 会接 ""
		return NewClient(apiKey), accountID, nil
	}

	baseURL := ""
	for _, account := range accounts {
		if account.ID == accountID {
			config, err := account.GetMinicodConfig()
			if err == nil && config.BaseURL != "" {
				baseURL = config.BaseURL
				slog.Debug("minicod: using account-level custom base URL", "baseURL", baseURL)
			}
			break
		}
	}

	// baseURL 为空时 NewClientWithBaseURL 会用 DefaultBaseURL 常量兜底
	return NewClientWithBaseURL(apiKey, baseURL), accountID, nil
}

// ======================== Paper Methods ========================

func (m *Manager) SearchPapers(ctx context.Context, opts PaperSearchOptions) (*SearchResponse, error) {
	params := map[string]any{
		"query":            opts.Query,
		"yearFrom":         opts.YearFrom,
		"yearTo":           opts.YearTo,
		"publicationTypes": opts.PublicationTypes,
		"openAccessPDF":    opts.OpenAccessPDF,
		"venue":            opts.Venue,
		"fieldsOfStudy":    opts.FieldsOfStudy,
		"fields":           opts.Fields,
		"offset":           opts.Offset,
		"limit":            opts.Limit,
		"minCitations":     opts.MinCitationCount,
		"source":           opts.Source,
	}
	var resp SearchResponse
	err := cache.GetOrSetMinicodSearch(ctx, params, func() (any, error) {
		return m.fetchSearchPapers(ctx, opts)
	}, &resp)
	if err != nil {
		return nil, err
	}
	return &resp, nil
}

func (m *Manager) fetchSearchPapers(ctx context.Context, opts PaperSearchOptions) (*SearchResponse, error) {
	result, err := circuitbreaker.MinicodBreaker.Execute(func() (any, error) {
		return m.executeWithRetry(func(client *Client) (any, error) {
			return client.SearchPapers(ctx, opts)
		})
	})
	if err != nil {
		if circuitbreaker.IsCircuitBreakerError(err) {
			return nil, fmt.Errorf("minicod service temporarily unavailable (circuit breaker open): %w", err)
		}
		return nil, err
	}
	return result.(*SearchResponse), nil
}

func (m *Manager) GetPaper(ctx context.Context, paperID string, opts PaperDetailsOptions) (*Paper, error) {
	var resp Paper
	err := cache.GetOrSetMinicodPaper(ctx, paperID, opts.Fields, func() (any, error) {
		return m.fetchGetPaper(ctx, paperID, opts)
	}, &resp)
	if err != nil {
		return nil, err
	}
	return &resp, nil
}

func (m *Manager) fetchGetPaper(ctx context.Context, paperID string, opts PaperDetailsOptions) (*Paper, error) {
	result, err := circuitbreaker.MinicodBreaker.Execute(func() (any, error) {
		return m.executeWithRetry(func(client *Client) (any, error) {
			return client.GetPaper(ctx, paperID, opts)
		})
	})
	if err != nil {
		if circuitbreaker.IsCircuitBreakerError(err) {
			return nil, fmt.Errorf("minicod service temporarily unavailable (circuit breaker open): %w", err)
		}
		return nil, err
	}
	return result.(*Paper), nil
}

func (m *Manager) GetPaperBatch(ctx context.Context, paperIDs []string, fields []string) ([]Paper, error) {
	var resp []Paper
	err := cache.GetOrSetMinicodPaperBatch(ctx, paperIDs, fields, func() (any, error) {
		return m.fetchGetPaperBatch(ctx, paperIDs, fields)
	}, &resp)
	if err != nil {
		return nil, err
	}
	return resp, nil
}

func (m *Manager) fetchGetPaperBatch(ctx context.Context, paperIDs []string, fields []string) ([]Paper, error) {
	result, err := circuitbreaker.MinicodBreaker.Execute(func() (any, error) {
		return m.executeWithRetry(func(client *Client) (any, error) {
			return client.GetPaperBatch(ctx, paperIDs, fields)
		})
	})
	if err != nil {
		if circuitbreaker.IsCircuitBreakerError(err) {
			return nil, fmt.Errorf("minicod service temporarily unavailable (circuit breaker open): %w", err)
		}
		return nil, err
	}
	return result.([]Paper), nil
}

func (m *Manager) GetPaperCitations(ctx context.Context, paperID string, opts CitationsOptions) (*CitationsResponse, error) {
	params := map[string]any{"fields": opts.Fields, "offset": opts.Offset, "limit": opts.Limit}
	var resp CitationsResponse
	err := cache.GetOrSetMinicodCitations(ctx, paperID, params, func() (any, error) {
		return m.fetchGetPaperCitations(ctx, paperID, opts)
	}, &resp)
	if err != nil {
		return nil, err
	}
	return &resp, nil
}

func (m *Manager) fetchGetPaperCitations(ctx context.Context, paperID string, opts CitationsOptions) (*CitationsResponse, error) {
	result, err := circuitbreaker.MinicodBreaker.Execute(func() (any, error) {
		return m.executeWithRetry(func(client *Client) (any, error) {
			return client.GetPaperCitations(ctx, paperID, opts)
		})
	})
	if err != nil {
		if circuitbreaker.IsCircuitBreakerError(err) {
			return nil, fmt.Errorf("minicod service temporarily unavailable (circuit breaker open): %w", err)
		}
		return nil, err
	}
	return result.(*CitationsResponse), nil
}

func (m *Manager) GetPaperReferences(ctx context.Context, paperID string, opts CitationsOptions) (*ReferencesResponse, error) {
	params := map[string]any{"fields": opts.Fields, "offset": opts.Offset, "limit": opts.Limit}
	var resp ReferencesResponse
	err := cache.GetOrSetMinicodReferences(ctx, paperID, params, func() (any, error) {
		return m.fetchGetPaperReferences(ctx, paperID, opts)
	}, &resp)
	if err != nil {
		return nil, err
	}
	return &resp, nil
}

func (m *Manager) fetchGetPaperReferences(ctx context.Context, paperID string, opts CitationsOptions) (*ReferencesResponse, error) {
	result, err := circuitbreaker.MinicodBreaker.Execute(func() (any, error) {
		return m.executeWithRetry(func(client *Client) (any, error) {
			return client.GetPaperReferences(ctx, paperID, opts)
		})
	})
	if err != nil {
		if circuitbreaker.IsCircuitBreakerError(err) {
			return nil, fmt.Errorf("minicod service temporarily unavailable (circuit breaker open): %w", err)
		}
		return nil, err
	}
	return result.(*ReferencesResponse), nil
}

func (m *Manager) GetPaperAuthors(ctx context.Context, paperID string, fields []string, offset, limit int) (*AuthorSearchResponse, error) {
	var resp AuthorSearchResponse
	err := cache.GetOrSetMinicodPaperAuthors(ctx, paperID, fields, offset, limit, func() (any, error) {
		return m.fetchGetPaperAuthors(ctx, paperID, fields, offset, limit)
	}, &resp)
	if err != nil {
		return nil, err
	}
	return &resp, nil
}

func (m *Manager) fetchGetPaperAuthors(ctx context.Context, paperID string, fields []string, offset, limit int) (*AuthorSearchResponse, error) {
	result, err := circuitbreaker.MinicodBreaker.Execute(func() (any, error) {
		return m.executeWithRetry(func(client *Client) (any, error) {
			return client.GetPaperAuthors(ctx, paperID, fields, offset, limit)
		})
	})
	if err != nil {
		if circuitbreaker.IsCircuitBreakerError(err) {
			return nil, fmt.Errorf("minicod service temporarily unavailable (circuit breaker open): %w", err)
		}
		return nil, err
	}
	return result.(*AuthorSearchResponse), nil
}

func (m *Manager) PaperAutocomplete(ctx context.Context, query, source string) (*AutocompleteResponse, error) {
	var resp AutocompleteResponse
	err := cache.GetOrSetMinicodAutocomplete(ctx, query, source, func() (any, error) {
		return m.fetchPaperAutocomplete(ctx, query, source)
	}, &resp)
	if err != nil {
		return nil, err
	}
	return &resp, nil
}

func (m *Manager) fetchPaperAutocomplete(ctx context.Context, query, source string) (*AutocompleteResponse, error) {
	result, err := circuitbreaker.MinicodBreaker.Execute(func() (any, error) {
		return m.executeWithRetry(func(client *Client) (any, error) {
			return client.PaperAutocomplete(ctx, query, source)
		})
	})
	if err != nil {
		if circuitbreaker.IsCircuitBreakerError(err) {
			return nil, fmt.Errorf("minicod service temporarily unavailable (circuit breaker open): %w", err)
		}
		return nil, err
	}
	return result.(*AutocompleteResponse), nil
}

// ======================== Author Methods ========================

func (m *Manager) SearchAuthors(ctx context.Context, opts AuthorSearchOptions) (*AuthorSearchResponse, error) {
	params := map[string]any{
		"query":  opts.Query,
		"fields": opts.Fields,
		"offset": opts.Offset,
		"limit":  opts.Limit,
		"source": opts.Source,
	}
	var resp AuthorSearchResponse
	err := cache.GetOrSetMinicodAuthorSearch(ctx, params, func() (any, error) {
		return m.fetchSearchAuthors(ctx, opts)
	}, &resp)
	if err != nil {
		return nil, err
	}
	return &resp, nil
}

func (m *Manager) fetchSearchAuthors(ctx context.Context, opts AuthorSearchOptions) (*AuthorSearchResponse, error) {
	result, err := circuitbreaker.MinicodBreaker.Execute(func() (any, error) {
		return m.executeWithRetry(func(client *Client) (any, error) {
			return client.SearchAuthors(ctx, opts)
		})
	})
	if err != nil {
		if circuitbreaker.IsCircuitBreakerError(err) {
			return nil, fmt.Errorf("minicod service temporarily unavailable (circuit breaker open): %w", err)
		}
		return nil, err
	}
	return result.(*AuthorSearchResponse), nil
}

func (m *Manager) GetAuthor(ctx context.Context, authorID string, fields []string) (*Author, error) {
	var resp Author
	err := cache.GetOrSetMinicodAuthor(ctx, authorID, fields, func() (any, error) {
		return m.fetchGetAuthor(ctx, authorID, fields)
	}, &resp)
	if err != nil {
		return nil, err
	}
	return &resp, nil
}

func (m *Manager) fetchGetAuthor(ctx context.Context, authorID string, fields []string) (*Author, error) {
	result, err := circuitbreaker.MinicodBreaker.Execute(func() (any, error) {
		return m.executeWithRetry(func(client *Client) (any, error) {
			return client.GetAuthor(ctx, authorID, fields)
		})
	})
	if err != nil {
		if circuitbreaker.IsCircuitBreakerError(err) {
			return nil, fmt.Errorf("minicod service temporarily unavailable (circuit breaker open): %w", err)
		}
		return nil, err
	}
	return result.(*Author), nil
}

func (m *Manager) GetAuthorPapers(ctx context.Context, authorID string, fields []string, offset, limit int) (*SearchResponse, error) {
	var resp SearchResponse
	err := cache.GetOrSetMinicodAuthorPapers(ctx, authorID, fields, offset, limit, func() (any, error) {
		return m.fetchGetAuthorPapers(ctx, authorID, fields, offset, limit)
	}, &resp)
	if err != nil {
		return nil, err
	}
	return &resp, nil
}

func (m *Manager) fetchGetAuthorPapers(ctx context.Context, authorID string, fields []string, offset, limit int) (*SearchResponse, error) {
	result, err := circuitbreaker.MinicodBreaker.Execute(func() (any, error) {
		return m.executeWithRetry(func(client *Client) (any, error) {
			return client.GetAuthorPapers(ctx, authorID, fields, offset, limit)
		})
	})
	if err != nil {
		if circuitbreaker.IsCircuitBreakerError(err) {
			return nil, fmt.Errorf("minicod service temporarily unavailable (circuit breaker open): %w", err)
		}
		return nil, err
	}
	return result.(*SearchResponse), nil
}

// ======================== Recommendation Methods ========================

func (m *Manager) GetRecommendationsForPaper(ctx context.Context, paperID string, opts RecommendationsOptions) (*RecommendationsResponse, error) {
	params := map[string]any{"fields": opts.Fields, "limit": opts.Limit}
	var resp RecommendationsResponse
	err := cache.GetOrSetMinicodRecForPaper(ctx, paperID, params, func() (any, error) {
		return m.fetchGetRecommendationsForPaper(ctx, paperID, opts)
	}, &resp)
	if err != nil {
		return nil, err
	}
	return &resp, nil
}

func (m *Manager) fetchGetRecommendationsForPaper(ctx context.Context, paperID string, opts RecommendationsOptions) (*RecommendationsResponse, error) {
	result, err := circuitbreaker.MinicodBreaker.Execute(func() (any, error) {
		return m.executeWithRetry(func(client *Client) (any, error) {
			return client.GetRecommendationsForPaper(ctx, paperID, opts)
		})
	})
	if err != nil {
		if circuitbreaker.IsCircuitBreakerError(err) {
			return nil, fmt.Errorf("minicod service temporarily unavailable (circuit breaker open): %w", err)
		}
		return nil, err
	}
	return result.(*RecommendationsResponse), nil
}

func (m *Manager) GetRecommendations(ctx context.Context, opts RecommendationsOptions) (*RecommendationsResponse, error) {
	params := map[string]any{
		"fields":      opts.Fields,
		"limit":       opts.Limit,
		"positiveIds": opts.PositivePaperIDs,
		"negativeIds": opts.NegativePaperIDs,
	}
	var resp RecommendationsResponse
	err := cache.GetOrSetMinicodRec(ctx, params, func() (any, error) {
		return m.fetchGetRecommendations(ctx, opts)
	}, &resp)
	if err != nil {
		return nil, err
	}
	return &resp, nil
}

func (m *Manager) fetchGetRecommendations(ctx context.Context, opts RecommendationsOptions) (*RecommendationsResponse, error) {
	result, err := circuitbreaker.MinicodBreaker.Execute(func() (any, error) {
		return m.executeWithRetry(func(client *Client) (any, error) {
			return client.GetRecommendations(ctx, opts)
		})
	})
	if err != nil {
		if circuitbreaker.IsCircuitBreakerError(err) {
			return nil, fmt.Errorf("minicod service temporarily unavailable (circuit breaker open): %w", err)
		}
		return nil, err
	}
	return result.(*RecommendationsResponse), nil
}

// ======================== Search Suggestions ========================

// GetSearchSuggestions returns combined paper and author suggestions
func (m *Manager) GetSearchSuggestions(ctx context.Context, query, source string, paperLimit, authorLimit int) (*SearchSuggestionsResponse, error) {
	if query == "" {
		return nil, fmt.Errorf("query is required")
	}
	if paperLimit <= 0 {
		paperLimit = 5
	}
	if authorLimit <= 0 {
		authorLimit = 5
	}

	var resp SearchSuggestionsResponse
	err := cache.GetOrSetMinicodSuggestions(ctx, query, source, paperLimit, authorLimit, func() (any, error) {
		return m.fetchSearchSuggestions(ctx, query, source, paperLimit, authorLimit)
	}, &resp)
	if err != nil {
		return nil, err
	}
	return &resp, nil
}

func (m *Manager) fetchSearchSuggestions(ctx context.Context, query, source string, paperLimit, authorLimit int) (*SearchSuggestionsResponse, error) {
	// 多源 fan-out 模式:source 为空时,papers 并行拉 STC/OLX/PMD,authors 并行拉 STC/OLX。
	// 任一源失败不影响其他源,失败仅写日志。
	if source == "" {
		return m.fetchMultiSourceSuggestions(ctx, query, paperLimit, authorLimit), nil
	}
	return m.fetchSingleSourceSuggestions(ctx, query, source, paperLimit, authorLimit)
}

// fetchSingleSourceSuggestions —— legacy 行为,给定 source 时只调对应那一个源。
func (m *Manager) fetchSingleSourceSuggestions(ctx context.Context, query, source string, paperLimit, authorLimit int) (*SearchSuggestionsResponse, error) {
	type paperResult struct {
		data *AutocompleteResponse
		err  error
	}
	type authorResult struct {
		data *AuthorSearchResponse
		err  error
	}

	paperChan := make(chan paperResult, 1)
	authorChan := make(chan authorResult, 1)

	safego.Go("minicod-paper-autocomplete", func() {
		result, err := m.PaperAutocomplete(ctx, query, source)
		paperChan <- paperResult{data: result, err: err}
	})

	safego.Go("minicod-author-search", func() {
		opts := AuthorSearchOptions{Query: query, Limit: authorLimit, Offset: 0, Source: source}
		result, err := m.SearchAuthors(ctx, opts)
		authorChan <- authorResult{data: result, err: err}
	})

	paperRes := <-paperChan
	authorRes := <-authorChan

	response := &SearchSuggestionsResponse{
		Papers:  []AutocompleteMatch{},
		Authors: []Author{},
	}

	if paperRes.err == nil && paperRes.data != nil {
		count := len(paperRes.data.Matches)
		if count > paperLimit {
			count = paperLimit
		}
		// 补 Source 字段,与多源模式一致
		matches := make([]AutocompleteMatch, count)
		for i := 0; i < count; i++ {
			matches[i] = paperRes.data.Matches[i]
			matches[i].Source = source
		}
		response.Papers = matches
	} else if paperRes.err != nil {
		slog.Warn("minicod: paper autocomplete failed", "err", paperRes.err)
	}

	if authorRes.err == nil && authorRes.data != nil {
		count := len(authorRes.data.Data)
		if count > authorLimit {
			count = authorLimit
		}
		response.Authors = authorRes.data.Data[:count]
	} else if authorRes.err != nil {
		slog.Warn("minicod: author search failed", "err", authorRes.err)
	}

	if paperRes.err != nil && authorRes.err != nil {
		return nil, fmt.Errorf("both paper and author search failed: paper: %v, author: %v", paperRes.err, authorRes.err)
	}

	return response, nil
}

// fetchMultiSourceSuggestions —— 多源并行 fan-out。
//
// papers: STC + OLX + PMD 同时拉(PMD 上游无 autocomplete,降级到 /papers/search)
// authors: STC + OLX(PMD 上游无 authors 接口,跳过)
//
// 单源失败仅 warn,不阻塞整个响应。每个 item 的 Source 字段会被设置为来源,
// 前端展示成 minicod-x / minicod-o / minicod-p 标识。
//
// 结果按 PaperSources / AuthorSources 顺序穿插(STC 优先),再截断到 limit。
func (m *Manager) fetchMultiSourceSuggestions(ctx context.Context, query string, paperLimit, authorLimit int) *SearchSuggestionsResponse {
	perSourcePaper := perSource(paperLimit, len(PaperSources))
	perSourceAuthor := perSource(authorLimit, len(AuthorSources))

	type paperBucket struct {
		source string
		items  []AutocompleteMatch
	}
	type authorBucket struct {
		source string
		items  []Author
	}
	paperCh := make(chan paperBucket, len(PaperSources))
	authorCh := make(chan authorBucket, len(AuthorSources))

	for _, src := range PaperSources {
		src := src
		safego.Go("minicod-paper-suggest-"+src, func() {
			paperCh <- paperBucket{source: src, items: m.suggestPapersForSource(ctx, query, src, perSourcePaper)}
		})
	}
	for _, src := range AuthorSources {
		src := src
		safego.Go("minicod-author-suggest-"+src, func() {
			authorCh <- authorBucket{source: src, items: m.suggestAuthorsForSource(ctx, query, src, perSourceAuthor)}
		})
	}

	paperBySource := make(map[string][]AutocompleteMatch, len(PaperSources))
	for i := 0; i < len(PaperSources); i++ {
		b := <-paperCh
		paperBySource[b.source] = b.items
	}
	authorBySource := make(map[string][]Author, len(AuthorSources))
	for i := 0; i < len(AuthorSources); i++ {
		b := <-authorCh
		authorBySource[b.source] = b.items
	}

	papers := make([]AutocompleteMatch, 0, paperLimit)
	for _, src := range PaperSources {
		papers = append(papers, paperBySource[src]...)
	}
	if len(papers) > paperLimit {
		papers = papers[:paperLimit]
	}
	authors := make([]Author, 0, authorLimit)
	for _, src := range AuthorSources {
		authors = append(authors, authorBySource[src]...)
	}
	if len(authors) > authorLimit {
		authors = authors[:authorLimit]
	}

	return &SearchSuggestionsResponse{Papers: papers, Authors: authors}
}

// suggestPapersForSource —— 单源拉论文建议。
// STC/OLX 走原生 /papers/autocomplete;PMD 上游无 autocomplete,降级到 /papers/search。
func (m *Manager) suggestPapersForSource(ctx context.Context, query, source string, limit int) []AutocompleteMatch {
	if source == SourcePMD {
		resp, err := m.SearchPapers(ctx, PaperSearchOptions{
			Query:  query,
			Limit:  limit,
			Source: source,
		})
		if err != nil {
			slog.Warn("minicod: pmd paper search fallback failed", "err", err)
			return nil
		}
		out := make([]AutocompleteMatch, 0, len(resp.Data))
		for i, p := range resp.Data {
			if i >= limit {
				break
			}
			out = append(out, AutocompleteMatch{
				ID:     p.PaperID,
				Title:  p.Title,
				Source: source,
			})
		}
		return out
	}

	resp, err := m.PaperAutocomplete(ctx, query, source)
	if err != nil {
		slog.Warn("minicod: paper autocomplete failed", "source", source, "err", err)
		return nil
	}
	count := len(resp.Matches)
	if count > limit {
		count = limit
	}
	out := make([]AutocompleteMatch, count)
	for i := 0; i < count; i++ {
		out[i] = resp.Matches[i]
		out[i].Source = source
	}
	return out
}

// suggestAuthorsForSource —— 单源拉作者建议(STC/OLX 都用 /authors/search)。
func (m *Manager) suggestAuthorsForSource(ctx context.Context, query, source string, limit int) []Author {
	resp, err := m.SearchAuthors(ctx, AuthorSearchOptions{
		Query:  query,
		Limit:  limit,
		Source: source,
	})
	if err != nil {
		slog.Warn("minicod: author search failed", "source", source, "err", err)
		return nil
	}
	count := len(resp.Data)
	if count > limit {
		count = limit
	}
	out := make([]Author, count)
	for i := 0; i < count; i++ {
		out[i] = resp.Data[i]
		out[i].Source = source
	}
	return out
}

// perSource —— 把总额度均匀分给 n 个源,向上取整(保证每源至少 1 条)。
func perSource(total, n int) int {
	if total <= 0 || n <= 0 {
		return 1
	}
	v := (total + n - 1) / n
	if v < 1 {
		return 1
	}
	return v
}

// ======================== JNL Journal Methods ========================

func (m *Manager) SearchJournals(ctx context.Context, opts JournalSearchOptions) (json.RawMessage, error) {
	result, err := circuitbreaker.MinicodBreaker.Execute(func() (any, error) {
		return m.executeWithRetry(func(client *Client) (any, error) {
			return client.SearchJournals(ctx, opts)
		})
	})
	if err != nil {
		if circuitbreaker.IsCircuitBreakerError(err) {
			return nil, fmt.Errorf("minicod service temporarily unavailable (circuit breaker open): %w", err)
		}
		return nil, err
	}
	return result.(json.RawMessage), nil
}

func (m *Manager) ListJournals(ctx context.Context, opts JournalListOptions) (json.RawMessage, error) {
	result, err := circuitbreaker.MinicodBreaker.Execute(func() (any, error) {
		return m.executeWithRetry(func(client *Client) (any, error) {
			return client.ListJournals(ctx, opts)
		})
	})
	if err != nil {
		if circuitbreaker.IsCircuitBreakerError(err) {
			return nil, fmt.Errorf("minicod service temporarily unavailable (circuit breaker open): %w", err)
		}
		return nil, err
	}
	return result.(json.RawMessage), nil
}

func (m *Manager) GetJournal(ctx context.Context, id int, full string) (json.RawMessage, error) {
	result, err := circuitbreaker.MinicodBreaker.Execute(func() (any, error) {
		return m.executeWithRetry(func(client *Client) (any, error) {
			return client.GetJournal(ctx, id, full)
		})
	})
	if err != nil {
		if circuitbreaker.IsCircuitBreakerError(err) {
			return nil, fmt.Errorf("minicod service temporarily unavailable (circuit breaker open): %w", err)
		}
		return nil, err
	}
	return result.(json.RawMessage), nil
}

func (m *Manager) SuggestJournals(ctx context.Context, q string, limit int) (json.RawMessage, error) {
	result, err := circuitbreaker.MinicodBreaker.Execute(func() (any, error) {
		return m.executeWithRetry(func(client *Client) (any, error) {
			return client.SuggestJournals(ctx, q, limit)
		})
	})
	if err != nil {
		if circuitbreaker.IsCircuitBreakerError(err) {
			return nil, fmt.Errorf("minicod service temporarily unavailable (circuit breaker open): %w", err)
		}
		return nil, err
	}
	return result.(json.RawMessage), nil
}

func (m *Manager) JournalsByNames(ctx context.Context, names, fields string) (json.RawMessage, error) {
	result, err := circuitbreaker.MinicodBreaker.Execute(func() (any, error) {
		return m.executeWithRetry(func(client *Client) (any, error) {
			return client.JournalsByNames(ctx, names, fields)
		})
	})
	if err != nil {
		if circuitbreaker.IsCircuitBreakerError(err) {
			return nil, fmt.Errorf("minicod service temporarily unavailable (circuit breaker open): %w", err)
		}
		return nil, err
	}
	return result.(json.RawMessage), nil
}

func (m *Manager) JournalsByISSNs(ctx context.Context, issns, fields string) (json.RawMessage, error) {
	result, err := circuitbreaker.MinicodBreaker.Execute(func() (any, error) {
		return m.executeWithRetry(func(client *Client) (any, error) {
			return client.JournalsByISSNs(ctx, issns, fields)
		})
	})
	if err != nil {
		if circuitbreaker.IsCircuitBreakerError(err) {
			return nil, fmt.Errorf("minicod service temporarily unavailable (circuit breaker open): %w", err)
		}
		return nil, err
	}
	return result.(json.RawMessage), nil
}

func (m *Manager) GetJournalFilters(ctx context.Context) (json.RawMessage, error) {
	result, err := circuitbreaker.MinicodBreaker.Execute(func() (any, error) {
		return m.executeWithRetry(func(client *Client) (any, error) {
			return client.GetJournalFilters(ctx)
		})
	})
	if err != nil {
		if circuitbreaker.IsCircuitBreakerError(err) {
			return nil, fmt.Errorf("minicod service temporarily unavailable (circuit breaker open): %w", err)
		}
		return nil, err
	}
	return result.(json.RawMessage), nil
}

func (m *Manager) GetJournalStats(ctx context.Context) (json.RawMessage, error) {
	result, err := circuitbreaker.MinicodBreaker.Execute(func() (any, error) {
		return m.executeWithRetry(func(client *Client) (any, error) {
			return client.GetJournalStats(ctx)
		})
	})
	if err != nil {
		if circuitbreaker.IsCircuitBreakerError(err) {
			return nil, fmt.Errorf("minicod service temporarily unavailable (circuit breaker open): %w", err)
		}
		return nil, err
	}
	return result.(json.RawMessage), nil
}

func (m *Manager) GetJournalByISSN(ctx context.Context, issn string, full string) (json.RawMessage, error) {
	result, err := circuitbreaker.MinicodBreaker.Execute(func() (any, error) {
		return m.executeWithRetry(func(client *Client) (any, error) {
			return client.GetJournalByISSN(ctx, issn, full)
		})
	})
	if err != nil {
		if circuitbreaker.IsCircuitBreakerError(err) {
			return nil, fmt.Errorf("minicod service temporarily unavailable (circuit breaker open): %w", err)
		}
		return nil, err
	}
	return result.(json.RawMessage), nil
}

func (m *Manager) CompareJournals(ctx context.Context, ids string) (json.RawMessage, error) {
	result, err := circuitbreaker.MinicodBreaker.Execute(func() (any, error) {
		return m.executeWithRetry(func(client *Client) (any, error) {
			return client.CompareJournals(ctx, ids)
		})
	})
	if err != nil {
		if circuitbreaker.IsCircuitBreakerError(err) {
			return nil, fmt.Errorf("minicod service temporarily unavailable (circuit breaker open): %w", err)
		}
		return nil, err
	}
	return result.(json.RawMessage), nil
}
