// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package subscription

import (
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"gorm.io/gorm"
)

// Service handles subscription business logic
type Service struct {
	repo *Repository
}

// NewService creates a new subscription service
func NewService(db *gorm.DB) *Service {
	return &Service{
		repo: NewRepository(db),
	}
}

// GetAllPlans retrieves all active subscription plans with parsed features
func (s *Service) GetAllPlans() ([]map[string]interface{}, error) {
	plans, err := s.repo.GetAllPlans()
	if err != nil {
		return nil, err
	}

	result := make([]map[string]interface{}, len(plans))
	for i, plan := range plans {
		var features PlanFeatures
		if err := json.Unmarshal([]byte(plan.Features), &features); err != nil {
			return nil, err
		}

		result[i] = map[string]interface{}{
			"id":                       plan.ID,
			"plan_code":                plan.PlanCode,
			"plan_name":                plan.PlanName,
			"price_monthly":            plan.PriceMonthly,
			"current_price_monthly":    plan.CurrentPriceMonthly,
			"price_yearly":             plan.PriceYearly,
			"current_price_yearly":     plan.CurrentPriceYearly,
			"yearly_discount_enabled":  plan.YearlyDiscountEnabled,
			"yearly_discount_percent":  plan.YearlyDiscountPercent,
			"features":                 features,
			"is_active":                plan.IsActive,
			"sort_order":               plan.SortOrder,
		}
	}

	return result, nil
}

// GetPlanByCode retrieves a subscription plan by its plan code
func (s *Service) GetPlanByCode(planCode string) (*SubscriptionPlan, error) {
	return s.repo.GetPlanByCode(planCode)
}

// GetUserSubscription retrieves the user's current subscription info
func (s *Service) GetUserSubscription(userID uint) (map[string]interface{}, error) {
	subscription, err := s.repo.GetUserActiveSubscription(userID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			// User has no active subscription, return free plan
			return map[string]interface{}{
				"plan_code":  "free",
				"plan_name":  "FREE",
				"status":     "active",
				"start_date": nil,
				"end_date":   nil,
				"auto_renew": false,
			}, nil
		}
		return nil, err
	}

	// Get plan details
	plan, err := s.repo.GetPlanByCode(subscription.PlanCode)
	if err != nil {
		return nil, err
	}

	var features PlanFeatures
	if err := json.Unmarshal([]byte(plan.Features), &features); err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"plan_code":     subscription.PlanCode,
		"plan_name":     plan.PlanName,
		"status":        subscription.Status,
		"start_date":    subscription.StartDate,
		"end_date":      subscription.EndDate,
		"auto_renew":    subscription.AutoRenew,
		"price_monthly": plan.PriceMonthly,
		"price_yearly":  plan.PriceYearly,
		"features":      features,
	}, nil
}

// GetUserUsageQuota retrieves the user's current usage quota
func (s *Service) GetUserUsageQuota(userID uint) (map[string]interface{}, error) {
	today := time.Now().Format("2006-01-02")
	quota, err := s.repo.GetTodayUsageQuota(userID, today)
	if err != nil {
		return nil, err
	}

	// Get user's subscription plan
	subscription, err := s.GetUserSubscription(userID)
	if err != nil {
		return nil, err
	}

	planCode := subscription["plan_code"].(string)
	plan, err := s.repo.GetPlanByCode(planCode)
	if err != nil {
		return nil, err
	}

	var features PlanFeatures
	if err := json.Unmarshal([]byte(plan.Features), &features); err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"quota_date": quota.QuotaDate,
		"usage": map[string]interface{}{
			"normal_search":         quota.NormalSearchCount,
			"advanced_search_low":   quota.AdvancedSearchLowCount,
			"advanced_search_mid":   quota.AdvancedSearchMidCount,
			"advanced_search_high":  quota.AdvancedSearchHighCount,
			"ai_chat_normal":        quota.AIChatNormalCount,
			"ai_chat_mid":           quota.AIChatMidCount,
			"ai_chat_high":          quota.AIChatHighCount,
		},
		"limits": map[string]interface{}{
			"normal_search":         features.NormalSearch,
			"advanced_search_low":   features.AdvancedSearchLow,
			"advanced_search_mid":   features.AdvancedSearchMid,
			"advanced_search_high":  features.AdvancedSearchHigh,
			"ai_chat_normal":        features.AIChatNormal,
			"ai_chat_mid":           features.AIChatMid,
			"ai_chat_high":          features.AIChatHigh,
		},
	}, nil
}

// CheckQuota checks if user has remaining quota for a specific feature
func (s *Service) CheckQuota(userID uint, featureType string) (bool, error) {
	today := time.Now().Format("2006-01-02")
	quota, err := s.repo.GetTodayUsageQuota(userID, today)
	if err != nil {
		return false, err
	}

	// Get user's subscription plan
	subscription, err := s.repo.GetUserActiveSubscription(userID)
	planCode := "free"
	if err == nil && subscription != nil {
		planCode = subscription.PlanCode
	}

	plan, err := s.repo.GetPlanByCode(planCode)
	if err != nil {
		return false, err
	}

	var features PlanFeatures
	if err := json.Unmarshal([]byte(plan.Features), &features); err != nil {
		return false, err
	}

	// Check if quota is exceeded
	switch featureType {
	case "normal_search":
		if features.NormalSearch.Limit == -1 {
			return true, nil
		}
		return quota.NormalSearchCount < features.NormalSearch.Limit, nil
	case "advanced_search_low":
		if features.AdvancedSearchLow.Limit == -1 {
			return true, nil
		}
		return quota.AdvancedSearchLowCount < features.AdvancedSearchLow.Limit, nil
	case "advanced_search_mid":
		if features.AdvancedSearchMid.Limit == -1 {
			return true, nil
		}
		return quota.AdvancedSearchMidCount < features.AdvancedSearchMid.Limit, nil
	case "advanced_search_high":
		if features.AdvancedSearchHigh.Limit == -1 {
			return true, nil
		}
		return quota.AdvancedSearchHighCount < features.AdvancedSearchHigh.Limit, nil
	case "ai_chat_normal":
		if features.AIChatNormal.Limit == -1 {
			return true, nil
		}
		return quota.AIChatNormalCount < features.AIChatNormal.Limit, nil
	case "ai_chat_mid":
		if features.AIChatMid.Limit == -1 {
			return true, nil
		}
		return quota.AIChatMidCount < features.AIChatMid.Limit, nil
	case "ai_chat_high":
		if features.AIChatHigh.Limit == -1 {
			return true, nil
		}
		return quota.AIChatHighCount < features.AIChatHigh.Limit, nil
	}

	return false, errors.New("invalid feature type")
}

// IncrementUsage increments usage count for a specific feature
func (s *Service) IncrementUsage(userID uint, featureType string) error {
	today := time.Now().Format("2006-01-02")
	return s.repo.IncrementUsage(userID, today, featureType)
}

// CheckAndIncrementQuota atomically checks quota and increments usage in a single transaction
// This prevents race conditions where multiple concurrent requests might exceed the quota
func (s *Service) CheckAndIncrementQuota(userID uint, featureType string) error {
	today := time.Now().Format("2006-01-02")

	// Get user's subscription plan
	subscription, err := s.repo.GetUserActiveSubscription(userID)
	planCode := "FREE"
	if err == nil && subscription != nil {
		planCode = subscription.PlanCode
	}

	plan, err := s.repo.GetPlanByCode(planCode)
	if err != nil {
		return fmt.Errorf("failed to get plan: %w", err)
	}

	var features PlanFeatures
	if err := json.Unmarshal([]byte(plan.Features), &features); err != nil {
		return fmt.Errorf("failed to parse plan features: %w", err)
	}

	// Get the limit for this feature
	var limit int
	switch featureType {
	case "normal_search":
		limit = features.NormalSearch.Limit
	case "advanced_search_low":
		limit = features.AdvancedSearchLow.Limit
	case "advanced_search_mid":
		limit = features.AdvancedSearchMid.Limit
	case "advanced_search_high":
		limit = features.AdvancedSearchHigh.Limit
	case "ai_chat_normal":
		limit = features.AIChatNormal.Limit
	case "ai_chat_mid":
		limit = features.AIChatMid.Limit
	case "ai_chat_high":
		limit = features.AIChatHigh.Limit
	default:
		return fmt.Errorf("invalid feature type: %s", featureType)
	}

	// -1 means unlimited
	if limit == -1 {
		// Still increment for statistics
		return s.repo.IncrementUsage(userID, today, featureType)
	}

	// Use transaction to atomically check and increment
	return s.repo.CheckAndIncrementQuota(userID, today, featureType, limit)
}

// UpgradeSubscription upgrades or downgrades a user's subscription
func (s *Service) UpgradeSubscription(userID uint, newPlanCode string, duration int) error {
	// Validate plan exists
	plan, err := s.repo.GetPlanByCode(newPlanCode)
	if err != nil {
		return err
	}
	if plan == nil {
		return errors.New("invalid plan code")
	}

	// Cancel existing active subscription if exists
	existingSub, err := s.repo.GetUserActiveSubscription(userID)
	if err == nil && existingSub != nil {
		existingSub.Status = "cancelled"
		if err := s.repo.UpdateSubscription(existingSub); err != nil {
			return err
		}
	}

	// Create new subscription
	startDate := time.Now()
	var endDate *time.Time
	if duration > 0 {
		end := startDate.AddDate(0, duration, 0)
		endDate = &end
	}

	newSub := &UserSubscription{
		UserID:    userID,
		PlanCode:  newPlanCode,
		StartDate: startDate,
		EndDate:   endDate,
		Status:    "active",
		AutoRenew: false,
	}

	return s.repo.CreateSubscription(newSub)
}

// UpdatePlan updates a subscription plan
func (s *Service) UpdatePlan(planID uint, planName string, priceMonthly, currentPriceMonthly, priceYearly, currentPriceYearly float64, yearlyDiscountEnabled bool, yearlyDiscountPercent float64, features PlanFeatures) error {
	// Get the plan
	plan, err := s.repo.GetPlanByID(planID)
	if err != nil {
		return fmt.Errorf("plan not found: %w", err)
	}

	// Update fields
	plan.PlanName = planName
	plan.PriceMonthly = priceMonthly
	plan.CurrentPriceMonthly = currentPriceMonthly
	plan.PriceYearly = priceYearly
	plan.CurrentPriceYearly = currentPriceYearly
	plan.YearlyDiscountEnabled = yearlyDiscountEnabled
	plan.YearlyDiscountPercent = yearlyDiscountPercent

	// Marshal features to JSON
	featuresJSON, err := json.Marshal(features)
	if err != nil {
		return fmt.Errorf("failed to marshal features: %w", err)
	}
	plan.Features = string(featuresJSON)

	// Save to database
	return s.repo.UpdatePlan(plan)
}
