package utils

import (
	"testing"
	"time"

	"scholar-backend/internal/common/config"

	"github.com/golang-jwt/jwt/v5"
)

func init() {
	config.AppConfig = &config.Config{
		JWT: config.JWTConfig{Secret: "test-secret-key-for-unit-tests"},
	}
}

func TestGenerateAndParseToken(t *testing.T) {
	t.Parallel()

	token, err := GenerateToken(42, "alice", "user")
	if err != nil {
		t.Fatalf("GenerateToken() error = %v", err)
	}
	if token == "" {
		t.Fatal("GenerateToken() returned empty token")
	}

	claims, err := ParseToken(token)
	if err != nil {
		t.Fatalf("ParseToken() error = %v", err)
	}

	if claims.UserID != 42 {
		t.Errorf("UserID = %d, want 42", claims.UserID)
	}
	if claims.Username != "alice" {
		t.Errorf("Username = %q, want %q", claims.Username, "alice")
	}
	if claims.Type != "user" {
		t.Errorf("Type = %q, want %q", claims.Type, "user")
	}
	if claims.Role != "user" {
		t.Errorf("Role = %q, want %q", claims.Role, "user")
	}
}

func TestGenerateTokenWithRole_AdminRole(t *testing.T) {
	t.Parallel()

	token, err := GenerateTokenWithRole(1, "admin", "user", "admin")
	if err != nil {
		t.Fatalf("GenerateTokenWithRole() error = %v", err)
	}

	claims, err := ParseToken(token)
	if err != nil {
		t.Fatalf("ParseToken() error = %v", err)
	}
	if claims.Role != "admin" {
		t.Errorf("Role = %q, want %q", claims.Role, "admin")
	}
}

func TestGenerateTokenWithSession(t *testing.T) {
	t.Parallel()

	token, err := GenerateTokenWithSession(10, "bob", "user", "sess-abc-123")
	if err != nil {
		t.Fatalf("GenerateTokenWithSession() error = %v", err)
	}

	claims, err := ParseToken(token)
	if err != nil {
		t.Fatalf("ParseToken() error = %v", err)
	}
	if claims.SessionID != "sess-abc-123" {
		t.Errorf("SessionID = %q, want %q", claims.SessionID, "sess-abc-123")
	}
}

func TestParseToken_InvalidToken(t *testing.T) {
	t.Parallel()

	_, err := ParseToken("this.is.invalid")
	if err == nil {
		t.Error("ParseToken() expected error for invalid token")
	}
}

func TestParseToken_ExpiredToken(t *testing.T) {
	t.Parallel()

	claims := Claims{
		UserID:   1,
		Username: "expired",
		Type:     "user",
		Role:     "user",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(-1 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now().Add(-49 * time.Hour)),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(config.AppConfig.JWT.Secret))
	if err != nil {
		t.Fatal(err)
	}

	_, err = ParseToken(signed)
	if err == nil {
		t.Error("ParseToken() expected error for expired token")
	}
}

func TestParseTokenIgnoreExpiry(t *testing.T) {
	t.Parallel()

	claims := Claims{
		UserID:   99,
		Username: "expired-user",
		Type:     "user",
		Role:     "user",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(-1 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now().Add(-49 * time.Hour)),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(config.AppConfig.JWT.Secret))
	if err != nil {
		t.Fatal(err)
	}

	result, err := ParseTokenIgnoreExpiry(signed)
	if err != nil {
		t.Fatalf("ParseTokenIgnoreExpiry() error = %v", err)
	}
	if result.UserID != 99 {
		t.Errorf("UserID = %d, want 99", result.UserID)
	}
}

func TestParseToken_WrongSigningMethod(t *testing.T) {
	t.Parallel()

	claims := Claims{
		UserID: 1,
		Type:   "user",
		Role:   "user",
	}
	token := jwt.NewWithClaims(jwt.SigningMethodNone, claims)
	signed, _ := token.SignedString(jwt.UnsafeAllowNoneSignatureType)

	_, err := ParseToken(signed)
	if err == nil {
		t.Error("ParseToken() expected error for none signing method")
	}
}

func TestGetTokenRemainingTime(t *testing.T) {
	t.Parallel()

	token, _ := GenerateToken(1, "test", "user")
	claims, _ := ParseToken(token)

	remaining := GetTokenRemainingTime(claims)
	if remaining <= 0 || remaining > TokenExpiration {
		t.Errorf("remaining = %v, want between 0 and %v", remaining, TokenExpiration)
	}
}

func TestShouldRefreshToken(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		expiry   time.Duration
		expected bool
	}{
		{"fresh token", 24 * time.Hour, false},
		{"near expiry", 1 * time.Hour, true},
		{"at threshold", TokenRefreshThreshold, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			claims := &Claims{
				RegisteredClaims: jwt.RegisteredClaims{
					ExpiresAt: jwt.NewNumericDate(time.Now().Add(tt.expiry)),
				},
			}
			if got := ShouldRefreshToken(claims); got != tt.expected {
				t.Errorf("ShouldRefreshToken() = %v, want %v", got, tt.expected)
			}
		})
	}
}

func TestDefaultRoleForType(t *testing.T) {
	t.Parallel()

	if got := defaultRoleForType("admin"); got != "admin" {
		t.Errorf("defaultRoleForType(admin) = %q, want admin", got)
	}
	if got := defaultRoleForType("user"); got != "user" {
		t.Errorf("defaultRoleForType(user) = %q, want user", got)
	}
	if got := defaultRoleForType("anything"); got != "user" {
		t.Errorf("defaultRoleForType(anything) = %q, want user", got)
	}
}
