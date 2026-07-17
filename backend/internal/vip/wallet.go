// ============================================================================
// WalletService —— 经费钱包:临时批次(带失效)+ 永久余额 + 流水账本。
//
// 余额 = SUM(未过期临时批次) + 永久余额。消耗顺序:临时(最近到期优先)→ 永久,
// 让快到期的临时经费先被用掉。消耗全程事务 + 行锁(FOR UPDATE 锁 user_wallets 行),
// 防重置/自动重置并发双花。过期:读时按 now 过滤 + ExpireSweep 周期清扫双保险。
//
// 纯逻辑(planConsume / activeLots)抽成包级函数, 便于单测(无需 DB)。
// ============================================================================

package vip

import (
	"errors"
	"sort"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ErrInsufficientCredit —— 经费不足(消耗 > 可用余额)。
var ErrInsufficientCredit = errors.New("vip: insufficient credit")

// LotView 给前端看的临时经费批次(含失效日)。
type LotView struct {
	Amount    int       `json:"amount"`
	ExpiresAt time.Time `json:"expires_at"`
	Source    string    `json:"source"`
}

// BalanceView 钱包余额总览。
type BalanceView struct {
	Temp      int       `json:"temp"`       // 未过期临时经费合计
	Perm      int       `json:"perm"`       // 永久经费
	Total     int       `json:"total"`      // temp + perm
	Lots      []LotView `json:"lots"`       // 未过期临时批次(按失效日升序)
	AutoReset bool      `json:"auto_reset"` // 自动重置开关(随钱包行一并读出, 省一次查询)
}

type lotDeduct struct {
	LotID  uint64
	Amount int
}

// activeLots 过滤出**已生效、未过期、有余额**的临时批次, 并按失效日升序排序(最近到期优先消耗)。纯函数。
// 已生效:StartsAt<=now(零值/预发放未到期前不计入)。
func activeLots(lots []CreditTempLot, now time.Time) []CreditTempLot {
	out := make([]CreditTempLot, 0, len(lots))
	for _, l := range lots {
		if l.AmountRemaining > 0 && !l.StartsAt.After(now) && l.ExpiresAt.After(now) {
			out = append(out, l)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ExpiresAt.Before(out[j].ExpiresAt) })
	return out
}

// activeLotSQL 是「已生效未过期有余额」的 WHERE 片段(starts_at 兼容历史 NULL)。
const activeLotSQL = "user_id = ? AND amount_remaining > 0 AND (starts_at IS NULL OR starts_at <= ?) AND expires_at > ?"

// sumTemp 计算临时经费余额(传入的应已是 activeLots)。纯函数。
func sumTemp(lots []CreditTempLot) int {
	t := 0
	for _, l := range lots {
		t += l.AmountRemaining
	}
	return t
}

// planConsume 在(已排序的)临时批次 + 永久余额上规划扣减 amount:临时优先, 再永久。
// 返回每批次扣减、永久扣减、是否足够(false=余额不足, 不应执行任何扣减)。纯函数。
func planConsume(lots []CreditTempLot, perm, amount int) (deducts []lotDeduct, permTake int, ok bool) {
	if amount <= 0 {
		return nil, 0, true
	}
	remaining := amount
	for _, lot := range lots {
		if remaining <= 0 {
			break
		}
		take := lot.AmountRemaining
		if take > remaining {
			take = remaining
		}
		if take > 0 {
			deducts = append(deducts, lotDeduct{LotID: lot.ID, Amount: take})
			remaining -= take
		}
	}
	if remaining > 0 {
		if perm >= remaining {
			permTake = remaining
			remaining = 0
		} else {
			permTake = perm
			remaining -= perm
		}
	}
	if remaining > 0 {
		return nil, 0, false // 不足
	}
	return deducts, permTake, true
}

type WalletService struct {
	db *gorm.DB
}

func NewWalletService(db *gorm.DB) *WalletService { return &WalletService{db: db} }

// ensureWallet 保证 user_wallets 有该用户行(并发安全:依赖主键 + ON CONFLICT DO NOTHING)。
func ensureWallet(tx *gorm.DB, userID uint) error {
	return tx.Clauses(clause.OnConflict{DoNothing: true}).
		Create(&UserWallet{UserID: userID}).Error
}

// Balance 读钱包余额(未过期临时 + 永久 + 批次明细)。只读, 不加锁。
func (w *WalletService) Balance(userID uint) (*BalanceView, error) {
	now := time.Now()
	var lots []CreditTempLot
	if err := w.db.Where(activeLotSQL, userID, now, now).
		Order("expires_at ASC").Find(&lots).Error; err != nil {
		return nil, err
	}
	var wallet UserWallet
	perm := 0
	autoReset := false
	if err := w.db.Where("user_id = ?", userID).First(&wallet).Error; err == nil {
		perm = wallet.PermBalance
		autoReset = wallet.AutoResetEnabled
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	active := activeLots(lots, now) // 已是 active, 再排一次确保顺序
	temp := sumTemp(active)
	view := &BalanceView{Temp: temp, Perm: perm, Total: temp + perm, AutoReset: autoReset, Lots: make([]LotView, 0, len(active))}
	for _, l := range active {
		view.Lots = append(view.Lots, LotView{Amount: l.AmountRemaining, ExpiresAt: l.ExpiresAt, Source: l.Source})
	}
	return view, nil
}

// (AutoResetEnabled / SetAutoReset 已下线 —— 自动消耗经费重置功能移除,只保留手动重置。
//  user_wallets.auto_reset_enabled 列保留不删(项目约定不做 DROP),仅不再被读写驱动行为。)

// ─── 升级满血「待兑现」标记(R6 持久化补偿)──────────────────────────────────
// ResetBaselineOnUpgrade 删锚遇 Redis 抖动失败时落此标记,vip.ReconcilePendingRefills(cleanup 周期)
// 在 Redis 恢复后补删锚并清标记 —— 防「续费付了钱却不满血、卡到旧窗口自然到期」。

// MarkRefillPending 落「升级满血待兑现」标记(保证钱包行存在后写 refill_pending_at=at)。
func (w *WalletService) MarkRefillPending(userID uint, at time.Time) error {
	return w.db.Transaction(func(tx *gorm.DB) error {
		if err := ensureWallet(tx, userID); err != nil {
			return err
		}
		return tx.Model(&UserWallet{}).Where("user_id = ?", userID).
			Update("refill_pending_at", at).Error
	})
}

// ClearRefillPending 清「待兑现」标记(补偿已应用 / 已由删锚成功兑现)。
func (w *WalletService) ClearRefillPending(userID uint) error {
	return w.db.Model(&UserWallet{}).Where("user_id = ?", userID).
		Update("refill_pending_at", nil).Error
}

// ListRefillPending 列出所有仍待兑现的用户 id(reconciler 扫描;正常量极小,标记随即被清)。
func (w *WalletService) ListRefillPending() ([]uint, error) {
	var ids []uint
	err := w.db.Model(&UserWallet{}).Where("refill_pending_at IS NOT NULL").
		Pluck("user_id", &ids).Error
	return ids, err
}

// GrantTemp 发放临时经费(订阅赠送/礼品/任务)。即时生效(starts_at=now)。新建批次 + 写流水。
func (w *WalletService) GrantTemp(userID uint, amount int, source, ref string, expiresAt time.Time, txType string) error {
	if amount <= 0 {
		return nil
	}
	return w.db.Transaction(func(tx *gorm.DB) error {
		return grantTempInTx(tx, userID, amount, source, ref, time.Now(), expiresAt, txType)
	})
}

// GrantPerm 发放永久经费(充值/礼品永久)。永久余额 += amount + 写流水。
func (w *WalletService) GrantPerm(userID uint, amount int, source, ref string, txType string) error {
	if amount <= 0 {
		return nil
	}
	return w.db.Transaction(func(tx *gorm.DB) error {
		return grantPermInTx(tx, userID, amount, source, ref, txType)
	})
}

// grantTempInTx / grantPermInTx —— 事务内发放(供 GrantTemp/GrantPerm + 兑换码原子兑换复用)。
// startsAt = 生效日(即时发放传 now;续期预发放传下一周期起始日)。
func grantTempInTx(tx *gorm.DB, userID uint, amount int, source, ref string, startsAt, expiresAt time.Time, txType string) error {
	if amount <= 0 {
		return nil
	}
	if err := ensureWallet(tx, userID); err != nil {
		return err
	}
	lot := &CreditTempLot{
		UserID: userID, AmountInitial: amount, AmountRemaining: amount,
		// 秒对齐(向下取整):MySQL DATETIME 进位会把即时 starts_at 推到下一秒, 使其瞬间未生效。
		Source: source, Ref: ref, StartsAt: startsAt.Truncate(time.Second), ExpiresAt: expiresAt,
	}
	if err := tx.Create(lot).Error; err != nil {
		return err
	}
	temp, perm, err := balancesInTx(tx, userID)
	if err != nil {
		return err
	}
	return tx.Create(&CreditTransaction{
		UserID: userID, Type: txType, Amount: amount,
		TempAfter: temp, PermAfter: perm, RefType: refTypeOf(source), RefID: ref,
	}).Error
}

func grantPermInTx(tx *gorm.DB, userID uint, amount int, source, ref string, txType string) error {
	if amount <= 0 {
		return nil
	}
	if err := ensureWallet(tx, userID); err != nil {
		return err
	}
	if err := tx.Model(&UserWallet{}).Where("user_id = ?", userID).
		UpdateColumn("perm_balance", gorm.Expr("perm_balance + ?", amount)).Error; err != nil {
		return err
	}
	temp, perm, err := balancesInTx(tx, userID)
	if err != nil {
		return err
	}
	return tx.Create(&CreditTransaction{
		UserID: userID, Type: txType, Amount: amount,
		TempAfter: temp, PermAfter: perm, RefType: refTypeOf(source), RefID: ref,
	}).Error
}

// Consume 消耗经费(重置额度等)。事务 + 行锁:临时(最近到期优先)→ 永久;
// 余额不足返回 ErrInsufficientCredit(不扣分文)。
func (w *WalletService) Consume(userID uint, amount int, txType, refType, refID, note string) error {
	if amount <= 0 {
		return nil
	}
	return w.db.Transaction(func(tx *gorm.DB) error {
		if err := ensureWallet(tx, userID); err != nil {
			return err
		}
		// 锁住该用户钱包行, 串行化并发消耗(防重置/自动重置双花)。
		var wallet UserWallet
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("user_id = ?", userID).First(&wallet).Error; err != nil {
			return err
		}
		now := time.Now()
		var lots []CreditTempLot
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where(activeLotSQL, userID, now, now).
			Order("expires_at ASC").Find(&lots).Error; err != nil {
			return err
		}
		deducts, permTake, ok := planConsume(lots, wallet.PermBalance, amount)
		if !ok {
			return ErrInsufficientCredit
		}
		for _, d := range deducts {
			if err := tx.Model(&CreditTempLot{}).Where("id = ?", d.LotID).
				UpdateColumn("amount_remaining", gorm.Expr("amount_remaining - ?", d.Amount)).Error; err != nil {
				return err
			}
		}
		if permTake > 0 {
			if err := tx.Model(&UserWallet{}).Where("user_id = ?", userID).
				UpdateColumn("perm_balance", gorm.Expr("perm_balance - ?", permTake)).Error; err != nil {
				return err
			}
		}
		temp, perm, err := balancesInTx(tx, userID)
		if err != nil {
			return err
		}
		return tx.Create(&CreditTransaction{
			UserID: userID, Type: txType, Amount: -amount,
			TempAfter: temp, PermAfter: perm, RefType: refType, RefID: refID, Note: note,
		}).Error
	})
}

// ConsumePerm 只从**永久**余额扣减(不碰临时批次)。事务 + 行锁;永久余额不足返回
// ErrInsufficientCredit(不扣分文)。给「admin 指定扣永久积分」用 —— 通用 Consume 是临时优先,
// 会先烧掉用户的临时经费,与「扣 perm」意图相反。
func (w *WalletService) ConsumePerm(userID uint, amount int, txType, refType, refID, note string) error {
	if amount <= 0 {
		return nil
	}
	return w.db.Transaction(func(tx *gorm.DB) error {
		if err := ensureWallet(tx, userID); err != nil {
			return err
		}
		var wallet UserWallet
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("user_id = ?", userID).First(&wallet).Error; err != nil {
			return err
		}
		if wallet.PermBalance < amount {
			return ErrInsufficientCredit
		}
		if err := tx.Model(&UserWallet{}).Where("user_id = ?", userID).
			UpdateColumn("perm_balance", gorm.Expr("perm_balance - ?", amount)).Error; err != nil {
			return err
		}
		temp, perm, err := balancesInTx(tx, userID)
		if err != nil {
			return err
		}
		return tx.Create(&CreditTransaction{
			UserID: userID, Type: txType, Amount: -amount,
			TempAfter: temp, PermAfter: perm, RefType: refType, RefID: refID, Note: note,
		}).Error
	})
}

// ExpireSweep 把已过期且仍有余额的临时批次清零, 并逐批写 expire 流水。返回清理批次数。
// 周期任务调用;读余额本就按 now 过滤, 这里只是把账面归零并留痕。
func (w *WalletService) ExpireSweep(now time.Time) (int, error) {
	var expired []CreditTempLot
	if err := w.db.Where("amount_remaining > 0 AND expires_at <= ?", now).
		Limit(1000).Find(&expired).Error; err != nil {
		return 0, err
	}
	n := 0
	for _, lot := range expired {
		err := w.db.Transaction(func(tx *gorm.DB) error {
			res := tx.Model(&CreditTempLot{}).
				Where("id = ? AND amount_remaining > 0", lot.ID).
				UpdateColumn("amount_remaining", 0)
			if res.Error != nil {
				return res.Error
			}
			if res.RowsAffected == 0 {
				return nil // 已被并发清掉
			}
			temp, perm, err := balancesInTx(tx, lot.UserID)
			if err != nil {
				return err
			}
			return tx.Create(&CreditTransaction{
				UserID: lot.UserID, Type: TxExpire, Amount: -lot.AmountRemaining,
				TempAfter: temp, PermAfter: perm, RefType: "expire", RefID: "",
				Note: "临时经费到期",
			}).Error
		})
		if err == nil {
			n++
		}
	}
	return n, nil
}

// ListTransactions 分页查经费流水(created_at DESC)。
func (w *WalletService) ListTransactions(userID uint, txType string, limit, offset int) ([]CreditTransaction, int64, error) {
	q := w.db.Model(&CreditTransaction{}).Where("user_id = ?", userID)
	if txType != "" {
		q = q.Where("type = ?", txType)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var rows []CreditTransaction
	if err := q.Order("created_at DESC").Limit(limit).Offset(offset).Find(&rows).Error; err != nil {
		return nil, 0, err
	}
	return rows, total, nil
}

// revokeSubscriptionCreditsInTx 取消会员时清零「订阅赠送(source=subscription)」的临时经费批次
// —— 含当前周期 + 续期预发放的未来批次 —— 并写一条 refund 流水。其他来源(gift/task)的临时经费
// 与永久经费一律不动(用户可能通过别的方式获得临时经费,不应被取消会员牵连)。无可清时为幂等 no-op。
func revokeSubscriptionCreditsInTx(tx *gorm.DB, userID uint) error {
	// 只清/退「未过期」的订阅批次(含未来预发放):already-expired 批次账面价值已为 0,
	// 把它们算进退款会让 refund 流水虚高(ExpireSweep 从前未调度时这些行 amount_remaining 仍 >0)。
	// 故用 expires_at > now 过滤;预发放的未来批次(starts_at>now)仍要清,所以不加 starts_at 条件。
	now := time.Now()
	revokeWhere := "user_id = ? AND source = ? AND amount_remaining > 0 AND expires_at > ?"
	var sum struct{ S *int }
	if err := tx.Model(&CreditTempLot{}).Select("COALESCE(SUM(amount_remaining),0) AS s").
		Where(revokeWhere, userID, SourceSubscription, now).
		Scan(&sum).Error; err != nil {
		return err
	}
	zeroed := 0
	if sum.S != nil {
		zeroed = *sum.S
	}
	if zeroed == 0 {
		return nil
	}
	if err := tx.Model(&CreditTempLot{}).
		Where(revokeWhere, userID, SourceSubscription, now).
		UpdateColumn("amount_remaining", 0).Error; err != nil {
		return err
	}
	temp, perm, err := balancesInTx(tx, userID)
	if err != nil {
		return err
	}
	return tx.Create(&CreditTransaction{
		UserID: userID, Type: TxRefund, Amount: -zeroed,
		TempAfter: temp, PermAfter: perm, RefType: "admin", RefID: "revoke",
		Note: "取消会员·订阅经费清零",
	}).Error
}

// balancesInTx 在事务内重新计算 (临时余额, 永久余额), 用于写流水快照。
func balancesInTx(tx *gorm.DB, userID uint) (temp int, perm int, err error) {
	now := time.Now()
	var t struct{ S *int }
	if err = tx.Model(&CreditTempLot{}).
		Select("COALESCE(SUM(amount_remaining),0) AS s").
		Where(activeLotSQL, userID, now, now).
		Scan(&t).Error; err != nil {
		return 0, 0, err
	}
	if t.S != nil {
		temp = *t.S
	}
	var wallet UserWallet
	if err = tx.Where("user_id = ?", userID).First(&wallet).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return temp, 0, nil
		}
		return 0, 0, err
	}
	return temp, wallet.PermBalance, nil
}

// refTypeOf 把经费来源映射成流水的 ref_type。
func refTypeOf(source string) string {
	switch source {
	case SourceRecharge, SourceSubscription:
		return "order"
	case SourceGift:
		return "code"
	case SourceTask:
		return "task"
	case SourceAdmin:
		return "admin"
	default:
		return source
	}
}
