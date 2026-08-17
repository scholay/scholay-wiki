// 期刊本地回落的形状契约(2026-08-13 事故防回归)。
// 钉住三件事:① 字段名与前端 RawJournal / journalSeedFields 对齐;② degraded 标记在场;
// ③ 数据不足时返回 nil(绝不编造),以及 ISSN 输出经过归一。
package minicod

import (
	"encoding/json"
	"testing"

	"scholar-backend/internal/seo"
)

func TestJournalFallbackJSONShape(t *testing.T) {
	h := 42
	row := &seo.SEOJournal{
		JournalID:        13984,
		Slug:             "ca-a-cancer-journal-for-clinicians",
		CanonicalName:    "CA: A Cancer Journal for Clinicians",
		Publisher:        "Wiley",
		ISSNL:            "0007-9235",
		ISSNsJSON:        `["0007-9235", "0007-9235, 1542-4863"]`, // 含脏拼接,验证归一
		Country:          "US",
		Type:             "journal",
		IsOA:             true,
		JCRImpactFactor:  503.1,
		JCRQuartile:      "Q1",
		OpenAlexHIndex:   &h,
		FQBMajorQuartile: "1区",
		CCFRank:          "A",
		WorksCount:       1200,
		CitedByCount:     999999,
		GJQKWarningLevel: "低风险",
	}

	raw := journalFallbackJSON(row)
	if raw == nil {
		t.Fatal("完整行必须能产出回落响应")
	}
	var got map[string]any
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatalf("回落响应不是合法 JSON: %v", err)
	}

	// 前端 RawJournal 契约里的关键字段名
	for _, k := range []string{
		"id", "canonical_name", "crossref_publisher", "issn_l", "print_issn",
		"jcr_impact_factor", "jcr_quartile", "openalex_country", "openalex_type",
		"openalex_h_index", "fqb_major_quartile", "ccf_rank", "gjqk_warning_level",
	} {
		if _, ok := got[k]; !ok {
			t.Fatalf("回落响应缺字段 %q —— 与前端 RawJournal 契约不符,页面会渲染成空", k)
		}
	}
	if got["degraded"] != true {
		t.Fatal("回落响应必须带 degraded=true,让消费方知道这不是上游最新数据")
	}
	if got["canonical_name"] != row.CanonicalName {
		t.Fatalf("canonical_name = %v", got["canonical_name"])
	}
	// ISSN 归一:脏元素 "0007-9235, 1542-4863" 必须被拆开去重,不能原样输出
	if all, _ := got["all_issns"].(string); all != "0007-9235, 1542-4863" {
		t.Fatalf("all_issns = %q, want 拆分去重后的 \"0007-9235, 1542-4863\"", all)
	}
	if got["electronic_issn"] != "1542-4863" {
		t.Fatalf("electronic_issn = %v", got["electronic_issn"])
	}
}

func TestJournalFallbackRefusesInsufficientData(t *testing.T) {
	// 绝不编造:缺 id 或缺刊名一律返回 nil,让调用方保留上游错误。
	for _, tc := range []struct {
		name string
		row  *seo.SEOJournal
	}{
		{"nil", nil},
		{"no id", &seo.SEOJournal{CanonicalName: "X"}},
		{"no name", &seo.SEOJournal{JournalID: 1}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if journalFallbackJSON(tc.row) != nil {
				t.Fatal("数据不足时必须返回 nil")
			}
		})
	}
}

func TestJournalFallbackOmitsEmptyFields(t *testing.T) {
	// 零值字段不应出现在响应里(否则前端把 0/"" 当成真实值渲染成「影响因子 0」)。
	raw := journalFallbackJSON(&seo.SEOJournal{JournalID: 7, CanonicalName: "Minimal"})
	var got map[string]any
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatal(err)
	}
	for _, k := range []string{"jcr_impact_factor", "ccf_rank", "openalex_h_index", "works_count"} {
		if _, ok := got[k]; ok {
			t.Fatalf("零值字段 %q 不该出现在回落响应里", k)
		}
	}
}
