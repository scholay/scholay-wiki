package seo

import (
	"context"
	"reflect"
	"testing"
)

type recordingPushSubmitter struct {
	paths []string
}

func (r *recordingPushSubmitter) EnqueuePaths(_ context.Context, paths []string) {
	r.paths = append(r.paths, paths...)
}

func TestSearchSeedActiveSubmissionUsesExistingEligibility(t *testing.T) {
	submitter := &recordingPushSubmitter{}
	service := &Service{submitter: submitter}
	positiveHIndex := 7

	service.enqueueIndexablePaperRows(
		// Thin tier-2 search seed: persisted for enrichment, never submitted.
		&SEOPaper{PaperID: "thin-paper", Source: SourceSTC, Title: "Title only", Status: StatusActive, QualityTier: TierSearchSeeded},
		// Substantive tier-2 search seed: sitemap/SSR eligible and submitted.
		&SEOPaper{PaperID: "pmd:42", Source: SourcePMD, Title: "With abstract", Abstract: "Verified abstract", Status: StatusActive, QualityTier: TierSearchSeeded},
		// Even substantive inactive rows stay out, exactly as sitemap/SSR require.
		&SEOPaper{PaperID: "hidden-paper", Source: SourceSTC, Title: "Hidden", Abstract: "Text", Status: StatusDead, QualityTier: TierSearchSeeded},
	)
	service.enqueueIndexableAuthorRows(
		// Name-only tier-2 search seed: persisted for enrichment, never submitted.
		&SEOAuthor{AuthorID: "thin-author", Source: SourceSTC, Name: "Name only", Status: StatusActive, QualityTier: TierSearchSeeded},
		// 2026-08-10 收紧:纯指标(仅 h-index/论文数/被引数)= 薄页,不再提交。
		&SEOAuthor{AuthorID: "metrics-only", Source: SourceSTC, Name: "Numbers", HIndex: &positiveHIndex, Status: StatusActive, QualityTier: TierSearchSeeded},
		// A verified substantive signal (representative works) makes the tier-2 author indexable.
		&SEOAuthor{AuthorID: "olx:A7", Source: SourceOLX, Name: "Ada", TopWorksJSON: `[{"title":"Analytical Engine"}]`, HIndex: &positiveHIndex, Status: StatusActive, QualityTier: TierSearchSeeded},
		// Non-canonical source must remain excluded even with substantive data.
		&SEOAuthor{AuthorID: "bad-source", Source: "evil", Name: "Mallory", TopWorksJSON: `[{"title":"W"}]`, HIndex: &positiveHIndex, Status: StatusActive, QualityTier: TierSearchSeeded},
	)

	want := []string{
		"/paper/pmd/pmd:42",
		"/author/olx/olx:A7",
	}
	if !reflect.DeepEqual(submitter.paths, want) {
		t.Fatalf("active submission paths = %v, want %v", submitter.paths, want)
	}
}
