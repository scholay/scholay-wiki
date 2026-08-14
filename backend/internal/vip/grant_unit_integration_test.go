//go:build integration

// 授予单位(天/自然月/自然年)的端到端断言 —— 直连 compose 的真 MySQL,自造用户。
//
// 为什么必须对真 DB 跑:到期日要经 users.vip_expires_at(DATETIME,无亚秒)往返一次。
// 纯内存断言看不到 MySQL 的秒级进位,而「发 1 个月」与「买 1 个月」只要差 1 秒就是两个日期。
//
// 运行:
//   docker run --rm --network scholar_scholar-network \
//     -v "$PWD":/src -w /src -e CGO_ENABLED=0 \
//     -e BILL_DSN='scholar_user:scholar_pass@tcp(mysql:3306)/scholar?charset=utf8mb4&parseTime=True&loc=Local' \
//     -e BILL_REDIS_HOST=redis golang:1.24 go test -tags integration ./internal/vip/ -run IntegrationGrantUnit -v

package vip

import (
	"context"
	"testing"
	"time"
)

func TestIntegrationGrantUnit(t *testing.T) {
	db := openDB(t)
	initRedis(t)
	svc := NewService(NewRepository(db))
	ctx := context.Background()

	// 读回 users.vip_expires_at(经 DATETIME 往返)
	readExp := func(id uint) time.Time {
		var exp time.Time
		if err := db.Raw("SELECT vip_expires_at FROM users WHERE id = ?", id).Scan(&exp).Error; err != nil {
			t.Fatalf("read expires: %v", err)
		}
		return exp
	}

	// ── admin 直授:天 / 月 / 年 三种单位 ─────────────────────────────────────
	t.Run("AdminGrantUnits", func(t *testing.T) {
		for _, c := range []struct {
			name   string
			unit   string
			amount int
		}{
			{"30天", GrantUnitDay, 30},
			{"1个月", GrantUnitMonth, 1},
			{"3个月", GrantUnitMonth, 3},
			{"1年", GrantUnitYear, 1},
		} {
			t.Run(c.name, func(t *testing.T) {
				id := mkUser(t, db)
				defer cleanup(db, id)

				before := time.Now().Truncate(time.Second)
				exp, err := svc.GrantToUser(id, TierPro, c.amount, c.unit, "")
				if err != nil {
					t.Fatalf("发放失败: %v", err)
				}
				// 期望值用**同一套算术**(AddPeriodN)从授予时刻推 —— 不重写一遍算法,
				// 否则测的是"我又写了一遍"而不是"实现对不对"。容差吸收 now 的推进。
				lo := AddPeriodN(before, c.unit, c.amount)
				hi := AddPeriodN(before.Add(2*time.Minute), c.unit, c.amount)
				if exp.Before(lo) || exp.After(hi) {
					t.Fatalf("到期日 %v 不在 [%v, %v]", exp, lo, hi)
				}
				// 经 DATETIME 往返后仍一致(秒对齐闭合)
				if got := readExp(id); got.Sub(exp).Abs() > time.Second {
					t.Fatalf("落库读回 %v 与返回值 %v 差超过 1s(秒对齐没闭合)", got, exp)
				}
				if ov, _ := svc.GetOverview(ctx, id); ov.Tier != TierPro {
					t.Fatalf("发放后应 pro,得到 %s", ov.Tier)
				}
			})
		}
	})

	// ── 🔴 「发 1 个月」必须等于「买 1 个月」 ────────────────────────────────
	//
	// 两条路以前是两套算术(发放 AddDate(0,0,days) / 购买 AddPeriod 自然月),
	// 同一个用户从两条路拿到的时长不一致是最难解释的一类客诉。
	t.Run("GrantMonthEqualsPurchaseMonth", func(t *testing.T) {
		idGrant := mkUser(t, db)
		defer cleanup(db, idGrant)
		idBuy := mkUser(t, db)
		defer cleanup(db, idBuy)

		// 发放 1 个月
		expGrant, err := svc.GrantToUser(idGrant, TierPro, 1, GrantUnitMonth, "")
		if err != nil {
			t.Fatal(err)
		}
		// 购买 1 个月(月付订阅 + 支付回调履约)
		ord, err := svc.Order().CreateSubscription(idBuy, TierPro, CycleMonthly)
		if err != nil {
			t.Fatal(err)
		}
		if err := svc.Order().ProcessAlipayCallback(ord.OrderNo, "txn-unit", ord.FinalAmount, nil); err != nil {
			t.Fatal(err)
		}
		expBuy := readExp(idBuy)

		// 两者都是「从 now 起 +1 自然月」,只差各自执行时刻的几秒
		if d := expGrant.Sub(expBuy).Abs(); d > 2*time.Minute {
			t.Fatalf("发 1 个月(%v)与买 1 个月(%v)相差 %v —— 两条路算术不一致", expGrant, expBuy, d)
		}
	})

	// ── 兑换码:按月发放 ─────────────────────────────────────────────────────
	t.Run("RedeemCodeMonthUnit", func(t *testing.T) {
		id := mkUser(t, db)
		defer cleanup(db, id)

		codes, err := svc.GenerateCodes(GenerateCodesInput{
			Count: 1, GrantKind: GrantKindTier, Tier: TierPro,
			GrantDays: 1, GrantUnit: GrantUnitMonth, MaxUses: 1,
		}, nil)
		if err != nil {
			t.Fatalf("发码失败: %v", err)
		}
		if len(codes) != 1 {
			t.Fatalf("应生成 1 张码,得到 %d", len(codes))
		}
		defer db.Exec("DELETE FROM vip_code_redemptions WHERE user_id = ?", id)
		defer db.Exec("DELETE FROM vip_redemption_codes WHERE code = ?", codes[0])

		before := time.Now().Truncate(time.Second)
		res, err := svc.Redeem(ctx, id, codes[0])
		if err != nil {
			t.Fatalf("兑换失败: %v", err)
		}
		if res.ExpiresAt == nil {
			t.Fatal("兑换结果应带到期日")
		}
		lo := AddPeriodN(before, GrantUnitMonth, 1)
		hi := AddPeriodN(before.Add(2*time.Minute), GrantUnitMonth, 1)
		if res.ExpiresAt.Before(lo) || res.ExpiresAt.After(hi) {
			t.Fatalf("兑换 1 个月的到期日 %v 不在 [%v, %v] —— 可能退化成了 1 天",
				*res.ExpiresAt, lo, hi)
		}
		// 🔴 1 个月的码必须够得上额度窗口(refillEligible 的折算回归):
		// 改造前判据是裸比 grant_days(=1) < 7,会静默不给满血。
		if !res.refillEligible {
			t.Fatal("1 个月的码应满足额度满血资格(GrantDurationDays 折算),得到 false")
		}
	})

	// ── 存量码(grant_unit 为空)语义仍是「天」 ──────────────────────────────
	t.Run("LegacyCodeStillMeansDays", func(t *testing.T) {
		id := mkUser(t, db)
		defer cleanup(db, id)

		codes, err := svc.GenerateCodes(GenerateCodesInput{
			Count: 1, GrantKind: GrantKindTier, Tier: TierPro, GrantDays: 30, MaxUses: 1,
		}, nil)
		if err != nil {
			t.Fatal(err)
		}
		code := codes[0]
		defer db.Exec("DELETE FROM vip_code_redemptions WHERE user_id = ?", id)
		defer db.Exec("DELETE FROM vip_redemption_codes WHERE code = ?", code)
		// 手工抹成空串,模拟迁移前就存在的老行
		if err := db.Exec("UPDATE vip_redemption_codes SET grant_unit = '' WHERE code = ?", code).Error; err != nil {
			t.Fatal(err)
		}

		before := time.Now().Truncate(time.Second)
		res, err := svc.Redeem(ctx, id, code)
		if err != nil {
			t.Fatalf("兑换存量码失败: %v", err)
		}
		lo := before.AddDate(0, 0, 30)
		hi := before.Add(2 * time.Minute).AddDate(0, 0, 30)
		if res.ExpiresAt.Before(lo) || res.ExpiresAt.After(hi) {
			t.Fatalf("存量码(空单位)应按 30 **天** 发放,得到 %v,期望 [%v,%v]", *res.ExpiresAt, lo, hi)
		}
	})
}
