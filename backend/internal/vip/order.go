// ============================================================================
// OrderService —— 订单(充值 / 订阅)+ 支付回调履约。实现 payment.OrderServiceInterface。
//
//   充值(recharge):支付成功 → 入账**永久**经费(GrantPerm)。
//   订阅(subscription):支付成功 → 单调开通会员 + 赠送**临时**经费(整月有效, 失效日=会员到期日)。
//
// 幂等:回调会重试, 故履约在事务里锁单 + status='paid' 短路;order_no 唯一防重复建单。
// 金额以「元」存(orders.amount/final_amount decimal),与现有支付 create/callback 对齐。
// ============================================================================

package vip

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"math"
	"time"

	"scholar-backend/internal/payment"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ErrInvalidOrder —— 下单参数非法(金额过低 / 套餐无效)。
var ErrInvalidOrder = errors.New("vip: invalid order")

// Order orders 表一行(只映射本模块用到的列;其余列走 DB 默认)。
type Order struct {
	ID             uint64     `gorm:"primaryKey" json:"id"`
	UserID         uint       `gorm:"column:user_id" json:"user_id"`
	OrderNo        string     `gorm:"column:order_no" json:"order_no"`
	OrderType      string     `gorm:"column:order_type" json:"order_type"` // recharge | subscription
	PlanCode       string     `gorm:"column:plan_code" json:"plan_code"`
	PlanName       string     `gorm:"column:plan_name" json:"plan_name"`
	BillingCycle   string     `gorm:"column:billing_cycle" json:"billing_cycle"`
	Amount         float64    `gorm:"column:amount" json:"amount"`
	FinalAmount    float64    `gorm:"column:final_amount" json:"final_amount"`
	Status         string     `gorm:"column:status" json:"status"`
	PaymentMethod  string     `gorm:"column:payment_method" json:"payment_method"`
	PaymentTime    *time.Time `gorm:"column:payment_time" json:"payment_time"`
	CreditsGranted int        `gorm:"column:credits_granted" json:"credits_granted"`
	TransactionNo  string     `gorm:"column:transaction_no" json:"transaction_no"`
	// 订阅履约参数(续期/升级):动作 + 赠送经费生效/失效 + 会员新到期。fulfill 时照此发放。
	SubAction      string     `gorm:"column:sub_action" json:"sub_action"`       // new|renew|upgrade
	GrantStartsAt  *time.Time `gorm:"column:grant_starts_at" json:"grant_starts_at"`
	GrantExpiresAt *time.Time `gorm:"column:grant_expires_at" json:"grant_expires_at"`
	NewExpiresAt   *time.Time `gorm:"column:new_expires_at" json:"new_expires_at"`
	CreatedAt      time.Time  `gorm:"column:created_at;autoCreateTime" json:"created_at"`
}

func (Order) TableName() string { return "orders" }

type OrderService struct {
	db  *gorm.DB
	svc *Service
}

func newOrderService(svc *Service) *OrderService {
	return &OrderService{db: svc.repo.DB(), svc: svc}
}

// CreateRecharge 建一个充值订单(金额单位:分)。返回订单(含 order_no + 到账经费预估)。
func (o *OrderService) CreateRecharge(userID uint, cents int) (*Order, error) {
	cfg := o.svc.cfg.Get()
	if cents < cfg.MinRechargeCents {
		return nil, ErrInvalidOrder
	}
	credits := cfg.RechargeCreditsFor(cents)
	if credits <= 0 {
		return nil, ErrInvalidOrder
	}
	yuan := float64(cents) / 100.0
	ord := &Order{
		UserID: userID, OrderNo: genOrderNo("R"), OrderType: "recharge",
		PlanName: "科研经费充值", BillingCycle: "once",
		Amount: yuan, FinalAmount: yuan, Status: "pending", CreditsGranted: credits,
	}
	if err := o.db.Create(ord).Error; err != nil {
		return nil, err
	}
	return ord, nil
}

// CreateSubscription 建一个会员订阅订单(plan = pro|max;cycle = monthly|yearly,空按 monthly)。
// 按用户当前会员状态算定动作:新订阅 / 续期(预发放下一周期经费)/ 升级(按剩余天数补差价)。
// 降级直接拒绝(ErrNoDowngrade);年付未配置价格时拒建年付单(ErrInvalidOrder)。
// 计算结果(含最终计费周期)落在订单上, fulfill 时照此履约。
func (o *OrderService) CreateSubscription(userID uint, plan, cycle string) (*Order, error) {
	if plan != TierPro && plan != TierMax {
		return nil, ErrInvalidOrder
	}
	cfg := o.svc.cfg.Get()
	// 单活跃订阅单(反叠加漏洞):先清理该用户超时(>2h,已过网关关单窗口)的 pending 订阅单;
	// 若仍有较新的 pending 订阅单则拒绝重复建单 —— 否则「挂一张低档年度续期单 + 升档到高档 +
	// 再支付旧单」可借履约的不降级钳制,以低档价把高档延长一整个周期(评审 pricing-math)。
	// 只约束订阅单;充值单不受影响(可与订阅单并存)。
	staleCutoff := time.Now().Add(-2 * time.Hour)
	if err := o.db.Model(&Order{}).
		Where("user_id = ? AND order_type = 'subscription' AND status = 'pending' AND created_at < ?", userID, staleCutoff).
		Update("status", "expired").Error; err != nil {
		return nil, err
	}
	var pendingSubs int64
	if err := o.db.Model(&Order{}).
		Where("user_id = ? AND order_type = 'subscription' AND status = 'pending'", userID).
		Count(&pendingSubs).Error; err != nil {
		return nil, err
	}
	if pendingSubs > 0 {
		return nil, ErrPendingOrderExists
	}
	uv, _ := o.svc.repo.GetUserVIP(userID)
	sp, err := computeSubscription(uv, plan, cycle, cfg, time.Now())
	if err != nil {
		return nil, err
	}
	yuan := float64(sp.AmountCents) / 100.0
	gs, ge, ne := sp.GrantStarts, sp.GrantExpires, sp.NewExpires
	ord := &Order{
		UserID: userID, OrderNo: genOrderNo("S"), OrderType: "subscription", PlanCode: sp.Tier,
		PlanName: planActionName(sp.Tier, sp.Action, sp.Cycle), BillingCycle: sp.Cycle,
		Amount: yuan, FinalAmount: yuan, Status: "pending", CreditsGranted: sp.Credits,
		SubAction: sp.Action, GrantStartsAt: &gs, GrantExpiresAt: &ge, NewExpiresAt: &ne,
	}
	if err := o.db.Create(ord).Error; err != nil {
		return nil, err
	}
	return ord, nil
}

// subPlan 订阅动作的计算结果(建单 + 报价共用)。
type subPlan struct {
	Action        string    // new | renew | upgrade
	Tier          string    // 履约后等级
	Cycle         string    // 计费周期:new/renew=请求周期;upgrade=用户当前订阅周期(见下)
	AmountCents   int       // 应付(分):new/renew=周期价;upgrade=按剩余天数补差价
	Credits       int       // 本单赠送经费:new/renew=整周期(年度=总额,分批发放);upgrade=按剩余天数补差额
	GrantStarts   time.Time // 经费生效日:new/upgrade=now;renew=当前到期日(预发放)
	GrantExpires  time.Time // 经费失效日
	NewExpires    time.Time // 履约后会员到期日
	Deferred      bool      // 经费是否延后生效(renew=true)
	RemainingDays int       // 升级用:剩余天数
}

// computeSubscription 纯函数算定订阅动作 + 金额 + 经费发放窗口。cycle = monthly|yearly(空按 monthly)。
//   new(免费/已过期):周期价,经费即时整周期(年度=总额,履约时分批)。
//   renew(同档在期):周期价,到期日 + 一个周期;经费预发放(生效日=当前到期日)。可跨周期续
//     (月度会员按年续 = 到期日 +365 天并转年费标识,反之亦然;vip_cycle 以最近一单为准)。
//   upgrade(升高一档在期):差价 = (高价-低价)×剩余天数/周期,**按用户当前订阅周期的价目**折算
//     (年费用户按年价口径,防用月价日均高估差价);立即升档、到期日不变。请求的 cycle 不参与 ——
//     「换周期 + 升档」走两步(owner 拍板 2026-07-22):先补差升档,再按意愿续期换周期。
//   降级:ErrNoDowngrade;年付未配置价格:ErrInvalidOrder。
func computeSubscription(uv UserVIP, target, cycle string, cfg *BillingConfig, now time.Time) (*subPlan, error) {
	if target != TierPro && target != TierMax {
		return nil, ErrInvalidOrder
	}
	// 秒对齐:MySQL DATETIME 无亚秒精度且会**四舍五入进位**(17:13:19.7→17:13:20),
	// 否则"即时生效"的 starts_at 会落到下一秒(瞬间未生效→余额为 0),到期日进位也会把
	// 剩余天数多算 1 天。统一向下取整到秒,保证 starts_at<=now、到期日精确。
	now = now.Truncate(time.Second)
	cycle = normCycle(cycle)
	cur := effectiveTier(uv, now)
	if tierRank(target) < tierRank(cur) {
		return nil, ErrNoDowngrade
	}

	// 升级(在期升高一档):按剩余天数补差、到期日不变。
	if isPaidTier(cur) && tierRank(target) > tierRank(cur) {
		curExpiry := now.AddDate(0, 0, cfg.PeriodDaysFor(CycleMonthly))
		if uv.VIPExpiresAt != nil {
			curExpiry = *uv.VIPExpiresAt
		}
		remainingDays := daysCeil(curExpiry.Sub(now))
		if remainingDays < 1 {
			remainingDays = 1
		}
		// 折算基准周期按**剩余时长**选,而非 uv.VIPCycle —— vip_cycle 只记「最近一单」,跨周期
		// 叠加(年付后按月续/月付叠年续)会让余期与周期口径脱节:若用月价日率(period=30)去
		// 外推整年余期(remainingDays≈393),proratedDiff 会得出比「直接新购目标档年费」还贵的
		// 补差(定价倒挂,评审 pricing-math)。规则:剩余 > 月周期且两档年价均配置 → 年价日率
		// (period=365,不再对整年余期外推);否则月价。
		basisCycle := CycleMonthly
		if remainingDays > cfg.PeriodDaysFor(CycleMonthly) &&
			cfg.PriceCentsFor(target, CycleYearly) > 0 && cfg.PriceCentsFor(cur, CycleYearly) > 0 {
			basisCycle = CycleYearly
		}
		period := cfg.PeriodDaysFor(basisCycle)
		diffCents := proratedDiff(cfg.PriceCentsFor(target, basisCycle)-cfg.PriceCentsFor(cur, basisCycle), remainingDays, period)
		if diffCents < 1 {
			diffCents = 1 // 价差地板, 避免 0 元单
		}
		diffCredits := proratedDiff(cfg.GrantCreditsFor(target, basisCycle)-cfg.GrantCreditsFor(cur, basisCycle), remainingDays, period)
		return &subPlan{Action: "upgrade", Tier: target, Cycle: basisCycle, AmountCents: diffCents, Credits: diffCredits,
			GrantStarts: now, GrantExpires: curExpiry, NewExpires: curExpiry, RemainingDays: remainingDays}, nil
	}

	// 新订阅 / 同档续期:按请求周期定价。年付价未配置 → 拒单。
	priceT := cfg.PriceCentsFor(target, cycle)
	if priceT <= 0 {
		return nil, ErrInvalidOrder
	}
	period := cfg.PeriodDaysFor(cycle)
	creditsT := cfg.GrantCreditsFor(target, cycle)

	// 新订阅:当前免费 / 已过期。
	if !isPaidTier(cur) {
		exp := now.AddDate(0, 0, period)
		return &subPlan{Action: "new", Tier: target, Cycle: cycle, AmountCents: priceT, Credits: creditsT,
			GrantStarts: now, GrantExpires: exp, NewExpires: exp}, nil
	}

	// 续期(同档):往后延一个周期,经费预发放到下一周期。当前到期日兜底 now+周期。
	curExpiry := now.AddDate(0, 0, period)
	if uv.VIPExpiresAt != nil {
		curExpiry = *uv.VIPExpiresAt
	}
	exp := curExpiry.AddDate(0, 0, period)
	return &subPlan{Action: "renew", Tier: target, Cycle: cycle, AmountCents: priceT, Credits: creditsT,
		GrantStarts: curExpiry, GrantExpires: exp, NewExpires: exp, Deferred: true}, nil
}

// daysCeil 向上取整的天数(剩余时间不足一天也算一天)。
func daysCeil(d time.Duration) int {
	if d <= 0 {
		return 0
	}
	return int(math.Ceil(d.Hours() / 24))
}

// proratedDiff = round(delta * remainingDays / cycle), 仅对正 delta 生效。
func proratedDiff(delta, remainingDays, cycle int) int {
	if delta <= 0 || remainingDays <= 0 || cycle <= 0 {
		return 0
	}
	return int(math.Round(float64(delta) * float64(remainingDays) / float64(cycle)))
}

// planActionName 订单展示名:「Pro · 续期」「Pro · 年度订阅」等。等级名统一 Free / Pro / Max。
// 年度单显式带「年度」字样(彰显年费,不与月度混同);升级单是周期内补差,不冠周期。
func planActionName(tier, action, cycle string) string {
	label := "Pro"
	if tier == TierMax {
		label = "Max"
	}
	if action == "upgrade" {
		return label + " · 升级"
	}
	if normCycle(cycle) == CycleYearly {
		if action == "renew" {
			return label + " · 年度续期"
		}
		return label + " · 年度订阅"
	}
	if action == "renew" {
		return label + " · 续期"
	}
	return label + " · 订阅"
}

// ListUserOrders 列出某用户**已支付**的订单(订阅 + 充值),供「明细查看」。orderType 可空。
func (o *OrderService) ListUserOrders(userID uint, orderType string) ([]Order, error) {
	q := o.db.Where("user_id = ? AND status = ?", userID, "paid").Order("created_at DESC").Limit(200)
	if orderType == "subscription" || orderType == "recharge" {
		q = q.Where("order_type = ?", orderType)
	}
	var rows []Order
	return rows, q.Find(&rows).Error
}

// AdminListUserOrders 管理端列某用户的订单 —— 与用户面 ListUserOrders 的区别:
//   - 不强制 status='paid'(admin 要看 pending/expired/refunded 等全状态),可选 status 过滤;
//   - 分页(limit/offset)+ 返回 total。
// orderType / status 为空则不过滤。
func (o *OrderService) AdminListUserOrders(userID uint, orderType, status string, limit, offset int) ([]Order, int64, error) {
	q := o.db.Model(&Order{}).Where("user_id = ?", userID)
	if orderType == "subscription" || orderType == "recharge" {
		q = q.Where("order_type = ?", orderType)
	}
	if status != "" {
		q = q.Where("status = ?", status)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var rows []Order
	if err := q.Order("created_at DESC").Limit(limit).Offset(offset).Find(&rows).Error; err != nil {
		return nil, 0, err
	}
	return rows, total, nil
}

// GetOrderByOrderNo 实现 payment.OrderServiceInterface —— 供支付 create/callback 读单。
func (o *OrderService) GetOrderByOrderNo(orderNo string) (*payment.OrderRecord, error) {
	var ord Order
	if err := o.db.Where("order_no = ?", orderNo).First(&ord).Error; err != nil {
		return nil, err
	}
	return &payment.OrderRecord{
		UserID: ord.UserID, Status: ord.Status,
		Amount: ord.Amount, FinalAmount: ord.FinalAmount, PlanCode: ord.PlanCode,
	}, nil
}

// FulfillManually 测试支付:跳过网关, 按订单 final_amount 直接履约(校验订单归属 + pending)。
// 仅在 PAYMENT_TEST_ENABLED 开启时由 handler 调用;复用 fulfill, 天然幂等。
func (o *OrderService) FulfillManually(userID uint, orderNo string) error {
	var ord Order
	if err := o.db.Where("order_no = ? AND user_id = ?", orderNo, userID).First(&ord).Error; err != nil {
		return err
	}
	return o.fulfill(orderNo, "TEST-"+orderNo, ord.FinalAmount, "test")
}

// ProcessAlipayCallback 实现 payment.OrderServiceInterface(支付宝回调履约)。
func (o *OrderService) ProcessAlipayCallback(orderNo, transactionNo string, amount float64, _ map[string]string) error {
	return o.fulfill(orderNo, transactionNo, amount, "alipay")
}

// ProcessWeChatPayCallback 实现 payment.OrderServiceInterface(微信回调履约)。
func (o *OrderService) ProcessWeChatPayCallback(orderNo, transactionID string, amount float64, _ map[string]any) error {
	return o.fulfill(orderNo, transactionID, amount, "wechat")
}

// fulfill 支付成功履约:锁单 → 幂等短路 → 校验金额 → 标记 paid → 入账经费/开通会员。全在一个事务。
// 仅在「本次新履约」成功后(非幂等重试)发站内信 + 邮件通知。
func (o *OrderService) fulfill(orderNo, txNo string, amount float64, method string) error {
	now := time.Now()
	var fulfilled *Order // 仅本次新履约才非空 → 据此通知
	err := o.db.Transaction(func(tx *gorm.DB) error {
		var ord Order
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("order_no = ?", orderNo).First(&ord).Error; err != nil {
			return fmt.Errorf("order not found: %w", err)
		}
		if ord.Status == "paid" {
			return nil // 幂等:回调重试, 已履约直接成功(不重复通知)
		}
		if ord.Status != "pending" {
			return fmt.Errorf("order status not payable: %s", ord.Status)
		}
		if math.Abs(amount-ord.FinalAmount) > 0.01 {
			return fmt.Errorf("amount mismatch: expect %.2f got %.2f", ord.FinalAmount, amount)
		}
		// 标记已支付(并发兜底:只在仍 pending 时更新)。
		res := tx.Model(&Order{}).Where("id = ? AND status = 'pending'", ord.ID).
			Updates(map[string]any{
				"status": "paid", "payment_time": now,
				"payment_method": method, "transaction_no": txNo,
			})
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return nil // 被并发回调抢先, 视为已履约(不重复通知)
		}
		// 履约
		switch ord.OrderType {
		case "recharge":
			if err := grantPermInTx(tx, ord.UserID, ord.CreditsGranted, SourceRecharge, orderNo, TxRecharge); err != nil {
				return err
			}
		case "subscription":
			if err := o.activateSubscriptionInTx(tx, &ord, now); err != nil {
				return err
			}
		default:
			slog.Warn("billing: unknown order type on fulfill", "order_no", orderNo, "type", ord.OrderType)
			return nil
		}
		// 同步内存态(DB 经 map Updates 写入,ord 结构体仍是更新前的值)→ 通知用到准确的支付字段。
		ord.Status = "paid"
		ord.PaymentTime = &now
		ord.PaymentMethod = method
		ord.TransactionNo = txNo
		ordCopy := ord
		fulfilled = &ordCopy
		return nil
	})
	if err != nil {
		return err
	}
	// 事务已提交 → 通知(站内信可靠 + 邮件 best-effort)。失败不影响履约结果。
	if fulfilled != nil {
		o.svc.notifyOrderFulfilled(fulfilled)
		// 订阅履约(新购/续费/升级)→ 升级满血:只抬额度窗口起点,不动 used 统计。
		// 充值(recharge)只加经费、不动会员档,不触发。best-effort,post-commit,不影响履约。
		if fulfilled.OrderType == "subscription" {
			o.svc.ResetBaselineOnUpgrade(context.Background(), fulfilled.UserID)
		}
	}
	return nil
}

// activateSubscriptionInTx 事务内履约订阅订单(new/renew/upgrade)。
//
// 关键修复(此前 bug):授予窗口在**支付时刻**按当前会员状态重算,不再用下单时冻结在订单上的
// grant_starts_at/grant_expires_at/new_expires_at。冻结窗口会导致:逾期支付拿到「生来过期」的经费
// 批次(grant_expires < now)、两张同基线续费的第二笔零延长。重算锚点 = max(now, 当前到期):
//   - 逾期支付(会员已过期)→ 从 now 起算,经费不会born-expired;
//   - 在期支付 → 叠加到当前到期之后(每笔续费各加一个周期)。
// 金额 / 赠送经费数额仍按下单时算定(用户已为此付款),只重算「窗口」。
// FOR UPDATE 锁 users 行:串行化同一用户的并发履约(两张不同订单可同时回调)。
func (o *OrderService) activateSubscriptionInTx(tx *gorm.DB, ord *Order, now time.Time) error {
	// 秒对齐(同 computeSubscription):MySQL DATETIME 会四舍五入进位,否则即时 starts_at 落到下一秒。
	now = now.Truncate(time.Second)

	var uv UserVIP
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Table("users").Select("vip_tier, vip_expires_at, vip_cycle").Where("id = ?", ord.UserID).Scan(&uv).Error; err != nil {
		return err
	}

	cfg := o.svc.cfg.Get()
	cycle := normCycle(ord.BillingCycle)
	periodDays := cfg.PeriodDaysFor(cycle)

	curEff := effectiveTier(uv, now)
	// 锚点 = max(now, 当前到期)。
	base := now
	if uv.VIPExpiresAt != nil && uv.VIPExpiresAt.After(base) {
		base = *uv.VIPExpiresAt
	}

	newTier := ord.PlanCode
	if tierRank(curEff) > tierRank(newTier) {
		newTier = curEff // 不降级
	}

	var newExp, grantStarts, grantExpires time.Time
	if ord.SubAction == "upgrade" {
		// 升级:按剩余天数补差价,不延长周期,只升档。到期日=锚点;经费即时生效到到期。
		newExp = base
		grantStarts = now
		grantExpires = base
	} else {
		// new | renew:从锚点 + 一个周期(月度 30 天 / 年度 365 天,按订单 billing_cycle)。
		// renew=叠加到当前到期之后(预发放);逾期则 base=now 即时。
		newExp = base.AddDate(0, 0, periodDays)
		grantStarts = base
		grantExpires = newExp
	}
	// 防回退:到期日不低于当前(并发/重复履约兜底,虽已 FOR UPDATE)。
	if uv.VIPExpiresAt != nil && uv.VIPExpiresAt.After(newExp) {
		newExp = *uv.VIPExpiresAt
	}

	updates := map[string]any{"vip_tier": newTier, "vip_expires_at": newExp}
	// 周期标识:新购/续期把 vip_cycle 设为本单周期(「最近一次付费订阅的周期」为准,
	// 年费用户按月补一个月即回月度标识,反之亦然);升级不动周期(到期日与周期均不变)。
	if ord.SubAction != "upgrade" {
		updates["vip_cycle"] = cycle
	}
	if err := tx.Table("users").Where("id = ?", ord.UserID).Updates(updates).Error; err != nil {
		return err
	}
	if ord.CreditsGranted > 0 {
		// 赠送经费按「约每 30 天一批」预发放依次生效(owner 拍板 2026-07-22):年度新购/续期拆
		// ~12 批、月度单批;长余期升级(年费口径补差,窗口可近整年)同样分批 —— 防「一次性到账
		// 全年经费 → 首月集中重置薅走全年额度」(评审:升级差额单批即时生效同样绕过节流)。
		return grantBatchedMonthlyInTx(tx, ord.UserID, ord.OrderNo, ord.CreditsGranted, grantStarts, grantExpires)
	}
	return nil
}

// grantBatchedMonthlyInTx 把一笔临时经费按「约每 30 天一批」拆分、预发放依次生效。
// 批数 = round(窗口天数/30) 夹到 [1,12];窗口 <~45 天(月度/短余期升级)→ 单批,与原逻辑一致。
// 每批 starts_at=本段起点、expires_at=本段终点(末批精确对齐窗口末),只在自己那一个月内可用,
// 单月经济模型与月度会员一致。复用续期「预发放 starts_at」(钱包读路径天然支持未来生效批次),
// 余数并入首批。ref 带 #序号(单批时用原 ref),流水/批次可追溯到单。
func grantBatchedMonthlyInTx(tx *gorm.DB, userID uint, orderNo string, total int, startsAt, expiresAt time.Time) error {
	span := expiresAt.Sub(startsAt)
	if total <= 0 || span <= 0 {
		return nil
	}
	parts := int(math.Round(span.Hours() / 24 / 30))
	if parts < 1 {
		parts = 1
	}
	if parts > 12 {
		parts = 12
	}
	if parts == 1 {
		return grantTempInTx(tx, userID, total, SourceSubscription, orderNo, startsAt, expiresAt, TxGrantSubscription)
	}
	per := total / parts
	rem := total - per*parts
	for i := 0; i < parts; i++ {
		amount := per
		if i == 0 {
			amount += rem // 余数并入首批
		}
		if amount <= 0 {
			continue // 总额 < parts 时的空批次直接跳过
		}
		starts := startsAt.Add(span * time.Duration(i) / time.Duration(parts))
		ends := startsAt.Add(span * time.Duration(i+1) / time.Duration(parts))
		if i == parts-1 {
			ends = expiresAt // 消除整除误差,末批精确对齐窗口末
		}
		if err := grantTempInTx(tx, userID, amount, SourceSubscription,
			fmt.Sprintf("%s#%02d", orderNo, i+1), starts, ends, TxGrantSubscription); err != nil {
			return err
		}
	}
	return nil
}

// CancelStalePending 把超过 ttl 仍 pending 的订单标记 expired。返回作废数。
//
// 网关侧已设 120m 超时关单(见 alipay/wechat create),ttl 取得更宽松(默认 24h)只清真正被遗弃的单,
// 不会误杀「网关超时窗口内」的待支付单。作废后 order_no 仍唯一,用户须重新下单 —— 新单按支付时刻
// 重算授予窗口,从根上避免逾期支付拿到过期会员。纯 DB 写,不碰履约。
func (o *OrderService) CancelStalePending(ttl time.Duration) (int64, error) {
	if ttl <= 0 {
		ttl = 24 * time.Hour
	}
	cutoff := time.Now().Add(-ttl)
	res := o.db.Model(&Order{}).
		Where("status = ? AND created_at < ?", "pending", cutoff).
		Update("status", "expired")
	return res.RowsAffected, res.Error
}

// genOrderNo 生成订单号:前缀 + 北京时间到秒 + 6 位随机(防同秒撞);order_no 唯一索引兜底。
func genOrderNo(prefix string) string {
	suffix, _ := randomCode(6)
	return prefix + time.Now().Format("20060102150405") + suffix
}
