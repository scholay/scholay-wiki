package vip

import (
	"testing"
	"time"
)

func TestClassifyCodeAtUsesExclusiveDisplayPrecedence(t *testing.T) {
	now := time.Date(2026, 8, 8, 12, 0, 0, 0, time.UTC)
	past := now.Add(-time.Minute)
	future := now.Add(time.Minute)
	revoked := now.Add(-time.Hour)

	tests := []struct {
		name string
		code RedemptionCode
		want codeBatchAvailability
	}{
		{name: "available", code: RedemptionCode{MaxUses: 1, ValidUntil: &future}, want: codeBatchAvailable},
		{name: "expired", code: RedemptionCode{MaxUses: 1, ValidUntil: &past}, want: codeBatchExpired},
		{name: "exhausted wins over expired", code: RedemptionCode{MaxUses: 1, UsedCount: 1, ValidUntil: &past}, want: codeBatchExhausted},
		{name: "revoked wins over exhausted and expired", code: RedemptionCode{MaxUses: 1, UsedCount: 1, ValidUntil: &past, RevokedAt: &revoked}, want: codeBatchRevoked},
		{name: "legacy zero max uses means one", code: RedemptionCode{MaxUses: 0, UsedCount: 0}, want: codeBatchAvailable},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := classifyCodeAt(tt.code, now); got != tt.want {
				t.Fatalf("classifyCodeAt() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestSummarizeCodeBatchCountsWholeBatchAndIgnoresRuntimeStateForMixed(t *testing.T) {
	now := time.Date(2026, 8, 8, 12, 0, 0, 0, time.UTC)
	future := now.Add(24 * time.Hour)
	revoked := now.Add(-time.Hour)
	base := RedemptionCode{
		BatchID: "batch-1", GrantKind: GrantKindTier, GrantTier: TierPro,
		GrantDays: 1, GrantUnit: GrantUnitMonth, MaxUses: 1,
		ValidUntil: &future, Note: "campaign", CreatedAt: now.Add(-time.Hour),
	}
	available := base
	available.ID = 1
	exhausted := base
	exhausted.ID = 2
	exhausted.UsedCount = 1
	revokedCode := base
	revokedCode.ID = 3
	revokedCode.RevokedAt = &revoked

	got := summarizeCodeBatch("batch-1", []RedemptionCode{available, exhausted, revokedCode}, now)
	if got.CodeCount != 3 || got.AvailableCount != 1 || got.ExhaustedCount != 1 || got.RevokedCount != 1 || got.ExpiredCount != 0 {
		t.Fatalf("unexpected mutually-exclusive counts: %+v", got)
	}
	if got.TotalUsedCount != 1 || got.TotalMaxUses != 3 {
		t.Fatalf("unexpected use totals: used=%d max=%d", got.TotalUsedCount, got.TotalMaxUses)
	}
	if got.ConfigVariantCount != 1 || got.Mixed {
		t.Fatalf("runtime state must not split config variants: variants=%d mixed=%v", got.ConfigVariantCount, got.Mixed)
	}
}

func TestSummarizeCodeBatchMarksConfigurationDivergence(t *testing.T) {
	now := time.Date(2026, 8, 8, 12, 0, 0, 0, time.UTC)
	future := now.Add(24 * time.Hour)
	one := RedemptionCode{
		BatchID: "batch-mixed", GrantKind: GrantKindTier, GrantTier: TierPro,
		GrantDays: 1, GrantUnit: GrantUnitMonth, MaxUses: 1, ValidUntil: &future,
	}
	two := one
	two.GrantDays = 2

	got := summarizeCodeBatch("batch-mixed", []RedemptionCode{one, two}, now)
	if got.ConfigVariantCount != 2 || !got.Mixed {
		t.Fatalf("configuration divergence not exposed: variants=%d mixed=%v", got.ConfigVariantCount, got.Mixed)
	}
}

func TestLegacyCodeGetsDeterministicOneCodeBatchID(t *testing.T) {
	code := RedemptionCode{ID: 42}
	if got, want := effectiveCodeBatchID(code), "legacy-00000000000000000042"; got != want {
		t.Fatalf("effectiveCodeBatchID() = %q, want %q", got, want)
	}
	id, ok := legacyCodeIDFromBatchID("legacy-00000000000000000042")
	if !ok || id != 42 {
		t.Fatalf("legacyCodeIDFromBatchID() = (%d,%v), want (42,true)", id, ok)
	}
}

func TestBatchKeywordEscapesLikeWildcards(t *testing.T) {
	if got, want := escapeCodeBatchLike(`summer_100%\vip`), `summer\_100\%\\vip`; got != want {
		t.Fatalf("escapeCodeBatchLike() = %q, want %q", got, want)
	}
}
