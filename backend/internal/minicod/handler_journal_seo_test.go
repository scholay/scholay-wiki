package minicod

import (
	"encoding/json"
	"testing"

	"scholar-backend/internal/seo"
)

func TestInjectJournalSEOSlugPublishesBackendCanonicalInBothResponseShapes(t *testing.T) {
	slug := seo.GenerateJournalSlug("ΟΣ")
	if slug != "οσ" {
		t.Fatalf("unexpected Go canonical baseline %q", slug)
	}

	raw := injectJournalSEOSlug(json.RawMessage(`{"unified":{"id":7,"canonical_name":"ΟΣ"}}`), slug)
	var got struct {
		SEOSlug string `json:"seo_slug"`
		Unified struct {
			SEOSlug string `json:"seo_slug"`
		} `json:"unified"`
	}
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatal(err)
	}
	if got.SEOSlug != slug || got.Unified.SEOSlug != slug {
		t.Fatalf("authoritative slug missing from response: %+v", got)
	}
}

func TestInjectJournalSEOSlugLeavesMalformedPayloadUntouched(t *testing.T) {
	raw := json.RawMessage(`{not-json`)
	if got := injectJournalSEOSlug(raw, "valid"); string(got) != string(raw) {
		t.Fatalf("malformed upstream payload changed: %q", got)
	}
}

func TestBuildVerifiedJournalSearchSEOSeedsUsesOnlyValidUpstreamRows(t *testing.T) {
	raw := json.RawMessage(`{
		"rows":[
			{"unified":{"id":7,"canonical_name":"Nature","crossref_publisher":"Springer Nature","print_issn":"0028-0836","jcr_impact_factor":"50.5"}},
			{"unified":{"id":7,"canonical_name":"duplicate"}},
			{"unified":{"id":0,"canonical_name":"invalid"}},
			{"unified":{"id":8,"canonical_name":""}}
		]
	}`)
	seeds := buildVerifiedJournalSearchSEOSeeds(raw)
	if len(seeds) != 1 {
		t.Fatalf("verified journal seed count=%d: %+v", len(seeds), seeds)
	}
	seed := seeds[0]
	if seed.JournalID != 7 || seed.CanonicalName != "Nature" || seed.Publisher != "Springer Nature" || seed.JCRImpactFactor != 50.5 {
		t.Fatalf("journal seed mismatch: %+v", seed)
	}
	if len(seed.ISSNs) != 1 || seed.ISSNs[0] != "0028-0836" {
		t.Fatalf("journal ISSNs mismatch: %+v", seed.ISSNs)
	}
}
