// ============================================================================
// internal/invite —— 邀请活动的统一真源与可审计奖励链路。
//
// 运行时只读 invite_campaign_config / invite_codes / invite_registrations /
// invite_milestones / invite_reward_grants。旧 user_invitations 与 invitation_relationships
// 仅由 0117 迁移一次性导入，运行时绝不依赖。
// ============================================================================

package invite

import "time"

// InviteCode 邀请码一行(表 invite_codes)。一个用户一行(uk user_id),码全局唯一(uk code)。
type InviteCode struct {
	ID           uint64     `gorm:"primaryKey" json:"id"`
	UserID       uint       `gorm:"column:user_id" json:"user_id"`
	Code         string     `gorm:"column:code" json:"code"`
	IsActive     bool       `gorm:"column:is_active" json:"is_active"`
	OpenCount    int64      `gorm:"column:open_count" json:"open_count"`
	LastOpenedAt *time.Time `gorm:"column:last_opened_at" json:"last_opened_at"`
	CreatedAt    time.Time  `gorm:"column:created_at;autoCreateTime" json:"created_at"`
}

// TableName 指定表名。
func (InviteCode) TableName() string { return "invite_codes" }

// InviteRegistration 归因流水一行(表 invite_registrations)。
// invited_user_id 唯一 —— 一个新用户只归因一次,INSERT IGNORE 撞唯一键即静默幂等。
type InviteRegistration struct {
	ID            uint64 `gorm:"primaryKey" json:"id"`
	InviterUserID uint   `gorm:"column:inviter_user_id" json:"inviter_user_id"`
	CodeID        uint64 `gorm:"column:code_id" json:"code_id"`
	InvitedUserID uint   `gorm:"column:invited_user_id" json:"invited_user_id"`
	Method        string `gorm:"column:method" json:"method"`
	// RewardedCredits 该次邀请已发放给邀请人的经费(0100;经费=分)。0=未发放。
	// 0118 起防双发的物理根是 milestone/grant 唯一键；本列只做旧列表兼容。
	RewardedCredits int       `gorm:"column:rewarded_credits" json:"rewarded_credits"`
	Source          string    `gorm:"column:source" json:"source"` // legacy | link | manual
	RegisteredAt    time.Time `gorm:"column:registered_at" json:"registered_at"`
	BoundAt         time.Time `gorm:"column:bound_at" json:"bound_at"`

	SnapshotInviterRegistrationCredits int     `gorm:"column:snapshot_inviter_registration_credits" json:"snapshot_inviter_registration_credits"`
	SnapshotInviteeRegistrationCredits int     `gorm:"column:snapshot_invitee_registration_credits" json:"snapshot_invitee_registration_credits"`
	SnapshotRegistrationDailyCap       int     `gorm:"column:snapshot_registration_daily_cap" json:"snapshot_registration_daily_cap"`
	SnapshotBindWindowDays             int     `gorm:"column:snapshot_bind_window_days" json:"snapshot_bind_window_days"`
	SnapshotFirstPurchaseWindowDays    int     `gorm:"column:snapshot_first_purchase_window_days" json:"snapshot_first_purchase_window_days"`
	SnapshotFirstPurchaseRebateBPS     int     `gorm:"column:snapshot_first_purchase_rebate_bps" json:"snapshot_first_purchase_rebate_bps"`
	SnapshotRechargeRate               float64 `gorm:"column:snapshot_recharge_rate" json:"snapshot_recharge_rate"`

	CreatedAt time.Time `gorm:"column:created_at;autoCreateTime" json:"created_at"`
}

// TableName 指定表名。
func (InviteRegistration) TableName() string { return "invite_registrations" }

// CampaignConfig 是邀请活动的单行真源(id=1)。billing_config 里的旧字段只保留兼容。
type CampaignConfig struct {
	ID                         uint8     `gorm:"primaryKey" json:"id"`
	Enabled                    bool      `gorm:"column:enabled" json:"enabled"`
	InviterRegistrationCredits int       `gorm:"column:inviter_registration_credits" json:"inviter_registration_credits"`
	InviteeRegistrationCredits int       `gorm:"column:invitee_registration_credits" json:"invitee_registration_credits"`
	RegistrationDailyCap       int       `gorm:"column:registration_daily_cap" json:"registration_daily_cap"`
	BindWindowDays             int       `gorm:"column:bind_window_days" json:"bind_window_days"`
	FirstPurchaseWindowDays    int       `gorm:"column:first_purchase_window_days" json:"first_purchase_window_days"`
	FirstPurchaseRebateBPS     int       `gorm:"column:first_purchase_rebate_bps" json:"first_purchase_rebate_bps"`
	CodeHelpURL                string    `gorm:"column:code_help_url" json:"code_help_url"`
	CreatedAt                  time.Time `gorm:"column:created_at" json:"created_at"`
	UpdatedAt                  time.Time `gorm:"column:updated_at" json:"updated_at"`
}

func (CampaignConfig) TableName() string { return "invite_campaign_config" }

// PublicCampaign 只暴露活动规则；关闭时奖励数值在服务层清零，不预告未上线配置。
type PublicCampaign struct {
	Enabled                    bool   `json:"enabled"`
	InviterRegistrationCredits int    `json:"inviter_registration_credits"`
	InviteeRegistrationCredits int    `json:"invitee_registration_credits"`
	RegistrationDailyCap       int    `json:"registration_daily_cap"`
	BindWindowDays             int    `json:"bind_window_days"`
	FirstPurchaseWindowDays    int    `json:"first_purchase_window_days"`
	FirstPurchaseRebateBPS     int    `json:"first_purchase_rebate_bps"`
	CodeHelpURL                string `json:"code_help_url"`
}

type InvitePreview struct {
	Valid       bool           `json:"valid"`
	Code        string         `json:"code,omitempty"`
	InviterName string         `json:"inviter_name,omitempty"`
	Campaign    PublicCampaign `json:"campaign"`
}

// InviteStatus 是用户绑定状态的脱敏 DTO：不对外序列化库模型，更不下发邀请人 ID/联系方式。
type InviteStatus struct {
	Enabled     bool   `json:"enabled"`
	Bound       bool   `json:"bound"`
	Eligible    bool   `json:"eligible"`
	Code        string `json:"code,omitempty"`
	InviterName string `json:"inviter_name,omitempty"`
	Source      string `json:"source,omitempty"`
	// InviteeRewardedCredits 是当前用户因该邀请关系实际到账的注册邀请礼。
	// 它只来自 registration milestone 的 invitee grant，0=已关联但未实际到账。
	InviteeRewardedCredits int64           `json:"invitee_rewarded_credits"`
	BoundAt                *time.Time      `json:"bound_at,omitempty"`
	BindDeadline           *time.Time      `json:"bind_deadline,omitempty"`
	Reason                 string          `json:"reason,omitempty"`
	Campaign               *PublicCampaign `json:"campaign,omitempty"`
}

type InviteBindRewards struct {
	InviterRegistrationCredits int `json:"inviter_registration_credits"`
	InviteeRegistrationCredits int `json:"invitee_registration_credits"`
	FirstPurchaseRebateBPS     int `json:"first_purchase_rebate_bps"`
	FirstPurchaseWindowDays    int `json:"first_purchase_window_days"`
}

type InviteBindResult struct {
	Status  InviteStatus      `json:"status"`
	Rewards InviteBindRewards `json:"rewards"`
}

// InviteMilestone / InviteRewardGrant 是可审计幂等层。只要事务提交，grant 就必然有钱包流水。
type InviteMilestone struct {
	ID                         uint64    `gorm:"primaryKey"`
	RegistrationID             uint64    `gorm:"column:registration_id"`
	MilestoneType              string    `gorm:"column:milestone_type"`
	TriggerOrderID             *uint64   `gorm:"column:trigger_order_id"`
	TriggerOrderNo             string    `gorm:"column:trigger_order_no"`
	PurchaseAmountCents        int64     `gorm:"column:purchase_amount_cents"`
	GrossPurchaseAmountCents   int64     `gorm:"column:gross_purchase_amount_cents"`
	RefundedAmountCentsAtGrant int64     `gorm:"column:refunded_amount_cents_at_grant"`
	SnapshotRebateBPS          int       `gorm:"column:snapshot_rebate_bps"`
	SnapshotRechargeRate       float64   `gorm:"column:snapshot_recharge_rate"`
	OccurredAt                 time.Time `gorm:"column:occurred_at"`
	CreatedAt                  time.Time `gorm:"column:created_at;autoCreateTime"`
}

func (InviteMilestone) TableName() string { return "invite_milestones" }

type InviteRewardGrant struct {
	ID                  uint64    `gorm:"primaryKey"`
	MilestoneID         uint64    `gorm:"column:milestone_id"`
	BeneficiaryUserID   uint      `gorm:"column:beneficiary_user_id"`
	BeneficiaryRole     string    `gorm:"column:beneficiary_role"`
	AmountCredits       int       `gorm:"column:amount_credits"`
	CreditTransactionID *uint64   `gorm:"column:credit_transaction_id"`
	GrantedAt           time.Time `gorm:"column:granted_at"`
	CreatedAt           time.Time `gorm:"column:created_at;autoCreateTime"`
}

func (InviteRewardGrant) TableName() string { return "invite_reward_grants" }

// InviteRewardReversal 是退款对首单返利的幂等反冲。每个 grant+退款幂等键仅一行，
// expected/reclaimed/shortfall 都持久化，余额不足不会被静默吞掉。
type InviteRewardReversal struct {
	ID                   uint64    `gorm:"primaryKey"`
	GrantID              uint64    `gorm:"column:grant_id"`
	RefundIdempotencyKey string    `gorm:"column:refund_idempotency_key"`
	RefundNo             string    `gorm:"column:refund_no"`
	BeneficiaryUserID    uint      `gorm:"column:beneficiary_user_id"`
	ExpectedCredits      int       `gorm:"column:expected_credits"`
	ReclaimedCredits     int       `gorm:"column:reclaimed_credits"`
	ShortfallCredits     int       `gorm:"column:shortfall_credits"`
	CreditTransactionID  *uint64   `gorm:"column:credit_transaction_id"`
	ReversedAt           time.Time `gorm:"column:reversed_at"`
	CreatedAt            time.Time `gorm:"column:created_at;autoCreateTime"`
}

func (InviteRewardReversal) TableName() string { return "invite_reward_reversals" }

// UserInviteView GET /user/invite 的响应体(契约冻结字段)。
type UserInviteView struct {
	Code            string    `json:"code"`
	URL             string    `json:"url"`
	OpenCount       int64     `json:"open_count"`
	RegisteredCount int64     `json:"registered_count"`
	RewardPerInvite int       `json:"reward_per_invite"` // 当前每邀请 1 人的奖励经费(0100;0=活动未开)
	RewardTotal     int64     `json:"reward_total"`      // 该邀请人累计已获奖励经费(0100)
	CreatedAt       time.Time `json:"created_at"`
}

// AdminSummary GET /admin/invites/summary 的响应体(契约冻结字段)。
type AdminSummary struct {
	InviterCount       int64 `json:"inviter_count"`
	TotalOpens         int64 `json:"total_opens"`
	TotalRegistrations int64 `json:"total_registrations"`
	Registrations7d    int64 `json:"registrations_7d"`
	TotalRewardCredits int64 `json:"total_reward_credits"` // 全站累计已发放的邀请奖励经费(0100)
}

// AdminInviteRow GET /admin/invites 列表一行(JOIN users 取 email/name)。
type AdminInviteRow struct {
	UserID          uint      `gorm:"column:user_id" json:"user_id"`
	Email           string    `gorm:"column:email" json:"email"`
	Name            string    `gorm:"column:name" json:"name"`
	Code            string    `gorm:"column:code" json:"code"`
	CreatedAt       time.Time `gorm:"column:created_at" json:"created_at"`
	OpenCount       int64     `gorm:"column:open_count" json:"open_count"`
	RegisteredCount int64     `gorm:"column:registered_count" json:"registered_count"`
	RewardCredits   int64     `gorm:"column:reward_credits" json:"reward_credits"` // 该邀请人累计已获奖励经费(0100)
}

// AdminRegistrationRow GET /admin/invites/:id/registrations 明细一行。
type AdminRegistrationRow struct {
	InvitedUserID uint      `gorm:"column:invited_user_id" json:"invited_user_id"`
	Email         string    `gorm:"column:email" json:"email"`
	Name          string    `gorm:"column:name" json:"name"`
	Method        string    `gorm:"column:method" json:"method"`
	Source        string    `gorm:"column:source" json:"source"`
	BoundAt       time.Time `gorm:"column:bound_at" json:"bound_at"`
	// RewardedCredits 该次邀请已发放给邀请人的奖励经费(0100;0=未发放——活动关闭期/达当日上限)。
	RewardedCredits                int        `gorm:"column:rewarded_credits" json:"rewarded_credits"`
	InviterRegistrationCredits     int        `gorm:"column:inviter_registration_credits" json:"inviter_registration_credits"`
	InviteeRegistrationCredits     int        `gorm:"column:invitee_registration_credits" json:"invitee_registration_credits"`
	FirstPurchasePaidCents         int64      `gorm:"column:first_purchase_paid_cents" json:"first_purchase_paid_cents"`
	FirstPurchaseRebateCredits     int        `gorm:"column:first_purchase_rebate_credits" json:"first_purchase_rebate_credits"`
	FirstPurchaseReversedCredits   int        `gorm:"column:first_purchase_reversed_credits" json:"first_purchase_reversed_credits"`
	FirstPurchaseReversalShortfall int        `gorm:"column:first_purchase_reversal_shortfall" json:"first_purchase_reversal_shortfall"`
	FirstPurchaseOrderNo           string     `gorm:"column:first_purchase_order_no" json:"first_purchase_order_no"`
	FirstPurchasePaidAt            *time.Time `gorm:"column:first_purchase_paid_at" json:"first_purchase_paid_at,omitempty"`
	CreatedAt                      time.Time  `gorm:"column:created_at" json:"created_at"`
}

// UserRegistrationRow GET /user/invite/registrations 明细一行(邀请人视角)。
// 🔴 脱敏在**后端**完成:name 是打码后的展示名,原始邮箱/用户名/用户 ID 一概不下发 ——
// 被邀请人的身份对邀请人是他人隐私,前端拿到明文再打码等于没打。
type UserRegistrationRow struct {
	Name   string `json:"name"` // 已脱敏:al***@gmail.com / 张** / 用户***
	Method string `json:"method"`
	Source string `json:"source"`
	// RewardedCredits 该次邀请给邀请人发放的奖励经费(是发给查看者本人的钱,非他人隐私,可下发)。
	// 0=未计奖励(活动关闭期注册/达当日上限);前端只对 >0 渲染「+N 经费」,0 不渲染负面态。
	RewardedCredits            int        `json:"rewarded_credits"`
	InviterRegistrationCredits int        `json:"inviter_registration_credits"`
	FirstPurchaseRebateCredits int        `json:"first_purchase_rebate_credits"`
	FirstPurchasePaidAt        *time.Time `json:"first_purchase_paid_at,omitempty"`
	BoundAt                    time.Time  `json:"bound_at"`
	CreatedAt                  time.Time  `json:"created_at"`
}
