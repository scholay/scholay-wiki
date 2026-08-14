package seo

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestAnonymousExposeCannotPersistUnverifiedSEOSeeds(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := NewHandler(nil) // nil is intentional: compatibility ACK must never touch the repository.
	router := gin.New()
	router.POST("/api/v1/public/seo/expose", h.ExposeSeeds)

	payload := `{
		"detail_papers":[{
			"paper_id":"attacker-id",
			"title":"Injected SEO spam",
			"abstract":"Fake substantive content",
			"source":"evil"
		}],
		"authors":[{
			"author_id":"attacker-author",
			"name":"Fake Author",
			"citation_count":999999
		}],
		"journals":[{
			"journal_id":999999,
			"canonical_name":"Fake Journal",
			"publisher":"Injected Publisher"
		}]
	}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/public/seo/expose", strings.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	got := httptest.NewRecorder()
	router.ServeHTTP(got, req)

	if got.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", got.Code, got.Body.String())
	}
	for _, want := range []string{`"accepted":false`, `"reason":"server_verified_sources_only"`} {
		if !strings.Contains(got.Body.String(), want) {
			t.Fatalf("compatibility endpoint did not reject persistence (%s): %s", want, got.Body.String())
		}
	}
}
