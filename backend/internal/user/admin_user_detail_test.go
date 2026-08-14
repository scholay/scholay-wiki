package user

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"
	"time"
)

func TestToAdminUserDetailViewMapsAllDisplayFields(t *testing.T) {
	createdAt := time.Date(2026, 7, 1, 9, 10, 11, 0, time.UTC)
	updatedAt := time.Date(2026, 7, 2, 10, 11, 12, 0, time.UTC)
	frozenAt := time.Date(2026, 7, 3, 11, 12, 13, 0, time.UTC)
	lastLoginAt := time.Date(2026, 7, 4, 12, 13, 14, 0, time.UTC)
	lastActiveAt := time.Date(2026, 7, 5, 13, 14, 15, 0, time.UTC)
	vipExpiresAt := time.Date(2027, 7, 1, 9, 10, 11, 0, time.UTC)
	providerCreatedAt := time.Date(2026, 7, 1, 9, 15, 0, 0, time.UTC)

	username := "alice"
	email := "alice@example.com"
	phone := "+8613800000000"
	avatarURL := "https://cdn.example.com/alice.png"
	bio := "AI researcher"
	lastLoginIP := "203.0.113.8"
	vipTier := "max"
	passwordHash := "must-not-leak-password-hash"
	legacyAdminID := uint(99)
	providerUnionID := "must-not-leak-union-id"
	providerData := `{"access_token":"must-not-leak-provider-payload"}`

	u := User{
		ID:             42,
		Username:       &username,
		Email:          &email,
		Phone:          &phone,
		PasswordHash:   &passwordHash,
		AvatarURL:      &avatarURL,
		Bio:            &bio,
		Role:           "operations",
		LegacyAdminID:  &legacyAdminID,
		Status:         2,
		FrozenAt:       &frozenAt,
		FrozenReason:   "risk review",
		AdminNotes:     "support case 123",
		EmailVerified:  true,
		PhoneVerified:  true,
		RegisterSource: "wechat_miniprogram",
		LastLoginAt:    &lastLoginAt,
		LastLoginIP:    &lastLoginIP,
		LastActiveAt:   &lastActiveAt,
		VIPTier:        &vipTier,
		VIPExpiresAt:   &vipExpiresAt,
		CreatedAt:      createdAt,
		UpdatedAt:      updatedAt,
	}
	providers := []UserAuthProvider{{
		ID:              7,
		UserID:          u.ID,
		Provider:        "wechat",
		ProviderUserID:  "must-not-leak-open-id",
		ProviderUnionID: &providerUnionID,
		ProviderData:    &providerData,
		CreatedAt:       providerCreatedAt,
		UpdatedAt:       updatedAt,
	}}

	got := toAdminUserDetailView(u, providers)
	want := adminUserDetailView{
		ID:             u.ID,
		Username:       u.Username,
		Email:          u.Email,
		Phone:          u.Phone,
		AvatarURL:      u.AvatarURL,
		Bio:            u.Bio,
		Role:           u.Role,
		Status:         u.Status,
		FrozenAt:       u.FrozenAt,
		FrozenReason:   u.FrozenReason,
		AdminNotes:     u.AdminNotes,
		EmailVerified:  u.EmailVerified,
		PhoneVerified:  u.PhoneVerified,
		LastLoginAt:    u.LastLoginAt,
		LastLoginIP:    u.LastLoginIP,
		LastActiveAt:   u.LastActiveAt,
		VIPTier:        u.VIPTier,
		VIPExpiresAt:   u.VIPExpiresAt,
		RegisterSource: u.RegisterSource,
		CreatedAt:      u.CreatedAt,
		UpdatedAt:      u.UpdatedAt,
		AuthProviders: []adminUserAuthProviderView{{
			Provider:  "wechat",
			CreatedAt: providerCreatedAt,
		}},
	}

	if !reflect.DeepEqual(got, want) {
		t.Fatalf("detail mapping mismatch\n got: %#v\nwant: %#v", got, want)
	}
}

func TestAdminUserDetailViewJSONContractExcludesSensitiveFields(t *testing.T) {
	createdAt := time.Date(2026, 7, 1, 9, 10, 11, 0, time.UTC)
	username := "alice"
	passwordHash := "must-not-leak-password-hash"
	legacyAdminID := uint(99)
	providerUnionID := "must-not-leak-union-id"
	providerData := `{"access_token":"must-not-leak-provider-payload"}`

	view := toAdminUserDetailView(User{
		ID:            42,
		Username:      &username,
		PasswordHash:  &passwordHash,
		LegacyAdminID: &legacyAdminID,
		Role:          "user",
		Status:        1,
		CreatedAt:     createdAt,
		UpdatedAt:     createdAt,
	}, []UserAuthProvider{{
		ID:              7,
		UserID:          42,
		Provider:        "github",
		ProviderUserID:  "must-not-leak-provider-user-id",
		ProviderUnionID: &providerUnionID,
		ProviderData:    &providerData,
		CreatedAt:       createdAt,
		UpdatedAt:       createdAt,
	}})

	raw, err := json.Marshal(view)
	if err != nil {
		t.Fatalf("marshal detail view: %v", err)
	}

	var payload map[string]json.RawMessage
	if err := json.Unmarshal(raw, &payload); err != nil {
		t.Fatalf("decode detail view: %v", err)
	}

	wantTopLevelKeys := []string{
		"id", "username", "email", "phone", "avatar_url", "bio", "role", "status",
		"frozen_at", "frozen_reason", "admin_notes", "email_verified", "phone_verified",
		"last_login_at", "last_login_ip", "last_active_at", "vip_tier", "vip_expires_at",
		"register_source", "created_at", "updated_at", "auth_providers",
	}
	if len(payload) != len(wantTopLevelKeys) {
		t.Fatalf("unexpected top-level JSON keys: got %d (%s), want %d", len(payload), string(raw), len(wantTopLevelKeys))
	}
	for _, key := range wantTopLevelKeys {
		if _, ok := payload[key]; !ok {
			t.Errorf("missing required JSON field %q", key)
		}
	}

	var providerPayloads []map[string]json.RawMessage
	if err := json.Unmarshal(payload["auth_providers"], &providerPayloads); err != nil {
		t.Fatalf("decode auth providers: %v", err)
	}
	if len(providerPayloads) != 1 {
		t.Fatalf("auth provider count = %d, want 1", len(providerPayloads))
	}
	wantProviderKeys := map[string]struct{}{"provider": {}, "created_at": {}}
	if len(providerPayloads[0]) != len(wantProviderKeys) {
		t.Fatalf("unexpected auth-provider JSON fields: %s", string(payload["auth_providers"]))
	}
	for key := range wantProviderKeys {
		if _, ok := providerPayloads[0][key]; !ok {
			t.Errorf("missing auth-provider JSON field %q", key)
		}
	}

	jsonText := string(raw)
	for _, forbidden := range []string{
		"password_hash", "legacy_admin_id", "provider_user_id", "provider_union_id", "provider_data",
		passwordHash, "must-not-leak-provider-user-id", providerUnionID, "must-not-leak-provider-payload",
	} {
		if strings.Contains(jsonText, forbidden) {
			t.Errorf("sensitive field/value %q leaked in JSON: %s", forbidden, jsonText)
		}
	}
}

func TestToAdminUserDetailViewUsesEmptyProviderArray(t *testing.T) {
	view := toAdminUserDetailView(User{}, nil)
	raw, err := json.Marshal(view)
	if err != nil {
		t.Fatalf("marshal detail view: %v", err)
	}
	if !strings.Contains(string(raw), `"auth_providers":[]`) {
		t.Fatalf("auth_providers must be an empty array, got %s", string(raw))
	}
}
