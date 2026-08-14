package minicod

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestPaperSourceAndUpstreamIDRoutesEverySitemapSource(t *testing.T) {
	tests := []struct {
		id       string
		source   string
		bareID   string
		endpoint string
	}{
		{"S2-123", SourceSTC, "S2-123", "/v1/stc/papers/get"},
		{"stc:S2-123", SourceSTC, "S2-123", "/v1/stc/papers/get"},
		{"olx:W123", SourceOLX, "W123", "/v1/olx/works/get"},
		{"pmd:314159", SourcePMD, "314159", "/v1/pmd/papers/get"},
		{"pubmed:314159", SourcePMD, "314159", "/v1/pmd/papers/get"},
	}
	for _, tt := range tests {
		t.Run(tt.id, func(t *testing.T) {
			source, bareID := paperSourceAndUpstreamID(tt.id)
			if source != tt.source || bareID != tt.bareID {
				t.Fatalf("route(%q) = (%q,%q), want (%q,%q)", tt.id, source, bareID, tt.source, tt.bareID)
			}
			if endpoint := paperPath(source, "get"); endpoint != tt.endpoint {
				t.Fatalf("paperPath(%q,get)=%q, want %q", source, endpoint, tt.endpoint)
			}
		})
	}
}

func TestCanonicalPaperSourceDoesNotReflectArbitraryRequestValues(t *testing.T) {
	for source, want := range map[string]string{
		SourceSTC: SourceSTC,
		SourceOLX: SourceOLX,
		SourcePMD: SourcePMD,
		"":        SourceSTC,
		"evil":    SourceSTC,
		"OLX":     SourceSTC,
	} {
		if got := canonicalPaperSource(source); got != want {
			t.Fatalf("canonicalPaperSource(%q)=%q, want %q", source, got, want)
		}
	}
}

func TestNormalizeIDNeverInventsPrefixOnlyEntity(t *testing.T) {
	for _, source := range []string{SourceSTC, SourceOLX, SourcePMD} {
		if got := normalizeID("", source); got != "" {
			t.Fatalf("normalizeID(empty,%q)=%q", source, got)
		}
	}
	if got := normalizeID("pubmed:314159", SourcePMD); got != "pmd:314159" {
		t.Fatalf("normalizeID(pubmed alias)=%q", got)
	}
}

func TestPMDPaperAliasRoutesDetailAndRelationsToPMDEndpoints(t *testing.T) {
	type request struct {
		path string
		body map[string]any
	}
	requests := make([]request, 0, 5)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Errorf("decode request body: %v", err)
		}
		requests = append(requests, request{path: r.URL.Path, body: body})
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/v1/pmd/papers/get" {
			_, _ = w.Write([]byte(`{"code":0,"data":{"id":"pubmed:314159","title":"Verified PMD paper"}}`))
			return
		}
		_, _ = w.Write([]byte(`{"code":0,"data":{"total":0,"offset":0,"limit":20,"items":[]}}`))
	}))
	defer server.Close()

	client := NewClientWithBaseURL("", server.URL)
	ctx := context.Background()
	paper, err := client.GetPaper(ctx, "pubmed:314159", PaperDetailsOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if paper.PaperID != "pmd:314159" || paper.Source != SourcePMD {
		t.Fatalf("paper not canonicalized: %+v", paper)
	}
	if _, err := client.GetPaperCitations(ctx, "pubmed:314159", CitationsOptions{Limit: 20}); err != nil {
		t.Fatal(err)
	}
	if _, err := client.GetPaperReferences(ctx, "pmd:314159", CitationsOptions{Limit: 20}); err != nil {
		t.Fatal(err)
	}
	if _, err := client.GetPaperAuthors(ctx, "pmd:314159", nil, 0, 20); err != nil {
		t.Fatal(err)
	}

	wantPaths := []string{
		"/v1/pmd/papers/get",
		"/v1/pmd/papers/citations",
		"/v1/pmd/papers/references",
		"/v1/pmd/papers/authors",
	}
	if len(requests) != len(wantPaths) {
		t.Fatalf("request count=%d, want %d: %+v", len(requests), len(wantPaths), requests)
	}
	for i, wantPath := range wantPaths {
		if requests[i].path != wantPath {
			t.Fatalf("request %d path=%q, want %q", i, requests[i].path, wantPath)
		}
		key := "paper_id"
		if wantPath == "/v1/pmd/papers/get" {
			key = "id"
		}
		if got := requests[i].body[key]; got != "314159" {
			t.Fatalf("request %d %s=%v, want bare PMID", i, key, got)
		}
	}
}

func TestPMDBatchPropagatesUpstreamFailureInsteadOfCachingEmptySuccess(t *testing.T) {
	tests := []struct {
		name       string
		statusCode int
		body       string
	}{
		{name: "http failure", statusCode: http.StatusBadGateway, body: "temporary upstream failure"},
		{name: "null data", statusCode: http.StatusOK, body: `{"code":0,"data":null}`},
		{name: "empty object", statusCode: http.StatusOK, body: `{"code":0,"data":{}}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(tt.statusCode)
				_, _ = w.Write([]byte(tt.body))
			}))
			defer server.Close()

			client := NewClientWithBaseURL("", server.URL)
			if papers, err := client.GetPaperBatch(context.Background(), []string{"pmd:314159"}, []string{"abstract", "title"}); err == nil {
				t.Fatalf("PMD batch returned success with papers=%+v", papers)
			}
		})
	}
}
