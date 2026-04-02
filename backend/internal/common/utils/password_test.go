package utils

import (
	"testing"
)

func TestHashPassword(t *testing.T) {
	t.Parallel()

	hash, err := HashPassword("mypassword123")
	if err != nil {
		t.Fatalf("HashPassword() error = %v", err)
	}
	if hash == "" {
		t.Fatal("HashPassword() returned empty hash")
	}
	if hash == "mypassword123" {
		t.Fatal("HashPassword() returned plaintext password")
	}
}

func TestCheckPassword_Valid(t *testing.T) {
	t.Parallel()

	hash, _ := HashPassword("secret")
	if !CheckPassword("secret", hash) {
		t.Error("CheckPassword() returned false for correct password")
	}
}

func TestCheckPassword_Invalid(t *testing.T) {
	t.Parallel()

	hash, _ := HashPassword("correct")
	if CheckPassword("wrong", hash) {
		t.Error("CheckPassword() returned true for wrong password")
	}
}

func TestCheckPassword_EmptyInputs(t *testing.T) {
	t.Parallel()

	hash, _ := HashPassword("notempty")
	if CheckPassword("", hash) {
		t.Error("CheckPassword() should fail for empty password")
	}

	if CheckPassword("notempty", "") {
		t.Error("CheckPassword() should fail for empty hash")
	}
}

func TestHashPassword_DifferentHashes(t *testing.T) {
	t.Parallel()

	h1, _ := HashPassword("samepassword")
	h2, _ := HashPassword("samepassword")
	if h1 == h2 {
		t.Error("HashPassword() should produce different hashes for same password (bcrypt uses random salt)")
	}
}
