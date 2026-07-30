// ============================================================================
// internal/invite —— 邀请注册最小闭环:一人一码 + 落地页打开计数 + 新用户归因。
//
// 表(0099 迁移):invite_codes(一人一行,get-or-create)+ invite_registrations
// (一个新用户至多归因一次,uk_invreg_invited 兜幂等)。
//
// 刻意不依赖 stranded 的 user_invitations / invitation_relationships(CLAUDE.md 明令)。
// 归因是 best-effort 旁路:任何失败只记日志,绝不影响注册主流程。
// ============================================================================

package invite

import "time"

// InviteCode 邀请码一行(表 invite_codes)。一个用户一行(uk user_id),码全局唯一(uk code)。
type InviteCode struct {
	ID           uint64     `gorm:"primaryKey" json:"id"`
	UserID       uint       `gorm:"column:user_id" json:"user_id"`
	Code         string     `gorm:"column:code" json:"code"`
	OpenCount    int64      `gorm:"column:open_count" json:"open_count"`
	LastOpenedAt *time.Time `gorm:"column:last_opened_at" json:"last_opened_at"`
	CreatedAt    time.Time  `gorm:"column:created_at;autoCreateTime" json:"created_at"`
}

// TableName 指定表名。
func (InviteCode) TableName() string { return "invite_codes" }

// InviteRegistration 归因流水一行(表 invite_registrations)。
// invited_user_id 唯一 —— 一个新用户只归因一次,INSERT IGNORE 撞唯一键即静默幂等。
type InviteRegistration struct {
	ID            uint64    `gorm:"primaryKey" json:"id"`
	InviterUserID uint      `gorm:"column:inviter_user_id" json:"inviter_user_id"`
	CodeID        uint64    `gorm:"column:code_id" json:"code_id"`
	InvitedUserID uint      `gorm:"column:invited_user_id" json:"invited_user_id"`
	Method        string    `gorm:"column:method" json:"method"`
	// RewardedCredits 该次邀请已发放给邀请人的经费(0100;经费=分)。0=未发放。
	// 兼作防双发标记:MarkRewarded 用 WHERE rewarded_credits=0 条件更新抢占。
	RewardedCredits int       `gorm:"column:rewarded_credits" json:"rewarded_credits"`
	CreatedAt       time.Time `gorm:"column:created_at;autoCreateTime" json:"created_at"`
}

// TableName 指定表名。
func (InviteRegistration) TableName() string { return "invite_registrations" }

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
	CreatedAt     time.Time `gorm:"column:created_at" json:"created_at"`
}

// UserRegistrationRow GET /user/invite/registrations 明细一行(邀请人视角)。
// 🔴 脱敏在**后端**完成:name 是打码后的展示名,原始邮箱/用户名/用户 ID 一概不下发 ——
// 被邀请人的身份对邀请人是他人隐私,前端拿到明文再打码等于没打。
type UserRegistrationRow struct {
	Name      string    `json:"name"` // 已脱敏:al***@gmail.com / 张** / 用户***
	Method    string    `json:"method"`
	CreatedAt time.Time `json:"created_at"`
}
