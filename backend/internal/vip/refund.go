// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package vip

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"math"
	"strings"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ─────────────────────────────────────────────────────────────────────────────
// 管理台退款
//
// 形态(owner 2026-08-04 拍板):**系统内标记 + 权益回收**,不调网关。
// 管理员先去支付宝/微信商户后台把钱退掉,回到管理台登记这笔退款;系统负责
//   ① 记账(order_refunds,可查可导出可对账)
//   ② 回收权益(经费按比例扣、可选撤销会员)
//   ③ 通知用户
//   ④ 留痕(谁批的、退了多少、回收了多少、差多少)
//
// 🔴 刻意**不改 orders.status**(保持 'paid'),退款状态走独立的 refund_status 列。
//    理由见 migration 0107 头注释:改 status 会让订单从用户账单里整行消失、让历史营收
//    数字被追溯性改写、并让延迟到达的网关回调被 fulfill 拒绝导致网关无限重推。
// ─────────────────────────────────────────────────────────────────────────────

// OrderRefund 一笔退款单据。同一订单可有多笔(支持部分退款)。
type OrderRefund struct {
	ID       uint   `gorm:"primaryKey" json:"id"`
	RefundNo string `gorm:"column:refund_no" json:"refund_no"`
	// IdempotencyKey 调用方带入的幂等键(前端每次打开退款弹窗生成一次,重试沿用同一个)。
	// 🔴 这才是幂等的**唯一**依据 —— refund_no 的序号在结构上撞不上(见 Refund 里的说明)。
	IdempotencyKey string `gorm:"column:idempotency_key" json:"-"`
	OrderNo        string `gorm:"column:order_no" json:"order_no"`
	UserID         uint   `gorm:"column:user_id" json:"user_id"`

	Amount          float64 `gorm:"column:amount" json:"amount"`
	Reason          string  `gorm:"column:reason" json:"reason"`
	Channel         string  `gorm:"column:channel" json:"channel"`
	GatewayRefundNo string  `gorm:"column:gateway_refund_no" json:"gateway_refund_no"`
	Status          string  `gorm:"column:status" json:"status"`

	CreditsExpected   int  `gorm:"column:credits_expected" json:"credits_expected"`
	CreditsReclaimed  int  `gorm:"column:credits_reclaimed" json:"credits_reclaimed"`
	CreditsShortfall  int  `gorm:"column:credits_shortfall" json:"credits_shortfall"`
	MembershipRevoked bool `gorm:"column:membership_revoked" json:"membership_revoked"`

	OperatorID   uint   `gorm:"column:operator_id" json:"operator_id"`
	OperatorName string `gorm:"column:operator_name" json:"operator_name"`

	CreatedAt time.Time `gorm:"column:created_at" json:"created_at"`
}

func (OrderRefund) TableName() string { return "order_refunds" }

// 退款状态(orders.refund_status)
const (
	RefundStatusNone    = ""        // 未退款
	RefundStatusPartial = "partial" // 部分退款
	RefundStatusFull    = "full"    // 已全额退完
)

var (
	// ErrOrderNotRefundable 订单不处于可退状态(未支付 / 已退完)。
	ErrOrderNotRefundable = errors.New("该订单当前不可退款")
	// ErrRefundAmountInvalid 退款金额非法(≤0 或超过剩余可退)。
	ErrRefundAmountInvalid = errors.New("退款金额不合法")
	// ErrRefundDuplicate 幂等键撞车 —— 同一笔退款已登记过。
	ErrRefundDuplicate = errors.New("该退款已登记,请勿重复提交")
)

// RefundRequest 管理台发起的一次退款登记。
type RefundRequest struct {
	OrderNo string
	// AmountYuan 本次退款金额(元)。0 表示「按剩余可退全额退」。
	AmountYuan float64
	Reason     string
	// GatewayRefundNo 商户后台那笔退款的单号,选填,用于对账。
	GatewayRefundNo string
	// RevokeMembership 是否连带撤销会员(仅订阅单有意义)。
	//
	// 为什么是**入参而不是自动判定**:owner 定的口径是「订阅退款整体撤销会员」,
	// 但那个口径对**部分退款**说不通 —— 退 ¥10 就把整个会员清零,与经费「按比例回收」
	// 自相矛盾,而且不可逆。所以由管理台传:全额退默认勾上,部分退默认不勾,管理员可改。
	RevokeMembership bool

	// IdempotencyKey 幂等键 —— 由调用方(管理台弹窗)生成并在重试时**沿用同一个**。
	//
	// 为什么必须由调用方带:退款事务第一步就 FOR UPDATE 锁订单行,两次提交被串行化,
	// 任何服务端派生的序号(如"已有笔数+1")第二次都会前进,永远撞不上唯一索引 ——
	// 那种"幂等"在结构上不可能生效。而真实的危险场景恰恰是**重试**:请求已提交但响应丢失
	// (nginx 读超时 / 网络抖动),弹窗保留输入让管理员再点一次 → 同一笔钱被登记两次、
	// 经费被回收两次、用户收到两封退款通知,而商户后台只退了一次。
	IdempotencyKey string

	OperatorID   uint
	OperatorName string
}

// RefundResult 回给管理台的结果 —— 必须如实报「回收了多少 / 差多少」。
type RefundResult struct {
	Refund *OrderRefund `json:"refund"`
	// RefundedTotal 该订单累计已退金额(含本次)
	RefundedTotal float64 `json:"refunded_total"`
	// RefundStatus 订单退款状态(partial/full)
	RefundStatus string `json:"refund_status"`
}

// ListOrderRefunds 某订单的退款明细(按时间正序)。
func (o *OrderService) ListOrderRefunds(orderNo string) ([]OrderRefund, error) {
	var rows []OrderRefund
	err := o.db.Where("order_no = ?", orderNo).Order("created_at ASC, id ASC").Find(&rows).Error
	// 🔴 nil 切片会被 json 序列化成 null 而不是 [] —— 前端 `.map` 直接崩(本仓库踩过)。
	if rows == nil {
		rows = []OrderRefund{}
	}
	return rows, err
}

// Refund 登记一笔退款并回收权益。
//
// 全程一个事务:锁订单行 → 校验累计不超额 → 写退款单 → 更新订单累计 → 回收经费 → 撤销会员。
// 任何一步失败整体回滚,不会出现「记了退款但权益没收」或「收了权益但没记账」。
//
// 幂等:靠**调用方带入的** IdempotencyKey(order_refunds.idempotency_key 唯一索引)。
// 同键重复提交会把上一次的结果原样回放,不会二次扣经费、不会二次发通知。
// ⚠️ 别指望 refund_no 的序号做幂等 —— 行锁让两次提交串行,序号必然前进,撞不上(见 0109 迁移)。
func (o *OrderService) Refund(ctx context.Context, req RefundRequest) (*RefundResult, error) {
	req.Reason = strings.TrimSpace(req.Reason)
	req.GatewayRefundNo = strings.TrimSpace(req.GatewayRefundNo)

	var result RefundResult
	var reclaimedCredits int
	var revokedMembership bool
	var notifyOrder *Order
	var notifyAmount float64
	var inviteReversalUserID uint
	var inviteReclaimed, inviteShortfall int

	// 幂等键缺省时兜一个 —— 老客户端/脚本没传时至少不会与别的记录撞车,
	// 但**得不到幂等保护**(每次都是新键)。管理台弹窗一定会传。
	idemKey := strings.TrimSpace(req.IdempotencyKey)
	if idemKey == "" {
		idemKey = fmt.Sprintf("legacy-%s-%d", req.OrderNo, time.Now().UnixNano())
	}

	// ── 0. 幂等回放 ──────────────────────────────────────────────────────────
	// 同一个键已经处理过 → 直接把**上一次的结果**原样返回,而不是报错。
	// 这才是重试的正确语义:管理员点第二次是因为没看到第一次的响应,他要的是"结果",
	// 不是一句"重复提交"。回放也保证不会二次扣经费、二次发通知。
	if existing, err := o.findRefundByIdemKey(idemKey); err != nil {
		return nil, err
	} else if existing != nil {
		var ord Order
		if err := o.db.Where("order_no = ?", existing.OrderNo).First(&ord).Error; err != nil {
			return nil, err
		}
		return &RefundResult{
			Refund: existing, RefundedTotal: ord.RefundedAmount, RefundStatus: ord.RefundStatus,
		}, nil
	}

	err := o.db.Transaction(func(tx *gorm.DB) error {
		// ── 1. 锁订单 ────────────────────────────────────────────────────────
		// FOR UPDATE 串行化同一订单的并发退款:两个管理员同时点、或双击,
		// 第二个会在这里排队,拿到的是第一个提交后的 refunded_amount,累计校验才有意义。
		var ord Order
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("order_no = ?", req.OrderNo).First(&ord).Error; err != nil {
			return fmt.Errorf("订单不存在: %w", err)
		}

		// 只有真正收到过钱的订单才谈得上退款。
		if ord.Status != "paid" {
			return fmt.Errorf("%w: 订单状态为 %s(仅已支付订单可退)", ErrOrderNotRefundable, ord.Status)
		}

		// ── 2. 金额校验(整数分,不用浮点比) ──────────────────────────────────
		// 与 fulfill 的口径一致:金额比较一律换算成整数分,浮点在钱的路径上不可信。
		paidCents := yuanToCents(ord.FinalAmount)
		refundedCents := yuanToCents(ord.RefundedAmount)
		remainCents := paidCents - refundedCents
		if remainCents <= 0 {
			return fmt.Errorf("%w: 该订单已全额退完", ErrOrderNotRefundable)
		}

		// 🔴 负数必须显式拒绝,不能和「0 = 退剩余全额」混为一谈。
		// 曾经写成 `<= 0 就退全额`:一个笔误的负号(脚本对账 / curl 补录)会静默变成
		// 「把剩余全额退掉」—— 最大金额的不可逆操作。也挡掉 NaN/Inf。
		if req.AmountYuan < 0 || math.IsNaN(req.AmountYuan) || math.IsInf(req.AmountYuan, 0) {
			return fmt.Errorf("%w: 金额必须为正数(0 表示退剩余全额)", ErrRefundAmountInvalid)
		}
		thisCents := yuanToCents(req.AmountYuan)
		if req.AmountYuan == 0 {
			thisCents = remainCents // 恰好为 0 才是「退剩余全额」
		}
		if thisCents <= 0 || thisCents > remainCents {
			return fmt.Errorf("%w: 本次 %d 分,剩余可退 %d 分", ErrRefundAmountInvalid, thisCents, remainCents)
		}
		thisYuan := float64(thisCents) / 100

		// ── 3. 退款单号(可读编号)────────────────────────────────────────────
		// ⚠️ 序号**不是**幂等依据 —— 真正的幂等键是 req.IdempotencyKey(见结构体注释)。
		// 这里的 COUNT 只为生成一个人类可读的流水号:退款事务第一步就对订单行加了
		// FOR UPDATE,两次提交必然串行,序号必然前进,它撞不上任何唯一索引。
		var existing int64
		if err := tx.Model(&OrderRefund{}).Where("order_no = ?", req.OrderNo).Count(&existing).Error; err != nil {
			return err
		}
		refundNo := fmt.Sprintf("RF%s-%d", ord.OrderNo, existing+1)
		refundAt := time.Now().Truncate(time.Second)
		newRefundedCents := refundedCents + thisCents

		// 邀请首单返利也是这笔实付派生的权益，退款时按剩余净实付幂等反冲。
		// 充值单先锁/收邀请人 wallet，再收被邀请人 wallet；邀请人账号在绑定规则上
		// 恒早（user_id 更小），因而与 bind 的双钱包升序一致。
		reverseInviteReward := func() error {
			if o.refundRewardHook == nil {
				return nil
			}
			var hookErr error
			inviteReversalUserID, inviteReclaimed, inviteShortfall, hookErr = o.refundRewardHook(
				tx, ord.ID, ord.UserID, refundNo, idemKey, newRefundedCents, refundAt)
			return hookErr
		}
		if ord.OrderType == "recharge" {
			if err := reverseInviteReward(); err != nil {
				return err
			}
		}

		// ── 4. 权益回收:经费 ────────────────────────────────────────────────
		// 只有充值单发过经费(订阅单 0090 起不再赠送经费)。
		// 按**本次退款占订单金额的比例**回收:退一半就收一半,与部分退款口径自洽。
		//
		// 🔴 算式必须按**累计量做差**,不能对每笔独立取整。
		//    错误写法 `granted * thisCents / paidCents` 会在比例非整数时系统性少收:
		//    实测 600 经费 / ¥10 的历史订单(旧汇率 60)分 3 次退只能收回 598;
		//    极端情况下每次退 1 分,1000 次退完**一个经费都收不回来**(每次都 floor 成 0),
		//    等于给了一条"分多次退款即可保留全部经费"的套利路径。
		//    累计做差时各笔之和恒等于 floor(G×P/P)=G,退完必然精确收干净。
		expectedCredits := 0
		if ord.OrderType == "recharge" && ord.CreditsGranted > 0 && paidCents > 0 {
			g := int64(ord.CreditsGranted)
			before := g * refundedCents / paidCents              // 本次之前累计应收
			after := g * (refundedCents + thisCents) / paidCents // 本次之后累计应收
			expectedCredits = int(after - before)
		}
		reclaimed, shortfall, err := reclaimCreditsInTx(tx, ord.UserID, expectedCredits, refundNo)
		if err != nil {
			return err
		}

		// ── 5. 权益回收:会员 ────────────────────────────────────────────────
		// owner 口径:订阅退款「整体撤销会员」(打回 free、清空到期日)。
		// 之所以不做「减去一个周期」:users 表只有一对 (vip_tier, vip_expires_at),
		// 没有任何地方记录「这一单把到期日从 X 推到了 Y」(履约用的是重算值,从不回写订单),
		// 多笔续期叠加后单笔贡献不可分离,减一个自然月在月末还会系统性偏差(1/31→2/28 减不回去)。
		revoked := false
		if req.RevokeMembership && ord.OrderType == "subscription" {
			if err := revokeMembershipInTx(tx, ord.UserID); err != nil {
				return err
			}
			revoked = true
		}
		if ord.OrderType == "subscription" && !revoked {
			// 即使管理员选择不撤会员，也先锁被邀请人 users 行再动邀请人 wallet，
			// 保持与 bind 的 users→wallet 顺序一致。
			var lockedUserID uint
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Table("users").
				Where("id = ?", ord.UserID).Pluck("id", &lockedUserID).Error; err != nil {
				return err
			}
		}
		// 订阅退款先锁被邀请人 users 行撤权，再动邀请人 wallet；
		// bind 会先锁完双方 users 才动 wallet，不会出现 wallet→users 的反向等待。
		if ord.OrderType == "subscription" {
			if err := reverseInviteReward(); err != nil {
				return err
			}
		}

		// ── 6. 落退款单 ──────────────────────────────────────────────────────
		rec := OrderRefund{
			RefundNo: refundNo, IdempotencyKey: idemKey,
			OrderNo: ord.OrderNo, UserID: ord.UserID,
			Amount: thisYuan, Reason: req.Reason,
			Channel: ord.PaymentMethod, GatewayRefundNo: req.GatewayRefundNo,
			Status:            "done",
			CreditsExpected:   expectedCredits,
			CreditsReclaimed:  reclaimed,
			CreditsShortfall:  shortfall,
			MembershipRevoked: revoked,
			OperatorID:        req.OperatorID,
			OperatorName:      req.OperatorName,
			CreatedAt:         refundAt,
		}
		if err := tx.Create(&rec).Error; err != nil {
			// 撞 uk_idempotency_key = 同一笔退款并发重复提交(上面的回放检查与这里之间的窗口)。
			// 交给外层重新走一次回放路径把已有结果取出来,不当成故障。
			if isDuplicateKey(err) {
				return ErrRefundDuplicate
			}
			return err
		}

		// ── 7. 更新订单累计 ──────────────────────────────────────────────────
		newStatus := RefundStatusPartial
		if newRefundedCents >= paidCents {
			newStatus = RefundStatusFull
		}
		if err := tx.Model(&Order{}).Where("id = ?", ord.ID).Updates(map[string]any{
			"refunded_amount": float64(newRefundedCents) / 100,
			"refund_status":   newStatus,
		}).Error; err != nil {
			return err
		}

		result = RefundResult{
			Refund:        &rec,
			RefundedTotal: float64(newRefundedCents) / 100,
			RefundStatus:  newStatus,
		}
		reclaimedCredits = reclaimed
		revokedMembership = revoked
		ordCopy := ord
		notifyOrder = &ordCopy
		notifyAmount = thisYuan
		return nil
	})
	if err != nil {
		// 并发同键(回放检查与 INSERT 之间的窗口):对方已经写成功了,把它的结果取出来回放。
		if errors.Is(err, ErrRefundDuplicate) {
			if existing, e2 := o.findRefundByIdemKey(idemKey); e2 == nil && existing != nil {
				var ord Order
				if e3 := o.db.Where("order_no = ?", existing.OrderNo).First(&ord).Error; e3 == nil {
					return &RefundResult{
						Refund: existing, RefundedTotal: ord.RefundedAmount, RefundStatus: ord.RefundStatus,
					}, nil
				}
			}
		}
		return nil, err
	}

	// ── 事务外的收尾 ────────────────────────────────────────────────────────
	// 撤销会员后要把额度窗口对齐 —— 与 RevokeUser 的 post-commit 处理一致:
	// 不作废高档期开的那个窗口,用户被打回 free 后免费额度会恒为 0。
	// 🔴 用 context.Background() 而不是请求 ctx。事务已提交,后续副作用不该再受请求生命周期约束:
	// 管理员关标签页 / 写超时中间件(30s)取消 ctx 时,realignWindowAfterDowngrade 的 Redis 调用
	// 会立刻 context.Canceled 并**静默** return,而退款撤销把 vip_expires_at 置成了 NULL ——
	// 唯一的补偿任务 RealignExpiredMembershipWindows 只扫 `expires_at IS NOT NULL` 的用户,
	// 这个人永远不会被捡起来,结果是被打回 free 却背着高档期开的已耗尽窗口(额度恒为 0)。
	// RevokeUser / fulfill 在同样的 post-commit 位置用的也都是 Background。
	if revokedMembership && o.svc != nil {
		o.svc.RealignWindowOnRevoke(context.Background(), notifyOrder.UserID)
	}

	slog.Info("billing: admin refund recorded",
		"refund_no", result.Refund.RefundNo, "order_no", notifyOrder.OrderNo,
		"user_id", notifyOrder.UserID, "amount", notifyAmount,
		"credits_reclaimed", reclaimedCredits, "credits_shortfall", result.Refund.CreditsShortfall,
		"membership_revoked", revokedMembership,
		"operator_id", result.Refund.OperatorID, "operator", result.Refund.OperatorName)

	// 通知用户 —— best-effort,失败不影响退款已经生效的事实。
	if o.svc != nil {
		o.svc.notifyOrderRefunded(notifyOrder, notifyAmount, revokedMembership, reclaimedCredits)
		if inviteReversalUserID > 0 && (inviteReclaimed > 0 || inviteShortfall > 0) {
			o.svc.NotifyInviteRewardReversal(inviteReversalUserID, inviteReclaimed,
				inviteShortfall, result.Refund.RefundNo)
		}
	}
	return &result, nil
}

// reclaimCreditsInTx 回收经费 —— **扣到 0 为止,不扣成负数**(owner 2026-08-04 拍板)。
//
// 现有的 ConsumePerm 是「全有或全无」:余额不足直接 ErrInsufficientCredit 且不扣分文。
// 那个口径用在退款上会很难看 —— 用户只要花掉一点点经费,整笔退款就失败,
// 管理员看到的是一个无法解释的错误。这里改成:能收多少收多少,差额记 shortfall 由平台承担,
// 并且**如实落库**,让「这笔退款其实没收全」在管理台上看得见。
//
// 不允许负余额的理由:负余额不只是账面数字,它会让用户此后一直被额度闸拦住
// (按量付费走不通)直到充值补平,是实打实的用户体感损失。
func reclaimCreditsInTx(tx *gorm.DB, userID uint, expected int, refundNo string) (reclaimed, shortfall int, err error) {
	if expected <= 0 {
		return 0, 0, nil
	}
	if err := ensureWallet(tx, userID); err != nil {
		return 0, 0, err
	}

	// 锁钱包行读余额:与并发的消费/发放串行化,避免「读到 120、扣的时候只剩 20」。
	var w UserWallet
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("user_id = ?", userID).First(&w).Error; err != nil {
		return 0, 0, err
	}

	// 向下取整成整数经费:余额刻度是 micro-credit(经费 × 1e6),这里只收「够一整个经费」的部分,
	// 不制造 0.3 个经费这种扣不干净的尾数(流水 Amount 是 float 但回收口径按整经费走)。
	balance := int(w.PermBalanceMicro / MicroCreditPerCredit)
	if balance < 0 {
		balance = 0 // PAYG 允许小额负余额；shortfall 不得因此超过 expected。
	}
	reclaimed = expected
	if balance < expected {
		reclaimed = balance
	}
	shortfall = expected - reclaimed
	if reclaimed <= 0 {
		return 0, shortfall, nil
	}

	if err := tx.Model(&UserWallet{}).Where("user_id = ?", userID).
		UpdateColumn("perm_balance_micro",
			gorm.Expr("perm_balance_micro - ?", creditsToMicro(reclaimed))).Error; err != nil {
		return 0, 0, err
	}

	temp, perm, err := balancesInTx(tx, userID)
	if err != nil {
		return 0, 0, err
	}
	// 流水记负数 —— TxRefund 常量早就声明了(billing_model.go)但一直零调用,这是它的第一个真实用途。
	note := fmt.Sprintf("订单退款回收(%s)", refundNo)
	if shortfall > 0 {
		note = fmt.Sprintf("订单退款回收(%s);应收 %d,余额不足实收 %d,差额 %d 由平台承担",
			refundNo, expected, reclaimed, shortfall)
	}
	if err := tx.Create(&CreditTransaction{
		UserID: userID, Type: TxRefund, Amount: -float64(reclaimed),
		TempAfter: temp, PermAfter: perm,
		RefType: "order", RefID: refundNo, Note: note,
	}).Error; err != nil {
		return 0, 0, err
	}
	return reclaimed, shortfall, nil
}

// revokeMembershipInTx 事务内撤销会员(打回 free、清空到期日、周期回落月度)。
//
// 与 Service.RevokeUser 同一套写法,但**必须在退款的同一个事务里**执行:
// 分成两个事务的话,「退款记了但会员没撤」或反之都会成为不可见的不一致。
// 🔴 走 users 行锁:service.go 记录过一次实测事故 —— 无锁读 + 整值覆盖会与续费履约/
// 兑换码互相吃掉授予,出现「订单 paid、钱收了、权益没给」。
func revokeMembershipInTx(tx *gorm.DB, userID uint) error {
	var uv UserVIP
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Table("users").Select("vip_tier, vip_expires_at, vip_cycle").
		Where("id = ?", userID).Scan(&uv).Error; err != nil {
		return err
	}
	res := tx.Table("users").Where("id = ?", userID).Updates(map[string]any{
		"vip_tier": TierFree, "vip_expires_at": nil, "vip_cycle": CycleMonthly,
	})
	if res.Error != nil {
		return res.Error
	}
	// free→free 是合法 no-op(RowsAffected=0),只有用户真不存在才算错。
	if res.RowsAffected == 0 {
		var n int64
		if err := tx.Table("users").Where("id = ?", userID).Count(&n).Error; err != nil {
			return err
		}
		if n == 0 {
			return ErrUserNotFound
		}
	}
	// 撤销会员会让在途的升级单变成「基准失效」—— 那些单支付后会把到期日顶回来
	// (activateSubscriptionInTx 有一条「到期日被外部改小(admin 回收等):至少兑现下单时
	// 冻结的承诺到期日」的分支)。这里顺手作废它们,否则退款白做。
	return voidPendingUpgradeOrders(tx, userID, "refund: membership revoked")
}

// findRefundByIdemKey 按幂等键找已登记的退款单;没有返回 (nil, nil)。
func (o *OrderService) findRefundByIdemKey(key string) (*OrderRefund, error) {
	if key == "" {
		return nil, nil
	}
	var rec OrderRefund
	err := o.db.Where("idempotency_key = ?", key).First(&rec).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &rec, nil
}

// isDuplicateKey 判断是否唯一索引冲突(MySQL 1062)。
// gorm 会包一层,所以既认 gorm.ErrDuplicatedKey 也兜底认错误串。
func isDuplicateKey(err error) bool {
	if errors.Is(err, gorm.ErrDuplicatedKey) {
		return true
	}
	s := err.Error()
	return strings.Contains(s, "1062") || strings.Contains(s, "Duplicate entry")
}
