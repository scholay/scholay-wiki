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

	"scholar-backend/internal/common/circuitbreaker"
	"scholar-backend/internal/thirdparty"
)

const MaxRetries = 5

// Manager manages Minicod API clients with key rotation
type Manager struct {
	accountService *thirdparty.Service
}

// NewManager creates a new Minicod client manager
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

	// Check for custom base URL
	accounts, err := m.accountService.GetActiveAccountsByType(thirdparty.AccountTypeMinicod)
	if err != nil || len(accounts) == 0 {
		return NewClient(apiKey), accountID, nil
	}

	var baseURL string
	for _, account := range accounts {
		if account.ID == accountID {
			config, err := account.GetMinicodConfig()
			if err == nil && config.BaseURL != "" {
				baseURL = config.BaseURL
				slog.Debug("minicod: using custom base URL", "baseURL", baseURL)
			}
			break
		}
	}

	return NewClientWithBaseURL(apiKey, baseURL), accountID, nil
}

// ======================== Paper Methods ========================

func (m *Manager) SearchPapers(ctx context.Context, opts PaperSearchOptions) (*SearchResponse, error) {
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

func (m *Manager) PaperAutocomplete(ctx context.Context, query string) (*AutocompleteResponse, error) {
	result, err := circuitbreaker.MinicodBreaker.Execute(func() (any, error) {
		return m.executeWithRetry(func(client *Client) (any, error) {
			return client.PaperAutocomplete(ctx, query)
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
func (m *Manager) GetSearchSuggestions(ctx context.Context, query string, paperLimit, authorLimit int) (*SearchSuggestionsResponse, error) {
	if query == "" {
		return nil, fmt.Errorf("query is required")
	}
	if paperLimit <= 0 {
		paperLimit = 5
	}
	if authorLimit <= 0 {
		authorLimit = 5
	}

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

	go func() {
		result, err := m.PaperAutocomplete(ctx, query)
		paperChan <- paperResult{data: result, err: err}
	}()

	go func() {
		opts := AuthorSearchOptions{Query: query, Limit: authorLimit, Offset: 0}
		result, err := m.SearchAuthors(ctx, opts)
		authorChan <- authorResult{data: result, err: err}
	}()

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
		response.Papers = paperRes.data.Matches[:count]
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
