//go:build integration

// 计费体系全链路集成测试 —— 直连 compose 的 MySQL + Redis(service 层, 不经 HTTP)。
//
// 覆盖:会员生效 / 失效 / 续费续期(自然月·年)/ 不降级 / 经费 / 重置次数(最近到期优先·用尽)/
// 重置 / 过 0 点(日 key 滚动)/ 充值入账 / 幂等。
// 0090 起:订阅不再赠送经费、临时经费退休、重置只扣次数 —— 相关断言已按新模型重写。
//
// 运行(连 compose 网络):
//   docker run --rm --network scholar_scholar-network \
//     -v "$PWD":/src -w /src -e CGO_ENABLED=0 \
//     -e BILL_DSN='scholar_user:scholar_pass@tcp(mysql:3306)/scholar?charset=utf8mb4&parseTime=True&loc=Local' \
//     -e BILL_REDIS_HOST=redis golang:1.21 go test -tags integration ./internal/vip/ -run Integration -v

package vip

import (
	"context"
	"errors"
	"fmt"
	"math"
	"os"
	"testing"
	"time"

	"scholar-backend/internal/common/cache"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
)

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func openDB(t *testing.T) *gorm.DB {
	dsn := env("BILL_DSN", "scholar_user:scholar_pass@tcp(mysql:3306)/scholar?charset=utf8mb4&parseTime=True&loc=Local")
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	return db
}

func initRedis(t *testing.T) {
	if cache.GetRedis() != nil {
		return
	}
	if err := cache.InitRedis(env("BILL_REDIS_HOST", "redis"), env("BILL_REDIS_PORT", "6379"), "", 0); err != nil {
		t.Fatalf("init redis: %v", err)
	}
}

func mkUser(t *testing.T, db *gorm.DB) uint {
	email := fmt.Sprintf("e2e-%d@test.local", time.Now().UnixNano())
	if err := db.Exec(
		"INSERT INTO users (username, email, password_hash, role, status, vip_tier) VALUES (?,?,?,?,?,?)",
		email, email, "", "user", 1, "free", // status tinyint: 1=active
	).Error; err != nil {
		t.Fatalf("insert user: %v", err)
	}
	var id uint
	if err := db.Raw("SELECT id FROM users WHERE email = ?", email).Scan(&id).Error; err != nil || id == 0 {
		t.Fatalf("get user id: %v (id=%d)", err, id)
	}
	return id
}

func cleanup(db *gorm.DB, id uint) {
	db.Exec("DELETE FROM credit_temp_lots WHERE user_id = ?", id)
	db.Exec("DELETE FROM credit_reset_passes WHERE user_id = ?", id)
	db.Exec("DELETE FROM credit_transactions WHERE user_id = ?", id)
	db.Exec("DELETE FROM orders WHERE user_id = ?", id)
	db.Exec("DELETE FROM user_wallets WHERE user_id = ?", id)
	db.Exec("DELETE FROM users WHERE id = ?", id)
}

func TestIntegrationBilling(t *testing.T) {
	db := openDB(t)
	initRedis(t)
	svc := NewService(NewRepository(db))
	cfg := svc.Config().Get()
	ctx := context.Background()

	freeCeil := cfg.WindowCeiling(TierFree)
	proCeil := cfg.WindowCeiling(TierPro)
	maxCeil := cfg.WindowCeiling(TierMax)
	// 0090:订阅不再赠送经费,GrantCreditsFor 已删;重置改扣「重置次数」,resetCost 不再参与判定。
	t.Logf("config: freeCeil=%d proCeil=%d maxCeil=%d", freeCeil, proCeil, maxCeil)

	// ── 会员生效 / 幂等 / 续费顺延 / 不降级 / 失效 ──────────────────────────────
	t.Run("Membership", func(t *testing.T) {
		id := mkUser(t, db)
		defer cleanup(db, id)

		// 初始 free
		ov, err := svc.GetOverview(ctx, id)
		if err != nil {
			t.Fatal(err)
		}
		if ov.Tier != TierFree || ov.Token.Ceiling != freeCeil {
			t.Fatalf("初始应 free: tier=%s ceil=%d", ov.Tier, ov.Token.Ceiling)
		}

		// 订阅 pro → 支付回调履约:会员生效(0090:订阅不再赠送任何经费)
		ord, err := svc.Order().CreateSubscription(id, TierPro, CycleMonthly)
		if err != nil {
			t.Fatal(err)
		}
		if err := svc.Order().ProcessAlipayCallback(ord.OrderNo, "txn-1", ord.FinalAmount, nil); err != nil {
			t.Fatalf("fulfill: %v", err)
		}
		ov, _ = svc.GetOverview(ctx, id)
		if ov.Tier != TierPro || ov.Token.Ceiling != proCeil {
			t.Fatalf("订阅后应 pro: tier=%s ceil=%d", ov.Tier, ov.Token.Ceiling)
		}
		// 0090:订阅不赠送经费 —— 履约后经费余额必须**纹丝不动**(这是 B 项的核心断言)。
		if ov.Credit.Total != 0 {
			t.Fatalf("订阅不应赠送任何经费, 得到 total=%v", ov.Credit.Total)
		}
		exp1 := ov.ExpiresAt

		// 幂等:重复回调不重复入账
		_ = svc.Order().ProcessAlipayCallback(ord.OrderNo, "txn-1", ord.FinalAmount, nil)
		ov, _ = svc.GetOverview(ctx, id)
		if ov.Credit.Total != 0 {
			t.Fatalf("幂等失败:重复回调后经费=%v want 0", ov.Credit.Total)
		}

		// 续费:再订阅 pro → 到期顺延(同样不赠经费)
		ord2, _ := svc.Order().CreateSubscription(id, TierPro, CycleMonthly)
		if err := svc.Order().ProcessAlipayCallback(ord2.OrderNo, "txn-2", ord2.FinalAmount, nil); err != nil {
			t.Fatal(err)
		}
		ov, _ = svc.GetOverview(ctx, id)
		if ov.ExpiresAt == nil || exp1 == nil || !ov.ExpiresAt.After(*exp1) {
			t.Fatalf("续费应顺延: exp1=%v exp2=%v", exp1, ov.ExpiresAt)
		}
		if ov.Credit.Total != 0 {
			t.Fatalf("续费同样不赠送经费, 得到 total=%v", ov.Credit.Total)
		}

		// 升级 max
		ordM, _ := svc.Order().CreateSubscription(id, TierMax, CycleMonthly)
		_ = svc.Order().ProcessAlipayCallback(ordM.OrderNo, "txn-3", ordM.FinalAmount, nil)
		if svc.EffectiveTier(id) != TierMax {
			t.Fatalf("应升级 max")
		}
		// 不降级:再给一张 pro(admin 直授)→ 仍 max
		if _, err := svc.GrantToUser(id, TierPro, 30, ""); err != nil {
			t.Fatal(err)
		}
		if svc.EffectiveTier(id) != TierMax {
			t.Fatalf("max 不应被 pro 降级")
		}

		// 失效:到期时间设为过去 → 回 free
		if err := db.Exec("UPDATE users SET vip_expires_at = ? WHERE id = ?", time.Now().Add(-time.Hour), id).Error; err != nil {
			t.Fatal(err)
		}
		ov, _ = svc.GetOverview(ctx, id)
		if ov.Tier != TierFree || ov.Token.Ceiling != freeCeil {
			t.Fatalf("过期应回 free: tier=%s ceil=%d", ov.Tier, ov.Token.Ceiling)
		}
	})

	// ── 年度订阅(0079):年价开通 + 365 天 + vip_cycle 标识 + 经费按月 12 批 ────────
	t.Run("YearlySubscription", func(t *testing.T) {
		id := mkUser(t, db)
		defer cleanup(db, id)

		if cfg.PriceCentsFor(TierPro, CycleYearly) <= 0 {
			t.Skip("年付未配置(pro_year_price_cents<=0), 跳过")
		}

		ord, err := svc.Order().CreateSubscription(id, TierPro, CycleYearly)
		if err != nil {
			t.Fatal(err)
		}
		if ord.BillingCycle != CycleYearly || ord.PlanName != "Pro · 年度订阅" {
			t.Fatalf("年度单标识: cycle=%s name=%s", ord.BillingCycle, ord.PlanName)
		}
		if err := svc.Order().ProcessAlipayCallback(ord.OrderNo, "txn-y1", ord.FinalAmount, nil); err != nil {
			t.Fatalf("fulfill: %v", err)
		}

		ov, _ := svc.GetOverview(ctx, id)
		if ov.Tier != TierPro || ov.Cycle != CycleYearly {
			t.Fatalf("年费标识: tier=%s cycle=%s", ov.Tier, ov.Cycle)
		}
		// 0090:年度 = +1 个**自然年**(不再是 365 天)。用 AddPeriod 算期望值,
		// 而不是 AddDate(0,0,365) —— 后者在大多数基准日上恰好相等,写成那样等于没测。
		if wantExp := AddPeriod(time.Now(), CycleYearly); ov.ExpiresAt == nil ||
			ov.ExpiresAt.Before(wantExp.Add(-2*time.Minute)) || ov.ExpiresAt.After(wantExp.Add(2*time.Minute)) {
			t.Fatalf("年度到期应为 +1 自然年(≈%v): %v", wantExp, ov.ExpiresAt)
		}

		// 0090:订阅不赠送经费 —— 原先这里断言「12 批临时经费」,整段改成断言**一批都没有**。
		var lotCount int64
		db.Table("credit_temp_lots").Where("user_id = ?", id).Count(&lotCount)
		if lotCount != 0 {
			t.Fatalf("订阅不应产生任何临时经费批次, 得到 %d 批(临时经费链路已退休)", lotCount)
		}
		if ov.Credit.Total != 0 {
			t.Fatalf("年度订阅不应赠送经费, 得到 total=%v", ov.Credit.Total)
		}

		// 幂等:重复回调不重复入账。
		_ = svc.Order().ProcessAlipayCallback(ord.OrderNo, "txn-y1", ord.FinalAmount, nil)
		db.Table("credit_temp_lots").Where("user_id = ?", id).Count(&lotCount)
		if lotCount != 0 {
			t.Fatalf("幂等失败: 重复回调后临时批次=%d", lotCount)
		}

		// 年费用户按月续一个月 → 到期 +30 天、周期标识转回月度(最近一单为准)。
		ordM, err := svc.Order().CreateSubscription(id, TierPro, CycleMonthly)
		if err != nil {
			t.Fatal(err)
		}
		if err := svc.Order().ProcessAlipayCallback(ordM.OrderNo, "txn-y2", ordM.FinalAmount, nil); err != nil {
			t.Fatal(err)
		}
		ov2, _ := svc.GetOverview(ctx, id)
		if ov2.Cycle != CycleMonthly {
			t.Fatalf("按月续期后周期标识应回 monthly: %s", ov2.Cycle)
		}
		if ov2.ExpiresAt == nil || !ov2.ExpiresAt.After(*ov.ExpiresAt) {
			t.Fatalf("按月续期应顺延: %v → %v", ov.ExpiresAt, ov2.ExpiresAt)
		}
	})

	// ── 经费(0090 起只剩一种)+ 重置次数 ──────────────────────────────────────
	t.Run("Wallet", func(t *testing.T) {
		id := mkUser(t, db)
		defer cleanup(db, id)
		w := svc.Wallet()

		if err := w.GrantPerm(id, 100, SourceRecharge, "t", TxRecharge, ""); err != nil {
			t.Fatal(err)
		}
		bal, _ := w.Balance(id, cfg)
		if bal.Perm != 100 || bal.Total != 100 || bal.PermMicro != 100*MicroCreditPerCredit {
			t.Fatalf("余额 perm=%v total=%v micro=%d want 100/100/1e8", bal.Perm, bal.Total, bal.PermMicro)
		}

		if err := w.Consume(id, 60, TxAdminAdjust, "admin", "x", ""); err != nil {
			t.Fatalf("consume: %v", err)
		}
		if bal, _ = w.Balance(id, cfg); bal.Perm != 40 || bal.Total != 40 {
			t.Fatalf("扣减后 perm=%v total=%v want 40/40", bal.Perm, bal.Total)
		}

		// 0094:按量扣减必须能扣**小数**经费 —— 整数余额装不下单次调用的量级,这是整个改造的起点。
		// 0095 起 credit_to_points=3:500 微元 → ceil(500×1000/3) = 166667 micro-credit
		// ≈ 0.1667 经费,余 ≈ 39.8333(旧断言按兑换率 5 硬编码 39.9,已过时)。
		// 期望值按**当前配置**经 MicroCreditForCost 换算(与被测路径同一换算函数;
		// 不整除的兑换率会产生无限小数,浮点比较必须留容差)。
		if err := w.ConsumeForQuota(id, 500, cfg); err != nil {
			t.Fatalf("按量扣减失败: %v", err)
		}
		wantPerm := 40 - float64(cfg.MicroCreditForCost(500))/float64(MicroCreditPerCredit)
		if bal, _ = w.Balance(id, cfg); math.Abs(bal.Perm-wantPerm) > 1e-9 {
			t.Fatalf("500 微元按量扣减后余 %v want %v(credit_to_points=%d)", bal.Perm, wantPerm, cfg.CreditToPoints)
		}
		if err := w.Consume(id, 999, TxAdminAdjust, "admin", "x", ""); err == nil {
			t.Fatalf("超额消耗应失败")
		}
	})

	// ── 重置次数:批次可用性 / 最近到期优先 / 用尽 ────────────────────────────
	t.Run("ResetPasses", func(t *testing.T) {
		id := mkUser(t, db)
		defer cleanup(db, id)
		w := svc.Wallet()
		now := time.Now()

		mkPass := func(n int, startsIn, expiresIn time.Duration) {
			if err := db.Create(&CreditResetPass{
				UserID: id, CountInitial: n, CountRemaining: n, Source: "test", Ref: "t",
				StartsAt: now.Add(startsIn).Truncate(time.Second), ExpiresAt: now.Add(expiresIn),
			}).Error; err != nil {
				t.Fatal(err)
			}
		}
		mkPass(2, 0, 72*time.Hour)             // 可用,较晚到期
		mkPass(1, 0, 24*time.Hour)             // 可用,**最近到期** → 应先扣
		mkPass(5, 0, -time.Hour)               // 已过期 → 不计入
		mkPass(7, 48*time.Hour, 96*time.Hour)  // 未生效 → 不计入

		v, err := w.ResetPasses(id)
		if err != nil {
			t.Fatal(err)
		}
		if v.Total != 3 {
			t.Fatalf("可用次数=%d want 3(过期与未生效批次都不该计入)", v.Total)
		}

        // 最近到期优先:第一次扣应打在 24h 那批上。
		if err := w.ConsumeResetPass(id); err != nil {
			t.Fatalf("consume pass: %v", err)
		}
		var near CreditResetPass
		if err := db.Where("user_id = ? AND expires_at < ?", id, now.Add(48*time.Hour)).
			Where("expires_at > ?", now).First(&near).Error; err != nil {
			t.Fatal(err)
		}
		if near.CountRemaining != 0 {
			t.Fatalf("应先扣最近到期的批次, 它还剩 %d", near.CountRemaining)
		}

		// 扣光可用的 3 次后必须报 ErrNoResetPass —— 绝不能回落去扣经费。
		if err := w.GrantPerm(id, 10000, SourceRecharge, "t", TxRecharge, ""); err != nil {
			t.Fatal(err)
		}
		for i := 0; i < 2; i++ {
			if err := w.ConsumeResetPass(id); err != nil {
				t.Fatalf("第 %d 次扣减失败: %v", i+2, err)
			}
		}
		if err := w.ConsumeResetPass(id); !errors.Is(err, ErrNoResetPass) {
			t.Fatalf("次数用尽应回 ErrNoResetPass, 得到 %v(有经费也不能回落扣经费)", err)
		}
		if bal, _ := w.Balance(id, cfg); bal.Perm != 10000 {
			t.Fatalf("重置次数消耗绝不能碰经费, perm=%v want 10000", bal.Perm)
		}
	})

	// ── 额度重置 / 经费不足 / 锚定窗口(P4)────────────────────────────────────
	t.Run("QuotaReset", func(t *testing.T) {
		id := mkUser(t, db)
		defer cleanup(db, id)
		_ = cache.GetRedisPersist().Del(ctx, anchorKey(id)).Err()

		// 未超限时重置 = 无需操作直接成功(resetNotNeeded 护栏,防升级瞬间白扣),不扣费。
		svc.AddUsage(ctx, id, 1234)
		w := svc.loadWindow(ctx, id)
		if w.anchor <= 0 {
			t.Fatalf("首次 AddUsage 应开锚")
		}
		if w.used != 1234 {
			t.Fatalf("AddUsage 后 used=%d want 1234", w.used)
		}
		if _, err := svc.ResetQuota(ctx, id); err != nil {
			t.Fatalf("未超限重置应为无害 no-op: %v", err)
		}

		// 烧到超过 Free 窗口上限 → 重置才「需要」;此时无重置次数 → ErrNoResetPass。
		// ⚠️ 断言具体错误而不是 err != nil:改造前这条是「无经费」,用 err==nil 判会在
		//    「也没次数」时歪打正着继续通过,掩盖掉扣费口径其实没切过来。
		overCeil := int(freeCeil) + 1000
		svc.AddUsage(ctx, id, overCeil)
		if _, err := svc.ResetQuota(ctx, id); !errors.Is(err, ErrNoResetPass) {
			t.Fatalf("超限且无重置次数应回 ErrNoResetPass, 得到 %v", err)
		}
		wantUsed := int64(1234 + overCeil)
		// 用量未变(失败不清计数)
		if w = svc.loadWindow(ctx, id); w.used != wantUsed {
			t.Fatalf("重置失败后 used 不应变: %d want %d", w.used, wantUsed)
		}

		// 0090:给的是**重置次数**不是经费 —— 顺带守住「经费买不到重置」。
		if err := svc.Wallet().GrantPerm(id, 100000, SourceRecharge, "t", TxRecharge, ""); err != nil {
			t.Fatal(err)
		}
		if _, err := svc.ResetQuota(ctx, id); !errors.Is(err, ErrNoResetPass) {
			t.Fatalf("光有经费不该能重置, 得到 %v", err)
		}
		if err := db.Create(&CreditResetPass{
			UserID: id, CountInitial: 1, CountRemaining: 1, Source: "test", Ref: "t",
			StartsAt: time.Now().Add(-time.Minute).Truncate(time.Second),
			ExpiresAt: time.Now().Add(24 * time.Hour),
		}).Error; err != nil {
			t.Fatal(err)
		}
		res, err := svc.ResetQuota(ctx, id)
		if err != nil {
			t.Fatalf("reset: %v", err)
		}
		if res.Used != 0 {
			t.Fatalf("重置后窗口 used=%d want 0", res.Used)
		}
		_ = wantUsed // R5 新语义下不再断言旧 used 保留(真实统计走 consumed_today + 账本)
		// R5 关键:手动重置 = **换锚到 now**(7 天从当前重开),新窗口 used/base 天然归零 = 满血。
		anchorBefore := w.anchor
		if w = svc.loadWindow(ctx, id); w.anchor == anchorBefore {
			t.Fatalf("R5 手动重置应换锚: anchor 未变仍为 %d", w.anchor)
		}
		if w.used != 0 || w.windowUsed() != 0 {
			t.Fatalf("重置后新窗口应满血归零: used=%d windowUsed=%d", w.used, w.windowUsed())
		}
		// 0090 核心:重置扣的是**次数**,经费必须一分未动。
		if bal, _ := svc.Wallet().Balance(id, cfg); bal.Total != 100000 {
			t.Fatalf("重置不得扣经费, 余 %v want 100000", bal.Total)
		}
		if v, _ := svc.Wallet().ResetPasses(id); v.Total != 0 {
			t.Fatalf("重置应扣掉那 1 次, 剩余 %d want 0", v.Total)
		}

		// 重置后再消耗:新窗口从 0 起算累加。
		svc.AddUsage(ctx, id, 500)
		if w = svc.loadWindow(ctx, id); w.used != 500 {
			t.Fatalf("重置后新窗口应从 0 累加: used=%d want 500", w.used)
		}
		if win := w.windowUsed(); win != 500 {
			t.Fatalf("重置后窗口应从 0 起算: window=%d want 500", win)
		}
		anchorAfterReset := w.anchor
		// 到期语义:把 anchor 改成 8 天前 → 读路径视为无窗口(满血),不写 anchor。
		_ = cache.GetRedisPersist().Set(ctx, anchorKey(id), time.Now().Add(-8*24*time.Hour).Unix(), time.Hour).Err()
		if w = svc.loadWindow(ctx, id); w.anchor != 0 || w.windowUsed() != 0 {
			t.Fatalf("过期窗口应满血: anchor=%d used=%d", w.anchor, w.windowUsed())
		}
		// 再消耗 → 重新开锚,新窗口从 0 起算。
		// sleep 1.1s:anchor 是 unix 秒,测试内首锚与换锚同秒会撞同一 used key(真实世界锚差 7 天,无此问题)。
		time.Sleep(1100 * time.Millisecond)
		svc.AddUsage(ctx, id, 300)
		if w = svc.loadWindow(ctx, id); w.anchor == anchorAfterReset || w.used != 300 {
			t.Fatalf("到期后应换锚重新累计: anchor=%d used=%d", w.anchor, w.used)
		}
	})

	// ── 充值入账(永久)+ 幂等 ─────────────────────────────────────────────────
	t.Run("Recharge", func(t *testing.T) {
		id := mkUser(t, db)
		defer cleanup(db, id)

		ord, err := svc.Order().CreateRecharge(id, 2000) // ¥20
		if err != nil {
			t.Fatal(err)
		}
		wantCredits := cfg.RechargeCreditsFor(2000)
		if ord.CreditsGranted != wantCredits {
			t.Fatalf("订单到账经费=%d want %d", ord.CreditsGranted, wantCredits)
		}
		if err := svc.Order().ProcessWeChatPayCallback(ord.OrderNo, "wx-1", ord.FinalAmount, nil); err != nil {
			t.Fatalf("recharge fulfill: %v", err)
		}
		bal, _ := svc.Wallet().Balance(id, cfg)
		if bal.Perm != float64(wantCredits) {
			t.Fatalf("充值入账经费=%v want %d", bal.Perm, wantCredits)
		}
		// 幂等
		_ = svc.Order().ProcessWeChatPayCallback(ord.OrderNo, "wx-1", ord.FinalAmount, nil)
		bal, _ = svc.Wallet().Balance(id, cfg)
		if bal.Perm != float64(wantCredits) {
			t.Fatalf("充值幂等失败: perm=%v want %d", bal.Perm, wantCredits)
		}
	})
}
