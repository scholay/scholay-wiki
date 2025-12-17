// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

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

// TypeStats 按类型的统计信息
type TypeStats struct {
	Type        string     `json:"type"`
	TypeName    string     `json:"type_name"`    // 类型名称（中文）
	TotalCount  int64      `json:"total_count"`  // 该类型的账号总数
	ActiveCount int64      `json:"active_count"` // 该类型的启用账号数
	TotalUsage  uint64     `json:"total_usage"`  // 该类型的总请求次数
	LastUsedAt  *time.Time `json:"last_used_at"` // 该类型的最后使用时间
}

// GetStats retrieves usage statistics
func (r *Repository) GetStats() (map[string]interface{}, error) {
	// 按类型统计（这是最准确的统计方式）
	typeStats, err := r.GetStatsByType()
	if err != nil {
		return nil, err
	}

	// 从类型统计中汇总
	var total int64
	var activeCount int64
	var totalUsage uint64
	var semanticScholarTotal int64
	var semanticScholarActive int64
	var aiModelTotal int64
	var aiModelActive int64

	for _, ts := range typeStats {
		total += ts.TotalCount
		activeCount += ts.ActiveCount
		totalUsage += ts.TotalUsage

		switch ts.Type {
		case string(AccountTypeSemanticScholar):
			semanticScholarTotal = ts.TotalCount
			semanticScholarActive = ts.ActiveCount
		case string(AccountTypeAIModel):
			aiModelTotal = ts.TotalCount
			aiModelActive = ts.ActiveCount
		}
	}

	return map[string]interface{}{
		"total":                          total,
		"active_count":                   activeCount,
		"semantic_scholar_count":         semanticScholarActive, // 保持兼容：启用数
		"semantic_scholar_total":         semanticScholarTotal,  // 新增：总数
		"ai_model_count":                 aiModelActive,         // 保持兼容：启用数
		"ai_model_total":                 aiModelTotal,          // 新增：总数
		"total_usage":                    totalUsage,
		"type_stats":                     typeStats,
	}, nil
}

// GetStatsByType 按类型获取统计信息
func (r *Repository) GetStatsByType() ([]TypeStats, error) {
	types := []AccountType{AccountTypeSemanticScholar, AccountTypeAIModel}
	typeNames := map[AccountType]string{
		AccountTypeSemanticScholar: "Semantic Scholar",
		AccountTypeAIModel:         "AI模型",
	}
	result := make([]TypeStats, 0, len(types))

	for _, accountType := range types {
		var typeStats TypeStats
		typeStats.Type = string(accountType)
		typeStats.TypeName = typeNames[accountType]

		// 总账号数
		if err := r.db.Model(&ThirdPartyAccount{}).
			Where("type = ?", accountType).
			Count(&typeStats.TotalCount).Error; err != nil {
			return nil, err
		}

		// 启用账号数
		if err := r.db.Model(&ThirdPartyAccount{}).
			Where("type = ? AND status = ?", accountType, 1).
			Count(&typeStats.ActiveCount).Error; err != nil {
			return nil, err
		}

		// 总请求次数
		var usageResult struct {
			TotalUsage uint64
		}
		if err := r.db.Model(&ThirdPartyAccount{}).
			Where("type = ?", accountType).
			Select("COALESCE(SUM(usage_count), 0) as total_usage").
			Scan(&usageResult).Error; err != nil {
			return nil, err
		}
		typeStats.TotalUsage = usageResult.TotalUsage

		// 最后使用时间（取所有该类型账号中最晚的时间）
		var lastUsedResult struct {
			LastUsedAt *time.Time
		}
		if err := r.db.Model(&ThirdPartyAccount{}).
			Where("type = ? AND last_used_at IS NOT NULL", accountType).
			Select("MAX(last_used_at) as last_used_at").
			Scan(&lastUsedResult).Error; err != nil {
			return nil, err
		}
		typeStats.LastUsedAt = lastUsedResult.LastUsedAt

		result = append(result, typeStats)
	}

	return result, nil
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
