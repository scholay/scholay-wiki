package semanticscholar

import (
	"fmt"
	"strings"

	"scholar-backend/internal/common/circuitbreaker"
	"scholar-backend/internal/thirdparty"
)

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

// GetClient gets a client with a rotated API key
func (m *Manager) GetClient() (*Client, error) {
	apiKey, accountID, err := m.accountService.GetRandomAPIKey(thirdparty.AccountTypeSemanticScholar)
	if err != nil {
		// Fallback to empty API key (free tier)
		fmt.Printf("[Manager] Failed to get API key, using free tier: %v\n", err)
		return NewClient(""), nil
	}

	fmt.Printf("[Manager] Got API key (length: %d) from account ID: %d\n", len(apiKey), accountID)

	// Get the account to retrieve base URL configuration
	accounts, err := m.accountService.GetActiveAccountsByType(thirdparty.AccountTypeSemanticScholar)
	if err != nil || len(accounts) == 0 {
		fmt.Printf("[Manager] Failed to get accounts or no accounts found, using default base URL\n")
		return NewClient(apiKey), nil
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

	return NewClientWithBaseURL(apiKey, baseURL), nil
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

// SearchPapersBulk searches for papers using bulk endpoint with key rotation and circuit breaker protection
func (m *Manager) SearchPapersBulk(opts BulkSearchOptions) (*SearchResponse, error) {
	// Execute with circuit breaker protection
	result, err := circuitbreaker.SemanticScholarBreaker.Execute(func() (interface{}, error) {
		client, err := m.GetClient()
		if err != nil {
			return nil, err
		}

		// Try with API key first
		result, err := client.SearchPapersBulk(opts)
		if err != nil {
			errStr := err.Error()

			// If rate limited (429), try to fall back to free tier
			if strings.Contains(errStr, "429") || strings.Contains(errStr, "Too Many Requests") {
				fmt.Printf("[Manager] API key rate limited, falling back to free tier\n")
				freeClient := NewClient("")
				result, freeErr := freeClient.SearchPapersBulk(opts)
				if freeErr != nil {
					// If free tier also fails, return the original rate limit error with helpful message
					return nil, fmt.Errorf("API rate limit exceeded and free tier unavailable. Please add more API keys or wait a moment")
				}
				return result, nil
			}

			// If error contains "403" or "Forbidden" or "EOF", try without API key
			if strings.Contains(errStr, "403") || strings.Contains(errStr, "Forbidden") || strings.Contains(errStr, "EOF") {
				fmt.Printf("[Manager] API key forbidden/error, falling back to free tier\n")
				freeClient := NewClient("")
				return freeClient.SearchPapersBulk(opts)
			}
			return nil, err
		}

		return result, nil
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

// SearchPapers searches for papers using key rotation with circuit breaker protection
func (m *Manager) SearchPapers(opts PaperSearchOptions) (*SearchResponse, error) {
	// Execute with circuit breaker protection
	result, err := circuitbreaker.SemanticScholarBreaker.Execute(func() (interface{}, error) {
		client, err := m.GetClient()
		if err != nil {
			return nil, err
		}

		// Try with API key first
		result, err := client.SearchPapers(opts)
		if err != nil {
			errStr := err.Error()

			// If rate limited (429), try to fall back to free tier
			if strings.Contains(errStr, "429") || strings.Contains(errStr, "Too Many Requests") {
				fmt.Printf("[Manager] API key rate limited, falling back to free tier\n")
				freeClient := NewClient("")
				result, freeErr := freeClient.SearchPapers(opts)
				if freeErr != nil {
					// If free tier also fails, return the original rate limit error with helpful message
					return nil, fmt.Errorf("API rate limit exceeded and free tier unavailable. Please add more API keys or wait a moment")
				}
				return result, nil
			}

			// If error contains "403" or "Forbidden" or "EOF", try without API key
			if strings.Contains(errStr, "403") || strings.Contains(errStr, "Forbidden") || strings.Contains(errStr, "EOF") {
				fmt.Printf("[Manager] API key forbidden/error, falling back to free tier\n")
				freeClient := NewClient("")
				return freeClient.SearchPapers(opts)
			}
			return nil, err
		}

		return result, nil
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

// GetPaper retrieves paper details using key rotation with circuit breaker protection
func (m *Manager) GetPaper(paperID string, opts PaperDetailsOptions) (*Paper, error) {
	result, err := circuitbreaker.SemanticScholarBreaker.Execute(func() (interface{}, error) {
		client, err := m.GetClient()
		if err != nil {
			return nil, err
		}

		paper, err := client.GetPaper(paperID, opts)
		if err != nil {
			errStr := err.Error()

			// If rate limited (429), try to fall back to free tier
			if strings.Contains(errStr, "429") || strings.Contains(errStr, "Too Many Requests") {
				fmt.Printf("[Manager] API key rate limited for GetPaper, falling back to free tier\n")
				freeClient := NewClient("")
				paper, freeErr := freeClient.GetPaper(paperID, opts)
				if freeErr != nil {
					return nil, fmt.Errorf("API rate limit exceeded and free tier unavailable. Please add more API keys or wait a moment")
				}
				return paper, nil
			}

			// If error contains "403" or "Forbidden", try without API key
			if strings.Contains(errStr, "403") || strings.Contains(errStr, "Forbidden") || strings.Contains(errStr, "EOF") {
				fmt.Printf("[Manager] API key forbidden/error for GetPaper, falling back to free tier\n")
				freeClient := NewClient("")
				return freeClient.GetPaper(paperID, opts)
			}

			return nil, err
		}

		return paper, nil
	})

	if err != nil {
		if circuitbreaker.IsCircuitBreakerError(err) {
			return nil, fmt.Errorf("Semantic Scholar service temporarily unavailable (circuit breaker open): %w", err)
		}
		return nil, err
	}

	return result.(*Paper), nil
}

// GetPaperBatch retrieves multiple papers using key rotation with circuit breaker protection
func (m *Manager) GetPaperBatch(paperIDs []string, fields []string) ([]Paper, error) {
	result, err := circuitbreaker.SemanticScholarBreaker.Execute(func() (interface{}, error) {
		client, err := m.GetClient()
		if err != nil {
			return nil, err
		}
		return client.GetPaperBatch(paperIDs, fields)
	})

	if err != nil {
		if circuitbreaker.IsCircuitBreakerError(err) {
			return nil, fmt.Errorf("Semantic Scholar service temporarily unavailable (circuit breaker open): %w", err)
		}
		return nil, err
	}

	return result.([]Paper), nil
}

// GetPaperAuthors retrieves paper authors using key rotation with circuit breaker protection
func (m *Manager) GetPaperAuthors(paperID string, fields []string, offset, limit int) (*AuthorSearchResponse, error) {
	result, err := circuitbreaker.SemanticScholarBreaker.Execute(func() (interface{}, error) {
		client, err := m.GetClient()
		if err != nil {
			return nil, err
		}
		return client.GetPaperAuthors(paperID, fields, offset, limit)
	})

	if err != nil {
		if circuitbreaker.IsCircuitBreakerError(err) {
			return nil, fmt.Errorf("Semantic Scholar service temporarily unavailable (circuit breaker open): %w", err)
		}
		return nil, err
	}

	return result.(*AuthorSearchResponse), nil
}

// GetPaperCitations retrieves paper citations using key rotation with circuit breaker protection
func (m *Manager) GetPaperCitations(paperID string, opts CitationsOptions) (*CitationsResponse, error) {
	result, err := circuitbreaker.SemanticScholarBreaker.Execute(func() (interface{}, error) {
		client, err := m.GetClient()
		if err != nil {
			return nil, err
		}
		return client.GetPaperCitations(paperID, opts)
	})

	if err != nil {
		if circuitbreaker.IsCircuitBreakerError(err) {
			return nil, fmt.Errorf("Semantic Scholar service temporarily unavailable (circuit breaker open): %w", err)
		}
		return nil, err
	}

	return result.(*CitationsResponse), nil
}

// GetPaperReferences retrieves paper references using key rotation with circuit breaker protection
func (m *Manager) GetPaperReferences(paperID string, opts CitationsOptions) (*ReferencesResponse, error) {
	result, err := circuitbreaker.SemanticScholarBreaker.Execute(func() (interface{}, error) {
		client, err := m.GetClient()
		if err != nil {
			return nil, err
		}
		return client.GetPaperReferences(paperID, opts)
	})

	if err != nil {
		if circuitbreaker.IsCircuitBreakerError(err) {
			return nil, fmt.Errorf("Semantic Scholar service temporarily unavailable (circuit breaker open): %w", err)
		}
		return nil, err
	}

	return result.(*ReferencesResponse), nil
}

// SearchAuthors searches for authors using key rotation with circuit breaker protection
func (m *Manager) SearchAuthors(opts AuthorSearchOptions) (*AuthorSearchResponse, error) {
	result, err := circuitbreaker.SemanticScholarBreaker.Execute(func() (interface{}, error) {
		client, err := m.GetClient()
		if err != nil {
			return nil, err
		}
		return client.SearchAuthors(opts)
	})

	if err != nil {
		if circuitbreaker.IsCircuitBreakerError(err) {
			return nil, fmt.Errorf("Semantic Scholar service temporarily unavailable (circuit breaker open): %w", err)
		}
		return nil, err
	}

	return result.(*AuthorSearchResponse), nil
}

// GetAuthor retrieves author details using key rotation with circuit breaker protection
func (m *Manager) GetAuthor(authorID string, fields []string) (*Author, error) {
	result, err := circuitbreaker.SemanticScholarBreaker.Execute(func() (interface{}, error) {
		client, err := m.GetClient()
		if err != nil {
			return nil, err
		}
		return client.GetAuthor(authorID, fields)
	})

	if err != nil {
		if circuitbreaker.IsCircuitBreakerError(err) {
			return nil, fmt.Errorf("Semantic Scholar service temporarily unavailable (circuit breaker open): %w", err)
		}
		return nil, err
	}

	return result.(*Author), nil
}

// GetAuthorPapers retrieves author papers using key rotation with circuit breaker protection
func (m *Manager) GetAuthorPapers(authorID string, fields []string, offset, limit int) (*SearchResponse, error) {
	result, err := circuitbreaker.SemanticScholarBreaker.Execute(func() (interface{}, error) {
		client, err := m.GetClient()
		if err != nil {
			return nil, err
		}
		return client.GetAuthorPapers(authorID, fields, offset, limit)
	})

	if err != nil {
		if circuitbreaker.IsCircuitBreakerError(err) {
			return nil, fmt.Errorf("Semantic Scholar service temporarily unavailable (circuit breaker open): %w", err)
		}
		return nil, err
	}

	return result.(*SearchResponse), nil
}

// GetRecommendationsForPaper gets recommendations using key rotation with circuit breaker protection
func (m *Manager) GetRecommendationsForPaper(paperID string, opts RecommendationsOptions) (*RecommendationsResponse, error) {
	result, err := circuitbreaker.SemanticScholarBreaker.Execute(func() (interface{}, error) {
		client, err := m.GetClient()
		if err != nil {
			return nil, err
		}
		return client.GetRecommendationsForPaper(paperID, opts)
	})

	if err != nil {
		if circuitbreaker.IsCircuitBreakerError(err) {
			return nil, fmt.Errorf("Semantic Scholar service temporarily unavailable (circuit breaker open): %w", err)
		}
		return nil, err
	}

	return result.(*RecommendationsResponse), nil
}

// GetRecommendations gets recommendations using key rotation with circuit breaker protection
func (m *Manager) GetRecommendations(opts RecommendationsOptions) (*RecommendationsResponse, error) {
	result, err := circuitbreaker.SemanticScholarBreaker.Execute(func() (interface{}, error) {
		client, err := m.GetClient()
		if err != nil {
			return nil, err
		}
		return client.GetRecommendations(opts)
	})

	if err != nil {
		if circuitbreaker.IsCircuitBreakerError(err) {
			return nil, fmt.Errorf("Semantic Scholar service temporarily unavailable (circuit breaker open): %w", err)
		}
		return nil, err
	}

	return result.(*RecommendationsResponse), nil
}

// PaperAutocomplete returns paper title suggestions with key rotation and circuit breaker protection
func (m *Manager) PaperAutocomplete(query string) (*AutocompleteResponse, error) {
	result, err := circuitbreaker.SemanticScholarBreaker.Execute(func() (interface{}, error) {
		client, err := m.GetClient()
		if err != nil {
			return nil, err
		}

		result, err := client.PaperAutocomplete(query)
		if err != nil {
			errStr := err.Error()

			// If rate limited (429), try to fall back to free tier
			if strings.Contains(errStr, "429") || strings.Contains(errStr, "Too Many Requests") {
				fmt.Printf("[Manager] API key rate limited for PaperAutocomplete, falling back to free tier\n")
				freeClient := NewClient("")
				result, freeErr := freeClient.PaperAutocomplete(query)
				if freeErr != nil {
					return nil, fmt.Errorf("API rate limit exceeded and free tier unavailable")
				}
				return result, nil
			}

			// If error contains "403" or "Forbidden", try without API key
			if strings.Contains(errStr, "403") || strings.Contains(errStr, "Forbidden") || strings.Contains(errStr, "EOF") {
				fmt.Printf("[Manager] API key forbidden/error for PaperAutocomplete, falling back to free tier\n")
				freeClient := NewClient("")
				return freeClient.PaperAutocomplete(query)
			}

			return nil, err
		}

		return result, nil
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
