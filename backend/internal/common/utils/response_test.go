package utils

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func setupRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	return gin.New()
}

func TestSuccess(t *testing.T) {
	r := setupRouter()
	r.GET("/test", func(c *gin.Context) {
		Success(c, map[string]string{"key": "value"})
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/test", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	var resp Response
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if resp.Code != 0 {
		t.Errorf("expected code 0, got %d", resp.Code)
	}
	if resp.Message != "success" {
		t.Errorf("expected message 'success', got '%s'", resp.Message)
	}
}

func TestError(t *testing.T) {
	r := setupRouter()
	r.GET("/test", func(c *gin.Context) {
		Error(c, 1001, "something went wrong")
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/test", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200 (business error), got %d", w.Code)
	}

	var resp Response
	json.Unmarshal(w.Body.Bytes(), &resp)

	if resp.Code != 1001 {
		t.Errorf("expected code 1001, got %d", resp.Code)
	}
}

func TestUnauthorized(t *testing.T) {
	r := setupRouter()
	r.GET("/test", func(c *gin.Context) {
		Unauthorized(c, "not authorized")
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/test", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected status 401, got %d", w.Code)
	}
}

func TestTooManyRequests(t *testing.T) {
	r := setupRouter()
	r.GET("/test", func(c *gin.Context) {
		TooManyRequests(c, "slow down")
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/test", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusTooManyRequests {
		t.Errorf("expected status 429, got %d", w.Code)
	}

	var resp Response
	json.Unmarshal(w.Body.Bytes(), &resp)

	if resp.Code != 429 {
		t.Errorf("expected code 429, got %d", resp.Code)
	}
}

func TestBadRequest(t *testing.T) {
	r := setupRouter()
	r.GET("/test", func(c *gin.Context) {
		BadRequest(c, "bad input")
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/test", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", w.Code)
	}
}

func TestForbidden(t *testing.T) {
	r := setupRouter()
	r.GET("/test", func(c *gin.Context) {
		Forbidden(c, "access denied")
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/test", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("expected status 403, got %d", w.Code)
	}
}

func TestInternalError(t *testing.T) {
	r := setupRouter()
	r.GET("/test", func(c *gin.Context) {
		InternalError(c, "internal error")
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/test", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("expected status 500, got %d", w.Code)
	}
}
