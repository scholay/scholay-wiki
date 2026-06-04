// ============================================================================
// internal/vip —— 简单版会员(VIP):兑换码发放 + 按等级的每日 AI 功能限额。
//
// 等级 free / pro 存在 users.vip_tier + users.vip_expires_at(0008 迁移加列)。
// 兑换码存 vip_redemption_codes。限额是「每日次数」,计数走 Redis(同 agentbridge 日额度风格),
// 过期自动回 free(读取时按 now 判定, 不需要定时任务)。
//
// 刻意不依赖 stranded 的 subscription_* / coupon_* / orders 表(见 CLAUDE.md)。
// ============================================================================

package vip

import "time"

// 会员等级。
const (
	TierFree = "free"
	TierPro  = "pro"
)

// 受限额门槛的 4 个 AI 功能 key(独立计数命名空间, 与 llmusage/usagestat 的 feature 取值对齐,
// 但本模块自有一套, 不强耦合)。
const (
	FeatureTranslate   = "translate"
	FeatureSmartSearch = "smart_search"
	FeatureClaw        = "claw"
	FeaturePeerReview  = "peer_review"
	FeaturePrism       = "prism" // 智能写作 AI 编辑(每次 AI patch / Fix-with-AI 计一次)
)

// RedemptionCode 兑换码一行(表 vip_redemption_codes)。
type RedemptionCode struct {
	ID               uint64     `gorm:"primaryKey" json:"id"`
	Code             string     `gorm:"column:code" json:"code"`
	GrantTier        string     `gorm:"column:grant_tier" json:"grant_tier"`
	GrantDays        int        `gorm:"column:grant_days" json:"grant_days"`
	ValidUntil       *time.Time `gorm:"column:valid_until" json:"valid_until"`
	RedeemedByUserID *uint      `gorm:"column:redeemed_by_user_id" json:"redeemed_by_user_id"`
	RedeemedAt       *time.Time `gorm:"column:redeemed_at" json:"redeemed_at"`
	Note             string     `gorm:"column:note" json:"note"`
	CreatedBy        *uint      `gorm:"column:created_by" json:"created_by"`
	CreatedAt        time.Time  `gorm:"column:created_at;autoCreateTime" json:"created_at"`
}

// TableName 指定表名。
func (RedemptionCode) TableName() string { return "vip_redemption_codes" }

// UserVIP 是 users 表上 VIP 相关的两列(单独查, 不动 user.User 模型, 解耦)。
type UserVIP struct {
	VIPTier      string     `gorm:"column:vip_tier"`
	VIPExpiresAt *time.Time `gorm:"column:vip_expires_at"`
}
