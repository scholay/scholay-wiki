package prism

import (
	"strings"
	"testing"
)

// splitCiteKeys 把 [@...] 内容拆成干净 citekey:pandoc 多引用 + 历史复合键 + 普通单键。
func TestSplitCiteKeys(t *testing.T) {
	cases := []struct {
		in   string
		want string // 逗号连接,便于比较
	}{
		{"a", "a"},
		{"ayano2020; @brown2012", "ayano2020,brown2012"},
		{"a; @b; @c", "a,b,c"},
		{"a,b", "a,b"},
		{"fig:demo", "fig:demo"},
		{"", ""},
		{"@", ""},
	}
	for _, c := range cases {
		if got := strings.Join(splitCiteKeys(c.in), ","); got != c.want {
			t.Errorf("splitCiteKeys(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

// parseInlines 把 pandoc 多引用 [@a; @b] 拆成多个 InlineCite —— 保证「一个 InlineCite = 一个键」不变量。
func TestParseInlines_MultiCite(t *testing.T) {
	inls := parseInlines("见 [@ayano2020; @brown2012] 与 [@zhang2024]。")
	var cites []string
	for _, in := range inls {
		if in.T == InlineCite {
			cites = append(cites, in.Key)
		}
	}
	if got := strings.Join(cites, ","); got != "ayano2020,brown2012,zhang2024" {
		t.Fatalf("cites = %q, want ayano2020,brown2012,zhang2024", got)
	}
}

// 关键回归:历史结构体里已烘焙的复合键(旧 bug 存进来的 "a; @b")在投影时自愈成 \cite{a,b},
// 不再吐 \cite{a; @b} —— 那正是 bibtex「White space in argument」→ 编译死循环的根因。
func TestProject_HealsCompoundCiteKey(t *testing.T) {
	d := &DocStruct{
		FrontMatter: FrontMatter{Title: "T"},
		Body: []Block{{
			ID: "p1", Type: BlockParagraph,
			Inlines: []Inline{
				{T: InlineText, V: "见 "},
				{T: InlineCite, Key: "ayano2020; @brown2012"},
			},
		}},
	}
	var all strings.Builder
	for _, v := range ProjectStruct(d) {
		all.WriteString(v)
	}
	tex := all.String()
	if !strings.Contains(tex, `\cite{ayano2020,brown2012}`) {
		t.Errorf("want \\cite{ayano2020,brown2012}; cite 行: %q", firstMatch(tex, `\cite`))
	}
	if strings.Contains(tex, "; @") {
		t.Errorf("投影仍含畸形 '; @'(bibtex 会崩): %q", firstMatch(tex, "; @"))
	}
}

// 相邻文献引用序列化回 document.md 时合并成规范 pandoc 多引用 [@a; @b]。
func TestEditorMd_MergesAdjacentCites(t *testing.T) {
	got := inlinesToEditorMd([]Inline{{T: InlineCite, Key: "a"}, {T: InlineCite, Key: "b"}})
	if got != "[@a; @b]" {
		t.Fatalf("want [@a; @b], got %q", got)
	}
	// 交叉引用锚不与文献引用合并
	got2 := inlinesToEditorMd([]Inline{{T: InlineCite, Key: "fig:x"}, {T: InlineCite, Key: "a"}})
	if got2 != "[@fig:x][@a]" {
		t.Fatalf("want [@fig:x][@a], got %q", got2)
	}
}

func firstMatch(s, sub string) string {
	for _, ln := range strings.Split(s, "\n") {
		if strings.Contains(ln, sub) {
			return strings.TrimSpace(ln)
		}
	}
	return "(未找到 " + sub + ")"
}
