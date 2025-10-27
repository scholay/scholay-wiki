package semanticscholar

import (
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
	apiKey, _, err := m.accountService.GetRandomAPIKey(thirdparty.AccountTypeSemanticScholar)
	if err != nil {
		// Fallback to empty API key (free tier)
		return NewClient(""), nil
	}

	return NewClient(apiKey), nil
}

// SearchPapers searches for papers using key rotation
func (m *Manager) SearchPapers(opts PaperSearchOptions) (*SearchResponse, error) {
	client, err := m.GetClient()
	if err != nil {
		return nil, err
	}
	return client.SearchPapers(opts)
}

// GetPaper retrieves paper details using key rotation
func (m *Manager) GetPaper(paperID string, opts PaperDetailsOptions) (*Paper, error) {
	client, err := m.GetClient()
	if err != nil {
		return nil, err
	}
	return client.GetPaper(paperID, opts)
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
