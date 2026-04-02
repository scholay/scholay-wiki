package middleware

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"scholar-backend/internal/common/config"
	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

func init() {
	gin.SetMode(gin.TestMode)
	config.AppConfig = &config.Config{
		JWT: config.JWTConfig{Secret: "test-secret-key-for-middleware-tests"},
	}
}

type stubSessionValidator struct {
	valid bool
}

func (s *stubSessionValidator) ValidateSession(_ context.Context, _ string) bool {
	return s.valid
}
func (s *stubSessionValidator) InvalidateSession(_ string)       {}
func (s *stubSessionValidator) InvalidateUserSessions(_ uint)    {}

func makeValidToken(t *testing.T, userType, role string) string {
	t.Helper()
	token, err := utils.GenerateTokenWithRole(1, "testuser", userType, role)
	if err != nil {
		t.Fatalf("failed to generate token: %v", err)
	}
	return token
}

func makeExpiredToken(t *testing.T) string {
	t.Helper()
	claims := utils.Claims{
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
	return signed
}

func setupRouter(requiredType string) *gin.Engine {
	router := gin.New()
	router.Use(AuthMiddleware(requiredType))
	router.GET("/test", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"user_id":   c.GetUint("user_id"),
			"user_type": c.GetString("user_type"),
			"user_role": c.GetString("user_role"),
		})
	})
	return router
}

func TestAuthMiddleware_NoToken(t *testing.T) {
	t.Parallel()
	SetSessionValidator(&stubSessionValidator{valid: true})
	defer SetSessionValidator(nil)

	router := setupRouter("user")
	req := httptest.NewRequest("GET", "/test", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestAuthMiddleware_InvalidToken(t *testing.T) {
	t.Parallel()
	SetSessionValidator(&stubSessionValidator{valid: true})
	defer SetSessionValidator(nil)

	router := setupRouter("user")
	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("Authorization", "Bearer invalid.token.here")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestAuthMiddleware_ExpiredToken(t *testing.T) {
	t.Parallel()
	SetSessionValidator(&stubSessionValidator{valid: true})
	defer SetSessionValidator(nil)

	router := setupRouter("user")
	token := makeExpiredToken(t)
	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestAuthMiddleware_ValidUserToken(t *testing.T) {
	t.Parallel()
	SetSessionValidator(&stubSessionValidator{valid: true})
	defer SetSessionValidator(nil)

	router := setupRouter("user")
	token := makeValidToken(t, "user", "user")
	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", w.Code, http.StatusOK)
	}

	var body map[string]any
	json.Unmarshal(w.Body.Bytes(), &body)
	if body["user_role"] != "user" {
		t.Errorf("user_role = %v, want user", body["user_role"])
	}
}

func TestAuthMiddleware_AdminRequired_UserToken(t *testing.T) {
	t.Parallel()
	SetSessionValidator(&stubSessionValidator{valid: true})
	defer SetSessionValidator(nil)

	router := setupRouter("admin")
	token := makeValidToken(t, "user", "user")
	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestAuthMiddleware_AdminRequired_AdminRole(t *testing.T) {
	t.Parallel()
	SetSessionValidator(&stubSessionValidator{valid: true})
	defer SetSessionValidator(nil)

	router := setupRouter("admin")
	token := makeValidToken(t, "user", "admin")
	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", w.Code, http.StatusOK)
	}
}

func TestAuthMiddleware_SessionInvalid(t *testing.T) {
	t.Parallel()
	SetSessionValidator(&stubSessionValidator{valid: false})
	defer SetSessionValidator(nil)

	router := setupRouter("user")
	token := makeValidToken(t, "user", "user")
	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Logf("body: %s", w.Body.String())
	}
	var body map[string]any
	json.Unmarshal(w.Body.Bytes(), &body)
	if code, ok := body["code"].(float64); !ok || code != 2019 {
		t.Errorf("expected code 2019, got %v", body["code"])
	}
}

func TestAuthMiddleware_TokenFromQueryParam(t *testing.T) {
	t.Parallel()
	SetSessionValidator(&stubSessionValidator{valid: true})
	defer SetSessionValidator(nil)

	router := setupRouter("user")
	token := makeValidToken(t, "user", "user")
	req := httptest.NewRequest("GET", "/test?token="+token, nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", w.Code, http.StatusOK)
	}
}
