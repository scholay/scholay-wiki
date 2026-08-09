package config

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestPublicSystemConfigCacheRequiresRevalidation(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/v1/config/system", nil)

	setPublicSystemConfigCache(ctx)

	cacheControl := recorder.Header().Get("Cache-Control")
	if cacheControl != "public, max-age=60, must-revalidate" {
		t.Fatalf("Cache-Control = %q", cacheControl)
	}
	if strings.Contains(cacheControl, "stale-while-revalidate") {
		t.Fatalf("auth-critical config must not permit stale reuse: %q", cacheControl)
	}
}
