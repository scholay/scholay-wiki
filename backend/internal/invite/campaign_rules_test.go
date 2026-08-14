package invite

import (
	"encoding/json"
	"testing"
	"time"
)

func TestInviteStatusSerializesAuthoritativeInviteeReward(t *testing.T) {
	payload, err := json.Marshal(InviteStatus{Bound: true, InviteeRewardedCredits: 0})
	if err != nil {
		t.Fatalf("marshal invite status: %v", err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(payload, &decoded); err != nil {
		t.Fatalf("unmarshal invite status: %v", err)
	}
	value, ok := decoded["invitee_rewarded_credits"]
	if !ok {
		t.Fatal("invitee_rewarded_credits must be present even when no reward was granted")
	}
	if value != float64(0) {
		t.Fatalf("invitee_rewarded_credits=%v, want 0", value)
	}
}

func TestCalculateFirstPurchaseRebateExact(t *testing.T) {
	tests := []struct {
		name  string
		cents int64
		bps   int
		rate  float64
		want  int
	}{
		{name: "one cent", cents: 1, bps: 10000, rate: 100, want: 1},
		{name: "twelve point five percent", cents: 1000, bps: 1250, rate: 100, want: 125},
		{name: "decimal rate half up once", cents: 10000, bps: 1000, rate: 12.3456, want: 123},
		{name: "zero bps", cents: 10000, bps: 0, rate: 100, want: 0},
		{name: "one hundred percent", cents: 1234, bps: 10000, rate: 100, want: 1234},
		{name: "large but representable", cents: 9_000_000_000_000, bps: 10000, rate: 1_000_000, want: 90_000_000_000_000_000},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := calculateFirstPurchaseRebate(tc.cents, tc.bps, tc.rate); got != tc.want {
				t.Fatalf("calculateFirstPurchaseRebate(%d,%d,%v)=%d want %d",
					tc.cents, tc.bps, tc.rate, got, tc.want)
			}
		})
	}
}

func TestValidateCampaignConfigBoundaries(t *testing.T) {
	base := func() *CampaignConfig {
		return &CampaignConfig{BindWindowDays: 30, FirstPurchaseWindowDays: 30}
	}
	if err := validateCampaignConfig(base()); err != nil {
		t.Fatalf("disabled zero-benefit config should be storable: %v", err)
	}

	tests := []struct {
		name   string
		mutate func(*CampaignConfig)
	}{
		{name: "disabled negative bind days", mutate: func(c *CampaignConfig) { c.BindWindowDays = -1 }},
		{name: "disabled zero purchase days", mutate: func(c *CampaignConfig) { c.FirstPurchaseWindowDays = 0 }},
		{name: "enabled without a benefit", mutate: func(c *CampaignConfig) { c.Enabled = true }},
		{name: "bps overflow", mutate: func(c *CampaignConfig) { c.FirstPurchaseRebateBPS = 10001 }},
		{name: "credit overflow", mutate: func(c *CampaignConfig) { c.InviterRegistrationCredits = 1_000_000_001 }},
		{name: "daily cap overflow", mutate: func(c *CampaignConfig) { c.RegistrationDailyCap = 1_000_001 }},
		{name: "bad URL", mutate: func(c *CampaignConfig) { c.CodeHelpURL = "ftp://example.com/help" }},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			cfg := base()
			tc.mutate(cfg)
			if err := validateCampaignConfig(cfg); err == nil {
				t.Fatal("expected validation error")
			}
		})
	}

	valid := base()
	valid.Enabled = true
	valid.FirstPurchaseRebateBPS = 10000
	valid.BindWindowDays = 3650
	valid.FirstPurchaseWindowDays = 3650
	valid.CodeHelpURL = "https://www.scholay.com/help/invite"
	if err := validateCampaignConfig(valid); err != nil {
		t.Fatalf("valid maximum-boundary config rejected: %v", err)
	}
}

func TestInviterMustPrecedeInviteeWithStableTieBreak(t *testing.T) {
	now := time.Now().Truncate(time.Second)
	if !inviterPrecedes(campaignUser{ID: 10, CreatedAt: now.Add(-time.Second)},
		campaignUser{ID: 11, CreatedAt: now}) {
		t.Fatal("older lower-id inviter should be eligible")
	}
	if !inviterPrecedes(campaignUser{ID: 10, CreatedAt: now},
		campaignUser{ID: 11, CreatedAt: now}) {
		t.Fatal("same-second lower id should be the stable predecessor")
	}
	if !inviterPrecedes(campaignUser{ID: 11, CreatedAt: now.Add(-time.Second)},
		campaignUser{ID: 10, CreatedAt: now}) {
		t.Fatal("an earlier-created account must remain eligible even when imported ids are out of order")
	}
	if inviterPrecedes(campaignUser{ID: 11, CreatedAt: now},
		campaignUser{ID: 10, CreatedAt: now}) {
		t.Fatal("same-second higher id must not precede lower id")
	}
}

func TestInviteReversalUsesCumulativeNetPaidDelta(t *testing.T) {
	// 发奖时净实付 10000 分，10% 返利、汇率 100 => 1000 经费。
	for _, tc := range []struct {
		cumulativeRefund int64
		wantTarget       int
	}{
		{0, 0}, {2500, 250}, {5000, 500}, {10000, 1000}, {12000, 1000},
	} {
		if got := calculateInviteReversalTarget(1000, 10000, 0,
			tc.cumulativeRefund, 1000, 100); got != tc.wantTarget {
			t.Fatalf("cumulative refund %d target=%d want %d", tc.cumulativeRefund, got, tc.wantTarget)
		}
	}

	// 后绑定时已退 2000 分，只对发奖后新增退款反冲。
	if got := calculateInviteReversalTarget(800, 8000, 2000, 2000, 1000, 100); got != 0 {
		t.Fatalf("refund baseline itself must not be reversed, got %d", got)
	}
	if got := calculateInviteReversalTarget(800, 8000, 2000, 6000, 1000, 100); got != 400 {
		t.Fatalf("post-grant cumulative delta target=%d want 400", got)
	}
}
