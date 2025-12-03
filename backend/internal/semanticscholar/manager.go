// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package semanticscholar

import (
	"fmt"
	"strings"

	"scholar-backend/internal/common/circuitbreaker"
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
func (m *Manager) executeWithRetry(operation func(client *Client) (interface{}, error)) (interface{}, error) {
	var lastErr error
	usedAccountIDs := make(map[uint]bool) // 记录已使用过的账号ID，避免重复使用同一个失效的key

	for attempt := 0; attempt <= MaxRetries; attempt++ {
		// 获取客户端
		client, accountID, err := m.getClientWithAccountID()
		if err != nil {
			// 如果获取客户端失败，记录错误并继续尝试
			fmt.Printf("[Manager] Attempt %d: Failed to get client: %v\n", attempt+1, err)
			lastErr = err
			continue
		}

		// 检查是否已经使用过这个账号（如果是重试的话）
		if attempt > 0 && usedAccountIDs[accountID] {
			fmt.Printf("[Manager] Attempt %d: Account %d already tried, skipping\n", attempt+1, accountID)
			// 直接继续尝试获取其他账号，不等待
			continue
		}

		// 记录使用的账号
		usedAccountIDs[accountID] = true

		if attempt > 0 {
			fmt.Printf("[Manager] Retry attempt %d/%d with account ID: %d\n", attempt, MaxRetries, accountID)
		}

		// 执行操作
		result, err := operation(client)
		if err == nil {
			return result, nil
		}

		lastErr = err

		// 检查是否是可重试的错误
		if isRetryableError(err) {
			fmt.Printf("[Manager] Attempt %d: Retryable error (403/429) with account %d: %v\n", attempt+1, accountID, err)
			// 立即重试，不等待
			continue
		}

		// 其他错误不重试
		fmt.Printf("[Manager] Attempt %d: Non-retryable error: %v\n", attempt+1, err)
		return nil, err
	}

	return nil, fmt.Errorf("all %d retry attempts failed, last error: %w", MaxRetries+1, lastErr)
}

// getClientWithAccountID 获取客户端并返回账号ID
func (m *Manager) getClientWithAccountID() (*Client, uint, error) {
	apiKey, accountID, err := m.accountService.GetRandomAPIKey(thirdparty.AccountTypeSemanticScholar)
	if err != nil {
		// Fallback to empty API key (free tier)
		fmt.Printf("[Manager] Failed to get API key, using free tier: %v\n", err)
		return NewClient(""), 0, nil
	}

	fmt.Printf("[Manager] Got API key (length: %d) from account ID: %d\n", len(apiKey), accountID)

	// Get the account to retrieve base URL configuration
	accounts, err := m.accountService.GetActiveAccountsByType(thirdparty.AccountTypeSemanticScholar)
	if err != nil || len(accounts) == 0 {
		fmt.Printf("[Manager] Failed to get accounts or no accounts found, using default base URL\n")
		return NewClient(apiKey), accountID, nil
	}

	// Find the account that was used
	var baseURL string
	for _, account := range accounts {
		if account.ID == accountID {
			config, err := account.GetSemanticScholarConfig()
			if err == nil && config.BaseURL != "" {
				baseURL = config.BaseURL
				fmt.Printf("[Manager] Using custom base URL: %s\n", baseURL)
			}
			break
		}
	}

	if baseURL == "" {
		fmt.Printf("[Manager] No custom base URL, using default\n")
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
func (m *Manager) SearchPapersBulk(opts BulkSearchOptions) (*SearchResponse, error) {
	// Execute with circuit breaker protection
	result, err := circuitbreaker.SemanticScholarBreaker.Execute(func() (interface{}, error) {
		return m.executeWithRetry(func(client *Client) (interface{}, error) {
			return client.SearchPapersBulk(opts)
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
func (m *Manager) SearchPapers(opts PaperSearchOptions) (*SearchResponse, error) {
	// Execute with circuit breaker protection
	result, err := circuitbreaker.SemanticScholarBreaker.Execute(func() (interface{}, error) {
		return m.executeWithRetry(func(client *Client) (interface{}, error) {
			return client.SearchPapers(opts)
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
func (m *Manager) GetPaper(paperID string, opts PaperDetailsOptions) (*Paper, error) {
	result, err := circuitbreaker.SemanticScholarBreaker.Execute(func() (interface{}, error) {
		return m.executeWithRetry(func(client *Client) (interface{}, error) {
			return client.GetPaper(paperID, opts)
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
func (m *Manager) GetPaperBatch(paperIDs []string, fields []string) ([]Paper, error) {
	fmt.Printf("[Manager] GetPaperBatch called with %d paperIDs\n", len(paperIDs))
	
	result, err := circuitbreaker.SemanticScholarBreaker.Execute(func() (interface{}, error) {
		return m.executeWithRetry(func(client *Client) (interface{}, error) {
		fmt.Printf("[Manager] GetPaperBatch - Client has API key: %v, length: %d\n", client.HasAPIKey(), client.GetAPIKeyLength())
			return client.GetPaperBatch(paperIDs, fields)
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
func (m *Manager) GetPaperAuthors(paperID string, fields []string, offset, limit int) (*AuthorSearchResponse, error) {
	result, err := circuitbreaker.SemanticScholarBreaker.Execute(func() (interface{}, error) {
		return m.executeWithRetry(func(client *Client) (interface{}, error) {
			return client.GetPaperAuthors(paperID, fields, offset, limit)
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
func (m *Manager) GetPaperCitations(paperID string, opts CitationsOptions) (*CitationsResponse, error) {
	result, err := circuitbreaker.SemanticScholarBreaker.Execute(func() (interface{}, error) {
		return m.executeWithRetry(func(client *Client) (interface{}, error) {
			return client.GetPaperCitations(paperID, opts)
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
func (m *Manager) GetPaperReferences(paperID string, opts CitationsOptions) (*ReferencesResponse, error) {
	result, err := circuitbreaker.SemanticScholarBreaker.Execute(func() (interface{}, error) {
		return m.executeWithRetry(func(client *Client) (interface{}, error) {
			return client.GetPaperReferences(paperID, opts)
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
func (m *Manager) SearchAuthors(opts AuthorSearchOptions) (*AuthorSearchResponse, error) {
	result, err := circuitbreaker.SemanticScholarBreaker.Execute(func() (interface{}, error) {
		return m.executeWithRetry(func(client *Client) (interface{}, error) {
		return client.SearchAuthors(opts)
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
func (m *Manager) GetAuthor(authorID string, fields []string) (*Author, error) {
	result, err := circuitbreaker.SemanticScholarBreaker.Execute(func() (interface{}, error) {
		return m.executeWithRetry(func(client *Client) (interface{}, error) {
		return client.GetAuthor(authorID, fields)
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
func (m *Manager) GetAuthorPapers(authorID string, fields []string, offset, limit int) (*SearchResponse, error) {
	result, err := circuitbreaker.SemanticScholarBreaker.Execute(func() (interface{}, error) {
		return m.executeWithRetry(func(client *Client) (interface{}, error) {
		return client.GetAuthorPapers(authorID, fields, offset, limit)
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
func (m *Manager) GetRecommendationsForPaper(paperID string, opts RecommendationsOptions) (*RecommendationsResponse, error) {
	result, err := circuitbreaker.SemanticScholarBreaker.Execute(func() (interface{}, error) {
		return m.executeWithRetry(func(client *Client) (interface{}, error) {
		return client.GetRecommendationsForPaper(paperID, opts)
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
func (m *Manager) GetRecommendations(opts RecommendationsOptions) (*RecommendationsResponse, error) {
	result, err := circuitbreaker.SemanticScholarBreaker.Execute(func() (interface{}, error) {
		return m.executeWithRetry(func(client *Client) (interface{}, error) {
		return client.GetRecommendations(opts)
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
func (m *Manager) PaperAutocomplete(query string) (*AutocompleteResponse, error) {
	result, err := circuitbreaker.SemanticScholarBreaker.Execute(func() (interface{}, error) {
		return m.executeWithRetry(func(client *Client) (interface{}, error) {
			return client.PaperAutocomplete(query)
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

// GetSearchSuggestions returns combined paper and author suggestions by querying both APIs in parallel
func (m *Manager) GetSearchSuggestions(query string, paperLimit, authorLimit int) (*SearchSuggestionsResponse, error) {
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
	go func() {
		result, err := m.PaperAutocomplete(query)
		paperChan <- paperResult{data: result, err: err}
	}()

	// Fetch author search in parallel
	go func() {
		opts := AuthorSearchOptions{
			Query:  query,
			Limit:  authorLimit,
			Offset: 0,
		}
		result, err := m.SearchAuthors(opts)
		authorChan <- authorResult{data: result, err: err}
	}()

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
		fmt.Printf("[Manager] Paper autocomplete failed: %v\n", paperRes.err)
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
		fmt.Printf("[Manager] Author search failed: %v\n", authorRes.err)
	}

	// If both failed, return an error
	if paperRes.err != nil && authorRes.err != nil {
		return nil, fmt.Errorf("both paper and author search failed: paper: %v, author: %v", paperRes.err, authorRes.err)
	}

	return response, nil
}
