package subscription

import (
	"time"
)

// SubscriptionPlan represents a subscription plan
type SubscriptionPlan struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	PlanCode     string    `gorm:"uniqueIndex;size:20;not null" json:"plan_code"`
	PlanName     string    `gorm:"size:50;not null" json:"plan_name"`
	PriceMonthly float64   `gorm:"type:decimal(10,2);not null;default:0.00" json:"price_monthly"`
	PriceYearly  float64   `gorm:"type:decimal(10,2);not null;default:0.00" json:"price_yearly"`
	Features     string    `gorm:"type:json;not null" json:"features"` // JSON string
	IsActive     bool      `gorm:"not null;default:1" json:"is_active"`
	SortOrder    int       `gorm:"not null;default:0" json:"sort_order"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// TableName specifies the table name for SubscriptionPlan
func (SubscriptionPlan) TableName() string {
	return "subscription_plans"
}

// UserSubscription represents a user's subscription
type UserSubscription struct {
	ID        uint       `gorm:"primaryKey" json:"id"`
	UserID    uint       `gorm:"not null;index:idx_user_status" json:"user_id"`
	PlanCode  string     `gorm:"size:20;not null" json:"plan_code"`
	StartDate time.Time  `gorm:"not null" json:"start_date"`
	EndDate   *time.Time `json:"end_date"`
	Status    string     `gorm:"size:20;not null;default:active;index" json:"status"` // active, expired, cancelled
	AutoRenew bool       `gorm:"not null;default:0" json:"auto_renew"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
}

// TableName specifies the table name for UserSubscription
func (UserSubscription) TableName() string {
	return "user_subscriptions"
}

// UsageQuota represents daily usage quota tracking
type UsageQuota struct {
	ID                      uint      `gorm:"primaryKey" json:"id"`
	UserID                  uint      `gorm:"not null;uniqueIndex:uk_user_date" json:"user_id"`
	QuotaDate               string    `gorm:"type:date;not null;uniqueIndex:uk_user_date" json:"quota_date"` // YYYY-MM-DD
	NormalSearchCount       int       `gorm:"not null;default:0" json:"normal_search_count"`
	AdvancedSearchLowCount  int       `gorm:"not null;default:0" json:"advanced_search_low_count"`
	AdvancedSearchMidCount  int       `gorm:"not null;default:0" json:"advanced_search_mid_count"`
	AdvancedSearchHighCount int       `gorm:"not null;default:0" json:"advanced_search_high_count"`
	AIChatNormalCount       int       `gorm:"not null;default:0" json:"ai_chat_normal_count"`
	AIChatMidCount          int       `gorm:"not null;default:0" json:"ai_chat_mid_count"`
	AIChatHighCount         int       `gorm:"not null;default:0" json:"ai_chat_high_count"`
	CreatedAt               time.Time `json:"created_at"`
	UpdatedAt               time.Time `json:"updated_at"`
}

// TableName specifies the table name for UsageQuota
func (UsageQuota) TableName() string {
	return "usage_quotas"
}

// PlanFeatures represents the features of a subscription plan
type PlanFeatures struct {
	NormalSearch        FeatureQuota `json:"normal_search"`
	AdvancedSearchLow   FeatureQuota `json:"advanced_search_low"`
	AdvancedSearchMid   FeatureQuota `json:"advanced_search_mid"`
	AdvancedSearchHigh  FeatureQuota `json:"advanced_search_high"`
	AIChatNormal        FeatureQuota `json:"ai_chat_normal"`
	AIChatMid           FeatureQuota `json:"ai_chat_mid"`
	AIChatHigh          FeatureQuota `json:"ai_chat_high"`
	AdvancedSearchData  FeatureData  `json:"advanced_search_data"`
	AIHistoryData       FeatureData  `json:"ai_history_data"`
}

// FeatureQuota represents a quota for a specific feature
type FeatureQuota struct {
	Limit       int    `json:"limit"`       // -1 means unlimited
	Period      string `json:"period"`      // day, month, year
	Description string `json:"description"` // Display text like "5/天" or "无限制"
}

// FeatureData represents data access features
type FeatureData struct {
	Enabled     bool   `json:"enabled"`
	Description string `json:"description"`
}
