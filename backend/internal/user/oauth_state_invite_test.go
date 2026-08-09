package user

import (
	"context"
	"net/url"
	"strconv"
	"testing"

	"scholar-backend/internal/common/middleware"
)

func TestOAuthStatePayloadCarriesNormalizedInviteCandidate(t *testing.T) {
	ctx := middleware.ContextWithInviteCode(context.Background(), " ab0ol2 ")
	payload := encodeOAuthStatePayload(ctx)
	restored, ok := restoreOAuthStatePayload(context.Background(), payload)
	if !ok {
		t.Fatal("generated state payload should restore")
	}
	if got := middleware.InviteCodeFromContext(restored); got != "AB0OL2" {
		t.Fatalf("restored invite code=%q want AB0OL2", got)
	}
}

func TestAppleLoginResultURLCarriesRealUserID(t *testing.T) {
	raw := appleLoginResultURL("https://www.scholay.com", "jwt value", 42, true, "state value")
	u, err := url.Parse(raw)
	if err != nil {
		t.Fatal(err)
	}
	if got := u.Query().Get("user_id"); got != strconv.FormatUint(42, 10) {
		t.Fatalf("user_id=%q want 42", got)
	}
	if u.Query().Get("is_new_user") != "true" || u.Query().Get("token") != "jwt value" {
		t.Fatalf("unexpected Apple callback query: %s", u.RawQuery)
	}
}

func TestOAuthStatePayloadLegacyInvalidAndNoCandidate(t *testing.T) {
	if got := encodeOAuthStatePayload(context.Background()); got != "1" {
		t.Fatalf("empty state payload=%q want legacy-compatible 1", got)
	}
	if _, ok := restoreOAuthStatePayload(context.Background(), "1"); !ok {
		t.Fatal("legacy in-flight state must remain valid")
	}
	if _, ok := restoreOAuthStatePayload(context.Background(), "not-json"); ok {
		t.Fatal("tampered state payload must be rejected")
	}
}
