package seo

import "strings"

// The row-level helpers mirror the repository sitemap scopes. They are used by
// SSR so a URL cannot be omitted from the sitemap as thin/retired while the
// HTML response still advertises it as indexable.
func paperRowIndexable(p *SEOPaper) bool {
	return p != nil &&
		p.Status == StatusActive &&
		IsCanonicalSource(strings.TrimSpace(p.Source)) &&
		strings.TrimSpace(p.PaperID) != "" &&
		strings.TrimSpace(p.Title) != "" &&
		(strings.TrimSpace(p.Abstract) != "" || p.QualityTier == TierDetailClick)
}

func authorRowIndexable(a *SEOAuthor) bool {
	if a == nil || a.Status != StatusActive ||
		!IsCanonicalSource(strings.TrimSpace(a.Source)) || strings.TrimSpace(a.AuthorID) == "" ||
		strings.TrimSpace(a.Name) == "" {
		return false
	}
	return a.QualityTier == TierDetailClick ||
		hasJSONArrayContent(a.AffiliationsJSON) ||
		strings.TrimSpace(a.Homepage) != "" ||
		strings.TrimSpace(a.ORCID) != "" ||
		a.PaperCount > 0 ||
		a.CitationCount > 0 ||
		(a.HIndex != nil && *a.HIndex > 0) ||
		hasJSONArrayContent(a.TopWorksJSON)
}

func journalRowIndexable(j *SEOJournal) bool {
	if j == nil || j.Status != StatusActive || j.JournalID <= 0 || strings.TrimSpace(j.CanonicalName) == "" {
		return false
	}
	return j.QualityTier == TierDetailClick ||
		strings.TrimSpace(j.Publisher) != "" ||
		hasJSONArrayContent(j.ISSNsJSON) ||
		j.JCRImpactFactor > 0 ||
		(j.OpenAlexHIndex != nil && *j.OpenAlexHIndex > 0)
}

func hasJSONArrayContent(raw string) bool {
	value := strings.TrimSpace(raw)
	return value != "" && value != "[]" && value != "null"
}
