package vip

import (
	"fmt"
	"math"
	"testing"
	"time"
)

func tm(s string) time.Time {
	t, err := time.ParseInLocation("2006-01-02 15:04:05", s, time.Local)
	if err != nil {
		panic(err)
	}
	return t
}
func ptr(t time.Time) *time.Time { return &t }

// ─── 会员等级 / 单调续期 ─────────────────────────────────────────────────────

func TestEffectiveTier(t *testing.T) {
	now := tm("2026-06-08 12:00:00")
	cases := []struct {
		name string
		uv   UserVIP
		want string
	}{
		{"free", UserVIP{VIPTier: "free"}, TierFree},
		{"pro-active", UserVIP{VIPTier: "pro", VIPExpiresAt: ptr(now.Add(time.Hour))}, TierPro},
		{"pro-expired", UserVIP{VIPTier: "pro", VIPExpiresAt: ptr(now.Add(-time.Hour))}, TierFree},
		{"max-active", UserVIP{VIPTier: "max", VIPExpiresAt: ptr(now.Add(time.Hour))}, TierMax},
		{"pro-nil-expiry", UserVIP{VIPTier: "pro"}, TierPro},
	}
	for _, c := range cases {
		if got := effectiveTier(c.uv, now); got != c.want {
			t.Errorf("%s: got %s want %s", c.name, got, c.want)
		}
	}
}

func TestApplyMembershipGrant(t *testing.T) {
	now := tm("2026-06-08 12:00:00")

	// free 用户开 pro 30 天 → 从 now 起算。
	tier, exp := applyMembershipGrant(UserVIP{VIPTier: "free"}, TierPro, 30, now)
	if tier != TierPro || !exp.Equal(now.AddDate(0, 0, 30)) {
		t.Fatalf("free→pro: tier=%s exp=%v", tier, exp)
	}

	// 在期 pro 再续 30 天 → 从现到期日**顺延**(续期不截断)。
	curExp := now.AddDate(0, 0, 10)
	tier, exp = applyMembershipGrant(UserVIP{VIPTier: "pro", VIPExpiresAt: ptr(curExp)}, TierPro, 30, now)
	if tier != TierPro || !exp.Equal(curExp.AddDate(0, 0, 30)) {
		t.Fatalf("pro续期顺延: tier=%s exp=%v want %v", tier, exp, curExp.AddDate(0, 0, 30))
	}

	// 在期 pro 用一张「pro 码」不变;但若给 max → 升级 max, 仍从现到期日顺延。
	tier, _ = applyMembershipGrant(UserVIP{VIPTier: "pro", VIPExpiresAt: ptr(curExp)}, TierMax, 30, now)
	if tier != TierMax {
		t.Fatalf("pro→max 升级: tier=%s want max", tier)
	}

	// 在期 max 用一张「pro 码」→ **绝不降级**, 保持 max, 从现到期日顺延。
	tier, exp = applyMembershipGrant(UserVIP{VIPTier: "max", VIPExpiresAt: ptr(curExp)}, TierPro, 30, now)
	if tier != TierMax || !exp.Equal(curExp.AddDate(0, 0, 30)) {
		t.Fatalf("max不降级: tier=%s exp=%v", tier, exp)
	}

	// 已过期 pro → 从 now 起算(不顺延过去的时间)。
	tier, exp = applyMembershipGrant(UserVIP{VIPTier: "pro", VIPExpiresAt: ptr(now.Add(-time.Hour))}, TierPro, 30, now)
	if tier != TierPro || !exp.Equal(now.AddDate(0, 0, 30)) {
		t.Fatalf("过期pro: tier=%s exp=%v", tier, exp)
	}
}

// ─── 经费消耗顺序 / 过期 ─────────────────────────────────────────────────────

func TestActiveLotsFilterAndSort(t *testing.T) {
	now := tm("2026-06-08 12:00:00")
	lots := []CreditTempLot{
		{ID: 1, AmountRemaining: 10, ExpiresAt: now.AddDate(0, 0, 5)},  // 有效
		{ID: 2, AmountRemaining: 0, ExpiresAt: now.AddDate(0, 0, 3)},   // 已用尽
		{ID: 3, AmountRemaining: 20, ExpiresAt: now.AddDate(0, 0, -1)}, // 已过期
		{ID: 4, AmountRemaining: 30, ExpiresAt: now.AddDate(0, 0, 1)},  // 有效, 最近到期
	}
	got := activeLots(lots, now)
	if len(got) != 2 {
		t.Fatalf("active len=%d want 2", len(got))
	}
	if got[0].ID != 4 || got[1].ID != 1 {
		t.Fatalf("sort order=%d,%d want 4,1", got[0].ID, got[1].ID)
	}
	if sumTemp(got) != 40 {
		t.Fatalf("sumTemp=%d want 40", sumTemp(got))
	}
}

func TestPlanConsume(t *testing.T) {
	// 已排序的临时批次(最近到期优先)。
	lots := []CreditTempLot{{ID: 4, AmountRemaining: 30}, {ID: 1, AmountRemaining: 10}}

	// 扣 25:全从第一批(30)出。
	d, perm, ok := planConsume(lots, 100, 25)
	if !ok || perm != 0 || len(d) != 1 || d[0].LotID != 4 || d[0].Amount != 25 {
		t.Fatalf("扣25: ok=%v perm=%d d=%+v", ok, perm, d)
	}

	// 扣 35:第一批 30 全扣 + 第二批 5。
	d, perm, ok = planConsume(lots, 100, 35)
	if !ok || perm != 0 || len(d) != 2 || d[0].Amount != 30 || d[1].Amount != 5 {
		t.Fatalf("扣35: ok=%v d=%+v", ok, d)
	}

	// 扣 50:临时 40 全扣 + 永久 10。
	d, perm, ok = planConsume(lots, 100, 50)
	if !ok || perm != 10 {
		t.Fatalf("扣50: ok=%v perm=%d want perm=10", ok, perm)
	}

	// 扣 200:临时40 + 永久100 = 140 < 200 → 不足, 不扣分文。
	d, perm, ok = planConsume(lots, 100, 200)
	if ok || d != nil || perm != 0 {
		t.Fatalf("扣200应不足: ok=%v perm=%d d=%+v", ok, perm, d)
	}

	// 只用永久(无临时)。
	d, perm, ok = planConsume(nil, 60, 60)
	if !ok || perm != 60 || len(d) != 0 {
		t.Fatalf("纯永久: ok=%v perm=%d", ok, perm)
	}
}

// ─── 配置派生 ────────────────────────────────────────────────────────────────

func TestWindowCeiling(t *testing.T) {
	// P4:7 天周期窗口基准(FreeWindowTokens);倍率语义不变:Pro = base × pro倍率;Max = Pro × max倍率。
	c := &BillingConfig{FreeWindowTokens: 1400000, ProMultiplier: 3, MaxMultiplier: 5}
	if c.WindowCeiling(TierFree) != 1400000 {
		t.Errorf("free ceiling=%d", c.WindowCeiling(TierFree))
	}
	if c.WindowCeiling(TierPro) != 4200000 { // 1400000 × 3
		t.Errorf("pro ceiling=%d", c.WindowCeiling(TierPro))
	}
	if c.WindowCeiling(TierMax) != 21000000 { // 1400000 × 3 × 5(Max = base × pro × max)
		t.Errorf("max ceiling=%d", c.WindowCeiling(TierMax))
	}
	// 倍率<=0 = 不限。
	cu := &BillingConfig{FreeWindowTokens: 1400000, ProMultiplier: 0, MaxMultiplier: -1}
	if cu.WindowCeiling(TierPro) != -1 || cu.WindowCeiling(TierMax) != -1 {
		t.Errorf("unlimited mult: pro=%d max=%d", cu.WindowCeiling(TierPro), cu.WindowCeiling(TierMax))
	}
	// 基准<=0 = 不限。
	cz := &BillingConfig{FreeWindowTokens: 0}
	if cz.WindowCeiling(TierFree) != -1 {
		t.Errorf("zero base should be unlimited")
	}
	// 透支带(P5 成本制,单位微元):按日均(ceiling/窗口天数)的 15%,地板 ¥0.5(500000 微元)。
	co := &BillingConfig{FreeWindowTokens: 70_000_000, WindowDays: 7} // 日均 1000 万 → 15% = 150 万 > 地板
	if co.OverdraftTokens(TierFree) != 1_500_000 {
		t.Errorf("overdraft=%d want 1500000", co.OverdraftTokens(TierFree))
	}
	cf := &BillingConfig{FreeWindowTokens: 1_400_000, WindowDays: 7} // 日均 20 万 → 15%=3 万 < 地板 50 万
	if cf.OverdraftTokens(TierFree) != 500_000 {
		t.Errorf("overdraft floor=%d want 500000", cf.OverdraftTokens(TierFree))
	}
}

func TestRechargeAndGrant(t *testing.T) {
	c := &BillingConfig{RechargeRate: 1.0, ProGrantCredits: 600, MaxGrantCredits: 3000,
		ProPriceCents: 5900, MaxPriceCents: 26900}
	if c.RechargeCreditsFor(2000) != 20 { // ¥20 → 20 经费
		t.Errorf("recharge 2000c=%d want 20", c.RechargeCreditsFor(2000))
	}
	c.RechargeRate = 2.5
	if c.RechargeCreditsFor(1000) != 25 { // ¥10 × 2.5 = 25
		t.Errorf("recharge rate2.5: %d want 25", c.RechargeCreditsFor(1000))
	}
	if c.GrantCreditsFor(TierPro, CycleMonthly) != 600 || c.GrantCreditsFor(TierMax, CycleMonthly) != 3000 || c.GrantCreditsFor(TierFree, CycleMonthly) != 0 {
		t.Errorf("grant mismatch")
	}
	if c.PriceCentsFor(TierPro, CycleMonthly) != 5900 || c.PriceCentsFor(TierMax, CycleMonthly) != 26900 {
		t.Errorf("price mismatch")
	}
	// 空串/未知 cycle 一律按月度(normCycle 归一化)。
	if c.PriceCentsFor(TierPro, "") != 5900 || c.PriceCentsFor(TierPro, "weird") != 5900 {
		t.Errorf("empty/unknown cycle should fall back to monthly")
	}
}

// ─── 年度订阅(0079)───────────────────────────────────────────────────────────

func TestYearlyPricingAndPeriod(t *testing.T) {
	c := &BillingConfig{
		ProPriceCents: 5900, MaxPriceCents: 26900,
		ProYearPriceCents: 59000, MaxYearPriceCents: 269000,
		ProGrantCredits: 600, MaxGrantCredits: 3000,
		ProYearGrantCredits: 7200, MaxYearGrantCredits: 36000,
		SubscriptionPeriodDays: 30, SubscriptionYearDays: 365,
	}
	if c.PriceCentsFor(TierPro, CycleYearly) != 59000 || c.PriceCentsFor(TierMax, CycleYearly) != 269000 {
		t.Errorf("yearly price mismatch")
	}
	if c.GrantCreditsFor(TierPro, CycleYearly) != 7200 || c.GrantCreditsFor(TierMax, CycleYearly) != 36000 {
		t.Errorf("yearly grant mismatch")
	}
	if c.PeriodDaysFor(CycleMonthly) != 30 || c.PeriodDaysFor(CycleYearly) != 365 {
		t.Errorf("period days mismatch: m=%d y=%d", c.PeriodDaysFor(CycleMonthly), c.PeriodDaysFor(CycleYearly))
	}
	// 兜底:未配置(0)→ 30/365;-1 哨兵按 0(未开放/不赠送)。
	z := &BillingConfig{ProYearPriceCents: -1, ProYearGrantCredits: -1}
	if z.PeriodDaysFor(CycleMonthly) != 30 || z.PeriodDaysFor(CycleYearly) != 365 {
		t.Errorf("period fallback mismatch")
	}
	if z.GrantCreditsFor(TierPro, CycleYearly) != 0 {
		t.Errorf("sentinel -1 grant should read as 0")
	}
	if z.PriceCentsFor(TierPro, CycleYearly) >= 1 {
		t.Errorf("sentinel -1 price should stay non-positive (yearly disabled)")
	}
}

func TestComputeSubscriptionYearly(t *testing.T) {
	cfg := &BillingConfig{
		ProPriceCents: 5900, MaxPriceCents: 26900,
		ProYearPriceCents: 59000, MaxYearPriceCents: 269000,
		ProGrantCredits: 600, MaxGrantCredits: 3000,
		ProYearGrantCredits: 7200, MaxYearGrantCredits: 36000,
		SubscriptionPeriodDays: 30, SubscriptionYearDays: 365,
	}
	now := tm("2026-07-22 12:00:00")

	// 免费用户年付新购:年价 + 365 天 + 年度总额经费。
	sp, err := computeSubscription(UserVIP{}, TierPro, CycleYearly, cfg, now)
	if err != nil {
		t.Fatal(err)
	}
	if sp.Action != "new" || sp.Cycle != CycleYearly || sp.AmountCents != 59000 || sp.Credits != 7200 {
		t.Fatalf("yearly new: %+v", sp)
	}
	if got := sp.NewExpires; !got.Equal(now.AddDate(0, 0, 365)) {
		t.Fatalf("yearly new expires=%v", got)
	}

	// 月度在期同档按年续期:到期日 +365,周期转 yearly。
	exp := now.AddDate(0, 0, 20)
	uvMonthly := UserVIP{VIPTier: TierPro, VIPExpiresAt: &exp, VIPCycle: CycleMonthly}
	sp, err = computeSubscription(uvMonthly, TierPro, CycleYearly, cfg, now)
	if err != nil {
		t.Fatal(err)
	}
	if sp.Action != "renew" || sp.Cycle != CycleYearly || sp.AmountCents != 59000 || !sp.Deferred {
		t.Fatalf("monthly→yearly renew: %+v", sp)
	}
	if !sp.NewExpires.Equal(exp.AddDate(0, 0, 365)) {
		t.Fatalf("renew expires=%v want %v", sp.NewExpires, exp.AddDate(0, 0, 365))
	}

	// 年费用户升级:按**年价口径**补差(剩余 100 天 / 365)。
	expY := now.AddDate(0, 0, 100)
	uvYearly := UserVIP{VIPTier: TierPro, VIPExpiresAt: &expY, VIPCycle: CycleYearly}
	sp, err = computeSubscription(uvYearly, TierMax, CycleYearly, cfg, now)
	if err != nil {
		t.Fatal(err)
	}
	wantDiff := int(math.Round(float64(269000-59000) * 100.0 / 365.0))
	if sp.Action != "upgrade" || sp.Cycle != CycleYearly || sp.AmountCents != wantDiff {
		t.Fatalf("yearly upgrade diff=%d want %d (%+v)", sp.AmountCents, wantDiff, sp)
	}
	if !sp.NewExpires.Equal(expY) {
		t.Fatalf("upgrade must not extend expiry")
	}

	// 升级忽略请求周期:月度用户请求 cycle=yearly 升 Max → 仍按月度口径补差、周期不变。
	sp, err = computeSubscription(uvMonthly, TierMax, CycleYearly, cfg, now)
	if err != nil {
		t.Fatal(err)
	}
	wantDiffM := int(math.Round(float64(26900-5900) * 20.0 / 30.0))
	if sp.Action != "upgrade" || sp.Cycle != CycleMonthly || sp.AmountCents != wantDiffM {
		t.Fatalf("monthly upgrade should ignore requested yearly cycle: %+v want diff %d", sp, wantDiffM)
	}

	// 年价未配置(<=0)→ 年付拒单;月付不受影响。
	off := *cfg
	off.ProYearPriceCents = 0
	if _, err := computeSubscription(UserVIP{}, TierPro, CycleYearly, &off, now); err == nil {
		t.Fatalf("yearly disabled should reject yearly order")
	}
	if _, err := computeSubscription(UserVIP{}, TierPro, CycleMonthly, &off, now); err != nil {
		t.Fatalf("monthly should still work: %v", err)
	}

	// 年费用户但年价被关:升级回落月度口径,不堵死。
	sp, err = computeSubscription(uvYearly, TierMax, "", &off, now)
	if err != nil {
		t.Fatal(err)
	}
	if sp.Action != "upgrade" || sp.Cycle != CycleMonthly {
		t.Fatalf("yearly user upgrade with yearly-off should fall back monthly: %+v", sp)
	}
}

// TestUpgradeCrossPeriodNoOvercharge 跨周期叠加余期(年付后按月续,vip_cycle 翻月度但余期近整年)
// 升级时:折算基准必须按剩余时长走年价口径,补差不得反超「直接新购目标档年费」(评审 pricing-math)。
func TestUpgradeCrossPeriodNoOvercharge(t *testing.T) {
	cfg := &BillingConfig{
		ProPriceCents: 5900, MaxPriceCents: 26900,
		ProYearPriceCents: 59000, MaxYearPriceCents: 269000,
		ProGrantCredits: 600, MaxGrantCredits: 3000,
		ProYearGrantCredits: 7200, MaxYearGrantCredits: 36000,
		SubscriptionPeriodDays: 30, SubscriptionYearDays: 365,
	}
	now := tm("2026-07-22 12:00:00")

	// vip_cycle=monthly(最近一单是月续)但余 393 天(年付底子)。旧逻辑会用月价日率外推 →
	// round(21000×393/30)=¥2751 > 新购 Max 年费 ¥2690(倒挂)。新逻辑走年价口径。
	expLong := now.AddDate(0, 0, 393)
	uv := UserVIP{VIPTier: TierPro, VIPExpiresAt: &expLong, VIPCycle: CycleMonthly}
	sp, err := computeSubscription(uv, TierMax, "", cfg, now)
	if err != nil {
		t.Fatal(err)
	}
	if sp.Action != "upgrade" || sp.Cycle != CycleYearly {
		t.Fatalf("长余期升级应走年价口径: %+v", sp)
	}
	want := int(math.Round(float64(269000-59000) * 393 / 365)) // 226027
	if sp.AmountCents != want {
		t.Fatalf("补差=%d want %d(年价日率)", sp.AmountCents, want)
	}
	if sp.AmountCents >= cfg.MaxYearPriceCents {
		t.Fatalf("补差 %d 反超新购 Max 年费 %d(定价倒挂未修复)", sp.AmountCents, cfg.MaxYearPriceCents)
	}

	// 年价被 admin 关(ProYear=0):回落月价口径,不堵死(基准=monthly)。
	off := *cfg
	off.ProYearPriceCents = 0
	sp2, err := computeSubscription(uv, TierMax, "", &off, now)
	if err != nil {
		t.Fatal(err)
	}
	if sp2.Action != "upgrade" || sp2.Cycle != CycleMonthly {
		t.Fatalf("年价关闭时升级应回落月度基准: %+v", sp2)
	}
}

func TestPlanActionNameYearly(t *testing.T) {
	cases := []struct{ tier, action, cycle, want string }{
		{TierPro, "new", CycleYearly, "Pro · 年度订阅"},
		{TierPro, "renew", CycleYearly, "Pro · 年度续期"},
		{TierMax, "new", CycleMonthly, "Max · 订阅"},
		{TierMax, "renew", "", "Max · 续期"},
		{TierMax, "upgrade", CycleYearly, "Max · 升级"}, // 升级不冠周期
	}
	for _, c := range cases {
		if got := planActionName(c.tier, c.action, c.cycle); got != c.want {
			t.Errorf("planActionName(%s,%s,%s)=%s want %s", c.tier, c.action, c.cycle, got, c.want)
		}
	}
}

// ─── 窗口 key 与到期语义(P4 锚定周期)────────────────────────────────────────

func TestAnchoredWindowKeys(t *testing.T) {
	anchor := tm("2026-06-08 15:30:00").Unix()
	if k := tokenUsedKey(42, anchor); k != fmt.Sprintf("quota:tokens:42:%d", anchor) {
		t.Fatalf("used key 格式: %s", k)
	}
	if k := tokenBaseKey(42, anchor); k != fmt.Sprintf("quota:base:42:%d", anchor) {
		t.Fatalf("base key 格式: %s", k)
	}
	// 换锚 = 换 key(到期满血的物理根)。
	if tokenUsedKey(42, anchor) == tokenUsedKey(42, anchor+7*86400) {
		t.Fatalf("不同 anchor 应产生不同 key")
	}
	// windowUsed:used-base clamp≥0;resetAt = anchor+窗口。
	w := quotaWindow{anchor: anchor, used: 100, base: 130}
	if w.windowUsed() != 0 {
		t.Fatalf("windowUsed clamp: %d", w.windowUsed())
	}
	w2 := quotaWindow{anchor: anchor, used: 500, base: 130}
	if w2.windowUsed() != 370 {
		t.Fatalf("windowUsed=%d want 370", w2.windowUsed())
	}
	if got := w2.resetAt(7 * 86400).Unix(); got != anchor+7*86400 {
		t.Fatalf("resetAt=%d", got)
	}
	if !(quotaWindow{}).resetAt(7 * 86400).IsZero() {
		t.Fatalf("无窗口 resetAt 应为零值")
	}
}
