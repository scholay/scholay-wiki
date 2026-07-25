// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// All Rights Reserved.
// ============================================================================

// W6 P0-3 字段清洗与 spam 剔除单测(fixture 形态取自 2026-07 审计真实案例:
// 6.7 万字符 spam abstract / JATS 标签残留 / 乱码符号堆标题)。

package minicod

import (
	"strings"
	"testing"
)

func TestSanitizeTextCapsOversizedAbstract(t *testing.T) {
	raw := strings.Repeat("水", 67000) // 审计案例:单条 abstract 6.7 万字符
	got := sanitizeText(raw, abstractCapRunes)
	if r := []rune(got); len(r) != abstractCapRunes+1 { // +1 = 尾部 "…"
		t.Fatalf("capped abstract rune len = %d, want %d", len(r), abstractCapRunes+1)
	}
	if !strings.HasSuffix(got, "…") {
		t.Fatalf("capped abstract should end with ellipsis marker")
	}
}

func TestSanitizeTextStripsJATSTags(t *testing.T) {
	raw := `<jats:p>Background: some <jats:italic>gene</jats:italic> study.</jats:p>`
	got := sanitizeText(raw, abstractCapRunes)
	if strings.Contains(got, "<jats") || strings.Contains(got, "</jats") {
		t.Fatalf("JATS tags not stripped: %q", got)
	}
	if !strings.Contains(got, "Background:") || !strings.Contains(got, "gene") {
		t.Fatalf("legit text lost after tag strip: %q", got)
	}
}

func TestSanitizeTextKeepsMathComparisons(t *testing.T) {
	// tagRe 只认「字母开头的标签名」——数学比较式的尖括号不得被误伤。
	raw := "significant (P < 0.05) and a < b for all n"
	if got := sanitizeText(raw, abstractCapRunes); got != raw {
		t.Fatalf("math comparison mangled: %q", got)
	}
}

func TestSanitizeTextKeepsUnspacedInequality(t *testing.T) {
	// 审计 [16]:无空格不等式 `n<m … r>` 旧正则会把 `<m the ratio r>` 整段当标签删掉、吃掉正文。
	// 属性区限定为 name=value 后不再命中(the/ratio/r 不是 name=value 对)。
	raw := "for all n<m the ratio r>1 holds"
	if got := sanitizeText(raw, abstractCapRunes); got != raw {
		t.Fatalf("unspaced inequality mangled: %q", got)
	}
}

func TestSanitizeTextStripsAttributedTag(t *testing.T) {
	// 带引号属性的真标签仍要剥掉,正文保留(name=value 形态命中)。
	raw := `See <xref ref-type="bibr" rid="B1">ref</xref> and <br/> done`
	got := sanitizeText(raw, abstractCapRunes)
	if strings.Contains(got, "<xref") || strings.Contains(got, "</xref") || strings.Contains(got, "<br") {
		t.Fatalf("attributed tag not stripped: %q", got)
	}
	if !strings.Contains(got, "ref") || !strings.Contains(got, "done") {
		t.Fatalf("legit text lost: %q", got)
	}
}

func TestSanitizeTextStripsControlAndZeroWidth(t *testing.T) {
	raw := "Deep\x00 Learning\u200b\u202e Survey\a"
	got := sanitizeText(raw, titleCapRunes)
	for _, bad := range []rune{0x0000, 0x0007, 0x200B, 0x202E} {
		if strings.ContainsRune(got, bad) {
			t.Fatalf("control/zero-width rune %U not stripped: %q", bad, got)
		}
	}
	if !strings.Contains(got, "Deep") || !strings.Contains(got, "Survey") {
		t.Fatalf("legit text lost: %q", got)
	}
}

func TestSanitizeVerbatimKeepsBibtexSyntax(t *testing.T) {
	bib := "@article{smith2024,\n  title = {A {Deep} Survey},\n  author = {Smith, J.}\n}"
	if got := sanitizeVerbatim(bib, bibtexCapRunes); got != bib {
		t.Fatalf("bibtex syntax mangled by verbatim sanitize: %q", got)
	}
}

func TestIsSpamPaper(t *testing.T) {
	cases := []struct {
		name  string
		title string
		spam  bool
	}{
		{"正常英文标题", "A Survey of Deep Learning for Natural Language Processing", false},
		{"正常中文标题", "基于深度学习的自然语言处理综述:方法、进展与挑战(2020-2025)", false},
		{"空标题", "   ", true},
		{"超长标题", strings.Repeat("x", 401), true},
		{"控制符堆", "Title\u200b\u200b\u200b\u200b\u200b\u200b legit", true},
		{"乱码符号堆", strings.Repeat("$#@!%^&*", 10), true},
	}
	for _, c := range cases {
		if got := isSpamPaper(RawPaper{Title: c.title}); got != c.spam {
			t.Errorf("%s: isSpamPaper = %v, want %v", c.name, got, c.spam)
		}
	}
}

func TestConvertPapersDropsSpamAndSanitizes(t *testing.T) {
	raws := []RawPaper{
		{ID: "a1", Title: "Valid Paper on Graph Neural Networks", Abstract: strings.Repeat("a", 60000)},
		{ID: "a2", Title: strings.Repeat("!@#$%^&*", 12)}, // spam:符号堆标题
		{ID: "a3", Title: ""},                             // spam:空标题
	}
	papers := ConvertPapers(raws)
	if len(papers) != 1 {
		t.Fatalf("ConvertPapers len = %d, want 1 (spam dropped)", len(papers))
	}
	if r := []rune(papers[0].Abstract); len(r) > abstractCapRunes+1 {
		t.Fatalf("abstract not capped: %d runes", len(r))
	}
}

func TestConvertPapersToCitationsDropsSpam(t *testing.T) {
	raws := []RawPaper{
		{ID: "c1", Title: "Cited Work"},
		{ID: "c2", Title: ""},
	}
	if cits := ConvertPapersToCitations(raws); len(cits) != 1 {
		t.Fatalf("ConvertPapersToCitations len = %d, want 1", len(cits))
	}
}

func TestConvertPaperSingleDoesNotDrop(t *testing.T) {
	// 单篇详情(get_paper / DOI 解析)不走 spam 剔除,只做字段清洗 —— 用户显式请求的条目要照常返回。
	p := ConvertPaper(RawPaper{ID: "x", Title: "<b>Bold</b> Title\u200b"})
	if p.Title != "Bold  Title" && !strings.Contains(p.Title, "Bold") {
		t.Fatalf("single convert title unexpectedly mangled: %q", p.Title)
	}
	if strings.Contains(p.Title, "<b>") || strings.ContainsRune(p.Title, 0x200B) {
		t.Fatalf("single convert title not sanitized: %q", p.Title)
	}
}
