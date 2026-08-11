package vip

import (
	"errors"
	"math"
	"testing"
	"time"
)

// 订阅动作矩阵 —— 产品拍板的 5 个场景(2026-08-12),逐格钉死金额、周期与到期日。
//
// 现网价目(config.go DefaultBillingConfig,与本机 /billing/plans 实测一致):
//     Pro 月 ¥59   Pro 年 ¥590
//     Max 月 ¥269  Max 年 ¥2690
//
// 场景与允许的动作:
//   ① free            → 新购 Pro/Max × 月/年
//   ② pro 月          → 升级 Max月(原地补差) / 升级 Max年(整年,叠加) ; 续费 Pro月 / Pro年
//   ③ pro 年          → 升级 Max(原地补差,年基准)               ; 续费 Pro年(**不可按月**)
//   ④ max 月          → 无升级                                   ; 续费 Max月 / Max年
//   ⑤ max 年          → 无升级                                   ; 续费 Max年(**不可按月**)
//
// 🔴 这些断言是**金额**断言。改动 computeSubscription 让本文件变红时,先确认新数字是产品
//    要的价钱,再改期望值 —— 不要为了让测试过而反推期望。
func matrixCfg() *BillingConfig {
	return &BillingConfig{
		ProPriceCents: 5900, MaxPriceCents: 26900,
		ProYearPriceCents: 59000, MaxYearPriceCents: 269000,
	}
}

// ─── 场景 ①:free 新购 ───────────────────────────────────────────────────────

func TestMatrixFreeNew(t *testing.T) {
	cfg := matrixCfg()
	now := tm("2026-08-12 10:00:00")

	cases := []struct {
		tier, cycle string
		wantCents   int
		wantExpires time.Time
	}{
		{TierPro, CycleMonthly, 5900, tm("2026-09-12 10:00:00")},
		{TierPro, CycleYearly, 59000, tm("2027-08-12 10:00:00")},
		{TierMax, CycleMonthly, 26900, tm("2026-09-12 10:00:00")},
		{TierMax, CycleYearly, 269000, tm("2027-08-12 10:00:00")},
	}
	for _, c := range cases {
		sp, err := computeSubscription(UserVIP{}, c.tier, c.cycle, cfg, now)
		if err != nil {
			t.Fatalf("%s/%s: %v", c.tier, c.cycle, err)
		}
		if sp.Action != "new" || sp.Cycle != c.cycle || sp.AmountCents != c.wantCents {
			t.Fatalf("%s/%s: got %+v want new/%s/%d", c.tier, c.cycle, sp, c.cycle, c.wantCents)
		}
		if !sp.NewExpires.Equal(c.wantExpires) {
			t.Fatalf("%s/%s expires=%v want %v", c.tier, c.cycle, sp.NewExpires, c.wantExpires)
		}
	}
}

// ─── 场景 ②:pro 月 ─────────────────────────────────────────────────────────

func TestMatrixProMonthly(t *testing.T) {
	cfg := matrixCfg()
	now := tm("2026-08-12 10:00:00")
	exp := tm("2026-08-27 10:00:00") // 还剩 15 天
	uv := UserVIP{VIPTier: TierPro, VIPExpiresAt: ptr(exp), VIPCycle: CycleMonthly}

	// 升级 → Max 月:原地补差,到期日不变、周期不变。
	sp, err := computeSubscription(uv, TierMax, CycleMonthly, cfg, now)
	if err != nil {
		t.Fatal(err)
	}
	wantDiff := int(math.Round(float64(26900-5900) * 15.0 / 30.0)) // ¥105.00
	if sp.Action != "upgrade" || sp.Cycle != CycleMonthly || sp.AmountCents != wantDiff {
		t.Fatalf("pro月→Max月: %+v want upgrade/monthly/%d", sp, wantDiff)
	}
	if !sp.NewExpires.Equal(exp) {
		t.Fatalf("原地补差不得改动到期日: got %v want %v", sp.NewExpires, exp)
	}

	// 升级 → Max 年:一单买到「更高档 + 整年」。整年全价,到期日 = 原到期日 + 1 自然年。
	// 🔴 这一格是本次新增能力。改动前后端把请求的 cycle 丢掉,永远只会返回上面那个补差价 ——
	//    弹窗展示年付价、实扣补差价,正是用户报的「价格对不上」。
	sp, err = computeSubscription(uv, TierMax, CycleYearly, cfg, now)
	if err != nil {
		t.Fatal(err)
	}
	if sp.Action != "switch" || sp.Cycle != CycleYearly || sp.AmountCents != 269000 {
		t.Fatalf("pro月→Max年: %+v want switch/yearly/269000", sp)
	}
	if want := tm("2027-08-27 10:00:00"); !sp.NewExpires.Equal(want) {
		t.Fatalf("升档转年付应叠加到原到期日: got %v want %v", sp.NewExpires, want)
	}
	if !sp.Deferred {
		t.Fatalf("switch 的权益从当前到期日起算,Deferred 必须为真")
	}

	// 续费 → Pro 月 / Pro 年:整周期原价,叠加到原到期日。
	sp, err = computeSubscription(uv, TierPro, CycleMonthly, cfg, now)
	if err != nil {
		t.Fatal(err)
	}
	if sp.Action != "renew" || sp.AmountCents != 5900 || !sp.NewExpires.Equal(tm("2026-09-27 10:00:00")) {
		t.Fatalf("续费 Pro月: %+v", sp)
	}
	sp, err = computeSubscription(uv, TierPro, CycleYearly, cfg, now)
	if err != nil {
		t.Fatal(err)
	}
	if sp.Action != "renew" || sp.Cycle != CycleYearly || sp.AmountCents != 59000 ||
		!sp.NewExpires.Equal(tm("2027-08-27 10:00:00")) {
		t.Fatalf("续费 Pro年: %+v", sp)
	}
}

// ─── 场景 ③:pro 年 ─────────────────────────────────────────────────────────

func TestMatrixProYearly(t *testing.T) {
	cfg := matrixCfg()
	now := tm("2026-08-12 10:00:00")
	exp := now.AddDate(0, 0, 200) // 还剩 200 天
	uv := UserVIP{VIPTier: TierPro, VIPExpiresAt: ptr(exp), VIPCycle: CycleYearly}

	// 升级 → Max:年基准补差,到期日不变。**年费会员不走 switch**(他手上已有整年,
	// 再叠一年是续费不是升级)—— 请求 yearly 也必须落在 upgrade。
	for _, cyc := range []string{CycleMonthly, CycleYearly} {
		sp, err := computeSubscription(uv, TierMax, cyc, cfg, now)
		if err != nil {
			t.Fatal(err)
		}
		wantDiff := int(math.Round(float64(269000-59000) * 200.0 / 365.0)) // ¥1150.68
		if sp.Action != "upgrade" || sp.Cycle != CycleYearly || sp.AmountCents != wantDiff {
			t.Fatalf("pro年→Max(req=%s): %+v want upgrade/yearly/%d", cyc, sp, wantDiff)
		}
		if !sp.NewExpires.Equal(exp) {
			t.Fatalf("pro年升级不得改动到期日: got %v want %v", sp.NewExpires, exp)
		}
	}

	// 续费 → Pro 年:整年价,叠加。
	sp, err := computeSubscription(uv, TierPro, CycleYearly, cfg, now)
	if err != nil {
		t.Fatal(err)
	}
	if sp.Action != "renew" || sp.AmountCents != 59000 || !sp.NewExpires.Equal(exp.AddDate(1, 0, 0)) {
		t.Fatalf("续费 Pro年: %+v", sp)
	}

	// 续费 → Pro 月:**必须拒**。放行会把 vip_cycle 冲成 monthly(履约侧 updates["vip_cycle"]),
	// 年费身份连同后续的折算基准与价目一起错档。
	if _, err := computeSubscription(uv, TierPro, CycleMonthly, cfg, now); !errors.Is(err, ErrYearlyRenewOnly) {
		t.Fatalf("年费会员按月续费必须拒,got err=%v", err)
	}
}

// ─── 场景 ④⑤:max ───────────────────────────────────────────────────────────

func TestMatrixMax(t *testing.T) {
	cfg := matrixCfg()
	now := tm("2026-08-12 10:00:00")

	// ④ max 月:续费月 / 年 都可以(年 = 转年付)。
	expM := tm("2026-08-27 10:00:00")
	uvM := UserVIP{VIPTier: TierMax, VIPExpiresAt: ptr(expM), VIPCycle: CycleMonthly}
	sp, err := computeSubscription(uvM, TierMax, CycleMonthly, cfg, now)
	if err != nil {
		t.Fatal(err)
	}
	if sp.Action != "renew" || sp.AmountCents != 26900 || !sp.NewExpires.Equal(tm("2026-09-27 10:00:00")) {
		t.Fatalf("max月 续费月: %+v", sp)
	}
	sp, err = computeSubscription(uvM, TierMax, CycleYearly, cfg, now)
	if err != nil {
		t.Fatal(err)
	}
	if sp.Action != "renew" || sp.Cycle != CycleYearly || sp.AmountCents != 269000 ||
		!sp.NewExpires.Equal(tm("2027-08-27 10:00:00")) {
		t.Fatalf("max月 续费年: %+v", sp)
	}

	// ⑤ max 年:只能按年续。
	expY := now.AddDate(0, 0, 300)
	uvY := UserVIP{VIPTier: TierMax, VIPExpiresAt: ptr(expY), VIPCycle: CycleYearly}
	sp, err = computeSubscription(uvY, TierMax, CycleYearly, cfg, now)
	if err != nil {
		t.Fatal(err)
	}
	if sp.Action != "renew" || sp.AmountCents != 269000 || !sp.NewExpires.Equal(expY.AddDate(1, 0, 0)) {
		t.Fatalf("max年 续费年: %+v", sp)
	}
	if _, err := computeSubscription(uvY, TierMax, CycleMonthly, cfg, now); !errors.Is(err, ErrYearlyRenewOnly) {
		t.Fatalf("max年 按月续费必须拒,got err=%v", err)
	}

	// 降级仍然一律拒(与周期无关)。
	if _, err := computeSubscription(uvY, TierPro, CycleYearly, cfg, now); !errors.Is(err, ErrNoDowngrade) {
		t.Fatalf("max→pro 必须拒降级,got %v", err)
	}
}

// ─── switch 分支的边界 ──────────────────────────────────────────────────────

func TestSwitchBranchGuards(t *testing.T) {
	cfg := matrixCfg()
	now := tm("2026-08-12 10:00:00")

	// 目标档年价未配置 → 不能走 switch,回落原地补差(不堵死用户)。
	off := *cfg
	off.MaxYearPriceCents = 0
	exp := tm("2026-08-27 10:00:00")
	uv := UserVIP{VIPTier: TierPro, VIPExpiresAt: ptr(exp), VIPCycle: CycleMonthly}
	sp, err := computeSubscription(uv, TierMax, CycleYearly, &off, now)
	if err != nil {
		t.Fatal(err)
	}
	if sp.Action != "upgrade" {
		t.Fatalf("目标档年价未配置时应回落 upgrade,got %+v", sp)
	}

	// 免费用户请求年付高档 = 新购,不是 switch(switch 只服务在期付费会员)。
	sp, err = computeSubscription(UserVIP{}, TierMax, CycleYearly, cfg, now)
	if err != nil {
		t.Fatal(err)
	}
	if sp.Action != "new" {
		t.Fatalf("free 用户应走 new,got %+v", sp)
	}

	// 已过期的 pro(视为 free)请求年付 Max = 新购。
	past := tm("2026-08-01 10:00:00")
	uvExpired := UserVIP{VIPTier: TierPro, VIPExpiresAt: ptr(past), VIPCycle: CycleMonthly}
	sp, err = computeSubscription(uvExpired, TierMax, CycleYearly, cfg, now)
	if err != nil {
		t.Fatal(err)
	}
	if sp.Action != "new" || sp.AmountCents != 269000 {
		t.Fatalf("过期会员应走 new 全价,got %+v", sp)
	}

	// switch 单在履约侧必须**不是** upgrade:upgrade 的三处分支(定价基准闸门 / 不写 vip_cycle /
	// 不作废在途升级单)对 switch 全都不适用 —— switch 会延长到期日且改周期。
	sp, err = computeSubscription(uv, TierMax, CycleYearly, cfg, now)
	if err != nil {
		t.Fatal(err)
	}
	if sp.Action == "upgrade" {
		t.Fatalf("switch 绝不能复用 upgrade 这个 action(履约语义相反)")
	}
	if name := planActionName(sp.Tier, sp.Action, sp.Cycle); name != "Max · 升级并转年付" {
		t.Fatalf("switch 订单名: %q", name)
	}
}

// TestSwitchNeverLosesRemainingDays —— switch 采用「全价 + 叠加」模型的核心保证:
// 无论余期多长,新到期日恒 >= 原到期日,用户手上的剩余天数一天都不会丢。
func TestSwitchNeverLosesRemainingDays(t *testing.T) {
	cfg := matrixCfg()
	now := tm("2026-08-12 10:00:00")
	for _, days := range []int{1, 15, 30, 200, 393} {
		exp := now.AddDate(0, 0, days)
		uv := UserVIP{VIPTier: TierPro, VIPExpiresAt: ptr(exp), VIPCycle: CycleMonthly}
		sp, err := computeSubscription(uv, TierMax, CycleYearly, cfg, now)
		if err != nil {
			t.Fatalf("days=%d: %v", days, err)
		}
		if sp.Action != "switch" {
			t.Fatalf("days=%d 应走 switch,got %+v", days, sp)
		}
		if sp.NewExpires.Before(exp) {
			t.Fatalf("days=%d 新到期日 %v 早于原到期日 %v —— 用户丢了剩余天数",
				days, sp.NewExpires, exp)
		}
		if sp.AmountCents != 269000 {
			t.Fatalf("days=%d 金额应为整年价,got %d", days, sp.AmountCents)
		}
	}
}
