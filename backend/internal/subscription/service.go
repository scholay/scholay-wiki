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
	"log/slog"
	"time"

	"gorm.io/gorm"
)

// ActivationCallback 会员激活回调函数类型
// userID: 用户ID
// planCode: 套餐代码 (pro/max)
// isNewActivation: 是否是新开通（true=新开通，false=续费）
type ActivationCallback func(userID uint, planCode string, isNewActivation bool)

// SubscriptionRepo defines the data-access contract consumed by Service.
// Keep it in the consumer (Service) per Go convention so Repository stays a plain struct.
type SubscriptionRepo interface {
	GetAllPlans() ([]SubscriptionPlan, error)
	GetPlanByCode(code string) (*SubscriptionPlan, error)
	GetPlanByID(id uint) (*SubscriptionPlan, error)
	UpdatePlan(plan *SubscriptionPlan) error

	GetUserActiveSubscription(userID uint) (*UserSubscription, error)
	GetUserLatestExpiredSubscription(userID uint) (*UserSubscription, error)
	HasPreviousPaidSubscription(userID uint) (bool, error)
	CreateSubscription(subscription *UserSubscription) error
	UpdateSubscription(subscription *UserSubscription) error
	GetActiveSubscriptionsByUserIDs(userIDs []uint) ([]SubscriptionSummary, error)
	GetActiveSubscriptionsByPlanCodes(planCodes []string) ([]UserSubscription, error)
	GetAllActiveSubscriptions() ([]UserSubscription, error)

	GetTodayUsageQuota(userID uint, date string) (*UsageQuota, error)

	GetNonMembersWithGold() ([]NonMemberInfo, error)
	GetMembersInGracePeriod(graceDays int) ([]MembersInGracePeriodInfo, error)
	GetNonMembersWithGoldAfterGrace(graceDays int) ([]NonMemberInfo, error)
	GetExpiringMembers(days int) ([]ExpiringMemberInfo, error)
	GetMembersExpiredToday() ([]ExpiredTodayInfo, error)
	GetMembersWithGracePeriodEnding(graceDays, reminderDays int) ([]GracePeriodEndingInfo, error)
	GetMembersWithGraceExpiredYesterday(graceDays int) ([]GraceExpiredInfo, error)
	GetNonMembersForMonthEndReminder(graceDays int) ([]NonMemberInfo, error)
}

// Service handles subscription business logic
type Service struct {
	repo               SubscriptionRepo
	activationCallback ActivationCallback
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
func (s *Service) GetAllPlans() ([]map[string]any, error) {
	plans, err := s.repo.GetAllPlans()
	if err != nil {
		return nil, err
	}

	result := make([]map[string]any, len(plans))
	for i, plan := range plans {
		var features PlanFeatures
		if err := json.Unmarshal([]byte(plan.Features), &features); err != nil {
			return nil, err
		}

		result[i] = map[string]any{
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
func (s *Service) GetUserSubscription(userID uint) (map[string]any, error) {
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
					return map[string]any{
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
			return map[string]any{
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

	return map[string]any{
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
func (s *Service) GetUserUsageQuota(userID uint) (map[string]any, error) {
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

	return map[string]any{
		"quota_date": quota.QuotaDate,
		"usage": map[string]any{
			"normal_search":         quota.NormalSearchCount,
			"advanced_search_low":   quota.AdvancedSearchLowCount,
			"advanced_search_mid":   quota.AdvancedSearchMidCount,
			"advanced_search_high":  quota.AdvancedSearchHighCount,
			"ai_chat_normal":        quota.AIChatNormalCount,
			"ai_chat_mid":           quota.AIChatMidCount,
			"ai_chat_high":          quota.AIChatHighCount,
		},
		"limits": map[string]any{
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
			slog.Warn("failed to check previous subscription", "user_id", userID, "err", err)
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
		slog.Info("subscription renewal", "user_id", userID, "plan", newPlanCode, "base_end", baseEndDate, "duration_months", duration, "new_end", endDate)
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
					slog.Error("activation callback panicked", "user_id", userID, "recover", r)
				}
			}()
			s.activationCallback(userID, newPlanCode, isNewActivation)
		}()
	}

	return nil
}

// GetActiveSubscriptionsByUserIDs returns active subscription summaries for a batch of user IDs
func (s *Service) GetActiveSubscriptionsByUserIDs(userIDs []uint) ([]SubscriptionSummary, error) {
	if len(userIDs) == 0 {
		return nil, nil
	}
	return s.repo.GetActiveSubscriptionsByUserIDs(userIDs)
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
