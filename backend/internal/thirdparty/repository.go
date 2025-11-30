package thirdparty

import (
	"errors"
	"fmt"
	"time"

	"gorm.io/gorm"
)

// Repository handles database operations for third-party accounts
type Repository struct {
	db *gorm.DB
}

// NewRepository creates a new repository
func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

// Create creates a new third-party account
func (r *Repository) Create(account *ThirdPartyAccount) error {
	return r.db.Create(account).Error
}

// GetByID retrieves an account by ID
func (r *Repository) GetByID(id uint) (*ThirdPartyAccount, error) {
	var account ThirdPartyAccount
	err := r.db.First(&account, id).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &account, nil
}

// GetAll retrieves all accounts with optional filtering
func (r *Repository) GetAll(accountType AccountType, activeOnly bool) ([]ThirdPartyAccount, error) {
	query := r.db.Model(&ThirdPartyAccount{})

	if accountType != "" {
		query = query.Where("type = ?", accountType)
	}

	if activeOnly {
		query = query.Where("status = ?", 1)
	}

	var accounts []ThirdPartyAccount
	err := query.Order("created_at DESC").Find(&accounts).Error
	return accounts, err
}

// GetActiveByType retrieves all active accounts of a specific type
// Sorted by priority (ascending, lower number = higher priority), then by usage_count (ascending)
func (r *Repository) GetActiveByType(accountType AccountType) ([]ThirdPartyAccount, error) {
	var accounts []ThirdPartyAccount
	err := r.db.Where("type = ? AND status = ?", accountType, 1).
		Order("priority ASC, usage_count ASC"). // First by priority, then by usage count
		Find(&accounts).Error
	return accounts, err
}

// GetActiveByTypeAndLevel is deprecated - no longer needed since accounts now contain all three model levels
// Kept for backwards compatibility but will always return error
func (r *Repository) GetActiveByTypeAndLevel(accountType AccountType, modelLevel ModelLevel) ([]ThirdPartyAccount, error) {
	return nil, fmt.Errorf("GetActiveByTypeAndLevel is deprecated - use GetActiveByType and check model configs instead")
}

// Update updates an account
func (r *Repository) Update(account *ThirdPartyAccount) error {
	return r.db.Save(account).Error
}

// Delete deletes an account by ID
func (r *Repository) Delete(id uint) error {
	return r.db.Delete(&ThirdPartyAccount{}, id).Error
}

// IncrementUsage increments the usage count and updates last used time
func (r *Repository) IncrementUsage(id uint) error {
	now := time.Now()
	return r.db.Model(&ThirdPartyAccount{}).
		Where("id = ?", id).
		Updates(map[string]interface{}{
			"usage_count":  gorm.Expr("usage_count + ?", 1),
			"last_used_at": now,
		}).Error
}

// UpdateStatus updates the account status
func (r *Repository) UpdateStatus(id uint, status int) error {
	return r.db.Model(&ThirdPartyAccount{}).
		Where("id = ?", id).
		Update("status", status).Error
}

// GetStats retrieves usage statistics
func (r *Repository) GetStats() (map[string]interface{}, error) {
	var stats struct {
		Total                  int64
		ActiveCount            int64
		SemanticScholarCount   int64
		AIModelCount           int64
		TotalUsage             uint64
	}

	// Total count
	if err := r.db.Model(&ThirdPartyAccount{}).Count(&stats.Total).Error; err != nil {
		return nil, err
	}

	// Active count
	if err := r.db.Model(&ThirdPartyAccount{}).Where("status = ?", 1).Count(&stats.ActiveCount).Error; err != nil {
		return nil, err
	}

	// Semantic Scholar count
	if err := r.db.Model(&ThirdPartyAccount{}).
		Where("type = ? AND status = ?", AccountTypeSemanticScholar, 1).
		Count(&stats.SemanticScholarCount).Error; err != nil {
		return nil, err
	}

	// AI Model count
	if err := r.db.Model(&ThirdPartyAccount{}).
		Where("type = ? AND status = ?", AccountTypeAIModel, 1).
		Count(&stats.AIModelCount).Error; err != nil {
		return nil, err
	}

	// Total usage
	var result struct {
		TotalUsage uint64
	}
	if err := r.db.Model(&ThirdPartyAccount{}).
		Select("COALESCE(SUM(usage_count), 0) as total_usage").
		Scan(&result).Error; err != nil {
		return nil, err
	}
	stats.TotalUsage = result.TotalUsage

	return map[string]interface{}{
		"total":                    stats.Total,
		"active_count":             stats.ActiveCount,
		"semantic_scholar_count":   stats.SemanticScholarCount,
		"ai_model_count":           stats.AIModelCount,
		"total_usage":              stats.TotalUsage,
	}, nil
}

// ValidateConfig validates the account configuration based on type
func ValidateConfig(accountType AccountType, config AccountConfig) error {
	switch accountType {
	case AccountTypeSemanticScholar:
		apiKey, ok := config["api_key"].(string)
		if !ok || apiKey == "" {
			return fmt.Errorf("api_key is required for semantic_scholar type")
		}
	case AccountTypeAIModel:
		baseURL, ok := config["base_url"].(string)
		if !ok || baseURL == "" {
			return fmt.Errorf("base_url is required for ai_model type")
		}
		apiKey, ok := config["api_key"].(string)
		if !ok || apiKey == "" {
			return fmt.Errorf("api_key is required for ai_model type")
		}
	default:
		return fmt.Errorf("unsupported account type: %s", accountType)
	}
	return nil
}
