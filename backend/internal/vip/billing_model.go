// ============================================================================
// 会员/收费体系 —— 数据模型(周期额度 + 经费钱包 + 重置次数)。
//
// 0090 起的模型:
//   - 订阅周期 = 真·自然月 / 自然年(AddPeriod),不再按天数配置;
//   - 订阅**不再赠送经费**;
//   - 经费只有一种(不再分临时/永久),入口=充值/兑换码/admin 调账;
//   - 额度耗尽后的立即重置扣的是**重置次数**(CreditResetPass),与经费解耦。
// ============================================================================

package vip

import (
	"math"
	"time"

	"github.com/dromara/carbon/v2"
)

// 经费来源。
const (
	SourceSubscription = "subscription" // [DEPRECATED 0090] 订阅赠送(已下线);仅存量数据
	SourceRecharge     = "recharge"     // 充值(永久)
	SourceGift         = "gift"         // 礼品码
	SourceTask         = "task"         // 任务中心(P5)
	SourceAdmin        = "admin"        // 管理员手动调账
	SourceInvite       = "invite"       // 邀请注册奖励(0100)
)

// 经费种类。0090 起临时经费退休,只剩一种(对外就叫「经费」)。
// 两个常量保留:兑换码表里有存量 credit_kind 值,读到 temp 一律按 perm 发放(见 repository.go)。
const (
	CreditKindTemp = "temp" // [DEPRECATED 0090] 仅存量数据可能出现
	CreditKindPerm = "perm" // 唯一在用
)

// 流水类型。
const (
	TxGrantSubscription = "grant_subscription" // [DEPRECATED 0090] 订阅赠送(已下线);仅存量流水
	TxRecharge          = "recharge"           // 充值入账永久经费
	TxGift              = "gift"                // 礼品码入账
	TxTask              = "task"                // 任务领取
	TxResetConsume      = "reset_consume"       // 重置额度消耗
	TxExpire            = "expire"              // [DEPRECATED 0090] 临时经费到期;仅存量流水
	TxRefund            = "refund"             // 退款
	TxAdminAdjust       = "admin_adjust"        // 管理员调账
	TxPaygDaily         = "payg_daily"          // 按量付费当日累计(0098:每用户每天一行,upsert 累加)
	TxInviteReward      = "invite_reward"       // 邀请好友注册奖励入账(0100;ref_id=被邀者 user_id)
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
	// 0090 退休:ProGrantCredits / MaxGrantCredits(订阅不再赠送经费)。DB 列非破坏保留。
	// ── 年度订阅(0079)。价格/赠送 <=0 = 该档年付未开放(前端隐藏年付、后端拒建年付单);
	// 建列初值 -1 = 未配置哨兵(迁移一次性回填 年价=月价×10 / 划线=月划线×12 / 赠送=月赠×12)。
	ProYearPriceCents    int `gorm:"column:pro_year_price_cents" json:"pro_year_price_cents"`
	ProYearOriginalCents int `gorm:"column:pro_year_original_cents" json:"pro_year_original_cents"`
	MaxYearPriceCents    int `gorm:"column:max_year_price_cents" json:"max_year_price_cents"`
	MaxYearOriginalCents int `gorm:"column:max_year_original_cents" json:"max_year_original_cents"`
	// 0090 退休:ProYearGrantCredits / MaxYearGrantCredits + SubscriptionYearDays。
	// (年度时长改「+1 个自然年」,不再有天数概念。)
	RechargeRate           float64   `gorm:"column:recharge_rate" json:"recharge_rate"`
	// CreditToPoints 1 经费可兑换的算力点数(0094,按量付费)。与 RechargeRate 共同决定按量单价:
	// ¥1 = RechargeRate 经费 = RechargeRate × CreditToPoints 算力点。
	// 现网 100 × 3 = ¥1 买 300 点(0095 重锚:经费=分),而最贵的套餐档(Pro 月付)是 ¥1 买 442 点 ——
	// **这个差价就是「买套餐比直充便宜」的全部来源**,调它等于调整两条产品线的相对定价。
	CreditToPoints int `gorm:"column:credit_to_points" json:"credit_to_points"`
	MinRechargeCents       int       `gorm:"column:min_recharge_cents" json:"min_recharge_cents"`
	// InviteRewardCredits 每成功邀请 1 人赠给邀请人的经费(0100;经费=分)。0=邀请奖励活动关闭。
	InviteRewardCredits int `gorm:"column:invite_reward_credits" json:"invite_reward_credits"`
	// InviteRewardDailyCap 每邀请人每日最多计奖励的邀请数(0100)。0=不限;
	// 超出上限的邀请照常归因,只是当天不再发奖励(按「今天 rewarded_credits>0 的行数」算)。
	InviteRewardDailyCap int `gorm:"column:invite_reward_daily_cap" json:"invite_reward_daily_cap"`
	// ResetCostCredits 运行时**已不读**(0090:重置改扣「重置次数」),但字段与列必须保留:
	// 迁移 0092 拿它当「N 经费 = 1 次」的换算除数,且 admin PUT 是全列覆盖 —— 删字段会让它被写成 0。
	ResetCostCredits int `gorm:"column:reset_cost_credits" json:"reset_cost_credits"`
	// 0090 退休:SubscriptionPeriodDays(月度改「+1 个自然月」,不再有天数概念)。
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

// (OverdraftTokens / 透支带已删除 —— 2026-07-30 owner 拍板「各套餐的透支都取消,没有透支这个说法」。
//  原 SS#2 设计:起点闸放宽到 ceiling + max(日均×15%, ¥0.5),让跨线那一轮还能起跑;对 Free 档
//  地板(¥0.5)甚至大于默认整窗(¥0.3),透支放大 267%。取消后:窗口一到上限,下一条消息即被拦
//  (或经 payAsYouGoOrQuotaError 走按量付费);**在跑的那一轮仍会自然跑完** —— 闸门只在
//  user_message 起点执法,单轮内不打断,预算盖章的 wind-down 机制继续兜优雅收尾(hard=soft)。
//  别加回:透支带内的消耗对没开 autopay 的用户是免费敞口,按注册量线性放大平台成本。)

// (GrantCreditsFor 已删除 —— 0090 起订阅不再赠送经费。四个 grant 列在 DB 里保留作历史/回滚,
//  但没有任何代码读它们;admin 表单与用户端套餐介绍的「赠送 N 经费」也一并移除。)

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

// AddPeriod 把 base 往后推一个计费周期 —— 月度 = +1 个**自然月**,年度 = +1 个**自然年**。
//
// 用 carbon 的 NoOverflow 变体而不是 stdlib 的 time.AddDate:AddDate 是**溢出规范化**的,
// 1/31 + 1 月 会得到 3/3(2 月整月白送),3/31 + 1 月 → 5/1,2028-02-29 + 1 年 → 2029-03-01。
// NoOverflow 钳到当月最后一天:1/31→2/28(闰年 2/29)、3/31→4/30、2028-02-29→2029-02-28。
// 已实测保持 time.Local 时区与时分秒(本仓库铁律:时间不做 UTC 转换)。
//
// 已知且接受的行为:续期是从「上次到期日」累加,所以 1/31 开通的用户第一次被钳到 28 号后
// 就**稳定在 28 号**(不会继续下沉),一次性少 3 天。要锚回 31 号需额外存「锚定日」,暂不做。
//
// 0090 起取代按天数配置的 PeriodDaysFor:subscription_period_days / subscription_year_days
// 两个旋钮已退休(列保留作回滚兜底,代码不再读)。
func AddPeriod(base time.Time, cycle string) time.Time {
	c := carbon.CreateFromStdTime(base)
	if normCycle(cycle) == CycleYearly {
		return c.AddYearsNoOverflow(1).StdTime()
	}
	return c.AddMonthsNoOverflow(1).StdTime()
}

// ─── 授予时长单位(0110)──────────────────────────────────────────────────────
//
// admin 直授与兑换码此前**只有「天」**。加上自然月/年之后,三种单位共用同一套算术,
// 与购买/续费的 AddPeriod 保持同一口径(carbon NoOverflow),不再各写各的。
const (
	GrantUnitDay   = "day"
	GrantUnitMonth = "month"
	GrantUnitYear  = "year"
)

// NormGrantUnit 归一化授予单位;未知一律回落 day。
//
// 回落到 day 而不是报错:存量兑换码的 grant_unit 是空串(迁移 0110 的 DEFAULT 兜住了新行,
// 但代码里仍可能拿到零值),而它们的语义**就是天** —— 回落 day 才能让老码行为不变。
func NormGrantUnit(u string) string {
	switch u {
	case GrantUnitMonth, GrantUnitYear:
		return u
	default:
		return GrantUnitDay
	}
}

// AddPeriodN 把 base 往后推 n 个「单位」。day = 自然日,month/year = 自然月/年(NoOverflow 钳位)。
//
// 🔴 **一次性传 n,绝不能循环调用 AddPeriod n 次** —— 这是本函数存在的全部理由。
//
// 循环会把「月末钳位」的一次性偏移放大成逐月漂移:从 1/31 出发发放 12 个月,
//   - 循环 12 次:1/31→2/28→3/28→…→次年 1/28  (少 3 天)
//   - 一次性 +12 月:time.Date 把 month+12 归一化,day=31 在 1 月不需要钳 → 次年 1/31 (0 天误差)
// 实测两者相差 72 小时。发 3 个月、6 个月这类多周期时,循环写法会系统性少给用户天数。
//
// carbon 的 AddMonthsNoOverflow(n)/AddYearsNoOverflow(n) 本身就接受任意 n 并只在**最终**
// 落点做一次钳位,正是我们要的语义。
func AddPeriodN(base time.Time, unit string, n int) time.Time {
	if n <= 0 {
		return base
	}
	switch NormGrantUnit(unit) {
	case GrantUnitMonth:
		return carbon.CreateFromStdTime(base).AddMonthsNoOverflow(n).StdTime()
	case GrantUnitYear:
		return carbon.CreateFromStdTime(base).AddYearsNoOverflow(n).StdTime()
	default:
		// 天:stdlib 就是对的(没有"月末"概念,不存在溢出规范化问题)
		return base.AddDate(0, 0, n)
	}
}

// GrantDurationDays 把「n 个单位」折算成**近似天数**,仅用于需要与天数阈值比大小的场景
// (如兑换码「够不够一个额度窗口」的判定)。
//
// ⚠️ 只用于比较,**绝不能用它算到期日** —— 到期日必须走 AddPeriodN 的真自然月/年。
// 折算分母沿用 prorationDays 的 30/365 常量口径(理由见那里:常量分母才不会让阈值随月份跳)。
func GrantDurationDays(unit string, n int) int {
	switch NormGrantUnit(unit) {
	case GrantUnitMonth:
		return n * 30
	case GrantUnitYear:
		return n * 365
	default:
		return n
	}
}

// GrantUnitLabel 中文单位名(日志 / 通知文案用)。
func GrantUnitLabel(unit string) string {
	switch NormGrantUnit(unit) {
	case GrantUnitMonth:
		return "个月"
	case GrantUnitYear:
		return "年"
	default:
		return "天"
	}
}

// prorationDays 升级补差价的按天折算分母 —— **刻意固定 30/365,不跟自然月走**(owner 拍板 2026-07-29)。
//
// 周期长度改自然月之后,这里有过一个看似更"精确"的选项:分母用这一次周期的真实天数(28~31)。
// 拒绝它的理由:
//   ① 那会让**同一笔升级的实付金额随月份跳变**(2 月比 1 月贵约 7%),用户无法理解;
//   ② 它同时是「余期是否已超过一个月」的档位阈值(order.go 里 basisCycle 的选择),
//      分母一浮动,余期 29~30 天的用户会在月价日率与年价日率之间来回跳档,补差金额阶跃式突变 ——
//      正是 order.go 那段注释与 TestUpgradeCrossPeriodNoOvercharge 想防的「定价倒挂」那类缺陷;
//   ③ 固定分母让本次改造对用户实付**零影响**,现有定价断言全部继续成立。
// 「1 个月 ≈ 30 天」作为计价日率基准是行业通行做法(Stripe 同此)。
//
// ⚠️ 它与 AddPeriod 是**两个不同的东西**,不要"统一"成一个:AddPeriod 定的是权益到期日
// (必须是真自然月,否则用户会白拿或少拿天数),这里定的是钱的日率(必须是常量,否则金额随月份抖)。
func prorationDays(cycle string) int {
	if normCycle(cycle) == CycleYearly {
		return 365
	}
	return 30
}

// MicroCreditPerCredit —— 1 经费 = 1e6 micro-credit(余额的存储刻度)。
const MicroCreditPerCredit = 1_000_000

// creditToPoints 归一化兑换率:<=0 时兜底 3(0095 拍板默认值),防误配把按量付费变成免费或除零。
func (c *BillingConfig) creditToPoints() int {
	if c.CreditToPoints > 0 {
		return c.CreditToPoints
	}
	return 3
}

// MicroYuanPerCredit —— 1 经费值多少微元真实成本 = 兑换率 × 1000(1 算力点 = 1000 微元)。
func (c *BillingConfig) MicroYuanPerCredit() int64 {
	return int64(c.creditToPoints()) * 1000
}

// MicroCreditForCost 把一次调用的真实成本(微元)换算成要扣的 micro-credit。
//
// 推导:1 经费 = points × 1000 微元 = 1e6 micro-credit ⇒ 1 微元 = 1000/points micro-credit。
// **向上取整**:points 不整除 1000 时宁可多扣 1e-6 经费(≈¥1.7e-8),也不留系统性少扣 ——
// 少扣是每次调用都发生的,累积起来是平台白吃。0095 默认 points=3 不整除 1000,
// 每次调用最多多扣 1 micro-credit(1e-6 经费 ≈ ¥1e-8),量级完全可忽略。
func (c *BillingConfig) MicroCreditForCost(costMicroYuan int64) int64 {
	if costMicroYuan <= 0 {
		return 0
	}
	p := int64(c.creditToPoints())
	return (costMicroYuan*1000 + p - 1) / p
}

// PointsForMicroCredit 把 micro-credit 余额折算成算力点(展示用:「经费 600(≈3000 算力点)」)。
func (c *BillingConfig) PointsForMicroCredit(microCredit int64) int64 {
	if microCredit <= 0 {
		return 0
	}
	return microCredit / MicroCreditPerCredit * int64(c.creditToPoints())
}

// RechargeCreditsFor 把支付金额(分)按汇率换算成到账经费(整数定点,round-half-up)。
//
// 旧实现 int(float64(cents)/100.0*rate) 是浮点截断:cents/100 在二进制下多数不可精确表示,
// rate=100(0095 现网)时约 6.6% 的金额会因 1002.999... 这类尾差**少到账 1 分经费**
// (如 1003 分 × 100 → 1002)。改整数定点:rate 放大 1e4 取整(保留 4 位小数精度),
// cents × rateMicro = 经费 × 1e6,+500000 后整除 = 四舍五入,全程无浮点截断。
func (c *BillingConfig) RechargeCreditsFor(cents int) int {
	if cents <= 0 || c.RechargeRate <= 0 {
		return 0
	}
	rateMicro := int64(math.Round(c.RechargeRate * 10000))
	return int((int64(cents)*rateMicro + 500000) / 1000000)
}

// UserWallet 每用户钱包(表 user_wallets)。0090 起临时经费退休,只剩一种经费。
type UserWallet struct {
	UserID uint `gorm:"column:user_id;primaryKey" json:"user_id"`
	// PermBalanceMicro 经费余额,单位 **micro-credit = 经费 × 1e6**(0094)。
	// 经费必须能表示小数:1 经费 = CreditToPoints × 1000 微元(默认 5,000),
	// 而单次 LLM 调用常只花几百微元 —— 整数余额下,向上取整超收 10 倍、向下取整平台白吃。
	PermBalanceMicro int64 `gorm:"column:perm_balance_micro" json:"perm_balance_micro"`
	// PermBalance [DEPRECATED 0094] 旧整数经费列,已冻结。**不要读也不要写** ——
	// 双真源会让「余额」分裂成两个字段,任何漏改的读写点都静默丢钱。保留仅作审计/回滚。
	PermBalance int `gorm:"column:perm_balance" json:"-"`
	// CreditAutopayEnabled 周期额度用完后是否自动用经费续(0094)。默认 false,须用户显式开启。
	CreditAutopayEnabled bool      `gorm:"column:credit_autopay_enabled" json:"credit_autopay_enabled"`
	AutoResetEnabled     bool      `gorm:"column:auto_reset_enabled" json:"auto_reset_enabled"`
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

// CreditResetPass 重置次数批次(表 credit_reset_passes,迁移 0090)。
//
// 0090 起取代临时经费:重置额度不再扣 N 经费,而是扣 **1 次**。一行 = 一批次数共享一个到期日,
// 余量 = SUM(已生效未过期批次 count_remaining);消耗**最近到期的先扣**(与旧临时经费同策略,
// 让快过期的先被用掉)。存量临时经费由迁移 0092 按 ceil(余额/reset_cost_credits) 一次性换算,
// 到期日沿用原批次 —— 所以「每批次数有自己的过期时间」。
//
// 目前唯一来源是那次历史换算(source='migration'),后续补偿发放是另一个未开工的需求。
type CreditResetPass struct {
	ID             uint64    `gorm:"primaryKey" json:"id"`
	UserID         uint      `gorm:"column:user_id" json:"user_id"`
	CountInitial   int       `gorm:"column:count_initial" json:"count_initial"`
	CountRemaining int       `gorm:"column:count_remaining" json:"count_remaining"`
	Source         string    `gorm:"column:source" json:"source"`
	Ref            string    `gorm:"column:ref" json:"ref"`
	StartsAt       time.Time `gorm:"column:starts_at" json:"starts_at"` // 生效时刻;零值=即时
	ExpiresAt      time.Time `gorm:"column:expires_at" json:"expires_at"`
	CreatedAt      time.Time `gorm:"column:created_at;autoCreateTime" json:"created_at"`
}

func (CreditResetPass) TableName() string { return "credit_reset_passes" }

// CreditTransaction 经费流水(表 credit_transactions)。供「明细查看」。
// 0098 起金额三列是 DECIMAL(18,6)(经费,6 位小数 = micro-credit 精度)—— payg 日聚合行
// 会出现小数;历史整数行语义不变。DayBucket 仅 type=payg_daily 的行有值(一天一行的幂等键)。
type CreditTransaction struct {
	ID        uint64     `gorm:"primaryKey" json:"id"`
	UserID    uint       `gorm:"column:user_id" json:"user_id"`
	Type      string     `gorm:"column:type" json:"type"`
	Amount    float64    `gorm:"column:amount" json:"amount"`
	TempAfter float64    `gorm:"column:temp_after" json:"temp_after"`
	PermAfter float64    `gorm:"column:perm_after" json:"perm_after"`
	RefType   string     `gorm:"column:ref_type" json:"ref_type"`
	RefID     string     `gorm:"column:ref_id" json:"ref_id"`
	Note      string     `gorm:"column:note" json:"note"`
	DayBucket *time.Time `gorm:"column:day_bucket" json:"day_bucket,omitempty"`
	CreatedAt time.Time  `gorm:"column:created_at;autoCreateTime" json:"created_at"`
}

func (CreditTransaction) TableName() string { return "credit_transactions" }
