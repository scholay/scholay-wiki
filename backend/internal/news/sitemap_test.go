package news

import (
	"bytes"
	"encoding/json"
	"encoding/xml"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
)

func TestIsValidNewsSlugCompatibilityAndBoundaries(t *testing.T) {
	tests := []struct {
		name string
		slug string
		want bool
	}{
		{name: "upstream date prefix", slug: "2026-06-12-new-ai-model", want: true},
		{name: "all RFC3986 unreserved forms", slug: "News_v2.final~draft", want: true},
		{name: "max database length", slug: strings.Repeat("a", maxNewsSlugLength), want: true},
		{name: "empty", slug: "", want: false},
		{name: "too long", slug: strings.Repeat("a", maxNewsSlugLength+1), want: false},
		{name: "slash creates another segment", slug: "good/child", want: false},
		{name: "backslash is not URL safe", slug: `good\child`, want: false},
		{name: "encoded slash is not a canonical slug", slug: "good%2Fchild", want: false},
		{name: "query delimiter", slug: "good?preview=1", want: false},
		{name: "fragment delimiter", slug: "good#section", want: false},
		{name: "XML delimiter", slug: "good&bad", want: false},
		{name: "nginx static script suffix", slug: "release.v2.js", want: false},
		{name: "nginx static image suffix case insensitive", slug: "release.PNG", want: false},
		{name: "SSR scanner suffix XML", slug: "release.xml", want: false},
		{name: "SSR scanner suffix PHP", slug: "release.PHP", want: false},
		{name: "space", slug: "good bad", want: false},
		{name: "non ASCII", slug: "学术新闻", want: false},
		{name: "dot segment", slug: ".", want: false},
		{name: "parent dot segment", slug: "..", want: false},
		{name: "hidden-file prefix", slug: ".published-news", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isValidNewsSlug(tt.slug); got != tt.want {
				t.Fatalf("isValidNewsSlug(%q) = %v, want %v", tt.slug, got, tt.want)
			}
		})
	}
}

func TestProcessContentRejectsMissingTitle(t *testing.T) {
	raw, err := json.Marshal(map[string]any{
		"event": "news.created",
		"item": map[string]any{
			"id":    "ba9aaea7-d6ef-4b5e-b8a8-1730b1921918",
			"slug":  "2026-06-12-valid-slug",
			"title": " \t\n",
		},
	})
	if err != nil {
		t.Fatal(err)
	}

	svc := &Service{}
	if err := svc.ProcessContent(raw); !errors.Is(err, ErrBadPayload) {
		t.Fatalf("ProcessContent() error = %v, want ErrBadPayload", err)
	}
}

func TestProcessContentRejectsInvalidSlugForCreateAndUpdate(t *testing.T) {
	for _, event := range []string{"news.created", "news.updated"} {
		t.Run(event, func(t *testing.T) {
			raw, err := json.Marshal(map[string]any{
				"event": event,
				"item": map[string]any{
					"id":    "ba9aaea7-d6ef-4b5e-b8a8-1730b1921918",
					"slug":  "2026-06-12/poisoned-sitemap.xml",
					"title": "A valid title",
				},
			})
			if err != nil {
				t.Fatal(err)
			}

			// nil repo is intentional: validation must reject the payload before any write.
			svc := &Service{}
			if err := svc.ProcessContent(raw); !errors.Is(err, ErrBadPayload) {
				t.Fatalf("ProcessContent() error = %v, want ErrBadPayload", err)
			}
		})
	}
}

func TestSitemapEntriesFromItemsExcludesHistoricalInvalidSlugs(t *testing.T) {
	updated := time.Date(2026, time.August, 9, 15, 0, 0, 0, time.UTC)
	items := []NewsItem{
		{Slug: "2026-08-09-valid-news", Title: "First", UpstreamUpdatedAt: &updated},
		{Slug: "2026-08-09/extra-segment", Title: "Invalid slug", UpstreamUpdatedAt: &updated},
		{Slug: "2026-08-09-valid_second", Title: "Second", UpstreamUpdatedAt: &updated},
		{Slug: "2026-08-09-invalid?preview=1", Title: "Invalid slug", UpstreamUpdatedAt: &updated},
		{Slug: "2026-08-09-valid-but-empty-title", Title: "  ", UpstreamUpdatedAt: &updated},
		{Slug: "2026-08-09-static.js", Title: "Unroutable", UpstreamUpdatedAt: &updated},
	}

	got := sitemapEntriesFromItems(items)
	if len(got) != 2 {
		t.Fatalf("sitemapEntriesFromItems() returned %d entries, want 2: %#v", len(got), got)
	}
	if got[0].Slug != "2026-08-09-valid-news" || got[1].Slug != "2026-08-09-valid_second" {
		t.Fatalf("unexpected sitemap slugs/order: %#v", got)
	}
	if got[0].LastMod != "2026-08-09" || got[1].LastMod != "2026-08-09" {
		t.Fatalf("unexpected lastmod values: %#v", got)
	}
}

func TestSitemapEntriesPropagatesConfigRepositoryError(t *testing.T) {
	db, err := gorm.Open(mysql.New(mysql.Config{
		DSN:                       "gorm:gorm@tcp(127.0.0.1:1)/gorm?charset=utf8mb4&parseTime=True&loc=Local",
		SkipInitializeWithVersion: true,
	}), &gorm.Config{DryRun: true, DisableAutomaticPing: true})
	if err != nil {
		t.Fatalf("create dry-run database: %v", err)
	}
	wantErr := errors.New("config repository unavailable")
	db.AddError(wantErr)

	svc := NewService(NewRepository(db))
	if _, gotErr := svc.SitemapEntries(); !errors.Is(gotErr, wantErr) {
		t.Fatalf("SitemapEntries() error = %v, want %v", gotErr, wantErr)
	}
}

func TestNewsSitemapLocationEscapesOnePathSegment(t *testing.T) {
	got := newsSitemapLocation("https://example.test/", "one/two ?#")
	want := "https://example.test/news/one%2Ftwo%20%3F%23"
	if got != want {
		t.Fatalf("newsSitemapLocation() = %q, want %q", got, want)
	}
}

func TestMarshalNewsSitemapEscapesXMLAndDropsInvalidSlug(t *testing.T) {
	body, err := marshalNewsSitemap("https://example.test/root&branch", []SitemapEntry{
		{Slug: "2026-08-09-valid", LastMod: "2026-08-09"},
		{Slug: "bad/path", LastMod: "2026-08-09"},
	})
	if err != nil {
		t.Fatal(err)
	}
	raw := string(body)
	if !strings.Contains(raw, "<loc>https://example.test/root&amp;branch/news/2026-08-09-valid</loc>") {
		t.Fatalf("XML location was not escaped correctly:\n%s", raw)
	}
	if strings.Contains(raw, "bad/path") || strings.Contains(raw, "bad%2Fpath") {
		t.Fatalf("invalid slug entered sitemap:\n%s", raw)
	}

	var parsed newsSitemapURLSet
	if err := xml.Unmarshal(body, &parsed); err != nil {
		t.Fatalf("generated sitemap is not valid XML: %v\n%s", err, raw)
	}
	if len(parsed.URLs) != 2 {
		t.Fatalf("parsed sitemap contains %d URLs, want hub + 1 detail", len(parsed.URLs))
	}
	if parsed.URLs[0].Loc != "https://example.test/root&branch/news" ||
		parsed.URLs[1].Loc != "https://example.test/root&branch/news/2026-08-09-valid" {
		t.Fatalf("parsed locations = %#v", parsed.URLs)
	}
}

func TestMarshalNewsSitemapOmitsHubWhenFeatureHasNoEligibleNews(t *testing.T) {
	body, err := marshalNewsSitemap("https://example.test", []SitemapEntry{{Slug: "bad/path"}})
	if err != nil {
		t.Fatal(err)
	}
	var parsed newsSitemapURLSet
	if err := xml.Unmarshal(body, &parsed); err != nil {
		t.Fatalf("generated sitemap is not valid XML: %v", err)
	}
	if len(parsed.URLs) != 0 {
		t.Fatalf("empty news feature published URLs: %#v", parsed.URLs)
	}
}

func TestMarshalNewsSitemapNeverExceedsProtocolURLLimit(t *testing.T) {
	entries := make([]SitemapEntry, 50000)
	for i := range entries {
		entries[i] = SitemapEntry{Slug: fmt.Sprintf("news-%d", i+1), LastMod: "2026-08-10"}
	}
	body, err := marshalNewsSitemap("https://example.test", entries)
	if err != nil {
		t.Fatal(err)
	}
	if got := bytes.Count(body, []byte("<url>")); got != 50000 {
		t.Fatalf("sitemap URL count=%d, want protocol maximum 50000 (hub + 49999 details)", got)
	}
}

func TestServeNewsSitemapRepositoryFailureReturns500(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/sitemap-news.xml", nil)
	handler := &Handler{sitemapEntriesFn: func() ([]SitemapEntry, error) {
		return nil, errors.New("repository unavailable")
	}}

	handler.ServeNewsSitemap(ctx)

	if recorder.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusInternalServerError)
	}
	if recorder.Body.Len() != 0 {
		t.Fatalf("repository failure published a misleading body: %q", recorder.Body.String())
	}
}

func TestServeNewsSitemapSuccessHeadersAndXML(t *testing.T) {
	t.Setenv("SEO_BASE_URL", "https://example.test/")
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/sitemap-news.xml", nil)
	handler := &Handler{sitemapEntriesFn: func() ([]SitemapEntry, error) {
		return []SitemapEntry{{Slug: "2026-08-09-valid", LastMod: "2026-08-09"}}, nil
	}}

	handler.ServeNewsSitemap(ctx)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}
	if got := recorder.Header().Get("Content-Type"); got != "application/xml; charset=utf-8" {
		t.Fatalf("Content-Type = %q", got)
	}
	if !strings.Contains(recorder.Body.String(), "<loc>https://example.test/news/2026-08-09-valid</loc>") {
		t.Fatalf("unexpected sitemap body:\n%s", recorder.Body.String())
	}
}
