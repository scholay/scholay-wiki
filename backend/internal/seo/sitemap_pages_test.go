package seo

import (
	"html"
	"strings"
	"testing"
	"time"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
)

func newSitemapDryRunDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(mysql.New(mysql.Config{
		DSN:                       "seo:seo@tcp(localhost:3306)/seo?parseTime=true",
		SkipInitializeWithVersion: true,
	}), &gorm.Config{
		DryRun:               true,
		DisableAutomaticPing: true,
	})
	if err != nil {
		t.Fatalf("open dry-run database: %v", err)
	}
	return db
}

func normalizedSQL(stmt *gorm.Statement) string {
	return strings.Join(strings.Fields(strings.ToLower(stmt.SQL.String())), " ")
}

func TestPaperLeafAndIndexShareEligibilityScope(t *testing.T) {
	repo := NewRepository(newSitemapDryRunDB(t))

	leafStmt := repo.paperSitemapRows().
		Where("sitemap_page = ?", 2).
		Session(&gorm.Session{DryRun: true}).
		Find(&[]SEOPaper{}).Statement
	indexStmt := sitemapPageLastModQuery(repo.paperSitemapRows()).
		Session(&gorm.Session{DryRun: true}).
		Find(&[]sitemapPageLastModRow{}).Statement

	leafSQL := normalizedSQL(leafStmt)
	indexSQL := normalizedSQL(indexStmt)
	for name, query := range map[string]string{"leaf": leafSQL, "index": indexSQL} {
		for _, required := range []string{
			"status = ?",
			"source in",
			"coalesce(paper_id, '')",
			"coalesce(abstract, '')",
			"quality_tier = ?",
		} {
			if !strings.Contains(query, required) {
				t.Errorf("%s query missing shared eligibility %q:\n%s", name, required, query)
			}
		}
	}
	if !strings.Contains(leafSQL, "sitemap_page = ?") {
		t.Fatalf("leaf query must select one page:\n%s", leafSQL)
	}
	if !strings.Contains(indexSQL, "sitemap_page > 0") || !strings.Contains(indexSQL, "group by `sitemap_page`") {
		t.Fatalf("index query must enumerate real non-empty page buckets:\n%s", indexSQL)
	}
	if strings.Contains(indexSQL, "count(") {
		t.Fatalf("index page enumeration must not derive pages from COUNT:\n%s", indexSQL)
	}
}

func TestAuthorAndJournalLeafIndexShareSubstantiveEligibility(t *testing.T) {
	repo := NewRepository(newSitemapDryRunDB(t))
	tests := []struct {
		name     string
		leaf     *gorm.DB
		index    *gorm.DB
		required []string
	}{
		{
			name:  "authors",
			leaf:  repo.authorSitemapRows().Where("sitemap_page = ?", 2),
			index: sitemapPageLastModQuery(repo.authorSitemapRows()),
			required: []string{
				"status = ?", "source in", "coalesce(author_id, '')",
				"quality_tier = ?", "json_length(affiliations)",
				"paper_count > 0", "citation_count > 0", "json_length(top_works)",
			},
		},
		{
			name:  "journals",
			leaf:  repo.journalSitemapRows().Where("sitemap_page = ?", 2),
			index: sitemapPageLastModQuery(repo.journalSitemapRows()),
			required: []string{
				"status = ?", "journal_id > 0", "quality_tier = ?", "publisher", "json_length(issns_json)",
				"jcr_impact_factor", "openalex_h_index",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			leafSQL := normalizedSQL(tt.leaf.Session(&gorm.Session{DryRun: true}).Find(&[]SitemapEntry{}).Statement)
			indexSQL := normalizedSQL(tt.index.Session(&gorm.Session{DryRun: true}).Find(&[]sitemapPageLastModRow{}).Statement)
			for label, query := range map[string]string{"leaf": leafSQL, "index": indexSQL} {
				for _, required := range tt.required {
					if !strings.Contains(query, required) {
						t.Errorf("%s %s query missing %q:\n%s", tt.name, label, required, query)
					}
				}
			}
		})
	}
}

func TestSSRIndexabilityMirrorsSitemapQuality(t *testing.T) {
	tierOne := TierDetailClick
	zero := 0
	positive := 8

	if paperRowIndexable(&SEOPaper{Status: StatusActive, Title: "only a title", QualityTier: TierSearchSeeded}) {
		t.Fatal("title-only search-seeded paper must be noindex")
	}
	if !paperRowIndexable(&SEOPaper{Status: StatusActive, Source: "stc", PaperID: "p1", Title: "paper", Abstract: "substantive abstract"}) {
		t.Fatal("paper with abstract must be indexable")
	}
	if paperRowIndexable(&SEOPaper{Status: StatusActive, PaperID: "p-no-source", Title: "paper", Abstract: "substantive abstract"}) {
		t.Fatal("paper without a canonical source must not enter sitemap")
	}
	if paperRowIndexable(&SEOPaper{Status: StatusActive, Source: "evil", PaperID: "p-bad-source", Title: "paper", Abstract: "substantive abstract"}) {
		t.Fatal("paper with an unrecognized source must not enter sitemap")
	}
	if !paperRowIndexable(&SEOPaper{Status: StatusActive, Source: "stc", PaperID: "p2", Title: "visited", QualityTier: tierOne}) {
		t.Fatal("detail-click paper must stay indexable")
	}
	if paperRowIndexable(&SEOPaper{Status: StatusDead, Title: "retired", Abstract: "text"}) {
		t.Fatal("retired paper must be noindex")
	}

	if authorRowIndexable(&SEOAuthor{Status: StatusActive, Name: "Name", HIndex: &zero}) {
		t.Fatal("name-only author must be noindex")
	}
	if !authorRowIndexable(&SEOAuthor{Status: StatusActive, Source: "stc", AuthorID: "a1", Name: "Name", HIndex: &positive}) {
		t.Fatal("author with h-index must be indexable")
	}
	if authorRowIndexable(&SEOAuthor{Status: StatusActive, AuthorID: "a-no-source", Name: "Name", HIndex: &positive}) {
		t.Fatal("author without a canonical source must not enter sitemap")
	}
	if !authorRowIndexable(&SEOAuthor{Status: StatusActive, Source: "stc", AuthorID: "a2", Name: "Visited", QualityTier: tierOne}) {
		t.Fatal("detail-click author must stay indexable")
	}

	if journalRowIndexable(&SEOJournal{Status: StatusActive, CanonicalName: "Name"}) {
		t.Fatal("name-only journal must be noindex")
	}
	if !journalRowIndexable(&SEOJournal{Status: StatusActive, JournalID: 1, CanonicalName: "Name", ISSNsJSON: `["1234-5678"]`}) {
		t.Fatal("journal with ISSN must be indexable")
	}
	if journalRowIndexable(&SEOJournal{Status: StatusActive, JournalID: 0, CanonicalName: "Name", ISSNsJSON: `["1234-5678"]`}) {
		t.Fatal("journal with a non-routable id must not enter sitemap")
	}
	if journalRowIndexable(&SEOJournal{Status: StatusHidden, CanonicalName: "Hidden", Publisher: "Publisher"}) {
		t.Fatal("hidden journal must be noindex")
	}
}

func TestCanonicalSourcesAreClosedAndDerivedFromEntityID(t *testing.T) {
	for _, source := range []string{SourceSTC, SourceOLX, SourcePMD} {
		if !IsCanonicalSource(source) {
			t.Fatalf("expected %q to be a canonical source", source)
		}
	}
	for _, source := range []string{"", "evil", "openalex", "STC", "../stc"} {
		if IsCanonicalSource(source) {
			t.Fatalf("unexpected canonical source %q", source)
		}
	}

	tests := []struct {
		upstream string
		id       string
		want     string
	}{
		{"", "plain-semantic-id", SourceSTC},
		{"", "olx:W123", SourceOLX},
		{"", "pmd:314159", SourcePMD},
		{"", "pubmed:314159", SourcePMD},
		{SourceOLX, "plain-upstream-id", SourceOLX},
		{"EVIL", "olx:W123", SourceOLX},
	}
	for _, tt := range tests {
		if got := AuthoritativeSource(tt.upstream, tt.id); got != tt.want {
			t.Fatalf("AuthoritativeSource(%q, %q) = %q, want %q", tt.upstream, tt.id, got, tt.want)
		}
	}
}

func TestCalcSitemapPagePreservesSparseIDBands(t *testing.T) {
	tests := []struct {
		id   uint64
		want int
	}{
		{0, 0},
		{1, 1},
		{URLsPerSitemapPage, 1},
		{URLsPerSitemapPage + 1, 2},
		{3*URLsPerSitemapPage + 1, 4},
	}
	for _, tt := range tests {
		if got := calcSitemapPage(tt.id); got != tt.want {
			t.Errorf("calcSitemapPage(%d) = %d, want %d", tt.id, got, tt.want)
		}
	}
}

func TestSitemapSummaryUsesRealNonEmptyPageSet(t *testing.T) {
	t1 := time.Date(2026, 1, 2, 0, 0, 0, 0, time.UTC)
	t2 := time.Date(2026, 2, 3, 0, 0, 0, 0, time.UTC)
	t4 := time.Date(2026, 4, 5, 0, 0, 0, 0, time.UTC)

	summary := sitemapSummaryFromPageLastMods(map[int]time.Time{1: t1, 2: t2, 4: t4})
	if summary.TotalPages != 3 {
		t.Fatalf("TotalPages = %d, want 3 real non-empty buckets", summary.TotalPages)
	}
	if !summary.LastMod.Equal(t4) {
		t.Fatalf("LastMod = %s, want %s", summary.LastMod, t4)
	}

	empty := sitemapSummaryFromPageLastMods(nil)
	if empty.TotalPages != 0 || !empty.LastMod.IsZero() {
		t.Fatalf("empty summary = %+v, want zero value", empty)
	}
}

func TestAppendEntitySitemapIndexEntriesIncludesAuthorsTwoAndSkipsMissingPage(t *testing.T) {
	lastMod := time.Date(2026, 8, 10, 0, 0, 0, 0, time.UTC)
	var b strings.Builder
	appendEntitySitemapIndexEntries(&b, "https://www.scholay.com", "authors", map[int]time.Time{
		4: lastMod,
		1: lastMod,
		2: lastMod,
	})
	got := b.String()

	for _, page := range []string{"authors-1.xml", "authors-2.xml", "authors-4.xml"} {
		if !strings.Contains(got, page) {
			t.Errorf("index missing real page %s:\n%s", page, got)
		}
	}
	if strings.Contains(got, "authors-3.xml") {
		t.Errorf("index must not invent missing page 3:\n%s", got)
	}
	if strings.Index(got, "authors-1.xml") > strings.Index(got, "authors-2.xml") ||
		strings.Index(got, "authors-2.xml") > strings.Index(got, "authors-4.xml") {
		t.Errorf("real pages must be emitted in ascending order:\n%s", got)
	}
}

func TestAppendEntitySitemapIndexEntriesOmitsEmptyKind(t *testing.T) {
	var b strings.Builder
	appendEntitySitemapIndexEntries(&b, "https://www.scholay.com", "authors", nil)
	if b.Len() != 0 {
		t.Fatalf("empty page set emitted sitemap entries: %q", b.String())
	}
}

func TestCanonicalSitemapURLsEscapeEveryDynamicPathSegment(t *testing.T) {
	entry := SitemapEntry{Source: "source/x", EntityID: "paper&one"}
	got := canonicalEntityURL("https://www.scholay.com", "/paper/", entry)
	if got != "https://www.scholay.com/paper/source%2Fx/paper&one" {
		t.Fatalf("canonicalEntityURL() = %q", got)
	}
	// XML escaping happens at the render boundary, after URL path escaping.
	if !strings.Contains(html.EscapeString(got), "paper&amp;one") {
		t.Fatalf("rendered XML URL is not escaped: %q", html.EscapeString(got))
	}

	journal := journalCanonicalURL("https://www.scholay.com", "12/3", "A&B")
	if journal != "https://www.scholay.com/journal/12%2F3/A&B" {
		t.Fatalf("journalCanonicalURL() = %q", journal)
	}
}
