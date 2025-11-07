package thirdparty

import (
	"context"
	"fmt"
	"math/rand"
	"sync"
	"time"
)

// Service handles business logic for third-party accounts
type Service struct {
	repo   *Repository
	mu     sync.RWMutex
	cache  map[AccountType][]ThirdPartyAccount // Cached active accounts
	ctx    context.Context
	cancel context.CancelFunc
}

// NewService creates a new service
func NewService(repo *Repository) *Service {
	ctx, cancel := context.WithCancel(context.Background())
	return &Service{
		repo:   repo,
		cache:  make(map[AccountType][]ThirdPartyAccount),
		ctx:    ctx,
		cancel: cancel,
	}
}

// CreateAccount creates a new third-party account
func (s *Service) CreateAccount(name string, accountType AccountType, config AccountConfig) (*ThirdPartyAccount, error) {
	// Validate configuration
	if err := ValidateConfig(accountType, config); err != nil {
		return nil, fmt.Errorf("invalid configuration: %w", err)
	}

	account := &ThirdPartyAccount{
		Name:   name,
		Type:   accountType,
		Config: config,
		Status: 1, // Active by default
	}

	if err := s.repo.Create(account); err != nil {
		return nil, fmt.Errorf("failed to create account: %w", err)
	}

	// Invalidate cache
	s.invalidateCache(accountType)

	return account, nil
}

// GetAccount retrieves an account by ID
func (s *Service) GetAccount(id uint) (*ThirdPartyAccount, error) {
	account, err := s.repo.GetByID(id)
	if err != nil {
		return nil, fmt.Errorf("failed to get account: %w", err)
	}
	if account == nil {
		return nil, fmt.Errorf("account not found")
	}
	return account, nil
}

// ListAccounts lists all accounts with optional filtering
func (s *Service) ListAccounts(accountType AccountType, activeOnly bool) ([]ThirdPartyAccount, error) {
	accounts, err := s.repo.GetAll(accountType, activeOnly)
	if err != nil {
		return nil, fmt.Errorf("failed to list accounts: %w", err)
	}
	return accounts, nil
}

// UpdateAccount updates an account
func (s *Service) UpdateAccount(id uint, name string, config AccountConfig, status int) (*ThirdPartyAccount, error) {
	account, err := s.repo.GetByID(id)
	if err != nil {
		return nil, fmt.Errorf("failed to get account: %w", err)
	}
	if account == nil {
		return nil, fmt.Errorf("account not found")
	}

	// Validate configuration if provided
	if config != nil {
		if err := ValidateConfig(account.Type, config); err != nil {
			return nil, fmt.Errorf("invalid configuration: %w", err)
		}
		account.Config = config
	}

	if name != "" {
		account.Name = name
	}

	if status >= 0 {
		account.Status = status
	}

	if err := s.repo.Update(account); err != nil {
		return nil, fmt.Errorf("failed to update account: %w", err)
	}

	// Invalidate cache
	s.invalidateCache(account.Type)

	return account, nil
}

// DeleteAccount deletes an account
func (s *Service) DeleteAccount(id uint) error {
	account, err := s.repo.GetByID(id)
	if err != nil {
		return fmt.Errorf("failed to get account: %w", err)
	}
	if account == nil {
		return fmt.Errorf("account not found")
	}

	if err := s.repo.Delete(id); err != nil {
		return fmt.Errorf("failed to delete account: %w", err)
	}

	// Invalidate cache
	s.invalidateCache(account.Type)

	return nil
}

// GetRandomAPIKey gets a random API key of the specified type (with usage tracking)
func (s *Service) GetRandomAPIKey(accountType AccountType) (string, uint, error) {
	accounts, err := s.getActiveAccounts(accountType)
	if err != nil {
		return "", 0, err
	}

	if len(accounts) == 0 {
		return "", 0, fmt.Errorf("no active %s accounts found", accountType)
	}

	// Use weighted random selection based on inverse usage count
	// Accounts with lower usage_count have higher probability of being selected
	selected := s.weightedRandomSelect(accounts)

	// Increment usage count
	if err := s.repo.IncrementUsage(selected.ID); err != nil {
		// Log error but don't fail the request
		fmt.Printf("Warning: failed to increment usage count for account %d: %v\n", selected.ID, err)
	}

	// Extract API key based on type
	var apiKey string
	switch accountType {
	case AccountTypeSemanticScholar:
		config, err := selected.GetSemanticScholarConfig()
		if err != nil {
			return "", 0, fmt.Errorf("failed to parse config: %w", err)
		}
		apiKey = config.APIKey
	case AccountTypeAIModel:
		config, err := selected.GetAIModelConfig()
		if err != nil {
			return "", 0, fmt.Errorf("failed to parse config: %w", err)
		}
		apiKey = config.APIKey
	default:
		return "", 0, fmt.Errorf("unsupported account type: %s", accountType)
	}

	return apiKey, selected.ID, nil
}

// GetRandomAIModelConfig gets a random AI model configuration
func (s *Service) GetRandomAIModelConfig() (*AIModelConfig, uint, error) {
	accounts, err := s.getActiveAccounts(AccountTypeAIModel)
	if err != nil {
		return nil, 0, err
	}

	if len(accounts) == 0 {
		return nil, 0, fmt.Errorf("no active ai_model accounts found")
	}

	// Use weighted random selection
	selected := s.weightedRandomSelect(accounts)

	// Increment usage count
	if err := s.repo.IncrementUsage(selected.ID); err != nil {
		fmt.Printf("Warning: failed to increment usage count for account %d: %v\n", selected.ID, err)
	}

	config, err := selected.GetAIModelConfig()
	if err != nil {
		return nil, 0, fmt.Errorf("failed to parse config: %w", err)
	}

	return config, selected.ID, nil
}

// weightedRandomSelect selects an account with probability inversely proportional to usage_count
func (s *Service) weightedRandomSelect(accounts []ThirdPartyAccount) *ThirdPartyAccount {
	if len(accounts) == 1 {
		return &accounts[0]
	}

	// Calculate weights (inverse of usage_count + 1 to avoid division by zero)
	weights := make([]float64, len(accounts))
	totalWeight := 0.0

	for i, account := range accounts {
		// Weight = 1 / (usage_count + 1)
		// Add 1 to avoid division by zero and ensure new accounts get used
		weight := 1.0 / float64(account.UsageCount+1)
		weights[i] = weight
		totalWeight += weight
	}

	// Random selection based on weights
	r := rand.Float64() * totalWeight
	cumulative := 0.0

	for i, weight := range weights {
		cumulative += weight
		if r <= cumulative {
			return &accounts[i]
		}
	}

	// Fallback (should not reach here)
	return &accounts[len(accounts)-1]
}

// getActiveAccounts retrieves active accounts from cache or database
func (s *Service) getActiveAccounts(accountType AccountType) ([]ThirdPartyAccount, error) {
	s.mu.RLock()
	cached, exists := s.cache[accountType]
	s.mu.RUnlock()

	if exists && len(cached) > 0 {
		return cached, nil
	}

	// Fetch from database
	accounts, err := s.repo.GetActiveByType(accountType)
	if err != nil {
		return nil, fmt.Errorf("failed to get active accounts: %w", err)
	}

	// Update cache
	s.mu.Lock()
	s.cache[accountType] = accounts
	s.mu.Unlock()

	return accounts, nil
}

// invalidateCache invalidates the cache for a specific account type
func (s *Service) invalidateCache(accountType AccountType) {
	s.mu.Lock()
	delete(s.cache, accountType)
	s.mu.Unlock()
}

// RefreshCache refreshes the cache for all account types
func (s *Service) RefreshCache() error {
	types := []AccountType{AccountTypeSemanticScholar, AccountTypeAIModel}

	for _, accountType := range types {
		accounts, err := s.repo.GetActiveByType(accountType)
		if err != nil {
			return fmt.Errorf("failed to refresh cache for %s: %w", accountType, err)
		}

		s.mu.Lock()
		s.cache[accountType] = accounts
		s.mu.Unlock()
	}

	return nil
}

// GetStats retrieves usage statistics
func (s *Service) GetStats() (map[string]interface{}, error) {
	return s.repo.GetStats()
}

// StartCacheRefreshTask starts a background task to refresh cache periodically
func (s *Service) StartCacheRefreshTask(interval time.Duration) {
	ticker := time.NewTicker(interval)
	go func() {
		defer ticker.Stop()
		fmt.Println("Third-party account cache refresh task started")

		for {
			select {
			case <-ticker.C:
				if err := s.RefreshCache(); err != nil {
					fmt.Printf("Warning: failed to refresh account cache: %v\n", err)
				}
			case <-s.ctx.Done():
				fmt.Println("Third-party account cache refresh task stopped")
				return
			}
		}
	}()
}

// Stop gracefully stops the cache refresh task
func (s *Service) Stop() {
	fmt.Println("Stopping third-party service...")
	s.cancel()
	fmt.Println("✓ Third-party service stopped")
}

// GetActiveAccountsByType retrieves active accounts of a specific type (public method for AI service)
func (s *Service) GetActiveAccountsByType(accountType AccountType) ([]ThirdPartyAccount, error) {
	return s.getActiveAccounts(accountType)
}

// GetRandomAIModelConfigByLevel gets a random AI model configuration and returns the model code for the specified level
// Now each AI account can contain three model codes (low/mid/high), so we select an account and return the appropriate model code
func (s *Service) GetRandomAIModelConfigByLevel(modelLevel ModelLevel) (*AIModelConfig, uint, error) {
	// Get all active AI model accounts
	accounts, err := s.getActiveAccounts(AccountTypeAIModel)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to get active AI model accounts: %w", err)
	}

	if len(accounts) == 0 {
		return nil, 0, fmt.Errorf("no active ai_model accounts found")
	}

	// Filter accounts that have the requested model level configured
	var validAccounts []ThirdPartyAccount
	for _, account := range accounts {
		modelCode, err := account.GetModelCodeByLevel(modelLevel)
		if err == nil && modelCode != "" {
			validAccounts = append(validAccounts, account)
		}
	}

	if len(validAccounts) == 0 {
		return nil, 0, fmt.Errorf("no active ai_model accounts found with %s model configured", modelLevel)
	}

	// Use weighted random selection
	selected := s.weightedRandomSelect(validAccounts)

	// Increment usage count
	if err := s.repo.IncrementUsage(selected.ID); err != nil {
		fmt.Printf("Warning: failed to increment usage count for account %d: %v\n", selected.ID, err)
	}

	config, err := selected.GetAIModelConfig()
	if err != nil {
		return nil, 0, fmt.Errorf("failed to parse config: %w", err)
	}

	// Get the specific model code for this level
	modelCode, err := selected.GetModelCodeByLevel(modelLevel)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to get model code for level %s: %w", modelLevel, err)
	}

	// Return a simplified config with BaseURL, APIKey, and the specific model code in ModelLow field
	// (AI service will use ModelLow as the actual model parameter)
	levelConfig := &AIModelConfig{
		BaseURL:   config.BaseURL,
		APIKey:    config.APIKey,
		ModelLow:  modelCode, // The actual model code to use for this request
		ModelMid:  "",        // Not used
		ModelHigh: "",        // Not used
	}

	return levelConfig, selected.ID, nil
}

// GetRandomAPIKeyByLevel gets a random AI model API key that has the specified level configured (with usage tracking)
func (s *Service) GetRandomAPIKeyByLevel(modelLevel ModelLevel) (string, uint, error) {
	// Get all active AI model accounts
	accounts, err := s.getActiveAccounts(AccountTypeAIModel)
	if err != nil {
		return "", 0, fmt.Errorf("failed to get active AI model accounts: %w", err)
	}

	if len(accounts) == 0 {
		return "", 0, fmt.Errorf("no active ai_model accounts found")
	}

	// Filter accounts that have the requested model level configured
	var validAccounts []ThirdPartyAccount
	for _, account := range accounts {
		modelCode, err := account.GetModelCodeByLevel(modelLevel)
		if err == nil && modelCode != "" {
			validAccounts = append(validAccounts, account)
		}
	}

	if len(validAccounts) == 0 {
		return "", 0, fmt.Errorf("no active ai_model accounts found with %s model configured", modelLevel)
	}

	// Use weighted random selection
	selected := s.weightedRandomSelect(validAccounts)

	// Increment usage count
	if err := s.repo.IncrementUsage(selected.ID); err != nil {
		fmt.Printf("Warning: failed to increment usage count for account %d: %v\n", selected.ID, err)
	}

	config, err := selected.GetAIModelConfig()
	if err != nil {
		return "", 0, fmt.Errorf("failed to parse config: %w", err)
	}

	return config.APIKey, selected.ID, nil
}
