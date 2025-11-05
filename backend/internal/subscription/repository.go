package subscription

import (
	"fmt"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// Repository handles database operations for subscriptions
type Repository struct {
	db *gorm.DB
}

// NewRepository creates a new subscription repository
func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

// GetAllPlans retrieves all active subscription plans
func (r *Repository) GetAllPlans() ([]SubscriptionPlan, error) {
	var plans []SubscriptionPlan
	err := r.db.Where("is_active = ?", true).Order("sort_order ASC").Find(&plans).Error
	return plans, err
}

// GetPlanByCode retrieves a subscription plan by its code
func (r *Repository) GetPlanByCode(code string) (*SubscriptionPlan, error) {
	var plan SubscriptionPlan
	err := r.db.Where("plan_code = ? AND is_active = ?", code, true).First(&plan).Error
	if err != nil {
		return nil, err
	}
	return &plan, nil
}

// GetPlanByID retrieves a subscription plan by its ID
func (r *Repository) GetPlanByID(id uint) (*SubscriptionPlan, error) {
	var plan SubscriptionPlan
	err := r.db.First(&plan, id).Error
	if err != nil {
		return nil, err
	}
	return &plan, nil
}

// UpdatePlan updates a subscription plan
func (r *Repository) UpdatePlan(plan *SubscriptionPlan) error {
	return r.db.Save(plan).Error
}

// GetUserActiveSubscription retrieves the active subscription for a user
func (r *Repository) GetUserActiveSubscription(userID uint) (*UserSubscription, error) {
	var subscription UserSubscription
	err := r.db.Where("user_id = ? AND status = ?", userID, "active").
		Order("created_at DESC").
		First(&subscription).Error
	if err != nil {
		return nil, err
	}
	return &subscription, nil
}

// GetUserSubscriptionHistory retrieves all subscriptions for a user
func (r *Repository) GetUserSubscriptionHistory(userID uint) ([]UserSubscription, error) {
	var subscriptions []UserSubscription
	err := r.db.Where("user_id = ?", userID).
		Order("created_at DESC").
		Find(&subscriptions).Error
	return subscriptions, err
}

// CreateSubscription creates a new subscription record
func (r *Repository) CreateSubscription(subscription *UserSubscription) error {
	return r.db.Create(subscription).Error
}

// UpdateSubscription updates a subscription record
func (r *Repository) UpdateSubscription(subscription *UserSubscription) error {
	return r.db.Save(subscription).Error
}

// GetTodayUsageQuota retrieves today's usage quota for a user
func (r *Repository) GetTodayUsageQuota(userID uint, date string) (*UsageQuota, error) {
	var quota UsageQuota
	err := r.db.Where("user_id = ? AND quota_date = ?", userID, date).First(&quota).Error
	if err == gorm.ErrRecordNotFound {
		// Create new quota record for today
		quota = UsageQuota{
			UserID:    userID,
			QuotaDate: date,
		}
		if err := r.db.Create(&quota).Error; err != nil {
			return nil, err
		}
		return &quota, nil
	}
	if err != nil {
		return nil, err
	}
	return &quota, nil
}

// UpdateUsageQuota updates the usage quota
func (r *Repository) UpdateUsageQuota(quota *UsageQuota) error {
	return r.db.Save(quota).Error
}

// IncrementUsage increments a specific usage counter atomically to prevent race conditions
func (r *Repository) IncrementUsage(userID uint, date string, usageType string) error {
	// First ensure the quota record exists for today
	_, err := r.GetTodayUsageQuota(userID, date)
	if err != nil {
		return err
	}

	// Use atomic UPDATE with database-level increment to prevent race conditions
	// This ensures that even with concurrent requests, the count is accurate
	var columnName string
	switch usageType {
	case "normal_search":
		columnName = "normal_search_count"
	case "advanced_search_low":
		columnName = "advanced_search_low_count"
	case "advanced_search_mid":
		columnName = "advanced_search_mid_count"
	case "advanced_search_high":
		columnName = "advanced_search_high_count"
	case "ai_chat_normal":
		columnName = "ai_chat_normal_count"
	case "ai_chat_mid":
		columnName = "ai_chat_mid_count"
	case "ai_chat_high":
		columnName = "ai_chat_high_count"
	default:
		return fmt.Errorf("invalid usage type: %s", usageType)
	}

	// Atomic increment at database level
	result := r.db.Model(&UsageQuota{}).
		Where("user_id = ? AND quota_date = ?", userID, date).
		Update(columnName, gorm.Expr(columnName+" + ?", 1))

	return result.Error
}

// CheckAndIncrementQuota atomically checks if user has quota and increments if available
// This prevents race conditions in concurrent scenarios
func (r *Repository) CheckAndIncrementQuota(userID uint, date string, usageType string, limit int) error {
	// Map usage type to column name
	var columnName string
	switch usageType {
	case "normal_search":
		columnName = "normal_search_count"
	case "advanced_search_low":
		columnName = "advanced_search_low_count"
	case "advanced_search_mid":
		columnName = "advanced_search_mid_count"
	case "advanced_search_high":
		columnName = "advanced_search_high_count"
	case "ai_chat_normal":
		columnName = "ai_chat_normal_count"
	case "ai_chat_mid":
		columnName = "ai_chat_mid_count"
	case "ai_chat_high":
		columnName = "ai_chat_high_count"
	default:
		return fmt.Errorf("invalid usage type: %s", usageType)
	}

	// Use transaction to ensure atomicity
	return r.db.Transaction(func(tx *gorm.DB) error {
		// First ensure the quota record exists
		var quota UsageQuota
		err := tx.Where("user_id = ? AND quota_date = ?", userID, date).First(&quota).Error
		if err == gorm.ErrRecordNotFound {
			// Create new quota record
			quota = UsageQuota{
				UserID:    userID,
				QuotaDate: date,
			}
			if err := tx.Create(&quota).Error; err != nil {
				return err
			}
		} else if err != nil {
			return err
		}

		// Check current count using FOR UPDATE to lock the row
		var currentCount int
		err = tx.Model(&UsageQuota{}).
			Where("user_id = ? AND quota_date = ?", userID, date).
			Clauses(clause.Locking{Strength: "UPDATE"}).
			Pluck(columnName, &currentCount).Error
		if err != nil {
			return err
		}

		// Check if quota exceeded
		if currentCount >= limit {
			return fmt.Errorf("quota exceeded for %s: %d/%d used", usageType, currentCount, limit)
		}

		// Increment atomically
		result := tx.Model(&UsageQuota{}).
			Where("user_id = ? AND quota_date = ?", userID, date).
			Update(columnName, gorm.Expr(columnName+" + ?", 1))

		return result.Error
	})
}
