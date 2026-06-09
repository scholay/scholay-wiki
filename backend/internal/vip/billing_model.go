// ============================================================================
// 会员/收费体系 —— 数据模型(统一 token 额度 + 经费钱包)。
//
// 计费对象是 AI token:每用户一条**统一每日额度**(Free=Q / Pro=3Q / Max=5Q),
// 每日 00:00 自动满血;额度耗尽可消耗「经费」立即重置。经费分临时(有失效日)/永久。
// 设计见 docs/research/membership-billing/design.md。
// ============================================================================

package vip

import "time"

// 经费来源。
const (
	SourceSubscription = "subscription" // 订阅赠送(临时, 整月有效)
	SourceRecharge     = "recharge"     // 充值(永久)
	SourceGift         = "gift"         // 礼品码
	SourceTask         = "task"         // 任务中心(P5)
	SourceAdmin        = "admin"        // 管理员手动调账
)

// 经费种类。
const (
	CreditKindTemp = "temp" // 临时(有失效日, 到期清)
	CreditKindPerm = "perm" // 永久(不过期)
)

// 流水类型。
const (
	TxGrantSubscription = "grant_subscription" // 订阅赠送临时经费
	TxRecharge          = "recharge"           // 充值入账永久经费
	TxGift              = "gift"                // 礼品码入账
	TxTask              = "task"                // 任务领取
	TxResetConsume      = "reset_consume"       // 重置额度消耗
	TxExpire            = "expire"              // 临时经费到期清零
	TxRefund            = "refund"             // 退款
	TxAdminAdjust       = "admin_adjust"        // 管理员调账
)

// 兑换码授予类型。
const (
	GrantKindTier   = "tier"   // 发会员
	GrantKindCredit = "credit" // 发经费
)

// BillingConfig 单行计费配置(表 billing_config, id=1)。所有动态旋钮集中于此, admin 可调。
type BillingConfig struct {
	ID                     uint      `gorm:"primaryKey" json:"id"`
	FreeDailyTokens        int64     `gorm:"column:free_daily_tokens" json:"free_daily_tokens"`
	ProMultiplier          float64   `gorm:"column:pro_multiplier" json:"pro_multiplier"`
	MaxMultiplier          float64   `gorm:"column:max_multiplier" json:"max_multiplier"`
	ProPriceCents          int       `gorm:"column:pro_price_cents" json:"pro_price_cents"`
	ProOriginalCents       int       `gorm:"column:pro_original_cents" json:"pro_original_cents"`
	MaxPriceCents          int       `gorm:"column:max_price_cents" json:"max_price_cents"`
	MaxOriginalCents       int       `gorm:"column:max_original_cents" json:"max_original_cents"`
	ProGrantCredits        int       `gorm:"column:pro_grant_credits" json:"pro_grant_credits"`
	MaxGrantCredits        int       `gorm:"column:max_grant_credits" json:"max_grant_credits"`
	RechargeRate           float64   `gorm:"column:recharge_rate" json:"recharge_rate"`
	MinRechargeCents       int       `gorm:"column:min_recharge_cents" json:"min_recharge_cents"`
	ResetCostCredits       int       `gorm:"column:reset_cost_credits" json:"reset_cost_credits"`
	SubscriptionPeriodDays int       `gorm:"column:subscription_period_days" json:"subscription_period_days"`
	PopularPlan            string    `gorm:"column:popular_plan" json:"popular_plan"`
	Enabled                bool      `gorm:"column:enabled" json:"enabled"`
	CreatedAt              time.Time `gorm:"column:created_at;autoCreateTime" json:"created_at"`
	UpdatedAt              time.Time `gorm:"column:updated_at;autoUpdateTime" json:"updated_at"`
}

func (BillingConfig) TableName() string { return "billing_config" }

// DailyCeiling 返回某等级的每日 token 上限。返回 -1 表示**不限额**(倍率<=0 或基准<=0)。
// 纯函数, 便于单测。倍率口径:Pro = Free × pro倍率;Max = Pro × max倍率(即 Free × pro倍率 × max倍率)。
// 故 max倍率含义是「Max 是 Pro 的几倍」,不是相对 Free。Free 倍率恒为 1(不入配置)。
func (c *BillingConfig) DailyCeiling(tier string) int64 {
	base := c.FreeDailyTokens
	if base <= 0 {
		return -1 // 基准未设 = 不限
	}
	switch tier {
	case TierPro:
		if c.ProMultiplier <= 0 {
			return -1
		}
		return int64(float64(base) * c.ProMultiplier)
	case TierMax:
		// Max 相对 Pro 翻倍:base × pro倍率 × max倍率。任一倍率 <=0 视为不限。
		if c.MaxMultiplier <= 0 || c.ProMultiplier <= 0 {
			return -1
		}
		return int64(float64(base) * c.ProMultiplier * c.MaxMultiplier)
	default:
		return base
	}
}

// GrantCreditsFor 返回某付费等级开通/续费时一次性赠送的(临时)经费数。
func (c *BillingConfig) GrantCreditsFor(tier string) int {
	switch tier {
	case TierPro:
		return c.ProGrantCredits
	case TierMax:
		return c.MaxGrantCredits
	default:
		return 0
	}
}

// PriceCentsFor 返回某付费等级的月价(分)。未知等级返回 0。
func (c *BillingConfig) PriceCentsFor(tier string) int {
	switch tier {
	case TierPro:
		return c.ProPriceCents
	case TierMax:
		return c.MaxPriceCents
	default:
		return 0
	}
}

// RechargeCreditsFor 把支付金额(分)按汇率换算成到账经费(向下取整)。
func (c *BillingConfig) RechargeCreditsFor(cents int) int {
	if cents <= 0 || c.RechargeRate <= 0 {
		return 0
	}
	return int(float64(cents) / 100.0 * c.RechargeRate)
}

// UserWallet 每用户钱包(表 user_wallets)。永久经费单整数;临时经费走 credit_temp_lots。
type UserWallet struct {
	UserID           uint      `gorm:"column:user_id;primaryKey" json:"user_id"`
	PermBalance      int       `gorm:"column:perm_balance" json:"perm_balance"`
	AutoResetEnabled bool      `gorm:"column:auto_reset_enabled" json:"auto_reset_enabled"`
	CreatedAt        time.Time `gorm:"column:created_at;autoCreateTime" json:"created_at"`
	UpdatedAt        time.Time `gorm:"column:updated_at;autoUpdateTime" json:"updated_at"`
}

func (UserWallet) TableName() string { return "user_wallets" }

// CreditTempLot 临时经费批次(表 credit_temp_lots)。余额 = SUM(已生效未过期批次 amount_remaining)。
// StartsAt 为预发放生效日:仅 StartsAt<=now<ExpiresAt 才计入可用余额(续期的下一周期经费靠它延后生效)。
type CreditTempLot struct {
	ID              uint64    `gorm:"primaryKey" json:"id"`
	UserID          uint      `gorm:"column:user_id" json:"user_id"`
	AmountInitial   int       `gorm:"column:amount_initial" json:"amount_initial"`
	AmountRemaining int       `gorm:"column:amount_remaining" json:"amount_remaining"`
	Source          string    `gorm:"column:source" json:"source"`
	Ref             string    `gorm:"column:ref" json:"ref"`
	StartsAt        time.Time `gorm:"column:starts_at" json:"starts_at"` // 生效日(预发放);零值=即时
	ExpiresAt       time.Time `gorm:"column:expires_at" json:"expires_at"`
	CreatedAt       time.Time `gorm:"column:created_at;autoCreateTime" json:"created_at"`
}

func (CreditTempLot) TableName() string { return "credit_temp_lots" }

// CreditTransaction 经费流水(表 credit_transactions)。供「明细查看」。
type CreditTransaction struct {
	ID        uint64    `gorm:"primaryKey" json:"id"`
	UserID    uint      `gorm:"column:user_id" json:"user_id"`
	Type      string    `gorm:"column:type" json:"type"`
	Amount    int       `gorm:"column:amount" json:"amount"`
	TempAfter int       `gorm:"column:temp_after" json:"temp_after"`
	PermAfter int       `gorm:"column:perm_after" json:"perm_after"`
	RefType   string    `gorm:"column:ref_type" json:"ref_type"`
	RefID     string    `gorm:"column:ref_id" json:"ref_id"`
	Note      string    `gorm:"column:note" json:"note"`
	CreatedAt time.Time `gorm:"column:created_at;autoCreateTime" json:"created_at"`
}

func (CreditTransaction) TableName() string { return "credit_transactions" }
