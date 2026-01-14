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

// ActivationCallback 会员激活回调函数类型
// userID: 用户ID
// planCode: 套餐代码 (pro/max)
// isNewActivation: 是否是新开通（true=新开通，false=续费）
type ActivationCallback func(userID uint, planCode string, isNewActivation bool)

// Service handles subscription business logic
type Service struct {
	repo               *Repository
	activationCallback ActivationCallback // 会员激活时的回调
}

// NewService creates a new subscription service
func NewService(db *gorm.DB) *Service {
	return &Service{
		repo: NewRepository(db),
	}
}

// SetActivationCallback 设置会员激活回调
// 当用户开通会员时会调用此回调，用于发放奖励等操作
func (s *Service) SetActivationCallback(callback ActivationCallback) {
	s.activationCallback = callback
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
			// User has no active subscription, check for expired subscription
			expiredSub, expErr := s.repo.GetUserLatestExpiredSubscription(userID)
			if expErr == nil && expiredSub != nil {
				// 用户有过期的会员订阅，返回过期信息
				plan, planErr := s.repo.GetPlanByCode(expiredSub.PlanCode)
				if planErr == nil && plan != nil {
					// 计算过期天数
					expiredDays := 0
					if expiredSub.EndDate != nil {
						now := time.Now()
						// 使用明天凌晨来计算，保持与其他判断一致
						tomorrowMidnight := time.Date(now.Year(), now.Month(), now.Day()+1, 0, 0, 0, 0, now.Location())
						expiredDays = int(tomorrowMidnight.Sub(*expiredSub.EndDate).Hours() / 24)
						if expiredDays < 0 {
							expiredDays = 0
						}
					}
					return map[string]interface{}{
						"plan_code":             "free",
						"plan_name":             "FREE",
						"status":                "active",
						"start_date":            nil,
						"end_date":              nil,
						"auto_renew":            false,
						"expired_membership":    true,
						"expired_plan_code":     expiredSub.PlanCode,
						"expired_plan_name":     plan.PlanName,
						"expired_date":          expiredSub.EndDate,
						"expired_days":          expiredDays,
					}, nil
				}
			}
			// 没有过期订阅或查询失败，返回普通免费计划
			return map[string]interface{}{
				"plan_code":          "free",
				"plan_name":          "FREE",
				"status":             "active",
				"start_date":         nil,
				"end_date":           nil,
				"auto_renew":         false,
				"expired_membership": false,
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
		"plan_code":          subscription.PlanCode,
		"plan_name":          plan.PlanName,
		"status":             subscription.Status,
		"start_date":         subscription.StartDate,
		"end_date":           subscription.EndDate,
		"auto_renew":         subscription.AutoRenew,
		"price_monthly":      plan.PriceMonthly,
		"price_yearly":       plan.PriceYearly,
		"features":           features,
		"expired_membership": false,
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
// Deprecated: 配额检查已废弃，现在使用货币系统进行扣费控制。此方法始终返回 true
func (s *Service) CheckQuota(userID uint, featureType string) (bool, error) {
	// 配额检查已废弃，始终返回 true
	return true, nil
}

// IncrementUsage increments usage count for a specific feature
// Deprecated: 配额统计已废弃，现在使用货币系统进行扣费控制。此方法不再执行任何操作
func (s *Service) IncrementUsage(userID uint, featureType string) error {
	// 配额统计已废弃，不再执行任何操作
	return nil
}

// CheckAndIncrementQuota atomically checks quota and increments usage in a single transaction
// Deprecated: 配额检查已废弃，现在使用货币系统进行扣费控制。此方法不再执行任何操作
func (s *Service) CheckAndIncrementQuota(userID uint, featureType string) error {
	// 配额检查已废弃，不再执行任何操作
	return nil
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

	// 检查是否是新开通（在创建新订阅之前检查）
	isNewActivation := false
	if newPlanCode == "pro" || newPlanCode == "max" {
		hadPrevious, err := s.repo.HasPreviousPaidSubscription(userID)
		if err != nil {
			fmt.Printf("Warning: failed to check previous subscription for user %d: %v\n", userID, err)
		} else {
			isNewActivation = !hadPrevious
		}
	}

	// 获取现有活跃订阅
	existingSub, err := s.repo.GetUserActiveSubscription(userID)
	
	// 判断是否是续费（同一套餐且未过期）
	isRenewal := false
	var baseEndDate time.Time
	if err == nil && existingSub != nil {
		if existingSub.PlanCode == newPlanCode && existingSub.EndDate != nil && existingSub.EndDate.After(time.Now()) {
			// 同一套餐且未过期，是续费
			isRenewal = true
			baseEndDate = *existingSub.EndDate
		}
		// 取消现有订阅
		existingSub.Status = "cancelled"
		if err := s.repo.UpdateSubscription(existingSub); err != nil {
			return err
		}
	}

	// 计算新订阅的开始时间和结束时间
	var startDate time.Time
	var endDate *time.Time
	
	if isRenewal {
		// 续费：在原有到期时间基础上延长
		startDate = time.Now()
		if duration > 0 {
			end := baseEndDate.AddDate(0, duration, 0)
			endDate = &end
		}
		fmt.Printf("Renewal: user %d, plan %s, extending from %v by %d months to %v\n", 
			userID, newPlanCode, baseEndDate, duration, endDate)
	} else {
		// 新开通或升级/降级：从当前时间开始
		startDate = time.Now()
		if duration > 0 {
			end := startDate.AddDate(0, duration, 0)
			endDate = &end
		}
	}

	newSub := &UserSubscription{
		UserID:    userID,
		PlanCode:  newPlanCode,
		StartDate: startDate,
		EndDate:   endDate,
		Status:    "active",
		AutoRenew: false,
	}

	if err := s.repo.CreateSubscription(newSub); err != nil {
		return err
	}

	// 调用激活回调（异步执行，不影响主流程）
	// 注意：续费时也调用回调，但 isNewActivation 为 false，回调内部会判断是否发放奖励
	if s.activationCallback != nil && (newPlanCode == "pro" || newPlanCode == "max") {
		go func() {
			defer func() {
				if r := recover(); r != nil {
					fmt.Printf("Warning: activation callback panicked for user %d: %v\n", userID, r)
				}
			}()
			s.activationCallback(userID, newPlanCode, isNewActivation)
		}()
	}

	return nil
}

// GetActiveSubscriptionsByPlanCodes 获取指定计划的所有活跃订阅
func (s *Service) GetActiveSubscriptionsByPlanCodes(planCodes []string) ([]UserSubscription, error) {
	return s.repo.GetActiveSubscriptionsByPlanCodes(planCodes)
}

// HasPreviousPaidSubscription 检查用户是否有过付费会员记录
// 用于判断是新开通还是续费
func (s *Service) HasPreviousPaidSubscription(userID uint) (bool, error) {
	return s.repo.HasPreviousPaidSubscription(userID)
}

// SubscriptionInfoForCurrency 用于货币系统的订阅信息
type SubscriptionInfoForCurrency struct {
	UserID   uint
	PlanCode string
}

// GetActiveSubscriptionsByPlanCodesForCurrency 获取指定计划的所有活跃订阅（用于货币系统）
func (s *Service) GetActiveSubscriptionsByPlanCodesForCurrency(planCodes []string) ([]SubscriptionInfoForCurrency, error) {
	subs, err := s.repo.GetActiveSubscriptionsByPlanCodes(planCodes)
	if err != nil {
		return nil, err
	}

	result := make([]SubscriptionInfoForCurrency, len(subs))
	for i, sub := range subs {
		result[i] = SubscriptionInfoForCurrency{
			UserID:   sub.UserID,
			PlanCode: sub.PlanCode,
		}
	}
	return result, nil
}

// ExpiredMemberForCurrency 过期会员信息（用于货币系统）
type ExpiredMemberForCurrency struct {
	UserID    uint
	PlanCode  string
	ExpiredAt time.Time
}

// GetExpiredMembersWithGracePeriod 获取过期超过宽限期的会员（用于货币系统）
// 已废弃：使用 GetNonMembersWithGold 替代
func (s *Service) GetExpiredMembersWithGracePeriod(graceDays int) ([]ExpiredMemberForCurrency, error) {
	members, err := s.repo.GetExpiredMembersWithGracePeriod(graceDays)
	if err != nil {
		return nil, err
	}

	result := make([]ExpiredMemberForCurrency, len(members))
	for i, m := range members {
		result[i] = ExpiredMemberForCurrency{
			UserID:    m.UserID,
			PlanCode:  m.PlanCode,
			ExpiredAt: m.ExpiredAt,
		}
	}
	return result, nil
}

// NonMemberForCurrency 非会员用户信息（用于货币系统）
type NonMemberForCurrency struct {
	UserID              uint
	Gold                int64
	LastSubscriptionEnd *time.Time // 最后一次订阅结束时间，可能为空（从未开通过）
}

// GetNonMembersWithGold 获取所有非会员用户（有经费但没有活跃pro/max订阅）
// 用于月度清空非会员经费
func (s *Service) GetNonMembersWithGold() ([]NonMemberForCurrency, error) {
	members, err := s.repo.GetNonMembersWithGold()
	if err != nil {
		return nil, err
	}

	result := make([]NonMemberForCurrency, len(members))
	for i, m := range members {
		result[i] = NonMemberForCurrency{
			UserID:              m.UserID,
			Gold:                m.Gold,
			LastSubscriptionEnd: m.LastSubscriptionEnd,
		}
	}
	return result, nil
}

// MemberInGracePeriod 宽限期内的会员信息（用于货币系统）
type MemberInGracePeriod struct {
	UserID    uint
	Gold      int64
	ExpiredAt *time.Time // 会员过期时间
}

// GetMembersInGracePeriod 获取在宽限期内的过期会员（有经费）
// graceDays: 宽限期天数
func (s *Service) GetMembersInGracePeriod(graceDays int) ([]MemberInGracePeriod, error) {
	members, err := s.repo.GetMembersInGracePeriod(graceDays)
	if err != nil {
		return nil, err
	}

	result := make([]MemberInGracePeriod, len(members))
	for i, m := range members {
		result[i] = MemberInGracePeriod{
			UserID:    m.UserID,
			Gold:      m.Gold,
			ExpiredAt: m.ExpiredAt,
		}
	}
	return result, nil
}

// GetNonMembersWithGoldAfterGrace 获取超过宽限期的非会员用户（有经费）
// graceDays: 宽限期天数
func (s *Service) GetNonMembersWithGoldAfterGrace(graceDays int) ([]NonMemberForCurrency, error) {
	members, err := s.repo.GetNonMembersWithGoldAfterGrace(graceDays)
	if err != nil {
		return nil, err
	}

	result := make([]NonMemberForCurrency, len(members))
	for i, m := range members {
		result[i] = NonMemberForCurrency{
			UserID:              m.UserID,
			Gold:                m.Gold,
			LastSubscriptionEnd: m.LastSubscriptionEnd,
		}
	}
	return result, nil
}

// GetAllActiveSubscriptions 获取所有活跃订阅
func (s *Service) GetAllActiveSubscriptions() ([]UserSubscription, error) {
	return s.repo.GetAllActiveSubscriptions()
}

// ExpiringMember 即将到期的会员信息（用于货币系统）
type ExpiringMember struct {
	UserID   uint
	PlanCode string
	EndDate  *time.Time // 会员到期时间
}

// GetExpiringMembers 获取即将在N天内到期的活跃会员
// days: 提前提醒天数
func (s *Service) GetExpiringMembers(days int) ([]ExpiringMember, error) {
	members, err := s.repo.GetExpiringMembers(days)
	if err != nil {
		return nil, err
	}

	result := make([]ExpiringMember, len(members))
	for i, m := range members {
		result[i] = ExpiringMember{
			UserID:   m.UserID,
			PlanCode: m.PlanCode,
			EndDate:  m.EndDate,
		}
	}
	return result, nil
}

// GracePeriodEndingMember 宽限期即将结束的会员信息（用于货币系统）
type GracePeriodEndingMember struct {
	UserID       uint
	Gold         int64
	ExpiredAt    *time.Time // 会员过期时间
	GraceEndDate *time.Time // 宽限期结束时间
}

// GetMembersWithGracePeriodEnding 获取宽限期在N天内结束的会员
// graceDays: 宽限期天数
// reminderDays: 提前提醒天数
func (s *Service) GetMembersWithGracePeriodEnding(graceDays, reminderDays int) ([]GracePeriodEndingMember, error) {
	members, err := s.repo.GetMembersWithGracePeriodEnding(graceDays, reminderDays)
	if err != nil {
		return nil, err
	}

	result := make([]GracePeriodEndingMember, len(members))
	for i, m := range members {
		result[i] = GracePeriodEndingMember{
			UserID:       m.UserID,
			Gold:         m.Gold,
			ExpiredAt:    m.ExpiredAt,
			GraceEndDate: m.GraceEndDate,
		}
	}
	return result, nil
}

// GetNonMembersForMonthEndReminder 获取需要月底提醒的非会员
// graceDays: 宽限期天数
func (s *Service) GetNonMembersForMonthEndReminder(graceDays int) ([]NonMemberForCurrency, error) {
	members, err := s.repo.GetNonMembersForMonthEndReminder(graceDays)
	if err != nil {
		return nil, err
	}

	result := make([]NonMemberForCurrency, len(members))
	for i, m := range members {
		result[i] = NonMemberForCurrency{
			UserID:              m.UserID,
			Gold:                m.Gold,
			LastSubscriptionEnd: m.LastSubscriptionEnd,
		}
	}
	return result, nil
}

// ExpiredTodayMember 今天到期的会员信息（用于货币系统）
type ExpiredTodayMember struct {
	UserID   uint
	PlanCode string
	EndDate  *time.Time
}

// GetMembersExpiredToday 获取今天到期的会员
func (s *Service) GetMembersExpiredToday() ([]ExpiredTodayMember, error) {
	members, err := s.repo.GetMembersExpiredToday()
	if err != nil {
		return nil, err
	}

	result := make([]ExpiredTodayMember, len(members))
	for i, m := range members {
		result[i] = ExpiredTodayMember{
			UserID:   m.UserID,
			PlanCode: m.PlanCode,
			EndDate:  m.EndDate,
		}
	}
	return result, nil
}

// GraceExpiredMember 宽限期刚结束的用户信息（用于货币系统）
type GraceExpiredMember struct {
	UserID       uint
	Gold         int64
	GraceEndDate *time.Time
}

// GetMembersWithGraceExpiredYesterday 获取宽限期昨天结束的用户
// graceDays: 宽限期天数
func (s *Service) GetMembersWithGraceExpiredYesterday(graceDays int) ([]GraceExpiredMember, error) {
	members, err := s.repo.GetMembersWithGraceExpiredYesterday(graceDays)
	if err != nil {
		return nil, err
	}

	result := make([]GraceExpiredMember, len(members))
	for i, m := range members {
		result[i] = GraceExpiredMember{
			UserID:       m.UserID,
			Gold:         m.Gold,
			GraceEndDate: m.GraceEndDate,
		}
	}
	return result, nil
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
