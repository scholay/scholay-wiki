package config

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
	"time"

	appconfig "scholar-backend/internal/common/config"
	"scholar-backend/internal/seo"

	"github.com/gin-gonic/gin"
)

const ssrTestShell = `<!doctype html><html lang="zh-CN"><head>
<title data-seo-fallback="default">Scholay 首页</title>
<meta data-seo-fallback="default" name="description" content="首页描述">
<meta data-seo-fallback="default" name="keywords" content="首页关键词">
<meta data-seo-fallback="default" name="robots" content="index,follow">
<link data-seo-fallback="default" rel="canonical" href="https://www.scholay.com/">
<meta property="og:title" content="首页"><meta property="og:url" content="https://www.scholay.com/">
<meta property="og:description" content="首页描述"><meta property="og:type" content="website">
<meta name="twitter:title" content="首页"><meta name="twitter:description" content="首页描述">
</head><body><noscript><h1>重复的首页品牌标题</h1><p>通用首页正文</p></noscript>
<div id="root"></div><script type="module" src="/assets/app.js"></script></body></html>`

type stubPaperSEO struct {
	bySlug func(string) (*seo.PaperSSRMeta, error)
	byID   func(string, string) (*seo.PaperSSRMeta, error)
}

func (s stubPaperSEO) ResolveSlug(slug string) (*seo.PaperSSRMeta, error) {
	if s.bySlug == nil {
		return nil, nil
	}
	return s.bySlug(slug)
}
func (s stubPaperSEO) ResolveByPaperID(source, id string) (*seo.PaperSSRMeta, error) {
	if s.byID == nil {
		return nil, nil
	}
	return s.byID(source, id)
}

type stubAuthorSEO struct {
	bySlug func(string) (*seo.AuthorSSRMeta, error)
	byID   func(string, string) (*seo.AuthorSSRMeta, error)
}

func (s stubAuthorSEO) ResolveAuthorSlug(slug string) (*seo.AuthorSSRMeta, error) {
	if s.bySlug == nil {
		return nil, nil
	}
	return s.bySlug(slug)
}
func (s stubAuthorSEO) ResolveByAuthorID(source, id string) (*seo.AuthorSSRMeta, error) {
	if s.byID == nil {
		return nil, nil
	}
	return s.byID(source, id)
}

type stubToolSEO struct {
	resolve func(string) (*seo.ToolSSRMeta, error)
}

type stubToolSEOWithListing struct {
	stubToolSEO
	list func(int) ([]*seo.ToolSSRMeta, error)
}

func (s stubToolSEOWithListing) ListIndexableToolsForSEO(limit int) ([]*seo.ToolSSRMeta, error) {
	if s.list == nil {
		return nil, nil
	}
	return s.list(limit)
}

type stubJournalSEO struct {
	resolve func(int64) (*seo.JournalSSRMeta, error)
}

func (s stubJournalSEO) ResolveByJournalID(id int64) (*seo.JournalSSRMeta, error) {
	if s.resolve == nil {
		return nil, nil
	}
	return s.resolve(id)
}

type stubPaperEnricher struct {
	enrich func(context.Context, string, string) (*seo.PaperSSRMeta, error)
}

func (s stubPaperEnricher) EnrichPaperOnMiss(ctx context.Context, source, id string) (*seo.PaperSSRMeta, error) {
	if s.enrich == nil {
		return nil, nil
	}
	return s.enrich(ctx, source, id)
}

type stubAuthorEnricher struct {
	enrich func(context.Context, string, string) (*seo.AuthorSSRMeta, error)
}

func (s stubAuthorEnricher) EnrichAuthorOnMiss(ctx context.Context, source, id string) (*seo.AuthorSSRMeta, error) {
	if s.enrich == nil {
		return nil, nil
	}
	return s.enrich(ctx, source, id)
}

func (s stubToolSEO) ResolveToolBySlug(slug string) (*seo.ToolSSRMeta, error) {
	if s.resolve == nil {
		return nil, nil
	}
	return s.resolve(slug)
}

type stubNewsSEO struct {
	resolve func(string) (*seo.NewsSSRMeta, error)
	recent  func(int) ([]*seo.NewsSSRMeta, error)
}

func (s stubNewsSEO) ResolveNewsBySlug(slug string) (*seo.NewsSSRMeta, error) {
	if s.resolve == nil {
		return nil, nil
	}
	return s.resolve(slug)
}
func (s stubNewsSEO) RecentNewsForSEO(limit int) ([]*seo.NewsSSRMeta, error) {
	if s.recent == nil {
		return nil, nil
	}
	return s.recent(limit)
}

func newSSRRoutingTestHandler(t *testing.T) *Handler {
	t.Helper()
	frontend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(ssrTestShell))
	}))
	t.Cleanup(frontend.Close)
	h := NewHandler(nil)
	h.frontendURL = frontend.URL
	h.ssrCache = newSSRCache(time.Hour)
	return h
}

func requestSSR(t *testing.T, h *Handler, target, userAgent string) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.NoRoute(h.ServeIndexHTML)
	req := httptest.NewRequest(http.MethodGet, target, nil)
	if userAgent != "" {
		req.Header.Set("User-Agent", userAgent)
	}
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)
	return recorder
}

func TestSSRHeadReplacementPreservesLiteralDollarText(t *testing.T) {
	got := replaceSSRTitleDescCanon(
		ssrTestShell,
		"Energy cost $E$ and group $1",
		"A literal $value must remain visible",
		"https://www.scholay.com/paper/stc/id$part",
	)
	for _, want := range []string{
		"Energy cost $E$ and group $1",
		"A literal $value must remain visible",
		"id$part",
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("SSR replacement swallowed literal dollar text %q: %s", want, got)
		}
	}
}

func TestServeIndexHTMLCanonicalizesEntitySourcesAndToolCase(t *testing.T) {
	tests := []struct {
		name     string
		target   string
		location string
		setup    func(*Handler)
	}{
		{
			name:     "paper source",
			target:   "/paper/forged/p-1",
			location: "/paper/olx/p-1",
			setup: func(h *Handler) {
				h.paperSEOProvider = stubPaperSEO{byID: func(_, _ string) (*seo.PaperSSRMeta, error) {
					return &seo.PaperSSRMeta{PaperID: "p-1", Source: "olx", Title: "Paper"}, nil
				}}
			},
		},
		{
			name:     "author source",
			target:   "/author/forged/a-1",
			location: "/author/stc/a-1",
			setup: func(h *Handler) {
				h.authorSEOProvider = stubAuthorSEO{byID: func(_, _ string) (*seo.AuthorSSRMeta, error) {
					return &seo.AuthorSSRMeta{AuthorID: "a-1", Source: "stc", Name: "Ada"}, nil
				}}
			},
		},
		{
			name:     "tool case",
			target:   "/tools/Python",
			location: "/tools/python",
			setup: func(h *Handler) {
				h.toolSEOProvider = stubToolSEO{resolve: func(slug string) (*seo.ToolSSRMeta, error) {
					if slug == "python" {
						return &seo.ToolSSRMeta{Slug: "python", Name: "Python", SEOIndexable: true}, nil
					}
					return nil, nil
				}}
			},
		},
		{
			name:     "legacy numeric tool id",
			target:   "/tools/123",
			location: "/tools/canonical-tool",
			setup: func(h *Handler) {
				h.toolSEOProvider = stubToolSEO{resolve: func(slug string) (*seo.ToolSSRMeta, error) {
					if slug == "123" {
						return &seo.ToolSSRMeta{Slug: "canonical-tool", Name: "Canonical Tool", SEOIndexable: true}, nil
					}
					return nil, nil
				}}
			},
		},
		{
			name:     "news case",
			target:   "/news/Mixed-Case",
			location: "/news/mixed-case",
			setup: func(h *Handler) {
				h.newsSEOProvider = stubNewsSEO{resolve: func(string) (*seo.NewsSSRMeta, error) {
					return &seo.NewsSSRMeta{Slug: "mixed-case", Title: "Canonical news"}, nil
				}}
			},
		},
		{
			name:     "qa index",
			target:   "/qa",
			location: "/help",
			setup:    func(*Handler) {},
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			h := newSSRRoutingTestHandler(t)
			tc.setup(h)
			got := requestSSR(t, h, tc.target, "Googlebot/2.1")
			if got.Code != http.StatusMovedPermanently {
				t.Fatalf("status = %d, want 301; body=%s", got.Code, got.Body.String())
			}
			if location := got.Header().Get("Location"); location != tc.location {
				t.Fatalf("Location = %q, want %q", location, tc.location)
			}
		})
	}
}

func TestServeIndexHTMLUsesReal404And503(t *testing.T) {
	tests := []struct {
		name   string
		target string
		status int
		setup  func(*Handler)
	}{
		{"missing legacy paper", "/paper/missing", http.StatusNotFound, func(h *Handler) {
			h.paperSEOProvider = stubPaperSEO{}
		}},
		{"paper provider error", "/paper/olx/temporary", http.StatusServiceUnavailable, func(h *Handler) {
			h.paperSEOProvider = stubPaperSEO{byID: func(_, _ string) (*seo.PaperSSRMeta, error) {
				return nil, errors.New("database unavailable")
			}}
		}},
		{"missing article", "/blog/not-a-real-article", http.StatusNotFound, func(*Handler) {}},
		{"missing news", "/news/not-a-real-news-item", http.StatusNotFound, func(h *Handler) {
			h.newsSEOProvider = stubNewsSEO{}
		}},
		{"news provider error", "/news/temporary", http.StatusServiceUnavailable, func(h *Handler) {
			h.newsSEOProvider = stubNewsSEO{resolve: func(string) (*seo.NewsSSRMeta, error) {
				return nil, errors.New("database unavailable")
			}}
		}},
		{"unknown path", "/definitely-not-a-route", http.StatusNotFound, func(*Handler) {}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			h := newSSRRoutingTestHandler(t)
			tc.setup(h)
			got := requestSSR(t, h, tc.target, "Bingbot/2.0")
			if got.Code != tc.status {
				t.Fatalf("status = %d, want %d; body=%s", got.Code, tc.status, got.Body.String())
			}
			body := got.Body.String()
			if !strings.Contains(body, `content="noindex,follow"`) {
				t.Fatalf("error response lacks robots noindex: %s", body)
			}
			if got.Header().Get("X-Robots-Tag") != "noindex, nofollow" {
				t.Fatalf("X-Robots-Tag = %q", got.Header().Get("X-Robots-Tag"))
			}
			if strings.Contains(body, `rel="canonical"`) {
				t.Fatalf("error response must not self-canonicalize: %s", body)
			}
			if strings.Count(body, "<h1") != 1 || !strings.Contains(body, `data-ssr-static="true"`) {
				t.Fatalf("error response lacks one visible fallback heading: %s", body)
			}
			if tc.status == http.StatusServiceUnavailable && got.Header().Get("Retry-After") != "60" {
				t.Fatalf("503 Retry-After = %q", got.Header().Get("Retry-After"))
			}
			if strings.Contains(body, `data-seo-fallback="default"`) {
				t.Fatalf("error response retained client fallback markers: %s", body)
			}
		})
	}
}

func TestStaticSEORoutesHaveUniqueVisibleInitialHTML(t *testing.T) {
	paths := []string{
		"/features/search", "/features/library", "/features/prism", "/features/claw",
		"/features/submit", "/features/peer-review", "/journals/sci-q1",
		"/journals/cas-zone1", "/journals/ccf-a", "/journals/high-impact-factor",
	}
	h := newSSRRoutingTestHandler(t)
	titles := map[string]string{}
	bodies := map[string]string{}
	for _, path := range paths {
		got := requestSSR(t, h, path, "Mozilla/5.0")
		if got.Code != http.StatusOK {
			t.Fatalf("%s status = %d; body=%s", path, got.Code, got.Body.String())
		}
		body := got.Body.String()
		if strings.Contains(strings.ToLower(body), "<noscript") {
			t.Fatalf("%s still contains duplicate noscript", path)
		}
		if strings.Count(body, "<h1") != 1 {
			t.Fatalf("%s h1 count = %d", path, strings.Count(body, "<h1"))
		}
		if !strings.Contains(body, `<div id="root">`) || !strings.Contains(body, `data-ssr-static="true"`) {
			t.Fatalf("%s fallback is not visible inside #root: %s", path, body)
		}
		if !strings.Contains(body, `<script type="module"`) {
			t.Fatalf("%s lost the SPA entry script", path)
		}
		canonical := appconfig.CanonicalBaseURL() + path
		if strings.Count(body, `rel="canonical"`) != 1 || !strings.Contains(body, `href="`+canonical+`"`) {
			t.Fatalf("%s canonical mismatch: %s", path, body)
		}
		title := ssrTitleRe.FindString(body)
		if title == "" {
			t.Fatalf("%s title missing", path)
		}
		if old, exists := titles[title]; exists {
			t.Fatalf("%s and %s share title %q", old, path, title)
		}
		titles[title] = path
		staticStart := strings.Index(body, `<main data-ssr-static="true">`)
		staticEnd := strings.Index(body, "</main>")
		fallback := body[staticStart:staticEnd]
		if old, exists := bodies[fallback]; exists {
			t.Fatalf("%s and %s share fallback body", old, path)
		}
		bodies[fallback] = path
	}
}

func TestHomeAndToolsSkillsUseVisibleStaticFallback(t *testing.T) {
	h := newSSRRoutingTestHandler(t)
	toolCalls := 0
	h.toolSEOProvider = stubToolSEO{resolve: func(string) (*seo.ToolSSRMeta, error) {
		toolCalls++
		return nil, nil
	}}
	for _, path := range []string{"/", "/tools/skills"} {
		got := requestSSR(t, h, path, "Google-InspectionTool/1.0")
		if got.Code != http.StatusOK || strings.Count(got.Body.String(), "<h1") != 1 {
			t.Fatalf("%s did not render one visible H1: status=%d body=%s", path, got.Code, got.Body.String())
		}
	}
	if toolCalls != 0 {
		t.Fatalf("/tools/skills was resolved as a tool slug (%d calls)", toolCalls)
	}
}

func TestParameterizedSearchRoutesAreNoindexWithCleanCanonical(t *testing.T) {
	h := newSSRRoutingTestHandler(t)
	for _, target := range []string{
		"/search?q=graph&page=2",
		"/journals/search?q=nature&sort=if",
		"/tools?q=python&page=3",
		"/tools/skills?q=review&sort=recent",
	} {
		got := requestSSR(t, h, target, "Mozilla/5.0")
		if got.Code != http.StatusOK {
			t.Fatalf("%s status = %d", target, got.Code)
		}
		path := strings.SplitN(target, "?", 2)[0]
		body := got.Body.String()
		if got.Header().Get("X-Robots-Tag") != "noindex, follow" || !strings.Contains(body, `content="noindex,follow"`) {
			t.Fatalf("%s missing noindex contract: headers=%v body=%s", target, got.Header(), body)
		}
		if !strings.Contains(body, `href="`+appconfig.CanonicalBaseURL()+path+`"`) || strings.Contains(body, `rel="canonical" href="`+appconfig.CanonicalBaseURL()+path+`?`) {
			t.Fatalf("%s canonical is not the clean route: %s", target, body)
		}
	}
}

func TestCanonicalEntityCacheMissPreservesSPAWithNoindex(t *testing.T) {
	tests := []struct {
		name   string
		target string
		setup  func(*Handler)
	}{
		{"paper", "/paper/olx/not-yet-cached", func(h *Handler) {
			h.paperSEOProvider = stubPaperSEO{}
		}},
		{"author", "/author/olx/not-yet-cached", func(h *Handler) {
			h.authorSEOProvider = stubAuthorSEO{}
		}},
		{"journal id", "/journal/42", func(h *Handler) {
			h.journalSEOProvider = stubJournalSEO{}
		}},
		{"journal id and slug", "/journal/42/not-yet-cached", func(h *Handler) {
			h.journalSEOProvider = stubJournalSEO{}
		}},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			h := newSSRRoutingTestHandler(t)
			tc.setup(h)
			got := requestSSR(t, h, tc.target, "Googlebot/2.1")
			body := got.Body.String()
			if got.Code != http.StatusOK {
				t.Fatalf("status = %d, want 200; body=%s", got.Code, body)
			}
			if got.Header().Get("X-Robots-Tag") != "noindex, follow" || !strings.Contains(body, `content="noindex,follow"`) {
				t.Fatalf("cache miss lacks noindex: headers=%v body=%s", got.Header(), body)
			}
			if strings.Contains(body, `rel="canonical"`) {
				t.Fatalf("cache miss leaked the homepage canonical: %s", body)
			}
			if !strings.Contains(body, `<script type="module"`) {
				t.Fatalf("cache miss no longer preserves the SPA shell: %s", body)
			}
		})
	}
}

func TestExplicitOnMissResolverNotFoundIs404(t *testing.T) {
	tests := []struct {
		name   string
		target string
		setup  func(*Handler)
	}{
		{"paper", "/paper/olx/absent", func(h *Handler) {
			h.paperSEOProvider = stubPaperSEO{}
			h.paperEnricher = stubPaperEnricher{}
		}},
		{"author", "/author/olx/absent", func(h *Handler) {
			h.authorSEOProvider = stubAuthorSEO{}
			h.authorEnricher = stubAuthorEnricher{}
		}},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			h := newSSRRoutingTestHandler(t)
			tc.setup(h)
			got := requestSSR(t, h, tc.target, "Bingbot/2.0")
			if got.Code != http.StatusNotFound {
				t.Fatalf("status = %d, want 404; body=%s", got.Code, got.Body.String())
			}
		})
	}
}

func TestForgedEntitySourceCannotTriggerOnMissPersistence(t *testing.T) {
	tests := []struct {
		name   string
		target string
		setup  func(*Handler, *int)
	}{
		{"paper", "/paper/evil/real-paper-id", func(h *Handler, calls *int) {
			h.paperSEOProvider = stubPaperSEO{}
			h.paperEnricher = stubPaperEnricher{enrich: func(context.Context, string, string) (*seo.PaperSSRMeta, error) {
				(*calls)++
				return nil, nil
			}}
		}},
		{"author", "/author/evil/real-author-id", func(h *Handler, calls *int) {
			h.authorSEOProvider = stubAuthorSEO{}
			h.authorEnricher = stubAuthorEnricher{enrich: func(context.Context, string, string) (*seo.AuthorSSRMeta, error) {
				(*calls)++
				return nil, nil
			}}
		}},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			h := newSSRRoutingTestHandler(t)
			calls := 0
			tc.setup(h, &calls)
			got := requestSSR(t, h, tc.target, "Googlebot/2.1")
			if got.Code != http.StatusNotFound || calls != 0 {
				t.Fatalf("forged source status=%d enrichment calls=%d; body=%s", got.Code, calls, got.Body.String())
			}
			if got.Header().Get("X-Robots-Tag") != "noindex, nofollow" || strings.Contains(got.Body.String(), `rel="canonical"`) {
				t.Fatalf("forged source leaked indexable metadata: headers=%v body=%s", got.Header(), got.Body.String())
			}
		})
	}
}

func TestCachedEntityQualityStatesControlStatusAndRobots(t *testing.T) {
	tests := []struct {
		name      string
		target    string
		canonical string
		setup     func(*Handler)
	}{
		{"paper", "/paper/olx/p-1", "/paper/olx/p-1", func(h *Handler) {
			h.paperSEOProvider = stubPaperSEO{byID: func(_, _ string) (*seo.PaperSSRMeta, error) {
				return &seo.PaperSSRMeta{PaperID: "p-1", Source: "olx", Title: "Thin paper"}, nil
			}}
		}},
		{"author", "/author/olx/a-1", "/author/olx/a-1", func(h *Handler) {
			h.authorSEOProvider = stubAuthorSEO{byID: func(_, _ string) (*seo.AuthorSSRMeta, error) {
				return &seo.AuthorSSRMeta{AuthorID: "a-1", Source: "olx", Name: "Thin author"}, nil
			}}
		}},
		{"journal", "/journal/9/thin-journal", "/journal/9/thin-journal", func(h *Handler) {
			h.journalSEOProvider = stubJournalSEO{resolve: func(int64) (*seo.JournalSSRMeta, error) {
				return &seo.JournalSSRMeta{JournalID: 9, Slug: "thin-journal", CanonicalName: "Thin Journal"}, nil
			}}
		}},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			h := newSSRRoutingTestHandler(t)
			tc.setup(h)
			got := requestSSR(t, h, tc.target, "Mozilla/5.0")
			body := got.Body.String()
			if got.Code != http.StatusOK || got.Header().Get("X-Robots-Tag") != "noindex, follow" {
				t.Fatalf("thin active entity status/robots mismatch: status=%d headers=%v body=%s", got.Code, got.Header(), body)
			}
			if !strings.Contains(body, `href="`+appconfig.CanonicalBaseURL()+tc.canonical+`"`) || !strings.Contains(body, "<h1") {
				t.Fatalf("thin active entity lost canonical or visible body: %s", body)
			}
		})
	}
}

func TestInactiveEntityDoesNotRedirectBefore404(t *testing.T) {
	tests := []struct {
		name   string
		target string
		setup  func(*Handler)
	}{
		{"paper", "/paper/forged/p-1", func(h *Handler) {
			h.paperSEOProvider = stubPaperSEO{byID: func(_, _ string) (*seo.PaperSSRMeta, error) {
				return &seo.PaperSSRMeta{PaperID: "p-1", Source: "olx", Title: "Retired", SEOInactive: true}, nil
			}}
		}},
		{"author", "/author/forged/a-1", func(h *Handler) {
			h.authorSEOProvider = stubAuthorSEO{byID: func(_, _ string) (*seo.AuthorSSRMeta, error) {
				return &seo.AuthorSSRMeta{AuthorID: "a-1", Source: "olx", Name: "Retired", SEOInactive: true}, nil
			}}
		}},
		{"journal", "/journal/7/wrong", func(h *Handler) {
			h.journalSEOProvider = stubJournalSEO{resolve: func(int64) (*seo.JournalSSRMeta, error) {
				return &seo.JournalSSRMeta{JournalID: 7, Slug: "canonical", CanonicalName: "Retired", SEOInactive: true}, nil
			}}
		}},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			h := newSSRRoutingTestHandler(t)
			tc.setup(h)
			got := requestSSR(t, h, tc.target, "Googlebot/2.1")
			if got.Code != http.StatusNotFound || got.Header().Get("Location") != "" {
				t.Fatalf("inactive entity status=%d Location=%q; body=%s", got.Code, got.Header().Get("Location"), got.Body.String())
			}
		})
	}
}

func TestJournalPathShapeAndSingleResolverCall(t *testing.T) {
	calls := 0
	h := newSSRRoutingTestHandler(t)
	h.journalSEOProvider = stubJournalSEO{resolve: func(int64) (*seo.JournalSSRMeta, error) {
		calls++
		return &seo.JournalSSRMeta{
			JournalID: 3, Slug: "nature", CanonicalName: "Nature", SEOIndexable: true,
		}, nil
	}}

	got := requestSSR(t, h, "/journal/3/nature", "Mozilla/5.0")
	if got.Code != http.StatusOK || calls != 1 {
		t.Fatalf("canonical journal status=%d resolver calls=%d", got.Code, calls)
	}

	calls = 0
	got = requestSSR(t, h, "/journal/3/nature/extra", "Mozilla/5.0")
	if got.Code != http.StatusNotFound || calls != 0 {
		t.Fatalf("malformed journal status=%d resolver calls=%d; body=%s", got.Code, calls, got.Body.String())
	}
}

func TestMissingCanonicalSourceNeverLeaksHomeCanonical(t *testing.T) {
	tests := []struct {
		name   string
		target string
		setup  func(*Handler)
	}{
		{"paper", "/paper/olx/p-1", func(h *Handler) {
			h.paperSEOProvider = stubPaperSEO{byID: func(_, _ string) (*seo.PaperSSRMeta, error) {
				return &seo.PaperSSRMeta{PaperID: "p-1", Title: "Legacy paper", SEOIndexable: true}, nil
			}}
		}},
		{"author", "/author/olx/a-1", func(h *Handler) {
			h.authorSEOProvider = stubAuthorSEO{byID: func(_, _ string) (*seo.AuthorSSRMeta, error) {
				return &seo.AuthorSSRMeta{AuthorID: "a-1", Name: "Legacy author", SEOIndexable: true}, nil
			}}
		}},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			h := newSSRRoutingTestHandler(t)
			tc.setup(h)
			got := requestSSR(t, h, tc.target, "Googlebot/2.1")
			body := got.Body.String()
			if got.Code != http.StatusOK || got.Header().Get("X-Robots-Tag") != "noindex, follow" {
				t.Fatalf("status/robots mismatch: status=%d headers=%v body=%s", got.Code, got.Header(), body)
			}
			if strings.Contains(body, `rel="canonical"`) {
				t.Fatalf("entity without source leaked a canonical: %s", body)
			}
		})
	}
}

func TestToolsHubListsOnlyApprovedToolsAndFailsClosedOnProviderError(t *testing.T) {
	h := newSSRRoutingTestHandler(t)
	requestedLimit := 0
	h.toolSEOProvider = stubToolSEOWithListing{list: func(limit int) ([]*seo.ToolSSRMeta, error) {
		requestedLimit = limit
		return []*seo.ToolSSRMeta{
			{Slug: "approved", Name: "Approved & Useful", Tagline: "Research <helper>", SEOIndexable: true},
			{Slug: "pending", Name: "Pending", SEOIndexable: false},
		}, nil
	}}
	got := requestSSR(t, h, "/tools", "Bingbot/2.0")
	body := got.Body.String()
	if got.Code != http.StatusOK || requestedLimit != 100 {
		t.Fatalf("status=%d requested limit=%d; body=%s", got.Code, requestedLimit, body)
	}
	if !strings.Contains(body, `href="/tools/approved"`) || !strings.Contains(body, "Approved &amp; Useful") || strings.Contains(body, "/tools/pending") {
		t.Fatalf("approved tool hub links mismatch: %s", body)
	}

	h = newSSRRoutingTestHandler(t)
	h.toolSEOProvider = stubToolSEOWithListing{list: func(int) ([]*seo.ToolSSRMeta, error) {
		return nil, errors.New("listing unavailable")
	}}
	got = requestSSR(t, h, "/tools", "Bingbot/2.0")
	if got.Code != http.StatusServiceUnavailable || got.Header().Get("Retry-After") != "60" {
		t.Fatalf("listing error status=%d headers=%v body=%s", got.Code, got.Header(), got.Body.String())
	}
}

func TestToolDetailRendersOfficialURLUseCasesAndFAQ(t *testing.T) {
	h := newSSRRoutingTestHandler(t)
	h.toolSEOProvider = stubToolSEO{resolve: func(string) (*seo.ToolSSRMeta, error) {
		return &seo.ToolSSRMeta{
			Slug: "python", Name: "Python", SEOIndexable: true,
			OfficialURL: "https://python.org/?from=scholay&kind=research",
			UseCases:    []seo.ToolUseCaseMeta{{Title: "Data <analysis>", Desc: "Clean & model data"}},
			FAQ:         []seo.ToolQAMeta{{Question: "Can <students> use it?", Answer: "Yes & free."}},
		}, nil
	}}
	got := requestSSR(t, h, "/tools/python", "Google-InspectionTool/1.0")
	body := got.Body.String()
	if got.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", got.Code, body)
	}
	for _, want := range []string{
		`href="https://python.org/?from=scholay&amp;kind=research"`,
		"Data &lt;analysis&gt;", "Clean &amp; model data",
		"Can &lt;students&gt; use it?", "Yes &amp; free.",
		`"@type":"FAQPage"`,
		`"sameAs":"https://python.org/?from=scholay\u0026kind=research"`,
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("tool detail missing %q: %s", want, body)
		}
	}
	if safeHTTPURL("javascript:alert(1)") != "" {
		t.Fatal("unsafe official URL was accepted")
	}
}

func TestSSRHeadUsesServerFallbackMarkersWithRealIndexAttributeOrder(t *testing.T) {
	h := newSSRRoutingTestHandler(t)
	got := requestSSR(t, h, "/features/search", "Mozilla/5.0")
	body := got.Body.String()
	if got.Code != http.StatusOK || strings.Contains(body, `data-seo-fallback="default"`) {
		t.Fatalf("fallback marker was not normalized: status=%d body=%s", got.Code, body)
	}
	for name, re := range map[string]*regexp.Regexp{
		"title": ssrTitleRe, "description": ssrDescRe, "keywords": ssrKeywordsRe,
		"canonical": ssrCanonRe, "robots": ssrRobotsRe,
	} {
		tag := re.FindString(body)
		if tag == "" || !strings.Contains(tag, `data-seo-fallback="server"`) {
			t.Fatalf("%s lacks server fallback marker: %s", name, tag)
		}
	}
	if strings.Contains(body, `data-seo-fallback="server" property="og:`) {
		t.Fatalf("OG tags must not be marked as RouteSEO fallbacks: %s", body)
	}
	if _, ok := staticPageSEO["/qa"]; ok {
		t.Fatal("legacy /qa must not remain a 200 static SEO page")
	}
}

func TestToolSEOIndexableControlsRobotsWithoutChangingStatusOrCanonical(t *testing.T) {
	for _, indexable := range []bool{false, true} {
		t.Run(map[bool]string{false: "not indexable", true: "indexable"}[indexable], func(t *testing.T) {
			h := newSSRRoutingTestHandler(t)
			h.toolSEOProvider = stubToolSEO{resolve: func(string) (*seo.ToolSSRMeta, error) {
				return &seo.ToolSSRMeta{Slug: "python", Name: "Python", Tagline: "科研编程", SEOIndexable: indexable}, nil
			}}
			got := requestSSR(t, h, "/tools/python", "GoogleOther/1.0")
			if got.Code != http.StatusOK {
				t.Fatalf("status = %d; body=%s", got.Code, got.Body.String())
			}
			body := got.Body.String()
			if !strings.Contains(body, `href="`+appconfig.CanonicalBaseURL()+`/tools/python"`) {
				t.Fatalf("canonical missing: %s", body)
			}
			if indexable {
				if got.Header().Get("X-Robots-Tag") != "" || strings.Contains(body, `content="noindex,follow"`) {
					t.Fatalf("indexable tool was noindexed: headers=%v body=%s", got.Header(), body)
				}
			} else if got.Header().Get("X-Robots-Tag") != "noindex, follow" || !strings.Contains(body, `content="noindex,follow"`) {
				t.Fatalf("unreviewed tool lacks noindex: headers=%v body=%s", got.Header(), body)
			}
		})
	}
}

func TestPublicInitialHTMLDoesNotVaryByCrawlerUserAgent(t *testing.T) {
	h := newSSRRoutingTestHandler(t)
	chrome := requestSSR(t, h, "/features/search", "Mozilla/5.0 Chrome/140.0")
	for _, ua := range []string{"Googlebot/2.1", "bingbot/2.0", "Google-InspectionTool/1.0", "GoogleOther/1.0"} {
		got := requestSSR(t, h, "/features/search", ua)
		if got.Code != chrome.Code || got.Body.String() != chrome.Body.String() {
			t.Fatalf("UA %q got different initial HTML/status", ua)
		}
	}
}
