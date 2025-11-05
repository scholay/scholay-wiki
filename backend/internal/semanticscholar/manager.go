package semanticscholar

import (
	"fmt"
	"strings"

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

// SearchPapers searches for papers using key rotation
func (m *Manager) SearchPapers(opts PaperSearchOptions) (*SearchResponse, error) {
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
}

// GetPaper retrieves paper details using key rotation
func (m *Manager) GetPaper(paperID string, opts PaperDetailsOptions) (*Paper, error) {
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
}

// GetPaperBatch retrieves multiple papers using key rotation
func (m *Manager) GetPaperBatch(paperIDs []string, fields []string) ([]Paper, error) {
	client, err := m.GetClient()
	if err != nil {
		return nil, err
	}
	return client.GetPaperBatch(paperIDs, fields)
}

// GetPaperAuthors retrieves paper authors using key rotation
func (m *Manager) GetPaperAuthors(paperID string, fields []string, offset, limit int) (*AuthorSearchResponse, error) {
	client, err := m.GetClient()
	if err != nil {
		return nil, err
	}
	return client.GetPaperAuthors(paperID, fields, offset, limit)
}

// GetPaperCitations retrieves paper citations using key rotation
func (m *Manager) GetPaperCitations(paperID string, opts CitationsOptions) (*CitationsResponse, error) {
	client, err := m.GetClient()
	if err != nil {
		return nil, err
	}
	return client.GetPaperCitations(paperID, opts)
}

// GetPaperReferences retrieves paper references using key rotation
func (m *Manager) GetPaperReferences(paperID string, opts CitationsOptions) (*ReferencesResponse, error) {
	client, err := m.GetClient()
	if err != nil {
		return nil, err
	}
	return client.GetPaperReferences(paperID, opts)
}

// SearchAuthors searches for authors using key rotation
func (m *Manager) SearchAuthors(opts AuthorSearchOptions) (*AuthorSearchResponse, error) {
	client, err := m.GetClient()
	if err != nil {
		return nil, err
	}
	return client.SearchAuthors(opts)
}

// GetAuthor retrieves author details using key rotation
func (m *Manager) GetAuthor(authorID string, fields []string) (*Author, error) {
	client, err := m.GetClient()
	if err != nil {
		return nil, err
	}
	return client.GetAuthor(authorID, fields)
}

// GetAuthorPapers retrieves author papers using key rotation
func (m *Manager) GetAuthorPapers(authorID string, fields []string, offset, limit int) (*SearchResponse, error) {
	client, err := m.GetClient()
	if err != nil {
		return nil, err
	}
	return client.GetAuthorPapers(authorID, fields, offset, limit)
}

// GetRecommendationsForPaper gets recommendations using key rotation
func (m *Manager) GetRecommendationsForPaper(paperID string, opts RecommendationsOptions) (*RecommendationsResponse, error) {
	client, err := m.GetClient()
	if err != nil {
		return nil, err
	}
	return client.GetRecommendationsForPaper(paperID, opts)
}

// GetRecommendations gets recommendations using key rotation
func (m *Manager) GetRecommendations(opts RecommendationsOptions) (*RecommendationsResponse, error) {
	client, err := m.GetClient()
	if err != nil {
		return nil, err
	}
	return client.GetRecommendations(opts)
}
