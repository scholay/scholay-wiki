//go:build integration

// 计费体系全链路集成测试 —— 直连 compose 的 MySQL + Redis(service 层, 不经 HTTP)。
//
// 覆盖用户要求的全部场景:会员生效 / 失效 / 续费续期 / 不降级 / 临时经费 / 永久经费 /
// 消耗顺序 / 临时过期 / 重置 / 经费不足 / 过 0 点(日 key 滚动)/ 充值入账 / 订阅赠经费 / 幂等。
//
// 运行(连 compose 网络):
//   docker run --rm --network scholar_scholar-network \
//     -v "$PWD":/src -w /src -e CGO_ENABLED=0 \
//     -e BILL_DSN='scholar_user:scholar_pass@tcp(mysql:3306)/scholar?charset=utf8mb4&parseTime=True&loc=Local' \
//     -e BILL_REDIS_HOST=redis golang:1.21 go test -tags integration ./internal/vip/ -run Integration -v

package vip

import (
	"context"
	"fmt"
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
	proGrant := cfg.GrantCreditsFor(TierPro)
	resetCost := cfg.ResetCostCredits
	t.Logf("config: freeCeil=%d proCeil=%d maxCeil=%d proGrant=%d resetCost=%d",
		freeCeil, proCeil, maxCeil, proGrant, resetCost)

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

		// 订阅 pro → 支付回调履约:会员生效 + 赠临时经费
		ord, err := svc.Order().CreateSubscription(id, TierPro)
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
		if ov.Credit.Temp != proGrant {
			t.Fatalf("赠临时经费=%d want %d", ov.Credit.Temp, proGrant)
		}
		exp1 := ov.ExpiresAt

		// 幂等:重复回调不重复入账
		_ = svc.Order().ProcessAlipayCallback(ord.OrderNo, "txn-1", ord.FinalAmount, nil)
		ov, _ = svc.GetOverview(ctx, id)
		if ov.Credit.Temp != proGrant {
			t.Fatalf("幂等失败:重复回调后 temp=%d want %d", ov.Credit.Temp, proGrant)
		}

		// 续费:再订阅 pro → 到期顺延 + 再赠一笔经费
		ord2, _ := svc.Order().CreateSubscription(id, TierPro)
		if err := svc.Order().ProcessAlipayCallback(ord2.OrderNo, "txn-2", ord2.FinalAmount, nil); err != nil {
			t.Fatal(err)
		}
		ov, _ = svc.GetOverview(ctx, id)
		if ov.ExpiresAt == nil || exp1 == nil || !ov.ExpiresAt.After(*exp1) {
			t.Fatalf("续费应顺延: exp1=%v exp2=%v", exp1, ov.ExpiresAt)
		}
		// 续费赠费走 GrantStartsAt 预发放(下一周期才生效,order.go):可用余额仍是本期的一笔,
		// 第二笔在库但 StartsAt 未到不计入(Balance 只算 active lots)。
		if ov.Credit.Temp != proGrant {
			t.Fatalf("续费赠费为预发放, 可用 temp=%d want %d(下一周期批次未生效)", ov.Credit.Temp, proGrant)
		}

		// 升级 max
		ordM, _ := svc.Order().CreateSubscription(id, TierMax)
		_ = svc.Order().ProcessAlipayCallback(ordM.OrderNo, "txn-3", ordM.FinalAmount, nil)
		if svc.EffectiveTier(id) != TierMax {
			t.Fatalf("应升级 max")
		}
		// 不降级:再给一张 pro(admin 直授)→ 仍 max
		if _, err := svc.GrantToUser(id, TierPro, 30); err != nil {
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

	// ── 临时 / 永久经费 / 消耗顺序 / 临时过期 ────────────────────────────────────
	t.Run("Wallet", func(t *testing.T) {
		id := mkUser(t, db)
		defer cleanup(db, id)
		w := svc.Wallet()

		// 永久 100
		if err := w.GrantPerm(id, 100, SourceRecharge, "t", TxRecharge); err != nil {
			t.Fatal(err)
		}
		// 临时 50(7 天后到期)
		if err := w.GrantTemp(id, 50, SourceGift, "t", time.Now().AddDate(0, 0, 7), TxGift); err != nil {
			t.Fatal(err)
		}
		bal, _ := w.Balance(id)
		if bal.Perm != 100 || bal.Temp != 50 || bal.Total != 150 {
			t.Fatalf("余额 perm=%d temp=%d total=%d", bal.Perm, bal.Temp, bal.Total)
		}

		// 消耗 60:应先扣临时 50, 再扣永久 10
		if err := w.Consume(id, 60, TxResetConsume, "reset", "x", ""); err != nil {
			t.Fatalf("consume: %v", err)
		}
		bal, _ = w.Balance(id)
		if bal.Temp != 0 || bal.Perm != 90 {
			t.Fatalf("消耗顺序错: temp=%d perm=%d want temp=0 perm=90", bal.Temp, bal.Perm)
		}

		// 临时过期:发一笔已过期的临时经费 → 不计入余额
		if err := w.GrantTemp(id, 30, SourceGift, "t", time.Now().Add(-time.Hour), TxGift); err != nil {
			t.Fatal(err)
		}
		bal, _ = w.Balance(id)
		if bal.Temp != 0 {
			t.Fatalf("过期临时经费不应计入: temp=%d", bal.Temp)
		}

		// 经费不足
		if err := w.Consume(id, 999, TxResetConsume, "reset", "x", ""); err == nil {
			t.Fatalf("超额消耗应失败")
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

		// 烧到超过 Free 窗口上限 → 重置才「需要」;此时无经费 → ErrInsufficientCredit。
		overCeil := int(freeCeil) + 1000
		svc.AddUsage(ctx, id, overCeil)
		if _, err := svc.ResetQuota(ctx, id); err == nil {
			t.Fatalf("超限且无经费应无法重置")
		}
		wantUsed := int64(1234 + overCeil)
		// 用量未变(失败不清计数)
		if w = svc.loadWindow(ctx, id); w.used != wantUsed {
			t.Fatalf("重置失败后 used 不应变: %d want %d", w.used, wantUsed)
		}

		// 给够经费 → 重置成功:扣经费 + 窗口清零
		if err := svc.Wallet().GrantPerm(id, resetCost+10, SourceRecharge, "t", TxRecharge); err != nil {
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
		if bal, _ := svc.Wallet().Balance(id); bal.Total != 10 {
			t.Fatalf("重置应扣 %d 经费, 余 %d want 10", resetCost, bal.Total)
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
		bal, _ := svc.Wallet().Balance(id)
		if bal.Perm != wantCredits {
			t.Fatalf("充值入账永久经费=%d want %d", bal.Perm, wantCredits)
		}
		// 幂等
		_ = svc.Order().ProcessWeChatPayCallback(ord.OrderNo, "wx-1", ord.FinalAmount, nil)
		bal, _ = svc.Wallet().Balance(id)
		if bal.Perm != wantCredits {
			t.Fatalf("充值幂等失败: perm=%d want %d", bal.Perm, wantCredits)
		}
	})
}
