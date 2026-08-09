package invite

import (
	"errors"
	"math"
	"math/big"
	"sort"
	"strconv"
	"strings"
	"time"

	mysqldriver "github.com/go-sql-driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type campaignUser struct {
	ID        uint      `gorm:"column:id"`
	Status    int8      `gorm:"column:status"`
	CreatedAt time.Time `gorm:"column:created_at"`
}

type registrationDisplay struct {
	InviteRegistration
	InviterEmail string `gorm:"column:inviter_email"`
	InviterName  string `gorm:"column:inviter_name"`
}

type paidOrder struct {
	ID             uint64     `gorm:"column:id"`
	OrderNo        string     `gorm:"column:order_no"`
	FinalAmount    float64    `gorm:"column:final_amount"`
	RefundedAmount float64    `gorm:"column:refunded_amount"`
	PaymentTime    *time.Time `gorm:"column:payment_time"`
}

type firstPurchaseGrantForRefund struct {
	InviteMilestone
	GrantID            uint64 `gorm:"column:grant_id"`
	BeneficiaryUserID  uint   `gorm:"column:beneficiary_user_id"`
	GrantAmountCredits int    `gorm:"column:grant_amount_credits"`
}

func inviterPrecedes(inviter, invitee campaignUser) bool {
	// 账号创建时间是业务先后真源；仅在同一秒时用更小 user id
	// 做稳定破平。钱包锁序另行按 user id 排序，不需要把该限制混入资格判定。
	if inviter.CreatedAt.Before(invitee.CreatedAt) {
		return true
	}
	return inviter.CreatedAt.Equal(invitee.CreatedAt) && inviter.ID < invitee.ID
}

func isDuplicateEntry(err error) bool {
	var mysqlErr *mysqldriver.MySQLError
	return errors.As(err, &mysqlErr) && mysqlErr.Number == 1062
}

func addDays(base time.Time, days int) time.Time { return base.AddDate(0, 0, days) }

// calculateFirstPurchaseRebate 全程用定点整数：recharge_rate 按 DECIMAL(10,4) 放大 1e4，
// 最后只做一次 half-up 四舍五入。big.Int 防止大额订单×基点×汇率的中间乘法溢出。
func calculateFirstPurchaseRebate(cents int64, bps int, rechargeRate float64) int {
	if cents <= 0 || bps <= 0 || rechargeRate <= 0 {
		return 0
	}
	rateScaled := int64(math.Round(rechargeRate * 10000))
	if rateScaled <= 0 {
		return 0
	}
	numerator := new(big.Int).SetInt64(cents)
	numerator.Mul(numerator, big.NewInt(int64(bps)))
	numerator.Mul(numerator, big.NewInt(rateScaled))
	denominator := big.NewInt(10000 * 100 * 10000)
	numerator.Add(numerator, new(big.Int).Div(new(big.Int).Set(denominator), big.NewInt(2)))
	numerator.Div(numerator, denominator)
	maxInt := new(big.Int).SetInt64(int64(^uint(0) >> 1))
	if numerator.Cmp(maxInt) > 0 {
		return int(^uint(0) >> 1)
	}
	return int(numerator.Int64())
}

func calculateInviteReversalTarget(grantCredits int, netCentsAtGrant, refundedCentsAtGrant,
	cumulativeRefundedCents int64, bps int, rechargeRate float64) int {
	if grantCredits <= 0 || netCentsAtGrant <= 0 {
		return 0
	}
	postGrantRefund := cumulativeRefundedCents - refundedCentsAtGrant
	if postGrantRefund < 0 {
		postGrantRefund = 0
	}
	if postGrantRefund > netCentsAtGrant {
		postGrantRefund = netCentsAtGrant
	}
	remainingEntitlement := calculateFirstPurchaseRebate(netCentsAtGrant-postGrantRefund, bps, rechargeRate)
	target := grantCredits - remainingEntitlement
	if target < 0 {
		return 0
	}
	if target > grantCredits {
		return grantCredits
	}
	return target
}

func normalizeSource(source string) string {
	if source == sourceLink {
		return sourceLink
	}
	return sourceManual
}

func normalizeMethod(method string) string {
	method = strings.TrimSpace(method)
	if len(method) > 32 {
		method = method[:32]
	}
	return method
}

func (s *Service) inferRegistrationMethodInTx(tx *gorm.DB, userID uint) (string, error) {
	var provider string
	err := tx.Table("user_auth_providers").Where("user_id = ?", userID).
		Order("created_at ASC, id ASC").Limit(1).Pluck("provider", &provider).Error
	if err != nil {
		return "", err
	}
	if provider = normalizeMethod(provider); provider != "" {
		return provider, nil
	}
	var fallback struct {
		RegisterSource string  `gorm:"column:register_source"`
		Email          *string `gorm:"column:email"`
		Phone          *string `gorm:"column:phone"`
	}
	if err := tx.Table("users").Select("register_source, email, phone").
		Where("id = ?", userID).Scan(&fallback).Error; err != nil {
		return "", err
	}
	if source := normalizeMethod(fallback.RegisterSource); source != "" {
		return source, nil
	}
	if fallback.Email != nil && strings.TrimSpace(*fallback.Email) != "" {
		return "email", nil
	}
	if fallback.Phone != nil && strings.TrimSpace(*fallback.Phone) != "" {
		return "phone", nil
	}
	return "unknown", nil
}

func isExpectedBindError(err error) bool {
	return errors.Is(err, ErrCampaignDisabled) || errors.Is(err, ErrInvalidInviteCode) ||
		errors.Is(err, ErrSelfInvite) || errors.Is(err, ErrAlreadyBound) ||
		errors.Is(err, ErrBindWindowExpired) || errors.Is(err, ErrInviterNotEarlier) ||
		errors.Is(err, ErrUserUnavailable)
}

func bindReason(err error) string {
	switch {
	case errors.Is(err, ErrCampaignDisabled):
		return "campaign_disabled"
	case errors.Is(err, ErrInvalidInviteCode):
		return "invalid_code"
	case errors.Is(err, ErrSelfInvite):
		return "self_invite"
	case errors.Is(err, ErrAlreadyBound):
		return "already_bound"
	case errors.Is(err, ErrBindWindowExpired):
		return "window_expired"
	default:
		return "not_eligible"
	}
}

func (s *Service) registrationDisplay(db *gorm.DB, invitedUserID uint) (*registrationDisplay, error) {
	var row registrationDisplay
	err := db.Table("invite_registrations AS ir").
		Joins("LEFT JOIN users u ON u.id = ir.inviter_user_id").
		Select(`ir.*, COALESCE(u.email, '') AS inviter_email, COALESCE(u.username, '') AS inviter_name`).
		Where("ir.invited_user_id = ?", invitedUserID).First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (s *Service) statusWithDB(db *gorm.DB, userID uint, cfg *CampaignConfig, now time.Time) (*InviteStatus, error) {
	pub := publicCampaign(cfg)
	out := &InviteStatus{Enabled: cfg.Enabled, Campaign: &pub}
	var u campaignUser
	if err := db.Table("users").Select("id, status, created_at").Where("id = ?", userID).First(&u).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			out.Reason = "not_eligible"
			return out, nil
		}
		return nil, err
	}
	if u.Status != 1 {
		out.Reason = "not_eligible"
		return out, nil
	}
	reg, err := s.registrationDisplay(db, userID)
	if err != nil {
		return nil, err
	}
	if reg != nil {
		var rewardedCredits int64
		if err := db.Table("invite_milestones AS m").
			Joins("JOIN invite_reward_grants AS g ON g.milestone_id = m.id").
			Where("m.registration_id = ? AND m.milestone_type = ? AND g.beneficiary_role = ? AND g.beneficiary_user_id = ?",
				reg.ID, milestoneRegistration, roleInvitee, userID).
			Select("COALESCE(SUM(g.amount_credits), 0)").Scan(&rewardedCredits).Error; err != nil {
			return nil, err
		}
		boundAt := reg.BoundAt
		out.Bound = true
		out.InviterName = maskIdentity(reg.InviterEmail, reg.InviterName)
		out.Source = reg.Source
		out.InviteeRewardedCredits = rewardedCredits
		out.BoundAt = &boundAt
		out.Reason = "already_bound"
		return out, nil
	}
	if !cfg.Enabled {
		out.Reason = "campaign_disabled"
		return out, nil
	}
	deadline := addDays(u.CreatedAt, cfg.BindWindowDays)
	out.BindDeadline = &deadline
	if now.After(deadline) {
		out.Reason = "window_expired"
		return out, nil
	}
	out.Eligible = true
	return out, nil
}

func (s *Service) Status(userID uint) (*InviteStatus, error) {
	cfg, err := s.campaignConfig()
	if err != nil {
		return nil, err
	}
	return s.statusWithDB(s.repo.DB(), userID, cfg, time.Now())
}

// Bind 把关系、注册里程碑、双向奖励、grant 审计和钱包流水放在同一事务。
func (s *Service) Bind(code string, invitedUserID uint, source, method string) (*InviteBindResult, error) {
	norm := normalizeCode(code)
	if invitedUserID == 0 || !isValidCodeFormat(norm) {
		return nil, ErrInvalidInviteCode
	}
	initialCode, err := s.repo.FindActiveCode(norm)
	if err != nil {
		return nil, err
	}
	if initialCode == nil {
		return nil, ErrInvalidInviteCode
	}
	if initialCode.UserID == invitedUserID {
		return nil, ErrSelfInvite
	}

	now := time.Now().Truncate(time.Second)
	rewards := InviteBindRewards{}
	notifyInviterCredits := 0
	notifyInviteeCredits := 0
	notifyFirstPurchaseCredits := 0
	err = s.repo.DB().Transaction(func(tx *gorm.DB) error {
		var cfg CampaignConfig
		if err := tx.Where("id = 1").First(&cfg).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrCampaignDisabled
			}
			return err
		}
		if !cfg.Enabled {
			return ErrCampaignDisabled
		}
		// 后绑定追溯先以 FOR UPDATE 锁定“最早有效实付”，再锁 users。
		// 这与 fulfill/refund 的 order→users→wallet 顺序一致，并保证并发退款时
		// 读到等待后的已提交净实付，不对已全退/旧金额新发返利。
		var retrospectiveOrder *paidOrder
		if cfg.FirstPurchaseRebateBPS > 0 && cfg.FirstPurchaseWindowDays > 0 {
			var orderErr error
			retrospectiveOrder, orderErr = s.firstPaidOrderInTx(tx, invitedUserID, true)
			if orderErr != nil {
				return orderErr
			}
		}

		// 双向注册奖励必须先按 user_id 固定顺序锁住两个 users 行，之后才按同序动 wallet。
		ids := []uint{initialCode.UserID, invitedUserID}
		sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
		users := make([]campaignUser, 0, 2)
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Table("users").
			Select("id, status, created_at").Where("id IN ?", ids).Order("id ASC").Find(&users).Error; err != nil {
			return err
		}
		if len(users) != 2 {
			return ErrUserUnavailable
		}
		byID := map[uint]campaignUser{users[0].ID: users[0], users[1].ID: users[1]}
		inviter, inviterOK := byID[initialCode.UserID]
		invitee, inviteeOK := byID[invitedUserID]
		if !inviterOK || !inviteeOK || inviter.Status != 1 || invitee.Status != 1 {
			return ErrUserUnavailable
		}

		var codeRow InviteCode
		if err := tx.Where("id = ? AND user_id = ? AND code = ? AND is_active = 1",
			initialCode.ID, initialCode.UserID, norm).First(&codeRow).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrInvalidInviteCode
			}
			return err
		}
		if !inviterPrecedes(inviter, invitee) {
			return ErrInviterNotEarlier
		}
		var existing InviteRegistration
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("invited_user_id = ?", invitedUserID).First(&existing).Error; err == nil {
			return ErrAlreadyBound
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		if now.After(addDays(invitee.CreatedAt, cfg.BindWindowDays)) {
			return ErrBindWindowExpired
		}

		var billing struct {
			RechargeRate float64 `gorm:"column:recharge_rate"`
		}
		if err := tx.Table("billing_config").Select("recharge_rate").Where("id = 1").Scan(&billing).Error; err != nil {
			return err
		}
		storedSource := normalizeSource(source)
		storedMethod := normalizeMethod(method)
		if storedSource == sourceManual {
			storedMethod, err = s.inferRegistrationMethodInTx(tx, invitedUserID)
			if err != nil {
				return err
			}
		}
		reg := &InviteRegistration{
			InviterUserID: initialCode.UserID, CodeID: codeRow.ID, InvitedUserID: invitedUserID,
			Method: storedMethod, Source: storedSource, RegisteredAt: invitee.CreatedAt,
			BoundAt: now, SnapshotInviterRegistrationCredits: cfg.InviterRegistrationCredits,
			SnapshotInviteeRegistrationCredits: cfg.InviteeRegistrationCredits,
			SnapshotRegistrationDailyCap:       cfg.RegistrationDailyCap, SnapshotBindWindowDays: cfg.BindWindowDays,
			SnapshotFirstPurchaseWindowDays: cfg.FirstPurchaseWindowDays,
			SnapshotFirstPurchaseRebateBPS:  cfg.FirstPurchaseRebateBPS,
			SnapshotRechargeRate:            billing.RechargeRate, CreatedAt: now,
		}
		if err := tx.Create(reg).Error; err != nil {
			if isDuplicateEntry(err) {
				return ErrAlreadyBound
			}
			return err
		}
		milestone := &InviteMilestone{
			RegistrationID: reg.ID, MilestoneType: milestoneRegistration, OccurredAt: now,
			SnapshotRechargeRate: reg.SnapshotRechargeRate,
		}
		if err := tx.Create(milestone).Error; err != nil {
			return err
		}

		capped, err := s.registrationCapReached(tx, reg.InviterUserID, reg.SnapshotRegistrationDailyCap, now)
		if err != nil {
			return err
		}
		if !capped {
			specs := []struct {
				userID uint
				role   string
				amount int
				txType string
				note   string
			}{
				{reg.InviterUserID, roleInviter, reg.SnapshotInviterRegistrationCredits, txRegistrationInviter, "邀请好友注册奖励"},
				{reg.InvitedUserID, roleInvitee, reg.SnapshotInviteeRegistrationCredits, txRegistrationInvitee, "受邀注册奖励"},
			}
			sort.Slice(specs, func(i, j int) bool {
				if specs[i].userID == specs[j].userID {
					return specs[i].role < specs[j].role
				}
				return specs[i].userID < specs[j].userID
			})
			for _, spec := range specs {
				if spec.amount <= 0 {
					continue
				}
				if err := s.grantInTx(tx, milestone.ID, spec.userID, spec.role, spec.amount, spec.txType, spec.note, now); err != nil {
					return err
				}
				if spec.role == roleInviter {
					reg.RewardedCredits = spec.amount
					notifyInviterCredits = spec.amount
					rewards.InviterRegistrationCredits = spec.amount
				} else {
					rewards.InviteeRegistrationCredits = spec.amount
					notifyInviteeCredits = spec.amount
				}
			}
			if reg.RewardedCredits > 0 {
				if err := tx.Model(&InviteRegistration{}).Where("id = ?", reg.ID).
					UpdateColumn("rewarded_credits", reg.RewardedCredits).Error; err != nil {
					return err
				}
			}
		}
		rewards.FirstPurchaseRebateBPS = reg.SnapshotFirstPurchaseRebateBPS
		rewards.FirstPurchaseWindowDays = reg.SnapshotFirstPurchaseWindowDays

		// 普通一致性读，绝不锁 orders：若 fulfill 正持 order 锁等 users，本读忽略未提交 paid；
		// 绑定提交后 fulfill hook 继而看到关系发奖，不会形成 users→order 反向锁。
		var claimErr error
		notifyFirstPurchaseCredits, claimErr = s.claimFirstPurchaseOrderInTx(tx, reg, retrospectiveOrder, now)
		return claimErr
	})
	if err != nil {
		return nil, err
	}
	if notifyInviterCredits > 0 && s.rewardNotifier != nil {
		s.rewardNotifier(initialCode.UserID, notifyInviterCredits, txRegistrationInviter)
	}
	if notifyInviteeCredits > 0 && s.rewardNotifier != nil {
		s.rewardNotifier(invitedUserID, notifyInviteeCredits, txRegistrationInvitee)
	}
	if notifyFirstPurchaseCredits > 0 && s.rewardNotifier != nil {
		s.rewardNotifier(initialCode.UserID, notifyFirstPurchaseCredits, txFirstPurchaseRebate)
	}
	status, err := s.Status(invitedUserID)
	if err != nil {
		return nil, err
	}
	status.Code = norm // 仅回显本次请求已知的码；状态查询/重复绑定不泄漏原码。
	status.Reason = ""
	return &InviteBindResult{Status: *status, Rewards: rewards}, nil
}

func (s *Service) registrationCapReached(tx *gorm.DB, inviterID uint, cap int, now time.Time) (bool, error) {
	if cap <= 0 {
		return false, nil
	}
	dayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	var count int64
	err := tx.Table("invite_milestones AS m").
		Joins("JOIN invite_registrations ir ON ir.id = m.registration_id").
		Joins("JOIN invite_reward_grants g ON g.milestone_id = m.id").
		Where("ir.inviter_user_id = ? AND m.milestone_type = ? AND g.granted_at >= ?",
			inviterID, milestoneRegistration, dayStart).
		Distinct("m.id").Count(&count).Error
	return count >= int64(cap), err
}

func (s *Service) grantInTx(tx *gorm.DB, milestoneID uint64, userID uint, role string, amount int,
	txType, note string, now time.Time) error {
	if amount <= 0 {
		return nil
	}
	if s.txRewardGranter == nil {
		return ErrRewardPortUnwired
	}
	grant := &InviteRewardGrant{
		MilestoneID: milestoneID, BeneficiaryUserID: userID, BeneficiaryRole: role,
		AmountCredits: amount, GrantedAt: now,
	}
	res := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(grant)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return nil
	}
	txID, err := s.txRewardGranter(tx, userID, amount, txType, strconv.FormatUint(milestoneID, 10), note)
	if err != nil {
		return err
	}
	return tx.Model(&InviteRewardGrant{}).Where("id = ?", grant.ID).
		UpdateColumn("credit_transaction_id", txID).Error
}

func (s *Service) firstPaidOrderInTx(tx *gorm.DB, userID uint, lock bool) (*paidOrder, error) {
	var ord paidOrder
	q := tx.Table("orders").Select("id, order_no, final_amount, refunded_amount, payment_time").
		Where("user_id = ? AND status = 'paid' AND order_type IN ('recharge','subscription')", userID).
		Where("payment_time IS NOT NULL AND final_amount > COALESCE(refunded_amount, 0)").
		Where("COALESCE(payment_method, '') <> 'test' AND COALESCE(refund_status, '') <> 'full'").
		Order("payment_time ASC, id ASC")
	if lock {
		q = q.Clauses(clause.Locking{Strength: "UPDATE"})
	}
	err := q.First(&ord).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &ord, nil
}

func (s *Service) claimFirstPurchaseInTx(tx *gorm.DB, reg *InviteRegistration, now time.Time) (int, error) {
	if reg == nil || reg.SnapshotFirstPurchaseWindowDays <= 0 || reg.SnapshotFirstPurchaseRebateBPS <= 0 {
		return 0, nil
	}
	ord, err := s.firstPaidOrderInTx(tx, reg.InvitedUserID, false)
	if err != nil || ord == nil {
		return 0, err
	}
	return s.claimFirstPurchaseOrderInTx(tx, reg, ord, now)
}

func (s *Service) claimFirstPurchaseOrderInTx(tx *gorm.DB, reg *InviteRegistration,
	ord *paidOrder, now time.Time) (int, error) {
	if reg == nil || ord == nil || reg.SnapshotFirstPurchaseWindowDays <= 0 ||
		reg.SnapshotFirstPurchaseRebateBPS <= 0 {
		return 0, nil
	}
	deadline := addDays(reg.RegisteredAt, reg.SnapshotFirstPurchaseWindowDays)
	if ord.PaymentTime == nil || ord.PaymentTime.Before(reg.RegisteredAt) || ord.PaymentTime.After(deadline) {
		return 0, nil
	}
	// 后绑定追溯时按当前净实付计奖：部分退款已退部分不再新发返利；全退单已在查询过滤。
	grossCents := int64(math.Round(ord.FinalAmount * 100))
	refundedCents := int64(math.Round(ord.RefundedAmount * 100))
	cents := grossCents - refundedCents
	amount := calculateFirstPurchaseRebate(cents, reg.SnapshotFirstPurchaseRebateBPS, reg.SnapshotRechargeRate)
	orderID := ord.ID
	milestone := &InviteMilestone{
		RegistrationID: reg.ID, MilestoneType: milestoneFirstPurchase, TriggerOrderID: &orderID,
		TriggerOrderNo: ord.OrderNo, PurchaseAmountCents: cents,
		GrossPurchaseAmountCents: grossCents, RefundedAmountCentsAtGrant: refundedCents,
		SnapshotRebateBPS:    reg.SnapshotFirstPurchaseRebateBPS,
		SnapshotRechargeRate: reg.SnapshotRechargeRate, OccurredAt: *ord.PaymentTime,
	}
	res := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(milestone)
	if res.Error != nil {
		return 0, res.Error
	}
	if res.RowsAffected == 0 || amount <= 0 {
		return 0, nil
	}
	if err := s.grantInTx(tx, milestone.ID, reg.InviterUserID, roleInviter, amount,
		txFirstPurchaseRebate, "被邀请用户首单返利", now); err != nil {
		return 0, err
	}
	return amount, nil
}

// HandlePaidOrderInTx 由 OrderService 在当次 paid 事务中调用。调用时已持 order 锁，
// 这里持 invited users 锁后再动 inviter wallet；充值自身的 invitee wallet 入账必须放在 hook 之后。
func (s *Service) HandlePaidOrderInTx(tx *gorm.DB, userID uint, _ uint64, _ string, orderType string,
	paidCents int64, paidAt time.Time, paymentMethod string) (uint, int, error) {
	if tx == nil || userID == 0 || paidCents <= 0 || paymentMethod == "test" ||
		(orderType != "recharge" && orderType != "subscription") {
		return 0, 0, nil
	}
	var lockID uint
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Table("users").
		Select("id").Where("id = ?", userID).Scan(&lockID).Error; err != nil {
		return 0, 0, err
	}
	if lockID == 0 {
		return 0, 0, nil
	}
	var reg InviteRegistration
	if err := tx.Where("invited_user_id = ?", userID).First(&reg).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return 0, 0, nil
		}
		return 0, 0, err
	}
	amount, err := s.claimFirstPurchaseInTx(tx, &reg, paidAt)
	return reg.InviterUserID, amount, err
}

// HandleRefundInTx 在 order_refunds 与 orders.refunded_amount 的同一事务里反冲首单返利。
// 调用方已持有 order 行锁，同一订单的多次/并发退款因此串行。每个
// grant+refund idempotency key 只有一条 reversal，审计行、钱包和负数流水原子提交。
func (s *Service) HandleRefundInTx(tx *gorm.DB, orderID uint64, invitedUserID uint,
	refundNo, idempotencyKey string, cumulativeRefundedCents int64, reversedAt time.Time) (uint, int, int, error) {
	if tx == nil || orderID == 0 || invitedUserID == 0 || cumulativeRefundedCents <= 0 ||
		strings.TrimSpace(idempotencyKey) == "" {
		return 0, 0, 0, nil
	}
	var row firstPurchaseGrantForRefund
	err := tx.Table("invite_milestones AS m").
		Joins("JOIN invite_registrations ir ON ir.id = m.registration_id").
		Joins("JOIN invite_reward_grants g ON g.milestone_id = m.id AND g.beneficiary_role = ?", roleInviter).
		Select(`m.*, g.id AS grant_id, g.beneficiary_user_id,
			g.amount_credits AS grant_amount_credits`).
		Where("m.milestone_type = ? AND m.trigger_order_id = ? AND ir.invited_user_id = ?",
			milestoneFirstPurchase, orderID, invitedUserID).First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return 0, 0, 0, nil
	}
	if err != nil {
		return 0, 0, 0, err
	}

	// 后绑定可能在部分退款后才发奖：已退部分本来就没有参与奖励，
	// 只反冲发奖之后新增的退款。按剩余净实付重算“现在应得”，可以
	// 与发奖时的 half-up 四舍五入保持完全同口径。
	targetReversal := calculateInviteReversalTarget(row.GrantAmountCredits, row.PurchaseAmountCents,
		row.RefundedAmountCentsAtGrant, cumulativeRefundedCents,
		row.SnapshotRebateBPS, row.SnapshotRechargeRate)
	if targetReversal <= 0 {
		return row.BeneficiaryUserID, 0, 0, nil
	}
	var alreadyExpected int64
	if err := tx.Model(&InviteRewardReversal{}).Where("grant_id = ?", row.GrantID).
		Select("COALESCE(SUM(expected_credits), 0)").Scan(&alreadyExpected).Error; err != nil {
		return 0, 0, 0, err
	}
	delta := targetReversal - int(alreadyExpected)
	if delta <= 0 {
		return row.BeneficiaryUserID, 0, 0, nil
	}

	reversal := &InviteRewardReversal{
		GrantID: row.GrantID, RefundIdempotencyKey: strings.TrimSpace(idempotencyKey),
		RefundNo: strings.TrimSpace(refundNo), BeneficiaryUserID: row.BeneficiaryUserID,
		ExpectedCredits: delta, ReversedAt: reversedAt,
	}
	res := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(reversal)
	if res.Error != nil {
		return 0, 0, 0, res.Error
	}
	if res.RowsAffected == 0 {
		return row.BeneficiaryUserID, 0, 0, nil
	}
	if s.txRewardReclaimer == nil {
		return 0, 0, 0, ErrRewardPortUnwired
	}
	txID, reclaimed, shortfall, err := s.txRewardReclaimer(tx, row.BeneficiaryUserID, delta,
		strconv.FormatUint(reversal.ID, 10), "首单退款回收邀请返利("+reversal.RefundNo+")")
	if err != nil {
		return 0, 0, 0, err
	}
	updates := map[string]any{"reclaimed_credits": reclaimed, "shortfall_credits": shortfall}
	if txID > 0 {
		updates["credit_transaction_id"] = txID
	}
	if err := tx.Model(&InviteRewardReversal{}).Where("id = ?", reversal.ID).Updates(updates).Error; err != nil {
		return 0, 0, 0, err
	}
	return row.BeneficiaryUserID, reclaimed, shortfall, nil
}
