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

// 会员等级。free < pro < max(单调升级,见 tierRank)。
const (
	TierFree = "free"
	TierPro  = "pro"
	TierMax  = "max"
)

// tierRank 用于单调比较(绝不降级):free=0 < pro=1 < max=2。未知等级按 free。
func tierRank(tier string) int {
	switch tier {
	case TierMax:
		return 2
	case TierPro:
		return 1
	default:
		return 0
	}
}

// isPaidTier 是否付费等级(pro/max,享额度倍率 + 经费赠送)。
func isPaidTier(tier string) bool { return tier == TierPro || tier == TierMax }

// RedemptionCode 兑换码一行(表 vip_redemption_codes)。grant_kind=tier 发会员 / credit 发经费。
type RedemptionCode struct {
	ID                 uint64     `gorm:"primaryKey" json:"id"`
	Code               string     `gorm:"column:code" json:"code"`
	GrantKind          string     `gorm:"column:grant_kind" json:"grant_kind"` // tier | credit
	GrantTier          string     `gorm:"column:grant_tier" json:"grant_tier"`
	GrantDays          int        `gorm:"column:grant_days" json:"grant_days"`
	GrantCredits       int        `gorm:"column:grant_credits" json:"grant_credits"`         // credit 码:经费数
	CreditKind         string     `gorm:"column:credit_kind" json:"credit_kind"`             // temp | perm
	CreditValidityDays int        `gorm:"column:credit_validity_days" json:"credit_validity_days"`
	MaxUses            int        `gorm:"column:max_uses" json:"max_uses"`     // 可兑换总次数(1..100)
	UsedCount          int        `gorm:"column:used_count" json:"used_count"` // 已兑换次数
	RevokedAt          *time.Time `gorm:"column:revoked_at" json:"revoked_at"` // 管理员停用时间;NULL=有效
	ValidUntil         *time.Time `gorm:"column:valid_until" json:"valid_until"`
	RedeemedByUserID   *uint      `gorm:"column:redeemed_by_user_id" json:"redeemed_by_user_id"` // 最近兑换者(展示用)
	RedeemedAt         *time.Time `gorm:"column:redeemed_at" json:"redeemed_at"`                 // 最近兑换时间(展示用)
	Note               string     `gorm:"column:note" json:"note"`
	CreatedBy          *uint      `gorm:"column:created_by" json:"created_by"`
	CreatedAt          time.Time  `gorm:"column:created_at;autoCreateTime" json:"created_at"`
}

// TableName 指定表名。
func (RedemptionCode) TableName() string { return "vip_redemption_codes" }

// CodeRedemption 兑换流水一行(表 vip_code_redemptions)。每用户每码唯一(uk_code_user),
// 是「该用户是否已兑换过此码」的判据,也提供多次兑换的审计轨迹。
type CodeRedemption struct {
	ID         uint64    `gorm:"primaryKey" json:"id"`
	CodeID     uint64    `gorm:"column:code_id" json:"code_id"`
	UserID     uint      `gorm:"column:user_id" json:"user_id"`
	RedeemedAt time.Time `gorm:"column:redeemed_at;autoCreateTime" json:"redeemed_at"`
}

// TableName 指定表名。
func (CodeRedemption) TableName() string { return "vip_code_redemptions" }

// UserVIP 是 users 表上 VIP 相关的两列(单独查, 不动 user.User 模型, 解耦)。
type UserVIP struct {
	VIPTier      string     `gorm:"column:vip_tier"`
	VIPExpiresAt *time.Time `gorm:"column:vip_expires_at"`
}
