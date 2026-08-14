// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package minicod

import (
	"encoding/json"
	"testing"
)

// 期刊行投影的行为锁(2026-08-12):
//  1. 白名单必须覆盖全部 HTTP 消费方实读的字段 —— 漏一个 = 线上功能静默变 undefined。
//     消费方清单见 journalRowProjection 的注释;这里锁死「消费方并集 ⊆ 白名单」。
//  2. 信封字段(total/page/hasMore)与行级非 unified 键必须原样保留。
//  3. 形状不符(fail-open)必须原样返回。
func TestProjectJournalRowsKeepsConsumerFields(t *testing.T) {
	// 全部 HTTP 消费方实读字段的并集(web RawJournal ∪ 移动 web feed ∪ 小程序 ∪ 审稿选择器)。
	// 新前端字段先加进 journalRowProjection 再把它补进这里。
	consumerFields := []string{
		"id", "canonical_name", "wikidata_label_zh", "issn_l", "print_issn", "electronic_issn",
		"source_count", "sources", "crossref_publisher", "openalex_country", "openalex_type", "type",
		"openalex_works_count", "openalex_cited_by_count", "openalex_h_index", "openalex_is_oa",
		"doaj_is_in_doaj", "scimago_best_quartile", "scimago_sjr", "jcr_impact_factor", "jcr_quartile",
		"fqb_major_quartile", "fqb_major_category", "fqb_top", "xr_major_quartile", "xr_top",
		"ccf_rank", "gjqk_year", "gjqk_warning_level", "has_submission", "scirev_first_review_months",
	}
	for _, f := range consumerFields {
		if _, ok := journalRowProjection[f]; !ok {
			t.Errorf("消费方在读的字段 %q 不在 journalRowProjection 白名单里(会静默变 undefined)", f)
		}
	}

	// 端到端形状:白名单字段保留、名单外裁剪、信封与行级其他键保真。
	in := json.RawMessage(`{
		"rows": [{"unified": {"id": 1, "canonical_name": "Nature", "some_internal_blob": {"x": 1}, "jcr_impact_factor": "64.8"}, "score": 0.9}],
		"total": null, "page": 1, "pageSize": 20, "hasMore": true
	}`)
	out := projectJournalRows(in)
	var envelope map[string]any
	if err := json.Unmarshal(out, &envelope); err != nil {
		t.Fatalf("投影产物不是合法 JSON: %v", err)
	}
	if _, ok := envelope["total"]; !ok {
		t.Error("信封 total 丢失(前端 total 估算逻辑依赖它,包括 null 值)")
	}
	row := envelope["rows"].([]any)[0].(map[string]any)
	if _, ok := row["score"]; !ok {
		t.Error("行级非 unified 键(score)被误删")
	}
	unified := row["unified"].(map[string]any)
	if _, ok := unified["canonical_name"]; !ok {
		t.Error("白名单字段 canonical_name 被误删")
	}
	if _, ok := unified["some_internal_blob"]; ok {
		t.Error("名单外字段 some_internal_blob 未被裁剪")
	}

	// fail-open:非预期形状原样返回。
	weird := json.RawMessage(`{"not_rows": 1}`)
	if string(projectJournalRows(weird)) != string(weird) {
		t.Error("非预期形状应原样返回(fail-open)")
	}
}
