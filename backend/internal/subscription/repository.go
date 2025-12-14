// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package subscription

import (
	"fmt"
	"time"

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

// HasPreviousPaidSubscription 检查用户是否有过付费会员记录（pro 或 max）
// 用于判断是新开通还是续费
// 注意：由于在调用此方法时，新订阅记录可能已经创建，所以检查是否有超过1条记录
func (r *Repository) HasPreviousPaidSubscription(userID uint) (bool, error) {
	var count int64
	err := r.db.Model(&UserSubscription{}).
		Where("user_id = ? AND plan_code IN (?, ?)", userID, "pro", "max").
		Count(&count).Error
	if err != nil {
		return false, err
	}
	// 如果有超过1条记录，说明之前已经开通过（当前这次是续费）
	return count > 1, nil
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

// GetActiveSubscriptionsByPlanCodes 获取指定计划代码的所有活跃订阅
func (r *Repository) GetActiveSubscriptionsByPlanCodes(planCodes []string) ([]UserSubscription, error) {
	var subscriptions []UserSubscription
	err := r.db.Where("plan_code IN ? AND status = ?", planCodes, "active").Find(&subscriptions).Error
	return subscriptions, err
}

// GetAllActiveSubscriptions 获取所有活跃订阅
func (r *Repository) GetAllActiveSubscriptions() ([]UserSubscription, error) {
	var subscriptions []UserSubscription
	err := r.db.Where("status = ?", "active").Find(&subscriptions).Error
	return subscriptions, err
}

// GetExpiredMembersWithGracePeriod 获取过期超过宽限期且还有经费的会员
// graceDays: 宽限期天数
// 返回：过期时间超过 graceDays 天的用户（原来是 pro/max 会员，现在已过期或取消，且还有经费）
func (r *Repository) GetExpiredMembersWithGracePeriod(graceDays int) ([]ExpiredMemberInfo, error) {
	// 计算宽限期截止时间（当前时间减去宽限期天数）
	graceDeadline := time.Now().AddDate(0, 0, -graceDays)

	var results []ExpiredMemberInfo

	// 查询已过期或已取消的 pro/max 订阅
	// 条件：
	// 1. plan_code 是 pro 或 max
	// 2. status 是 expired 或 cancelled
	// 3. end_date 不为空且在宽限期截止时间之前
	// 4. 用户当前没有活跃的 pro/max 订阅
	// 5. 用户钱包中还有经费（gold > 0）
	err := r.db.Raw(`
		SELECT DISTINCT us.user_id, us.plan_code, us.end_date as expired_at
		FROM user_subscriptions us
		INNER JOIN wallets w ON w.user_id = us.user_id AND w.gold > 0
		WHERE us.plan_code IN ('pro', 'max')
		  AND us.status IN ('expired', 'cancelled')
		  AND us.end_date IS NOT NULL
		  AND us.end_date < ?
		  AND NOT EXISTS (
			SELECT 1 FROM user_subscriptions active_sub
			WHERE active_sub.user_id = us.user_id
			  AND active_sub.plan_code IN ('pro', 'max')
			  AND active_sub.status = 'active'
		  )
		ORDER BY us.end_date ASC
	`, graceDeadline).Scan(&results).Error

	return results, err
}

// ExpiredMemberInfo 过期会员信息
type ExpiredMemberInfo struct {
	UserID    uint      `gorm:"column:user_id"`
	PlanCode  string    `gorm:"column:plan_code"`
	ExpiredAt time.Time `gorm:"column:expired_at"`
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
