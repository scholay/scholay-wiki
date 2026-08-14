package minicod

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestOLXBatchAndAuthorResponsesCannotFallBackToSTC(t *testing.T) {
	seen := make(map[string]int)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen[r.URL.Path]++
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/v1/olx/works/batch":
			_, _ = w.Write([]byte(`{"code":0,"data":[{"id":"W123","title":"OLX batch paper"}]}`))
		case "/v1/olx/authors/get":
			_, _ = w.Write([]byte(`{"code":0,"data":{"id":"A1","name":"Ada"}}`))
		case "/v1/olx/authors/search":
			_, _ = w.Write([]byte(`{"code":0,"data":{"total":1,"offset":0,"limit":10,"items":[{"id":"A2","name":"Grace"}]}}`))
		case "/v1/olx/authors/papers":
			_, _ = w.Write([]byte(`{"code":0,"data":{"total":1,"offset":0,"limit":10,"items":[{"id":"W2","title":"Author paper"}]}}`))
		default:
			http.Error(w, "unexpected path", http.StatusNotFound)
		}
	}))
	defer server.Close()

	client := NewClientWithBaseURL("", server.URL)
	ctx := context.Background()

	papers, err := client.GetPaperBatch(ctx, []string{"olx:W123"}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(papers) != 1 || papers[0].PaperID != "olx:W123" || papers[0].Source != SourceOLX {
		t.Fatalf("OLX batch source parity failed: %+v", papers)
	}

	author, err := client.GetAuthor(ctx, "olx:A1", nil)
	if err != nil {
		t.Fatal(err)
	}
	if author.AuthorID != "olx:A1" || author.Source != SourceOLX {
		t.Fatalf("OLX author detail source parity failed: %+v", author)
	}

	authors, err := client.SearchAuthors(ctx, AuthorSearchOptions{Query: "Ada", Source: SourceOLX, Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	if len(authors.Data) != 1 || authors.Data[0].AuthorID != "olx:A2" || authors.Data[0].Source != SourceOLX {
		t.Fatalf("OLX author search source parity failed: %+v", authors.Data)
	}

	authorPapers, err := client.GetAuthorPapers(ctx, "olx:A1", nil, 0, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(authorPapers.Data) != 1 || authorPapers.Data[0].PaperID != "olx:W2" || authorPapers.Data[0].Source != SourceOLX {
		t.Fatalf("OLX author papers source parity failed: %+v", authorPapers.Data)
	}
	if authorPapers.ActualSource != SourceOLX {
		t.Fatalf("author papers actual source=%q", authorPapers.ActualSource)
	}

	for _, path := range []string{
		"/v1/olx/works/batch",
		"/v1/olx/authors/get",
		"/v1/olx/authors/search",
		"/v1/olx/authors/papers",
	} {
		if seen[path] != 1 {
			t.Fatalf("endpoint %s called %d times", path, seen[path])
		}
	}
}
