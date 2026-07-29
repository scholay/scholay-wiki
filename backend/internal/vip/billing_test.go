package vip

import (
	"fmt"
	"math"
	"strings"
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

// (TestActiveLotsFilterAndSort / TestPlanConsume 已删除 —— 0090 起临时经费退休,
//  「批次过滤 + 临时优先→永久 两层扣减」整套纯逻辑不复存在。
//  「最近到期优先」这条策略搬到了重置次数上,由 activePassSQL + ORDER BY expires_at 承担,
//  形状由 TestActivePassSQLShape 守;真扣减路径 ConsumeResetPass 需要 DB,归集成测试。)

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
	c := &BillingConfig{RechargeRate: 1.0, ProPriceCents: 5900, MaxPriceCents: 26900}
	if c.RechargeCreditsFor(2000) != 20 { // ¥20 → 20 经费
		t.Errorf("recharge 2000c=%d want 20", c.RechargeCreditsFor(2000))
	}
	c.RechargeRate = 2.5
	if c.RechargeCreditsFor(1000) != 25 { // ¥10 × 2.5 = 25
		t.Errorf("recharge rate2.5: %d want 25", c.RechargeCreditsFor(1000))
	}
	// (赠送经费断言已删 —— 0090 起订阅不赠送经费,GrantCreditsFor 已不存在。)
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
	}
	if c.PriceCentsFor(TierPro, CycleYearly) != 59000 || c.PriceCentsFor(TierMax, CycleYearly) != 269000 {
		t.Errorf("yearly price mismatch")
	}
	// 0090:折算分母是常量 30/365(与自然月长度解耦),GrantCreditsFor/PeriodDaysFor 已删。
	if prorationDays(CycleMonthly) != 30 || prorationDays(CycleYearly) != 365 {
		t.Errorf("proration days must stay constant: m=%d y=%d", prorationDays(CycleMonthly), prorationDays(CycleYearly))
	}
	// -1 是 0079 的「未配置」哨兵:PriceCentsFor 原样透出,由调用方按 <=0 判「年付未开放」。
	z := &BillingConfig{ProYearPriceCents: -1}
	if got := z.PriceCentsFor(TierPro, CycleYearly); got > 0 {
		t.Errorf("sentinel -1 应保持非正(年付未开放),得到 %d", got)
	}
}

func TestComputeSubscriptionYearly(t *testing.T) {
	cfg := &BillingConfig{
		ProPriceCents: 5900, MaxPriceCents: 26900,
		ProYearPriceCents: 59000, MaxYearPriceCents: 269000,
	}
	now := tm("2026-07-22 12:00:00")

	// 免费用户年付新购:年价 + **1 个自然年**。
	// ⚠️ 期望值写成显式日期而不是 now.AddDate(0,0,365):在 now=2026-07-22 这个基准日上
	//    「+365 天」与「+1 自然年」恰好相等,用前者写断言 = 对本次改造完全无感的假绿。
	sp, err := computeSubscription(UserVIP{}, TierPro, CycleYearly, cfg, now)
	if err != nil {
		t.Fatal(err)
	}
	if sp.Action != "new" || sp.Cycle != CycleYearly || sp.AmountCents != 59000 {
		t.Fatalf("yearly new: %+v", sp)
	}
	if got, want := sp.NewExpires, tm("2027-07-22 12:00:00"); !got.Equal(want) {
		t.Fatalf("yearly new expires=%v want %v", got, want)
	}

	// 月度在期同档按年续期:到期日 +1 自然年,周期转 yearly。
	exp := tm("2026-08-11 12:00:00")
	uvMonthly := UserVIP{VIPTier: TierPro, VIPExpiresAt: &exp, VIPCycle: CycleMonthly}
	sp, err = computeSubscription(uvMonthly, TierPro, CycleYearly, cfg, now)
	if err != nil {
		t.Fatal(err)
	}
	if sp.Action != "renew" || sp.Cycle != CycleYearly || sp.AmountCents != 59000 || !sp.Deferred {
		t.Fatalf("monthly→yearly renew: %+v", sp)
	}
	if got, want := sp.NewExpires, tm("2027-08-11 12:00:00"); !got.Equal(want) {
		t.Fatalf("renew expires=%v want %v", got, want)
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

// ─── 用户端不下发额度绝对值(P5 成本制)──────────────────────────────────────
//
// 不变量:凡是回给**用户端**的额度数字,绝对值一律抹掉,只留百分比/不限标志。
// 绝对值(微元真实成本 → ÷1000 = 算力点)只在 admin 侧可见。
// 这条不变量此前只有 Overview 一条出口守着,ResetQuota 漏了 —— 它把当前档位的真实周期上限
// 原样回给了用户端。两个出口整形器现在一起钉在这里。

func TestStripQuotaAmountsUser(t *testing.T) {
	ov := &Overview{Token: TokenStatus{Used: 123456, Ceiling: 6_000_000, Percent: 2, ConsumedToday: 7890}}
	got := ov.StripQuotaAmounts()
	if got.Token.Used != 0 || got.Token.ConsumedToday != 0 || got.Token.Ceiling != 0 {
		t.Fatalf("限额档应抹成 0:used=%d ceiling=%d today=%d",
			got.Token.Used, got.Token.Ceiling, got.Token.ConsumedToday)
	}
	if got.Token.Percent != 2 {
		t.Fatalf("percent 是真值,不能被抹:%d", got.Token.Percent)
	}

	// 不限档:ceiling 必须留 -1 —— 前端用 ceiling<0 判「不限」,抹成 0 会让不限用户看到「已用满」。
	un := &Overview{Token: TokenStatus{Used: 999, Ceiling: -1, Unlimited: true}}
	if got := un.StripQuotaAmounts(); got.Token.Ceiling != -1 {
		t.Fatalf("不限档 ceiling 应保持 -1,得到 %d", got.Token.Ceiling)
	}
}

func TestResetResultStripAmounts(t *testing.T) {
	bal := &BalanceView{Total: 42}
	r := (&ResetResult{Used: 55, Ceiling: 6_000_000, Balance: bal}).StripAmounts()
	if r.Used != 0 || r.Ceiling != 0 {
		t.Fatalf("重置回包应抹掉额度绝对值:used=%d ceiling=%d", r.Used, r.Ceiling)
	}
	if r.Balance == nil || r.Balance.Total != 42 {
		t.Fatalf("经费余额是用户可见真值,不能被抹")
	}
	if got := (&ResetResult{Ceiling: -1}).StripAmounts(); got.Ceiling != -1 {
		t.Fatalf("不限档 ceiling 应保持 -1,得到 %d", got.Ceiling)
	}
	if (*ResetResult)(nil).StripAmounts() != nil {
		t.Fatalf("nil 入参应原样返回,不能 panic")
	}
}

// ─── 订阅周期 = 真·自然月 / 自然年(0090)────────────────────────────────────
//
// 这组用例是 A 项的核心行为守卫。改造前用 time.AddDate(0,0,30|365) 按天推算,
// 那是**溢出规范化**的:1/31 + 1 月 → 3/3(2 月整月白送)、2028-02-29 + 1 年 → 2029-03-01。
// 下面每条都刻意选在「按天算」与「按自然月算」**结果不同**的日子上 ——
// 选 7/22 那种两者恰好相等的基准日,断言会永远绿、对回归完全无感(旧用例正是如此)。
func TestAddPeriodNaturalMonthYear(t *testing.T) {
	cases := []struct {
		name  string
		base  string
		cycle string
		want  string
	}{
		{"1月31日+1月→钳到2月末", "2026-01-31 10:20:30", CycleMonthly, "2026-02-28 10:20:30"},
		{"闰年1月31日+1月→2月29", "2028-01-31 09:00:00", CycleMonthly, "2028-02-29 09:00:00"},
		{"3月31日+1月→4月30", "2026-03-31 00:00:00", CycleMonthly, "2026-04-30 00:00:00"},
		{"5月31日+1月→6月30(保住时分秒)", "2026-05-31 23:59:59", CycleMonthly, "2026-06-30 23:59:59"},
		{"月中不受影响", "2026-07-15 12:00:00", CycleMonthly, "2026-08-15 12:00:00"},
		{"闰日+1年→非闰年2月28", "2028-02-29 08:00:00", CycleYearly, "2029-02-28 08:00:00"},
		{"平年+1年原样", "2026-07-22 12:00:00", CycleYearly, "2027-07-22 12:00:00"},
		{"空 cycle 按月度", "2026-01-31 10:20:30", "", "2026-02-28 10:20:30"},
	}
	for _, tc := range cases {
		base := tm(tc.base)
		got := AddPeriod(base, tc.cycle)
		if want := tm(tc.want); !got.Equal(want) {
			t.Errorf("%s: AddPeriod(%s,%q)=%v want %v", tc.name, tc.base, tc.cycle, got, want)
		}
		// 时区必须原样保持(本仓库铁律:时间不做 UTC 转换,落库靠挂钟值)。
		if got.Location() != base.Location() {
			t.Errorf("%s: 时区被改写 %v → %v", tc.name, base.Location(), got.Location())
		}
	}
}

// TestAddPeriodDiffersFromNaiveAddDate 把「为什么不能用 stdlib」钉死:
// 只要有人把 AddPeriod 改回 time.AddDate,这条立刻红。
func TestAddPeriodDiffersFromNaiveAddDate(t *testing.T) {
	base := tm("2026-01-31 10:20:30")
	if AddPeriod(base, CycleMonthly).Equal(base.AddDate(0, 1, 0)) {
		t.Fatal("AddPeriod 退化成了 stdlib AddDate(溢出规范化):1/31 会变成 3/3,白送整个 2 月")
	}
	leap := tm("2028-02-29 08:00:00")
	if AddPeriod(leap, CycleYearly).Equal(leap.AddDate(1, 0, 0)) {
		t.Fatal("AddPeriod 退化成了 stdlib AddDate:闰日 +1 年会溢出到 3/1")
	}
}

// TestProrationDaysStayConstant 守住「折算分母与自然月长度解耦」这条拍板决定 ——
// 它一旦跟着自然月浮动,同一笔升级的实付金额会随月份跳变,且档位阈值一起抖动。
func TestProrationDaysStayConstant(t *testing.T) {
	if prorationDays(CycleMonthly) != 30 || prorationDays(CycleYearly) != 365 {
		t.Fatalf("折算分母必须是常量 30/365,得到 m=%d y=%d", prorationDays(CycleMonthly), prorationDays(CycleYearly))
	}
	if prorationDays("") != 30 || prorationDays("weird") != 30 {
		t.Fatal("未知 cycle 应归一化为月度")
	}
}

// TestResetPassLotOrdering 重置次数的消耗顺序 = 最近到期优先(与旧临时经费同策略)。
// 这里只验查询谓词的形状不含 IS NULL 分支(starts_at 已收敛为 NOT NULL,见迁移 0090):
// 留着 IS NULL 会让人以为该列可空,而 Go 侧 StartsAt 是非指针,真扫到 NULL 会报错。
func TestActivePassSQLShape(t *testing.T) {
	if strings.Contains(activePassSQL, "IS NULL") {
		t.Fatal("activePassSQL 不应有 IS NULL 分支:starts_at 在 0090 已是 NOT NULL")
	}
	for _, frag := range []string{"count_remaining > 0", "starts_at <= ?", "expires_at > ?"} {
		if !strings.Contains(activePassSQL, frag) {
			t.Fatalf("activePassSQL 缺少 %q", frag)
		}
	}
}

// ─── 按量付费(0094)────────────────────────────────────────────────────────

func TestMicroCreditConversion(t *testing.T) {
	// 用 5 这个整除 1000 的值验精确性(0095 现网值是 3,不整除,单独在下面验)。
	c := &BillingConfig{CreditToPoints: 5}
	// 1 经费 = 5 算力点 = 5,000 微元 = 1e6 micro-credit ⇒ 1 微元 = 200 micro-credit。
	if got := c.MicroCreditForCost(5000); got != MicroCreditPerCredit {
		t.Fatalf("5000 微元应正好扣 1 经费, 得到 %d micro-credit", got)
	}
	if got := c.MicroCreditForCost(500); got != 100_000 { // 0.5 算力点 = 0.1 经费
		t.Fatalf("500 微元应扣 0.1 经费(100000), 得到 %d", got)
	}
	if got := c.MicroCreditForCost(0); got != 0 {
		t.Fatalf("零成本不应扣费, 得到 %d", got)
	}
	// 🔴 小额调用绝不能被抹成 0 —— 那正是「经费必须是小数」的全部理由。
	if got := c.MicroCreditForCost(1); got <= 0 {
		t.Fatalf("1 微元的调用也必须扣到费(否则平台白干), 得到 %d", got)
	}
	// 不整除时向上取整(宁可多扣 1e-6 经费,也不留系统性少扣)。
	c3 := &BillingConfig{CreditToPoints: 3}
	if got, want := c3.MicroCreditForCost(1), int64(334); got != want { // ceil(1000/3)
		t.Fatalf("不整除应向上取整: %d want %d", got, want)
	}
	// 兑换率误配(<=0)兜底成 3(0095 默认),不能除零。
	cz := &BillingConfig{CreditToPoints: 0}
	if got, want := cz.MicroCreditForCost(3000), int64(MicroCreditPerCredit); got != want {
		t.Fatalf("兑换率 <=0 应兜底成 3(3000 微元 = 3 点 = 1 经费), 得到 %d want %d", got, want)
	}
	// 余额折算算力点:1e6 micro-credit(=1 经费)= 5 点。
	if got := c.PointsForMicroCredit(600 * MicroCreditPerCredit); got != 3000 {
		t.Fatalf("600 经费应折 3000 算力点, 得到 %d", got)
	}

	// ── 0095 现网口径:1 经费 = 3 算力点(3 不整除 1000,验向上取整不吃亏)──────────
	c3n := &BillingConfig{CreditToPoints: 3}
	// 3000 微元 = 3 算力点 = 正好 1 经费。
	if got := c3n.MicroCreditForCost(3000); got != MicroCreditPerCredit {
		t.Fatalf("3000 微元应正好扣 1 经费, 得到 %d", got)
	}
	// 单次小额:1 微元 → ceil(1000/3)=334 micro-credit(多扣 1/3 个 micro-credit ≈ ¥3e-9)。
	if got := c3n.MicroCreditForCost(1); got != 334 {
		t.Fatalf("1 微元应向上取整到 334 micro-credit, 得到 %d", got)
	}
	// 1000 经费(= ¥10)在新口径下折 3000 算力点 —— 与旧口径 600 经费 × 5 等值,
	// 这是 0095 重锚「购买力守恒」的断言。
	if got := c3n.PointsForMicroCredit(1000 * MicroCreditPerCredit); got != 3000 {
		t.Fatalf("1000 经费应折 3000 算力点(与旧 600×5 等值), 得到 %d", got)
	}
}

// TestPaygMustBePricierThanPlans 守住整个方案的产品前提:
// **按量付费单价必须严格高于所有套餐档**,否则套餐失去存在理由 —— 而且是静默失效。
func TestPaygMustBePricierThanPlans(t *testing.T) {
	base := func() *BillingConfig {
		return &BillingConfig{
			Enabled: true, FreeWindowTokens: 300_000, WindowDays: 7,
			ProMultiplier: 20, MaxMultiplier: 5,
			ProPriceCents: 5900, MaxPriceCents: 26900,
			ProYearPriceCents: 59000, MaxYearPriceCents: 269000,
			// 0095 重锚:¥1 = 100 经费(经费=分) × 3 算力点 = 300 点/元(乘积与旧 60×5 相同)。
			RechargeRate: 100, CreditToPoints: 3,
		}
	}
	// 现网配置:¥1 直充 300 点 < Pro 月付 442 点 —— 应通过。
	if err := validateBillingConfig(base()); err != nil {
		t.Fatalf("现网配置应合法: %v", err)
	}
	// 兑换率调到 5 → ¥1 直充 500 点 > Pro 月付 442,套餐反而更贵 —— 必须拒绝。
	// ⚠️ 注意边界随 recharge_rate 一起移动:旧口径(60/元)下 5 是合法值,新口径(100/元)下就越线了。
	// 这正是「乘积才是价格」的体现 —— 两个旋钮任何一个动都在改单价。
	bad := base()
	bad.CreditToPoints = 5
	if err := validateBillingConfig(bad); err == nil {
		t.Fatal("兑换率过高使直充比套餐便宜, 应被拒绝")
	}
	// 边界:4 时 ¥1 = 400 点,仍低于 Pro 月付 442 → 合法(留一点调价空间)。
	edge := base()
	edge.CreditToPoints = 4
	if err := validateBillingConfig(edge); err != nil {
		t.Fatalf("兑换率 4 仍应合法: %v", err)
	}
	// 兑换率非法值要单独拦(否则 MicroCreditForCost 会走兜底,掩盖误配)。
	zero := base()
	zero.CreditToPoints = 0
	if err := validateBillingConfig(zero); err == nil {
		t.Fatal("兑换率 <=0 应被拒绝")
	}
	// 充值关闭(rate<=0)时没有按量付费,不做比较。
	noRecharge := base()
	noRecharge.RechargeRate = 0
	noRecharge.CreditToPoints = 999
	if err := validateBillingConfig(noRecharge); err != nil {
		t.Fatalf("充值关闭时不应比较按量单价: %v", err)
	}
}

// TestPayAsYouGoOverflow 守住「跨线那一笔只对超出部分收费」——
// 整笔转经费会让用户为已经买过的额度再付一次钱,且恰好发生在刚用完套餐的时刻。
func TestPayAsYouGoOverflow(t *testing.T) {
	const ceiling = 1000
	cases := []struct {
		name             string
		prevWin, curWin  int64
		want             int64
	}{
		{"完全在额度内", 100, 400, 0},
		{"恰好用到上限", 600, 1000, 0},
		{"跨线:只收超出的那一截", 900, 1200, 200},
		{"已在额度外:本次全额收", 1500, 1800, 300},
		{"从 0 一次冲过上限", 0, 2500, 1500},
		{"边界:刚好越过 1", 999, 1001, 1},
	}
	for _, c := range cases {
		if got := payAsYouGoOverflow(c.prevWin, c.curWin, ceiling); got != c.want {
			t.Errorf("%s: prev=%d cur=%d → %d want %d", c.name, c.prevWin, c.curWin, got, c.want)
		}
	}
	// 不限额档(ceiling<=0)绝不能扣经费 —— 那是「无限量」的语义。
	if got := payAsYouGoOverflow(0, 999999, -1); got != 0 {
		t.Errorf("不限额档不应产生按量扣费, 得到 %d", got)
	}
	if got := payAsYouGoOverflow(0, 999999, 0); got != 0 {
		t.Errorf("ceiling=0 不应产生按量扣费, 得到 %d", got)
	}
}
