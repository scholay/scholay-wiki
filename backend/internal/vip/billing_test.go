package vip

import (
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

func TestDailyCeiling(t *testing.T) {
	c := &BillingConfig{FreeDailyTokens: 200000, ProMultiplier: 3, MaxMultiplier: 5}
	if c.DailyCeiling(TierFree) != 200000 {
		t.Errorf("free ceiling=%d", c.DailyCeiling(TierFree))
	}
	if c.DailyCeiling(TierPro) != 600000 {
		t.Errorf("pro ceiling=%d", c.DailyCeiling(TierPro))
	}
	if c.DailyCeiling(TierMax) != 1000000 {
		t.Errorf("max ceiling=%d", c.DailyCeiling(TierMax))
	}
	// 倍率<=0 = 不限。
	cu := &BillingConfig{FreeDailyTokens: 200000, ProMultiplier: 0, MaxMultiplier: -1}
	if cu.DailyCeiling(TierPro) != -1 || cu.DailyCeiling(TierMax) != -1 {
		t.Errorf("unlimited mult: pro=%d max=%d", cu.DailyCeiling(TierPro), cu.DailyCeiling(TierMax))
	}
	// 基准<=0 = 不限。
	cz := &BillingConfig{FreeDailyTokens: 0}
	if cz.DailyCeiling(TierFree) != -1 {
		t.Errorf("zero base should be unlimited")
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
	if c.GrantCreditsFor(TierPro) != 600 || c.GrantCreditsFor(TierMax) != 3000 || c.GrantCreditsFor(TierFree) != 0 {
		t.Errorf("grant mismatch")
	}
	if c.PriceCentsFor(TierPro) != 5900 || c.PriceCentsFor(TierMax) != 26900 {
		t.Errorf("price mismatch")
	}
}

// ─── 过 0 点:日 key 滚动 ─────────────────────────────────────────────────────

func TestTokenDayKeyRollover(t *testing.T) {
	before := tm("2026-06-08 23:59:30")
	after := tm("2026-06-09 00:00:30")
	k1 := tokenDayKey(42, before)
	k2 := tokenDayKey(42, after)
	if k1 == k2 {
		t.Fatalf("过0点 key 应不同: %s == %s", k1, k2)
	}
	if k1 != "quota:tokens:42:20260608" || k2 != "quota:tokens:42:20260609" {
		t.Fatalf("key 格式: %s / %s", k1, k2)
	}
}
