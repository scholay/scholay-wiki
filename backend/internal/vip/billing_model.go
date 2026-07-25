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

// 订阅计费周期(orders.billing_cycle / users.vip_cycle / 报价与建单入参)。
const (
	CycleMonthly = "monthly"
	CycleYearly  = "yearly"
)

// normCycle 归一化计费周期:仅认 yearly,其余(含空串/未知值)一律按 monthly。
// 唯一归一化入口 —— 外部输入(HTTP 参数 / DB 列)进计价逻辑前都过它。
func normCycle(c string) string {
	if c == CycleYearly {
		return CycleYearly
	}
	return CycleMonthly
}

// BillingConfig 单行计费配置(表 billing_config, id=1)。所有动态旋钮集中于此, admin 可调。
type BillingConfig struct {
	ID uint `gorm:"primaryKey" json:"id"`
	// FreeDailyTokens 旧「每日额度」基准 —— P4 起判定不再读它(改 FreeWindowTokens),
	// 列与字段保留仅作回滚兜底;admin 表单已移除。
	FreeDailyTokens int64 `gorm:"column:free_daily_tokens" json:"free_daily_tokens"`
	// FreeWindowTokens Free 档 7 天周期的基准额度。P5 成本制起**单位=微元(真实成本)**,不再是加权 token
	// (列名沿用旧名,值语义改为微元;迁移 0085 一次性换算)。Pro=×pro倍率、Max=×pro×max倍率。显示 ÷1000=算力点。
	FreeWindowTokens int64 `gorm:"column:free_window_tokens" json:"free_window_tokens"`
	// WindowDays 周期长度(天),默认 7。改动只影响新开的窗口(anchor 判定读当时配置)。
	WindowDays int `gorm:"column:window_days" json:"window_days"`
	// BasePricePerM 旧加权计费的倍率换算锚点(元/1M token);P5 成本制起不再参与计费(成本直接来自模型 4 类单价)。
	BasePricePerM float64 `gorm:"column:base_price_per_m;type:decimal(12,4)" json:"base_price_per_m"`
	ProMultiplier          float64   `gorm:"column:pro_multiplier" json:"pro_multiplier"`
	MaxMultiplier          float64   `gorm:"column:max_multiplier" json:"max_multiplier"`
	ProPriceCents          int       `gorm:"column:pro_price_cents" json:"pro_price_cents"`
	ProOriginalCents       int       `gorm:"column:pro_original_cents" json:"pro_original_cents"`
	MaxPriceCents          int       `gorm:"column:max_price_cents" json:"max_price_cents"`
	MaxOriginalCents       int       `gorm:"column:max_original_cents" json:"max_original_cents"`
	ProGrantCredits        int       `gorm:"column:pro_grant_credits" json:"pro_grant_credits"`
	MaxGrantCredits        int       `gorm:"column:max_grant_credits" json:"max_grant_credits"`
	// ── 年度订阅(0079)。价格/赠送 <=0 = 该档年付未开放(前端隐藏年付、后端拒建年付单);
	// 建列初值 -1 = 未配置哨兵(迁移一次性回填 年价=月价×10 / 划线=月划线×12 / 赠送=月赠×12)。
	ProYearPriceCents    int `gorm:"column:pro_year_price_cents" json:"pro_year_price_cents"`
	ProYearOriginalCents int `gorm:"column:pro_year_original_cents" json:"pro_year_original_cents"`
	MaxYearPriceCents    int `gorm:"column:max_year_price_cents" json:"max_year_price_cents"`
	MaxYearOriginalCents int `gorm:"column:max_year_original_cents" json:"max_year_original_cents"`
	// 年度赠送经费**总额**(履约时按月分 12 批依次生效,见 order.go grantYearlyLotsInTx)。
	ProYearGrantCredits int `gorm:"column:pro_year_grant_credits" json:"pro_year_grant_credits"`
	MaxYearGrantCredits int `gorm:"column:max_year_grant_credits" json:"max_year_grant_credits"`
	// SubscriptionYearDays 年度订阅时长(天),默认 365(<=0 时代码兜底 365)。
	SubscriptionYearDays   int       `gorm:"column:subscription_year_days" json:"subscription_year_days"`
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

// WindowCeiling 返回某等级的 7 天周期额度上限(P5 成本制:单位=微元真实成本;显示 ÷1000=算力点)。
// 返回 -1 表示**不限额**(倍率<=0 或基准<=0)。纯函数, 便于单测。
// 倍率口径不变:Pro = Free × pro倍率;Max = Pro × max倍率(即 Free × pro倍率 × max倍率)。
func (c *BillingConfig) WindowCeiling(tier string) int64 {
	base := c.FreeWindowTokens
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

// WindowDuration 周期时长(WindowDays 天;<=0 时兜底 7 天)。
func (c *BillingConfig) WindowDuration() time.Duration {
	days := c.WindowDays
	if days <= 0 {
		days = 7
	}
	return time.Duration(days) * 24 * time.Hour
}

// 有界透支带(SS#2):允许窗口消耗越过 WindowCeiling 一个有界的量,越过后下一轮起点才硬拦。
// 原意是「保证 agent 单轮能优雅收尾」→ 量级保持**单轮**而非整窗:按日均(ceiling/窗口天数)的 15% 计,
// 地板 = ¥0.5(微元)保证连 Free 也够收尾一轮(单轮成本 prism≈¥0.26)。窗口到期满血时透支自然归零。
// P5 成本制:单位=微元(与 WindowCeiling 同)。
const (
	overdraftPct        = 0.15
	overdraftFloorMicro = 500_000 // ¥0.5,覆盖单轮优雅收尾
)

// OverdraftTokens 返回某等级的透支带大小(微元;P5 成本制)。上限不限额 → 0。
func (c *BillingConfig) OverdraftTokens(tier string) int64 {
	ceiling := c.WindowCeiling(tier)
	if ceiling <= 0 {
		return 0
	}
	days := c.WindowDays
	if days <= 0 {
		days = 7
	}
	if pct := int64(float64(ceiling) * overdraftPct / float64(days)); pct > overdraftFloorMicro {
		return pct
	}
	return overdraftFloorMicro
}

// GrantCreditsFor 返回某付费等级在某计费周期下的赠送(临时)经费数。
// 月度=开通/续费一次性整月发放;年度=总额(履约时按月分 12 批,见 grantYearlyLotsInTx)。
// 年度未配置(<0 哨兵)按 0 处理。
func (c *BillingConfig) GrantCreditsFor(tier, cycle string) int {
	var v int
	if normCycle(cycle) == CycleYearly {
		switch tier {
		case TierPro:
			v = c.ProYearGrantCredits
		case TierMax:
			v = c.MaxYearGrantCredits
		}
	} else {
		switch tier {
		case TierPro:
			v = c.ProGrantCredits
		case TierMax:
			v = c.MaxGrantCredits
		}
	}
	if v < 0 {
		return 0
	}
	return v
}

// PriceCentsFor 返回某付费等级在某计费周期下的应付价(分)。未知等级返回 0;
// 年度价 <=0 = 该档年付未开放(调用方拒单/前端隐藏)。
func (c *BillingConfig) PriceCentsFor(tier, cycle string) int {
	if normCycle(cycle) == CycleYearly {
		switch tier {
		case TierPro:
			return c.ProYearPriceCents
		case TierMax:
			return c.MaxYearPriceCents
		default:
			return 0
		}
	}
	switch tier {
	case TierPro:
		return c.ProPriceCents
	case TierMax:
		return c.MaxPriceCents
	default:
		return 0
	}
}

// PeriodDaysFor 某计费周期的订阅时长(天)。月度 <=0 兜底 30;年度 <=0 兜底 365。
func (c *BillingConfig) PeriodDaysFor(cycle string) int {
	if normCycle(cycle) == CycleYearly {
		if c.SubscriptionYearDays > 0 {
			return c.SubscriptionYearDays
		}
		return 365
	}
	if c.SubscriptionPeriodDays > 0 {
		return c.SubscriptionPeriodDays
	}
	return 30
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
	// RefillPendingAt 「升级满血待兑现」标记(R6 持久化补偿):ResetBaselineOnUpgrade 删锚遇 Redis
	// 抖动/不可用时落此时刻;ReconcilePendingRefills(cleanup)在 Redis 恢复后补删锚并清此列。NULL=无待办。
	RefillPendingAt  *time.Time `gorm:"column:refill_pending_at" json:"-"`
	CreatedAt        time.Time  `gorm:"column:created_at;autoCreateTime" json:"created_at"`
	UpdatedAt        time.Time  `gorm:"column:updated_at;autoUpdateTime" json:"updated_at"`
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
