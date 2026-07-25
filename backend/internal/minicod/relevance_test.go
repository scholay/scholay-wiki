// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// All Rights Reserved.
// ============================================================================

// W6 P1-7 零重叠沉底单测(fixture 形态取自审计案例:与查询零词重叠的条目被上游排到首位)。

package minicod

import (
	"reflect"
	"testing"
)

func TestSignificantTerms(t *testing.T) {
	got := significantTerms("The Impact of Deep Learning on NLP, and the future")
	want := []string{"impact", "deep", "learning", "nlp", "future"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("significantTerms = %v, want %v", got, want)
	}
}

func TestSinkZeroOverlapSinksUnrelatedTopHit(t *testing.T) {
	papers := []Paper{
		{PaperID: "p0", Title: "Economic Development in Brunei Darussalam", Abstract: "Oil and gas economy."}, // 零重叠,上游噪声登顶
		{PaperID: "p1", Title: "Deep Learning for Image Recognition"},
		{PaperID: "p2", Title: "A Survey of Machine Learning", Abstract: "deep neural networks"},
		{PaperID: "p3", Title: "Convolutional Networks", Abstract: "applications of deep learning"},
	}
	sinkZeroOverlap("deep learning", papers)
	gotIDs := []string{papers[0].PaperID, papers[1].PaperID, papers[2].PaperID, papers[3].PaperID}
	want := []string{"p1", "p2", "p3", "p0"} // 命中组保上游原序,零重叠条目沉底
	if !reflect.DeepEqual(gotIDs, want) {
		t.Fatalf("order after sink = %v, want %v", gotIDs, want)
	}
	if papers[3].Title != "Economic Development in Brunei Darussalam" {
		t.Fatalf("sunk paper fields must be untouched, got %q", papers[3].Title)
	}
}

func TestSinkZeroOverlapExemptCJKQuery(t *testing.T) {
	papers := []Paper{
		{PaperID: "p0", Title: "Rural Revitalization Policy in China"},
		{PaperID: "p1", Title: "Deep Learning"},
	}
	sinkZeroOverlap("贵州省乡村振兴研究", papers)
	if papers[0].PaperID != "p0" || papers[1].PaperID != "p1" {
		t.Fatalf("CJK query must be exempt (no reorder), got %s,%s", papers[0].PaperID, papers[1].PaperID)
	}
}

func TestSinkZeroOverlapExemptFewTerms(t *testing.T) {
	papers := []Paper{
		{PaperID: "p0", Title: "Unrelated Thing Entirely"},
		{PaperID: "p1", Title: "Transformer Models"},
	}
	// 有效词 <2("the" 是停用词、"of" 太短)→ 判据太弱,豁免不重排。
	sinkZeroOverlap("the of transformer", papers)
	if papers[0].PaperID != "p0" {
		t.Fatalf("query with <2 significant terms must be exempt, got %s first", papers[0].PaperID)
	}
}

func TestSinkZeroOverlapAllZeroOverlapKeepsOrder(t *testing.T) {
	papers := []Paper{
		{PaperID: "p0", Title: "Alpha"},
		{PaperID: "p1", Title: "Beta"},
	}
	sinkZeroOverlap("quantum entanglement networks", papers)
	if papers[0].PaperID != "p0" || papers[1].PaperID != "p1" {
		t.Fatalf("all-zero-overlap result set must keep upstream order")
	}
}
