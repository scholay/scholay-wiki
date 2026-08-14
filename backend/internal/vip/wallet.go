// ============================================================================
// WalletService —— 经费钱包(**只剩永久经费**)+ 重置次数 + 流水账本。
//
// 0090 起临时经费(credit_temp_lots)整条链路退休:订阅不再赠送经费,存量临时余额已由
// 迁移 0092 按 ceil(余额/换算率) 换成**重置次数**(credit_reset_passes,见本文件末尾)。
// 旧表原地封存作审计/回滚,**代码不再读它**。
//
// 于是余额 = 永久余额一个数。消耗全程事务 + 行锁(FOR UPDATE 锁 user_wallets 行)串行化,
// 防并发双花。经费与重置次数**完全解耦**:重置只扣次数,经费不再能买重置。
// ============================================================================

package vip

import (
	"errors"
	"log/slog"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ErrInsufficientCredit —— 经费不足(消耗 > 可用余额)。
var ErrInsufficientCredit = errors.New("vip: insufficient credit")

// BalanceView 钱包余额总览。0090 起只有一种经费;0094 起经费是**小数**。
// Total 保留(== Perm)是为了不打破 4 份前端镜像的必填字段。
type BalanceView struct {
	// Perm / Total 是**展示用小数经费**(micro ÷ 1e6)。JSON number 承载 —— 只用于渲染,
	// 任何再计算都必须回到 PermMicro,别拿浮点做扣减。
	Perm  float64 `json:"perm"`
	Total float64 `json:"total"`
	// PermMicro 余额真值(micro-credit = 经费 × 1e6)。所有精确运算以它为准。
	PermMicro int64 `json:"perm_micro"`
	// Points 余额当前可兑换的算力点。🔴 2026-07-31 拍板:「算力点」是内部计量单位,
	// **用户端一律不展示**(推翻旧「必须同屏」口径 —— 0095 起经费=分,数字本身即可读出价值)。
	// 字段保留下发供后台/兼容,前端 UI 不得渲染。
	Points int64 `json:"points"`
	// CreditAutopay 周期额度用完后自动用经费续(0094)。默认关。
	CreditAutopay bool `json:"credit_autopay"`
	AutoReset     bool `json:"auto_reset"` // 自动重置开关(随钱包行一并读出, 省一次查询)
}

// creditsToMicro 整经费 → micro-credit(充值/兑换/调账的入账口径仍是整经费)。
func creditsToMicro(credits int) int64 { return int64(credits) * MicroCreditPerCredit }

// (activeLots / activeLotSQL / sumTemp / planConsume / lotDeduct 已删除 —— 临时经费退休后,
//  「临时优先→永久」的两层扣减不复存在,经费消耗只剩「够不够永久余额」一个判断。
//  最近到期优先的批次消耗策略搬到了文件末尾的重置次数上。)

type WalletService struct {
	db *gorm.DB
}

func NewWalletService(db *gorm.DB) *WalletService { return &WalletService{db: db} }

// ensureWallet 保证 user_wallets 有该用户行(并发安全:依赖主键 + ON CONFLICT DO NOTHING)。
func ensureWallet(tx *gorm.DB, userID uint) error {
	return tx.Clauses(clause.OnConflict{DoNothing: true}).
		Create(&UserWallet{UserID: userID}).Error
}

// Balance 读钱包余额。只读, 不加锁。cfg 用于把余额折算成算力点(兑换率是动态配置)。
func (w *WalletService) Balance(userID uint, cfg *BillingConfig) (*BalanceView, error) {
	var wallet UserWallet
	if err := w.db.Where("user_id = ?", userID).First(&wallet).Error; err != nil &&
		!errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	micro := wallet.PermBalanceMicro
	credits := float64(micro) / float64(MicroCreditPerCredit)
	return &BalanceView{
		Perm: credits, Total: credits, PermMicro: micro,
		Points:        cfg.PointsForMicroCredit(micro),
		CreditAutopay: wallet.CreditAutopayEnabled,
		AutoReset:     wallet.AutoResetEnabled,
	}, nil
}

// SetCreditAutopay 开/关「额度用完自动用经费续」。默认关,只能由用户显式改。
func (w *WalletService) SetCreditAutopay(userID uint, on bool) error {
	return w.db.Transaction(func(tx *gorm.DB) error {
		if err := ensureWallet(tx, userID); err != nil {
			return err
		}
		return tx.Model(&UserWallet{}).Where("user_id = ?", userID).
			Update("credit_autopay_enabled", on).Error
	})
}

// ConsumeForQuota 按量扣经费(周期额度用完后的兜底付费)。入参是本次调用的**真实成本(微元)**。
//
// 与 ConsumePerm 的区别:
//   - 入参单位不同(微元真实成本 vs 整经费),经 cfg.MicroCreditForCost 换算;
//   - **不做余额校验、允许扣成负数**。这是有意的:本函数由 llmusage 的异步 observer 调用,
//     那里拒绝也阻止不了已经发生的调用;硬拦只会让余额停在正数、成本却已实际支出。
//     真正的闸门在 CheckDailyQuota(开新轮前要求余额 > 0),所以欠出的上界 ≈ 一轮的成本
//     (闸门只在 user_message 起点执法、单轮内不打断,保证 agent 单轮优雅收尾)。
//   - **不写 credit_transactions**:那张表 amount/perm_after 是整经费列,小数消耗会被抹成 0;
//     且每次 LLM 调用一行会让它与 llm_token_usage 等体量膨胀。消耗明细看算力用量口径。
func (w *WalletService) ConsumeForQuota(userID uint, costMicroYuan int64, cfg *BillingConfig) error {
	delta := cfg.MicroCreditForCost(costMicroYuan)
	if delta <= 0 {
		return nil
	}
	if err := w.db.Transaction(func(tx *gorm.DB) error {
		if err := ensureWallet(tx, userID); err != nil {
			return err
		}
		return tx.Model(&UserWallet{}).Where("user_id = ?", userID).
			UpdateColumn("perm_balance_micro", gorm.Expr("perm_balance_micro - ?", delta)).Error
	}); err != nil {
		return err
	}
	// 流水在扣减事务**之外** best-effort:流水挂了不能拦住已发生成本的扣减(余额真源在 user_wallets)。
	w.recordPaygDaily(userID, delta)
	return nil
}

// recordPaygDaily 把一次 payg 扣减并入「当天那一行」流水(0098,owner 拍板:payg 可对账,每日一行)。
// 幂等/并发键 = 唯一索引 uk_credit_tx_daily(user_id, type, day_bucket):INSERT ... ON DUPLICATE
// KEY UPDATE 当天累加,并发扣减不会裂成多行。金额用 SQL 侧 DECIMAL 精确算(?/1000000.0),
// 不经 float64 累加,避免长期漂移;perm_after 是展示性快照(取 upsert 时点的余额)。
func (w *WalletService) recordPaygDaily(userID uint, deltaMicro int64) {
	var micro int64
	if err := w.db.Model(&UserWallet{}).Where("user_id = ?", userID).
		Select("perm_balance_micro").Scan(&micro).Error; err != nil {
		slog.Warn("billing: payg 日聚合流水读余额失败(快照写 0)", "user_id", userID, "err", err)
	}
	now := time.Now()
	if err := w.db.Exec(`INSERT INTO credit_transactions
		  (user_id, type, amount, temp_after, perm_after, ref_type, ref_id, note, day_bucket, created_at)
		VALUES (?, ?, -(? / 1000000.0), 0, ? / 1000000.0, 'quota', '', ?, ?, ?)
		ON DUPLICATE KEY UPDATE
		  amount = amount - (? / 1000000.0),
		  perm_after = ? / 1000000.0`,
		userID, TxPaygDaily, deltaMicro, micro,
		"按量付费(用经费继续)当日累计", now.Format("2006-01-02"), now,
		deltaMicro, micro).Error; err != nil {
		slog.Warn("billing: payg 日聚合流水写入失败(扣减不受影响)", "user_id", userID, "err", err)
	}
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

// (GrantTemp 已删除 —— 0090 起没有任何路径再发放临时经费。)

// GrantPerm 发放永久经费(充值/礼品永久/admin 调账)。永久余额 += amount + 写流水;
// note 透传到 credit_transactions.note(admin 调账留痕:没有备注的加款流水在对账时无从归因)。
func (w *WalletService) GrantPerm(userID uint, amount int, source, ref, txType, note string) error {
	if amount <= 0 {
		return nil
	}
	return w.db.Transaction(func(tx *gorm.DB) error {
		return grantPermNoteInTx(tx, userID, amount, source, ref, txType, note)
	})
}

// GrantPermInTx 是跨模块的事务内入账端口。调用方拥有 tx，因而可把自己的
// 关系/幂等键/审计行与钱包 + credit_transactions 原子提交。返回流水 id 供业务审计表关联。
// 绝不在此开嵌套事务。
func (w *WalletService) GrantPermInTx(tx *gorm.DB, userID uint, amount int, source, ref, txType, note string) (uint64, error) {
	if tx == nil {
		return 0, errors.New("vip: nil transaction")
	}
	return grantPermNoteWithIDInTx(tx, userID, amount, source, ref, txType, note)
}

// ReclaimPermInTx 按整经费回收到 0 为止，返回负数流水 ID / 实收 / 差额。
// 这是跨域事务端口：不开新事务，让调用方的幂等行与钱包反冲原子提交。
func (w *WalletService) ReclaimPermInTx(tx *gorm.DB, userID uint, expected int,
	source, ref, txType, note string) (txID uint64, reclaimed, shortfall int, err error) {
	if tx == nil {
		return 0, 0, 0, errors.New("vip: nil transaction")
	}
	if expected <= 0 {
		return 0, 0, 0, nil
	}
	if err := ensureWallet(tx, userID); err != nil {
		return 0, 0, 0, err
	}
	var wallet UserWallet
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("user_id = ?", userID).First(&wallet).Error; err != nil {
		return 0, 0, 0, err
	}
	balance := int(wallet.PermBalanceMicro / MicroCreditPerCredit)
	if balance < 0 {
		balance = 0 // PAYG 允许小额负余额；退款不能把负数当作“超额差额”。
	}
	reclaimed = expected
	if balance < reclaimed {
		reclaimed = balance
	}
	shortfall = expected - reclaimed
	if reclaimed <= 0 {
		return 0, 0, shortfall, nil
	}
	if err := tx.Model(&UserWallet{}).Where("user_id = ?", userID).
		UpdateColumn("perm_balance_micro",
			gorm.Expr("perm_balance_micro - ?", creditsToMicro(reclaimed))).Error; err != nil {
		return 0, 0, 0, err
	}
	temp, perm, err := balancesInTx(tx, userID)
	if err != nil {
		return 0, 0, 0, err
	}
	if note == "" {
		note = "奖励退款反冲"
	}
	if shortfall > 0 {
		note += ";余额不足，平台承担差额"
	}
	row := &CreditTransaction{
		UserID: userID, Type: txType, Amount: -float64(reclaimed),
		TempAfter: temp, PermAfter: perm,
		RefType: refTypeOf(source), RefID: ref, Note: note,
	}
	if err := tx.Create(row).Error; err != nil {
		return 0, 0, 0, err
	}
	return row.ID, reclaimed, shortfall, nil
}

// grantPermInTx —— 事务内发放永久经费(供兑换码原子兑换 + 充值履约复用)。
// 签名保持不带 note:两个调用点(order.go 充值履约 / repository.go 兑换码)自身无备注语境,
// 流水靠 ref_type/ref_id 归因即可。
func grantPermInTx(tx *gorm.DB, userID uint, amount int, source, ref string, txType string) error {
	return grantPermNoteInTx(tx, userID, amount, source, ref, txType, "")
}

// grantPermNoteInTx —— 事务内发放永久经费(带流水备注;所有永久入账的唯一落点)。
func grantPermNoteInTx(tx *gorm.DB, userID uint, amount int, source, ref, txType, note string) error {
	_, err := grantPermNoteWithIDInTx(tx, userID, amount, source, ref, txType, note)
	return err
}

func grantPermNoteWithIDInTx(tx *gorm.DB, userID uint, amount int, source, ref, txType, note string) (uint64, error) {
	if amount <= 0 {
		return 0, nil
	}
	if err := ensureWallet(tx, userID); err != nil {
		return 0, err
	}
	if err := tx.Model(&UserWallet{}).Where("user_id = ?", userID).
		UpdateColumn("perm_balance_micro", gorm.Expr("perm_balance_micro + ?", creditsToMicro(amount))).Error; err != nil {
		return 0, err
	}
	temp, perm, err := balancesInTx(tx, userID)
	if err != nil {
		return 0, err
	}
	row := &CreditTransaction{
		UserID: userID, Type: txType, Amount: float64(amount),
		TempAfter: temp, PermAfter: perm, RefType: refTypeOf(source), RefID: ref, Note: note,
	}
	if err := tx.Create(row).Error; err != nil {
		return 0, err
	}
	return row.ID, nil
}

// Consume 消耗经费。事务 + 行锁;余额不足返回 ErrInsufficientCredit(不扣分文)。
//
// 0090 起临时经费退休 → 它与 ConsumePerm 语义完全相同,保留这个名字只为不改调用点
// (admin 扣减)。**注意:重置额度已不再走这里** —— 重置扣的是重置次数(ConsumeResetPass)。
func (w *WalletService) Consume(userID uint, amount int, txType, refType, refID, note string) error {
	return w.ConsumePerm(userID, amount, txType, refType, refID, note)
}

// ConsumePerm 从永久余额扣减。事务 + 行锁;余额不足返回 ErrInsufficientCredit(不扣分文)。
// 0090 起这是**唯一**的经费扣减路径(Consume 是它的别名)。
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
		if wallet.PermBalanceMicro < creditsToMicro(amount) {
			return ErrInsufficientCredit
		}
		if err := tx.Model(&UserWallet{}).Where("user_id = ?", userID).
			UpdateColumn("perm_balance_micro", gorm.Expr("perm_balance_micro - ?", creditsToMicro(amount))).Error; err != nil {
			return err
		}
		temp, perm, err := balancesInTx(tx, userID)
		if err != nil {
			return err
		}
		return tx.Create(&CreditTransaction{
			UserID: userID, Type: txType, Amount: -float64(amount),
			TempAfter: temp, PermAfter: perm, RefType: refType, RefID: refID, Note: note,
		}).Error
	})
}

// ExpireSweep 把已过期且仍有余量的**重置次数**批次账面归零。返回清理批次数。
// 由 cleanup 日任务调用(bootstrap 注入)。读余量本就按 now 过滤,这里只是把账面归零,
// 避免「过期批次永远挂着非零余量」在后台/对账时被误读成可用。
//
// 刻意**不写 credit_transactions**:那张流水表的 Amount/TempAfter/PermAfter 是「经费」单位,
// 把次数塞进去会让账本混单位(本仓库已被 free_window_tokens 存微元这类 name≠unit 坑过多次)。
// 0090 前这里扫的是临时经费批次;临时经费退休后旧表原地封存,不再扫也不再有新行。
func (w *WalletService) ExpireSweep(now time.Time) (int, error) {
	res := w.db.Model(&CreditResetPass{}).
		Where("count_remaining > 0 AND expires_at <= ?", now).
		UpdateColumn("count_remaining", 0)
	return int(res.RowsAffected), res.Error
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

// (revokeSubscriptionCreditsInTx 已删除 —— 0090 起订阅不赠送经费,取消会员时没有赠送物可回收。
//  存量的订阅临时批次已被迁移 0092 换成重置次数,而次数是**独立的补偿资源**、不是会员权益,
//  取消会员不连坐回收它们。旧表里的临时批次原地封存,代码不再读。)

// balancesInTx 在事务内重算余额快照,用于写流水。
// 0090 起只剩永久;第一个返回值(temp)恒 0 —— credit_transactions.temp_after 列非破坏保留,
// 历史行的值仍有审计意义,新行一律写 0。签名保留双返回值以免改动所有调用点。
// 0098 起流水列是 DECIMAL(18,6),快照带小数(= micro/1e6),不再截断成整经费。
func balancesInTx(tx *gorm.DB, userID uint) (temp float64, perm float64, err error) {
	var wallet UserWallet
	if err = tx.Where("user_id = ?", userID).First(&wallet).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return 0, 0, nil
		}
		return 0, 0, err
	}
	return 0, float64(wallet.PermBalanceMicro) / float64(MicroCreditPerCredit), nil
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

// ─── 重置次数(0090:取代临时经费)──────────────────────────────────────────
//
// 重置额度从「扣 N 经费(临时优先→永久)」改成「扣 1 次重置次数」。次数按批次持有,
// 每批一个到期日,**最近到期的先扣** —— 与旧临时经费同策略,让快过期的先被用掉。
//
// 与经费的关系:**完全解耦**。永久经费不再能买重置(owner 拍板),两者不互相回落。
// 因此这里不复用 planConsume 那套两层扣减,也不写 credit_transactions
// (流水的 Amount/TempAfter/PermAfter 是「经费」单位,把次数塞进去会让账本混单位)。

// activePassSQL 「已生效未过期有余量」的 WHERE 片段(starts_at 兼容 NULL/零值)。
// starts_at 在 0090 里是 NOT NULL(见那条迁移的红字),所以这里**不需要** IS NULL 分支 ——
// 留着它会让人以为该列可空,而 Go 侧 StartsAt 是非指针 time.Time,真有 NULL 会扫描报错。
const activePassSQL = "user_id = ? AND count_remaining > 0 AND starts_at <= ? AND expires_at > ?"

// ErrNoResetPass —— 没有可用的重置次数。与 ErrInsufficientCredit 分开:两者的用户文案
// 与补救路径都不同(前者只能等补偿,后者可充值),混用会给出误导性的引导。
var ErrNoResetPass = errors.New("vip: no reset pass available")

// ResetPassLotView 给前端看的一批重置次数(含失效日)。
type ResetPassLotView struct {
	Count     int       `json:"count"`
	ExpiresAt time.Time `json:"expires_at"`
	Source    string    `json:"source"`
}

// ResetPassView 重置次数总览:可用总数 + 分批明细(按失效日升序,即消耗顺序)。
type ResetPassView struct {
	Total int                `json:"total"`
	Lots  []ResetPassLotView `json:"lots"`
}

// ResetPasses 读某用户当前可用的重置次数(只读, 不加锁)。
func (w *WalletService) ResetPasses(userID uint) (*ResetPassView, error) {
	now := time.Now()
	var passes []CreditResetPass
	if err := w.db.Where(activePassSQL, userID, now, now).
		Order("expires_at ASC").Find(&passes).Error; err != nil {
		return nil, err
	}
	view := &ResetPassView{Lots: make([]ResetPassLotView, 0, len(passes))}
	for _, p := range passes {
		view.Total += p.CountRemaining
		view.Lots = append(view.Lots, ResetPassLotView{Count: p.CountRemaining, ExpiresAt: p.ExpiresAt, Source: p.Source})
	}
	return view, nil
}

// GrantResetPasses 发放一批重置次数(admin 补偿/运营发放)。
// 一批一行,共享 expiresAt;note 落 ref 列(varchar(64),按 rune 截断防切碎中文)。
// 不写 credit_transactions:次数与经费单位不同,混入流水会让账本混单位(与消耗侧同一取舍)。
func (w *WalletService) GrantResetPasses(userID uint, count int, expiresAt time.Time, note string) error {
	if count <= 0 || !expiresAt.After(time.Now()) {
		return ErrInvalidOrder
	}
	ref := []rune(note)
	if len(ref) > 64 {
		ref = ref[:64]
	}
	return w.db.Create(&CreditResetPass{
		UserID: userID, CountInitial: count, CountRemaining: count,
		Source: "admin", Ref: string(ref),
		StartsAt: time.Now(), ExpiresAt: expiresAt,
	}).Error
}

// ConsumeResetPass 扣 1 次重置次数(最近到期的那批)。无可用次数返回 ErrNoResetPass,不扣分文。
//
// 事务 + 行锁:锁的是 user_wallets 行而不是批次行 —— 与经费消耗共用同一把「每用户串行化」的锁,
// 保证「同一用户的并发重置」在两种资源上都不会双花(ensureWallet 保证行存在)。
// 批次本身再加 FOR UPDATE,防同用户多实例并发时读到同一批次的陈旧余量。
func (w *WalletService) ConsumeResetPass(userID uint) error {
	return w.db.Transaction(func(tx *gorm.DB) error {
		if err := ensureWallet(tx, userID); err != nil {
			return err
		}
		var wallet UserWallet
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("user_id = ?", userID).First(&wallet).Error; err != nil {
			return err
		}
		now := time.Now()
		var pass CreditResetPass
		err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where(activePassSQL, userID, now, now).
			Order("expires_at ASC").First(&pass).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrNoResetPass
		}
		if err != nil {
			return err
		}
		// 带 count_remaining>0 的条件更新:即便锁外有并发把它扣到 0,这里也只会影响 0 行而不是扣成负数。
		res := tx.Model(&CreditResetPass{}).
			Where("id = ? AND count_remaining > 0", pass.ID).
			UpdateColumn("count_remaining", gorm.Expr("count_remaining - 1"))
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return ErrNoResetPass
		}
		return nil
	})
}
