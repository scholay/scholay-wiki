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

// CreateSubscription 建一个会员订阅订单(plan = pro|max)。
// 按用户当前会员状态算定动作:新订阅 / 续期(预发放下一周期经费)/ 升级(按剩余天数补差价)。
// 降级直接拒绝(ErrNoDowngrade)。计算结果落在订单上, fulfill 时照此履约。
func (o *OrderService) CreateSubscription(userID uint, plan string) (*Order, error) {
	if plan != TierPro && plan != TierMax {
		return nil, ErrInvalidOrder
	}
	cfg := o.svc.cfg.Get()
	uv, _ := o.svc.repo.GetUserVIP(userID)
	sp, err := computeSubscription(uv, plan, cfg, time.Now())
	if err != nil {
		return nil, err
	}
	yuan := float64(sp.AmountCents) / 100.0
	gs, ge, ne := sp.GrantStarts, sp.GrantExpires, sp.NewExpires
	ord := &Order{
		UserID: userID, OrderNo: genOrderNo("S"), OrderType: "subscription", PlanCode: sp.Tier,
		PlanName: planActionName(sp.Tier, sp.Action), BillingCycle: "monthly",
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
	AmountCents   int       // 应付(分):new/renew=月价;upgrade=按剩余天数补差价
	Credits       int       // 本单赠送经费:new/renew=整月;upgrade=按剩余天数补差额
	GrantStarts   time.Time // 经费生效日:new/upgrade=now;renew=当前到期日(预发放)
	GrantExpires  time.Time // 经费失效日
	NewExpires    time.Time // 履约后会员到期日
	Deferred      bool      // 经费是否延后生效(renew=true)
	RemainingDays int       // 升级用:剩余天数
}

// computeSubscription 纯函数算定订阅动作 + 金额 + 经费发放窗口。
//   new(免费/已过期):月价,经费即时整月。
//   renew(同档在期):月价,到期日 +1 月;经费预发放(生效日=当前到期日,延后整月)。
//   upgrade(升高一档在期):差价 = (高价-低价)*剩余天数/周期;经费差额同法;立即升档、到期日不变。
//   降级:ErrNoDowngrade。
func computeSubscription(uv UserVIP, target string, cfg *BillingConfig, now time.Time) (*subPlan, error) {
	if target != TierPro && target != TierMax {
		return nil, ErrInvalidOrder
	}
	// 秒对齐:MySQL DATETIME 无亚秒精度且会**四舍五入进位**(17:13:19.7→17:13:20),
	// 否则"即时生效"的 starts_at 会落到下一秒(瞬间未生效→余额为 0),到期日进位也会把
	// 剩余天数多算 1 天。统一向下取整到秒,保证 starts_at<=now、到期日精确。
	now = now.Truncate(time.Second)
	priceT := cfg.PriceCentsFor(target)
	if priceT <= 0 {
		return nil, ErrInvalidOrder
	}
	cycle := cfg.SubscriptionPeriodDays
	if cycle <= 0 {
		cycle = 30
	}
	cur := effectiveTier(uv, now)
	if tierRank(target) < tierRank(cur) {
		return nil, ErrNoDowngrade
	}
	creditsT := cfg.GrantCreditsFor(target)

	// 新订阅:当前免费 / 已过期。
	if !isPaidTier(cur) {
		exp := now.AddDate(0, 0, cycle)
		return &subPlan{Action: "new", Tier: target, AmountCents: priceT, Credits: creditsT,
			GrantStarts: now, GrantExpires: exp, NewExpires: exp}, nil
	}

	// 在期会员。当前到期日(理论上非空,兜底 now+周期)。
	curExpiry := now.AddDate(0, 0, cycle)
	if uv.VIPExpiresAt != nil {
		curExpiry = *uv.VIPExpiresAt
	}

	// 续期(同档):往后延一个月,经费预发放到下一周期。
	if tierRank(target) == tierRank(cur) {
		exp := curExpiry.AddDate(0, 0, cycle)
		return &subPlan{Action: "renew", Tier: target, AmountCents: priceT, Credits: creditsT,
			GrantStarts: curExpiry, GrantExpires: exp, NewExpires: exp, Deferred: true}, nil
	}

	// 升级:按剩余天数补差价(价 + 经费),立即升档、到期日不变。
	remainingDays := daysCeil(curExpiry.Sub(now))
	if remainingDays < 1 {
		remainingDays = 1
	}
	diffCents := proratedDiff(priceT-cfg.PriceCentsFor(cur), remainingDays, cycle)
	if diffCents < 1 {
		diffCents = 1 // 价差地板, 避免 0 元单
	}
	diffCredits := proratedDiff(creditsT-cfg.GrantCreditsFor(cur), remainingDays, cycle)
	return &subPlan{Action: "upgrade", Tier: target, AmountCents: diffCents, Credits: diffCredits,
		GrantStarts: now, GrantExpires: curExpiry, NewExpires: curExpiry, RemainingDays: remainingDays}, nil
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

// planActionName 订单展示名:「Pro 套餐 · 续期」等。
func planActionName(tier, action string) string {
	label := "Pro 套餐"
	if tier == TierMax {
		label = "Max 套餐"
	}
	switch action {
	case "renew":
		return label + " · 续期"
	case "upgrade":
		return label + " · 升级"
	default:
		return label + " · 订阅"
	}
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
			if err := activateSubscriptionInTx(tx, &ord, now); err != nil {
				return err
			}
		default:
			slog.Warn("billing: unknown order type on fulfill", "order_no", orderNo, "type", ord.OrderType)
			return nil
		}
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
	}
	return nil
}

// activateSubscriptionInTx 事务内履约订阅订单(new/renew/upgrade)。动作参数已算定并落在订单上:
//   等级 = 不降级(当前生效档与目标档取高者);到期日 = 订单算定值与当前到期取更晚者(防回退);
//   赠送经费 = 按订单的 grant_starts_at/grant_expires_at 发放(续期是预发放, 生效日在未来)。
func activateSubscriptionInTx(tx *gorm.DB, ord *Order, now time.Time) error {
	var uv UserVIP
	if err := tx.Table("users").Select("vip_tier, vip_expires_at").Where("id = ?", ord.UserID).Scan(&uv).Error; err != nil {
		return err
	}
	// 等级:不降级。
	newTier := ord.PlanCode
	if curEff := effectiveTier(uv, now); tierRank(curEff) > tierRank(newTier) {
		newTier = curEff
	}
	// 到期日:订单算定值与当前到期取更晚者(并发/重复履约不回退)。
	newExp := now.AddDate(0, 0, 30)
	if ord.NewExpiresAt != nil {
		newExp = *ord.NewExpiresAt
	}
	if uv.VIPExpiresAt != nil && uv.VIPExpiresAt.After(newExp) {
		newExp = *uv.VIPExpiresAt
	}
	if err := tx.Table("users").Where("id = ?", ord.UserID).
		Updates(map[string]any{"vip_tier": newTier, "vip_expires_at": newExp}).Error; err != nil {
		return err
	}
	if ord.CreditsGranted > 0 {
		gs, ge := now, newExp
		if ord.GrantStartsAt != nil {
			gs = *ord.GrantStartsAt
		}
		if ord.GrantExpiresAt != nil {
			ge = *ord.GrantExpiresAt
		}
		return grantTempInTx(tx, ord.UserID, ord.CreditsGranted, SourceSubscription, ord.OrderNo, gs, ge, TxGrantSubscription)
	}
	return nil
}

// genOrderNo 生成订单号:前缀 + 北京时间到秒 + 6 位随机(防同秒撞);order_no 唯一索引兜底。
func genOrderNo(prefix string) string {
	suffix, _ := randomCode(6)
	return prefix + time.Now().Format("20060102150405") + suffix
}
