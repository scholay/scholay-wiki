// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package semanticscholar

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"scholar-backend/internal/common/circuitbreaker"
	"scholar-backend/internal/common/safego"
	"scholar-backend/internal/thirdparty"
)

// 最大重试次数
const MaxRetries = 5

// Manager manages Semantic Scholar API clients with key rotation
type Manager struct {
	accountService *thirdparty.Service
}

// NewManager creates a new Semantic Scholar client manager
func NewManager(accountService *thirdparty.Service) *Manager {
	return &Manager{
		accountService: accountService,
	}
}

// isRetryableError 检查错误是否可重试（403 或 429）
func isRetryableError(err error) bool {
	if err == nil {
		return false
	}
	errStr := err.Error()
	return strings.Contains(errStr, "403") ||
		strings.Contains(errStr, "Forbidden") ||
		strings.Contains(errStr, "429") ||
		strings.Contains(errStr, "Too Many Requests")
}

// executeWithRetry 执行带重试逻辑的操作
// 当遇到 403 或 429 错误时，会随机获取另一个 API key 重试，最多重试 MaxRetries 次
// 每次尝试都会记录耗时和成功/失败统计
func (m *Manager) executeWithRetry(operation func(client *Client) (any, error)) (any, error) {
	var lastErr error
	usedAccountIDs := make(map[uint]bool) // 记录已使用过的账号ID，避免重复使用同一个失效的key

	for attempt := 0; attempt <= MaxRetries; attempt++ {
		// 获取客户端
		client, accountID, err := m.getClientWithAccountID()
		if err != nil {
			// 如果获取客户端失败，记录错误并继续尝试
			slog.Warn("failed to get client", "attempt", attempt+1, "err", err)
			lastErr = err
			continue
		}

		// 检查是否已经使用过这个账号（如果是重试的话）
		if attempt > 0 && usedAccountIDs[accountID] {
			slog.Debug("account already tried, skipping", "attempt", attempt+1, "accountID", accountID)
			// 直接继续尝试获取其他账号，不等待
			continue
		}

		// 记录使用的账号
		usedAccountIDs[accountID] = true

		if attempt > 0 {
			slog.Info("retry attempt", "attempt", attempt, "maxRetries", MaxRetries, "accountID", accountID)
		}

		// 执行操作并计时
		start := time.Now()
		result, err := operation(client)
		latencyMs := time.Since(start).Milliseconds()

		if err == nil {
			// 记录成功
			m.accountService.RecordAPIUsage(accountID, true, latencyMs)
			return result, nil
		}

		// 记录失败
		m.accountService.RecordAPIUsage(accountID, false, latencyMs)
		lastErr = err

		// 检查是否是可重试的错误
		if isRetryableError(err) {
			slog.Warn("retryable error (403/429)", "attempt", attempt+1, "accountID", accountID, "err", err)
			// 立即重试，不等待
			continue
		}

		// 其他错误不重试
		slog.Error("non-retryable error", "attempt", attempt+1, "err", err)
		return nil, err
	}

	return nil, fmt.Errorf("all %d retry attempts failed, last error: %w", MaxRetries+1, lastErr)
}

// getClientWithAccountID 获取客户端并返回账号ID
func (m *Manager) getClientWithAccountID() (*Client, uint, error) {
	apiKey, accountID, err := m.accountService.GetRandomAPIKey(thirdparty.AccountTypeSemanticScholar)
	if err != nil {
		// Fallback to empty API key (free tier)
		slog.Warn("failed to get API key, using free tier", "err", err)
		return NewClient(""), 0, nil
	}

	slog.Debug("got API key", "keyLength", len(apiKey), "accountID", accountID)

	// Get the account to retrieve base URL configuration
	accounts, err := m.accountService.GetActiveAccountsByType(thirdparty.AccountTypeSemanticScholar)
	if err != nil || len(accounts) == 0 {
		slog.Debug("no accounts found, using default base URL")
		return NewClient(apiKey), accountID, nil
	}

	// Find the account that was used
	var baseURL string
	for _, account := range accounts {
		if account.ID == accountID {
			config, err := account.GetSemanticScholarConfig()
			if err == nil && config.BaseURL != "" {
				baseURL = config.BaseURL
				slog.Debug("using custom base URL", "baseURL", baseURL)
			}
			break
		}
	}

	if baseURL == "" {
		slog.Debug("no custom base URL, using default")
	}

	return NewClientWithBaseURL(apiKey, baseURL), accountID, nil
}

// GetClient gets a client with a rotated API key
func (m *Manager) GetClient() (*Client, error) {
	client, _, err := m.getClientWithAccountID()
	return client, err
}

// GetAPIKey gets an API key from the account service for external use (e.g., MCP)
func (m *Manager) GetAPIKey() (string, uint, error) {
	return m.accountService.GetRandomAPIKey(thirdparty.AccountTypeSemanticScholar)
}

// GetAPIConfig gets both API key and base URL from the account service
func (m *Manager) GetAPIConfig() (apiKey string, baseURL string, accountID uint, err error) {
	apiKey, accountID, err = m.accountService.GetRandomAPIKey(thirdparty.AccountTypeSemanticScholar)
	if err != nil {
		return "", "", 0, err
	}

	// Get the account to retrieve base URL configuration
	accounts, err := m.accountService.GetActiveAccountsByType(thirdparty.AccountTypeSemanticScholar)
	if err != nil || len(accounts) == 0 {
		return apiKey, "", accountID, nil
	}

	// Find the account that was used
	for _, account := range accounts {
		if account.ID == accountID {
			config, err := account.GetSemanticScholarConfig()
			if err == nil && config.BaseURL != "" {
				baseURL = config.BaseURL
			}
			break
		}
	}

	return apiKey, baseURL, accountID, nil
}

// SearchPapersBulk searches for papers using bulk endpoint with key rotation, retry logic and circuit breaker protection
func (m *Manager) SearchPapersBulk(ctx context.Context, opts BulkSearchOptions) (*SearchResponse, error) {
	// Execute with circuit breaker protection
	result, err := circuitbreaker.SemanticScholarBreaker.Execute(func() (any, error) {
		return m.executeWithRetry(func(client *Client) (any, error) {
			return client.SearchPapersBulk(ctx, opts)
		})
	})

	if err != nil {
		// Check if circuit breaker is open
		if circuitbreaker.IsCircuitBreakerError(err) {
			return nil, fmt.Errorf("Semantic Scholar service temporarily unavailable (circuit breaker open): %w", err)
		}
		return nil, err
	}

	return result.(*SearchResponse), nil
}

// SearchPapers searches for papers using key rotation, retry logic and circuit breaker protection
func (m *Manager) SearchPapers(ctx context.Context, opts PaperSearchOptions) (*SearchResponse, error) {
	// Execute with circuit breaker protection
	result, err := circuitbreaker.SemanticScholarBreaker.Execute(func() (any, error) {
		return m.executeWithRetry(func(client *Client) (any, error) {
			return client.SearchPapers(ctx, opts)
		})
	})

	if err != nil {
		// Check if circuit breaker is open
		if circuitbreaker.IsCircuitBreakerError(err) {
			return nil, fmt.Errorf("Semantic Scholar service temporarily unavailable (circuit breaker open): %w", err)
		}
		return nil, err
	}

	return result.(*SearchResponse), nil
}

// GetPaper retrieves paper details using key rotation, retry logic and circuit breaker protection
func (m *Manager) GetPaper(ctx context.Context, paperID string, opts PaperDetailsOptions) (*Paper, error) {
	result, err := circuitbreaker.SemanticScholarBreaker.Execute(func() (any, error) {
		return m.executeWithRetry(func(client *Client) (any, error) {
			return client.GetPaper(ctx, paperID, opts)
		})
	})

	if err != nil {
		if circuitbreaker.IsCircuitBreakerError(err) {
			return nil, fmt.Errorf("Semantic Scholar service temporarily unavailable (circuit breaker open): %w", err)
		}
		return nil, err
	}

	return result.(*Paper), nil
}

// GetPaperBatch retrieves multiple papers using key rotation, retry logic and circuit breaker protection
func (m *Manager) GetPaperBatch(ctx context.Context, paperIDs []string, fields []string) ([]Paper, error) {
	slog.Debug("GetPaperBatch called", "paperIDCount", len(paperIDs))
	
	result, err := circuitbreaker.SemanticScholarBreaker.Execute(func() (any, error) {
		return m.executeWithRetry(func(client *Client) (any, error) {
		slog.Debug("GetPaperBatch client info", "hasAPIKey", client.HasAPIKey(), "keyLength", client.GetAPIKeyLength())
			return client.GetPaperBatch(ctx, paperIDs, fields)
		})
	})

	if err != nil {
		if circuitbreaker.IsCircuitBreakerError(err) {
			return nil, fmt.Errorf("Semantic Scholar service temporarily unavailable (circuit breaker open): %w", err)
		}
		return nil, err
	}

	return result.([]Paper), nil
}

// GetPaperAuthors retrieves paper authors using key rotation, retry logic and circuit breaker protection
func (m *Manager) GetPaperAuthors(ctx context.Context, paperID string, fields []string, offset, limit int) (*AuthorSearchResponse, error) {
	result, err := circuitbreaker.SemanticScholarBreaker.Execute(func() (any, error) {
		return m.executeWithRetry(func(client *Client) (any, error) {
			return client.GetPaperAuthors(ctx, paperID, fields, offset, limit)
		})
	})

	if err != nil {
		if circuitbreaker.IsCircuitBreakerError(err) {
			return nil, fmt.Errorf("Semantic Scholar service temporarily unavailable (circuit breaker open): %w", err)
		}
		return nil, err
	}

	return result.(*AuthorSearchResponse), nil
}

// GetPaperCitations retrieves paper citations using key rotation, retry logic and circuit breaker protection
func (m *Manager) GetPaperCitations(ctx context.Context, paperID string, opts CitationsOptions) (*CitationsResponse, error) {
	result, err := circuitbreaker.SemanticScholarBreaker.Execute(func() (any, error) {
		return m.executeWithRetry(func(client *Client) (any, error) {
			return client.GetPaperCitations(ctx, paperID, opts)
		})
	})

	if err != nil {
		if circuitbreaker.IsCircuitBreakerError(err) {
			return nil, fmt.Errorf("Semantic Scholar service temporarily unavailable (circuit breaker open): %w", err)
		}
		return nil, err
	}

	return result.(*CitationsResponse), nil
}

// GetPaperReferences retrieves paper references using key rotation, retry logic and circuit breaker protection
func (m *Manager) GetPaperReferences(ctx context.Context, paperID string, opts CitationsOptions) (*ReferencesResponse, error) {
	result, err := circuitbreaker.SemanticScholarBreaker.Execute(func() (any, error) {
		return m.executeWithRetry(func(client *Client) (any, error) {
			return client.GetPaperReferences(ctx, paperID, opts)
		})
	})

	if err != nil {
		if circuitbreaker.IsCircuitBreakerError(err) {
			return nil, fmt.Errorf("Semantic Scholar service temporarily unavailable (circuit breaker open): %w", err)
		}
		return nil, err
	}

	return result.(*ReferencesResponse), nil
}

// SearchAuthors searches for authors using key rotation, retry logic and circuit breaker protection
func (m *Manager) SearchAuthors(ctx context.Context, opts AuthorSearchOptions) (*AuthorSearchResponse, error) {
	result, err := circuitbreaker.SemanticScholarBreaker.Execute(func() (any, error) {
		return m.executeWithRetry(func(client *Client) (any, error) {
		return client.SearchAuthors(ctx, opts)
		})
	})

	if err != nil {
		if circuitbreaker.IsCircuitBreakerError(err) {
			return nil, fmt.Errorf("Semantic Scholar service temporarily unavailable (circuit breaker open): %w", err)
		}
		return nil, err
	}

	return result.(*AuthorSearchResponse), nil
}

// GetAuthor retrieves author details using key rotation, retry logic and circuit breaker protection
func (m *Manager) GetAuthor(ctx context.Context, authorID string, fields []string) (*Author, error) {
	result, err := circuitbreaker.SemanticScholarBreaker.Execute(func() (any, error) {
		return m.executeWithRetry(func(client *Client) (any, error) {
		return client.GetAuthor(ctx, authorID, fields)
		})
	})

	if err != nil {
		if circuitbreaker.IsCircuitBreakerError(err) {
			return nil, fmt.Errorf("Semantic Scholar service temporarily unavailable (circuit breaker open): %w", err)
		}
		return nil, err
	}

	return result.(*Author), nil
}

// GetAuthorPapers retrieves author papers using key rotation, retry logic and circuit breaker protection
func (m *Manager) GetAuthorPapers(ctx context.Context, authorID string, fields []string, offset, limit int) (*SearchResponse, error) {
	result, err := circuitbreaker.SemanticScholarBreaker.Execute(func() (any, error) {
		return m.executeWithRetry(func(client *Client) (any, error) {
		return client.GetAuthorPapers(ctx, authorID, fields, offset, limit)
		})
	})

	if err != nil {
		if circuitbreaker.IsCircuitBreakerError(err) {
			return nil, fmt.Errorf("Semantic Scholar service temporarily unavailable (circuit breaker open): %w", err)
		}
		return nil, err
	}

	return result.(*SearchResponse), nil
}

// GetRecommendationsForPaper gets recommendations using key rotation, retry logic and circuit breaker protection
func (m *Manager) GetRecommendationsForPaper(ctx context.Context, paperID string, opts RecommendationsOptions) (*RecommendationsResponse, error) {
	result, err := circuitbreaker.SemanticScholarBreaker.Execute(func() (any, error) {
		return m.executeWithRetry(func(client *Client) (any, error) {
		return client.GetRecommendationsForPaper(ctx, paperID, opts)
		})
	})

	if err != nil {
		if circuitbreaker.IsCircuitBreakerError(err) {
			return nil, fmt.Errorf("Semantic Scholar service temporarily unavailable (circuit breaker open): %w", err)
		}
		return nil, err
	}

	return result.(*RecommendationsResponse), nil
}

// GetRecommendations gets recommendations using key rotation, retry logic and circuit breaker protection
func (m *Manager) GetRecommendations(ctx context.Context, opts RecommendationsOptions) (*RecommendationsResponse, error) {
	result, err := circuitbreaker.SemanticScholarBreaker.Execute(func() (any, error) {
		return m.executeWithRetry(func(client *Client) (any, error) {
		return client.GetRecommendations(ctx, opts)
		})
	})

	if err != nil {
		if circuitbreaker.IsCircuitBreakerError(err) {
			return nil, fmt.Errorf("Semantic Scholar service temporarily unavailable (circuit breaker open): %w", err)
		}
		return nil, err
	}

	return result.(*RecommendationsResponse), nil
}

// PaperAutocomplete returns paper title suggestions with key rotation, retry logic and circuit breaker protection
func (m *Manager) PaperAutocomplete(ctx context.Context, query string) (*AutocompleteResponse, error) {
	result, err := circuitbreaker.SemanticScholarBreaker.Execute(func() (any, error) {
		return m.executeWithRetry(func(client *Client) (any, error) {
			return client.PaperAutocomplete(ctx, query)
		})
	})

	if err != nil {
		if circuitbreaker.IsCircuitBreakerError(err) {
			return nil, fmt.Errorf("Semantic Scholar service temporarily unavailable (circuit breaker open): %w", err)
		}
		return nil, err
	}

	return result.(*AutocompleteResponse), nil
}

// SnippetSearch searches for papers by text snippet with key rotation, retry logic and circuit breaker protection
// Use when user provides a piece of text and wants to find the source paper
func (m *Manager) SnippetSearch(ctx context.Context, opts SnippetSearchOptions) (*SnippetSearchResponse, error) {
	result, err := circuitbreaker.SemanticScholarBreaker.Execute(func() (any, error) {
		return m.executeWithRetry(func(client *Client) (any, error) {
			return client.SnippetSearch(ctx, opts)
		})
	})

	if err != nil {
		if circuitbreaker.IsCircuitBreakerError(err) {
			return nil, fmt.Errorf("Semantic Scholar service temporarily unavailable (circuit breaker open): %w", err)
		}
		return nil, err
	}

	return result.(*SnippetSearchResponse), nil
}

// PaperTitleMatch finds paper by exact title match with key rotation, retry logic and circuit breaker protection
// Use when user provides a complete paper title for precise lookup
func (m *Manager) PaperTitleMatch(ctx context.Context, opts TitleMatchOptions) (*SearchResponse, error) {
	result, err := circuitbreaker.SemanticScholarBreaker.Execute(func() (any, error) {
		return m.executeWithRetry(func(client *Client) (any, error) {
			return client.PaperTitleMatch(ctx, opts)
		})
	})

	if err != nil {
		if circuitbreaker.IsCircuitBreakerError(err) {
			return nil, fmt.Errorf("Semantic Scholar service temporarily unavailable (circuit breaker open): %w", err)
		}
		return nil, err
	}

	return result.(*SearchResponse), nil
}

// GetSearchSuggestions returns combined paper and author suggestions by querying both APIs in parallel
func (m *Manager) GetSearchSuggestions(ctx context.Context, query string, paperLimit, authorLimit int) (*SearchSuggestionsResponse, error) {
	if query == "" {
		return nil, fmt.Errorf("query is required")
	}

	// Set default limits
	if paperLimit <= 0 {
		paperLimit = 5
	}
	if authorLimit <= 0 {
		authorLimit = 5
	}

	// Create channels for parallel requests
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

	// Fetch paper autocomplete in parallel
	safego.Go("s2-paper-autocomplete", func() {
		result, err := m.PaperAutocomplete(ctx, query)
		paperChan <- paperResult{data: result, err: err}
	})

	// Fetch author search in parallel
	safego.Go("s2-author-search", func() {
		opts := AuthorSearchOptions{
			Query:  query,
			Limit:  authorLimit,
			Offset: 0,
		}
		result, err := m.SearchAuthors(ctx, opts)
		authorChan <- authorResult{data: result, err: err}
	})

	// Wait for both results
	paperRes := <-paperChan
	authorRes := <-authorChan

	// Build response
	response := &SearchSuggestionsResponse{
		Papers:  []AutocompleteMatch{},
		Authors: []Author{},
	}

	// Process paper results (even if there's an error, we continue with author results)
	if paperRes.err == nil && paperRes.data != nil {
		// Limit the number of paper suggestions
		count := len(paperRes.data.Matches)
		if count > paperLimit {
			count = paperLimit
		}
		response.Papers = paperRes.data.Matches[:count]
	} else if paperRes.err != nil {
		slog.Warn("paper autocomplete failed", "err", paperRes.err)
	}

	// Process author results
	if authorRes.err == nil && authorRes.data != nil {
		// Limit the number of author suggestions
		count := len(authorRes.data.Data)
		if count > authorLimit {
			count = authorLimit
		}
		response.Authors = authorRes.data.Data[:count]
	} else if authorRes.err != nil {
		slog.Warn("author search failed", "err", authorRes.err)
	}

	// If both failed, return an error
	if paperRes.err != nil && authorRes.err != nil {
		return nil, fmt.Errorf("both paper and author search failed: paper: %v, author: %v", paperRes.err, authorRes.err)
	}

	return response, nil
}
