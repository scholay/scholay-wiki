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

// getTomorrowMidnight 获取明天的00:00:00（当天结束时间）
// 用于判断会员是否有效：如果 end_date 是1月2日，则1月2日当天仍为会员，1月3日才失效
// 即 end_date >= 明天00:00 表示今天仍有效
func getTomorrowMidnight() time.Time {
	now := time.Now()
	return time.Date(now.Year(), now.Month(), now.Day()+1, 0, 0, 0, 0, now.Location())
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
// 注意：不仅检查 status = 'active'，还要检查 end_date >= 明天00:00（如果有 end_date）
// 这样即使系统未及时更新 status，也能正确判断会员是否有效
// 例如：end_date 是1月2日，1月2日当天仍为会员，1月3日才失效
func (r *Repository) GetUserActiveSubscription(userID uint) (*UserSubscription, error) {
	var subscription UserSubscription
	tomorrowMidnight := getTomorrowMidnight()
	// 检查 status = 'active' 且 (end_date 为空 或 end_date >= 明天00:00)
	// 即到期日当天仍为有效会员
	err := r.db.Where("user_id = ? AND status = ? AND (end_date IS NULL OR end_date >= ?)", userID, "active", tomorrowMidnight).
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

// GetUserLatestExpiredSubscription 获取用户最近过期的订阅（非free）
// 用于在用户会员过期后展示过期状态
func (r *Repository) GetUserLatestExpiredSubscription(userID uint) (*UserSubscription, error) {
	var subscription UserSubscription
	tomorrowMidnight := getTomorrowMidnight()
	// 查找已过期的非免费订阅（end_date < 明天00:00，即今天之前已过期）
	err := r.db.Where("user_id = ? AND plan_code != ? AND end_date IS NOT NULL AND end_date < ?",
		userID, "free", tomorrowMidnight).
		Order("end_date DESC").
		First(&subscription).Error
	if err != nil {
		return nil, err
	}
	return &subscription, nil
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
// 注意：不仅检查 status = 'active'，还要检查 end_date >= 明天00:00
// 到期日当天仍为有效会员
func (r *Repository) GetActiveSubscriptionsByPlanCodes(planCodes []string) ([]UserSubscription, error) {
	var subscriptions []UserSubscription
	tomorrowMidnight := getTomorrowMidnight()
	err := r.db.Where("plan_code IN ? AND status = ? AND (end_date IS NULL OR end_date >= ?)", planCodes, "active", tomorrowMidnight).Find(&subscriptions).Error
	return subscriptions, err
}

// GetAllActiveSubscriptions 获取所有活跃订阅
// 注意：不仅检查 status = 'active'，还要检查 end_date >= 明天00:00
// 到期日当天仍为有效会员
func (r *Repository) GetAllActiveSubscriptions() ([]UserSubscription, error) {
	var subscriptions []UserSubscription
	tomorrowMidnight := getTomorrowMidnight()
	err := r.db.Where("status = ? AND (end_date IS NULL OR end_date >= ?)", "active", tomorrowMidnight).Find(&subscriptions).Error
	return subscriptions, err
}

// GetExpiredMembersWithGracePeriod 获取过期超过宽限期且还有经费的会员
// graceDays: 宽限期天数
// 返回：过期时间超过 graceDays 天的用户（原来是 pro/max 会员，现在已过期或取消，且还有经费）
// 已废弃：使用 GetNonMembersWithGold 替代
func (r *Repository) GetExpiredMembersWithGracePeriod(graceDays int) ([]ExpiredMemberInfo, error) {
	// 计算宽限期截止时间（当前时间减去宽限期天数）
	graceDeadline := time.Now().AddDate(0, 0, -graceDays)
	// 获取明天00:00，用于判断会员是否有效（到期日当天仍为会员）
	tomorrowMidnight := getTomorrowMidnight()

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
			  AND (active_sub.end_date IS NULL OR active_sub.end_date >= ?)
		  )
		ORDER BY us.end_date ASC
	`, graceDeadline, tomorrowMidnight).Scan(&results).Error

	return results, err
}

// GetNonMembersWithGold 获取所有非会员用户（有经费但没有活跃pro/max订阅）
// 返回：当前没有活跃 pro/max 订阅且钱包中有经费（gold > 0）的用户
// 包括：从未开通过会员的用户、会员已过期的用户
func (r *Repository) GetNonMembersWithGold() ([]NonMemberInfo, error) {
	var results []NonMemberInfo
	// 获取明天00:00，用于判断会员是否有效（到期日当天仍为会员）
	tomorrowMidnight := getTomorrowMidnight()

	// 查询所有有经费但没有活跃 pro/max 订阅的用户
	// 条件：
	// 1. 用户钱包中有经费（gold > 0）
	// 2. 用户当前没有活跃的 pro/max 订阅（status = 'active' 且 end_date >= 明天00:00）
	err := r.db.Raw(`
		SELECT w.user_id, w.gold,
		       COALESCE(
		           (SELECT MAX(us.end_date) FROM user_subscriptions us
		            WHERE us.user_id = w.user_id AND us.plan_code IN ('pro', 'max')),
		           NULL
		       ) as last_subscription_end
		FROM wallets w
		WHERE w.gold > 0
		  AND NOT EXISTS (
			SELECT 1 FROM user_subscriptions active_sub
			WHERE active_sub.user_id = w.user_id
			  AND active_sub.plan_code IN ('pro', 'max')
			  AND active_sub.status = 'active'
			  AND (active_sub.end_date IS NULL OR active_sub.end_date >= ?)
		  )
		ORDER BY w.user_id ASC
	`, tomorrowMidnight).Scan(&results).Error

	return results, err
}

// ExpiredMemberInfo 过期会员信息
type ExpiredMemberInfo struct {
	UserID    uint      `gorm:"column:user_id"`
	PlanCode  string    `gorm:"column:plan_code"`
	ExpiredAt time.Time `gorm:"column:expired_at"`
}

// NonMemberInfo 非会员用户信息
type NonMemberInfo struct {
	UserID              uint       `gorm:"column:user_id"`
	Gold                int64      `gorm:"column:gold"`
	LastSubscriptionEnd *time.Time `gorm:"column:last_subscription_end"` // 最后一次订阅结束时间，可能为空（从未开通过）
}

// MembersInGracePeriodInfo 宽限期内的会员信息
type MembersInGracePeriodInfo struct {
	UserID    uint       `gorm:"column:user_id"`
	Gold      int64      `gorm:"column:gold"`
	ExpiredAt *time.Time `gorm:"column:expired_at"` // 会员过期时间
}

// GetMembersInGracePeriod 获取在宽限期内的过期会员（有经费）
// graceDays: 宽限期天数
// 返回：会员已过期但还在宽限期内，且有经费的用户
func (r *Repository) GetMembersInGracePeriod(graceDays int) ([]MembersInGracePeriodInfo, error) {
	now := time.Now()
	// 宽限期截止时间（当前时间减去宽限期天数）
	graceDeadline := now.AddDate(0, 0, -graceDays)
	// 获取明天00:00，用于判断会员是否有效（到期日当天仍为会员）
	tomorrowMidnight := getTomorrowMidnight()

	var results []MembersInGracePeriodInfo

	// 查询在宽限期内的过期会员
	// 条件：
	// 1. 用户钱包中有经费（gold > 0）
	// 2. 用户当前没有活跃的 pro/max 订阅（status = 'active' 且 end_date >= 明天00:00）
	// 3. 用户曾经有过 pro/max 订阅
	// 4. 最后一次订阅结束时间在宽限期截止时间之后（即还在宽限期内）
	err := r.db.Raw(`
		SELECT w.user_id, w.gold,
		       (SELECT MAX(us.end_date) FROM user_subscriptions us
		        WHERE us.user_id = w.user_id AND us.plan_code IN ('pro', 'max')) as expired_at
		FROM wallets w
		WHERE w.gold > 0
		  AND NOT EXISTS (
			SELECT 1 FROM user_subscriptions active_sub
			WHERE active_sub.user_id = w.user_id
			  AND active_sub.plan_code IN ('pro', 'max')
			  AND active_sub.status = 'active'
			  AND (active_sub.end_date IS NULL OR active_sub.end_date >= ?)
		  )
		  AND EXISTS (
			SELECT 1 FROM user_subscriptions past_sub
			WHERE past_sub.user_id = w.user_id
			  AND past_sub.plan_code IN ('pro', 'max')
			  AND past_sub.end_date IS NOT NULL
			  AND past_sub.end_date < ?
			  AND past_sub.end_date >= ?
		  )
		ORDER BY w.user_id ASC
	`, tomorrowMidnight, tomorrowMidnight, graceDeadline).Scan(&results).Error

	return results, err
}

// GetNonMembersWithGoldAfterGrace 获取超过宽限期的非会员用户（有经费）
// graceDays: 宽限期天数
// 返回：会员已过期且超过宽限期，或者从未开通过会员，且有经费的用户
func (r *Repository) GetNonMembersWithGoldAfterGrace(graceDays int) ([]NonMemberInfo, error) {
	// 宽限期截止时间（当前时间减去宽限期天数）
	graceDeadline := time.Now().AddDate(0, 0, -graceDays)
	// 获取明天00:00，用于判断会员是否有效（到期日当天仍为会员）
	tomorrowMidnight := getTomorrowMidnight()

	var results []NonMemberInfo

	// 查询超过宽限期的非会员用户
	// 条件：
	// 1. 用户钱包中有经费（gold > 0）
	// 2. 用户当前没有活跃的 pro/max 订阅（status = 'active' 且 end_date >= 明天00:00）
	// 3. 用户从未开通过会员，或者会员过期时间在宽限期截止时间之前
	err := r.db.Raw(`
		SELECT w.user_id, w.gold,
		       (SELECT MAX(us.end_date) FROM user_subscriptions us
		        WHERE us.user_id = w.user_id AND us.plan_code IN ('pro', 'max')) as last_subscription_end
		FROM wallets w
		WHERE w.gold > 0
		  AND NOT EXISTS (
			SELECT 1 FROM user_subscriptions active_sub
			WHERE active_sub.user_id = w.user_id
			  AND active_sub.plan_code IN ('pro', 'max')
			  AND active_sub.status = 'active'
			  AND (active_sub.end_date IS NULL OR active_sub.end_date >= ?)
		  )
		  AND (
		    -- 从未开通过会员
		    NOT EXISTS (
		      SELECT 1 FROM user_subscriptions past_sub
		      WHERE past_sub.user_id = w.user_id
		        AND past_sub.plan_code IN ('pro', 'max')
		    )
		    OR
		    -- 会员过期时间在宽限期截止时间之前（超过宽限期）
		    (SELECT MAX(us.end_date) FROM user_subscriptions us
		     WHERE us.user_id = w.user_id AND us.plan_code IN ('pro', 'max')) < ?
		  )
		ORDER BY w.user_id ASC
	`, tomorrowMidnight, graceDeadline).Scan(&results).Error

	return results, err
}

// ExpiringMemberInfo 即将到期的会员信息
type ExpiringMemberInfo struct {
	UserID    uint       `gorm:"column:user_id"`
	PlanCode  string     `gorm:"column:plan_code"`
	EndDate   *time.Time `gorm:"column:end_date"` // 会员到期时间
}

// GetExpiringMembers 获取即将在N天内到期的活跃会员
// days: 提前提醒天数
// 返回：会员到期时间在当前时间到N天后之间的活跃会员
func (r *Repository) GetExpiringMembers(days int) ([]ExpiringMemberInfo, error) {
	now := time.Now()
	// 截止时间（当前时间加上提醒天数）
	deadline := now.AddDate(0, 0, days)

	var results []ExpiringMemberInfo

	// 查询即将到期的活跃会员
	// 条件：
	// 1. plan_code 是 pro 或 max
	// 2. status 是 active
	// 3. end_date 在当前时间到 deadline 之间（即即将到期）
	err := r.db.Raw(`
		SELECT us.user_id, us.plan_code, us.end_date
		FROM user_subscriptions us
		WHERE us.plan_code IN ('pro', 'max')
		  AND us.status = 'active'
		  AND us.end_date IS NOT NULL
		  AND us.end_date > ?
		  AND us.end_date <= ?
		ORDER BY us.end_date ASC
	`, now, deadline).Scan(&results).Error

	return results, err
}

// ExpiredTodayInfo 今天到期的会员信息
type ExpiredTodayInfo struct {
	UserID   uint       `gorm:"column:user_id"`
	PlanCode string     `gorm:"column:plan_code"`
	EndDate  *time.Time `gorm:"column:end_date"`
}

// GetMembersExpiredToday 获取今天到期的会员
// 返回：会员到期时间是今天的活跃会员
func (r *Repository) GetMembersExpiredToday() ([]ExpiredTodayInfo, error) {
	now := time.Now()
	// 今天的开始和结束时间
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	todayEnd := todayStart.AddDate(0, 0, 1)

	var results []ExpiredTodayInfo

	// 查询今天到期的会员
	// 条件：
	// 1. plan_code 是 pro 或 max
	// 2. status 是 active
	// 3. end_date 在今天（>= todayStart 且 < todayEnd）
	err := r.db.Raw(`
		SELECT us.user_id, us.plan_code, us.end_date
		FROM user_subscriptions us
		WHERE us.plan_code IN ('pro', 'max')
		  AND us.status = 'active'
		  AND us.end_date IS NOT NULL
		  AND us.end_date >= ?
		  AND us.end_date < ?
		ORDER BY us.end_date ASC
	`, todayStart, todayEnd).Scan(&results).Error

	return results, err
}

// GraceExpiredInfo 宽限期刚结束的用户信息
type GraceExpiredInfo struct {
	UserID       uint       `gorm:"column:user_id"`
	Gold         int64      `gorm:"column:gold"`
	GraceEndDate *time.Time `gorm:"column:grace_end_date"` // 宽限期结束时间
}

// GetMembersWithGraceExpiredYesterday 获取宽限期昨天结束的用户
// graceDays: 宽限期天数
// 返回：宽限期结束时间是昨天的用户（即会员过期时间 + graceDays = 昨天）
func (r *Repository) GetMembersWithGraceExpiredYesterday(graceDays int) ([]GraceExpiredInfo, error) {
	now := time.Now()
	// 昨天的开始和结束时间
	yesterday := now.AddDate(0, 0, -1)
	yesterdayStart := time.Date(yesterday.Year(), yesterday.Month(), yesterday.Day(), 0, 0, 0, 0, now.Location())
	yesterdayEnd := yesterdayStart.AddDate(0, 0, 1)
	// 获取明天00:00，用于判断会员是否有效（到期日当天仍为会员）
	tomorrowMidnight := getTomorrowMidnight()

	var results []GraceExpiredInfo

	// 查询宽限期昨天结束的用户
	// 条件：
	// 1. 用户钱包中有经费（gold > 0）
	// 2. 用户当前没有活跃的 pro/max 订阅
	// 3. 用户曾经有过 pro/max 订阅且已过期
	// 4. 宽限期结束时间（过期时间 + graceDays）是昨天
	err := r.db.Raw(`
		SELECT w.user_id, w.gold,
		       DATE_ADD(
		           (SELECT MAX(us.end_date) FROM user_subscriptions us
		            WHERE us.user_id = w.user_id AND us.plan_code IN ('pro', 'max')),
		           INTERVAL ? DAY
		       ) as grace_end_date
		FROM wallets w
		WHERE w.gold > 0
		  AND NOT EXISTS (
			SELECT 1 FROM user_subscriptions active_sub
			WHERE active_sub.user_id = w.user_id
			  AND active_sub.plan_code IN ('pro', 'max')
			  AND active_sub.status = 'active'
			  AND (active_sub.end_date IS NULL OR active_sub.end_date >= ?)
		  )
		  AND EXISTS (
			SELECT 1 FROM user_subscriptions past_sub
			WHERE past_sub.user_id = w.user_id
			  AND past_sub.plan_code IN ('pro', 'max')
			  AND past_sub.end_date IS NOT NULL
		  )
		HAVING grace_end_date >= ? AND grace_end_date < ?
		ORDER BY grace_end_date ASC
	`, graceDays, tomorrowMidnight, yesterdayStart, yesterdayEnd).Scan(&results).Error

	return results, err
}

// GracePeriodEndingInfo 宽限期即将结束的会员信息
type GracePeriodEndingInfo struct {
	UserID       uint       `gorm:"column:user_id"`
	Gold         int64      `gorm:"column:gold"`
	ExpiredAt    *time.Time `gorm:"column:expired_at"`     // 会员过期时间
	GraceEndDate *time.Time `gorm:"column:grace_end_date"` // 宽限期结束时间
}

// GetMembersWithGracePeriodEnding 获取宽限期在N天内结束的会员
// graceDays: 宽限期天数
// reminderDays: 提前提醒天数
// 返回：宽限期结束时间在当前时间到 reminderDays 天后之间的会员
func (r *Repository) GetMembersWithGracePeriodEnding(graceDays, reminderDays int) ([]GracePeriodEndingInfo, error) {
	now := time.Now()
	// 提醒截止时间（当前时间加上提醒天数）
	reminderDeadline := now.AddDate(0, 0, reminderDays)
	// 获取明天00:00，用于判断会员是否有效（到期日当天仍为会员）
	tomorrowMidnight := getTomorrowMidnight()

	var results []GracePeriodEndingInfo

	// 查询宽限期即将结束的会员
	// 条件：
	// 1. 用户钱包中有经费（gold > 0）
	// 2. 用户当前没有活跃的 pro/max 订阅（status = 'active' 且 end_date >= 明天00:00）
	// 3. 用户曾经有过 pro/max 订阅且已过期
	// 4. 宽限期结束时间（过期时间 + graceDays）在当前时间到 reminderDeadline 之间
	err := r.db.Raw(`
		SELECT w.user_id, w.gold,
		       (SELECT MAX(us.end_date) FROM user_subscriptions us
		        WHERE us.user_id = w.user_id AND us.plan_code IN ('pro', 'max')) as expired_at,
		       DATE_ADD(
		           (SELECT MAX(us.end_date) FROM user_subscriptions us
		            WHERE us.user_id = w.user_id AND us.plan_code IN ('pro', 'max')),
		           INTERVAL ? DAY
		       ) as grace_end_date
		FROM wallets w
		WHERE w.gold > 0
		  AND NOT EXISTS (
			SELECT 1 FROM user_subscriptions active_sub
			WHERE active_sub.user_id = w.user_id
			  AND active_sub.plan_code IN ('pro', 'max')
			  AND active_sub.status = 'active'
			  AND (active_sub.end_date IS NULL OR active_sub.end_date >= ?)
		  )
		  AND EXISTS (
			SELECT 1 FROM user_subscriptions past_sub
			WHERE past_sub.user_id = w.user_id
			  AND past_sub.plan_code IN ('pro', 'max')
			  AND past_sub.end_date IS NOT NULL
			  AND past_sub.end_date < ?
		  )
		HAVING grace_end_date > ? AND grace_end_date <= ?
		ORDER BY grace_end_date ASC
	`, graceDays, tomorrowMidnight, tomorrowMidnight, now, reminderDeadline).Scan(&results).Error

	return results, err
}

// GetNonMembersForMonthEndReminder 获取需要月底提醒的非会员
// graceDays: 宽限期天数
// 返回：非会员（超过宽限期或从未开通）且有经费的用户，排除正在宽限期内的用户
func (r *Repository) GetNonMembersForMonthEndReminder(graceDays int) ([]NonMemberInfo, error) {
	now := time.Now()
	// 宽限期截止时间（当前时间减去宽限期天数）
	graceDeadline := now.AddDate(0, 0, -graceDays)
	// 获取明天00:00，用于判断会员是否有效（到期日当天仍为会员）
	tomorrowMidnight := getTomorrowMidnight()

	var results []NonMemberInfo

	// 查询需要月底提醒的非会员
	// 条件：
	// 1. 用户钱包中有经费（gold > 0）
	// 2. 用户当前没有活跃的 pro/max 订阅（status = 'active' 且 end_date >= 明天00:00）
	// 3. 排除正在宽限期内的用户（最后订阅结束时间在 graceDeadline 之后）
	// 4. 用户从未开通过会员，或者会员过期时间在宽限期截止时间之前
	err := r.db.Raw(`
		SELECT w.user_id, w.gold,
		       (SELECT MAX(us.end_date) FROM user_subscriptions us
		        WHERE us.user_id = w.user_id AND us.plan_code IN ('pro', 'max')) as last_subscription_end
		FROM wallets w
		WHERE w.gold > 0
		  AND NOT EXISTS (
			SELECT 1 FROM user_subscriptions active_sub
			WHERE active_sub.user_id = w.user_id
			  AND active_sub.plan_code IN ('pro', 'max')
			  AND active_sub.status = 'active'
			  AND (active_sub.end_date IS NULL OR active_sub.end_date >= ?)
		  )
		  AND (
		    -- 从未开通过会员
		    NOT EXISTS (
		      SELECT 1 FROM user_subscriptions past_sub
		      WHERE past_sub.user_id = w.user_id
		        AND past_sub.plan_code IN ('pro', 'max')
		    )
		    OR
		    -- 会员过期时间在宽限期截止时间之前（超过宽限期）
		    (SELECT MAX(us.end_date) FROM user_subscriptions us
		     WHERE us.user_id = w.user_id AND us.plan_code IN ('pro', 'max')) < ?
		  )
		ORDER BY w.user_id ASC
	`, tomorrowMidnight, graceDeadline).Scan(&results).Error

	return results, err
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
