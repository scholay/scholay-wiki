package middleware

import (
	"testing"
)

func TestHashToken(t *testing.T) {
	token := "test-token-value"
	hash1 := hashToken(token)
	hash2 := hashToken(token)

	if hash1 != hash2 {
		t.Errorf("hashToken should be deterministic: got %s and %s", hash1, hash2)
	}

	if len(hash1) != 32 {
		t.Errorf("hashToken should return 32 hex chars, got %d", len(hash1))
	}

	different := hashToken("different-token")
	if hash1 == different {
		t.Error("different tokens should produce different hashes")
	}
}
