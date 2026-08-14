//go:build integration

package invite

import (
	"context"
	"errors"
	"fmt"
	"os"
	"sync"
	"testing"
	"time"

	"scholar-backend/internal/user"
	"scholar-backend/internal/vip"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func openInviteIntegrationDB(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := os.Getenv("INVITE_TEST_DSN")
	if dsn == "" {
		t.Skip("INVITE_TEST_DSN is not set")
	}
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		t.Fatalf("open invite integration db: %v", err)
	}
	return db
}

func inviteIntegrationServices(db *gorm.DB) (*Service, *vip.Service) {
	inviteSvc := NewService(NewRepository(db))
	vipSvc := vip.NewService(vip.NewRepository(db))
	inviteSvc.SetTxRewardGranter(vipSvc.GrantInviteRewardInTx)
	inviteSvc.SetTxRewardReclaimer(vipSvc.ReclaimInviteRewardInTx)
	vipSvc.Order().SetPaidOrderHook(inviteSvc.HandlePaidOrderInTx)
	vipSvc.Order().SetRefundRewardHook(inviteSvc.HandleRefundInTx)
	return inviteSvc, vipSvc
}

func setIntegrationCampaign(t *testing.T, db *gorm.DB, enabled bool, rebateBPS int) {
	t.Helper()
	var previous CampaignConfig
	if err := db.Where("id = 1").First(&previous).Error; err != nil {
		t.Fatalf("snapshot campaign: %v", err)
	}
	var previousRechargeRate float64
	if err := db.Table("billing_config").Where("id = 1").
		Pluck("recharge_rate", &previousRechargeRate).Error; err != nil {
		t.Fatalf("snapshot recharge rate: %v", err)
	}
	t.Cleanup(func() {
		if err := db.Model(&CampaignConfig{}).Where("id = 1").UpdateColumns(map[string]any{
			"enabled":                      previous.Enabled,
			"inviter_registration_credits": previous.InviterRegistrationCredits,
			"invitee_registration_credits": previous.InviteeRegistrationCredits,
			"registration_daily_cap":       previous.RegistrationDailyCap,
			"bind_window_days":             previous.BindWindowDays,
			"first_purchase_window_days":   previous.FirstPurchaseWindowDays,
			"first_purchase_rebate_bps":    previous.FirstPurchaseRebateBPS,
			"code_help_url":                previous.CodeHelpURL,
			"updated_at":                   previous.UpdatedAt,
		}).Error; err != nil {
			t.Errorf("restore campaign: %v", err)
		}
		if err := db.Table("billing_config").Where("id = 1").
			UpdateColumn("recharge_rate", previousRechargeRate).Error; err != nil {
			t.Errorf("restore recharge rate: %v", err)
		}
	})

	updates := map[string]any{
		"enabled":                      enabled,
		"inviter_registration_credits": 0,
		"invitee_registration_credits": 0,
		"registration_daily_cap":       0,
		"bind_window_days":             30,
		"first_purchase_window_days":   30,
		"first_purchase_rebate_bps":    rebateBPS,
		"code_help_url":                "",
	}
	if err := db.Model(&CampaignConfig{}).Where("id = 1").Updates(updates).Error; err != nil {
		t.Fatalf("update campaign: %v", err)
	}
	if err := db.Table("billing_config").Where("id = 1").Update("recharge_rate", 100).Error; err != nil {
		t.Fatalf("update recharge rate: %v", err)
	}
}

func createIntegrationUser(t *testing.T, db *gorm.DB, prefix string, createdAt time.Time) uint {
	t.Helper()
	unique := fmt.Sprintf("%s-%d", prefix, time.Now().UnixNano())
	if err := db.Exec(`INSERT INTO users
		(username, email, password_hash, role, status, created_at)
		VALUES (?, ?, '', 'user', 1, ?)`, unique, unique+"@test.local", createdAt).Error; err != nil {
		t.Fatalf("insert user: %v", err)
	}
	var id uint
	if err := db.Table("users").Where("email = ?", unique+"@test.local").Pluck("id", &id).Error; err != nil || id == 0 {
		t.Fatalf("read inserted user: id=%d err=%v", id, err)
	}
	return id
}

func createIntegrationCode(t *testing.T, db *gorm.DB, userID uint, code string, active bool) {
	t.Helper()
	if err := db.Create(&InviteCode{
		UserID: userID, Code: code, IsActive: active, CreatedAt: time.Now(),
	}).Error; err != nil {
		t.Fatalf("insert invite code: %v", err)
	}
}

func cleanupIntegrationUsers(t *testing.T, db *gorm.DB, userIDs ...uint) {
	t.Helper()
	if len(userIDs) == 0 {
		return
	}
	var registrationIDs []uint64
	_ = db.Model(&InviteRegistration{}).
		Where("inviter_user_id IN ? OR invited_user_id IN ?", userIDs, userIDs).
		Pluck("id", &registrationIDs).Error
	if len(registrationIDs) > 0 {
		var milestoneIDs []uint64
		_ = db.Model(&InviteMilestone{}).Where("registration_id IN ?", registrationIDs).
			Pluck("id", &milestoneIDs).Error
		if len(milestoneIDs) > 0 {
			var grantIDs []uint64
			_ = db.Model(&InviteRewardGrant{}).Where("milestone_id IN ?", milestoneIDs).
				Pluck("id", &grantIDs).Error
			if len(grantIDs) > 0 {
				_ = db.Where("grant_id IN ?", grantIDs).Delete(&InviteRewardReversal{}).Error
			}
			_ = db.Where("milestone_id IN ?", milestoneIDs).Delete(&InviteRewardGrant{}).Error
		}
		_ = db.Where("registration_id IN ?", registrationIDs).Delete(&InviteMilestone{}).Error
		_ = db.Where("id IN ?", registrationIDs).Delete(&InviteRegistration{}).Error
	}
	_ = db.Where("user_id IN ?", userIDs).Delete(&InviteCode{}).Error
	_ = db.Exec("DELETE FROM credit_transactions WHERE user_id IN ?", userIDs).Error
	_ = db.Exec("DELETE FROM order_refunds WHERE user_id IN ?", userIDs).Error
	_ = db.Exec("DELETE FROM orders WHERE user_id IN ?", userIDs).Error
	_ = db.Exec("DELETE FROM user_wallets WHERE user_id IN ?", userIDs).Error
	_ = db.Exec("DELETE FROM users WHERE id IN ?", userIDs).Error
}

type firstPurchaseIntegrationScenario struct {
	vipService *vip.Service
	inviterID  uint
	inviteeID  uint
	order      *vip.Order
	milestone  InviteMilestone
	grant      InviteRewardGrant
}

func createFirstPurchaseIntegrationScenario(t *testing.T, db *gorm.DB, prefix, code string) firstPurchaseIntegrationScenario {
	t.Helper()
	inviteSvc, vipSvc := inviteIntegrationServices(db)
	now := time.Now().Truncate(time.Second)
	inviter := createIntegrationUser(t, db, prefix+"-inviter", now.Add(-24*time.Hour))
	invitee := createIntegrationUser(t, db, prefix+"-invitee", now)
	t.Cleanup(func() { cleanupIntegrationUsers(t, db, inviter, invitee) })
	createIntegrationCode(t, db, inviter, code, true)
	if _, err := inviteSvc.Bind(code, invitee, sourceManual, "manual"); err != nil {
		t.Fatalf("bind first-purchase scenario: %v", err)
	}
	order := &vip.Order{
		UserID: invitee, OrderNo: fmt.Sprintf("%s-%d", prefix, time.Now().UnixNano()),
		OrderType: "recharge", Amount: 10, FinalAmount: 10, CreditsGranted: 1000,
		Status: "pending", CreatedAt: time.Now(),
	}
	if err := db.Create(order).Error; err != nil {
		t.Fatalf("create first-purchase order: %v", err)
	}
	if err := vipSvc.Order().ProcessAlipayCallback(
		order.OrderNo, "txn-"+order.OrderNo, order.FinalAmount, nil,
	); err != nil {
		t.Fatalf("fulfill first-purchase order: %v", err)
	}

	var registration InviteRegistration
	if err := db.Where("invited_user_id = ?", invitee).First(&registration).Error; err != nil {
		t.Fatalf("read first-purchase registration: %v", err)
	}
	var milestone InviteMilestone
	if err := db.Where("registration_id = ? AND milestone_type = ?", registration.ID, milestoneFirstPurchase).
		First(&milestone).Error; err != nil {
		t.Fatalf("read first-purchase milestone: %v", err)
	}
	var grant InviteRewardGrant
	if err := db.Where("milestone_id = ? AND beneficiary_role = ?", milestone.ID, roleInviter).
		First(&grant).Error; err != nil {
		t.Fatalf("read first-purchase grant: %v", err)
	}
	if grant.AmountCredits != 100 {
		t.Fatalf("first-purchase grant=%d, want 100", grant.AmountCredits)
	}
	return firstPurchaseIntegrationScenario{
		vipService: vipSvc, inviterID: inviter, inviteeID: invitee,
		order: order, milestone: milestone, grant: grant,
	}
}

func TestIntegrationCampaignOffHasNoInviteSideEffects(t *testing.T) {
	db := openInviteIntegrationDB(t)
	setIntegrationCampaign(t, db, false, 0)
	svc, _ := inviteIntegrationServices(db)
	now := time.Now().Truncate(time.Second)
	inviter := createIntegrationUser(t, db, "invite-off-inviter", now.Add(-24*time.Hour))
	invitee := createIntegrationUser(t, db, "invite-off-invitee", now)
	t.Cleanup(func() { cleanupIntegrationUsers(t, db, inviter, invitee) })
	createIntegrationCode(t, db, inviter, "BCDF2345", true)

	valid, err := svc.RecordOpen("BCDF2345")
	if err != nil || valid {
		t.Fatalf("off RecordOpen = (%v,%v), want (false,nil)", valid, err)
	}
	if _, err := svc.Bind("BCDF2345", invitee, sourceManual, "manual"); !errors.Is(err, ErrCampaignDisabled) {
		t.Fatalf("off Bind error = %v, want ErrCampaignDisabled", err)
	}

	var opens int64
	if err := db.Model(&InviteCode{}).Where("user_id = ?", inviter).Pluck("open_count", &opens).Error; err != nil {
		t.Fatal(err)
	}
	var registrations, grants int64
	db.Model(&InviteRegistration{}).Where("invited_user_id = ?", invitee).Count(&registrations)
	db.Model(&InviteRewardGrant{}).Where("beneficiary_user_id IN ?", []uint{inviter, invitee}).Count(&grants)
	if opens != 0 || registrations != 0 || grants != 0 {
		t.Fatalf("off side effects: opens=%d registrations=%d grants=%d", opens, registrations, grants)
	}
}

func TestIntegrationStatusReportsActualInviteeRegistrationGrant(t *testing.T) {
	db := openInviteIntegrationDB(t)
	setIntegrationCampaign(t, db, true, 1000)
	if err := db.Model(&CampaignConfig{}).Where("id = 1").
		Update("invitee_registration_credits", 275).Error; err != nil {
		t.Fatalf("configure invitee registration reward: %v", err)
	}
	svc, _ := inviteIntegrationServices(db)
	now := time.Now().Truncate(time.Second)
	inviter := createIntegrationUser(t, db, "status-reward-inviter", now.Add(-24*time.Hour))
	rewardedInvitee := createIntegrationUser(t, db, "status-reward-invitee", now)
	unrewardedInvitee := createIntegrationUser(t, db, "status-zero-invitee", now.Add(time.Second))
	t.Cleanup(func() { cleanupIntegrationUsers(t, db, inviter, rewardedInvitee, unrewardedInvitee) })
	createIntegrationCode(t, db, inviter, "GHJK2345", true)

	if _, err := svc.Bind("GHJK2345", rewardedInvitee, sourceManual, "manual"); err != nil {
		t.Fatalf("bind rewarded invitee: %v", err)
	}
	// 改动当前活动奖励，验证 status 不会用现配置猜测历史到账额。
	if err := db.Model(&CampaignConfig{}).Where("id = 1").
		Update("invitee_registration_credits", 999).Error; err != nil {
		t.Fatalf("change current invitee reward: %v", err)
	}
	rewardedStatus, err := svc.Status(rewardedInvitee)
	if err != nil {
		t.Fatalf("read rewarded invitee status: %v", err)
	}
	if !rewardedStatus.Bound || rewardedStatus.InviteeRewardedCredits != 275 {
		t.Fatalf("rewarded status=%+v, want bound with actual grant 275", rewardedStatus)
	}

	// 仍有首付返利规则时，受邀注册礼为 0 也可绑定。关系存在但没有 invitee grant
	// 必须返回 0，而不是快照或历史活动数值。
	if err := db.Model(&CampaignConfig{}).Where("id = 1").
		Update("invitee_registration_credits", 0).Error; err != nil {
		t.Fatalf("disable invitee registration reward: %v", err)
	}
	if _, err := svc.Bind("GHJK2345", unrewardedInvitee, sourceManual, "manual"); err != nil {
		t.Fatalf("bind unrewarded invitee: %v", err)
	}
	unrewardedStatus, err := svc.Status(unrewardedInvitee)
	if err != nil {
		t.Fatalf("read unrewarded invitee status: %v", err)
	}
	if !unrewardedStatus.Bound || unrewardedStatus.InviteeRewardedCredits != 0 {
		t.Fatalf("unrewarded status=%+v, want bound with actual grant 0", unrewardedStatus)
	}
}

func TestIntegrationRecordOpenRejectsInactiveFrozenAndOrphanCodes(t *testing.T) {
	db := openInviteIntegrationDB(t)
	setIntegrationCampaign(t, db, true, 1000)
	svc, _ := inviteIntegrationServices(db)
	inviter := createIntegrationUser(t, db, "invite-open", time.Now().Add(-time.Hour))
	createIntegrationCode(t, db, inviter, "GHJK2345", false)

	assertInvalid := func(stage string) {
		t.Helper()
		valid, err := svc.RecordOpen("GHJK2345")
		if err != nil || valid {
			t.Fatalf("%s RecordOpen = (%v,%v), want (false,nil)", stage, valid, err)
		}
	}
	assertInvalid("inactive-code")

	if err := db.Model(&InviteCode{}).Where("user_id = ?", inviter).Update("is_active", true).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Table("users").Where("id = ?", inviter).Update("status", 2).Error; err != nil {
		t.Fatal(err)
	}
	assertInvalid("frozen-user")

	if err := db.Exec("DELETE FROM users WHERE id = ?", inviter).Error; err != nil {
		t.Fatal(err)
	}
	assertInvalid("orphan-code")
	t.Cleanup(func() { cleanupIntegrationUsers(t, db, inviter) })

	var opens int64
	if err := db.Model(&InviteCode{}).Where("user_id = ?", inviter).Pluck("open_count", &opens).Error; err != nil {
		t.Fatal(err)
	}
	if opens != 0 {
		t.Fatalf("invalid code open_count=%d, want 0", opens)
	}
}

func TestIntegrationConcurrentDifferentCodesBindOnceWithoutInternalError(t *testing.T) {
	db := openInviteIntegrationDB(t)
	setIntegrationCampaign(t, db, true, 1000)
	svc, _ := inviteIntegrationServices(db)
	now := time.Now().Truncate(time.Second)
	inviterA := createIntegrationUser(t, db, "bind-a", now.Add(-48*time.Hour))
	inviterB := createIntegrationUser(t, db, "bind-b", now.Add(-24*time.Hour))
	invitee := createIntegrationUser(t, db, "bind-target", now)
	t.Cleanup(func() { cleanupIntegrationUsers(t, db, inviterA, inviterB, invitee) })
	createIntegrationCode(t, db, inviterA, "MNPQ2345", true)
	createIntegrationCode(t, db, inviterB, "RSTU2345", true)

	start := make(chan struct{})
	errs := make(chan error, 2)
	var wg sync.WaitGroup
	for _, code := range []string{"MNPQ2345", "RSTU2345"} {
		wg.Add(1)
		go func(code string) {
			defer wg.Done()
			<-start
			_, err := svc.Bind(code, invitee, sourceManual, "manual")
			errs <- err
		}(code)
	}
	close(start)
	wg.Wait()
	close(errs)

	succeeded, alreadyBound := 0, 0
	for err := range errs {
		switch {
		case err == nil:
			succeeded++
		case errors.Is(err, ErrAlreadyBound):
			alreadyBound++
		default:
			t.Fatalf("unexpected bind error (would surface as 500): %v", err)
		}
	}
	if succeeded != 1 || alreadyBound != 1 {
		t.Fatalf("bind results: success=%d already_bound=%d", succeeded, alreadyBound)
	}
	var registrations int64
	db.Model(&InviteRegistration{}).Where("invited_user_id = ?", invitee).Count(&registrations)
	if registrations != 1 {
		t.Fatalf("registrations=%d, want 1", registrations)
	}
}

func TestIntegrationConcurrentPaidOrdersGrantOneFirstPurchaseAndIgnoreTestPayment(t *testing.T) {
	db := openInviteIntegrationDB(t)
	setIntegrationCampaign(t, db, true, 1000)
	inviteSvc, vipSvc := inviteIntegrationServices(db)
	now := time.Now().Truncate(time.Second)
	inviter := createIntegrationUser(t, db, "purchase-inviter", now.Add(-24*time.Hour))
	invitee := createIntegrationUser(t, db, "purchase-invitee", now)
	t.Cleanup(func() { cleanupIntegrationUsers(t, db, inviter, invitee) })
	createIntegrationCode(t, db, inviter, "VWXY2345", true)
	if _, err := inviteSvc.Bind("VWXY2345", invitee, sourceManual, "manual"); err != nil {
		t.Fatalf("bind: %v", err)
	}

	makeOrder := func(no string, yuan float64, credits int) *vip.Order {
		t.Helper()
		order := &vip.Order{
			UserID: invitee, OrderNo: no, OrderType: "recharge",
			Amount: yuan, FinalAmount: yuan, CreditsGranted: credits,
			Status: "pending", CreatedAt: time.Now(),
		}
		if err := db.Create(order).Error; err != nil {
			t.Fatalf("create order %s: %v", no, err)
		}
		return order
	}
	testOrder := makeOrder(fmt.Sprintf("INV-TEST-%d", time.Now().UnixNano()), 5, 500)
	if err := vipSvc.Order().FulfillManually(invitee, testOrder.OrderNo); err != nil {
		t.Fatalf("fulfill test order: %v", err)
	}
	realA := makeOrder(fmt.Sprintf("INV-A-%d", time.Now().UnixNano()), 10, 1000)
	realB := makeOrder(fmt.Sprintf("INV-B-%d", time.Now().UnixNano()), 20, 2000)

	start := make(chan struct{})
	errs := make(chan error, 2)
	var wg sync.WaitGroup
	for i, order := range []*vip.Order{realA, realB} {
		wg.Add(1)
		go func(i int, order *vip.Order) {
			defer wg.Done()
			<-start
			errs <- vipSvc.Order().ProcessAlipayCallback(
				order.OrderNo, fmt.Sprintf("txn-%d-%d", i, time.Now().UnixNano()), order.FinalAmount, nil,
			)
		}(i, order)
	}
	close(start)
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatalf("concurrent fulfill: %v", err)
		}
	}

	var reg InviteRegistration
	if err := db.Where("invited_user_id = ?", invitee).First(&reg).Error; err != nil {
		t.Fatal(err)
	}
	var milestones []InviteMilestone
	if err := db.Where("registration_id = ? AND milestone_type = ?", reg.ID, milestoneFirstPurchase).
		Find(&milestones).Error; err != nil {
		t.Fatal(err)
	}
	if len(milestones) != 1 {
		t.Fatalf("first-purchase milestones=%d, want 1", len(milestones))
	}
	if milestones[0].TriggerOrderID == nil || *milestones[0].TriggerOrderID == testOrder.ID {
		t.Fatalf("test payment occupied first purchase: trigger=%v test=%d", milestones[0].TriggerOrderID, testOrder.ID)
	}
	var grants []InviteRewardGrant
	if err := db.Where("milestone_id = ?", milestones[0].ID).Find(&grants).Error; err != nil {
		t.Fatal(err)
	}
	if len(grants) != 1 || grants[0].BeneficiaryUserID != inviter || grants[0].BeneficiaryRole != roleInviter {
		t.Fatalf("first-purchase grants=%+v, want one inviter grant", grants)
	}
	expected := map[uint64]int{realA.ID: 100, realB.ID: 200}[*milestones[0].TriggerOrderID]
	if expected == 0 || grants[0].AmountCredits != expected {
		t.Fatalf("grant=%d trigger=%d, expected=%d", grants[0].AmountCredits, *milestones[0].TriggerOrderID, expected)
	}
}

func TestIntegrationBindDoesNotRetroactivelyRewardFullyRefundedOrder(t *testing.T) {
	db := openInviteIntegrationDB(t)
	setIntegrationCampaign(t, db, true, 1000)
	svc, _ := inviteIntegrationServices(db)
	now := time.Now().Truncate(time.Second)
	inviter := createIntegrationUser(t, db, "refund-inviter", now.Add(-24*time.Hour))
	invitee := createIntegrationUser(t, db, "refund-invitee", now.Add(-2*time.Hour))
	t.Cleanup(func() { cleanupIntegrationUsers(t, db, inviter, invitee) })
	createIntegrationCode(t, db, inviter, "ZABC2345", true)
	paidAt := now.Add(-time.Hour)
	fullyRefunded := &vip.Order{
		UserID: invitee, OrderNo: fmt.Sprintf("INV-REFUND-%d", time.Now().UnixNano()),
		OrderType: "recharge", Amount: 10, FinalAmount: 10, Status: "paid",
		PaymentMethod: "alipay", PaymentTime: &paidAt, RefundedAmount: 10,
		RefundStatus: "full", CreditsGranted: 1000, CreatedAt: paidAt,
	}
	if err := db.Create(fullyRefunded).Error; err != nil {
		t.Fatalf("create refunded order: %v", err)
	}
	if _, err := svc.Bind("ZABC2345", invitee, sourceManual, "manual"); err != nil {
		t.Fatalf("bind: %v", err)
	}

	var reg InviteRegistration
	if err := db.Where("invited_user_id = ?", invitee).First(&reg).Error; err != nil {
		t.Fatal(err)
	}
	var firstPurchaseMilestones int64
	db.Model(&InviteMilestone{}).
		Where("registration_id = ? AND milestone_type = ?", reg.ID, milestoneFirstPurchase).
		Count(&firstPurchaseMilestones)
	if firstPurchaseMilestones != 0 {
		t.Fatalf("fully refunded order produced %d first-purchase milestones", firstPurchaseMilestones)
	}
}

func TestIntegrationFirstPurchaseRefundReversalIsCumulativeAndIdempotent(t *testing.T) {
	db := openInviteIntegrationDB(t)
	setIntegrationCampaign(t, db, true, 1000)
	scenario := createFirstPurchaseIntegrationScenario(t, db, "INV-REV", "CDEF6789")

	refund := func(amount float64, key string) *vip.RefundResult {
		t.Helper()
		result, err := scenario.vipService.Order().Refund(context.Background(), vip.RefundRequest{
			OrderNo: scenario.order.OrderNo, AmountYuan: amount, Reason: "invite integration",
			IdempotencyKey: key, OperatorID: 1, OperatorName: "integration",
		})
		if err != nil {
			t.Fatalf("refund %.2f (%s): %v", amount, key, err)
		}
		return result
	}
	assertReversalTotals := func(wantRows int64, wantExpected, wantReclaimed, wantShortfall int64) {
		t.Helper()
		var row struct {
			RowCount  int64 `gorm:"column:row_count"`
			Expected  int64 `gorm:"column:expected"`
			Reclaimed int64 `gorm:"column:reclaimed"`
			Shortfall int64 `gorm:"column:shortfall"`
		}
		if err := db.Model(&InviteRewardReversal{}).Where("grant_id = ?", scenario.grant.ID).
			Select(`COUNT(*) AS row_count, COALESCE(SUM(expected_credits), 0) AS expected,
				COALESCE(SUM(reclaimed_credits), 0) AS reclaimed,
				COALESCE(SUM(shortfall_credits), 0) AS shortfall`).Scan(&row).Error; err != nil {
			t.Fatalf("sum reversals: %v", err)
		}
		if row.RowCount != wantRows || row.Expected != wantExpected || row.Reclaimed != wantReclaimed || row.Shortfall != wantShortfall {
			t.Fatalf("reversal totals=%+v, want rows=%d expected=%d reclaimed=%d shortfall=%d",
				row, wantRows, wantExpected, wantReclaimed, wantShortfall)
		}
		if row.Expected != row.Reclaimed+row.Shortfall {
			t.Fatalf("reversal invariant broken: expected=%d reclaimed=%d shortfall=%d",
				row.Expected, row.Reclaimed, row.Shortfall)
		}
	}

	first := refund(3, "invite-reversal-part-1")
	if first.RefundStatus != vip.RefundStatusPartial || first.RefundedTotal != 3 {
		t.Fatalf("first refund=%+v, want partial total=3", first)
	}
	assertReversalTotals(1, 30, 30, 0)

	var walletAfterFirst vip.UserWallet
	if err := db.Where("user_id = ?", scenario.inviterID).First(&walletAfterFirst).Error; err != nil {
		t.Fatal(err)
	}
	replayed := refund(3, "invite-reversal-part-1")
	if replayed.Refund.ID != first.Refund.ID || replayed.RefundedTotal != first.RefundedTotal {
		t.Fatalf("same idempotency key did not replay: first=%+v replay=%+v", first, replayed)
	}
	assertReversalTotals(1, 30, 30, 0)
	var walletAfterReplay vip.UserWallet
	if err := db.Where("user_id = ?", scenario.inviterID).First(&walletAfterReplay).Error; err != nil {
		t.Fatal(err)
	}
	if walletAfterReplay.PermBalanceMicro != walletAfterFirst.PermBalanceMicro {
		t.Fatalf("idempotent replay changed inviter wallet: %d -> %d",
			walletAfterFirst.PermBalanceMicro, walletAfterReplay.PermBalanceMicro)
	}

	second := refund(2, "invite-reversal-part-2")
	if second.RefundStatus != vip.RefundStatusPartial || second.RefundedTotal != 5 {
		t.Fatalf("second refund=%+v, want partial total=5", second)
	}
	assertReversalTotals(2, 50, 50, 0)

	final := refund(0, "invite-reversal-full")
	if final.RefundStatus != vip.RefundStatusFull || final.RefundedTotal != 10 {
		t.Fatalf("final refund=%+v, want full total=10", final)
	}
	assertReversalTotals(3, 100, 100, 0)

	var finalWallet vip.UserWallet
	if err := db.Where("user_id = ?", scenario.inviterID).First(&finalWallet).Error; err != nil {
		t.Fatal(err)
	}
	if finalWallet.PermBalanceMicro != 0 {
		t.Fatalf("full refund inviter wallet=%d, want 0", finalWallet.PermBalanceMicro)
	}
	var refundRows int64
	if err := db.Model(&vip.OrderRefund{}).Where("order_no = ?", scenario.order.OrderNo).
		Count(&refundRows).Error; err != nil {
		t.Fatal(err)
	}
	if refundRows != 3 {
		t.Fatalf("order refund rows=%d, want 3 (same-idem replay must not insert)", refundRows)
	}
}

func TestIntegrationFirstPurchaseRefundNegativeWalletKeepsAuditInvariant(t *testing.T) {
	db := openInviteIntegrationDB(t)
	setIntegrationCampaign(t, db, true, 1000)
	scenario := createFirstPurchaseIntegrationScenario(t, db, "INV-NEG", "FGHJ6789")
	negativeBalance := int64(-5 * vip.MicroCreditPerCredit)
	if err := db.Model(&vip.UserWallet{}).Where("user_id = ?", scenario.inviterID).
		UpdateColumn("perm_balance_micro", negativeBalance).Error; err != nil {
		t.Fatalf("set negative inviter wallet: %v", err)
	}

	if _, err := scenario.vipService.Order().Refund(context.Background(), vip.RefundRequest{
		OrderNo: scenario.order.OrderNo, AmountYuan: 0, Reason: "negative wallet",
		IdempotencyKey: "invite-reversal-negative", OperatorID: 1, OperatorName: "integration",
	}); err != nil {
		t.Fatalf("full refund with negative inviter wallet: %v", err)
	}
	var reversal InviteRewardReversal
	if err := db.Where("grant_id = ?", scenario.grant.ID).First(&reversal).Error; err != nil {
		t.Fatalf("read negative-wallet reversal: %v", err)
	}
	if reversal.ExpectedCredits != 100 || reversal.ReclaimedCredits != 0 || reversal.ShortfallCredits != 100 {
		t.Fatalf("negative-wallet reversal=%+v, want expected=100 reclaimed=0 shortfall=100", reversal)
	}
	if reversal.ExpectedCredits != reversal.ReclaimedCredits+reversal.ShortfallCredits {
		t.Fatalf("negative-wallet invariant broken: %+v", reversal)
	}
	var wallet vip.UserWallet
	if err := db.Where("user_id = ?", scenario.inviterID).First(&wallet).Error; err != nil {
		t.Fatal(err)
	}
	if wallet.PermBalanceMicro != negativeBalance {
		t.Fatalf("negative wallet changed from %d to %d", negativeBalance, wallet.PermBalanceMicro)
	}
}

func TestIntegrationDeleteUserRemovesInviteRewardReversalsFirst(t *testing.T) {
	db := openInviteIntegrationDB(t)
	setIntegrationCampaign(t, db, true, 1000)
	scenario := createFirstPurchaseIntegrationScenario(t, db, "INV-DEL", "JKMN6789")
	if _, err := scenario.vipService.Order().Refund(context.Background(), vip.RefundRequest{
		OrderNo: scenario.order.OrderNo, AmountYuan: 1, Reason: "delete cleanup",
		IdempotencyKey: "invite-reversal-delete", OperatorID: 1, OperatorName: "integration",
	}); err != nil {
		t.Fatalf("create reversal before delete: %v", err)
	}
	var reversalsBefore int64
	if err := db.Model(&InviteRewardReversal{}).Where("grant_id = ?", scenario.grant.ID).
		Count(&reversalsBefore).Error; err != nil || reversalsBefore != 1 {
		t.Fatalf("reversal setup count=%d err=%v", reversalsBefore, err)
	}

	if err := user.NewRepository(db).DeleteUser(scenario.inviterID); err != nil {
		t.Fatalf("delete inviter: %v", err)
	}
	checks := []struct {
		name  string
		model any
		where string
		arg   any
	}{
		{"reversals", &InviteRewardReversal{}, "grant_id = ?", scenario.grant.ID},
		{"grants", &InviteRewardGrant{}, "id = ?", scenario.grant.ID},
		{"milestones", &InviteMilestone{}, "id = ?", scenario.milestone.ID},
		{"registrations", &InviteRegistration{}, "invited_user_id = ?", scenario.inviteeID},
		{"codes", &InviteCode{}, "user_id = ?", scenario.inviterID},
	}
	for _, check := range checks {
		var count int64
		if err := db.Model(check.model).Where(check.where, check.arg).Count(&count).Error; err != nil {
			t.Fatalf("count %s after delete: %v", check.name, err)
		}
		if count != 0 {
			t.Fatalf("%s after delete=%d, want 0", check.name, count)
		}
	}
	var userRows int64
	if err := db.Table("users").Where("id = ?", scenario.inviterID).Count(&userRows).Error; err != nil {
		t.Fatal(err)
	}
	if userRows != 0 {
		t.Fatalf("deleted inviter rows=%d, want 0", userRows)
	}
}

func TestIntegrationManualBindInfersEarliestAuthProviderMethod(t *testing.T) {
	db := openInviteIntegrationDB(t)
	setIntegrationCampaign(t, db, true, 0)
	inviteSvc, _ := inviteIntegrationServices(db)
	now := time.Now().Truncate(time.Second)
	inviter := createIntegrationUser(t, db, "method-inviter", now.Add(-48*time.Hour))
	createIntegrationCode(t, db, inviter, "MNPQ6789", true)

	cases := []struct {
		name      string
		providers []string
		want      string
	}{
		{name: "email", providers: []string{"email"}, want: "email"},
		{name: "phone", providers: []string{"phone", "google"}, want: "phone"},
		{name: "google", providers: []string{"google"}, want: "google"},
	}
	userIDs := []uint{inviter}
	t.Cleanup(func() { cleanupIntegrationUsers(t, db, userIDs...) })
	for index, tc := range cases {
		invitee := createIntegrationUser(t, db, "method-"+tc.name, now.Add(time.Duration(index)*time.Second))
		userIDs = append(userIDs, invitee)
		for providerIndex, provider := range tc.providers {
			createdAt := now.Add(time.Duration(providerIndex) * time.Second)
			if err := db.Create(&user.UserAuthProvider{
				UserID: invitee, Provider: provider,
				ProviderUserID: fmt.Sprintf("%s-%d", provider, invitee), CreatedAt: createdAt,
			}).Error; err != nil {
				t.Fatalf("create %s provider: %v", provider, err)
			}
		}
		if _, err := inviteSvc.Bind("MNPQ6789", invitee, sourceManual, "manual"); err != nil {
			t.Fatalf("manual bind %s: %v", tc.name, err)
		}
		var registration InviteRegistration
		if err := db.Where("invited_user_id = ?", invitee).First(&registration).Error; err != nil {
			t.Fatalf("read %s registration: %v", tc.name, err)
		}
		if registration.Source != sourceManual || registration.Method != tc.want {
			t.Fatalf("%s registration source/method=(%q,%q), want (%q,%q)",
				tc.name, registration.Source, registration.Method, sourceManual, tc.want)
		}
		if registration.Method == "manual" {
			t.Fatalf("%s manual bind persisted method=manual", tc.name)
		}
	}
}
