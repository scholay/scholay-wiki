package featuretool

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
)

type recordingSubmitter struct{ paths []string }

func (r *recordingSubmitter) EnqueuePaths(_ context.Context, paths []string) {
	r.paths = append(r.paths, paths...)
}

func eligibleTool() *Tool {
	return &Tool{
		Status:        "published",
		SEOIndexable:  true,
		OfficialURL:   "https://example.org/tool",
		DescriptionMD: strings.Repeat("原创研究工具说明", 20),
		UseCases: []UseCase{
			{Title: "文献分析", Desc: "用于整理研究主题、方法和关键结论并保留出处"},
			{Title: "数据复核", Desc: "用于复查实验数据、统计步骤和可重复性说明"},
		},
		DataQuality: &DataQuality{
			Enriched: true,
			Sources:  []string{"https://example.org/docs"},
		},
	}
}

func TestSitemapPagesPropagatesRepositoryFailure(t *testing.T) {
	db, err := gorm.Open(mysql.New(mysql.Config{
		DSN:                       "tool:tool@tcp(localhost:3306)/tool?parseTime=true",
		SkipInitializeWithVersion: true,
	}), &gorm.Config{DryRun: true, DisableAutomaticPing: true})
	if err != nil {
		t.Fatalf("open dry-run database: %v", err)
	}
	wantErr := errors.New("repository unavailable")
	db.AddError(wantErr)
	svc := NewService(NewRepository(db), nil)
	pages, lastMod, gotErr := svc.SitemapPages()
	if !errors.Is(gotErr, wantErr) {
		t.Fatalf("SitemapPages() error = %v, want %v", gotErr, wantErr)
	}
	if pages != 0 || lastMod != "" {
		t.Fatalf("SitemapPages() = (%d, %q), want zero values on error", pages, lastMod)
	}
}

// TestSEOReviewViolationReasons 钉住批量审核与单件审核共用的契约谓词:
// 每种失败模式给出确定的原因串(BatchSEOReview 的 SkipSamples 靠它诊断)。
func TestSEOReviewViolationReasons(t *testing.T) {
	if got := seoReviewViolation(eligibleTool()); got != "" {
		t.Fatalf("eligible tool flagged: %q", got)
	}
	for _, tc := range []struct {
		name   string
		mutate func(*Tool)
		want   string
	}{
		{"draft status", func(x *Tool) { x.Status = "draft" }, "status != published"},
		{"numeric slug", func(x *Tool) { x.Slug = "12345" }, "numeric-only slug"},
		{"non-public url", func(x *Tool) { x.OfficialURL = "http://localhost/x" }, "official_url is not a public http(s) URL"},
		{"short description", func(x *Tool) { x.DescriptionMD = "太短" }, "description_md shorter than 120 chars"},
		{"not enriched", func(x *Tool) { x.DataQuality.Enriched = false }, "data_quality not enriched"},
		{"needs review", func(x *Tool) { x.DataQuality.NeedsReview = true }, "data_quality.needs_review is set"},
		{"needs enrich", func(x *Tool) { x.DataQuality.NeedsEnrich = []string{"logo"} }, "data_quality.needs_enrich pending"},
		{"no public source", func(x *Tool) { x.DataQuality.Sources = nil }, "no public data_quality source"},
		{"one use case", func(x *Tool) { x.UseCases = x.UseCases[:1] }, "fewer than 2 substantive use cases"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			tool := eligibleTool()
			tc.mutate(tool)
			if got := seoReviewViolation(tool); got != tc.want {
				t.Fatalf("violation = %q, want %q", got, tc.want)
			}
		})
	}
}

func TestApplySEOReviewAcceptsCompleteReviewedTool(t *testing.T) {
	tool := eligibleTool()
	adminID := uint(7)
	if err := applySEOReview(tool, false, &adminID); err != nil {
		t.Fatalf("applySEOReview() error = %v", err)
	}
	if tool.SEOReviewedAt == nil || tool.SEOReviewedBy == nil || *tool.SEOReviewedBy != adminID {
		t.Fatalf("review audit fields not populated: %#v", tool)
	}
}

func TestApplySEOReviewRejectsIncompleteTool(t *testing.T) {
	adminID := uint(7)
	tests := map[string]func(*Tool){
		"draft":                func(v *Tool) { v.Status = "draft" },
		"no official url":      func(v *Tool) { v.OfficialURL = "" },
		"invalid official url": func(v *Tool) { v.OfficialURL = "javascript:alert(1)" },
		"private official url": func(v *Tool) { v.OfficialURL = "http://127.0.0.1/tool" },
		"thin description":     func(v *Tool) { v.DescriptionMD = "too short" },
		"not enriched":         func(v *Tool) { v.DataQuality.Enriched = false },
		"needs review":         func(v *Tool) { v.DataQuality.NeedsReview = true },
		"needs enrichment":     func(v *Tool) { v.DataQuality.NeedsEnrich = []string{"verify pricing"} },
		"no source":            func(v *Tool) { v.DataQuality.Sources = nil },
		"invalid source":       func(v *Tool) { v.DataQuality.Sources = []string{"  ", "http://localhost/source"} },
		"few use cases":        func(v *Tool) { v.UseCases = v.UseCases[:1] },
		"thin use cases": func(v *Tool) {
			v.UseCases = []UseCase{{Title: "场景一", Desc: "太短"}, {Title: "场景二"}}
		},
	}
	for name, mutate := range tests {
		t.Run(name, func(t *testing.T) {
			tool := eligibleTool()
			mutate(tool)
			if err := applySEOReview(tool, false, &adminID); err != ErrSEOReview {
				t.Fatalf("applySEOReview() error = %v, want %v", err, ErrSEOReview)
			}
		})
	}
}

func TestApplySEOReviewRequiresAccountableReviewer(t *testing.T) {
	tool := eligibleTool()
	if err := applySEOReview(tool, false, nil); err != ErrSEOReview {
		t.Fatalf("applySEOReview() error = %v, want %v without reviewer", err, ErrSEOReview)
	}
}

func TestApplySEOReviewAllowsExplicitRemoval(t *testing.T) {
	tool := eligibleTool()
	tool.SEOIndexable = false
	if err := applySEOReview(tool, true, nil); err != nil {
		t.Fatalf("removing approval must not fail: %v", err)
	}
	if tool.SEOReviewedAt == nil {
		t.Fatal("removing approval must retain an audit timestamp")
	}
}

func TestApplySEOReviewPreservesLastAuditOnOrdinaryNonIndexableEdit(t *testing.T) {
	tool := eligibleTool()
	tool.SEOIndexable = false
	reviewedAt := time.Date(2026, 8, 10, 1, 2, 3, 0, time.UTC)
	reviewer := uint(9)
	tool.SEOReviewedAt = &reviewedAt
	tool.SEOReviewedBy = &reviewer
	if err := applySEOReview(tool, false, nil); err != nil {
		t.Fatalf("ordinary non-indexable edit failed: %v", err)
	}
	if tool.SEOReviewedAt != &reviewedAt || tool.SEOReviewedBy != &reviewer {
		t.Fatalf("ordinary edit erased review audit: %#v", tool)
	}
}

func TestEnqueueToolPathsUsesCanonicalEscapingAndDeduplicates(t *testing.T) {
	recorder := &recordingSubmitter{}
	svc := &Service{submitter: recorder}
	svc.enqueueToolPaths("alpha tool", "alpha tool", "", "beta")
	want := []string{"/tools/alpha%20tool", "/tools/beta"}
	if strings.Join(recorder.paths, "|") != strings.Join(want, "|") {
		t.Fatalf("submitted paths = %#v, want %#v", recorder.paths, want)
	}
}

func TestToolSitemapScopeRequiresEditorialApproval(t *testing.T) {
	db, err := gorm.Open(mysql.New(mysql.Config{
		DSN:                       "tool:tool@tcp(localhost:3306)/tool?parseTime=true",
		SkipInitializeWithVersion: true,
	}), &gorm.Config{DryRun: true, DisableAutomaticPing: true})
	if err != nil {
		t.Fatalf("open dry-run database: %v", err)
	}
	repo := NewRepository(db)
	stmt := repo.sitemapEligibleTools().
		Select("slug, updated_at").
		Order("id ASC").
		Session(&gorm.Session{DryRun: true}).
		Find(&[]SitemapRow{}).Statement
	sql := strings.Join(strings.Fields(strings.ToLower(stmt.SQL.String())), " ")
	for _, required := range []string{"status = ?", "seo_indexable = ?"} {
		if !strings.Contains(sql, required) {
			t.Fatalf("sitemap query missing %q: %s", required, sql)
		}
	}
}

func TestReservedToolSlugsCoverStaticToolRoutes(t *testing.T) {
	for _, slug := range []string{"all", "pc", "skills"} {
		if !reservedToolSlugs[slug] {
			t.Errorf("reservedToolSlugs missing %q", slug)
		}
	}
}

func TestNewNumericToolSlugFallsBackToUnambiguousName(t *testing.T) {
	db, err := gorm.Open(mysql.New(mysql.Config{
		DSN:                       "tool:tool@tcp(localhost:3306)/tool?parseTime=true",
		SkipInitializeWithVersion: true,
	}), &gorm.Config{DryRun: true, DisableAutomaticPing: true})
	if err != nil {
		t.Fatalf("open dry-run database: %v", err)
	}
	svc := NewService(NewRepository(db), nil)
	got, err := svc.ensureUniqueSlug("2012", "工具", "Research IDE", nil, 0)
	if err != nil {
		t.Fatal(err)
	}
	if got != "research-ide" {
		t.Fatalf("ensureUniqueSlug() = %q, want research-ide", got)
	}
}

func TestExistingNumericToolSlugAlsoFallsBackBeforeImportUpdate(t *testing.T) {
	db, err := gorm.Open(mysql.New(mysql.Config{
		DSN:                       "tool:tool@tcp(localhost:3306)/tool?parseTime=true",
		SkipInitializeWithVersion: true,
	}), &gorm.Config{DryRun: true, DisableAutomaticPing: true})
	if err != nil {
		t.Fatal(err)
	}
	svc := NewService(NewRepository(db), nil)
	got, err := svc.ensureUniqueSlug("2012", "屏幕录像专家", "Screen Recording Expert", nil, 2012)
	if err != nil {
		t.Fatal(err)
	}
	if got != "screen-recording-expert" {
		t.Fatalf("ensureUniqueSlug() = %q, want nonnumeric fallback", got)
	}
}

func TestNumericToolIDRejectsOverflowAliases(t *testing.T) {
	if id, ok := parseNumericToolID("18446744073709551617"); ok || id != 0 {
		t.Fatalf("overflow id parsed as (%d, %v), want rejection", id, ok)
	}
	if id, ok := parseNumericToolID("42"); !ok || id != 42 {
		t.Fatalf("valid id parsed as (%d, %v)", id, ok)
	}
}

func TestSitemapCountUsesSingleAtomicAggregate(t *testing.T) {
	db, err := gorm.Open(mysql.New(mysql.Config{
		DSN:                       "tool:tool@tcp(localhost:3306)/tool?parseTime=true",
		SkipInitializeWithVersion: true,
	}), &gorm.Config{DryRun: true, DisableAutomaticPing: true})
	if err != nil {
		t.Fatal(err)
	}
	stmt := NewRepository(db).sitemapEligibleTools().
		Select("COUNT(*) AS count, MAX(updated_at) AS last_mod").
		Session(&gorm.Session{DryRun: true}).
		Scan(&struct {
			Count   int64      `gorm:"column:count"`
			LastMod *time.Time `gorm:"column:last_mod"`
		}{}).Statement
	sql := strings.Join(strings.Fields(strings.ToLower(stmt.SQL.String())), " ")
	if !strings.Contains(sql, "count(*) as count") || !strings.Contains(sql, "max(updated_at) as last_mod") {
		t.Fatalf("aggregate query is not atomic: %s", sql)
	}
}
