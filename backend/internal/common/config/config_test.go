package config

import (
	"os"
	"testing"
)

func TestLoad_DevelopmentAllowsDefaultSecret(t *testing.T) {
	os.Setenv("SIGNOZ_ENVIRONMENT", "development")
	defer os.Unsetenv("SIGNOZ_ENVIRONMENT")
	os.Unsetenv("JWT_SECRET")

	cfg := Load()

	if cfg.JWT.Secret != defaultJWTSecret {
		t.Errorf("expected default secret in development, got %s", cfg.JWT.Secret)
	}
}

func TestLoad_CustomJWTSecret(t *testing.T) {
	os.Setenv("JWT_SECRET", "my-custom-secret-long-enough")
	os.Setenv("SIGNOZ_ENVIRONMENT", "development")
	defer os.Unsetenv("JWT_SECRET")
	defer os.Unsetenv("SIGNOZ_ENVIRONMENT")

	cfg := Load()

	if cfg.JWT.Secret != "my-custom-secret-long-enough" {
		t.Errorf("expected custom secret, got %s", cfg.JWT.Secret)
	}
}

func TestGetEnv_DefaultValue(t *testing.T) {
	os.Unsetenv("TEST_NONEXISTENT_VAR")
	val := getEnv("TEST_NONEXISTENT_VAR", "default_value")
	if val != "default_value" {
		t.Errorf("expected 'default_value', got '%s'", val)
	}
}

func TestGetEnv_OverrideValue(t *testing.T) {
	os.Setenv("TEST_VAR", "override")
	defer os.Unsetenv("TEST_VAR")

	val := getEnv("TEST_VAR", "default")
	if val != "override" {
		t.Errorf("expected 'override', got '%s'", val)
	}
}

func TestGetEnvAsInt(t *testing.T) {
	os.Setenv("TEST_INT", "42")
	defer os.Unsetenv("TEST_INT")

	val := getEnvAsInt("TEST_INT", 0)
	if val != 42 {
		t.Errorf("expected 42, got %d", val)
	}

	val = getEnvAsInt("TEST_NONEXISTENT", 99)
	if val != 99 {
		t.Errorf("expected default 99, got %d", val)
	}
}

func TestGetEnvAsBool(t *testing.T) {
	os.Setenv("TEST_BOOL", "true")
	defer os.Unsetenv("TEST_BOOL")

	val := getEnvAsBool("TEST_BOOL", false)
	if !val {
		t.Error("expected true")
	}

	val = getEnvAsBool("TEST_NONEXISTENT", false)
	if val {
		t.Error("expected default false")
	}
}
