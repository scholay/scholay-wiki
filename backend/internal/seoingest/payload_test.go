package seoingest

import (
	"encoding/json"
	"os"
	"strings"
	"testing"

	"scholar-backend/internal/seo"
)

// testdata 是 2026-08-11 对 https://www.minicod.com/v1/jnl/list(full=1)的**真实响应**
// (完整 {data:{rows...},success} 信封)。字段名以这些样例为准 —— api-1.json 的
// spec 形状与实际不符,别按文档改这里。
func loadFixtureRows(t *testing.T, name string) *listPage {
	t.Helper()
	raw, err := os.ReadFile("testdata/" + name)
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}
	var envelope struct {
		Data json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(raw, &envelope); err != nil {
		t.Fatalf("parse fixture envelope: %v", err)
	}
	page, err := parseListPage(envelope.Data)
	if err != nil {
		t.Fatalf("parse list page: %v", err)
	}
	if len(page.Rows) == 0 {
		t.Fatal("fixture has no rows")
	}
	return page
}

func TestMapJournalRowFromRealFullPayload(t *testing.T) {
	page := loadFixtureRows(t, "jnl_full.json")
	row := mapJournalRow(&page.Rows[0])
	if row == nil {
		t.Fatal("mapJournalRow returned nil for a substantive row")
	}

	// unified 主字段
	if row.JournalID != 1 || row.CanonicalName != "Journal of Neuroscience Research" {
		t.Fatalf("identity mismatch: %d %q", row.JournalID, row.CanonicalName)
	}
	if row.ISSNL != "0360-4012" {
		t.Fatalf("issn_l = %q", row.ISSNL)
	}
	if row.Publisher != "Wiley (John Wiley & Sons)" {
		t.Fatalf("publisher = %q", row.Publisher)
	}
	if row.Country != "US" || row.Type != "journal" {
		t.Fatalf("country/type = %q/%q", row.Country, row.Type)
	}
	// jcr_impact_factor 上游是字符串 "3.4"(num 版 "3.4000" 优先)
	if row.JCRImpactFactor != 3.4 || row.JCRQuartile != "Q2" || row.JCRYear != 2024 {
		t.Fatalf("jcr = %v %q %d", row.JCRImpactFactor, row.JCRQuartile, row.JCRYear)
	}
	if row.JCRCategory != "NEUROSCIENCES(SCIE)" {
		t.Fatalf("jcr_category = %q", row.JCRCategory)
	}
	// 中科院分区 "4 [2568/5603]" 归一化为 "4";fqb_top "否" → false
	if row.FQBMajorQuartile != "4" || row.FQBMajorCategory != "医学" || row.FQBTop {
		t.Fatalf("fqb = %q %q top=%v", row.FQBMajorQuartile, row.FQBMajorCategory, row.FQBTop)
	}
	if row.FQBSubcategory != "NEUROSCIENCES 神经科学" || row.FQBSubQuartile != "4" {
		t.Fatalf("fqb sub = %q %q", row.FQBSubcategory, row.FQBSubQuartile)
	}
	// 新锐分区 "3 区" → "3";xr_top "—" → false
	if row.XRMajorQuartile != "3" || row.XRMajorCategory != "医学" || row.XRTop {
		t.Fatalf("xr = %q %q top=%v", row.XRMajorQuartile, row.XRMajorCategory, row.XRTop)
	}
	// scimago_sjr 欧式小数逗号原样存;h_index 落 scimago_h_index
	if row.SJR != "1,071" || row.SJRBestQuartile != "Q2" || row.ScimagoHIndex != 187 {
		t.Fatalf("scimago = %q %q %d", row.SJR, row.SJRBestQuartile, row.ScimagoHIndex)
	}
	if row.OpenAlexHIndex != 222 || row.WorksCount != 12895 || row.CitedByCount != 480786 || row.I10Index != 8552 {
		t.Fatalf("openalex metrics = %d %d %d %d", row.OpenAlexHIndex, row.WorksCount, row.CitedByCount, row.I10Index)
	}
	if row.TwoYrCitedness != 2.357 {
		t.Fatalf("two_yr_citedness = %v", row.TwoYrCitedness)
	}
	if row.IsOA || row.IsInDOAJ {
		t.Fatalf("oa flags should be false: is_oa=%v doaj=%v", row.IsOA, row.IsInDOAJ)
	}
	if row.Inception != "1975-01-01" {
		t.Fatalf("inception = %q", row.Inception)
	}
	// submission → latex 投稿参考
	if !row.HasLatex || row.LatexClass != "USG.cls" || row.HasGuideline {
		t.Fatalf("submission = latex=%v class=%q guideline=%v", row.HasLatex, row.LatexClass, row.HasGuideline)
	}
	// cover 用外链 original_url,不用 minicod 站内相对路径
	if !strings.HasPrefix(row.CoverURL, "https://syndetics.com/") {
		t.Fatalf("cover_url = %q", row.CoverURL)
	}
	// issn_details → issns_json
	if row.ISSNsJSON != `["0360-4012","1097-4547"]` {
		t.Fatalf("issns_json = %s", row.ISSNsJSON)
	}
	// value_tier:has_jcr=1 → tier 1
	if row.ValueTier != seo.JournalTierPartitioned {
		t.Fatalf("value_tier = %d", row.ValueTier)
	}

	// metrics_json:jcr.all_years 5 年趋势(2020-2024 升序)+ scimago 序列,≤2KB
	if row.MetricsJSON == "" || len(row.MetricsJSON) > compactJSONByteCap {
		t.Fatalf("metrics_json size = %d", len(row.MetricsJSON))
	}
	var metrics map[string][][]any
	if err := json.Unmarshal([]byte(row.MetricsJSON), &metrics); err != nil {
		t.Fatalf("metrics_json invalid: %v\n%s", err, row.MetricsJSON)
	}
	jcrSeries := metrics["jcr"]
	if len(jcrSeries) != 5 {
		t.Fatalf("jcr series years = %d, want 5", len(jcrSeries))
	}
	if year := jcrSeries[0][0].(float64); year != 2020 {
		t.Fatalf("jcr series must ascend from 2020, got %v", year)
	}
	if last := jcrSeries[len(jcrSeries)-1]; last[0].(float64) != 2024 || last[1].(float64) != 3.4 {
		t.Fatalf("jcr series tail = %v", last)
	}
	if len(metrics["sjr"]) == 0 || len(metrics["sjr"]) > trendYearCap {
		t.Fatalf("sjr series years = %d", len(metrics["sjr"]))
	}

	// extra_json:openalex topics top5 + apc + homepage,≤2KB
	if row.ExtraJSON == "" || len(row.ExtraJSON) > compactJSONByteCap {
		t.Fatalf("extra_json size = %d", len(row.ExtraJSON))
	}
	var extra map[string]any
	if err := json.Unmarshal([]byte(row.ExtraJSON), &extra); err != nil {
		t.Fatalf("extra_json invalid: %v", err)
	}
	if topics, ok := extra["topics"].([]any); !ok || len(topics) == 0 || len(topics) > topicCap {
		t.Fatalf("extra topics = %#v", extra["topics"])
	}

	// upstream built_at 来自 unified.built_at
	if row.UpstreamBuiltAt == nil || row.UpstreamBuiltAt.Year() != 2026 {
		t.Fatalf("upstream_built_at = %v", row.UpstreamBuiltAt)
	}
	if len(row.ContentHash) != 40 {
		t.Fatalf("content_hash = %q", row.ContentHash)
	}
}

// 预警 + 真实评价行(Complexity, id=42):gjqk / comments / 审稿周期折算。
func TestMapJournalRowWarningAndComments(t *testing.T) {
	page := loadFixtureRows(t, "jnl_comments_gjqk.json")
	row := mapJournalRow(&page.Rows[0])
	if row == nil {
		t.Fatal("mapJournalRow returned nil")
	}
	if row.JournalID != 42 || row.CanonicalName != "Complexity" {
		t.Fatalf("identity = %d %q", row.JournalID, row.CanonicalName)
	}
	if row.GJQKWarningLevel != "中" || row.GJQKYear != 2021 {
		t.Fatalf("gjqk = %q %d", row.GJQKWarningLevel, row.GJQKYear)
	}
	if row.CommentCount != 45 || row.CommentRating != 3.32 {
		t.Fatalf("comments = %d %v", row.CommentCount, row.CommentRating)
	}
	// avg_first_review_days "75.61" / 30.44 ≈ 2.48 月
	if row.FirstReviewMonths != 2.48 {
		t.Fatalf("first_review_months = %v", row.FirstReviewMonths)
	}
	// 发布资格:预警 + IF/分区/评论 → 远超 2 项信号
	if !seo.JournalPublishEligible(ingestRowAsJournal(row)) {
		t.Fatal("warning journal with metrics must be publish-eligible")
	}
}

// content_hash 稳定性:同一 payload 两次映射同哈希;页面可见字段变化必须变哈希。
// resync 的 updated_at 诚实性(0123)整个押在这上面。
func TestContentHashStableAndSensitive(t *testing.T) {
	page := loadFixtureRows(t, "jnl_full.json")
	a := mapJournalRow(&page.Rows[0])
	b := mapJournalRow(&page.Rows[0])
	if a.ContentHash != b.ContentHash {
		t.Fatal("same payload must produce identical content hash")
	}
	b.JCRImpactFactor = 9.9
	if recomputed := computeContentHash(b); recomputed == a.ContentHash {
		t.Fatal("visible field change must change content hash")
	}
	c := mapJournalRow(&page.Rows[0])
	c.GJQKWarningLevel = "高"
	if recomputed := computeContentHash(c); recomputed == a.ContentHash {
		t.Fatal("warning change must change content hash")
	}
}

func TestNormalizeQuartileDigitAndAffirmative(t *testing.T) {
	cases := map[string]string{
		"4 [2568/5603]": "4",
		"3 区":           "3",
		"2":             "2",
		"—":             "",
		"":              "",
		" 12 [3/4] ":    "12",
	}
	for in, want := range cases {
		if got := normalizeQuartileDigit(in); got != want {
			t.Errorf("normalizeQuartileDigit(%q) = %q, want %q", in, got, want)
		}
	}
	if !isAffirmative("是") || isAffirmative("否") || isAffirmative("—") || isAffirmative("") {
		t.Fatal("isAffirmative must only accept 是")
	}
}

func TestComputeValueTierLadder(t *testing.T) {
	cases := []struct {
		u    unifiedPayload
		want int
	}{
		{unifiedPayload{HasJCR: true}, seo.JournalTierPartitioned},
		{unifiedPayload{HasFQB: true}, seo.JournalTierPartitioned},
		{unifiedPayload{HasXR: true}, seo.JournalTierPartitioned},
		{unifiedPayload{HasScimago: true}, seo.JournalTierScimagoCCF},
		{unifiedPayload{HasCCF: true}, seo.JournalTierScimagoCCF},
		{unifiedPayload{HasDoaj: true}, seo.JournalTierOA},
		{unifiedPayload{OpenAlexIsOA: true}, seo.JournalTierOA},
		{unifiedPayload{}, seo.JournalTierOpenAlexOnly},
		// 分区族优先级最高:同时有 scimago 也判 1
		{unifiedPayload{HasJCR: true, HasScimago: true}, seo.JournalTierPartitioned},
	}
	for i, tc := range cases {
		if got := computeValueTier(&tc.u); got != tc.want {
			t.Errorf("case %d: tier = %d, want %d", i, got, tc.want)
		}
	}
}

func TestParseJournalMetaRealShape(t *testing.T) {
	// 2026-08-11 实测 /v1/jnl/meta 的 data 层
	raw := json.RawMessage(`{"totalJournals":327327,"lastBuiltAt":"2026-07-04T17:30:40.000Z","sources":[]}`)
	total, builtAt, err := parseJournalMeta(raw)
	if err != nil {
		t.Fatalf("parse meta: %v", err)
	}
	if total != 327327 || builtAt.Year() != 2026 || builtAt.Month() != 7 {
		t.Fatalf("meta = %d %v", total, builtAt)
	}
}

// mapJournalRow 对无名行返回 nil(rows_skipped 口径)。
func TestMapJournalRowSkipsNameless(t *testing.T) {
	p := journalPayload{Unified: unifiedPayload{ID: 99, CanonicalName: "   "}}
	if mapJournalRow(&p) != nil {
		t.Fatal("nameless row must map to nil")
	}
	p2 := journalPayload{Unified: unifiedPayload{ID: 0, CanonicalName: "Named"}}
	if mapJournalRow(&p2) != nil {
		t.Fatal("id-less row must map to nil")
	}
}

// ingestRowAsJournal 把摄取行装进 SEOJournal 以复用发布资格谓词(测试辅助)。
func ingestRowAsJournal(row *seo.JournalIngestRow) *seo.SEOJournal {
	h := row.OpenAlexHIndex
	return &seo.SEOJournal{
		CanonicalName:    row.CanonicalName,
		Publisher:        row.Publisher,
		ISSNL:            row.ISSNL,
		JCRImpactFactor:  row.JCRImpactFactor,
		JCRQuartile:      row.JCRQuartile,
		FQBMajorQuartile: row.FQBMajorQuartile,
		XRMajorQuartile:  row.XRMajorQuartile,
		SJRBestQuartile:  row.SJRBestQuartile,
		OpenAlexHIndex:   &h,
		ScimagoHIndex:    row.ScimagoHIndex,
		WorksCount:       row.WorksCount,
		IsInDOAJ:         row.IsInDOAJ,
		CCFRank:          row.CCFRank,
		GJQKWarningLevel: row.GJQKWarningLevel,
		CommentCount:     row.CommentCount,
	}
}
