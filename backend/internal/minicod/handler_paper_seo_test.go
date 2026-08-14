package minicod

import (
	"testing"

	"scholar-backend/internal/seo"
)

func TestBuildVerifiedPaperSEOSeedUsesServerResponseAndCanonicalSource(t *testing.T) {
	p := &Paper{
		PaperID:       "olx:W123",
		Title:         "  Verified paper  ",
		Abstract:      "Upstream abstract",
		Year:          2026,
		Venue:         "Journal",
		CitationCount: 7,
		Source:        "evil", // invalid response metadata falls back to the normalized entity ID.
		ExternalIDs:   map[string]any{"DOI": " 10.1000/test "},
		Authors: []Author{
			{AuthorID: "olx:A1", Name: " Ada ", Source: SourceOLX},
		},
	}
	seed := buildVerifiedPaperSEOSeed(p)
	if seed == nil {
		t.Fatal("expected a verified seed")
	}
	if seed.PaperID != "olx:W123" || seed.Title != "Verified paper" || seed.Source != seo.SourceOLX {
		t.Fatalf("canonical paper seed mismatch: %+v", seed)
	}
	if seed.Year == nil || *seed.Year != 2026 || seed.DOI != "10.1000/test" {
		t.Fatalf("paper metadata mismatch: %+v", seed)
	}
	if len(seed.Authors) != 1 || seed.Authors[0].AuthorID != "olx:A1" || seed.Authors[0].Name != "Ada" {
		t.Fatalf("paper authors mismatch: %+v", seed.Authors)
	}
}

func TestBuildVerifiedSearchSEOSeedsDeduplicatesAuthors(t *testing.T) {
	papers := []Paper{
		{PaperID: "p1", Title: "One", Source: SourceSTC, Authors: []Author{{AuthorID: "a1", Name: "Ada"}}},
		{PaperID: "p2", Title: "Two", Source: SourceSTC, Authors: []Author{{AuthorID: "a1", Name: "Ada"}, {AuthorID: "", Name: "No ID"}}},
	}
	paperSeeds, authorSeeds := buildVerifiedSearchSEOSeeds(papers)
	if len(paperSeeds) != 2 || len(authorSeeds) != 1 {
		t.Fatalf("seed counts papers=%d authors=%d", len(paperSeeds), len(authorSeeds))
	}
	if authorSeeds[0].AuthorID != "a1" || authorSeeds[0].Source != seo.SourceSTC {
		t.Fatalf("author seed mismatch: %+v", authorSeeds[0])
	}
}

func TestVerifiedBatchFieldsAlwaysRequestsTitleForSEO(t *testing.T) {
	original := []string{"abstract"}
	got := verifiedBatchFields(original, true)
	if len(got) != 2 || got[0] != "abstract" || got[1] != "title" {
		t.Fatalf("verified batch fields=%v", got)
	}
	if len(original) != 1 {
		t.Fatalf("input slice mutated: %v", original)
	}
	if got := verifiedBatchFields(nil, true); got != nil {
		t.Fatalf("unfiltered request must stay nil: %v", got)
	}
	if got := verifiedBatchFields(original, false); len(got) != 1 {
		t.Fatalf("disabled SEO changed fields: %v", got)
	}
}
