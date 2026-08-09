package invite

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestCampaignPublicCacheSupportsETagRevalidation(t *testing.T) {
	gin.SetMode(gin.TestMode)
	view := PublicCampaign{Enabled: true, BindWindowDays: 7}

	firstRecorder := httptest.NewRecorder()
	first, _ := gin.CreateTestContext(firstRecorder)
	first.Request = httptest.NewRequest(http.MethodGet, "/api/v1/invite/campaign", nil)
	if setCampaignPublicCache(first, view) {
		t.Fatal("first response unexpectedly returned not modified")
	}
	etag := firstRecorder.Header().Get("ETag")
	if etag == "" {
		t.Fatal("missing ETag")
	}
	if got := firstRecorder.Header().Get("Cache-Control"); got != "public, max-age=60, must-revalidate" {
		t.Fatalf("Cache-Control = %q", got)
	}

	secondRecorder := httptest.NewRecorder()
	second, _ := gin.CreateTestContext(secondRecorder)
	second.Request = httptest.NewRequest(http.MethodGet, "/api/v1/invite/campaign", nil)
	second.Request.Header.Set("If-None-Match", etag)
	if !setCampaignPublicCache(second, view) {
		t.Fatal("matching ETag should return not modified")
	}
	if second.Writer.Status() != http.StatusNotModified {
		t.Fatalf("status = %d, want 304", second.Writer.Status())
	}
}
